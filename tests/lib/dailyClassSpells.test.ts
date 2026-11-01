import { describe, expect, test } from 'vitest'
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
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

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
