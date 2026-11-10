import {
  getArtificerGrantedCantrip,
  getCurrentArtificerRules,
} from '@/lib/5etools/artificerJourneyRules'
import { isRevisedAncestralGuardian } from '@/lib/5etools/barbarianRitualSpells'
import {
  currentClasses,
  hasBardMagicalSecretsRoute,
  hasCurrentClassSpellListRoute,
  type ManagedClassSpellContext,
  permitted,
  sources,
} from './classSpellAuthority'

export type { ManagedClassSpellContext } from './classSpellAuthority'

import {
  getBardLoreSpellRule,
  getCurrentBardMagicalSecrets,
  hasCurrentBardLoreSpellSource,
  isClassicMagicalSecretsSlot,
} from '@/lib/5etools/bardSpellSources'
import { isCircleOfTheLand } from '@/lib/5etools/circleOfTheLand'
import {
  getClassSpellProfilePolicy,
  getManagedClassSpellRule,
} from '@/lib/5etools/classCastingRules'
import {
  type ClassCastingCatalog,
  createClassCastingSourceAccess,
  getClassCastingGainAuthority,
  getClassCastingLevelAccess,
} from '@/lib/5etools/classCastingSource'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  getClericArcanaSpellChoices,
  getClericArcanaSpellRule,
} from '@/lib/5etools/clericArcanaSpells'
import { hasClassicLightBonusCantrip } from '@/lib/5etools/clericDomainCantripSources'
import { getEntityLookupKey } from '@/lib/5etools/entityIdentity'
import {
  getIncludedDomainSpellReprints,
  isRevisedInheritedDomainOwner,
} from '@/lib/5etools/legacyClericDomainSpells'
import {
  getCurrentOathSpellReprints,
  isRevisedInheritedOathOwner,
} from '@/lib/5etools/legacyPaladinOathSpells'
import { getLegacySorcererSpec } from '@/lib/5etools/legacySorcererSubclassRules'
import { getCurrentMonkBaseRules, getEmptyBodySpell } from '@/lib/5etools/monkBaseRules'
import { getElementalDisciplineSpells } from '@/lib/5etools/monkSubclassRules'
import { getArcaneDabbler, isArcaneDabblerSlot } from '@/lib/5etools/mysticArcaneDabbler'
import { ARCANE_DABBLER } from '@/lib/5etools/mysticFeatureIdentity'
import {
  ELDRITCH_HEX_TARGET,
  getCurrentStepsOfTheFey,
  STEPS_OF_THE_FEY_SPELL,
  STEPS_OF_THE_FEY_TARGET,
} from '@/lib/5etools/nativeWarlockPatronRules'
import { isRevisedInheritedRangerSpellOwner } from '@/lib/5etools/rangerSubclassSpells'
import {
  getCurrentSavantSpellbookGrant,
  getSavantSpellbookGain,
} from '@/lib/5etools/savantSpellbookRules'
import {
  getSpellbookSpecialtyRule,
  isCurrentSpellbookSpecialty,
} from '@/lib/5etools/spellbookSpecialtyRules'
import { matchesJoinedSpellClassFilter } from '@/lib/5etools/spellFilterSources'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import {
  getEarnedSubclassSpellGrants,
  hasCurrentSubclassSpellGrant,
} from '@/lib/5etools/subclassSpells'
import {
  getInvocationActorKey,
  hasCurrentCelestialInvocationCantrips,
  inheritsRevisedInvocations,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { isVestigePatron } from '@/lib/5etools/warlockPatronConfigurations'
import {
  getWizardIllusionCantripOwner,
  hasCurrentWizardIllusionCantrip,
  knowsIndependentMinorIllusion,
} from '@/lib/5etools/wizardTraditionSpellSources'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { getClassPreparationLimit } from '@/lib/calculations/preparedSpellLimits'
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { addSpellGrant } from '@/lib/provenance/ledger'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import { getInvalidManagedClassSpellPaths } from '@/lib/schema/managedClassSpellValidation'
import type { Class5e, Spell5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellChoice, ManagedClassSpellSlot } from '@/types/classCasting'
import { scopeClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { projectDailyClassSpellIntent } from './dailyClassSpells'
import {
  CONTACT_PATRON_TARGET,
  getDirectClassPreparedSpellGrants,
} from './directClassPreparedSpells'
import { getEffectiveClassChoiceFeatureRoutes } from './effectiveClassChoiceFeatures'
import {
  getManagedClassSpellOwnerEntry,
  isManagedClassSpellProfile,
  makeManagedClassSpellTag,
  managedClassSpellId,
} from './managedClassSpellIdentity'
import { stripManagedClassSpellState } from './managedClassSpellState'
import {
  type ClassFixedSpellGrant,
  type ClassFixedSpellStatus,
  getOptionalClassFixedSpellGrants,
  getOptionalClassFixedSpellNamesAtGain,
} from './optionalClassFixedSpells'
import { getSelectedFeatureCantripPool } from './selectedFeatureSpells'

export interface ManagedClassSpellStatus {
  choice: ManagedClassSpellChoice
  active: boolean
  reason?: string
  prepared?: boolean
  castingNote?: string
  specialtyAlwaysPrepared?: boolean
}

function resolveSlot(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
  classes: readonly Class5e[] = currentClasses(character, context),
  gainAuthority = getClassCastingGainAuthority,
) {
  if (
    slot[1] === 'feature-cantrip' ||
    slot[1] === 'feature-prepared' ||
    slot[1] === 'class-spellbook-specialty'
  )
    return 'Use this selected feature’s spell choices.'
  const savantGain = getSavantSpellbookGain(slot)
  const lore = getBardLoreSpellRule(slot)
  const arcana = getClericArcanaSpellRule(slot)
  const entry = getManagedClassSpellOwnerEntry(slot, character.classProgression)
  const inheritedSavant =
    savantGain && !savantGain.rule.owner.every((part, index) => slot[0][index] === part)
  const baseCasting =
    (savantGain || lore || arcana) && entry
      ? getClassSpellProfilePolicy(
          { name: entry.name, source: entry.source, levels: entry.levels },
          inheritedSavant ? context?.catalogs?.classCastingSources : undefined,
        )
      : undefined
  const rule = baseCasting ? baseCasting.rule : getManagedClassSpellRule(slot)?.rule
  if (!rule) return 'The saved class spell ownership is invalid.'
  if (!entry || entry.levels < slot[3] || entry.levels < rule.declaration.level)
    return 'This spell choice is not earned by the selected class or subclass.'
  if (!context?.catalogs || !context.spellsByKey)
    return 'Restore the current class and spell sources.'
  const owner = slot[0]
  const catalog = scopeClassChoiceFeatureCatalogs(
    context.catalogs,
    owner[0] === 'subclass'
      ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
      : undefined,
  )
  const { declaration } = rule
  const castingOwner = baseCasting?.owner ?? owner
  const authority =
    arcana || inheritedSavant
      ? getClassCastingLevelAccess(
          catalog,
          castingOwner,
          declaration.target,
          declaration.level,
          slot[3],
        )
      : gainAuthority(
          catalog,
          castingOwner,
          declaration.target,
          declaration.level,
          slot[1],
          slot[3],
        )
  const allowed = sources(character)
  if (
    !authority ||
    ![
      owner[2],
      ...(owner[0] === 'subclass' ? [owner[4]] : []),
      authority.declaration.feature.source,
      ...(authority.templateSources ?? []),
      ...(authority.provider ? [authority.provider.source] : []),
    ].every((source) => permitted(allowed, source))
  )
    return 'Restore the source for this casting feature and its spell slots.'
  const dependency = authority.rule.requiresDeclaration
  if (dependency) {
    const introduction = gainAuthority(
      catalog,
      owner,
      dependency.target,
      dependency.level,
      slot[1],
      dependency.level,
    )
    if (!introduction || !permitted(allowed, introduction.declaration.feature.source))
      return 'Restore the introductory casting feature for this spell choice.'
  }
  const owners = classes.filter(
    (row) => norm(row.name) === norm(entry.name) && norm(row.source) === norm(entry.source),
  )
  const classData = (arcana || inheritedSavant) && owners.length !== 1 ? undefined : owners[0]
  const savant = savantGain && classData && getCurrentSavantSpellbookGrant(slot, classData, catalog)
  if (
    savantGain &&
    (!savant ||
      (inheritedSavant &&
        (baseCasting?.mode !== 'spellbook' || !permitted(allowed, savantGain.rule.owner[4]))) ||
      authority.maxSpellLevel !== savantGain.tier)
  )
    return `Restore the current ${savantGain.rule.name} feature and its spellbook schedule.`
  const arcanaRank = arcana?.rank
  const arcanaChoice =
    arcana &&
    getClericArcanaSpellChoices(entry, classData).find(
      (candidate) => managedClassSpellId(candidate.slot) === managedClassSpellId(slot),
    )
  if (
    arcana &&
    (!classData || !arcanaRank || authority.maxSpellLevel < arcanaRank || !arcanaChoice)
  )
    return `Restore the current ${arcana.name} feature and its spell schedule.`
  if (
    lore &&
    (!classData ||
      authority.maxSpellLevel !== 3 ||
      !hasCurrentBardLoreSpellSource(classData, lore, catalog.subclassFeatureCandidates))
  )
    return `Restore the current ${lore.name} feature and spell schedule.`
  const classicSecrets = isClassicMagicalSecretsSlot(slot)
  const secretPrinting = classicSecrets
    ? 'phb'
    : owner[0] === 'class' &&
        owner[1] === 'bard' &&
        owner[2] === 'xphb' &&
        slot[1] === 'class-known' &&
        slot[3] >= 10
      ? 'xphb'
      : undefined
  const secrets =
    secretPrinting && getCurrentBardMagicalSecrets(classes, catalog, secretPrinting, slot[3])
      ? secretPrinting
      : undefined
  if (classicSecrets && !secrets)
    return 'Restore the current Magical Secrets feature and its spell schedule.'
  const fixedAtGain = getEarnedSubclassSpellGrants(classData, entry, slot[3], {
    selections: character.classChoiceSelections,
    character,
    catalogs: context?.catalogs,
  })
  if (!fixedAtGain) return 'Restore the selected subclass and its earned spell grants.'
  const fixedCantrip =
    slot[1] === 'class-cantrip' && norm(entry.name) === 'artificer'
      ? getArtificerGrantedCantrip(getCurrentArtificerRules(character, context?.catalogs))
      : undefined
  if (fixedCantrip && fixedCantrip.feature.level <= slot[3]) {
    fixedAtGain.push({
      spellName: fixedCantrip.reference,
      isCantrip: true,
      level: fixedCantrip.feature.level,
      mode: 'known',
    })
  }
  const expandedAtGain = new Map(
    fixedAtGain.flatMap(({ spellName, expandedRank }) =>
      expandedRank === undefined ? [] : [[getSpellReferenceKey(spellName), expandedRank] as const],
    ),
  )
  const privileged =
    slot[1] === 'class-known' &&
    slot[4] === 0 &&
    authority.rule.unrestrictedGains?.includes(slot[3]) === true
  return {
    entry,
    authority,
    fixedAtGain,
    expandedAtGain,
    privileged,
    savant,
    allowed,
    secrets,
    classData,
    lore,
    arcana: arcana && arcanaChoice ? { ...arcana, classes: arcanaChoice.classes } : undefined,
    arcanaRank,
  }
}

function hasDefaultManagedSpellRoute(
  character: Character,
  spell: Spell5e,
  slot: ManagedClassSpellSlot,
  state: Exclude<ReturnType<typeof resolveSlot>, string>,
  context: ManagedClassSpellContext | undefined,
) {
  if (state.savant) return true
  const arcana = state.arcana
  if (arcana) {
    const [checked] = auditSpellRouteMultiplicity([spell])
    return (
      checked.classSpellRouteSource?.input.targetOccurrences.length === 1 &&
      checked.classSpellRoutes?.some(
        (route) =>
          route[4] === arcana.printing &&
          matchesJoinedSpellClassFilter(route, arcana.classes) &&
          [route[2], route[4], ...(route[6] ? [route[6]] : [])].every((source) =>
            permitted(state.allowed, source),
          ),
      ) === true
    )
  }
  if (state.lore) return hasBardMagicalSecretsRoute(character, spell, state.lore.source)
  if (state.secrets === 'phb') return hasBardMagicalSecretsRoute(character, spell, state.secrets)
  return (
    hasCurrentClassSpellListRoute(character, state.entry, spell, context ?? {}, {
      owner: slot[0],
      requestedTarget: slot[2],
      expandedAtGain: state.expandedAtGain,
    }) ||
    (state.secrets === 'xphb' && hasBardMagicalSecretsRoute(character, spell, state.secrets))
  )
}

function targetError(
  spell: Spell5e,
  slot: ManagedClassSpellSlot,
  state: Exclude<ReturnType<typeof resolveSlot>, string>,
  saved = false,
) {
  if (slot[1] === 'class-cantrip' && getSpellNameKey(spell.name) === 'minor illusion') {
    const illusion = getWizardIllusionCantripOwner(state.entry)
    if (
      illusion &&
      slot[3] >= illusion.level &&
      state.classData &&
      hasCurrentWizardIllusionCantrip(state.classData, illusion)
    )
      return 'Choose another cantrip; the Illusion tradition supplies Minor Illusion at its gain.'
  }
  if (
    (state.arcanaRank && spell.level !== state.arcanaRank) ||
    (slot[1] === 'class-cantrip'
      ? spell.level !== 0
      : slot[1] === 'class-arcanum'
        ? spell.level !== state.authority.maxSpellLevel
        : spell.level < (state.lore || state.secrets === 'phb' ? 0 : 1) ||
          spell.level > state.authority.maxSpellLevel)
  )
    return 'This spell is outside the level available for this choice.'
  const savant = state.savant
  if (savant) {
    if (!savant.levels.includes(spell.level) || spell.school !== savant.school)
      return 'Choose a Wizard spell of the required school and level for this gain.'
    const checked = auditSpellRouteMultiplicity([spell])[0]
    if (
      !checked.classSpellRouteSource ||
      checked.classSpellRouteSource.input.targetOccurrences.length !== 1 ||
      !checked.classSpellRoutes?.some(
        (route) =>
          ['phb', 'xphb'].includes(route[4]) &&
          matchesJoinedSpellClassFilter(route, savant.classes) &&
          [route[2], route[4], ...(route[6] ? [route[6]] : [])].every((source) =>
            permitted(state.allowed, source),
          ),
      )
    )
      return 'Choose a spell from the feature’s current Wizard spell list.'
  }
  if (
    !(
      saved &&
      (isVestigePatron(state.entry) ||
        getLegacySorcererSpec(state.entry) ||
        isCircleOfTheLand(
          state.entry.name,
          state.entry.source,
          state.entry.subclass ?? '',
          state.entry.subclassSource,
        ))
    ) &&
    state.fixedAtGain.some(
      (grant) =>
        grant.mode !== 'expanded' &&
        grant.mode !== 'cast-only' &&
        !(saved && grant.namedChoice) &&
        getSpellNameKey(grant.spellName) === getSpellNameKey(spell.name),
    )
  )
    return 'Choose another spell; this class already grants that spell at this level.'
  if (
    slot[1] !== 'class-cantrip' &&
    state.authority.rule.schools &&
    !state.privileged &&
    !state.authority.rule.schools.includes(spell.school)
  )
    return 'This spell is outside the schools available for this choice.'
}

function isAvailableDirectPreparedSpell(
  spell: Spell5e,
  spellLevel: number | 'leveled',
  target: string,
) {
  if (
    (spellLevel === 'leveled'
      ? !Number.isInteger(spell.level) || spell.level < 1 || spell.level > 9
      : spell.level !== spellLevel) ||
    (spell.classSpellRouteSource?.input?.targetOccurrences?.length ?? 0) > 1
  )
    return false
  if (target !== CONTACT_PATRON_TARGET && target !== ELDRITCH_HEX_TARGET) return true
  const [checked] = auditSpellRouteMultiplicity([spell])
  return (
    checked.classSpellRouteDiagnostics?.length === 0 &&
    checked.classSpellRouteSource?.input.targetOccurrences.length === 1
  )
}

function isDirectPreparationAtGain(
  grants: ReturnType<typeof getDirectClassPreparedSpellGrants>,
  slot: ManagedClassSpellSlot,
  spell: Spell5e,
) {
  const [owner, domain, , gain] = slot
  return (
    domain === 'class-known' &&
    grants.some(
      (grant) =>
        !grant.sourceReason &&
        grant.owner[1] === owner[1] &&
        grant.owner[2] === owner[2] &&
        grant.level <= gain &&
        getSpellReferenceKey(grant.reference) === getSpellReferenceKey(spell.name, spell.source) &&
        isAvailableDirectPreparedSpell(spell, grant.spellLevel, grant.target),
    )
  )
}

type LearnedSpell = { choice: ManagedClassSpellChoice; spell: Spell5e }

function getSpellbookSpecialtyPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  context: ManagedClassSpellContext | undefined,
  classes: readonly Class5e[],
  learned: readonly LearnedSpell[],
) {
  const rule = getSpellbookSpecialtyRule(slot)
  const entry = getManagedClassSpellOwnerEntry(slot, character.classProgression)
  const cls = classes.filter(
    (row) => norm(row.name) === slot[0][1] && norm(row.source) === slot[0][2],
  )
  const level = slot[3] === 20 ? 3 : slot[4] + 1
  const current =
    rule &&
    entry &&
    entry.levels >= slot[3] &&
    context?.catalogs &&
    cls.length === 1 &&
    permitted(sources(character), rule.source) &&
    isCurrentSpellbookSpecialty(slot, cls[0], context.catalogs)
  const spells = current
    ? learned.flatMap(({ choice, spell }) =>
        choice.slot[1] === 'class-spellbook' &&
        getManagedClassSpellOwnerEntry(choice.slot, character.classProgression) === entry &&
        spell.level === level &&
        (spell.classSpellRouteSource?.input?.targetOccurrences?.length ?? 0) <= 1 &&
        (rule.source !== 'phb' ||
          hasCurrentClassSpellListRoute(character, entry, spell, context)) &&
        (rule.source !== 'xphb' ||
          slot[3] !== 18 ||
          (Array.isArray(spell.time) &&
            spell.time.some((time) => time?.unit === 'action' && time.number === 1)))
          ? [spell]
          : [],
      )
    : []
  return {
    spells,
    defaultReferences: new Set(
      spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: level,
    allowedLevels: [level],
    entry,
    reason: !current ? 'Restore the current Wizard feature and its spellbook.' : undefined,
    schools: undefined,
    privileged: false,
  }
}

const specialtyCastingNote = (slot: ManagedClassSpellSlot) => {
  if (slot[3] === 20)
    return 'Signature Spells — cast at level 3 once per short or long rest without expending a spell slot. Higher-level casting expends a slot.'
  return slot[0][2] === 'phb'
    ? 'Spell Mastery — while prepared, cast at its lowest level without expending a spell slot. Higher-level casting expends a slot.'
    : 'Spell Mastery — always prepared. Cast at its lowest level without expending a spell slot. Higher-level casting expends a slot.'
}

/** Only the effective view receives this overlay. Saved spell profiles keep independent ownership. */
export function applySpellbookSpecialtyPreparation(
  character: Character,
  statuses: readonly ManagedClassSpellStatus[],
): Character {
  const automatic = statuses.filter((status) => status.active && status.specialtyAlwaysPrepared)
  if (!automatic.length) return character
  return {
    ...character,
    spells: {
      ...character.spells,
      spellProfiles: character.spells.spellProfiles.map((profile) => {
        const refs = new Map(
          (profile.alwaysPreparedSpells ?? []).map((ref) => [getSpellReferenceKey(ref), ref]),
        )
        for (const { choice } of automatic) {
          if (!isManagedClassSpellProfile(choice.slot, profile)) continue
          const ref = formatSpellReference(choice.target.name, choice.target.source)
          if (!refs.has(getSpellReferenceKey(ref))) refs.set(getSpellReferenceKey(ref), ref)
        }
        return refs.size > (profile.alwaysPreparedSpells?.length ?? 0)
          ? { ...profile, alwaysPreparedSpells: [...refs.values()] }
          : profile
      }),
    },
  }
}

function getFeaturePreparedSpellPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
  reference?: string,
) {
  const entry = isArcaneDabblerSlot(slot)
    ? getManagedClassSpellOwnerEntry(slot, character.classProgression)
    : undefined
  const rule = entry && getArcaneDabbler(character, entry, currentClasses(character, context))
  const current =
    rule && rule.target === slot[2] && rule.level === slot[3] && slot[4] < rule.count
      ? rule
      : undefined
  const allowed = sources(character)
  const candidates = current ? Object.values(context?.spellsByKey ?? {}) : []
  const targets = reference
    ? new Set([reference])
    : new Set(
        candidates
          .filter(
            (spell) => current?.ranks.includes(spell.level) && permitted(allowed, spell.source),
          )
          .map((spell) => getSpellReferenceKey(spell.name, spell.source)),
      )
  const spells = current
    ? auditSpellRouteMultiplicity(
        candidates.filter((spell) => targets.has(getSpellReferenceKey(spell.name, spell.source))),
      ).filter(
        (spell) =>
          current.ranks.includes(spell.level) &&
          permitted(allowed, spell.source) &&
          spell.classSpellRouteSource?.input.targetOccurrences.length === 1 &&
          !spell.classSpellRouteDiagnostics?.length &&
          spell.classSpellRoutes?.some(
            (route) =>
              matchesJoinedSpellClassFilter(route, current.classes) &&
              [route[2], route[4], ...(route[6] ? [route[6]] : [])].every((source) =>
                permitted(allowed, source),
              ),
          ),
      )
    : []
  return {
    spells,
    defaultReferences: new Set(
      spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: current ? Math.max(...current.ranks) : 0,
    allowedLevels: current?.ranks ?? [],
    reason: current
      ? undefined
      : 'Restore the current Arcane Dabbler rules or clear the saved spell.',
    schools: undefined,
    privileged: false,
    featureName: ARCANE_DABBLER,
    entry,
    rule: current,
  }
}

/** Picker and command share all hard bounds; the explicit bypass changes only default list membership. */
export function getManagedClassSpellPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  sourceContext?: ManagedClassSpellContext,
  projectedStatuses?: readonly ManagedClassSpellStatus[],
) {
  if (slot[1] === 'feature-cantrip')
    return getSelectedFeatureCantripPool(character, slot, sourceContext)
  if (slot[1] === 'feature-prepared')
    return getFeaturePreparedSpellPool(character, slot, sourceContext)
  if (slot[1] === 'class-spellbook-specialty') {
    const targets = new Map(
      Object.values(sourceContext?.spellsByKey ?? {}).map(
        (spell) => [getSpellReferenceKey(spell.name, spell.source), spell] as const,
      ),
    )
    const statuses =
      projectedStatuses ?? projectManagedClassSpellState(character, sourceContext).statuses
    const learned = statuses.flatMap(({ choice, active }) => {
      if (!active || choice.slot[1] !== 'class-spellbook') return []
      const spell = targets.get(getSpellReferenceKey(choice.target.name, choice.target.source))
      return spell ? [{ choice, spell }] : []
    })
    return getSpellbookSpecialtyPool(
      character,
      slot,
      sourceContext,
      currentClasses(character, sourceContext),
      learned,
    )
  }
  const context = sourceContext?.catalogs
    ? { ...sourceContext, catalogs: { ...sourceContext.catalogs } }
    : sourceContext
  const classes = currentClasses(character, context)
  const state = resolveSlot(character, slot, context, classes)
  if (typeof state === 'string')
    return {
      spells: [] as Spell5e[],
      defaultReferences: new Set<string>(),
      maxSpellLevel: 0,
      allowedLevels: [] as number[],
      reason: state,
      schools: undefined,
      privileged: false,
    }
  const allowed = sources(character)
  const targets = new Map<string, Spell5e | undefined>()
  const optionalFixed = getOptionalClassFixedSpellNamesAtGain(character, slot, context?.catalogs)
  const directPrepared =
    slot[1] === 'class-known'
      ? getDirectClassPreparedSpellGrants(character, classes, context?.catalogs)
      : []
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getSpellReferenceKey(spell.name, spell.source)
    targets.set(key, targets.has(key) ? undefined : spell)
  }
  const spells = [...targets.values()].flatMap((spell) =>
    spell &&
    permitted(allowed, spell.source) &&
    !targetError(spell, slot, state) &&
    (!state.arcana || hasDefaultManagedSpellRoute(character, spell, slot, state, context)) &&
    !isDirectPreparationAtGain(directPrepared, slot, spell) &&
    !optionalFixed.has(getSpellNameKey(spell.name))
      ? [spell]
      : [],
  )
  return {
    spells,
    defaultReferences: new Set(
      spells
        .filter(
          (spell) =>
            state.arcana || hasDefaultManagedSpellRoute(character, spell, slot, state, context),
        )
        .map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: state.arcanaRank ?? state.authority.maxSpellLevel,
    allowedLevels: state.arcanaRank
      ? [state.arcanaRank]
      : state.savant
        ? state.savant.levels
        : slot[1] === 'class-cantrip'
          ? [0]
          : slot[1] === 'class-arcanum'
            ? [state.authority.maxSpellLevel]
            : state.lore || state.secrets === 'phb'
              ? Array.from({ length: state.authority.maxSpellLevel + 1 }, (_, level) => level)
              : Array.from({ length: state.authority.maxSpellLevel }, (_, index) => index + 1),
    reason: undefined,
    schools: state.savant ? [state.savant.school] : state.authority.rule.schools,
    privileged: state.privileged,
  }
}

/** Pure shared projection. Saved tags are stripped before current authority grants any benefit. */
export function projectManagedClassSpellState(
  character: Character,
  sourceContext?: ManagedClassSpellContext,
  dailyIntentSource: Character = character,
  newManagedSpellIds?: ReadonlySet<string>,
) {
  const context = sourceContext?.catalogs
    ? { ...sourceContext, catalogs: { ...sourceContext.catalogs } }
    : sourceContext
  const invalid = getInvalidManagedClassSpellPaths(character).length > 0
  const stripped = stripManagedClassSpellState(character)
  const allowed = sources(character)
  const classes = currentClasses(character, context)
  const directPrepared = getDirectClassPreparedSpellGrants(character, classes, context?.catalogs)
  const classMap = new Map(classes.map((row) => [toClassProfileId(row.name, row.source), row]))
  const targets = new Map<string, Spell5e | undefined>()
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getEntityLookupKey(spell.name, spell.source).toLowerCase()
    targets.set(key, targets.has(key) ? undefined : spell)
  }
  const visibleSpells = [...targets.entries()].filter(
    ([, spell]) => spell && permitted(allowed, spell.source),
  )
  const availableSpellReferences = new Set(visibleSpells.map(([key]) => key))
  const visibleSpellLevels = new Map(
    visibleSpells.flatMap(([key, spell]) =>
      spell && (spell.classSpellRouteSource?.input?.targetOccurrences.length ?? 0) <= 1
        ? [[key, spell.level] as const]
        : [],
    ),
  )
  const inheritedDomain = character.classProgression.some(isRevisedInheritedDomainOwner)
  const includedDomainReprints = inheritedDomain
    ? getIncludedDomainSpellReprints(context?.oathSpellSourceByKey)
    : undefined
  const oathReprints =
    inheritedDomain ||
    character.classProgression.some(
      (entry) =>
        isRevisedInheritedOathOwner(entry) ||
        isRevisedInheritedRangerSpellOwner(entry) ||
        isRevisedAncestralGuardian(entry) ||
        (norm(entry.name) === 'monk' &&
          norm(entry.source) === 'xphb' &&
          norm(entry.subclass) === 'way of the sun soul') ||
        (norm(entry.name) === 'fighter' &&
          norm(entry.source) === 'xphb' &&
          norm(entry.subclass) === 'psi warrior' &&
          norm(entry.subclassSource) === 'tce'),
    )
      ? getCurrentOathSpellReprints(context?.oathSpellSourceByKey)
      : undefined
  const base = {
    ...stripped,
    spells: {
      ...stripped.spells,
      spellProfiles: ensureSpellProfiles(stripped, classMap, undefined, {
        availableSpellReferences,
        visibleSpellLevels,
        oathReprints,
        includedDomainReprints,
        classChoiceFeatureCatalogs: context?.catalogs,
      }),
    },
  }
  const statuses: ManagedClassSpellStatus[] = []
  const accesses = new Map<ClassCastingCatalog, ReturnType<typeof createClassCastingSourceAccess>>()
  const gainAuthority: typeof getClassCastingGainAuthority = (catalog, ...args) => {
    let access = accesses.get(catalog)
    if (!access) {
      access = createClassCastingSourceAccess(catalog)
      accesses.set(catalog, access)
    }
    return access.gain(...args)
  }
  const active: Array<{
    choice: ManagedClassSpellChoice
    spell: Spell5e
    entry: CharacterClassEntry
    authority: NonNullable<ReturnType<typeof getClassCastingLevelAccess>>
  }> = []
  const featurePools = new Map<string, ReturnType<typeof getSelectedFeatureCantripPool>>()
  for (const choice of character.managedClassSpellChoices ?? []) {
    const status: ManagedClassSpellStatus = { choice, active: false }
    statuses.push(status)
    const deny = (reason: string) => {
      status.reason = reason
    }
    if (
      choice.slot[1] === 'feature-cantrip' ||
      choice.slot[1] === 'feature-prepared' ||
      choice.slot[1] === 'class-spellbook-specialty'
    )
      continue
    const state = invalid
      ? 'The saved class spell ownership is invalid.'
      : resolveSlot(character, choice.slot, context, classes, gainAuthority)
    if (typeof state === 'string') {
      deny(state)
      continue
    }
    const { entry, authority } = state
    const spell = targets.get(getSpellReferenceKey(choice.target.name, choice.target.source))
    if (
      !spell ||
      getSpellReferenceKey(spell.name, spell.source) !==
        getSpellReferenceKey(choice.target.name, choice.target.source) ||
      !permitted(allowed, spell.source)
    ) {
      deny('Restore the exact selected spell printing.')
      continue
    }
    const saved = !newManagedSpellIds?.has(managedClassSpellId(choice.slot))
    const constraint =
      targetError(spell, choice.slot, state, saved) ??
      (!saved && isDirectPreparationAtGain(directPrepared, choice.slot, spell)
        ? 'Choose another spell; this class already grants that spell at this level.'
        : undefined)
    if (constraint) {
      deny(constraint)
      continue
    }
    if (
      (state.lore || state.arcana || choice.policy !== 'ignore-class-list') &&
      !hasDefaultManagedSpellRoute(character, spell, choice.slot, state, context)
    ) {
      deny('Restore this spell list or its optional feature selection.')
      continue
    }
    status.active = true
    if (choice.slot[1] === 'class-arcanum')
      status.castingNote =
        'Mystic Arcanum — once per long rest, without expending a spell slot. Uses are not tracked.'
    active.push({ choice, spell, entry, authority })
  }
  // Saved fixed tags are intent, just like saved profile cells. Only the current
  // selected provider and exact visible target can contribute to the shared view.
  let provenance = {
    ...base.provenance,
    spells: Object.fromEntries(
      Object.entries(base.provenance.spells).flatMap(([name, tags]) => {
        const kept = tags.filter(
          (tag) =>
            !(
              tag.grantType === 'fixed' &&
              (tag.sourceType === 'class' || tag.sourceType === 'subclass')
            ),
        )
        return kept.length ? [[name, kept]] : []
      }),
    ),
  }
  const fixedClassSpellStatuses: ClassFixedSpellStatus[] = []
  const emptyBody = getEmptyBodySpell(getCurrentMonkBaseRules(character, context?.catalogs))
  if (emptyBody) {
    const rank = visibleSpellLevels.get(getSpellReferenceKey(emptyBody.reference)) ?? 0
    fixedClassSpellStatuses.push({
      ...emptyBody,
      owner: ['class', 'monk', 'phb'],
      prepared: false,
      active: rank > 0,
    })
  }
  const disciplineRoutes =
    character.classProgression.some(
      (row) => norm(row.name) === 'monk' && norm(row.subclass) === 'way of the four elements',
    ) && context?.catalogs
      ? getEffectiveClassChoiceFeatureRoutes(character, context.catalogs, {
          effectiveAbilityScores: context.abilityScores,
          effectiveSpellProfiles: context.independentSpellProfiles,
        }).selectedOptions
      : []
  const isRevisedWarlock = (entry: CharacterClassEntry) =>
    norm(entry.name) === 'warlock' && norm(entry.source) === 'xphb'
  const warlocks = character.classProgression.filter(isRevisedWarlock)
  const warlock = warlocks.length === 1 ? warlocks[0] : undefined
  const invocationTargets = new Map<string, Map<string, Spell5e>>()
  const addInvocationTarget = (entry: CharacterClassEntry, spell: Spell5e) => {
    const id = getInvocationActorKey(entry)
    const prior = invocationTargets.get(id) ?? new Map<string, Spell5e>()
    prior.set(getSpellReferenceKey(spell.name, spell.source), spell)
    invocationTargets.set(id, prior)
  }
  for (const { choice, spell, entry } of active) {
    if (
      choice.slot[1] === 'class-cantrip' &&
      inheritsRevisedInvocations(entry, context?.catalogs?.classCastingSources) &&
      hasCurrentClassSpellListRoute(character, entry, spell, context ?? {}, { directOnly: true })
    )
      addInvocationTarget(entry, spell)
  }
  for (const entry of character.classProgression) {
    if (!entry.subclass) continue
    const land = isCircleOfTheLand(entry.name, entry.source, entry.subclass, entry.subclassSource)
    const namedPreparation = land || isVestigePatron(entry)
    const cls = classMap.get(toClassProfileId(entry.name, entry.source))
    const celestialCantrips =
      entry === warlock &&
      cls &&
      context?.catalogs &&
      hasCurrentCelestialInvocationCantrips(
        cls,
        entry,
        scopeClassChoiceFeatureCatalogs(
          context.catalogs,
          getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
        ),
      )
    const grants = getEarnedSubclassSpellGrants(cls, entry, entry.levels, {
      selections: character.classChoiceSelections,
      spells: visibleSpellLevels,
      character,
      catalogs: context?.catalogs,
    })
    const disciplines = disciplineRoutes.flatMap(({ choice, selection, option }) => {
      if (
        !choice.fixedOptions?.length ||
        !findClassReference(entry, [{ name: selection.className, source: selection.classSource }])
      )
        return []
      const candidates = context?.catalogs?.optionalFeatures?.filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
      return candidates?.length === 1
        ? (getElementalDisciplineSpells(candidates[0], option.slotLevel, choice, classes) ?? [])
        : []
    })
    for (const grant of [...(grants ?? []), ...disciplines]) {
      if (grant.mode === 'expanded') continue
      const castOnly = grant.mode === 'cast-only'
      const active = hasCurrentSubclassSpellGrant(
        grant,
        namedPreparation ? visibleSpellLevels : availableSpellReferences,
        visibleSpellLevels,
        oathReprints,
        includedDomainReprints,
        grant.requiresSpellTrigger ? targets.get(getSpellReferenceKey(grant.spellName)) : undefined,
      )
      if (
        (!active && (namedPreparation || grant.feature)) ||
        (active && grant.feature?.castingNote)
      )
        fixedClassSpellStatuses.push({
          owner: [
            'subclass',
            norm(entry.name),
            norm(entry.source),
            norm(entry.subclass),
            norm(entry.subclassSource),
          ],
          target:
            grant.feature?.target ??
            (land ? 'circle-of-the-land-terrain' : 'vestige-patron-domain'),
          featureName: grant.feature?.name ?? (land ? 'Circle of the Land' : 'Vestige Spells'),
          level: grant.level,
          reference: grant.spellName,
          prepared: grant.mode === 'prepared' || grant.mode === 'innate',
          active,
          ...(castOnly && { castOnly: grant.castOnly }),
          ...(active && grant.feature?.castingNote && { castingNote: grant.feature.castingNote }),
        })
      if (!active || castOnly) continue
      if (celestialCantrips && grant.mode === 'known' && grant.isCantrip) {
        const spellKey = getSpellReferenceKey(grant.spellName)
        const spell = targets.get(spellKey)
        if (spell?.level === 0) {
          const [checked] = auditSpellRouteMultiplicity([spell])
          if (
            checked.classSpellRouteSource?.input?.targetOccurrences?.length === 1 &&
            checked.classSpellRouteDiagnostics?.length === 0
          )
            addInvocationTarget(entry, checked)
        }
      }
      provenance = addSpellGrant(provenance, grant.spellName, {
        ...makeSourceTag('subclass', entry.subclass, 'fixed', entry.subclassSource),
        grantSource: parseSpellReference(grant.spellName).source,
        ...(grant.namedChoice && {
          grantVariant: JSON.stringify([
            entry.name,
            entry.source,
            entry.subclass,
            entry.subclassSource,
            grant.feature?.target,
            grant.level,
          ]),
        }),
      })
    }
  }
  let profiles = base.spells.spellProfiles
  const artificer = getCurrentArtificerRules(character, context?.catalogs)
  const artificerCantrip = getArtificerGrantedCantrip(artificer)
  const grants = [
    ...(artificer && artificerCantrip
      ? [
          {
            grant: {
              owner: ['class', norm(artificer.owner.name), norm(artificer.owner.source)],
              target: artificerCantrip.feature.target,
              featureName: artificerCantrip.feature.name,
              level: artificerCantrip.feature.level,
              reference: artificerCantrip.reference,
            } satisfies ClassFixedSpellGrant,
            cantrip: true,
            spellLevel: undefined,
            castingNote: undefined,
            sourceReason: undefined,
          },
        ]
      : []),
    ...getOptionalClassFixedSpellGrants(character, context?.catalogs).map((grant) => ({
      grant,
      cantrip: false,
      spellLevel: undefined,
      castingNote: undefined,
      sourceReason: undefined,
    })),
    ...directPrepared.map(({ spellLevel, castingNote, sourceReason, ...grant }) => ({
      grant,
      cantrip: false,
      spellLevel,
      castingNote,
      sourceReason,
    })),
  ]
  for (const { grant, cantrip, spellLevel, castingNote, sourceReason } of grants) {
    const prepared = spellLevel !== undefined
    const spell = targets.get(getSpellReferenceKey(grant.reference))
    const reason =
      sourceReason ??
      (!spell ||
      !permitted(allowed, spell.source) ||
      (cantrip && spell.level !== 0) ||
      (prepared && !isAvailableDirectPreparedSpell(spell, spellLevel, grant.target))
        ? 'Restore the exact spell printing from the enabled content.'
        : undefined)
    fixedClassSpellStatuses.push({
      ...grant,
      prepared,
      active: !reason,
      ...(reason ? { reason } : {}),
      ...(!reason && castingNote && { castingNote }),
    })
    if (reason) continue
    const entry = character.classProgression.find(
      (entry) => norm(entry.name) === grant.owner[1] && norm(entry.source) === grant.owner[2],
    )
    if (!entry) continue
    const add = (references: string[]) =>
      references.some(
        (reference) => getSpellReferenceKey(reference) === getSpellReferenceKey(grant.reference),
      )
        ? references
        : [...references, grant.reference]
    profiles = profiles.map((profile) =>
      profile.id === toClassProfileId(entry.name, entry.source)
        ? {
            ...profile,
            ...(cantrip
              ? { cantrips: add(profile.cantrips) }
              : { spellsKnown: add(profile.spellsKnown) }),
            fixedSpells: add(profile.fixedSpells ?? []),
            ...(prepared && { alwaysPreparedSpells: add(profile.alwaysPreparedSpells ?? []) }),
          }
        : profile,
    )
    const tag =
      grant.owner[0] === 'subclass'
        ? makeSourceTag(
            'subclass',
            entry.subclass ?? grant.owner[3],
            'fixed',
            entry.subclassSource ?? grant.owner[4],
          )
        : makeSourceTag('class', entry.name, 'fixed', entry.source)
    provenance = addSpellGrant(provenance, grant.reference, {
      ...tag,
      label: grant.featureName,
      grantSource: parseSpellReference(grant.reference).source,
      grantVariant: JSON.stringify([
        prepared ? 'class-prepared-spell' : 'optional-class-spell',
        grant.owner,
        grant.target,
        grant.level,
      ]),
    })
  }
  const addManagedGrant = (
    choice: ManagedClassSpellChoice,
    entry: CharacterClassEntry,
    field: 'cantrips' | 'spellsKnown',
    automatic: boolean,
    featureName?: string,
  ) => {
    const reference = formatSpellReference(choice.target.name, choice.target.source)
    const add = (refs: string[] = []) =>
      refs.some((row) => getSpellReferenceKey(row) === getSpellReferenceKey(reference))
        ? refs
        : [...refs, reference]
    profiles = profiles.map((profile) => {
      if (profile.id !== toClassProfileId(entry.name, entry.source)) return profile
      const spells = add(profile[field])
      if (!automatic && spells === profile[field]) return profile
      return {
        ...profile,
        [field]: spells,
        ...(automatic && { alwaysPreparedSpells: add(profile.alwaysPreparedSpells) }),
      }
    })
    provenance = addSpellGrant(
      provenance,
      reference,
      makeManagedClassSpellTag(choice, entry, featureName),
    )
  }
  for (const { choice, spell, entry, authority } of active) {
    const lore = getBardLoreSpellRule(choice.slot)
    addManagedGrant(
      choice,
      entry,
      spell.level === 0 ? 'cantrips' : 'spellsKnown',
      (lore?.source === 'xphb' && spell.level > 0) || !!getClericArcanaSpellRule(choice.slot),
      choice.slot[1] === 'class-arcanum' ? authority.declaration.feature.name : undefined,
    )
  }
  for (const status of statuses.filter(({ choice }) => choice.slot[1] === 'feature-prepared')) {
    const { choice } = status
    const reference = getSpellReferenceKey(choice.target.name, choice.target.source)
    const pool = getFeaturePreparedSpellPool(character, choice.slot, context, reference)
    const spell = pool.spells.find(
      (row) => getSpellReferenceKey(row.name, row.source) === reference,
    )
    const cost = spell && pool.rule?.costs.find((row) => row.rank === spell.level)?.cost
    if (invalid || !pool.entry || !spell || cost === undefined || choice.policy !== 'default') {
      status.reason = invalid
        ? 'The saved class spell ownership is invalid.'
        : (pool.reason ?? 'Restore the exact spell in the current Arcane Dabbler filter.')
      continue
    }
    status.active = true
    status.castingNote = `Arcane Dabbler. This spell is always prepared. Create a level ${spell.level} slot as a Bonus Action for ${cost} Psi Points, subject to your Psi Limit. The slot expires after use or a Long Rest. Spellcasting ability is unspecified.`
    addManagedGrant(choice, pool.entry, 'spellsKnown', true, ARCANE_DABBLER)
  }
  // Specialty choices borrow learned entries. They never materialize another grant or fulfill their own eligibility.
  const automaticByOwner = new Map<CharacterClassEntry, Set<string>>()
  for (const status of statuses) {
    const { choice } = status
    if (choice.slot[1] !== 'class-spellbook-specialty') continue
    const pool = getSpellbookSpecialtyPool(character, choice.slot, context, classes, active)
    const key = getSpellReferenceKey(choice.target.name, choice.target.source)
    if (invalid || !pool.entry || !pool.defaultReferences.has(key)) {
      status.reason = invalid
        ? 'The saved class spell ownership is invalid.'
        : (pool.reason ?? 'Restore the eligible learned spell in this Wizard’s spellbook.')
      continue
    }
    status.active = true
    status.castingNote = specialtyCastingNote(choice.slot)
    if (choice.slot[3] === 20 || choice.slot[0][2] === 'xphb') {
      status.specialtyAlwaysPrepared = true
      const keys = automaticByOwner.get(pool.entry) ?? new Set<string>()
      keys.add(key)
      automaticByOwner.set(pool.entry, keys)
    }
  }
  // Learned preparation requests reserve capacity in stable gain/ordinal order, even if source-dormant.
  for (const entry of character.classProgression) {
    const automatic = automaticByOwner.get(entry)
    const isAutomatic = (choice: ManagedClassSpellChoice) =>
      automatic?.has(getSpellReferenceKey(choice.target.name, choice.target.source)) === true
    const requested = (character.managedClassSpellChoices ?? [])
      .filter((choice) => choice.prepare && getManagedClassSpellOwnerEntry(choice.slot, [entry]))
      .sort(
        (a, b) =>
          a.slot[3] - b.slot[3] ||
          a.slot[4] - b.slot[4] ||
          managedClassSpellId(a.slot).localeCompare(managedClassSpellId(b.slot)),
      )
    if (!requested.length) continue
    const first = active.find(
      (row) => row.entry === entry && row.choice.slot[1] === 'class-spellbook',
    )
    const ability =
      first && normalizeAbilityName(first.authority.effective.spellcastingAbility ?? '')
    const score = ability && context?.abilityScores?.[ability]
    const capacity =
      first && typeof score === 'number'
        ? getClassPreparationLimit(
            first.authority.rule.preparation,
            entry.levels,
            getAbilityModifier(score),
          )
        : null
    const profile = profiles.find((row) => row.id === toClassProfileId(entry.name, entry.source))
    const independent =
      profile?.preparedSpells.filter(
        (reference) =>
          !profile.alwaysPreparedSpells?.some(
            (fixed) => getSpellReferenceKey(fixed) === getSpellReferenceKey(reference),
          ),
      ).length ?? 0
    const eligible = new Set(
      requested
        .filter((choice) => !isAutomatic(choice))
        .slice(0, Math.max(0, (capacity ?? 0) - independent))
        .map((choice) => managedClassSpellId(choice.slot)),
    )
    for (const status of statuses.filter(
      (row) => row.choice.prepare && getManagedClassSpellOwnerEntry(row.choice.slot, [entry]),
    )) {
      const automaticPreparation = isAutomatic(status.choice)
      status.prepared =
        status.active &&
        (automaticPreparation || eligible.has(managedClassSpellId(status.choice.slot)))
      if (!status.prepared || automaticPreparation) continue
      const reference = formatSpellReference(status.choice.target.name, status.choice.target.source)
      profiles = profiles.map((row) =>
        row.id === profile?.id &&
        !row.preparedSpells.some(
          (target) => getSpellReferenceKey(target) === getSpellReferenceKey(reference),
        )
          ? { ...row, preparedSpells: [...row.preparedSpells, reference] }
          : row,
      )
    }
  }
  const daily = projectDailyClassSpellIntent(
    dailyIntentSource,
    {
      ...base,
      provenance,
      spells: { ...base.spells, spellProfiles: profiles },
    },
    context,
  )
  // Qualify feature grants only after rebuilding every independent spell provider.
  const independentSpellProfiles = daily.character.spells.spellProfiles
  profiles = independentSpellProfiles
  provenance = daily.character.provenance
  for (const entry of character.classProgression) {
    const rule = getWizardIllusionCantripOwner(entry)
    const id = toClassProfileId(entry.name, entry.source)
    const cls = classMap.get(id)
    if (
      !rule ||
      !cls ||
      entry.levels < rule.level ||
      !hasCurrentWizardIllusionCantrip(cls, rule) ||
      knowsIndependentMinorIllusion(character, rule, independentSpellProfiles)
    )
      continue

    const reference = formatSpellReference('Minor Illusion', cls.source)
    if (visibleSpellLevels.get(getSpellReferenceKey(reference)) !== 0) continue
    profiles = profiles.map((profile) => {
      if (profile.id !== id) return profile
      const cantrips = profile.cantrips.some(
        (spell) => getSpellReferenceKey(spell) === getSpellReferenceKey(reference),
      )
        ? profile.cantrips
        : [...profile.cantrips, reference]
      return { ...profile, cantrips, fixedSpells: [...(profile.fixedSpells ?? []), reference] }
    })
    provenance = addSpellGrant(provenance, reference, {
      ...makeSourceTag('subclass', entry.subclass ?? rule.subclass, 'fixed', entry.subclassSource),
      grantSource: cls.source,
    })
  }
  for (const status of statuses.filter((row) => row.choice.slot[1] === 'feature-cantrip')) {
    const { choice } = status
    const deny = (reason: string) => {
      status.reason = reason
    }
    const key = JSON.stringify(choice.slot.slice(0, 4))
    let pool = featurePools.get(key)
    if (!pool) {
      pool = getSelectedFeatureCantripPool(
        character,
        [choice.slot[0], choice.slot[1], choice.slot[2], choice.slot[3], 0],
        { ...context, independentSpellProfiles },
      )
      featurePools.set(key, pool)
    }
    const entry = getManagedClassSpellOwnerEntry(choice.slot, character.classProgression)
    if (invalid || !entry || pool.reason) {
      deny(
        invalid
          ? 'The saved class spell ownership is invalid.'
          : (pool.reason ?? 'Restore the class owner.'),
      )
      continue
    }
    if (choice.slot[4] >= pool.count) {
      deny('This choice exceeds the feature’s current count.')
      continue
    }
    if (
      !pool.spells.some(
        (spell) =>
          getSpellReferenceKey(spell.name, spell.source) ===
          getSpellReferenceKey(choice.target.name, choice.target.source),
      )
    ) {
      deny('Restore the exact selected cantrip printing and its current feature spell list.')
      continue
    }
    status.active = true
    if (pool.featureName === 'Giant Power')
      status.castingNote = 'Giant Power: Wisdom is your spellcasting ability for this cantrip.'
    if (pool.featureName === 'Arcane Archer Lore' && choice.slot[0][4] === 'au')
      status.castingNote =
        'Arcane Archer Lore: Intelligence is your spellcasting ability for this cantrip.'
    const reference = formatSpellReference(choice.target.name, choice.target.source)
    profiles = profiles.map((profile) =>
      profile.id === toClassProfileId(entry.name, entry.source) &&
      !profile.cantrips.some(
        (target) => getSpellReferenceKey(target) === getSpellReferenceKey(reference),
      )
        ? { ...profile, cantrips: [...profile.cantrips, reference] }
        : profile,
    )
    provenance = addSpellGrant(
      provenance,
      reference,
      makeManagedClassSpellTag(choice, entry, pool.featureName),
    )
  }
  const lightDomain = character.classProgression.filter(
    (entry) =>
      norm(entry.name) === 'cleric' &&
      norm(entry.source) === 'phb' &&
      norm(entry.subclass) === 'light domain' &&
      norm(entry.subclassSource) === 'phb' &&
      entry.levels >= 1,
  )
  const lightClassProfileId = toClassProfileId('Cleric', 'PHB')
  const lightClass = classMap.get(lightClassProfileId)
  const lightSources = lightClass?.subclasses?.filter(
    (subclass) => subclass.name === 'Light Domain' && subclass.source === 'PHB',
  )
  if (
    lightDomain.length === 1 &&
    lightClass &&
    lightSources?.length === 1 &&
    visibleSpellLevels.get('light|phb') === 0 &&
    hasClassicLightBonusCantrip(lightClass, lightSources[0]) &&
    !profiles.some((profile) =>
      profile.cantrips.some((reference) => getSpellNameKey(reference) === 'light'),
    )
  ) {
    const reference = 'Light|PHB'
    profiles = profiles.map((profile) =>
      profile.id === lightClassProfileId
        ? {
            ...profile,
            cantrips: [...profile.cantrips, reference],
            fixedSpells: [...(profile.fixedSpells ?? []), reference],
          }
        : profile,
    )
    provenance = addSpellGrant(provenance, reference, {
      ...makeSourceTag('subclass', 'Light Domain', 'fixed', 'PHB'),
      grantSource: 'PHB',
    })
  }
  const warlockProfile = profiles.find(
    (profile) => profile.id === toClassProfileId('Warlock', 'XPHB'),
  )
  const charisma = context?.abilityScores?.charisma
  const mistyStep = getSpellReferenceKey(STEPS_OF_THE_FEY_SPELL)
  if (
    warlock &&
    character.originSystem === '2024' &&
    charisma !== undefined &&
    context?.catalogs &&
    visibleSpellLevels.get(mistyStep) === 2 &&
    warlockProfile?.spellsKnown.some((reference) => getSpellReferenceKey(reference) === mistyStep)
  ) {
    const cls = classMap.get(warlockProfile.id)
    const steps = cls && getCurrentStepsOfTheFey(cls, warlock, context.catalogs)
    if (steps) {
      const count = Math.max(1, getAbilityModifier(charisma))
      fixedClassSpellStatuses.push({
        owner: ['subclass', 'warlock', 'xphb', 'archfey patron', 'xphb'],
        target: STEPS_OF_THE_FEY_TARGET,
        featureName: steps.name,
        level: 3,
        reference: STEPS_OF_THE_FEY_SPELL,
        prepared: false,
        active: true,
        castingNote: `Steps of the Fey: ${count} slot-free ${count === 1 ? 'cast' : 'casts'}. Regain all uses on a Long Rest.`,
      })
    }
  }
  return {
    character: {
      ...daily.character,
      provenance,
      spells: { ...daily.character.spells, spellProfiles: profiles },
    },
    independentSpellProfiles,
    knownWarlockCantrips: new Map(
      [...invocationTargets].map(([id, rows]) => [id, [...rows.values()]]),
    ),
    statuses,
    dailyStatuses: daily.statuses,
    fixedClassSpellStatuses,
  }
}
