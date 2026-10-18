import { getEffectiveSpellcastingClassData, getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
  getClassFeatureTextLookupKey,
  getSubclassFeatureIdentity,
  getSubclassFeatureReferenceLevel,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { getItemPropertyLabel, getItemPropertyUid } from '@/lib/5etools/itemProperties'
import { resolveItemReferences } from '@/lib/5etools/itemResolvers'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { isStormAuraChoiceId, STORM_TARGETS } from '@/lib/5etools/stormAuraIdentity'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { formatRange } from '@/lib/calculations/spellUtils'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import {
  getClassChoiceFeatureId,
  getClassChoiceFeatureTarget,
  getFeatureOwnerKey,
} from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  resolveClassChoiceFeatureEntity,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import { deriveSpellProfileState } from '@/lib/character/spellProfileState'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { renderEntriesToText } from '@/lib/entryText'
import type {
  Class5e,
  ClassFeature,
  ClassFeatureReference,
  Feat5e,
  Item5e,
  OptionalFeatureLike,
  Race5e,
  Spell5e,
  SubclassFeatureReference,
} from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Character, Equipment, Feat, Feature } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import type { AbilityName } from './abilityScores'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'
import { getFeatureActionGroupId } from './featureActionGroups'
import { getItemTypeCodes } from './itemClassification'
import { isLevelOnlyPreparedCaster, isPreparedCaster } from './spellProfiles.casting'
import { toClassProfileId } from './spellProfiles.constants'
import { deriveStormAuraActions } from './stormAuraActions'

function isWeapon(item: Equipment): boolean {
  return (
    !!item.dmg1 ||
    !!item.weaponCategory ||
    getItemTypeCodes(item.type).some((code) => code === 'M' || code === 'R')
  )
}

function parseMasteryReference(reference: string): { name: string; source?: string } | null {
  const [namePart, sourcePart] = reference.split('|')
  const name = namePart?.trim()
  if (!name) return null
  return { name, source: sourcePart?.trim() || undefined }
}

function isSelectedItemChoice(character: Character, item: Equipment): boolean {
  return (character.classChoiceSelections ?? []).some(
    (selection) =>
      !selection.inactive &&
      selection.selected.some(
        (option) =>
          option.entityType === 'item' &&
          option.name === item.name &&
          (!option.source || !item.source || option.source === item.source),
      ),
  )
}

export interface WeaponActionProjectionContext {
  abilityModifiers: Record<AbilityName, number>
  proficiencyBonus: number
  itemLookup?: ReadonlyMap<string, Item5e>
  propertyLookup?: Readonly<Record<string, string>>
  effects?: readonly CharacterEffect[]
  effectContext?: EffectResolutionContext
}

export interface CharacterActionProjectionContext extends WeaponActionProjectionContext {
  spellsByKey?: Readonly<Record<string, Spell5e>>
  race?: Race5e
  raceResolution?: ResolvedRaceReference
  classes?: readonly Class5e[]
  availableClasses?: readonly Class5e[]
  /** Explicit available choice targets; raw text lookups never replenish this catalog. */
  classChoiceFeatureCatalogs?: ClassChoiceFeatureCatalogs
  feats?: readonly Feat5e[]
  classFeaturesByKey?: Readonly<Record<string, ClassFeature>>
  optionalFeaturesByKey?: Readonly<Record<string, unknown>>
}

/** Whether an action belongs in action/attack-oriented UI and fixed-sheet projections. */
export function isActionSizedCharacterAction(action: CharacterAction): boolean {
  return (
    action.kind === 'action' ||
    action.kind === 'attack' ||
    action.kind === 'bonus-action' ||
    action.kind === 'reaction'
  )
}

function spellActionKind(unit: string | undefined): CharacterAction['kind'] {
  if (unit === 'action') return 'action'
  if (unit === 'bonus') return 'bonus-action'
  if (unit === 'reaction') return 'reaction'
  return 'special'
}

const BONUS_ACTION_PATTERNS = [
  /\bas (?:a |an )?bonus action\b/i,
  /\b(?:can|may) (?:take|use) (?:a |one |your |this )?bonus action\b/i,
  /\buse (?:a |your )bonus action\b/i,
]

const REACTION_PATTERNS = [
  /\bas (?:a |an )?reaction\b/i,
  /\b(?:can|may) (?:take|use) (?:a |one |your |this )?reaction\b/i,
  /\buse (?:a |your )reaction\b/i,
]

const ACTION_PATTERNS = [
  /\bas (?:a |an )?(?:\w+ )?action\b/i,
  /\b(?:can|may) (?:take|use) (?:a |an |one |your |this )?(?:additional )?(?:\w+ )?action\b/i,
  /\buse (?:an |your )action\b/i,
  /\bwhen you take (?:the |an? )?(?:[\w-]+ )*action\b[^.]*\breplace (?:one|an)\b[^.]*\battack/i,
]

/** Classifies only rules text that explicitly grants an action-sized choice. */
export function inferRulesTextActionKind(
  description: string,
): Extract<CharacterAction['kind'], 'action' | 'bonus-action' | 'reaction'> | null {
  const normalized = description.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (BONUS_ACTION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'bonus-action'
  if (REACTION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'reaction'
  if (ACTION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'action'
  return null
}

/** Projects known spells from structured casting-time/range fields and preserves their rules text. */
export function deriveSpellActions(
  character: Character,
  spellsByKey: Readonly<Record<string, Spell5e>>,
  options: Pick<CharacterActionProjectionContext, 'classes' | 'race' | 'raceResolution'> = {},
): CharacterAction[] {
  const classesById = new Map<string, Class5e>()
  for (const classData of options.classes ?? []) {
    classesById.set(toClassProfileId(classData.name, classData.source), classData)
  }
  const profiles = deriveSpellProfileState(
    character,
    classesById,
    options.race,
    options.raceResolution,
    { spellsByKey },
  ).spells.spellProfiles

  const preparationRequiredByProfile = new Map<string, boolean>()
  for (const entry of getCharacterClassEntries(character)) {
    const classData = findClassReference(entry, classesById.values())
    const subclassData = getSelectedSubclassData(classData, entry)
    const effectiveClassData = getEffectiveSpellcastingClassData(classData, subclassData)
    if (!effectiveClassData?.spellcastingAbility) continue
    preparationRequiredByProfile.set(
      toClassProfileId(entry.name, entry.source),
      isPreparedCaster(effectiveClassData) && !isLevelOnlyPreparedCaster(effectiveClassData),
    )
  }

  const spellStates = new Map<string, { reference: string; active: boolean }>()
  const spellKey = (reference: string) => {
    const spell = resolveSpellReference(reference, spellsByKey)
    return spell ? getSpellReferenceKey(spell.name, spell.source) : getSpellReferenceKey(reference)
  }
  const addSpell = (reference: string, active: boolean) => {
    if (!getSpellNameKey(reference)) return
    const key = spellKey(reference)
    const existing = spellStates.get(key)
    if (existing) existing.active ||= active
    else spellStates.set(key, { reference, active })
  }
  for (const profile of profiles) {
    const preparedKeys = new Set(
      [...profile.preparedSpells, ...(profile.alwaysPreparedSpells ?? [])].map(spellKey),
    )
    const requiresPreparation = preparationRequiredByProfile.get(profile.id) ?? true
    for (const reference of profile.cantrips) addSpell(reference, true)
    for (const reference of profile.spellsKnown) {
      addSpell(
        reference,
        !!profile.alwaysPrepared || !requiresPreparation || preparedKeys.has(spellKey(reference)),
      )
    }
  }

  return [...spellStates.values()].flatMap(({ reference, active }) => {
    const spell = resolveSpellReference(reference, spellsByKey)
    if (!spell) return []
    return [
      {
        id: `spell:${encodeURIComponent(`${spell.name}|${spell.source}`)}`,
        name: spell.name,
        kind: spellActionKind(spell.time[0]?.unit),
        description: renderEntriesToText([
          ...(spell.entries ?? []),
          ...(spell.entriesHigherLevel ?? []),
        ]),
        source: { kind: 'spell', name: spell.name, source: spell.source },
        active,
        inactiveReason: active ? undefined : 'Not prepared',
        range: formatRange(spell.range),
      } satisfies CharacterAction,
    ]
  })
}

type RulesTextActionContext = Pick<
  CharacterActionProjectionContext,
  | 'classes'
  | 'availableClasses'
  | 'classChoiceFeatureCatalogs'
  | 'feats'
  | 'classFeaturesByKey'
  | 'optionalFeaturesByKey'
>

function rulesTextAction(
  id: string,
  name: string,
  description: string,
  source: CharacterAction['source'],
): CharacterAction[] {
  const kind = inferRulesTextActionKind(description)
  if (!kind) return []
  return [{ id, name, kind, description, source, active: true }]
}

function resolveStoredFeatureDescription(
  feature: Feature,
  context: RulesTextActionContext,
  classFeatures: ReadonlyMap<string, ClassFeature | null>,
): string {
  const key = getEntityLookupKey(feature.name, feature.source)
  const classFeature = classFeatures.get(key.toLowerCase())
  const parsed =
    classFeature === undefined
      ? (context.optionalFeaturesByKey?.[key] as OptionalFeatureLike | undefined)
      : classFeature
  const parsedDescription = renderEntriesToText(parsed?.entries)
  return parsedDescription || feature.description
}

function deriveStoredFeatureActions(
  character: Character,
  context: RulesTextActionContext,
): CharacterAction[] {
  const classFeatures = new Map<string, ClassFeature | null>()
  const identities = new Set<string>()
  for (const feature of Object.values(context.classFeaturesByKey ?? {})) {
    const identity = getClassFeatureIdentity(feature)
    if (identity) {
      if (identities.has(identity)) continue
      identities.add(identity)
    }
    const key =
      getClassFeatureTextLookupKey(feature) ??
      getEntityLookupKey(feature.name, feature.source).toLowerCase()
    if (!classFeatures.has(key)) classFeatures.set(key, feature)
    else if (classFeatures.get(key) !== feature) classFeatures.set(key, null)
  }
  return character.features
    .filter((feature) => !feature.id.startsWith('class-choice:'))
    .flatMap((feature) =>
      rulesTextAction(
        `feature:${feature.id}`,
        feature.name,
        resolveStoredFeatureDescription(feature, context, classFeatures),
        { kind: 'other', name: feature.name, source: feature.source, entityId: feature.id },
      ),
    )
}

function deriveFeatActions(
  character: Character,
  context: RulesTextActionContext,
): CharacterAction[] {
  const resolvedByKey = new Map(
    (context.feats ?? []).map((feat) => [getEntityLookupKey(feat.name, feat.source), feat]),
  )
  const selected: Feat[] = [
    ...character.feats,
    ...(character.specialFeats ?? []),
    ...(character.classFeatChoices ?? []).flatMap((choice) => choice.feats),
  ]
  const seen = new Set<string>()
  return selected.flatMap((feat) => {
    const key = getEntityLookupKey(feat.name, feat.source)
    if (seen.has(key)) return []
    seen.add(key)
    const parsedDescription = renderEntriesToText(resolvedByKey.get(key)?.entries)
    return rulesTextAction(`feat:${feat.id}`, feat.name, parsedDescription || feat.description, {
      kind: 'feat',
      name: feat.name,
      source: feat.source,
      entityId: feat.id,
    })
  })
}

function deriveClassFeatureActions(
  character: Character,
  context: RulesTextActionContext,
): CharacterAction[] {
  const actions = new Map<string, CharacterAction>()
  const addAction = (
    owner: string,
    target: string,
    feature: ClassFeature,
    source: CharacterAction['source'],
  ) => {
    const description = renderEntriesToText(feature.entries)
    const kind = inferRulesTextActionKind(description)
    if (!kind) return
    const id = getFeatureActionGroupId(owner, target, feature.entries ?? [])
    if (!actions.has(id))
      actions.set(id, { id, name: feature.name, kind, description, source, active: true })
  }
  function collect(
    reference: ClassFeatureReference | SubclassFeatureReference,
    kind: 'class' | 'subclass',
    owner: string,
    currentLevel: number,
  ) {
    const feature = reference.feature
    const subclass = kind === 'subclass'
    const level = subclass
      ? getSubclassFeatureReferenceLevel(reference)
      : getClassFeatureReferenceLevel(reference)
    if (!feature || level === undefined || level > currentLevel) return
    const decoded = reference.ref?.trim()
      ? subclass
        ? decodeSubclassFeatureReference(reference.ref)
        : decodeClassFeatureReference(reference.ref)
      : {
          ...feature,
          ...Object.fromEntries(
            Object.entries(reference).filter(([, value]) => value !== undefined && value !== null),
          ),
          level,
          source: reference.source ?? feature.source,
        }
    const identity = subclass
      ? getSubclassFeatureIdentity(decoded)
      : getClassFeatureIdentity(decoded)
    if (!identity || STORM_TARGETS.has(identity)) return
    const inheritedSource = subclass
      ? 'subclassSource' in decoded
        ? decoded.subclassSource
        : undefined
      : decoded.classSource
    const source = decoded.source?.trim() || inheritedSource?.trim() || 'PHB'
    addAction(owner, identity, feature, {
      kind,
      name: feature.name,
      source,
    })
  }
  for (const entry of getCharacterClassEntries(character)) {
    const classData = findClassReference(entry, context.classes)
    if (!classData) continue
    const owner = getFeatureOwnerKey(classData.name, classData.source)
    for (const reference of classData.classFeatureRefs ?? []) {
      collect(reference, 'class', owner, entry.levels)
    }

    const subclass = getSelectedSubclassData(classData, entry)
    for (const reference of subclass?.subclassFeatureRefs ?? []) {
      collect(
        reference,
        'subclass',
        getFeatureOwnerKey(classData.name, classData.source, subclass?.name, subclass?.source),
        entry.levels,
      )
    }
  }
  for (const selection of character.classChoiceSelections ?? []) {
    if (selection.inactive || isStormAuraChoiceId(selection.choiceId)) continue
    const entry = getCharacterClassEntries(character).find(
      (candidate) =>
        getFeatureOwnerKey(
          candidate.name,
          candidate.source,
          selection.subclassName ? candidate.subclass : undefined,
          selection.subclassName ? candidate.subclassSource : undefined,
        ) ===
        getFeatureOwnerKey(
          selection.className,
          selection.classSource,
          selection.subclassName,
          selection.subclassSource,
        ),
    )
    if (!entry || entry.levels < selection.classLevel) continue
    const owner = getFeatureOwnerKey(
      selection.className,
      selection.classSource,
      selection.subclassName,
      selection.subclassSource,
    )
    for (const option of selection.selected) {
      if (option.slotLevel > entry.levels) continue
      if (option.entityType === 'classFeature' || option.entityType === 'subclassFeature') {
        const target = getClassChoiceFeatureTarget(option)
        const feature = context.classChoiceFeatureCatalogs
          ? resolveClassChoiceFeatureEntity(
              option,
              scopeClassChoiceFeatureCatalogs(
                context.classChoiceFeatureCatalogs,
                selection.subclassName ? owner : undefined,
              ),
            )
          : undefined
        if (target && feature)
          addAction(owner, target, feature, {
            kind: selection.subclassName ? 'subclass' : 'class',
            name: feature.name,
            source: option.source?.trim() || target.split('|').slice(-1)[0],
          })
      } else if (option.entityType === 'optionalFeature') {
        const feature = context.optionalFeaturesByKey?.[
          getEntityLookupKey(option.name, option.source)
        ] as OptionalFeatureLike | undefined
        const [action] = rulesTextAction(
          `feature:${getClassChoiceFeatureId(selection, option)}`,
          option.name,
          renderEntriesToText(feature?.entries),
          {
            kind: selection.subclassName ? 'subclass' : 'class',
            name: option.name,
            source: option.source,
          },
        )
        if (action) actions.set(action.id, action)
      }
    }
  }
  for (const action of deriveStormAuraActions(
    character,
    context.availableClasses ?? context.classes ?? [],
    context.classChoiceFeatureCatalogs,
  ))
    actions.set(action.id, action)
  return [...actions.values()]
}

/** Projects feature, feat, and species rules only when their text explicitly grants an action. */
export function deriveRulesTextActions(
  character: Character,
  race: Race5e | undefined,
  context: RulesTextActionContext = {},
): CharacterAction[] {
  const featureActions = deriveStoredFeatureActions(character, context)
  const classFeatureActions = deriveClassFeatureActions(character, context)
  const featActions = deriveFeatActions(character, context)
  const raceActions = (race?.presentationEntries ?? race?.entries ?? []).flatMap(
    (entry, index): CharacterAction[] => {
      if (!entry || typeof entry !== 'object') return []
      const block = entry as { type?: string; name?: string; entries?: unknown[] }
      if (block.type !== 'entries' || !block.name?.trim()) return []
      const description = renderEntriesToText(block.entries)
      const kind = inferRulesTextActionKind(description)
      if (!kind) return []
      return [
        {
          id: `race:${encodeURIComponent(`${race?.name}|${race?.source}`)}:${index}`,
          name: block.name,
          kind,
          description,
          source: { kind: 'race', name: race?.name ?? '', source: race?.source },
          active: true,
        },
      ]
    },
  )
  return [...featureActions, ...classFeatureActions, ...featActions, ...raceActions]
}

/** Merges runtime projections with persisted manual actions by stable ID. */
function mergeCharacterActions(
  sourceActions: readonly CharacterAction[],
  manualActions: readonly CharacterAction[] = [],
): CharacterAction[] {
  const byId = new Map<string, CharacterAction>()
  for (const action of [...sourceActions, ...manualActions]) byId.set(action.id, action)
  return [...byId.values()]
}

/** Projects every source-backed and manual action through one view-neutral pipeline. */
export function deriveCharacterActions(
  character: Character,
  context: CharacterActionProjectionContext,
): CharacterAction[] {
  return mergeCharacterActions(
    [
      ...deriveWeaponActions(character, context),
      ...deriveSpellActions(character, context.spellsByKey ?? {}, context),
      ...deriveRulesTextActions(character, context.race, context),
    ],
    character.manualActions,
  )
}

/** Derives weapon attacks from structured equipment and effect data without UI/PDF assumptions. */
export function deriveWeaponActions(
  character: Character,
  context: WeaponActionProjectionContext,
): CharacterAction[] {
  const effects = context.effects ?? []
  const effectContext = context.effectContext ?? {}
  const weapons = character.equipment
    .filter(isWeapon)
    .sort(
      (left, right) =>
        Number(right.equipped) - Number(left.equipped) || left.id.localeCompare(right.id),
    )
  const itemRules = resolveItemReferences(weapons, context.itemLookup)
  return weapons.map((item, index) => {
    const properties = item.properties ?? []
    const propertyKeys = properties.map((property) =>
      getItemPropertyUid(property).split('|')[0].toUpperCase(),
    )
    const ability: AbilityName = propertyKeys.includes('F')
      ? context.abilityModifiers.dexterity > context.abilityModifiers.strength
        ? 'dexterity'
        : 'strength'
      : getItemTypeCodes(item.type).includes('R')
        ? 'dexterity'
        : 'strength'
    const proficient = isProficientWithWeapon(character.proficiencies.weapons, item)
    const baseAttackBonus =
      context.abilityModifiers[ability] + (proficient ? context.proficiencyBonus : 0)
    const attackBonus = Math.trunc(
      resolveNumericEffect(
        baseAttackBonus,
        { kind: 'attack-roll', attackId: item.id },
        effects,
        effectContext,
      ).value,
    )
    const damageBonus = Math.trunc(
      resolveNumericEffect(
        context.abilityModifiers[ability],
        { kind: 'damage', attackId: item.id, damageType: item.dmgType },
        effects,
        effectContext,
      ).value,
    )
    const itemData = itemRules[index]
    const mastery = isSelectedItemChoice(character, item)
      ? (itemData?.mastery ?? []).flatMap((reference) => {
          const parsed = parseMasteryReference(reference)
          return parsed ? [parsed] : []
        })
      : []
    const propertyLabels = [
      ...new Set(
        properties.map((property) => {
          if (getItemPropertyUid(property).split('|')[0].toUpperCase() === 'V' && item.dmg2) {
            return `Versatile ${item.dmg2}`
          }
          return getItemPropertyLabel(property, context.propertyLookup ?? {})
        }),
      ),
    ]
    if (item.dmg2 && !propertyKeys.includes('V')) propertyLabels.push(`Versatile ${item.dmg2}`)

    return {
      id: `weapon:${item.id}`,
      name: item.name,
      kind: 'attack',
      description: item.description?.trim() ?? '',
      source: { kind: 'item', name: item.name, source: item.source, entityId: item.id },
      active: item.equipped,
      inactiveReason: item.equipped ? undefined : 'Not equipped',
      ability,
      proficient,
      attackBonus,
      range: item.range,
      damage: [{ dice: item.dmg1, bonus: damageBonus, damageType: item.dmgType }],
      properties: propertyLabels,
      mastery,
    } satisfies CharacterAction
  })
}
