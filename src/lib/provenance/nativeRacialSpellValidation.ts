import {
  decodeRaceSpellIdentity,
  encodeRaceSpellIdentity,
  getRaceSpellChoiceKey,
} from '@/lib/5etools/raceSpellIdentity'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { Character, SpellProfile } from '@/types/character'
import { normalizeOwnerIdentity } from './normalization'
import type { SpellSourceTag } from './types'

type Path = (string | number)[]
const abilities = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha'])

/** Validate the saved applied inverse without loaded rules or interpreting IDs as schedules. */
export function getInvalidNativeRacialSpellPaths(character: Character): Path[] {
  const invalid: Path[] = []
  const profiles = character.spells.spellProfiles
  const ids = new Set<string>()
  const desired: Array<{
    reference: string
    profile: SpellProfile
    kind: 'fixed' | 'choice'
    variant: string
    path: Path
  }> = []
  const same = (a?: string, b?: string) => normalizeOwnerIdentity(a) === normalizeOwnerIdentity(b)
  const qualified = (reference: string) => {
    const parts = reference.split('|')
    return parts.length === 2 && parts.every((part) => !!part.trim() && !/[#{}]/.test(part))
  }
  profiles.forEach((profile, index) => {
    const path: Path = ['spells', 'spellProfiles', index]
    const fail = (...suffix: Path) => invalid.push([...path, ...suffix])
    if (ids.has(profile.id)) fail('id')
    ids.add(profile.id)
    if (profile.type !== 'racial') {
      if (
        profile.racial !== undefined ||
        profile.choices !== undefined ||
        profile.raceName !== undefined ||
        profile.raceSource !== undefined ||
        profile.castingAbilityOptions !== undefined
      )
        fail()
      return
    }
    const state = profile.racial
    if (!state) {
      fail('racial')
      return
    }
    const { context, ownerType, suite, mode } = state
    const owner = ownerType === 'race' ? context.parent : context.child
    if (
      !owner ||
      !same(context.parent.name, character.race) ||
      !same(context.parent.source, character.raceSource) ||
      !!context.child !== !!character.subrace ||
      (context.child &&
        (!same(context.child.name, character.subrace) ||
          !same(context.child.source, character.subraceSource))) ||
      !same(owner.name, profile.raceName) ||
      !same(owner.source, profile.raceSource)
    )
      fail('racial', 'context')
    const expectedId = encodeRaceSpellIdentity('racial', [
      normalizeOwnerIdentity(context.parent.name),
      normalizeOwnerIdentity(context.parent.source),
      context.child ? normalizeOwnerIdentity(context.child.name) : null,
      context.child ? normalizeOwnerIdentity(context.child.source) : null,
      ownerType,
      normalizeOwnerIdentity(owner?.name),
      normalizeOwnerIdentity(owner?.source),
    ])
    if (profile.id !== expectedId) fail('id')
    if (
      profile.className !== undefined ||
      profile.classSource !== undefined ||
      profile.spellSwaps !== undefined ||
      profile.preparedSpells.length ||
      profile.alwaysPrepared !== true ||
      profile.alwaysPreparedSpells !== undefined
    )
      fail()
    if (mode === 'mandatory' && !suite) fail('racial', 'suite')
    const suiteParts = suite ? decodeRaceSpellIdentity(suite.id, 'racial-suite') : null
    if (
      suite &&
      (suiteParts?.length !== 2 ||
        suiteParts[0] !== profile.id ||
        typeof suiteParts[1] !== 'string')
    )
      fail('racial', 'suite')
    if (
      !suite &&
      (state.fixed.length ||
        profile.choices?.length ||
        profile.castingAbility ||
        profile.castingAbilityOptions?.length)
    )
      fail('racial')
    if (profile.castingAbility && !abilities.has(profile.castingAbility)) fail('castingAbility')
    const options = profile.castingAbilityOptions
    if (
      options &&
      (!options.length ||
        new Set(options).size !== options.length ||
        options.some((value) => !abilities.has(value)) ||
        (profile.castingAbility && !options.includes(profile.castingAbility)))
    )
      fail('castingAbilityOptions')
    const typed = new Map<string, boolean>()
    const declare = (reference: string, isCantrip: boolean, membership: Path) => {
      if (!qualified(reference)) invalid.push(membership)
      const key = getSpellReferenceKey(reference)
      if (typed.has(key) && typed.get(key) !== isCantrip) invalid.push(membership)
      typed.set(key, isCantrip)
    }
    state.fixed.forEach((target, targetIndex) => {
      const member = [...path, 'racial', 'fixed', targetIndex]
      declare(target.reference, target.isCantrip, member)
      if (suite)
        desired.push({
          reference: target.reference,
          profile,
          kind: 'fixed',
          variant: suite.id,
          path: member,
        })
    })
    const choiceIds = new Set<string>()
    profile.choices?.forEach((choice, choiceIndex) => {
      const member: Path = [...path, 'choices', choiceIndex]
      if (choiceIds.has(choice.id)) invalid.push([...member, 'id'])
      choiceIds.add(choice.id)
      const parts = decodeRaceSpellIdentity(choice.id, 'racial-choice')
      if (
        choice.level === undefined ||
        parts?.length !== 3 ||
        parts[0] !== profile.id ||
        parts[1] !== suite?.id ||
        parts[2] !== getRaceSpellChoiceKey({ ...choice, level: choice.level ?? 0 })
      )
        invalid.push([...member, 'id'])
      if (
        (!choice.filter && !choice.pool) ||
        (choice.filter && choice.isCantrip !== (choice.filter.level === 0))
      )
        invalid.push(member)
      const expectedDaily = choice.usage?.startsWith('daily:') ? choice.usage.slice(6) : undefined
      const dailyUses =
        expectedDaily === 'pb'
          ? 'pb'
          : expectedDaily
            ? Number.parseInt(expectedDaily, 10)
            : undefined
      if (choice.dailyUses !== dailyUses) invalid.push([...member, 'dailyUses'])
      const pool = choice.pool
        ? new Set(choice.pool.map((reference) => getSpellReferenceKey(reference)))
        : undefined
      if (
        choice.pool &&
        (pool?.size !== choice.pool.length ||
          choice.pool.some((reference) => !qualified(reference)))
      )
        invalid.push([...member, 'pool'])
      if (
        new Set(choice.selected.map(getSpellNameKey)).size !== choice.selected.length ||
        choice.selected.length > choice.count
      )
        invalid.push([...member, 'selected'])
      choice.selected.forEach((reference, selectionIndex) => {
        const selectedPath = [...member, 'selected', selectionIndex]
        declare(reference, choice.isCantrip, selectedPath)
        if (pool && !pool.has(getSpellReferenceKey(reference))) invalid.push(selectedPath)
        desired.push({ reference, profile, kind: 'choice', variant: choice.id, path: selectedPath })
      })
    })
    const sameTargets = (actual: string[], expected: string[]) =>
      actual.length === new Set(actual.map((reference) => getSpellReferenceKey(reference))).size &&
      new Set(actual.map((reference) => getSpellReferenceKey(reference))).size ===
        new Set(expected.map((reference) => getSpellReferenceKey(reference))).size &&
      actual.every(
        (reference) =>
          qualified(reference) &&
          expected.some(
            (target) => getSpellReferenceKey(target) === getSpellReferenceKey(reference),
          ),
      )
    if (
      !sameTargets(
        profile.fixedSpells ?? [],
        state.fixed.map((target) => target.reference),
      )
    )
      fail('fixedSpells')
    for (const [field, isCantrip] of [
      ['cantrips', true],
      ['spellsKnown', false],
    ] as const) {
      const expected = [...typed.entries()]
        .filter(([, kind]) => kind === isCantrip)
        .map(([key]) => key)
      if (!sameTargets(profile[field], expected)) fail(field)
    }
  })
  const matches = (name: string, tag: SpellSourceTag, grant: (typeof desired)[number]) =>
    tag.sourceType === grant.profile.racial?.ownerType &&
    same(tag.sourceName, grant.profile.raceName) &&
    same(tag.sourceRef, grant.profile.raceSource) &&
    tag.grantType === grant.kind &&
    tag.grantVariant === grant.variant &&
    !!tag.grantSource &&
    qualified(`${name}|${tag.grantSource}`) &&
    getSpellReferenceKey(name, tag.grantSource) === getSpellReferenceKey(grant.reference)
  for (const grant of desired) {
    if (
      (character.provenance?.spells[getSpellNameKey(grant.reference)] ?? []).filter((tag) =>
        matches(getSpellNameKey(grant.reference), tag, grant),
      ).length !== 1
    )
      invalid.push(grant.path)
  }
  for (const [name, tags] of Object.entries(character.provenance?.spells ?? {}))
    tags.forEach((tag, index) => {
      if (
        (tag.sourceType === 'race' || tag.sourceType === 'subrace') &&
        (name !== getSpellNameKey(name) || !desired.some((grant) => matches(name, tag, grant)))
      )
        invalid.push(['provenance', 'spells', name, index])
    })
  return invalid
}
