// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { pruneNonracialSpellSelections } from '@/lib/character/commands/sourceSpellPruningCommand'
import { removeSpellFromCharacter, setProfileSpells } from '@/lib/character/commands/spellCommands'
import { preserveDailyClassSpellIntent } from '@/lib/character/dailyClassSpells'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  authorManagedClassSpellFixture,
  makeManagedClassSpellFixtures,
} from '../fixtures/managedClassSpellFixtures'

const { context, lookups } = makeManagedClassSpellFixtures()
const initial = (name = 'Cleric', levels = 1) => {
  const character = makeCharacterFixture({ classProgression: [{ name, source: 'PHB', levels }] })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  return character
}
const profileId = (character: Character) =>
  toClassProfileId(character.classProgression[0].name, 'PHB')
const apply = (
  character: Character,
  result: ReturnType<typeof setDailyClassSpellPreparedCommand>,
) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
const prepare = (character: Character, reference: string) =>
  apply(
    character,
    setDailyClassSpellPreparedCommand(
      character,
      character.provenance,
      profileId(character),
      reference,
      true,
      { ...context, abilityScores: character.abilityScores },
    ),
  )
const prepared = (character: Character) =>
  character.spells.spellProfiles.find((row) => row.id === profileId(character))!.preparedSpells

describe('current daily class preparation and saved intent', () => {
  test('a supported newly parsed spell works without a name branch and survives removal/restoration', () => {
    const original = JSON.parse(readFileSync('tests/fixtures/spellRouteSources.json', 'utf8'))
      .spell[0]
    const added = parseSpells(
      [
        {
          ...original,
          name: 'New Preparation Spell',
          level: 1,
          classes: { fromClassList: [{ name: 'Cleric', source: 'PHB' }] },
        },
      ],
      { origin: 'synthetic-supported-preparation-addition' },
    ) as Spell5e[]
    const addedLookup = buildSpellLookup(added)
    const withAdded = { ...context, spellsByKey: { ...context.spellsByKey, ...addedLookup } }
    const character = initial()
    character.abilityScores.wisdom = 8
    const saved = apply(
      character,
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId(character),
        'New Preparation Spell|PHB',
        true,
        { ...withAdded, abilityScores: character.abilityScores },
      ),
    )
    const before = JSON.stringify(saved)
    for (const source of [withAdded, context, withAdded]) {
      const current = projectManagedClassSpellState(saved, source)
      expect(
        current.dailyStatuses.find((row) => row.reference === 'New Preparation Spell|PHB')?.active,
      ).toBe(source === withAdded)
      expect(current.character.spells.spellProfiles[0].preparedSpells).toEqual(
        source === withAdded ? ['New Preparation Spell|PHB'] : [],
      )
    }
    expect(JSON.stringify(saved)).toBe(before)
    expect(characterPersistenceSchema.safeParse(JSON.parse(before)).success).toBe(true)
  })
  test.each([
    ['Cleric', 1, 'wisdom', 'Bless|PHB', 'Healing Word|PHB'],
    ['Druid', 1, 'wisdom', 'Cure Wounds|PHB', 'Healing Word|PHB'],
    ['Paladin', 2, 'charisma', 'Bless|PHB', 'Cure Wounds|PHB'],
  ] as const)('honors the source minimum of one for low-ability %s and rejects a second', (name, levels, ability, first, second) => {
    const source = 'PHB'
    let character = makeCharacterFixture({ classProgression: [{ name, source, levels }] })
    character.abilityScores[ability] = 1
    character.spells.spellProfiles = ensureSpellProfiles(character)
    const id = toClassProfileId(name, source)
    const current = { ...context, abilityScores: character.abilityScores }
    character = apply(
      character,
      setDailyClassSpellPreparedCommand(character, character.provenance, id, first, true, current),
    )

    expect(character.spells.spellProfiles.find((row) => row.id === id)?.preparedSpells).toEqual([
      first,
    ])
    const projected = createCharacterCalculationContext(character, lookups, lookups)
    expect(
      projected.classCasting.details.find((row) => row.profileId === id)?.preparedSpellLimit,
    ).toBe(1)
    expect(projected.dailyClassSpellStatuses.find((row) => row.reference === first)?.active).toBe(
      true,
    )
    expect(() =>
      setDailyClassSpellPreparedCommand(character, character.provenance, id, second, true, current),
    ).toThrow(/limit/)
    const empty = {
      ...lookups,
      classChoiceFeatureCatalogs: { ...context.catalogs, classCastingSources: [] },
    }
    expect(
      createCharacterCalculationContext(character, empty, lookups).classCasting.details,
    ).toEqual([])
    expect(
      createCharacterCalculationContext(character, lookups, lookups).classCasting.details[0]
        .preparedSpellLimit,
    ).toBe(1)
  })

  test('TCE Artificer capacity also honors its source minimum before a spell is selected', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Artificer', source: 'TCE', levels: 1 }],
    })
    character.abilityScores.intelligence = 1
    character.spells.spellProfiles = ensureSpellProfiles(character)
    const current = createCharacterCalculationContext(character, lookups, lookups)
    expect(current.classCasting.details[0].preparedSpellLimit).toBe(1)
  })

  test('Wizard learned preparation and casting details use the same source minimum', () => {
    const entry = { name: 'Wizard', source: 'PHB', levels: 1 }
    const character = makeCharacterFixture({ classProgression: [entry] })
    character.abilityScores.intelligence = 1
    const saved = authorManagedClassSpellFixture(character, makeManagedClassSpellFixtures(), [
      {
        owner: entry,
        domain: 'class-spellbook',
        gain: 1,
        targets: [{ name: 'Shield', source: 'PHB', prepare: true }],
      },
    ])
    const projected = createCharacterCalculationContext(saved, lookups, lookups)
    expect(projected.classCasting.details[0].preparedSpellLimit).toBe(1)
    expect(projected.managedClassSpellStatuses[0].prepared).toBe(true)
    expect(projected.character.spells.spellProfiles[0].preparedSpells).toEqual(['Shield|PHB'])
    expect(characterPersistenceSchema.safeParse(JSON.parse(JSON.stringify(saved))).success).toBe(
      true,
    )
  })

  test.each([
    ['Cleric', 1],
    ['Paladin', 2],
  ] as const)('qualifies actual %s including empty numeric domains', (name, levels) => {
    const saved = prepare(initial(name, levels), 'Bless|PHB')
    const before = JSON.stringify(saved)
    expect(prepared(saved)).toEqual(['Bless|PHB'])
    for (const visible of [true, false, true]) {
      const primary = { ...lookups, spellsByKey: visible ? lookups.spellsByKey : {} }
      const current = createCharacterCalculationContext(saved, primary, lookups)
      expect(prepared(current.character)).toEqual(visible ? ['Bless|PHB'] : [])
      expect(current.dailyClassSpellStatuses[0].active).toBe(visible)
      const snapshot = buildPrerequisiteSnapshot({
        character: saved,
        effectiveSpellProfiles: current.character.spells.spellProfiles,
      })
      expect(snapshot.spells?.preparedSpells).toEqual(visible ? ['Bless|PHB'] : [])
      expect(
        deriveSpellActions(current.character, lookups.spellsByKey, {
          effectiveSpellProfiles: current.character.spells.spellProfiles,
        }).some((row) => row.name === 'Bless'),
      ).toBe(visible)
      expect(
        createCharacterSheetViewModel(saved, lookups, primary).spellRows.some(
          (row) => row.name === 'Bless',
        ),
      ).toBe(visible)
    }
    expect(JSON.stringify(saved)).toBe(before)
    expect(
      ensureSpellProfiles(saved).find((row) => row.id === profileId(saved))?.preparedSpells,
    ).toEqual([])
    expect(buildPrerequisiteSnapshot({ character: saved }).spells?.preparedSpells).toEqual([])
  })

  test('missing current class/declaration and own level deny despite retained raw data and higher multiclass access', () => {
    const saved = prepare(initial(), 'Bless|PHB')
    for (const catalogs of [
      { ...context.catalogs, classes: [] },
      { ...context.catalogs, classCastingSources: [] },
    ]) {
      expect(
        projectManagedClassSpellState(saved, { ...context, catalogs }).dailyStatuses[0].active,
      ).toBe(false)
    }
    const catalogs = { ...context.catalogs }
    const current = { ...context, catalogs, abilityScores: saved.abilityScores }
    const baseline = projectManagedClassSpellState(saved, current)
    const proofRows = catalogs.classCastingSources
    const before = JSON.stringify(saved)
    const empty = initial()
    catalogs.classCastingSources = []
    expect(projectManagedClassSpellState(saved, current).dailyStatuses[0].active).toBe(false)
    expect(() =>
      setDailyClassSpellPreparedCommand(
        empty,
        empty.provenance,
        profileId(saved),
        'Bless|PHB',
        true,
        current,
      ),
    ).toThrow()
    expect(
      apply(
        saved,
        setDailyClassSpellPreparedCommand(
          saved,
          saved.provenance,
          profileId(saved),
          'Bless|PHB',
          false,
          current,
        ),
      ).spells.spellProfiles.find((row) => row.id === profileId(saved))?.preparedSpells,
    ).toEqual([])
    catalogs.classCastingSources = proofRows
    expect(projectManagedClassSpellState(saved, current)).toEqual(baseline)
    expect(JSON.stringify(saved)).toBe(before)
    const cleric = initial()
    cleric.classProgression.push({ name: 'Wizard', source: 'PHB', levels: 10 })
    expect(() => prepare(cleric, 'Spirit Guardians|PHB')).toThrow(/outside the level/)
    expect(() => prepare(initial(), 'Bless|XPHB')).toThrow()
  })

  test('optional-section-only daily access stays off and Wizard cannot prepare an unlearned target', () => {
    expect(() => prepare(initial('Cleric', 5), 'Aura of Vitality|PHB')).toThrow(/spell list/)
    expect(() => prepare(initial('Wizard'), 'Shield|PHB')).toThrow(/Learned spell/)
    expect(() => prepare(initial(), 'Light|PHB')).toThrow(/outside the level/)
  })

  test('desired no-op, exact dormant withdrawal and current capacity preserve numeric allocation', () => {
    const saved = prepare(initial(), 'Bless|PHB')
    expect(
      setDailyClassSpellPreparedCommand(
        saved,
        saved.provenance,
        profileId(saved),
        'Bless|PHB',
        true,
      ).characterPatch,
    ).toEqual({})
    expect(() => prepare(saved, 'Cure Wounds|PHB')).toThrow(/preparation limit/)
    const wrong = setDailyClassSpellPreparedCommand(
      saved,
      saved.provenance,
      profileId(saved),
      'Bless|XPHB',
      false,
    )
    expect(wrong.characterPatch).toEqual({})
    const cleared = apply(
      saved,
      setDailyClassSpellPreparedCommand(
        saved,
        saved.provenance,
        profileId(saved),
        'Bless|PHB',
        false,
      ),
    )
    expect(prepared(cleared)).toEqual([])
    expect(cleared.managedClassSpellRevision).toBeUndefined()
    expect(saved.managedClassSpellRevision).toBeUndefined()
  })
  test.each([
    'Bless|PHB|XPHB',
    'Bless|PHB|',
    '{@spell Bless|PHB}',
    'Bless|',
    '|PHB',
  ])('rejects malformed exact preparation and withdrawal: %s', (reference) => {
    const saved = prepare(initial(), 'Bless|PHB')
    const before = JSON.stringify(saved)
    for (const desired of [true, false])
      expect(() =>
        setDailyClassSpellPreparedCommand(
          saved,
          saved.provenance,
          profileId(saved),
          reference,
          desired,
          { ...context, abilityScores: saved.abilityScores },
        ),
      ).toThrow(/exact spell/)
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('numeric Add, Bonus edits, source pruning and current-profile synchronization retain dormant daily intent', () => {
    const saved = prepare(initial(), 'Bless|PHB')
    const hidden = {
      ...context,
      spellsByKey: Object.fromEntries(
        Object.entries(context.spellsByKey).filter(([, row]) => row.name !== 'Bless'),
      ),
    }
    const numeric = setManagedClassSpellChoiceCommand(
      saved,
      saved.provenance,
      {
        slot: [
          ['class', 'cleric', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|cleric|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      hidden,
    )
    let next = apply(saved, numeric)
    expect(prepared(next)).toEqual(['Bless|PHB'])
    next = apply(next, selectBonusSpellFixture(next, 'Shield|PHB', 'spell'))
    expect(prepared(next)).toEqual(['Bless|PHB'])
    expect(
      pruneNonracialSpellSelections(
        next,
        next.provenance,
        () => false,
      ).characterPatch.spells?.spellProfiles.find((row) => row.id === profileId(next))
        ?.preparedSpells,
    ).toEqual(['Bless|PHB'])
    const projected = projectManagedClassSpellState(next, hidden).character
    const synced = preserveDailyClassSpellIntent(next, projected)
    expect(prepared(synced)).toEqual(['Bless|PHB'])
    expect(prepared(projectManagedClassSpellState(synced, hidden).character)).toEqual([])
    expect(
      prepared(
        projectManagedClassSpellState(characterPersistenceSchema.parse(synced), context).character,
      ),
    ).toEqual(['Bless|PHB'])
  })

  test('generic spell APIs cannot forge or remove class numeric ownership', () => {
    const character = initial()
    expect(
      setProfileSpells(character, character.provenance, profileId(character), ['Light|PHB'], [])
        .characterPatch,
    ).toEqual({})
    expect(
      removeSpellFromCharacter(character, character.provenance, 'Light|PHB', {
        profileId: profileId(character),
      }).characterPatch,
    ).toEqual({})
  })
})
