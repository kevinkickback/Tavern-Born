import {
  type AdditionalSpellChoiceDescriptor,
  parseAdditionalSpellBlocks,
} from '@/lib/5etools/additionalSpells'
import {
  getArcaneArcherCantripChoice,
  getIncludedArcaneArcherSpellReprints,
  isArcaneArcherCantripOwner,
} from '@/lib/5etools/arcaneArcherCantripSource'
import {
  getCurrentGiantPower,
  hasIncludedSrdGiantSpellProof,
} from '@/lib/5etools/barbarianGiantPower'
import { getCurrentBardPrimalLore } from '@/lib/5etools/bardCollegeFeatures'
import { getClassicLandBonusCantrip } from '@/lib/5etools/circleOfTheLand'
import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { getClassCastingLevelAccess } from '@/lib/5etools/classCastingSource'
import { getClassOrderById } from '@/lib/5etools/classOrderIdentity'
import {
  clericDomainCantrips,
  getClericDomainCantripSource,
} from '@/lib/5etools/clericDomainCantripSources'
import {
  getClassFeatureSpellSemantics,
  hasCurrentFeatureSpellSemantics,
  hasDeclaredClassFeatSpellContext,
} from '@/lib/5etools/featureSpellSemantics'
import { getCurrentOathSpellReprints } from '@/lib/5etools/legacyPaladinOathSpells'
import { getElementalDisciplineSpells } from '@/lib/5etools/monkSubclassRules'
import { getCurrentNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import {
  BARD_PRIMAL_LORE_SPELL_SLOT,
  decodeSelectedFeatureSpellAddress,
  getArcaneArcherCantripSlot,
  getClericDomainCantripProducer,
  giantPowerSpellSlots,
  isArcaneArcherCantripSlot,
  isGiantPowerSpellSlot,
  LAND_BONUS_SPELL_SLOT,
  wizardIllusionCantripSlots,
} from '@/lib/5etools/selectedFeatureSpellIdentity'
import { matchesJoinedSpellClassFilter } from '@/lib/5etools/spellFilterSources'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import {
  hasCurrentWizardIllusionCantrip,
  knowsIndependentMinorIllusion,
} from '@/lib/5etools/wizardTraditionSpellSources'
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'
import { getAtWillInvocationContract, isNativeInvocationPool } from './atWillInvocationRules'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { getCurrentClassChoiceDeclaration } from './classChoiceOptions'
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
  useDeclaredSpellLists?: true
  spellSchool?: string
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
      const activeRoute = active.find((row) => row.selection === selection && row.option === option)
      if (
        option.entityType === 'optionalFeature' &&
        feature &&
        activeRoute?.choice.fixedOptions?.length &&
        getElementalDisciplineSpells(
          feature,
          option.slotLevel,
          activeRoute.choice,
          catalogs?.classes,
        )
      )
        return []
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
      const declaredFeat =
        option.entityType === 'feat' &&
        feature?.source &&
        activeRoute &&
        catalogs &&
        hasDeclaredClassFeatSpellContext(
          activeRoute.choice,
          { ...feature, source: feature.source },
          getCurrentClassChoiceDeclaration(activeRoute.choice, catalogs),
        )
      const setup: SelectedFeatureCantripSetup = {
        owner,
        producer,
        level: option.slotLevel,
        name: option.name,
        count: 0,
        offered: !!order || !!declaredFeat || (!!semantics && semantics.className === owner[1]),
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
        !declaredFeat &&
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
      const { rule, owner: castingOwner } = getClassSpellProfilePolicy(entry)
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
          castingOwner,
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
  for (const slot of giantPowerSpellSlots) {
    const [owner, , producer, level] = slot
    if (
      !getSourceCompatibility(owner[2], character.originSystem).compatible ||
      !hasSavedSelectedFeatureSpellOwner(character, slot)
    )
      continue
    const classes = catalogs?.classes?.filter(
      (row) => norm(row.name) === owner[1] && norm(row.source) === owner[2],
    )
    const cls = classes?.length === 1 ? classes[0] : undefined
    const paths = cls?.subclasses?.filter(
      (row) => norm(row.name) === owner[3] && norm(row.source) === owner[4],
    )
    const pool =
      cls &&
      paths?.length === 1 &&
      permitted(allowed, owner[2]) &&
      permitted(allowed, 'bgg') &&
      getCurrentGiantPower(cls, paths[0])
    setups.push({
      owner,
      producer,
      level,
      name: 'Giant Power',
      offered: true,
      count: 1,
      choice: {
        id: producer,
        level: 0,
        count: 1,
        isCantrip: true,
        source: 'known',
        usage: 'direct',
        pool: pool
          ? pool.map((reference) => formatSpellReference(reference, owner[2].toUpperCase()))
          : [],
      },
      ...(pool ? {} : { reason: 'Restore the exact Giant Power source.' }),
    })
  }
  for (const rule of clericDomainCantrips) {
    const owner = ['subclass', 'cleric', rule.printing, rule.subclass, rule.source] as const
    if (!getSourceCompatibility(rule.printing, character.originSystem).compatible) continue
    const selected = character.classProgression.filter(
      (entry) =>
        norm(entry.name) === owner[1] &&
        norm(entry.source) === owner[2] &&
        norm(entry.subclass) === owner[3] &&
        norm(entry.subclassSource) === owner[4],
    )
    if (selected.length !== 1) continue
    const classes = catalogs?.classes?.filter(
      (cls) => norm(cls.name) === 'cleric' && norm(cls.source) === rule.printing,
    )
    const cls = classes?.length === 1 ? classes[0] : undefined
    const domains = cls?.subclasses?.filter(
      (subclass) =>
        norm(subclass.name) === rule.subclass &&
        norm(subclass.shortName) === rule.shortName &&
        norm(subclass.source) === rule.source &&
        norm(subclass.className) === 'cleric' &&
        norm(subclass.classSource) === rule.printing,
    )
    const available =
      cls &&
      domains?.length === 1 &&
      permitted(allowed, rule.printing) &&
      (permitted(allowed, rule.source) ||
        (rule.printing === 'xphb' && rule.subclass === 'nature domain' && rule.source === 'phb')) &&
      getClericDomainCantripSource(cls, domains[0], rule)
    if (!available) {
      const level = (cls && getCurrentNativeSubclassGain(cls)?.level) ?? selected[0].levels
      if (level <= selected[0].levels)
        setups.push({
          owner: [...owner],
          producer: norm(rule.name),
          level,
          name: rule.name,
          offered: false,
          count: 0,
          reason: `Restore the exact ${rule.name} source.`,
        })
      continue
    }
    const { choice, school, gain: level, target } = available
    const producer = getClericDomainCantripProducer(rule, target)
    if (
      !hasSavedSelectedFeatureSpellOwner(character, [
        [...owner],
        'feature-cantrip',
        producer,
        level,
        0,
      ])
    )
      continue
    setups.push({
      owner: [...owner],
      producer,
      level,
      name: rule.name,
      count: choice.count,
      choice,
      useDeclaredSpellLists: true,
      spellSchool: school,
      offered: true,
    })
  }
  for (const entry of character.classProgression.filter(isArcaneArcherCantripOwner)) {
    const printing = norm(entry.source)
    const subclassSource = norm(entry.subclassSource)
    if (
      !getSourceCompatibility(printing, character.originSystem).compatible ||
      !permitted(allowed, printing) ||
      !permitted(allowed, subclassSource)
    )
      continue
    const classes = catalogs?.classes?.filter(
      (row) => norm(row.name) === 'fighter' && norm(row.source) === printing,
    )
    const cls = classes?.length === 1 ? classes[0] : undefined
    const roots = cls?.subclasses?.filter(
      (row) => norm(row.name) === 'arcane archer' && norm(row.source) === subclassSource,
    )
    const rule = cls && roots?.length === 1 && getArcaneArcherCantripChoice(cls, roots[0])
    const slot =
      rule && getArcaneArcherCantripSlot(printing, subclassSource, rule.level, rule.originLevel)
    if (
      !rule ||
      !slot ||
      rule.target !== decodeSelectedFeatureSpellAddress(slot[2])?.[0] ||
      !hasSavedSelectedFeatureSpellOwner(character, slot)
    )
      continue
    setups.push({
      owner: slot[0],
      producer: slot[2],
      level: rule.level,
      name: 'Arcane Archer Lore',
      offered: true,
      count: 1,
      choice: {
        id: slot[2],
        level: 0,
        count: 1,
        isCantrip: true,
        source: 'known',
        usage: 'direct',
        pool:
          subclassSource === 'xge' && printing === 'xphb'
            ? rule.references.map((reference) => formatSpellReference(reference, 'XPHB'))
            : rule.references,
      },
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
  const giantPower = isGiantPowerSpellSlot(slot)
  const arcaneArcher = isArcaneArcherCantripSlot(slot)
  const inheritedArcher = arcaneArcher && slot[0][2] === 'xphb' && slot[0][4] === 'xge'
  const archerReprints = inheritedArcher
    ? getCurrentOathSpellReprints(context?.oathSpellSourceByKey)
    : undefined
  const archerIncludedReprints = inheritedArcher
    ? getIncludedArcaneArcherSpellReprints(context?.oathSpellSourceByKey)
    : undefined
  const giantReprints =
    giantPower && slot[0][2] === 'xphb'
      ? getCurrentOathSpellReprints(context?.oathSpellSourceByKey)
      : undefined
  const spells =
    reason || !choice
      ? []
      : [...unique.values()].filter((spell): spell is NonNullable<typeof spell> => {
          if (!spell || spell.level !== 0 || !permitted(allowed, spell.source)) return false
          if (
            arcaneArcher &&
            (!getSourceCompatibility(spell.source, character.originSystem).compatible ||
              spell.classSpellRouteSource?.input.targetOccurrences.length !== 1)
          )
            return false
          if (
            setup?.useDeclaredSpellLists &&
            !getSourceCompatibility(spell.source, character.originSystem).compatible
          )
            return false
          if (
            choice.pool &&
            !choice.pool.some(
              (ref) => getSpellReferenceKey(ref) === getSpellReferenceKey(spell.name, spell.source),
            )
          )
            return false
          if (
            giantPower &&
            (spell.classSpellRouteSource?.input.targetOccurrences.length !== 1 ||
              (giantReprints &&
                giantReprints.get(getSpellReferenceKey(spell.name, spell.source)) !== 0 &&
                !hasIncludedSrdGiantSpellProof(spell.name, context?.oathSpellSourceByKey)))
          )
            return false
          if (setup?.spellSchool && spell.school !== setup.spellSchool) return false
          if (archerReprints && archerIncludedReprints) {
            const key = getSpellReferenceKey(spell.name, spell.source)
            if (archerReprints.get(key) !== 0 && archerIncludedReprints.get(key) !== 0) return false
          }
          if (
            setup?.spellSchool &&
            (spell.classSpellRouteSource?.input.targetOccurrences.length ?? 0) > 1
          )
            return false
          if (illusionAlternate && getSpellNameKey(spell.name) === 'minor illusion') return false
          if (choice.pool) return true
          const filter = choice.filter
          if (filter && !filter.classes.length) return true
          const checked = auditSpellRouteMultiplicity([spell])[0]
          return (
            !!checked.classSpellRouteSource &&
            !!filter &&
            checked.classSpellRoutes?.some(
              (route) =>
                matchesJoinedSpellClassFilter(route, filter.classes) &&
                (!ownerScoped ||
                  ((setup?.useDeclaredSpellLists || route[3] === listOwner) &&
                    route[4] === slot[0][2])) &&
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
