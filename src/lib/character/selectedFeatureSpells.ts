import {
  type AdditionalSpellChoiceDescriptor,
  parseAdditionalSpellBlocks,
} from '@/lib/5etools/additionalSpells'
import { getCurrentBardPrimalLore } from '@/lib/5etools/bardCollegeFeatures'
import { getClassicLandBonusCantrip } from '@/lib/5etools/circleOfTheLand'
import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { getClassCastingLevelAccess } from '@/lib/5etools/classCastingSource'
import { getClassOrderById } from '@/lib/5etools/classOrderIdentity'
import {
  getClassFeatureSpellSemantics,
  hasCurrentFeatureSpellSemantics,
} from '@/lib/5etools/featureSpellSemantics'
import {
  BARD_PRIMAL_LORE_SPELL_SLOT,
  decodeSelectedFeatureSpellAddress,
  LAND_BONUS_SPELL_SLOT,
  wizardIllusionCantripSlots,
} from '@/lib/5etools/selectedFeatureSpellIdentity'
import { matchesJoinedSpellClassFilter } from '@/lib/5etools/spellFilterSources'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import {
  hasCurrentWizardIllusionCantrip,
  knowsIndependentMinorIllusion,
} from '@/lib/5etools/wizardTraditionSpellSources'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'
import { getAtWillInvocationContract, isNativeInvocationPool } from './atWillInvocationRules'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { getCurrentClassOrder } from './classOrder'
import { type ManagedClassSpellContext, permitted, sources } from './classSpellAuthority'
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
  const setups = (character.classChoiceSelections ?? []).flatMap((selection) =>
    selection.selected.flatMap((option) => {
      const producer = getSelectedFeatureSpellProducer(selection, option)
      if (!producer) return []
      const order =
        option.entityType === 'classFeature' ? getClassOrderById(selection.choiceId) : undefined
      const rows =
        option.entityType === 'feat' ? catalogs?.featExpertiseFeats : catalogs?.optionalFeatures
      const candidates = (rows ?? []).filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
      const feature = candidates.length === 1 ? candidates[0] : undefined
      if (
        getAtWillInvocationContract(selection, option, feature) &&
        !active.some(
          (row) =>
            row.selection === selection &&
            row.option === option &&
            !isNativeInvocationPool(row.choice),
        )
      )
        return []
      const semantics = getClassFeatureSpellSemantics(
        option.entityType,
        option.name,
        option.source ?? '',
      )
      // Ordinary Class feats retain the existing feat actor; only missing class-attribution semantics
      // route a feat through this Class-profile adapter.
      if (option.entityType === 'feat' && !semantics) return []
      if (!order && !semantics && !(feature && 'additionalSpells' in feature)) return []
      const owner = selectedFeatureSpellOwner(selection)
      const setup: SelectedFeatureCantripSetup = {
        owner,
        producer,
        level: option.slotLevel,
        name: option.name,
        count: 0,
        offered: !!order || (!!semantics && semantics.className === owner[1]),
      }
      const deny = (reason: string) => [{ ...setup, reason }]
      if (order && getCurrentClassOrder(character, order, catalogs)?.selection !== selection)
        return deny(
          `Restore the exact ${order.name} and ${order.caster.name} sources to choose a cantrip.`,
        )
      if (!order && !feature)
        return deny(
          'Restore the exact granting feature source; duplicate definitions cannot grant spells.',
        )
      let blocks: ReturnType<typeof parseAdditionalSpellBlocks>
      try {
        blocks = parseAdditionalSpellBlocks(
          order
            ? [{ ability: 'wis', known: { _: [{ choose: `level=0|class=${order.className}` }] } }]
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
        !order &&
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
  if (hasSavedSelectedFeatureSpellOwner(character, LAND_BONUS_SPELL_SLOT)) {
    const classes = catalogs?.classes?.filter(
      (row) => norm(row.name) === 'druid' && norm(row.source) === 'phb',
    )
    const cls = classes?.length === 1 ? classes[0] : undefined
    const circles = cls?.subclasses?.filter(
      (row) => norm(row.name) === 'circle of the land' && norm(row.source) === 'phb',
    )
    const available =
      cls &&
      circles?.length === 1 &&
      permitted(allowed, 'phb') &&
      getClassicLandBonusCantrip(cls, circles[0])
    const [owner, , producer, level] = LAND_BONUS_SPELL_SLOT
    const choice = parseAdditionalSpellBlocks([
      { ability: 'wis', known: { _: [{ choose: 'level=0|class=Druid' }] } },
    ])[0].choices[0]
    setups.push({
      owner,
      producer,
      level,
      name: 'Bonus Cantrip',
      offered: true,
      count: 1,
      choice,
      ...(available
        ? {}
        : { reason: 'Restore the exact classic Circle of the Land Bonus Cantrip source.' }),
    })
  }
  for (const { rule, slot } of wizardIllusionCantripSlots) {
    if (!hasSavedSelectedFeatureSpellOwner(character, slot)) continue
    const [owner, , producer, level] = slot
    const qualifies = knowsIndependentMinorIllusion(
      character,
      rule,
      prerequisites?.effectiveSpellProfiles,
    )
    const classes = catalogs?.classes?.filter(
      (cls) => norm(cls.name) === 'wizard' && norm(cls.source) === rule.source,
    )
    const available =
      classes?.length === 1 &&
      permitted(allowed, rule.source) &&
      hasCurrentWizardIllusionCantrip(classes[0], rule)
    if (
      !qualifies &&
      !character.managedClassSpellChoices?.some(({ slot: saved }) => same(saved, slot))
    )
      continue
    const choice = parseAdditionalSpellBlocks([
      { ability: 'int', known: { _: [{ choose: 'level=0|class=Wizard' }] } },
    ])[0].choices[0]
    setups.push({
      owner,
      producer,
      level,
      name: rule.name,
      offered: qualifies,
      count: 1,
      choice,
      reason: !available
        ? `Restore the exact ${rule.name} source.`
        : !qualifies
          ? 'This extra cantrip requires Minor Illusion from another source.'
          : undefined,
    })
  }
  if (hasSavedSelectedFeatureSpellOwner(character, BARD_PRIMAL_LORE_SPELL_SLOT)) {
    const classes = catalogs?.classes?.filter(
      (row) => norm(row.name) === 'bard' && norm(row.source) === 'xphb',
    )
    const cls = classes?.length === 1 ? classes[0] : undefined
    const colleges = cls?.subclasses?.filter(
      (row) => norm(row.name) === 'college of the moon' && norm(row.source) === 'frhof',
    )
    const available =
      cls &&
      colleges?.length === 1 &&
      permitted(allowed, 'xphb') &&
      permitted(allowed, 'frhof') &&
      getCurrentBardPrimalLore(cls, colleges[0])
    const [owner, , producer, level] = BARD_PRIMAL_LORE_SPELL_SLOT
    const choice = parseAdditionalSpellBlocks([
      { ability: 'cha', known: { _: [{ choose: 'level=0|class=Druid' }] } },
    ])[0].choices[0]
    setups.push({
      owner,
      producer,
      level,
      name: 'Primal Lore',
      count: 1,
      choice,
      offered: true,
      ...(!available && { reason: 'Restore the exact College of the Moon Primal Lore source.' }),
    })
  }
  return setups
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
  const ownerScoped = ['classFeature', 'subclassFeature'].includes(
    decodeSelectedFeatureSpellAddress(slot[2])?.[1] ?? '',
  )
  const illusionAlternate = wizardIllusionCantripSlots.some((row) => row.slot[2] === slot[2])
  const listOwner = slot[2] === BARD_PRIMAL_LORE_SPELL_SLOT[2] ? 'druid' : slot[0][1]
  const spells =
    reason || !choice
      ? []
      : [...unique.values()].filter((spell): spell is NonNullable<typeof spell> => {
          if (!spell || spell.level !== 0 || !permitted(allowed, spell.source)) return false
          if (illusionAlternate && getSpellNameKey(spell.name) === 'minor illusion') return false
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
                (!ownerScoped || (route[3] === listOwner && route[4] === slot[0][2])) &&
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
