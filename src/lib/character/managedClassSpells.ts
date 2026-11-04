import {
  currentClasses,
  hasCurrentClassSpellListRoute,
  type ManagedClassSpellContext,
  permitted,
  sources,
} from './classSpellAuthority'

export type { ManagedClassSpellContext } from './classSpellAuthority'

import { getManagedClassSpellRule } from '@/lib/5etools/classCastingRules'
import {
  type ClassCastingCatalog,
  createClassCastingSourceAccess,
  getClassCastingGainAuthority,
} from '@/lib/5etools/classCastingSource'
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
  getManagedClassSpellOwnerEntry,
  makeManagedClassSpellTag,
  managedClassSpellId,
} from './managedClassSpellIdentity'
import { stripManagedClassSpellState } from './managedClassSpellState'
import {
  type ClassFixedSpellStatus,
  getOptionalClassFixedSpellGrants,
  getOptionalClassFixedSpellNamesAtGain,
} from './optionalClassFixedSpells'
import { getRevisedRangerFixedSpell } from './revisedRangerFixedSpell'
import { getSelectedFeatureCantripPool } from './selectedFeatureSpells'

export interface ManagedClassSpellStatus {
  choice: ManagedClassSpellChoice
  active: boolean
  reason?: string
  prepared?: boolean
  castingNote?: string
}

function resolveSlot(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
  classes: readonly Class5e[] = currentClasses(character, context),
  gainAuthority = getClassCastingGainAuthority,
) {
  if (slot[1] === 'feature-cantrip') return 'Use this selected feature’s spell choices.'
  const finite = getManagedClassSpellRule(slot)
  const entry = getManagedClassSpellOwnerEntry(slot, character.classProgression)
  if (!finite) return 'The saved class spell ownership is invalid.'
  if (!entry || entry.levels < slot[3] || entry.levels < finite.rule.declaration.level)
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
    owner,
    slot[2],
    finite.rule.declaration.level,
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
  const fixedAtGain = getEarnedSubclassSpellGrants(
    classes.find(
      (row) => norm(row.name) === norm(entry.name) && norm(row.source) === norm(entry.source),
    ),
    entry,
    slot[3],
  )
  if (!fixedAtGain) return 'Restore the selected subclass and its earned spell grants.'
  const privileged =
    slot[1] === 'class-known' &&
    slot[4] === 0 &&
    authority.rule.unrestrictedGains?.includes(slot[3]) === true
  return { entry, authority, fixedAtGain, privileged }
}

function targetError(
  spell: Spell5e,
  slot: ManagedClassSpellSlot,
  state: Exclude<ReturnType<typeof resolveSlot>, string>,
) {
  if (
    slot[1] === 'class-cantrip'
      ? spell.level !== 0
      : slot[1] === 'class-arcanum'
        ? spell.level !== state.authority.maxSpellLevel
        : spell.level < 1 || spell.level > state.authority.maxSpellLevel
  )
    return 'This spell is outside the level available for this choice.'
  if (
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

/** Picker and command share all hard bounds; the explicit bypass changes only default list membership. */
export function getManagedClassSpellPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  sourceContext?: ManagedClassSpellContext,
) {
  if (slot[1] === 'feature-cantrip')
    return getSelectedFeatureCantripPool(character, slot, sourceContext)
  const context = sourceContext?.catalogs
    ? { ...sourceContext, catalogs: { ...sourceContext.catalogs } }
    : sourceContext
  const state = resolveSlot(character, slot, context)
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
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getSpellReferenceKey(spell.name, spell.source)
    targets.set(key, targets.has(key) ? undefined : spell)
  }
  const spells = [...targets.values()].flatMap((spell) =>
    spell &&
    permitted(allowed, spell.source) &&
    !targetError(spell, slot, state) &&
    !optionalFixed.has(getSpellNameKey(spell.name))
      ? [spell]
      : [],
  )
  return {
    spells,
    defaultReferences: new Set(
      spells
        .filter((spell) =>
          hasCurrentClassSpellListRoute(character, state.entry, spell, context ?? {}, {
            owner: slot[0],
            requestedTarget: slot[2],
          }),
        )
        .map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: state.authority.maxSpellLevel,
    allowedLevels:
      slot[1] === 'class-cantrip'
        ? [0]
        : slot[1] === 'class-arcanum'
          ? [state.authority.maxSpellLevel]
          : Array.from({ length: state.authority.maxSpellLevel }, (_, index) => index + 1),
    reason: undefined,
    schools: state.authority.rule.schools,
    privileged: state.privileged,
  }
}

/** Pure shared projection. Saved tags are stripped before current authority grants any benefit. */
export function projectManagedClassSpellState(
  character: Character,
  sourceContext?: ManagedClassSpellContext,
  dailyIntentSource: Character = character,
) {
  const context = sourceContext?.catalogs
    ? { ...sourceContext, catalogs: { ...sourceContext.catalogs } }
    : sourceContext
  const invalid = getInvalidManagedClassSpellPaths(character).length > 0
  const stripped = stripManagedClassSpellState(character)
  const allowed = sources(character)
  const classes = currentClasses(character, context)
  const classMap = new Map(classes.map((row) => [toClassProfileId(row.name, row.source), row]))
  const targets = new Map<string, Spell5e | undefined>()
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getSpellReferenceKey(spell.name, spell.source)
    targets.set(key, targets.has(key) ? undefined : spell)
  }
  const availableSpellReferences = new Set(
    [...targets.entries()]
      .filter(([, spell]) => spell && permitted(allowed, spell.source))
      .map(([key]) => key),
  )
  const base = {
    ...stripped,
    spells: {
      ...stripped.spells,
      spellProfiles: ensureSpellProfiles(stripped, classMap, undefined, {
        availableSpellReferences,
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
    if (choice.slot[1] === 'feature-cantrip') continue
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
    const constraint = targetError(spell, choice.slot, state)
    if (constraint) {
      deny(constraint)
      continue
    }
    if (
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
    active.push({ choice, entry, authority })
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
  for (const entry of character.classProgression) {
    if (!entry.subclass) continue
    const grants = getEarnedSubclassSpellGrants(
      classMap.get(toClassProfileId(entry.name, entry.source)),
      entry,
    )
    for (const grant of grants ?? []) {
      if (
        grant.mode === 'expanded' ||
        !availableSpellReferences.has(getSpellReferenceKey(grant.spellName))
      )
        continue
      provenance = addSpellGrant(provenance, grant.spellName, {
        ...makeSourceTag('subclass', entry.subclass, 'fixed', entry.subclassSource),
        grantSource: parseSpellReference(grant.spellName).source,
      })
    }
  }
  let profiles = base.spells.spellProfiles
  const fixedClassSpellStatuses: ClassFixedSpellStatus[] = []
  const grants = getOptionalClassFixedSpellGrants(character, context?.catalogs)
  const rangerGrant = getRevisedRangerFixedSpell(character, context?.catalogs)
  if (rangerGrant) grants.push(rangerGrant)
  for (const grant of grants) {
    const prepared = grant === rangerGrant
    const spell = targets.get(getSpellReferenceKey(grant.reference))
    const reason =
      !spell ||
      !permitted(allowed, spell.source) ||
      (prepared &&
        (spell.level !== 1 ||
          (spell.classSpellRouteSource?.input?.targetOccurrences?.length ?? 0) > 1))
        ? 'Restore the exact spell printing from the enabled content.'
        : undefined
    fixedClassSpellStatuses.push({
      ...grant,
      prepared,
      active: !reason,
      ...(reason ? { reason } : {}),
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
  // Learned preparation requests reserve capacity in stable gain/ordinal order, even if source-dormant.
  for (const entry of character.classProgression) {
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
        .slice(0, Math.max(0, (capacity ?? 0) - independent))
        .map((choice) => managedClassSpellId(choice.slot)),
    )
    for (const status of statuses.filter(
      (row) => row.choice.prepare && getManagedClassSpellOwnerEntry(row.choice.slot, [entry]),
    )) {
      status.prepared = status.active && eligible.has(managedClassSpellId(status.choice.slot))
      if (!status.prepared) continue
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
