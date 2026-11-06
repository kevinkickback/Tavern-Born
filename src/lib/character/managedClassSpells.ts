import {
  currentClasses,
  hasCurrentClassSpellListRoute,
  type ManagedClassSpellContext,
  permitted,
  sources,
} from './classSpellAuthority'

export type { ManagedClassSpellContext } from './classSpellAuthority'

import { isCircleOfTheLand } from '@/lib/5etools/circleOfTheLand'
import {
  getClassSpellProfilePolicy,
  getManagedClassSpellRule,
} from '@/lib/5etools/classCastingRules'
import {
  type ClassCastingCatalog,
  createClassCastingSourceAccess,
  getClassCastingGainAuthority,
} from '@/lib/5etools/classCastingSource'
import { getEntityLookupKey } from '@/lib/5etools/entityIdentity'
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
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
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
import { renderEntriesToText } from '@/lib/entryText'
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
import {
  getManagedClassSpellOwnerEntry,
  isManagedClassSpellProfile,
  makeManagedClassSpellTag,
  managedClassSpellId,
} from './managedClassSpellIdentity'
import { stripManagedClassSpellState } from './managedClassSpellState'
import {
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
  if (slot[1] === 'feature-cantrip' || slot[1] === 'class-spellbook-specialty')
    return 'Use this selected feature’s spell choices.'
  const savantGain = getSavantSpellbookGain(slot)
  const entry = getManagedClassSpellOwnerEntry(slot, character.classProgression)
  const rule =
    savantGain && entry
      ? getClassSpellProfilePolicy({ name: entry.name, source: entry.source, levels: entry.levels })
          .rule
      : getManagedClassSpellRule(slot)?.rule
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
  const authority = gainAuthority(
    catalog,
    rule.declaration.owner,
    rule.declaration.target,
    rule.declaration.level,
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
  const classData = classes.find(
    (row) => norm(row.name) === norm(entry.name) && norm(row.source) === norm(entry.source),
  )
  const savant = savantGain && classData && getCurrentSavantSpellbookGrant(slot, classData, catalog)
  if (savantGain && (!savant || authority.maxSpellLevel !== savantGain.tier))
    return 'Restore the current Evocation Savant feature and its spellbook schedule.'
  const fixedAtGain = getEarnedSubclassSpellGrants(classData, entry, slot[3], {
    selections: character.classChoiceSelections,
  })
  if (!fixedAtGain) return 'Restore the selected subclass and its earned spell grants.'
  const privileged =
    slot[1] === 'class-known' &&
    slot[4] === 0 &&
    authority.rule.unrestrictedGains?.includes(slot[3]) === true
  return { entry, authority, fixedAtGain, privileged, savant, allowed }
}

function targetError(
  spell: Spell5e,
  slot: ManagedClassSpellSlot,
  state: Exclude<ReturnType<typeof resolveSlot>, string>,
  saved = false,
) {
  if (
    slot[1] === 'class-cantrip'
      ? spell.level !== 0
      : slot[1] === 'class-arcanum'
        ? spell.level !== state.authority.maxSpellLevel
        : spell.level < 1 || spell.level > state.authority.maxSpellLevel
  )
    return 'This spell is outside the level available for this choice.'
  const savant = state.savant
  if (savant) {
    if (!savant.levels.includes(spell.level) || spell.school !== savant.school)
      return 'Choose an Evocation spell of an eligible level for this gain.'
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
      isCircleOfTheLand(
        state.entry.name,
        state.entry.source,
        state.entry.subclass ?? '',
        state.entry.subclassSource,
      )
    ) &&
    state.fixedAtGain.some(
      (grant) =>
        grant.mode !== 'expanded' &&
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

function isAvailableDirectPreparedSpell(spell: Spell5e, spellLevel: number, target: string) {
  if (
    spell.level !== spellLevel ||
    (spell.classSpellRouteSource?.input?.targetOccurrences?.length ?? 0) > 1
  )
    return false
  if (target !== CONTACT_PATRON_TARGET) return true
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

/** Picker and command share all hard bounds; the explicit bypass changes only default list membership. */
export function getManagedClassSpellPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  sourceContext?: ManagedClassSpellContext,
) {
  if (slot[1] === 'feature-cantrip')
    return getSelectedFeatureCantripPool(character, slot, sourceContext)
  if (slot[1] === 'class-spellbook-specialty') {
    const targets = new Map(
      Object.values(sourceContext?.spellsByKey ?? {}).map(
        (spell) => [getSpellReferenceKey(spell.name, spell.source), spell] as const,
      ),
    )
    const learned = projectManagedClassSpellState(character, sourceContext).statuses.flatMap(
      ({ choice, active }) => {
        if (!active || choice.slot[1] !== 'class-spellbook') return []
        const spell = targets.get(getSpellReferenceKey(choice.target.name, choice.target.source))
        return spell ? [{ choice, spell }] : []
      },
    )
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
            !!state.savant ||
            hasCurrentClassSpellListRoute(character, state.entry, spell, context ?? {}, {
              owner: slot[0],
              requestedTarget: slot[2],
            }),
        )
        .map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: state.authority.maxSpellLevel,
    allowedLevels: state.savant
      ? state.savant.levels
      : slot[1] === 'class-cantrip'
        ? [0]
        : slot[1] === 'class-arcanum'
          ? [state.authority.maxSpellLevel]
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
  const base = {
    ...stripped,
    spells: {
      ...stripped.spells,
      spellProfiles: ensureSpellProfiles(stripped, classMap, undefined, {
        availableSpellReferences,
        visibleSpellLevels,
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
    authority: NonNullable<ReturnType<typeof getClassCastingGainAuthority>>
  }> = []
  const featurePools = new Map<string, ReturnType<typeof getSelectedFeatureCantripPool>>()
  for (const choice of character.managedClassSpellChoices ?? []) {
    const status: ManagedClassSpellStatus = { choice, active: false }
    statuses.push(status)
    const deny = (reason: string) => {
      status.reason = reason
    }
    if (choice.slot[1] === 'feature-cantrip' || choice.slot[1] === 'class-spellbook-specialty')
      continue
    const state = invalid
      ? 'The saved class spell ownership is invalid.'
      : resolveSlot(character, choice.slot, context, classes, gainAuthority)
    if (typeof state === 'string') {
      deny(state)
      continue
    }
    const { entry, authority } = state
    const owner = choice.slot[0]
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
      !state.savant &&
      choice.policy !== 'ignore-class-list' &&
      !hasCurrentClassSpellListRoute(character, entry, spell, context ?? {}, {
        owner,
        requestedTarget: choice.slot[2],
      })
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
  for (const entry of character.classProgression) {
    if (!entry.subclass) continue
    const land = isCircleOfTheLand(entry.name, entry.source, entry.subclass, entry.subclassSource)
    const grants = getEarnedSubclassSpellGrants(
      classMap.get(toClassProfileId(entry.name, entry.source)),
      entry,
      entry.levels,
      { selections: character.classChoiceSelections, spells: visibleSpellLevels },
    )
    for (const grant of grants ?? []) {
      if (grant.mode === 'expanded') continue
      const spellKey = getSpellReferenceKey(grant.spellName)
      const active = land
        ? visibleSpellLevels.has(spellKey)
        : availableSpellReferences.has(spellKey)
      if (land && !active)
        fixedClassSpellStatuses.push({
          owner: [
            'subclass',
            norm(entry.name),
            norm(entry.source),
            norm(entry.subclass),
            norm(entry.subclassSource),
          ],
          target: 'circle-of-the-land-terrain',
          featureName: 'Circle of the Land',
          level: grant.level,
          reference: grant.spellName,
          prepared: true,
          active,
        })
      if (!active) continue
      provenance = addSpellGrant(provenance, grant.spellName, {
        ...makeSourceTag('subclass', entry.subclass, 'fixed', entry.subclassSource),
        grantSource: parseSpellReference(grant.spellName).source,
      })
    }
  }
  let profiles = base.spells.spellProfiles
  const grants = [
    ...getOptionalClassFixedSpellGrants(character, context?.catalogs).map((grant) => ({
      grant,
      spellLevel: undefined,
      castingEntries: undefined,
      sourceReason: undefined,
    })),
    ...directPrepared.map(({ spellLevel, castingEntries, sourceReason, ...grant }) => ({
      grant,
      spellLevel,
      castingEntries,
      sourceReason,
    })),
  ]
  for (const { grant, spellLevel, castingEntries, sourceReason } of grants) {
    const prepared = spellLevel !== undefined
    const spell = targets.get(getSpellReferenceKey(grant.reference))
    const reason =
      sourceReason ??
      (!spell ||
      !permitted(allowed, spell.source) ||
      (prepared && !isAvailableDirectPreparedSpell(spell, spellLevel, grant.target))
        ? 'Restore the exact spell printing from the enabled content.'
        : undefined)
    fixedClassSpellStatuses.push({
      ...grant,
      prepared,
      active: !reason,
      ...(reason ? { reason } : {}),
      ...(!reason &&
        castingEntries && {
          castingNote: `${grant.featureName}: ${renderEntriesToText(castingEntries)}`,
        }),
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
            spellsKnown: add(profile.spellsKnown),
            fixedSpells: add(profile.fixedSpells ?? []),
            ...(prepared && { alwaysPreparedSpells: add(profile.alwaysPreparedSpells ?? []) }),
          }
        : profile,
    )
    provenance = addSpellGrant(provenance, grant.reference, {
      ...makeSourceTag('class', entry.name, 'fixed', entry.source),
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
  for (const { choice, entry, authority } of active) {
    const reference = formatSpellReference(choice.target.name, choice.target.source)
    const field = choice.slot[1] === 'class-cantrip' ? 'cantrips' : 'spellsKnown'
    profiles = profiles.map((profile) =>
      profile.id === toClassProfileId(entry.name, entry.source) &&
      !profile[field].some(
        (target) => getSpellReferenceKey(target) === getSpellReferenceKey(reference),
      )
        ? { ...profile, [field]: [...profile[field], reference] }
        : profile,
    )
    provenance = addSpellGrant(
      provenance,
      reference,
      makeManagedClassSpellTag(
        choice,
        entry,
        choice.slot[1] === 'class-arcanum'
          ? authority.declaration.feature.name
          : featurePools.get(JSON.stringify(choice.slot.slice(0, 4)))?.featureName,
      ),
    )
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
  return {
    character: {
      ...daily.character,
      provenance,
      spells: { ...daily.character.spells, spellProfiles: profiles },
    },
    independentSpellProfiles,
    statuses,
    dailyStatuses: daily.statuses,
    fixedClassSpellStatuses,
  }
}
