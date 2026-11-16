import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { filterGameData } from '@/lib/5etools/filterGameData'
import { resolveItemReferences } from '@/lib/5etools/itemResolvers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { resolvePsionic } from '@/lib/5etools/psionics'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { formatSpellReference } from '@/lib/calculations/spellIdentity'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
  getSavedSpellReferences,
} from '@/lib/character/additionalContentAvailability'
import { getClassChoiceOptionKey, getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptionEntity,
  resolveClassChoiceOptions,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import { getCompanionSelectionStates } from '@/lib/character/companionSelections'
import { getMysticDisciplineState } from '@/lib/character/mysticDisciplineReplacement'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

function selectedItemEligibility(
  character: Character,
  calculation: ReturnType<typeof createCharacterCalculationContext>,
  catalogs: ClassChoiceCatalogs,
) {
  const selections = new Map(
    (character.classChoiceSelections ?? [])
      .filter(({ selected }) => selected.some(({ entityType }) => entityType === 'item'))
      .map((row) => [row.choiceId, row.selected]),
  )
  if (!selections.size) return []
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return character.classProgression.flatMap((owner) => {
    const cls = findClassReference(owner, calculation.classes)
    if (!cls) return []
    return getCharacterClassChoices(
      cls,
      getSelectedSubclassData(cls, owner),
      activity,
      catalogs,
    ).flatMap((choice) => {
      const selected = selections.get(choice.id)
      if (!selected) return []
      const eligible = new Set(
        resolveClassChoiceOptions(
          choice,
          catalogs,
          [],
          owner.levels,
          character,
          calculation.classChoices.prerequisites.knownWarlockCantrips,
        )
          .filter(isClassChoiceOptionEligible)
          .map(({ reference }) => getClassChoiceOptionKey(reference)),
      )
      return [[choice.id, selected.map((row) => eligible.has(getClassChoiceOptionKey(row)))]]
    })
  })
}

function selectedClassRules(character: Character, catalogs: ClassChoiceCatalogs) {
  const options = (character.classChoiceSelections ?? []).map((selection) => {
    const { className, classSource, subclassName, subclassSource } = selection
    const scoped = {
      ...catalogs,
      ...scopeClassChoiceFeatureCatalogs(
        catalogs,
        subclassName
          ? getFeatureOwnerKey(className, classSource, subclassName, subclassSource)
          : undefined,
      ),
    }
    return selection.selected.map((option) => resolveClassChoiceOptionEntity(option, scoped))
  })
  return {
    options,
    companions: getCompanionSelectionStates(character, catalogs.classes ?? [], catalogs).map(
      ({ creature, classicRangerLevel }) => [creature, classicRangerLevel],
    ),
  }
}

function assessCatalog(data: GameData) {
  const raw = buildGameDataLookups(data)
  let rawChoices: ClassChoiceCatalogs | undefined
  const views = new WeakMap<GameData, ReturnType<typeof buildView>>()

  function buildView(filtered: GameData) {
    return {
      ...buildGameDataLookups(filtered),
      classChoiceClasses: filtered.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(filtered),
      featExpertiseFeats: filtered.feats,
    }
  }

  return (character: Character) => {
    const { allowedSources, originSystem, variantRules } = character
    const filtered = filterGameData(data, {
      allowedSources: allowedSources && getEffectiveSources(allowedSources, originSystem),
      originSystem,
      preferNewerPrintings: variantRules?.preferNewerPrintings,
    })
    const lookups = views.get(filtered) ?? buildView(filtered)
    views.set(filtered, lookups)
    const calculation = createCharacterCalculationContext(character, lookups, raw)
    const { parentRace, subraceData } = calculation.raceResolution
    const { subraces: _subraces, ...race } = parentRace ?? {}
    const classes = character.classProgression.map((owner) => {
      const cls = findClassReference(owner, calculation.classes)
      const { subclasses: _subclasses, ...base } = cls ?? {}
      const subclass = getSelectedSubclassData(cls, owner)
      // Layer composition already used the scope marker to link the feature rules below.
      const { scopedSubclassFeatureDependencies: _dependencyScope, ...subclassRules } =
        subclass ?? {}
      return [base, subclass && subclassRules]
    })
    const classSelections = (character.classChoiceSelections ?? []).flatMap(
      ({ selected }) => selected,
    )
    const targetSpells = [
      ...(character.managedClassSpellChoices ?? []).map(({ target }) => target),
      ...classSelections.flatMap(({ invocationCantrip }) => invocationCantrip ?? []),
    ]
    const classChoiceCatalogs = {
      ...lookups.classChoiceFeatureCatalogs,
      creatures: filtered.creatures,
      feats: filtered.feats,
      weaponProficiencies: character.proficiencies.weapons,
    }
    const { blockingIssues } = getCharacterReadiness(character, {
      calculation,
      classChoiceCatalogs,
      featsByKey: raw.featsByKey,
      spellsByKey: raw.spellsByKey,
    })
    let retainedClassRules: ReturnType<typeof selectedClassRules> | undefined
    if (character.classChoiceSelections?.length) {
      rawChoices ??= {
        ...createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data)),
        feats: data.feats,
      }
      retainedClassRules = selectedClassRules({ ...character, allowedSources: [] }, rawChoices)
    }
    return {
      projected: calculation.character,
      mechanics: [
        race,
        subraceData,
        classes,
        calculation.background,
        calculation.feats,
        calculation.abilityScores.total,
        calculation.effects.declarations,
        calculation.movement,
        calculation.senses,
        calculation.classCasting,
        selectedItemEligibility(character, calculation, classChoiceCatalogs),
        [
          ...new Set([
            ...getSavedSpellReferences(character),
            ...getSavedSpellReferences(calculation.character),
            ...targetSpells.map(({ name, source }) => formatSpellReference(name, source)),
          ]),
        ].map((reference) => resolveSpellReference(reference, raw.spellsByKey)),
        retainedClassRules,
        selectedClassRules(character, classChoiceCatalogs),
        character.mysticDisciplineReplacements?.flatMap(({ from, to }) => [
          resolvePsionic(from, data.psionics),
          resolvePsionic(to, data.psionics),
        ]),
        character.mysticDisciplineReplacements?.length
          ? getMysticDisciplineState(character, classChoiceCatalogs).slots.map(
              ({ printing }) => printing,
            )
          : undefined,
        resolveItemReferences(
          [
            ...character.equipment,
            ...Object.values(character.backgroundEquipmentItemChoices ?? {}).flat(),
            ...Object.values(character.classEquipmentItemChoices ?? {}).flatMap((choices) =>
              Object.values(choices).flat(),
            ),
            ...classSelections.filter(({ entityType }) => entityType === 'item'),
          ],
          raw.itemLookup,
        ),
      ],
      issues: blockingIssues.map(({ id, title }) => JSON.stringify([id, title])),
    }
  }
}

/** Compare saved intent and active rules. Unselected additions may change the catalog. */
export function savedCharactersSurviveRebuild(prior: GameData, rebuilt: GameData, rows: unknown[]) {
  if (!rows.length) return true
  const available = createGameDataAvailabilityIndex(rebuilt)
  const assessPrior = assessCatalog(prior)
  const assessRebuilt = assessCatalog(rebuilt)
  return rows.every((row) => {
    const parsed = characterPersistenceSchema.safeParse(row)
    if (!parsed.success || characterUsesContentOutsideCatalog(parsed.data, available)) return false
    const before = assessPrior(parsed.data)
    const after = assessRebuilt(parsed.data)
    const currentKeys = new Set(Object.keys(after.projected))
    return (
      Object.keys(before.projected).length === currentKeys.size &&
      Object.entries(before.projected).every(([key, value]) => {
        if (!currentKeys.has(key)) return false
        const current = after.projected[key as keyof Character]
        return value === current || JSON.stringify(value) === JSON.stringify(current)
      }) &&
      JSON.stringify(before.mechanics) === JSON.stringify(after.mechanics) &&
      after.issues.every((issue) => before.issues.includes(issue))
    )
  })
}
