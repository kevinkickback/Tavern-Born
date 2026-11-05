import {
  type AdditionalSpellChoiceDescriptor,
  parseAdditionalSpellBlocks,
} from '@/lib/5etools/additionalSpells'
import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { getClassCastingLevelAccess } from '@/lib/5etools/classCastingSource'
import {
  getClassFeatureSpellSemantics,
  hasCurrentFeatureSpellSemantics,
} from '@/lib/5etools/featureSpellSemantics'
import { decodeSelectedFeatureSpellAddress } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { matchesJoinedSpellClassFilter } from '@/lib/5etools/spellFilterSources'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { type ManagedClassSpellContext, permitted, sources } from './classSpellAuthority'
import { getCurrentDivineOrder } from './divineOrder'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from './effectiveClassChoiceFeatures'
import { getOptionalClassPoolSelectionSection } from './optionalClassAdoptionRules'
import {
  getSelectedFeatureSpellProducer,
  hasSavedSelectedFeatureSpellOwner,
  selectedFeatureSpellOwner,
} from './selectedFeatureSpellOwnership'

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

// The audited prose-only branch supplies the same descriptor as native additionalSpells.
const thaumaturgeSpells: AdditionalSpellBlock[] = [
  { ability: 'wis', known: { _: [{ choose: 'level=0|class=Cleric' }] } },
]

export interface SelectedFeatureCantripSetup {
  owner: ClassSpellOwner
  producer: string
  level: number
  name: string
  count: number
  choice?: AdditionalSpellChoiceDescriptor
  offered: boolean
  reason?: string
}

/** Discover selected producers; supported syntax does not invent missing attribution/conditions. */
export function getSelectedFeatureCantripSetups(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
): SelectedFeatureCantripSetup[] {
  const active = getEffectiveClassChoiceFeatureRoutes(
    character,
    catalogs,
    prerequisites,
  ).selectedOptions
  const allowed = sources(character)
  return (character.classChoiceSelections ?? []).flatMap((selection) =>
    selection.selected.flatMap((option) => {
      const producer = getSelectedFeatureSpellProducer(selection, option)
      if (!producer) return []
      const isDivineOrder = option.entityType === 'classFeature'
      const rows =
        option.entityType === 'feat' ? catalogs?.featExpertiseFeats : catalogs?.optionalFeatures
      const candidates = (rows ?? []).filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
      const feature = candidates.length === 1 ? candidates[0] : undefined
      const semantics = getClassFeatureSpellSemantics(
        option.entityType,
        option.name,
        option.source ?? '',
      )
      // Ordinary Class feats retain the existing feat actor; only missing class-attribution semantics
      // route a feat through this Class-profile adapter.
      if (option.entityType === 'feat' && !semantics) return []
      if (!isDivineOrder && !semantics && !(feature && 'additionalSpells' in feature)) return []
      const owner = selectedFeatureSpellOwner(selection)
      const setup: SelectedFeatureCantripSetup = {
        owner,
        producer,
        level: option.slotLevel,
        name: option.name,
        count: 0,
        offered: isDivineOrder || (!!semantics && semantics.className === owner[1]),
      }
      const deny = (reason: string) => [{ ...setup, reason }]
      if (isDivineOrder && getCurrentDivineOrder(character, catalogs)?.selection !== selection)
        return deny('Restore the exact Divine Order and Thaumaturge sources to choose a cantrip.')
      if (!isDivineOrder && !feature)
        return deny(
          'Restore the exact granting feature source; duplicate definitions cannot grant spells.',
        )
      let blocks: ReturnType<typeof parseAdditionalSpellBlocks>
      try {
        blocks = parseAdditionalSpellBlocks(
          isDivineOrder
            ? thaumaturgeSpells
            : (feature?.additionalSpells as AdditionalSpellBlock[] | undefined),
        )
      } catch (error) {
        return deny(error instanceof Error ? error.message : 'Unsupported additional-spell syntax.')
      }
      const block = blocks[0]
      const choice = block?.choices[0]
      if (
        blocks.length !== 1 ||
        !block ||
        block.grants.length ||
        block.expanded?.length ||
        block.abilityOptions ||
        !block.ability ||
        block.choices.length !== 1 ||
        !choice ||
        choice.level !== 0 ||
        choice.source !== 'known' ||
        choice.usage !== 'direct' ||
        !choice.isCantrip ||
        choice.count > 1000
      )
        return deny(
          'This feature needs additional spell rules beyond the supported single cantrip choice.',
        )
      setup.count = choice.count
      setup.choice = choice
      if (choice.filter?.classes.some((name) => /[()[\]]/.test(name)))
        return deny('Decorated class spell filters need unsupported source or plugin rules.')
      if (
        !isDivineOrder &&
        (!feature ||
          !hasCurrentFeatureSpellSemantics(option.entityType, feature, selection.className))
      )
        return deny(
          'This feature’s class attribution or additional conditions are unsupported or changed.',
        )
      if (
        option.entityType === 'optionalFeature' &&
        !getOptionalClassPoolSelectionSection(selection)
      )
        return deny('This feature needs a supported source-qualified acquisition context.')
      if (
        !active.some((row) => row.selection === selection && row.option === option) ||
        ![
          selection.classSource,
          option.source ?? '',
          ...(selection.subclassSource ? [selection.subclassSource] : []),
        ].every((source) => permitted(allowed, source))
      )
        return deny(
          'Restore this selected class feature and its optional feature permission or selection.',
        )
      const entries = character.classProgression.filter(
        (entry) =>
          norm(entry.name) === owner[1] &&
          norm(entry.source) === owner[2] &&
          (owner[0] === 'class' ||
            (norm(entry.subclass) === owner[3] && norm(entry.subclassSource) === owner[4])),
      )
      const entry = entries.length === 1 ? entries[0] : undefined
      if (!entry || entry.levels < setup.level)
        return deny('This feature spell choice is not earned by its class owner.')
      const { rule } = getClassSpellProfilePolicy(entry)
      const scoped =
        catalogs &&
        scopeClassChoiceFeatureCatalogs(
          catalogs,
          owner[0] === 'subclass'
            ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
            : undefined,
        )
      const casting =
        rule &&
        scoped &&
        getClassCastingLevelAccess(
          scoped,
          rule.declaration.owner,
          rule.declaration.target,
          rule.declaration.level,
          entry.levels,
        )
      if (!casting || norm(casting.effective.spellcastingAbility) !== block.ability)
        return deny('Restore this class’s casting source and matching feature casting ability.')
      return [setup]
    }),
  )
}

export function getSelectedFeatureCantripSlots(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
): ManagedClassSpellSlot[] {
  return getSelectedFeatureCantripSetups(character, catalogs, prerequisites).flatMap((setup) =>
    setup.offered
      ? Array.from(
          { length: setup.count },
          (_, ordinal): ManagedClassSpellSlot => [
            setup.owner,
            'feature-cantrip',
            setup.producer,
            setup.level,
            ordinal,
          ],
        )
      : [],
  )
}

export function getSelectedFeatureCantripPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
) {
  const setup = getSelectedFeatureCantripSetups(character, context?.catalogs, {
    effectiveAbilityScores: context?.abilityScores,
    effectiveSpellProfiles: context?.independentSpellProfiles,
  }).find((row) => same(row.owner, slot[0]) && row.producer === slot[2] && row.level === slot[3])
  const reason = !hasSavedSelectedFeatureSpellOwner(character, slot)
    ? 'This granting feature selection is unavailable.'
    : !setup
      ? 'Restore the granting feature source.'
      : (setup.reason ??
        (slot[4] >= setup.count ? 'This choice exceeds the feature’s current count.' : undefined))
  const allowed = sources(character)
  const unique = new Map<
    string,
    NonNullable<ManagedClassSpellContext['spellsByKey']>[string] | undefined
  >()
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getSpellReferenceKey(spell.name, spell.source)
    unique.set(key, unique.has(key) ? undefined : spell)
  }
  const choice = setup?.choice
  const isDivineOrder = decodeSelectedFeatureSpellAddress(slot[2])?.[1] === 'classFeature'
  const spells =
    reason || !choice
      ? []
      : [...unique.values()].filter((spell): spell is NonNullable<typeof spell> => {
          if (!spell || spell.level !== 0 || !permitted(allowed, spell.source)) return false
          if (choice.pool)
            return choice.pool.some(
              (ref) => getSpellReferenceKey(ref) === getSpellReferenceKey(spell.name, spell.source),
            )
          const filter = choice.filter
          if (filter && !filter.classes.length) return true
          const checked = auditSpellRouteMultiplicity([spell])[0]
          return (
            !!checked.classSpellRouteSource &&
            !!filter &&
            checked.classSpellRoutes?.some(
              (route) =>
                matchesJoinedSpellClassFilter(route, filter.classes) &&
                (!isDivineOrder || (route[3] === slot[0][1] && route[4] === slot[0][2])) &&
                [route[2], route[4], ...(route[6] ? [route[6]] : [])].every((source) =>
                  permitted(allowed, source),
                ),
            ) === true
          )
        })
  return {
    spells,
    defaultReferences: new Set(
      spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: 0,
    allowedLevels: [0],
    reason,
    schools: undefined,
    privileged: false,
    featureName: setup?.name,
    count: setup?.count ?? 0,
  }
}
