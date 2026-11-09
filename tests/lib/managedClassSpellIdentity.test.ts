import { describe, expect, test } from 'vitest'
import {
  CLASS_CASTING_PRODUCERS,
  getClassSpellProfilePolicy,
} from '@/lib/5etools/classCastingRules'
import { selectedFeatureSpellAddress } from '@/lib/5etools/selectedFeatureSpellIdentity'
import {
  decodeManagedClassSpellId,
  makeManagedClassSpellTag,
  managedClassSpellId,
} from '@/lib/character/managedClassSpellIdentity'
import {
  removeManagedClassSpellMaterialization,
  stripManagedClassSpellState,
} from '@/lib/character/managedClassSpellState'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellChoice } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const slot: ManagedClassSpellChoice['slot'] = [
  ['class', 'bard', 'phb'],
  'class-cantrip',
  'class-feature|spellcasting|bard|phb|1|phb',
  1,
  0,
]
const choice = (): ManagedClassSpellChoice => ({
  slot: structuredClone(slot),
  target: { name: 'Light', source: 'PHB' },
  revision: 1,
  policy: 'default',
})
function materialized(): Character {
  const intent = choice()
  const entry = { name: 'Bard', source: 'PHB', levels: 1 }
  const character = makeCharacterFixture({
    classProgression: [entry],
    managedClassSpellChoices: [intent],
    managedClassSpellRevision: 1,
  })
  character.spells.spellProfiles[0] = {
    id: 'class:Bard|PHB',
    type: 'class',
    label: 'Bard (Lv 1)',
    className: 'Bard',
    classSource: 'PHB',
    cantrips: ['Light|PHB'],
    spellsKnown: [],
    preparedSpells: [],
    alwaysPrepared: false,
  }
  character.provenance.spells.light = [makeManagedClassSpellTag(intent, entry)]
  return character
}
const parse = (character: Character) =>
  characterPersistenceSchema.safeParse(JSON.parse(JSON.stringify(character)))

describe('strict numeric class spell identity and saved inverse', () => {
  test.each([
    undefined,
    -1,
    1.5,
    0,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects missing, invalid or lagging allocation watermark %s', (watermark) => {
    const character = materialized()
    character.managedClassSpellRevision = watermark
    expect(parse(character).success).toBe(false)
  })
  test('current format rejects eleven without conversion and admits exact dormant intent without catalogs', () => {
    const character = materialized()
    expect(character.schemaVersion).toBe(CURRENT_CHARACTER_SCHEMA_VERSION)
    expect(parse(character).success).toBe(true)
    expect(parse({ ...character, schemaVersion: 11 }).success).toBe(false)
    expect(parse({ ...character, schemaVersion: 13 }).success).toBe(false)
    expect(parse({ ...character, schemaVersion: 14 }).success).toBe(false)
    const dormant = stripManagedClassSpellState(character)
    dormant.classProgression = [{ name: 'Fighter', source: 'PHB', levels: 1 }]
    dormant.initialClass = undefined
    expect(parse(dormant).success).toBe(true)
    expect(dormant.managedClassSpellChoices).toEqual([choice()])
    expect(dormant.provenance.spells).toEqual({})
    expect(dormant.spells.spellProfiles[0].cantrips).toEqual([])
  })

  test('generic saved feature and numeric owners share one member and have precise source-free inverses', () => {
    // Structural persistence/inverse challenge for a future producer; this supplies no live rules.
    // Current source projection must still prove any feature before granting its benefits.
    const character = materialized()
    const choiceId = 'class:bard|phb|choice:additional-cantrips|1'
    character.classChoiceSelections = [
      {
        choiceId,
        label: 'Additional cantrips',
        kind: 'optional-feature',
        className: 'Bard',
        classSource: 'PHB',
        classLevel: 1,
        selected: [
          { entityType: 'optionalFeature', name: 'Future teacher', source: 'HB', slotLevel: 1 },
        ],
      },
    ]
    const feature: ManagedClassSpellChoice = {
      slot: [
        ['class', 'bard', 'phb'],
        'feature-cantrip',
        selectedFeatureSpellAddress([
          choiceId,
          'optionalFeature',
          'future teacher',
          'hb',
          null,
          0,
          0,
        ]),
        1,
        0,
      ],
      target: { name: 'Light', source: 'PHB' },
      revision: 2,
      policy: 'default',
    }
    character.managedClassSpellChoices!.push(feature)
    character.managedClassSpellRevision = 2
    character.provenance.spells.light.push(
      makeManagedClassSpellTag(feature, character.classProgression[0], 'Future teacher'),
    )
    expect(parse(character).success).toBe(true)
    const numeric = character.managedClassSpellChoices![0]
    for (const removed of [numeric, feature]) {
      const result = removeManagedClassSpellMaterialization(character, [removed])
      result.managedClassSpellChoices = result.managedClassSpellChoices!.filter(
        (row) => row !== removed,
      )
      expect(result.spells.spellProfiles[0].cantrips).toEqual(['Light|PHB'])
      expect(result.provenance.spells.light).toHaveLength(1)
      expect(parse(result).success).toBe(true)
      const empty = removeManagedClassSpellMaterialization(result, result.managedClassSpellChoices!)
      empty.managedClassSpellChoices = []
      expect(empty.spells.spellProfiles[0].cantrips).toEqual([])
      expect(parse(empty).success).toBe(true)
    }
    const duplicate = structuredClone(character)
    const extra = structuredClone(feature)
    extra.slot[4] = 1
    extra.revision = 3
    duplicate.managedClassSpellChoices!.push(extra)
    duplicate.managedClassSpellRevision = 3
    expect(parse(duplicate).success).toBe(false)
  })

  test.each([
    [
      'record deletion',
      (c: Character) => {
        delete c.managedClassSpellChoices
      },
    ],
    [
      'tag deletion',
      (c: Character) => {
        c.provenance.spells = {}
      },
    ],
    [
      'member deletion',
      (c: Character) => {
        c.spells.spellProfiles[0].cantrips = []
      },
    ],
    [
      'wrong printing',
      (c: Character) => {
        c.provenance.spells.light[0].grantSource = 'XPHB'
      },
    ],
    [
      'wrong owner',
      (c: Character) => {
        c.provenance.spells.light[0].sourceRef = 'XPHB'
      },
    ],
    [
      'wrong gain',
      (c: Character) => {
        c.provenance.spells.light[0].spellGrantedAtLevel = 2
      },
    ],
    [
      'inferred tag',
      (c: Character) => {
        c.provenance.spells.light[0].spellAttributionMode = 'inferred-lowest-eligible'
      },
    ],
    [
      'wrong kind',
      (c: Character) => {
        const p = c.spells.spellProfiles[0]
        p.spellsKnown = p.cantrips
        p.cantrips = []
      },
    ],
    [
      'duplicate tag',
      (c: Character) => {
        c.provenance.spells.light.push({ ...c.provenance.spells.light[0] })
      },
    ],
    [
      'duplicate I',
      (c: Character) => {
        c.managedClassSpellChoices!.push(structuredClone(c.managedClassSpellChoices![0]))
      },
    ],
    [
      'same logical target at another I',
      (c: Character) => {
        const other = structuredClone(c.managedClassSpellChoices![0])
        other.slot[4] = 1
        c.managedClassSpellChoices!.push(other)
      },
    ],
    [
      'unknown ordinal',
      (c: Character) => {
        c.managedClassSpellChoices![0].slot[4] = 99
      },
    ],
    [
      'source embedded in target name',
      (c: Character) => {
        c.managedClassSpellChoices![0].target.name = 'Light|PHB'
      },
    ],
    [
      'redundant activity flag',
      (c: Character) => {
        Object.assign(c.managedClassSpellChoices![0], { applied: {} })
      },
    ],
    [
      'cantrip preparation request',
      (c: Character) => {
        c.managedClassSpellChoices![0].prepare = true
      },
    ],
    [
      'raw class manual bypass',
      (c: Character) => {
        c.provenance.spells.light[0].grantVariant = undefined
      },
    ],
  ])('rejects %s without repairing saved state', (_name, change) => {
    const character = materialized()
    change(character)
    const before = JSON.stringify(character)
    expect(parse(character).success).toBe(false)
    expect(JSON.stringify(character)).toBe(before)
  })

  test('reserved ownership cannot move to another provenance domain', () => {
    for (const domain of ['features', 'feats', 'equipment'] as const) {
      const character = materialized()
      character.provenance[domain].light = [{ ...character.provenance.spells.light[0] }]
      expect(parse(character).success).toBe(false)
    }
    const character = materialized()
    character.provenance.proficiencies.skills.light = [{ ...character.provenance.spells.light[0] }]
    expect(parse(character).success).toBe(false)
  })

  test('stripping managed union retains exact fixed overlap and unrelated Bonus ownership without writes', () => {
    const character = materialized()
    character.spells.spellProfiles[0].fixedSpells = ['Light|PHB']
    character.spells.spellProfiles[1].cantrips = ['Light|XPHB']
    character.provenance.spells.light.push({
      sourceType: 'manual',
      sourceName: 'User Choice',
      label: 'User Choice',
      grantType: 'choice',
      grantSource: 'XPHB',
    })
    const before = JSON.stringify(character)
    const stripped = stripManagedClassSpellState(character)
    expect(parse(stripped).success).toBe(true)
    expect(stripped.spells.spellProfiles[0].cantrips).toEqual(['Light|PHB'])
    expect(stripped.spells.spellProfiles[1].cantrips).toEqual(['Light|XPHB'])
    expect(stripped.provenance.spells.light).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
    expect(JSON.stringify(character)).toBe(before)
    const wrongPrinting = materialized()
    wrongPrinting.spells.spellProfiles[0].fixedSpells = ['Light|XPHB']
    wrongPrinting.provenance.spells = {}
    expect(parse(wrongPrinting).success).toBe(false)
  })

  test('every finite numeric slot, including Arcanum, has canonical encoding', () => {
    for (const row of CLASS_CASTING_PRODUCERS)
      for (const [domain, gains] of Object.entries(row.domains))
        for (const gain of gains!) {
          const candidate = [
            row.declaration.owner,
            domain,
            row.declaration.target,
            gain.level,
            0,
          ] as ManagedClassSpellChoice['slot']
          expect(decodeManagedClassSpellId(managedClassSpellId(candidate))).toEqual(candidate)
        }
    expect(
      decodeManagedClassSpellId(managedClassSpellId(slot).replace('%5B', '%5b')),
    ).toBeUndefined()
  })

  test('pure profile policy distinguishes all nine daily owners, Wizard learning and seven genuine overlays', () => {
    for (const [name, source] of [
      ['artificer', 'tce'],
      ['artificer', 'efa'],
      ['cleric', 'phb'],
      ['cleric', 'xphb'],
      ['druid', 'phb'],
      ['druid', 'xphb'],
      ['paladin', 'phb'],
      ['paladin', 'xphb'],
      ['ranger', 'xphb'],
    ])
      expect(getClassSpellProfilePolicy({ name, source, levels: 1 }).mode).toBe('daily')
    for (const source of ['phb', 'xphb'])
      expect(getClassSpellProfilePolicy({ name: 'wizard', source, levels: 1 }).mode).toBe(
        'spellbook',
      )
    for (const row of CLASS_CASTING_PRODUCERS.filter(
      (row) => row.declaration.owner[0] === 'subclass',
    )) {
      const [, name, source, subclass, subclassSource] = row.declaration.owner
      expect(
        getClassSpellProfilePolicy({ name, source, subclass, subclassSource, levels: 3 }).mode,
      ).toBe('known')
    }
    expect(
      getClassSpellProfilePolicy({ name: 'Spellcaster Sidekick', source: 'TCE', levels: 3 }).mode,
    ).toBe('none')
    expect(
      getClassSpellProfilePolicy({
        name: 'Fighter',
        source: 'PHB',
        subclass: 'Unknown role',
        subclassSource: 'PHB',
        levels: 3,
      }).mode,
    ).toBe('none')
  })
})
