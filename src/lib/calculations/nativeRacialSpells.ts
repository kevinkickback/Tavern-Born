import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { encodeRaceSpellIdentity } from '@/lib/5etools/raceSpellIdentity'
import { type ParsedRaceSpellBlock, parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { addSpellGrant } from '@/lib/provenance/ledger'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { Character, RacialSpellContext, SpellProfile } from '@/types/character'
import { deriveRaceSpellSelection } from './raceSpellSelection'
import { getSpellNameKey, getSpellReferenceKey } from './spellIdentity'

type RaceResolution = Pick<ResolvedRaceReference, 'parentRace' | 'subraceData' | 'subraceIsNested'>

interface NativeRacialSpellSuite {
  id: string
  block: ParsedRaceSpellBlock
}

export interface NativeRacialSpellOwner {
  id: string
  context: RacialSpellContext
  ownerType: 'race' | 'subrace'
  name: string
  source: string
  suites: NativeRacialSpellSuite[]
}

function getNativeRacialProfileId(
  context: RacialSpellContext,
  ownerType: 'race' | 'subrace',
): string {
  const owner = ownerType === 'race' ? context.parent : context.child
  return encodeRaceSpellIdentity('racial', [
    normalizeOwnerIdentity(context.parent.name),
    normalizeOwnerIdentity(context.parent.source),
    context.child ? normalizeOwnerIdentity(context.child.name) : null,
    context.child ? normalizeOwnerIdentity(context.child.source) : null,
    ownerType,
    normalizeOwnerIdentity(owner?.name),
    normalizeOwnerIdentity(owner?.source),
  ])
}

function blockKey(block: ParsedRaceSpellBlock): string {
  return JSON.stringify([
    normalizeOwnerIdentity(block.name),
    normalizeOwnerIdentity(block.ability),
    [...new Set(block.abilityOptions?.map(normalizeOwnerIdentity) ?? [])].sort(),
    block.grants
      .map((grant) =>
        JSON.stringify([
          getSpellReferenceKey(grant.spellName),
          grant.level,
          grant.isCantrip,
          grant.dailyUses ?? null,
          grant.source,
        ]),
      )
      .sort(),
    block.choices.map((choice) => choice.id).sort(),
    block.scheduleIdentity,
    (block.expanded ?? [])
      .map((target) => JSON.stringify([getSpellReferenceKey(target.reference), target.spellLevel]))
      .sort(),
  ])
}

/** Null means that the complete exact context is unavailable, not an empty native grant set. */
export function getNativeRacialSpellOwners(
  character: Pick<Character, 'race' | 'raceSource' | 'subrace' | 'subraceSource'>,
  resolution?: RaceResolution,
): NativeRacialSpellOwner[] | null {
  if (!character.race) return []
  const parent = resolution?.parentRace
  const child = character.subrace ? resolution?.subraceData : undefined
  const matches = (
    name: string | undefined,
    source: string | undefined,
    entity?: { name: string; source: string },
  ) =>
    !!entity &&
    normalizeOwnerIdentity(name) === normalizeOwnerIdentity(entity.name) &&
    normalizeOwnerIdentity(source) === normalizeOwnerIdentity(entity.source)
  if (
    !matches(character.race, character.raceSource, parent) ||
    (character.subrace && !matches(character.subrace, character.subraceSource, child))
  )
    return null
  if (!parent) return null
  const context: RacialSpellContext = {
    parent: { name: parent.name, source: parent.source },
    ...(child ? { child: { name: child.name, source: child.source } } : {}),
  }
  const selection = deriveRaceSpellSelection(parent, child, {
    subraceIsNested: resolution?.subraceIsNested,
  })
  return [
    { ownerType: 'race' as const, entity: parent, blocks: selection.parentAdditionalSpells },
    ...(child
      ? [
          {
            ownerType: 'subrace' as const,
            entity: child,
            blocks: selection.subraceAdditionalSpells,
          },
        ]
      : []),
  ].flatMap(({ ownerType, entity, blocks }) => {
    if (!blocks.length) return []
    const id = getNativeRacialProfileId(context, ownerType)
    const suites = parseRaceSpellBlocks(blocks).map((block) => ({
      id: encodeRaceSpellIdentity('racial-suite', [id, blockKey(block)]),
      block,
    }))
    if (new Set(suites.map((suite) => suite.id)).size !== suites.length)
      throw new Error(`Ambiguous duplicate native spell suites for ${entity.name}.`)
    for (const { block } of suites) {
      if (new Set(block.choices.map((choice) => choice.id)).size !== block.choices.length)
        throw new Error(`Ambiguous duplicate native spell descriptors for ${entity.name}.`)
    }
    return [{ id, context, ownerType, name: entity.name, source: entity.source, suites }]
  })
}

function uniqueReferences(references: readonly string[]): string[] {
  return [
    ...new Map(
      references.map((reference) => [getSpellReferenceKey(reference), reference]),
    ).values(),
  ]
}

/** Rebuild only a saved applied relation; never evaluate a schedule or infer targets here. */
export function materializeNativeRacialProfile(profile: SpellProfile): SpellProfile {
  if (profile.type !== 'racial' || !profile.racial) return profile
  const fixed = profile.racial.fixed
  const cantrips = uniqueReferences([
    ...fixed.filter((target) => target.isCantrip).map((target) => target.reference),
    ...(profile.choices ?? [])
      .filter((choice) => choice.isCantrip)
      .flatMap((choice) => choice.selected),
  ])
  const spellsKnown = uniqueReferences([
    ...fixed.filter((target) => !target.isCantrip).map((target) => target.reference),
    ...(profile.choices ?? [])
      .filter((choice) => !choice.isCantrip)
      .flatMap((choice) => choice.selected),
  ])
  const known = new Set(spellsKnown.map((reference) => getSpellReferenceKey(reference)))
  if (cantrips.some((reference) => known.has(getSpellReferenceKey(reference))))
    throw new Error('A native spell target cannot have conflicting applied spell kinds.')
  return {
    ...profile,
    fixedSpells: uniqueReferences(fixed.map((target) => target.reference)),
    cantrips,
    spellsKnown,
    preparedSpells: [],
    alwaysPrepared: true,
  }
}

/** Live evaluation is the only owner of native eligibility; absent context freezes established state. */
export function deriveNativeRacialSpellProfiles(
  character: Character,
  resolution?: RaceResolution,
  suiteSelections?: ReadonlyMap<string, string | undefined>,
): SpellProfile[] {
  const owners = getNativeRacialSpellOwners(character, resolution)
  if (owners === null)
    return character.spells.spellProfiles.filter((profile) => profile.type === 'racial')
  const totalLevel = getTotalCharacterLevel(character)
  return owners.map((owner) => {
    const previous = character.spells.spellProfiles.find(
      (profile) => profile.type === 'racial' && profile.id === owner.id,
    )
    const mode = owner.suites.length === 1 ? ('mandatory' as const) : ('alternative' as const)
    const requested = suiteSelections?.has(owner.id)
      ? suiteSelections.get(owner.id)
      : previous?.racial?.suite?.id
    const suite =
      mode === 'mandatory'
        ? owner.suites[0]
        : owner.suites.find((candidate) => candidate.id === requested)
    const block = suite?.block
    const choices = (block?.choices ?? [])
      .filter((choice) => choice.level <= totalLevel)
      .map((choice) => {
        const id = encodeRaceSpellIdentity('racial-choice', [owner.id, suite?.id, choice.id])
        const previousChoice = previous?.choices?.find((candidate) => candidate.id === id)
        const pool = choice.pool
          ? new Set(choice.pool.map((reference) => getSpellReferenceKey(reference)))
          : undefined
        const seen = new Set<string>()
        const selected = (previousChoice?.selected ?? [])
          .filter((reference) => {
            const key = getSpellNameKey(reference)
            if (seen.has(key) || (pool && !pool.has(getSpellReferenceKey(reference)))) return false
            seen.add(key)
            return true
          })
          .slice(0, choice.count)
        return {
          ...choice,
          id,
          selected,
          ...(choice.filter
            ? { filter: { ...choice.filter, classes: [...choice.filter.classes] } }
            : {}),
        }
      })
    const fixed = (block?.grants ?? [])
      .filter((grant) => grant.level <= totalLevel)
      .map((grant) => ({
        reference: grant.spellName,
        isCantrip: grant.isCantrip,
        ...(grant.dailyUses !== undefined ? { dailyUses: grant.dailyUses } : {}),
      }))
    const abilityOptions = block?.abilityOptions ? [...block.abilityOptions] : undefined
    const castingAbility =
      block?.ability ??
      (previous?.racial?.suite?.id === suite?.id &&
      previous?.castingAbility &&
      abilityOptions?.includes(previous.castingAbility)
        ? previous.castingAbility
        : undefined)
    return materializeNativeRacialProfile({
      id: owner.id,
      type: 'racial',
      label: owner.name,
      raceName: owner.name,
      raceSource: owner.source,
      racial: {
        context: owner.context,
        ownerType: owner.ownerType,
        mode,
        ...(suite ? { suite: { id: suite.id, ...(block?.name ? { name: block.name } : {}) } } : {}),
        fixed,
      },
      ...(castingAbility ? { castingAbility } : {}),
      ...(abilityOptions ? { castingAbilityOptions: abilityOptions } : {}),
      choices,
      cantrips: [],
      spellsKnown: [],
      preparedSpells: [],
      alwaysPrepared: true,
    })
  })
}

/** Exact inverse of applied fixed/descriptor membership. Other spell owners are untouched. */
export function reconcileNativeRacialSpellLedger(
  ledger: ProvenanceLedger,
  profiles: readonly SpellProfile[],
): ProvenanceLedger {
  const desired: Array<{ reference: string; tag: SpellSourceTag }> = []
  for (const profile of profiles) {
    if (profile.type !== 'racial' || !profile.racial?.suite) continue
    const owner = makeSourceTag(
      profile.racial.ownerType,
      profile.raceName ?? '',
      'fixed',
      profile.raceSource,
    )
    for (const target of profile.racial.fixed)
      desired.push({
        reference: target.reference,
        tag: { ...owner, grantVariant: profile.racial.suite.id },
      })
    for (const choice of profile.choices ?? [])
      for (const reference of choice.selected)
        desired.push({ reference, tag: { ...owner, grantType: 'choice', grantVariant: choice.id } })
  }
  const matches = (name: string, tag: SpellSourceTag, grant: (typeof desired)[number]) =>
    getSpellReferenceKey(name, tag.grantSource) === getSpellReferenceKey(grant.reference) &&
    tag.sourceType === grant.tag.sourceType &&
    tag.grantType === grant.tag.grantType &&
    normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(grant.tag.sourceName) &&
    normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(grant.tag.sourceRef) &&
    tag.grantVariant === grant.tag.grantVariant
  let next: ProvenanceLedger = {
    ...ledger,
    spells: Object.fromEntries(
      Object.entries(ledger.spells).flatMap(([name, tags]) => {
        const retained = tags.filter(
          (tag) =>
            (tag.sourceType !== 'race' && tag.sourceType !== 'subrace') ||
            desired.some((grant) => matches(name, tag, grant)),
        )
        return retained.length ? [[name, retained]] : []
      }),
    ),
  }
  for (const grant of desired) {
    const name = getSpellNameKey(grant.reference)
    if (!(next.spells[name] ?? []).some((tag) => matches(name, tag, grant)))
      next = addSpellGrant(next, grant.reference, grant.tag)
  }
  return next
}

/** Complete native refresh for writers whose primary change belongs to another domain. */
export function refreshNativeRacialSpellState(
  character: Character,
  resolution?: RaceResolution,
): Character {
  const profiles = [
    ...character.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
    ...deriveNativeRacialSpellProfiles(character, resolution),
  ]
  return {
    ...character,
    spells: { ...character.spells, spellProfiles: profiles },
    provenance: reconcileNativeRacialSpellLedger(character.provenance, profiles),
  }
}

/** Live list extensions affect class eligibility; they never become automatic known racial spells. */
export function getNativeExpandedSpellReferences(
  character: Character,
  resolution?: RaceResolution,
): Set<string> {
  const owners = getNativeRacialSpellOwners(character, resolution)
  if (!owners) return new Set()
  const profiles = deriveNativeRacialSpellProfiles(character, resolution)
  return new Set(
    owners.flatMap((owner) => {
      const selected = profiles.find((profile) => profile.id === owner.id)?.racial?.suite?.id
      return (owner.suites.find((suite) => suite.id === selected)?.block.expanded ?? []).map(
        (target) => target.reference,
      )
    }),
  )
}
