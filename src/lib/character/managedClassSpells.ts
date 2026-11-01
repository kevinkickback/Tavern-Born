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
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { getPreparedSpellLimit } from '@/lib/calculations/spellProfiles.casting'
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

export interface ManagedClassSpellStatus {
  choice: ManagedClassSpellChoice
  active: boolean
  reason?: string
  prepared?: boolean
}

function resolveSlot(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
  classes: readonly Class5e[] = currentClasses(character, context),
  gainAuthority = getClassCastingGainAuthority,
) {
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
  const context = sourceContext?.catalogs
    ? { ...sourceContext, catalogs: { ...sourceContext.catalogs } }
    : sourceContext
  const state = resolveSlot(character, slot, context)
  if (typeof state === 'string')
    return {
      spells: [] as Spell5e[],
      defaultReferences: new Set<string>(),
      maxSpellLevel: 0,
      reason: state,
      schools: undefined,
      privileged: false,
    }
  const allowed = sources(character)
  const targets = new Map<string, Spell5e | undefined>()
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getSpellReferenceKey(spell.name, spell.source)
    targets.set(key, targets.has(key) ? undefined : spell)
  }
  const spells = [...targets.values()].flatMap((spell) =>
    spell && permitted(allowed, spell.source) && !targetError(spell, slot, state) ? [spell] : [],
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
  for (const choice of character.managedClassSpellChoices ?? []) {
    const status: ManagedClassSpellStatus = { choice, active: false }
    statuses.push(status)
    const deny = (reason: string) => {
      status.reason = reason
    }
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
  for (const { choice, entry } of active) {
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
    provenance = addSpellGrant(provenance, reference, makeManagedClassSpellTag(choice, entry))
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
        ? getPreparedSpellLimit(first.authority.effective, entry.levels, getAbilityModifier(score))
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
  return { character: daily.character, statuses, dailyStatuses: daily.statuses }
}
