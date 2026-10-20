import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  CLASS_CASTING_PRODUCERS,
  getClassSpellProfilePolicy,
} from '@/lib/5etools/classCastingRules'
import { decodeSubclassFeatureReference } from '@/lib/5etools/classFeatureIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { buildEffectivePrerequisiteSnapshot } from '@/lib/calculations/prerequisiteSnapshot'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  retainEarnedManagedClassSpells,
  setManagedClassSpellChoiceCommand,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { managedClassSpellId } from '@/lib/character/managedClassSpellIdentity'
import {
  type ManagedClassSpellContext,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Spell5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellDomain, ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassCastingData, makeClassCastingLayer } from '../fixtures/classCastingFixtures'

const data = makeClassCastingData()
const sourceLookup = JSON.parse(
  readFileSync('resources/srd/core/data/generated/gendata-spell-source-lookup.json', 'utf8'),
)
const spells = parseSpells(
  ['phb', 'xphb'].flatMap(
    (source) =>
      JSON.parse(readFileSync(`resources/srd/core/data/spells/spells-${source}.json`, 'utf8'))
        .spell,
  ),
  { sourceLookup },
)
const context: ManagedClassSpellContext = {
  catalogs: buildClassChoiceFeatureCatalogs(data),
  spellsByKey: buildSpellLookup(spells as Spell5e[]),
}
const bard = { name: 'Bard', source: 'PHB', levels: 1 }
const slot = (
  entry: CharacterClassEntry = bard,
  domain: ManagedClassSpellDomain = 'class-cantrip',
  gain = 1,
  ordinal = 0,
): ManagedClassSpellSlot => {
  const rule = getClassSpellProfilePolicy(entry).rule!
  return [structuredClone(rule.declaration.owner), domain, rule.declaration.target, gain, ordinal]
}
const initial = (entry: CharacterClassEntry = bard) =>
  makeCharacterFixture({ classProgression: [entry] })
const apply = (
  character: Character,
  request: Parameters<typeof setManagedClassSpellChoiceCommand>[2],
  authority = context,
) => {
  const result = setManagedClassSpellChoiceCommand(
    character,
    character.provenance,
    {
      ...request,
      expectedEmptyRevision:
        request.expectedEmptyRevision ?? character.managedClassSpellRevision ?? 0,
    },
    {
      ...authority,
      abilityScores: character.abilityScores,
    },
  )
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}
const add = (character: Character, target: string, address = slot(), prepare?: boolean) => {
  const [name, source] = target.split('|')
  return apply(character, {
    slot: address,
    expected: null,
    target: { name, source },
    policy: 'default',
    prepare,
  })
}
const profile = (character: Character, name = 'Bard') =>
  character.spells.spellProfiles.find((row) => row.className === name)!

describe('addressed current class spell choices', () => {
  test.each(
    CLASS_CASTING_PRODUCERS.filter(
      (row) => row.declaration.owner[0] === 'subclass' && row.declaration.owner[1] !== 'monk',
    ),
  )('exact subclass route keeps every supplied identity field for $declaration.owner', (rule) => {
    const [, name, source, subclass, subclassSource] = rule.declaration.owner
    const entry = { name, source, subclass, subclassSource, levels: 3 }
    const declaration = decodeSubclassFeatureReference(
      rule.declaration.target.slice('subclass-feature|'.length),
    )!
    const spell = context.spellsByKey!['Acid Splash|PHB']
    const route = spell.classes!.fromSubclass!.find(
      (row) =>
        row.class.name?.toLowerCase() === declaration.className.toLowerCase() &&
        row.class.source?.toLowerCase() === declaration.classSource?.toLowerCase() &&
        row.subclass.shortName?.toLowerCase() === declaration.subclassShortName.toLowerCase() &&
        row.subclass.source?.toLowerCase() === declaration.subclassSource?.toLowerCase(),
    )!
    expect(route).toBeDefined()
    const tryRoute = (row: typeof route) =>
      apply(
        initial(entry),
        {
          slot: slot(entry, 'class-cantrip', 3),
          expected: null,
          target: { name: 'Acid Splash', source: 'PHB' },
          policy: 'default',
        },
        {
          ...context,
          spellsByKey: {
            'Acid Splash|PHB': {
              ...spell,
              classSpellRoutes: [],
              classSpellRouteSource: undefined,
              classes: { fromSubclass: [row] },
            },
          },
        },
      )
    expect(() => tryRoute(route)).not.toThrow()
    for (const row of [
      { ...route, class: { ...route.class, name: 'Conflicting Class' } },
      { ...route, class: { ...route.class, source: 'Conflicting Source' } },
      { ...route, subclass: { ...route.subclass, name: 'Conflicting Knight' } },
      { ...route, subclass: { ...route.subclass, shortName: 'Conflicting Short Name' } },
      { ...route, subclass: { ...route.subclass, source: 'Conflicting Source' } },
    ])
      expect(() => tryRoute(row)).toThrow('spell list')
  })

  test('one Finish adds multiple slots from one captured empty lifetime and rolls back a final illegal choice', () => {
    const character = initial()
    const requests = ['Light', 'Message'].map((name, ordinal) => ({
      slot: slot(bard, 'class-cantrip', 1, ordinal),
      expected: null,
      expectedEmptyRevision: 0,
      target: { name, source: 'PHB' },
      policy: 'default' as const,
    }))
    const before = JSON.stringify(character)
    expect(() =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [...requests.slice(0, 1), { ...requests[1], target: { name: 'Shield', source: 'PHB' } }],
        context,
      ),
    ).toThrow('outside the level')
    expect(JSON.stringify(character)).toBe(before)
    const result = setManagedClassSpellChoicesCommand(
      character,
      character.provenance,
      requests,
      context,
    )
    const selected = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(selected.managedClassSpellChoices?.map((choice) => choice.revision)).toEqual([1, 2])
    expect(selected.managedClassSpellRevision).toBe(2)
    expect(profile(selected).cantrips).toEqual(['Light|PHB', 'Message|PHB'])
    expect(characterPersistenceSchema.safeParse(selected).success).toBe(true)
    expect(() =>
      setManagedClassSpellChoicesCommand(selected, selected.provenance, requests, context),
    ).toThrow('changed')
    expect(() =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [requests[0], requests[0]],
        context,
      ),
    ).toThrow('more than once')
  })

  test('Finish permutes occupied choices atomically, preserves unchanged rows and rejects any stale member', () => {
    const selected = add(
      add(initial(), 'Light|PHB'),
      'Message|PHB',
      slot(bard, 'class-cantrip', 1, 1),
    )
    const choices = selected.managedClassSpellChoices!
    const requests = choices.map((choice, index) => ({
      slot: choice.slot,
      expected: choice,
      target: choices[1 - index].target,
      policy: choice.policy,
    }))
    const before = JSON.stringify(selected)
    const result = setManagedClassSpellChoicesCommand(
      selected,
      selected.provenance,
      requests,
      context,
    )
    const permuted = { ...selected, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(
      permuted.managedClassSpellChoices?.map((choice) => [choice.target.name, choice.revision]),
    ).toEqual([
      ['Message', 3],
      ['Light', 4],
    ])
    expect(characterPersistenceSchema.safeParse(permuted).success).toBe(true)
    expect(() =>
      setManagedClassSpellChoicesCommand(
        permuted,
        permuted.provenance,
        [{ ...requests[0], expected: permuted.managedClassSpellChoices![0] }, requests[1]],
        context,
      ),
    ).toThrow('changed')
    expect(JSON.stringify(selected)).toBe(before)
    const unchanged = setManagedClassSpellChoicesCommand(
      selected,
      selected.provenance,
      choices.map((choice) => ({
        slot: choice.slot,
        expected: choice,
        target: choice.target,
        policy: choice.policy,
      })),
    )
    expect(unchanged.characterPatch).toEqual({})
    expect(unchanged.provenanceUpdate).toBe(selected.provenance)
    const clear = setManagedClassSpellChoicesCommand(
      permuted,
      permuted.provenance,
      permuted.managedClassSpellChoices!.map((choice) => ({ slot: choice.slot, expected: choice })),
    )
    expect(clear.characterPatch.managedClassSpellChoices).toEqual([])
    expect(clear.provenanceUpdate.spells).toEqual({})
    expect(clear.characterPatch.managedClassSpellRevision).toBeUndefined()
    expect({ ...permuted, ...clear.characterPatch }.managedClassSpellRevision).toBe(4)
  })

  test('a retained preparation request survives a replacement when current capacity shrinks', () => {
    const entry = { name: 'Wizard', source: 'PHB', levels: 1 }
    const base = initial(entry)
    base.abilityScores.intelligence = 18
    const selected = add(
      add(base, 'Shield|PHB', slot(entry, 'class-spellbook'), true),
      'Magic Missile|PHB',
      slot(entry, 'class-spellbook', 1, 1),
      true,
    )
    const old = selected.managedClassSpellChoices![1]
    const reduced = { ...selected, abilityScores: { ...selected.abilityScores, intelligence: 10 } }
    const result = setManagedClassSpellChoicesCommand(
      reduced,
      reduced.provenance,
      [
        {
          slot: old.slot,
          expected: old,
          target: { name: 'Mage Armor', source: 'PHB' },
          policy: old.policy,
        },
      ],
      { ...context, abilityScores: reduced.abilityScores },
    )
    const changed = { ...reduced, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(
      changed.managedClassSpellChoices!.find((choice) => choice.target.name === 'Mage Armor')
        ?.prepare,
    ).toBe(true)
    expect(profile(changed, 'Wizard').preparedSpells).toEqual(['Shield|PHB'])
    expect(characterPersistenceSchema.safeParse(changed).success).toBe(true)
  })

  test('new Add compares the captured empty lifetime; occupied edits remain scoped across unrelated allocations', () => {
    const empty = initial()
    const stale = {
      slot: slot(),
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: 'Light', source: 'PHB' },
      policy: 'default' as const,
    }
    const selected = apply(empty, stale)
    const old = selected.managedClassSpellChoices![0]
    const cleared = apply(selected, { slot: old.slot, expected: old })
    expect(() => apply(cleared, stale)).toThrow('changed')
    const reopenedEmpty = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(cleared)))
    expect(reopenedEmpty.managedClassSpellRevision).toBe(1)
    expect(add(reopenedEmpty, 'Light|PHB').managedClassSpellRevision).toBe(2)
    const other = add(selected, 'Mage Hand|PHB', slot(bard, 'class-cantrip', 1, 1))
    const changed = apply(other, {
      slot: old.slot,
      expected: old,
      target: { name: 'Message', source: 'PHB' },
      policy: 'default',
    })
    expect(changed.managedClassSpellChoices!.find((choice) => choice.slot[4] === 1)).toEqual(
      other.managedClassSpellChoices![1],
    )
    expect(changed.managedClassSpellRevision).toBe(3)
    const before = JSON.stringify(changed)
    expect(() =>
      apply(changed, {
        slot: old.slot,
        expected: null,
        expectedEmptyRevision: 0,
        target: old.target,
        policy: 'default',
      }),
    ).toThrow('changed')
    expect(JSON.stringify(changed)).toBe(before)
  })

  test('revision exhaustion rejects new intent atomically while source-free Clear stays available', () => {
    const selected = {
      ...add(initial(), 'Light|PHB'),
      managedClassSpellRevision: Number.MAX_SAFE_INTEGER,
    }
    const before = JSON.stringify(selected)
    expect(() => add(selected, 'Mage Hand|PHB', slot(bard, 'class-cantrip', 1, 1))).toThrow(
      'revision limit',
    )
    expect(JSON.stringify(selected)).toBe(before)
    const choice = selected.managedClassSpellChoices![0]
    const cleared = apply(selected, { slot: choice.slot, expected: choice })
    expect(cleared.managedClassSpellRevision).toBe(Number.MAX_SAFE_INTEGER)
    expect(cleared.managedClassSpellChoices).toEqual([])
  })

  test('Arcane Trickster fixed Mage Hand is separate from its two other cantrips, while Eldritch Knight can choose it', () => {
    for (const [source, subclassSource] of [
      ['PHB', 'PHB'],
      ['XPHB', 'PHB'],
      ['XPHB', 'XPHB'],
    ]) {
      const entry = {
        name: 'Rogue',
        source,
        subclass: 'Arcane Trickster',
        subclassSource,
        levels: 3,
      }
      for (const printing of ['PHB', 'XPHB'])
        expect(() =>
          apply(initial(entry), {
            slot: slot(entry, 'class-cantrip', 3, 0),
            expected: null,
            target: { name: 'Mage Hand', source: printing },
            policy: 'ignore-class-list',
          }),
        ).toThrow('already grants')
    }
    const ek = {
      name: 'Fighter',
      source: 'PHB',
      subclass: 'Eldritch Knight',
      subclassSource: 'PHB',
      levels: 3,
    }
    expect(() => add(initial(ek), 'Mage Hand|PHB', slot(ek, 'class-cantrip', 3, 0))).not.toThrow()
  })

  test('an earlier learned I can overlap the actual later Celestial fixed grant and each inverse keeps the other owner', () => {
    const celestial = JSON.parse(
      readFileSync('tests/fixtures/managedClassFixedSubclass.json', 'utf8'),
    )
    const withCelestial = composeGameDataLayers([
      data,
      makeClassCastingLayer('class/class-warlock.json', (document) => {
        document.subclass = [...(document.subclass ?? []), celestial]
      }),
    ])
    const authority = { ...context, catalogs: buildClassChoiceFeatureCatalogs(withCelestial) }
    const entry = { name: 'Warlock', source: 'XPHB', levels: 1 }
    const selected = apply(
      initial(entry),
      {
        slot: slot(entry),
        expected: null,
        target: { name: 'Light', source: 'XPHB' },
        policy: 'ignore-class-list',
      },
      authority,
    )
    const later = {
      ...selected,
      classProgression: [
        { ...entry, levels: 3, subclass: 'Celestial Patron', subclassSource: 'XPHB' },
      ],
    }
    const projected = projectManagedClassSpellState(later, authority).character
    const p = profile(projected, 'Warlock')
    expect(p.fixedSpells?.some((reference) => reference.toLowerCase() === 'light|xphb')).toBe(true)
    expect(projected.managedClassSpellChoices).toEqual(selected.managedClassSpellChoices)
    expect(characterPersistenceSchema.safeParse(projected).success).toBe(true)
    const choice = projected.managedClassSpellChoices![0]
    const cleared = apply(projected, { slot: choice.slot, expected: choice }, authority)
    expect(
      profile(cleared, 'Warlock').cantrips.some(
        (reference) => reference.toLowerCase() === 'light|xphb',
      ),
    ).toBe(true)
    const withoutFixed = projectManagedClassSpellState(
      { ...projected, classProgression: [{ ...entry, levels: 3 }] },
      authority,
    ).character
    expect(profile(withoutFixed, 'Warlock').cantrips).toEqual(['Light|XPHB'])
    expect(withoutFixed.provenance.spells.light).toHaveLength(1)
  })

  test('class-owned gains exclude the actual selected subclass fixed grants only after its earned root', () => {
    const celestial = JSON.parse(
      readFileSync('tests/fixtures/managedClassFixedSubclass.json', 'utf8'),
    )
    const withCelestial = composeGameDataLayers([
      data,
      makeClassCastingLayer('class/class-warlock.json', (document) => {
        document.subclass = [...(document.subclass ?? []), celestial]
      }),
    ])
    const authority = { ...context, catalogs: buildClassChoiceFeatureCatalogs(withCelestial) }
    const entry = {
      name: 'Warlock',
      source: 'XPHB',
      levels: 3,
      subclass: 'Celestial Patron',
      subclassSource: 'XPHB',
    }
    const request = {
      slot: slot(entry, 'class-known', 3),
      expected: null,
      target: { name: 'Aid', source: 'XPHB' },
      policy: 'ignore-class-list' as const,
    }
    expect(() => apply(initial(entry), request, authority)).toThrow('already grants')
    const beforeRoot = apply(
      initial(entry),
      {
        slot: slot(entry),
        expected: null,
        target: { name: 'Light', source: 'XPHB' },
        policy: 'ignore-class-list',
      },
      authority,
    )
    expect(beforeRoot.managedClassSpellChoices).toHaveLength(1)
    const saved = projectManagedClassSpellState(beforeRoot, authority).character
    expect(profile(saved, 'Warlock').fixedSpells).toContain('light|xphb')
    const absent = projectManagedClassSpellState(saved, { ...authority, spellsByKey: {} }).character
    expect(profile(absent, 'Warlock').cantrips).toEqual([])
    expect(profile(absent, 'Warlock').fixedSpells).toBeUndefined()
    expect(characterPersistenceSchema.safeParse(absent).success).toBe(true)
    expect(projectManagedClassSpellState(absent, authority).character.spells).toEqual(saved.spells)
    const otherPrinting = {
      ...authority,
      spellsByKey: { 'Light|PHB': context.spellsByKey!['Light|PHB'] },
    }
    expect(
      profile(projectManagedClassSpellState(saved, otherPrinting).character, 'Warlock').cantrips,
    ).toEqual([])
    for (const change of ['missing-root', 'duplicate-root', 'missing-subclass'] as const) {
      const current = structuredClone(authority)
      const parent = current.catalogs!.classes!.find(
        (row) => row.name === 'Warlock' && row.source === 'XPHB',
      )!
      const root = parent.classFeatureRefs!.find((ref) => ref.gainSubclassFeature)!
      if (change === 'missing-root')
        parent.classFeatureRefs = parent.classFeatureRefs!.filter((ref) => !ref.gainSubclassFeature)
      if (change === 'duplicate-root') parent.classFeatureRefs!.push(structuredClone(root))
      if (change === 'missing-subclass') parent.subclasses = []
      expect(() => apply(initial(entry), request, current)).toThrow('Restore')
      expect(
        profile(projectManagedClassSpellState(saved, current).character, 'Warlock').fixedSpells,
      ).toBeUndefined()
    }
    const duplicateParent = {
      ...authority,
      catalogs: {
        ...authority.catalogs!,
        classes: [
          ...authority.catalogs!.classes!,
          ...authority.catalogs!.classes!.filter(
            (row) => row.name === 'Warlock' && row.source === 'XPHB',
          ),
        ],
      },
    }
    expect(
      profile(projectManagedClassSpellState(saved, duplicateParent).character, 'Warlock')
        .fixedSpells,
    ).toBeUndefined()
  })

  test('filtering a fixed printing removes benefits without creating another Arcane Trickster choice', () => {
    const entry = {
      name: 'Rogue',
      source: 'PHB',
      levels: 3,
      subclass: 'Arcane Trickster',
      subclassSource: 'PHB',
    }
    const authority = {
      ...context,
      spellsByKey: { 'Mage Hand|XPHB': context.spellsByKey!['Mage Hand|XPHB'] },
    }
    expect(() =>
      apply(
        initial(entry),
        {
          slot: slot(entry, 'class-cantrip', 3),
          expected: null,
          target: { name: 'Mage Hand', source: 'XPHB' },
          policy: 'ignore-class-list',
        },
        authority,
      ),
    ).toThrow('already grants')
    expect(
      profile(projectManagedClassSpellState(initial(entry), authority).character, 'Rogue').cantrips,
    ).toEqual([])
  })

  test('an unowned expansion property cannot authorize another class default choice', () => {
    const authority = { ...context, expandedSpellReferences: new Set(['shield|phb']) }
    const request = {
      slot: slot(bard, 'class-known'),
      expected: null,
      target: { name: 'Shield', source: 'PHB' },
      policy: 'default' as const,
    }
    expect(() => apply(initial(), request, authority)).toThrow('spell list')
    expect(() =>
      apply(initial(), { ...request, policy: 'ignore-class-list' }, authority),
    ).not.toThrow()
  })

  test('saved fixed tags and arrays are offline snapshots, not current spell authority', () => {
    const saved = initial()
    saved.spells.spellProfiles = [
      ...ensureSpellProfiles(saved),
      ...saved.spells.spellProfiles.filter((row) => row.type === 'racial'),
    ]
    profile(saved).cantrips = ['Light|PHB']
    profile(saved).fixedSpells = ['Light|PHB']
    saved.provenance.spells.light = [
      { ...makeSourceTag('class', 'Bard', 'fixed', 'PHB'), grantSource: 'PHB' },
    ]
    expect(characterPersistenceSchema.safeParse(saved).success).toBe(true)
    const before = JSON.stringify(saved)
    for (const authority of [
      undefined,
      { ...context, spellsByKey: {} },
      context,
      { ...context, catalogs: { ...context.catalogs!, classes: [] } },
    ]) {
      const projected = projectManagedClassSpellState(saved, authority).character
      expect(profile(projected).cantrips).toEqual([])
      expect(characterPersistenceSchema.safeParse(projected).success).toBe(true)
    }
    expect(JSON.stringify(saved)).toBe(before)
    expect(
      ensureSpellProfiles(saved, undefined, undefined, { effectiveSpellProfiles: [] }),
    ).toEqual([])
    const effective = projectManagedClassSpellState(add(initial(), 'Light|PHB'), context).character
      .spells.spellProfiles
    expect(
      ensureSpellProfiles(saved, undefined, undefined, { effectiveSpellProfiles: effective }),
    ).toEqual(effective)
  })
  test('a cleared and re-added identical target cannot be changed by its earlier callback', () => {
    const selected = add(initial(), 'Light|PHB')
    const original = selected.managedClassSpellChoices![0]
    const cleared = apply(selected, { slot: original.slot, expected: original })
    const selectedAgain = add(cleared, 'Light|PHB')
    expect(() => apply(selectedAgain, { slot: original.slot, expected: original })).toThrow(
      'changed',
    )
    expect(selectedAgain.managedClassSpellChoices![0].revision).toBeGreaterThan(original.revision)
  })
  test.each(
    CLASS_CASTING_PRODUCERS.filter((row) => row.declaration.owner[0] === 'subclass'),
  )('actual subclass $declaration.owner uses both standard list alternatives under its exact requested target', (rule) => {
    const [, name, source, subclass, subclassSource] = rule.declaration.owner
    const entry = { name, source, subclass, subclassSource, levels: 3 }
    for (const printing of ['PHB', 'XPHB']) {
      const selected = add(
        initial(entry),
        `Acid Splash|${printing}`,
        slot(entry, 'class-cantrip', 3, 0),
      )
      expect(selected.managedClassSpellChoices![0].slot[2]).toBe(rule.declaration.target)
      expect(characterPersistenceSchema.safeParse(selected).success).toBe(true)
    }
    const address = slot(entry, 'class-cantrip', 3, 0)
    const spell = context.spellsByKey!['Acid Splash|PHB']
    // No current class route or subclass path can be repaired by the declared-list name alone.
    const unavailable = {
      ...context,
      spellsByKey: {
        'Acid Splash|PHB': {
          ...spell,
          classSpellRoutes: [],
          classes: { ...spell.classes, fromSubclass: [] },
        },
      },
    }
    expect(() =>
      apply(
        initial(entry),
        {
          slot: address,
          expected: null,
          target: { name: 'Acid Splash', source: 'PHB' },
          policy: 'default',
        },
        unavailable,
      ),
    ).toThrow('spell list')
  })

  test('PHB school privilege stays on ordinal zero for original and copied owners, even after an in-school pick', () => {
    for (const source of ['PHB', 'XPHB']) {
      const entry = {
        name: 'Fighter',
        source,
        subclass: 'Eldritch Knight',
        subclassSource: 'PHB',
        levels: 3,
      }
      const privileged = slot(entry, 'class-known', 3, 0)
      const restricted = slot(entry, 'class-known', 3, 1)
      const selected = add(initial(entry), 'Shield|PHB', privileged)
      const changed = apply(selected, {
        slot: privileged,
        expected: selected.managedClassSpellChoices![0],
        target: { name: 'Charm Person', source: 'PHB' },
        policy: 'default',
      })
      expect(changed.managedClassSpellChoices![0].slot).toEqual(privileged)
      for (const policy of ['default', 'ignore-class-list'] as const)
        expect(() =>
          apply(initial(entry), {
            slot: restricted,
            expected: null,
            target: { name: 'Charm Person', source: 'PHB' },
            policy,
          }),
        ).toThrow('schools')
    }
  })

  test('actual casting and spell producers select, strict save/reopen, no-op, replace and source-free Clear', () => {
    const selected = add(initial(), 'Light|PHB')
    expect(profile(selected).cantrips).toEqual(['Light|PHB'])
    const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(selected)))
    const original = reopened.managedClassSpellChoices![0]
    const noop = setManagedClassSpellChoiceCommand(reopened, reopened.provenance, {
      slot: original.slot,
      expected: original,
      target: original.target,
      policy: original.policy,
    })
    expect(noop.characterPatch).toEqual({})
    expect(noop.provenanceUpdate).toBe(reopened.provenance)
    const replaced = apply(reopened, {
      slot: original.slot,
      expected: original,
      target: { name: 'Mage Hand', source: 'PHB' },
      policy: 'default',
    })
    expect(profile(replaced).cantrips).toEqual(['Mage Hand|PHB'])
    expect(replaced.managedClassSpellChoices![0]).toMatchObject({
      slot: original.slot,
      revision: 2,
    })
    expect(() => apply(replaced, { slot: original.slot, expected: original })).toThrow('changed')
    const current = replaced.managedClassSpellChoices![0]
    const result = setManagedClassSpellChoiceCommand(replaced, replaced.provenance, {
      slot: current.slot,
      expected: current,
    })
    const cleared = { ...replaced, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(profile(cleared).cantrips).toEqual([])
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
  })

  test('current empty target, route, declaration and exact source each suspend without changing intent or input', () => {
    const selected = add(initial(), 'Light|PHB')
    const before = JSON.stringify(selected)
    for (const authority of [
      { ...context, spellsByKey: {} },
      { ...context, catalogs: { ...context.catalogs!, classCastingSources: [] } },
      {
        ...context,
        spellsByKey: {
          ...context.spellsByKey,
          'Light|PHB': { ...context.spellsByKey!['Light|PHB'], classSpellRoutes: [] },
        },
      },
    ]) {
      const projected = projectManagedClassSpellState(selected, authority)
      expect(projected.statuses[0].active).toBe(false)
      expect(profile(projected.character).cantrips).toEqual([])
      expect(projected.character.managedClassSpellChoices).toBe(selected.managedClassSpellChoices)
      expect(characterPersistenceSchema.safeParse(projected.character).success).toBe(true)
    }
    expect(profile(projectManagedClassSpellState(selected, context).character).cantrips).toEqual([
      'Light|PHB',
    ])
    expect(JSON.stringify(selected)).toBe(before)
    const otherPrinting = {
      slot: slot(),
      expected: null,
      target: { name: 'Light', source: 'XPHB' },
      policy: 'ignore-class-list' as const,
    }
    expect(() => apply(initial(), otherPrinting)).not.toThrow()
    expect(() => apply({ ...initial(), allowedSources: ['PHB'] }, otherPrinting)).toThrow(
      'printing',
    )
  })

  test('default list and explicit bypass share hard level, owner, source and occupied-slot limits', () => {
    const sorcerer = { name: 'Sorcerer', source: 'PHB', levels: 1 }
    const address = slot(sorcerer, 'class-known')
    const target = { name: 'Healing Word', source: 'PHB' }
    expect(() =>
      apply(initial(sorcerer), { slot: address, expected: null, target, policy: 'default' }),
    ).toThrow('spell list')
    const selected = apply(initial(sorcerer), {
      slot: address,
      expected: null,
      target,
      policy: 'ignore-class-list',
    })
    expect(characterPersistenceSchema.safeParse(selected).success).toBe(true)
    expect(() =>
      apply(selected, { slot: address, expected: null, target, policy: 'ignore-class-list' }),
    ).toThrow('changed')
    expect(() =>
      apply(initial(sorcerer), {
        slot: address,
        expected: null,
        target: { name: 'Fireball', source: 'PHB' },
        policy: 'ignore-class-list',
      }),
    ).toThrow('level')
    expect(() =>
      apply(initial(), { slot: address, expected: null, target, policy: 'ignore-class-list' }),
    ).toThrow('not earned')
  })

  test('Wizard learned preparation stays on its I across capacity suspension and exact restoration', () => {
    const wizard = { name: 'Wizard', source: 'PHB', levels: 1 }
    let character = initial(wizard)
    character.abilityScores.intelligence = 14
    character = add(character, 'Shield|PHB', slot(wizard, 'class-spellbook', 1, 0), true)
    character = add(character, 'Grease|PHB', slot(wizard, 'class-spellbook', 1, 1), true)
    expect(profile(character, 'Wizard').preparedSpells).toEqual(['Shield|PHB', 'Grease|PHB'])
    const reduced = projectManagedClassSpellState(character, {
      ...context,
      abilityScores: { ...character.abilityScores, intelligence: 8 },
    }).character
    expect(profile(reduced, 'Wizard').preparedSpells).toEqual([])
    expect(reduced.managedClassSpellChoices?.every((choice) => choice.prepare)).toBe(true)
    expect(characterPersistenceSchema.safeParse(reduced).success).toBe(true)
    const restored = projectManagedClassSpellState(reduced, {
      ...context,
      abilityScores: character.abilityScores,
    }).character
    expect(profile(restored, 'Wizard').preparedSpells).toEqual(['Shield|PHB', 'Grease|PHB'])
    const request = restored.managedClassSpellChoices![0]
    const result = setManagedClassSpellChoiceCommand(restored, restored.provenance, {
      slot: request.slot,
      expected: request,
      target: request.target,
      policy: request.policy,
      prepare: false,
    })
    const unprepared = {
      ...restored,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    }
    expect(
      unprepared.managedClassSpellChoices?.find(
        (choice) => managedClassSpellId(choice.slot) === managedClassSpellId(request.slot),
      )?.prepare,
    ).toBeUndefined()
    expect(profile(unprepared, 'Wizard').spellsKnown).toContain('Shield|PHB')
    expect(profile(unprepared, 'Wizard').preparedSpells).not.toContain('Shield|PHB')
    expect(unprepared.managedClassSpellRevision).toBe(3)
    expect(characterPersistenceSchema.safeParse(unprepared).success).toBe(true)
  })

  test('pure leaf and omitted context never use saved numeric rows as spell prerequisites', () => {
    const selected = add(initial(), 'Light|PHB')
    expect(buildEffectivePrerequisiteSnapshot({ character: selected }).spells?.cantrips).toEqual([])
    const effective = projectManagedClassSpellState(selected, context).character.spells
      .spellProfiles
    expect(
      buildEffectivePrerequisiteSnapshot({ character: selected, effectiveSpellProfiles: effective })
        .spells?.cantrips,
    ).toEqual(['Light|PHB'])
    expect(
      buildEffectivePrerequisiteSnapshot({ character: selected, effectiveSpellProfiles: [] }).spells
        ?.cantrips,
    ).toEqual([])
    expect(profile(projectManagedClassSpellState(selected).character).cantrips).toEqual([])
  })

  test('saved fixed labels are not current fixed authority; intentional level/owner loss removes only its I', () => {
    const selected = add(initial(), 'Light|PHB')
    const spoofed = structuredClone(selected)
    spoofed.managedClassSpellChoices = []
    spoofed.provenance.spells = {}
    profile(spoofed).fixedSpells = ['Light|PHB']
    expect(characterPersistenceSchema.safeParse(spoofed).success).toBe(true)
    expect(profile(projectManagedClassSpellState(spoofed, context).character).cantrips).toEqual([])
    const removed = retainEarnedManagedClassSpells({ ...selected, classProgression: [] })
    expect(removed.managedClassSpellChoices).toEqual([])
    expect(removed.provenance.spells).toEqual({})
    expect(
      removed.managedClassSpellChoices?.some(
        (choice) => managedClassSpellId(choice.slot) === managedClassSpellId(slot()),
      ),
    ).toBe(false)
  })
})
