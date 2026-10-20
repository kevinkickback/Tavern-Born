import { describe, expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCannyFixture, selectCanny } from '../fixtures/cannyFixtures'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { applyProficiency, makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'
import { makeKnowledgeFixture } from '../fixtures/knowledgeProficiencyFixtures'
import { chooseOptionalSkill, makeOptionalSkillFixture } from '../fixtures/optionalSkillFixtures'

function makeIncludedSrdData() {
  return makeGameDataFixture({
    races: [{ name: 'Human', source: 'PHB' }],
    classes: [makeClassFixture({ name: 'Fighter', source: 'PHB', classFeatures: [] })],
    backgrounds: [{ name: 'Soldier', source: 'PHB' }],
    feats: [{ name: 'Grappler', source: 'PHB' }],
    spells: [makeSpellFixture({ name: 'Magic Missile', source: 'PHB' })],
    items: [{ name: 'Longsword', source: 'PHB', type: 'M' }],
  })
}

function reopenProficiencyCharacter(character: Character) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        race: '',
        raceSource: '',
        subrace: undefined,
        subraceSource: undefined,
        background: '',
        backgroundSource: '',
      }),
    ),
  )
}

function usesOutside(character: Character, data: GameData) {
  return characterUsesContentOutsideCatalog(
    character,
    createGameDataAvailabilityIndex({ ...data, lookups: buildGameDataLookups(data) }),
  )
}

describe('current source-owned proficiency availability', () => {
  test('Primal Knowledge uses skills, retains missing selections and restores without writes', () => {
    const f = makeOptionalSkillFixture(3)
    const character = reopenProficiencyCharacter(chooseOptionalSkill(f, f.character, 3, 'nature'))
    const bytes = JSON.stringify(character)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(usesOutside(character, { ...f.data, skills: [] })).toBe(true)
    expect(usesOutside(character, { ...f.data, skills: [], languages: [{ name: 'Nature' }] })).toBe(
      true,
    )
    expect(usesOutside(character, f.data)).toBe(false)
    expect(
      usesOutside(
        { ...character, variantRules: { ...character.variantRules, optionalClassFeatures: false } },
        { ...f.data, skills: [] },
      ),
    ).toBe(false)
    expect(JSON.stringify(character)).toBe(bytes)
  })

  test('Canny languages remain independent of a same-name skill vocabulary', () => {
    const f = makeCannyFixture()
    const character = reopenProficiencyCharacter(
      selectCanny(f, 'languages', ['Elvish', 'Dwarvish']),
    )
    const bytes = JSON.stringify(character)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(usesOutside(character, { ...f.data, languages: [] })).toBe(true)
    expect(
      usesOutside(character, {
        ...f.data,
        languages: [],
        skills: [...f.data.skills, { name: 'Elvish' }, { name: 'Dwarvish' }],
      }),
    ).toBe(true)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(JSON.stringify(character)).toBe(bytes)
  })

  test('Knowledge artisan tools require the actual current artisan item vocabulary', () => {
    const f = makeKnowledgeFixture('XPHB', 'FRHoF')
    const choice = f.choices.find((row) => row.proficiencyDomain === 'tools')!
    const character = reopenProficiencyCharacter(
      applyProficiency(f, choice, [getProficiencyOption('tools', "Smith's Tools")]),
    )
    const bytes = JSON.stringify(character)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(usesOutside(character, { ...f.data, items: [], itemsBase: [] })).toBe(true)
    expect(
      usesOutside(character, {
        ...f.data,
        items: [],
        itemsBase: [],
        languages: [...f.data.languages, { name: "Smith's Tools" }],
        skills: [...f.data.skills, { name: "Smith's Tools" }],
      }),
    ).toBe(true)
    expect(
      usesOutside(character, {
        ...f.data,
        items: [{ name: "Smith's Tools", source: 'XPHB', type: 'M' }],
        itemsBase: [],
      }),
    ).toBe(true)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(JSON.stringify(character)).toBe(bytes)
  })

  test('Rogue skill Expertise requires skills rather than language or tool names', () => {
    const f = makeClassProficiencyFixture('Rogue', 'PHB')
    const choice = f.choices.find(
      (row) => row.proficiencyDomain === 'expertise' && row.level === 1,
    )!
    const character = reopenProficiencyCharacter(
      applyProficiency(f, choice, [getProficiencyOption('expertise', 'Stealth')]),
    )
    const bytes = JSON.stringify(character)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(usesOutside(character, { ...f.data, skills: [] })).toBe(true)
    expect(
      usesOutside(character, {
        ...f.data,
        skills: [],
        languages: [{ name: 'Stealth' }],
        items: [{ name: 'Stealth', source: 'PHB', type: 'AT' }],
      }),
    ).toBe(true)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(JSON.stringify(character)).toBe(bytes)
  })

  test('Rogue named-tool Expertise needs its current class source, not an item printing', () => {
    const f = makeClassProficiencyFixture('Rogue', 'PHB')
    const choice = f.choices.find(
      (row) => row.proficiencyDomain === 'expertise' && row.level === 1,
    )!
    const character = reopenProficiencyCharacter(
      applyProficiency(f, choice, [getProficiencyOption('expertise', "Thieves' Tools", 'tool')]),
    )
    const bytes = JSON.stringify(character)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(usesOutside(character, { ...f.data, items: [], itemsBase: [] })).toBe(false)
    expect(usesOutside(character, { ...f.data, classes: [], classFeatures: [] })).toBe(true)
    expect(usesOutside(character, f.data)).toBe(false)
    expect(() =>
      applyProficiency(f, choice, [getProficiencyOption('expertise', "Smith's Tools", 'tool')]),
    ).toThrow()
    expect(JSON.stringify(character)).toBe(bytes)
  })
})

describe('additional content availability', () => {
  test('indexes direct subclass feature objects', () => {
    const gameData = makeGameDataFixture({
      classes: [
        makeClassFixture({
          subclasses: [
            {
              name: 'School of Tests',
              shortName: 'Tests',
              source: 'HB',
              className: 'Wizard',
              subclassFeatures: [
                {
                  name: 'Direct Ward',
                  source: 'HB',
                  className: 'Wizard',
                  classSource: 'PHB',
                  subclassShortName: 'Tests',
                  subclassSource: 'HB',
                  level: 3,
                },
              ],
            },
          ],
        }),
      ],
    })

    expect(createGameDataAvailabilityIndex(gameData).subclassFeatures).toContain(
      'subclass-feature|direct ward|wizard|phb|tests|hb|3|hb',
    )
  })

  test('accepts source-qualified choices that are present in the Included SRD catalog', () => {
    const character = makeCharacterFixture({
      feats: [{ id: 'grappler', name: 'Grappler', source: 'PHB', description: 'An SRD feat.' }],
      equipment: [
        {
          id: 'longsword',
          name: 'Longsword',
          source: 'PHB',
          type: 'M',
          quantity: 1,
          equipped: true,
        },
      ],
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Fighter|PHB',
            type: 'class',
            label: 'Fighter',
            className: 'Fighter',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Magic Missile|PHB'],
            preparedSpells: [],
          },
        ],
      },
    })

    expect(
      characterUsesContentOutsideCatalog(
        character,
        createGameDataAvailabilityIndex(makeIncludedSrdData()),
      ),
    ).toBe(false)
  })

  test('detects non-SRD choices even when they share a PHB source abbreviation', () => {
    const character = makeCharacterFixture({
      feats: [
        {
          id: 'missing-feat',
          name: 'Non-SRD Player Option',
          source: 'PHB',
          description: 'Only available in a user-provided catalog.',
        },
      ],
    })

    expect(
      characterUsesContentOutsideCatalog(
        character,
        createGameDataAvailabilityIndex(makeIncludedSrdData()),
      ),
    ).toBe(true)
  })

  test('detects source-qualified external spells and equipment while ignoring custom unqualified values', () => {
    const base = makeCharacterFixture()
    const external = makeCharacterFixture({
      equipment: [
        {
          id: 'external-item',
          name: 'External Item',
          source: 'XGE',
          type: 'W',
          quantity: 1,
          equipped: false,
        },
      ],
      spells: {
        ...base.spells,
        spellProfiles: [
          {
            ...base.spells.spellProfiles[0],
            spellsKnown: ['External Spell|XGE'],
          },
        ],
      },
    })
    const custom = makeCharacterFixture({
      equipment: [
        {
          id: 'custom-item',
          name: 'Handwritten Keepsake',
          type: 'G',
          quantity: 1,
          equipped: false,
        },
      ],
    })
    const index = createGameDataAvailabilityIndex(makeIncludedSrdData())

    expect(characterUsesContentOutsideCatalog(external, index)).toBe(true)
    expect(characterUsesContentOutsideCatalog(custom, index)).toBe(false)
  })

  test('ignores source-qualified choices while they are dormant', () => {
    const character = makeCharacterFixture({
      classChoiceSelections: [
        {
          choiceId: 'dormant-variant',
          label: 'Dormant Variant',
          kind: 'class-feature',
          inactive: true,
          className: 'Fighter',
          classSource: 'PHB',
          classLevel: 1,
          selected: [
            { entityType: 'classFeature', name: 'External Training', source: 'TCE', slotLevel: 1 },
          ],
        },
      ],
    })

    expect(
      characterUsesContentOutsideCatalog(
        character,
        createGameDataAvailabilityIndex(makeIncludedSrdData()),
      ),
    ).toBe(false)
  })
})
