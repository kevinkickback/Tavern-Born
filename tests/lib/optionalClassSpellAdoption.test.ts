// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { hasCurrentClassSpellListRoute } from '@/lib/character/classSpellAuthority'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { pruneNonracialSpellSelections } from '@/lib/character/commands/sourceSpellPruningCommand'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import type { ManagedClassSpellContext } from '@/lib/character/managedClassSpells'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Spell5e } from '@/types/5etools'
import type { Character, OptionalClassFeatureAdoption } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSpellFixtures } from '../fixtures/optionalClassSpellFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const fixture = makeOptionalClassSpellFixtures()
// Independent native examples: section root level differs from a later spell's access/gain.
const cases = [
  ['Bard', 1, '08d', 1, 'Command', 'class-known'],
  ['Cleric', 5, '09f', 1, 'Aura of Vitality', 'daily'],
  ['Druid', 1, '0c0', 1, 'Protection from Evil and Good', 'daily'],
  ['Paladin', 5, '12f', 2, 'Prayer of Healing', 'daily'],
  ['Ranger', 2, '157', 2, 'Entangle', 'class-known'],
  ['Sorcerer', 1, '188', 1, 'Grease', 'class-known'],
  ['Warlock', 9, '19f', 1, 'Mislead', 'class-known'],
  ['Wizard', 3, '1be', 1, 'Augury', 'class-spellbook'],
] as const
const apply = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
function setup(index: number) {
  const [name, levels, id, earnedLevel, target, domain] = cases[index]
  const entry = { name, source: 'PHB', levels }
  const character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [entry],
    variantRules: { optionalClassFeatures: true },
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  const adoption: OptionalClassFeatureAdoption = {
    owner: ['class', name.toLowerCase(), 'phb'],
    target: `book-section|tce|${id}`,
    earnedLevel,
  }
  return { character, adoption, entry, target, domain, profileId: `class:${name}|PHB` }
}
const adopt = (
  character: Character,
  request: OptionalClassFeatureAdoption,
  selected = true,
  context: ManagedClassSpellContext = fixture.context,
) =>
  apply(
    character,
    setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      context.catalogs,
      request,
      selected,
      getOptionalClassFamilyKeys(character, request),
      context,
    ),
  )
function select(
  index: number,
  character: Character,
  context: ManagedClassSpellContext = fixture.context,
) {
  const f = setup(index)
  const authority = { ...context, abilityScores: character.abilityScores }
  if (f.domain === 'daily')
    return apply(
      character,
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        f.profileId,
        `${f.target}|PHB`,
        true,
        authority,
      ),
    )
  const slot = getManagedClassSpellSlots(f.entry).find(
    (row) => row[1] === f.domain && row[3] === f.entry.levels,
  )!
  return apply(
    character,
    setManagedClassSpellChoiceCommand(
      character,
      character.provenance,
      {
        slot,
        expected: null,
        expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
        target: { name: f.target, source: 'PHB' },
        policy: 'default',
        ...(f.domain === 'class-spellbook' ? { prepare: true } : {}),
      },
      authority,
    ),
  )
}
const effective = (character: Character, context: ManagedClassSpellContext = fixture.context) =>
  projectManagedClassSpellState(character, { ...context, abilityScores: character.abilityScores })
    .character

describe('individually adopted class spell lists using existing selection actors', () => {
  test.each(
    cases.map((row, index) => ({ name: row[0], index })),
  )('$name adopts only its exact section without learning or extra quota', ({ index }) => {
    const f = setup(index)
    const spell = fixture.spells.find((row) => row.name === f.target && row.source === 'PHB')!
    expect(hasCurrentClassSpellListRoute(f.character, f.entry, spell, fixture.context)).toBe(false)
    expect(() => select(index, f.character)).toThrow()
    const adopted = adopt(f.character, f.adoption)
    expect(adopted.schemaVersion).toBe(12)
    expect(adopted.managedClassSpellChoices).toBeUndefined()
    expect(adopted.spells).toEqual(f.character.spells)
    expect(hasCurrentClassSpellListRoute(adopted, f.entry, spell, fixture.context)).toBe(true)
    const saved = select(index, adopted)
    const before = JSON.stringify(saved)
    const field = f.domain === 'daily' ? 'preparedSpells' : 'spellsKnown'
    expect(
      effective(saved).spells.spellProfiles.find((row) => row.id === f.profileId)?.[field],
    ).toContain(`${f.target}|PHB`)
    const off = { ...saved, variantRules: { optionalClassFeatures: false } }
    expect(
      effective(off).spells.spellProfiles.find((row) => row.id === f.profileId)?.[field],
    ).not.toContain(`${f.target}|PHB`)
    const cleared = adopt(saved, f.adoption, false)
    expect(
      effective(cleared).spells.spellProfiles.find((row) => row.id === f.profileId)?.[field],
    ).not.toContain(`${f.target}|PHB`)
    expect(
      effective(adopt(cleared, f.adoption)).spells.spellProfiles.find(
        (row) => row.id === f.profileId,
      )?.[field],
    ).toContain(`${f.target}|PHB`)
    expect(characterPersistenceSchema.parse(JSON.parse(before))).toEqual(saved)
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('daily optional selection suspends and restores through independent current authority losses', () => {
    const f = setup(1),
      saved = select(1, adopt(f.character, f.adoption))
    const before = JSON.stringify(saved)
    const contexts: ManagedClassSpellContext[] = [
      { ...fixture.context, spellsByKey: {} },
      { ...fixture.context, catalogs: { ...fixture.context.catalogs, optionalClassSections: [] } },
      { ...fixture.context, catalogs: { ...fixture.context.catalogs, classCastingSources: [] } },
      {
        ...fixture.context,
        catalogs: { ...fixture.context.catalogs, optionalClassFeatureSources: [] },
      },
      {
        ...fixture.context,
        catalogs: {
          ...fixture.context.catalogs,
          optionalClassSections: [
            ...fixture.context.catalogs.optionalClassSections!,
            fixture.context.catalogs.optionalClassSections!.find(
              (row) => row.target === f.adoption.target,
            )!,
          ],
        },
      },
      {
        ...fixture.context,
        spellsByKey: {
          one: fixture.context.spellsByKey['Aura of Vitality|PHB'],
          two: fixture.context.spellsByKey['Aura of Vitality|PHB'],
        },
      },
    ]
    for (const context of contexts) {
      expect(effective(saved, context).spells.spellProfiles[0].preparedSpells).not.toContain(
        'Aura of Vitality|PHB',
      )
      expect(effective(saved).spells.spellProfiles[0].preparedSpells).toContain(
        'Aura of Vitality|PHB',
      )
      const withdrawn = apply(
        saved,
        setDailyClassSpellPreparedCommand(
          saved,
          saved.provenance,
          f.profileId,
          'Aura of Vitality|PHB',
          false,
          context,
        ),
      )
      expect(effective(withdrawn).spells.spellProfiles[0].preparedSpells).not.toContain(
        'Aura of Vitality|PHB',
      )
    }
    expect(
      effective({ ...saved, allowedSources: ['PHB'] }).spells.spellProfiles[0].preparedSpells,
    ).not.toContain('Aura of Vitality|PHB')
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('own level, class printing, target printing and exact section remain hard bounds', () => {
    const f = setup(1)
    expect(() =>
      adopt(f.character, { ...f.adoption, owner: ['class', 'cleric', 'xphb'] }),
    ).toThrow()
    expect(() => adopt(f.character, { ...f.adoption, earnedLevel: 2 })).toThrow()
    const adopted = adopt(f.character, f.adoption)
    expect(() => select(1, { ...adopted, classProgression: [{ ...f.entry, levels: 1 }] })).toThrow(
      /outside the level/,
    )
    expect(() => adopt(f.character, { ...f.adoption, target: 'book-section|tce|08d' })).toThrow()
    expect(() => adopt({ ...f.character, classProgression: [] }, f.adoption)).toThrow()
    const saved = select(1, adopted)
    const removed = apply(
      saved,
      applyClassProgressionUpdate(saved, saved.provenance, [], undefined, {
        classChoiceFeatureCatalogs: fixture.context.catalogs,
        spellContext: fixture.context,
      }),
    )
    expect(removed.optionalClassFeatureAdoptions).toEqual([])
    expect(removed.spells.spellProfiles.some((row) => row.id === f.profileId)).toBe(false)
  })

  test.each([
    'member name',
    'spell printing',
    'class name',
    'class printing',
    'missing route',
  ] as const)('one otherwise plausible current route cannot erase an explicit %s conflict', (conflict) => {
    const f = setup(1),
      character = adopt(f.character, f.adoption)
    const raw = JSON.parse(
      readFileSync('tests/fixtures/managedClassDailyOptionalSpell.json', 'utf8'),
    )
    const { sourceLookup } = JSON.parse(
      readFileSync('tests/fixtures/optionalClassSpellRoutes.json', 'utf8'),
    )
    const original = sourceLookup.phb['aura of vitality']
    if (conflict === 'member name') raw.name = 'Different Aura'
    if (conflict === 'spell printing') raw.source = 'TCE'
    const route = { definedInSources: ['TCE'] }
    const classVariant =
      conflict === 'class name'
        ? { PHB: { Druid: route } }
        : conflict === 'class printing'
          ? { XPHB: { Cleric: route } }
          : conflict === 'missing route'
            ? {}
            : original.classVariant
    const lookup = { [raw.source.toLowerCase()]: { [raw.name.toLowerCase()]: { classVariant } } }
    const [spell] = parseSpells([raw], { sourceLookup: lookup }) as Spell5e[]
    expect(
      hasCurrentClassSpellListRoute(character, f.entry, spell, {
        ...fixture.context,
        spellsByKey: { only: spell },
      }),
    ).toBe(false)
  })

  test('an optional cantrip uses its ordinary earned slot; explicit list bypass remains independent', () => {
    const f = setup(5),
      slot = getManagedClassSpellSlots(f.entry).find((row) => row[1] === 'class-cantrip')!
    const request = {
      slot,
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: 'Mind Sliver', source: 'TCE' },
      policy: 'default' as const,
    }
    expect(() =>
      setManagedClassSpellChoiceCommand(
        f.character,
        f.character.provenance,
        request,
        fixture.context,
      ),
    ).toThrow(/spell list/)
    const adopted = adopt(f.character, f.adoption)
    const saved = apply(
      adopted,
      setManagedClassSpellChoiceCommand(adopted, adopted.provenance, request, fixture.context),
    )
    expect(effective(saved).spells.spellProfiles[0].cantrips).toContain('Mind Sliver|TCE')
    expect(
      effective(adopt(saved, f.adoption, false)).spells.spellProfiles[0].cantrips,
    ).not.toContain('Mind Sliver|TCE')
    const bypass = apply(
      f.character,
      setManagedClassSpellChoiceCommand(
        f.character,
        f.character.provenance,
        { ...request, policy: 'ignore-class-list' },
        fixture.context,
      ),
    )
    expect(effective(bypass).spells.spellProfiles[0].cantrips).toContain('Mind Sliver|TCE')
    expect(bypass.optionalClassFeatureAdoptions).toBeUndefined()
    const same = bypass.managedClassSpellChoices![0]
    const cleared = apply(
      bypass,
      setManagedClassSpellChoiceCommand(bypass, bypass.provenance, { slot, expected: same }),
    )
    expect(cleared.managedClassSpellChoices).toEqual([])
  })

  test('unrelated Bonus, numeric and source-pruning writes retain dormant daily setup', () => {
    const f = setup(1)
    let saved = select(1, adopt(f.character, f.adoption))
    saved = adopt(saved, f.adoption, false)
    const before = saved.spells.spellProfiles[0].preparedSpells
    saved = apply(saved, selectBonusSpellFixture(saved, 'Shield|PHB', 'spell'))
    const slot = getManagedClassSpellSlots(f.entry).find((row) => row[1] === 'class-cantrip')!
    saved = apply(
      saved,
      setManagedClassSpellChoiceCommand(
        saved,
        saved.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: 'Light', source: 'PHB' },
          policy: 'default',
        },
        fixture.context,
      ),
    )
    saved = apply(
      saved,
      pruneNonracialSpellSelections(saved, saved.provenance, () => false),
    )
    expect(saved.spells.spellProfiles[0].preparedSpells).toEqual(before)
    expect(effective(saved).spells.spellProfiles[0].preparedSpells).not.toContain(
      'Aura of Vitality|PHB',
    )
    expect(effective(adopt(saved, f.adoption)).spells.spellProfiles[0].preparedSpells).toContain(
      'Aura of Vitality|PHB',
    )
  })

  test('source-free Clear preserves independent Bonus ownership and another class base preparation', () => {
    const f = setup(0)
    let character = makeCharacterFixture({
      ...f.character,
      classProgression: [f.entry, { name: 'Cleric', source: 'PHB', levels: 1 }],
    })
    character.spells.spellProfiles = ensureSpellProfiles(character)
    character = apply(character, selectBonusSpellFixture(character, 'Command|PHB', 'spell'))
    character = select(0, adopt(character, f.adoption))
    character = apply(
      character,
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        'class:Cleric|PHB',
        'Command|PHB',
        true,
        { ...fixture.context, abilityScores: character.abilityScores },
      ),
    )
    const cleared = adopt(character, f.adoption, false, {})
    const current = effective(cleared)
    expect(
      current.spells.spellProfiles.find((row) => row.className === 'Bard')?.spellsKnown,
    ).not.toContain('Command|PHB')
    expect(
      current.spells.spellProfiles.find((row) => row.className === 'Cleric')?.preparedSpells,
    ).toContain('Command|PHB')
    expect(
      current.spells.spellProfiles.find((row) => row.type === 'special')?.spellsKnown,
    ).toContain('Command|PHB')
    expect(current.provenance.spells.command.some((tag) => tag.sourceType === 'manual')).toBe(true)
  })

  test('daily capacity reduction keeps all preparations and the existing over-limit warning', () => {
    const f = setup(1)
    let saved = select(1, adopt(f.character, f.adoption))
    for (const reference of ['Bless|PHB', 'Cure Wounds|PHB', 'Healing Word|PHB'])
      saved = apply(
        saved,
        setDailyClassSpellPreparedCommand(saved, saved.provenance, f.profileId, reference, true, {
          ...fixture.context,
          abilityScores: saved.abilityScores,
        }),
      )
    const lowered = { ...saved, abilityScores: { ...saved.abilityScores, wisdom: 1 } }
    const calculation = createCharacterCalculationContext(lowered, fixture.lookups, fixture.lookups)
    expect(calculation.character.spells.spellProfiles[0].preparedSpells).toEqual(
      saved.spells.spellProfiles[0].preparedSpells,
    )
    expect(
      validateSpells(lowered, calculation, fixture.lookups.spellsByKey).some((row) =>
        row.title.includes('Reduce Cleric prepared'),
      ),
    ).toBe(true)
    expect(lowered.managedClassSpellChoices).toBeUndefined()
  })

  test('current prerequisites, Actions and full/names PDF share optional daily activity', () => {
    const f = setup(1),
      saved = select(1, adopt(f.character, f.adoption))
    for (const active of [true, false, true]) {
      const character = { ...saved, variantRules: { optionalClassFeatures: active } }
      const calculation = createCharacterCalculationContext(
        character,
        fixture.lookups,
        fixture.lookups,
      )
      expect(
        buildPrerequisiteSnapshot({
          character,
          effectiveSpellProfiles: calculation.character.spells.spellProfiles,
        }).spells?.preparedSpells?.includes('Aura of Vitality|PHB') ?? false,
      ).toBe(active)
      expect(
        deriveSpellActions(calculation.character, fixture.lookups.spellsByKey, {
          effectiveSpellProfiles: calculation.character.spells.spellProfiles,
        }).some((row) => row.name === 'Aura of Vitality'),
      ).toBe(active)
      const model = createCharacterSheetViewModel(character, fixture.lookups, fixture.lookups)
      for (const view of [model, withoutSheetDescriptions(model)])
        expect(view.spellRows.some((row) => row.name === 'Aura of Vitality')).toBe(active)
      expect(
        createOptionalClassFeatureActivity(character, fixture.context.catalogs).states.find(
          (row) => row.root.target === f.adoption.target,
        )?.state,
      ).toBe(active ? 'active' : 'dormant-permission')
    }
  })
})

test.each([
  ['2014-official', false, true],
  ['2014-official', false, false],
  ['2014-official', true, true],
  ['2014-official', true, false],
  ['2024-official', false, true],
  ['2024-official', false, false],
  ['2024-official', true, true],
  ['2024-official', true, false],
] as const)('optional daily spells reach actual %s PDF, namesOnly=%s, active=%s', async (template, namesOnly, active) => {
  const f = setup(1),
    saved = select(1, adopt(f.character, f.adoption))
  const model = createCharacterSheetViewModel(
    { ...saved, variantRules: { optionalClassFeatures: active } },
    fixture.lookups,
    fixture.lookups,
  )
  const bytes = await generateTestCharacterSheet(
    namesOnly ? withoutSheetDescriptions(model) : model,
    template,
  )
  const text = (await PDFDocument.load(bytes))
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join('\n')
  expect(text.includes('Aura of Vitality')).toBe(active)
})
