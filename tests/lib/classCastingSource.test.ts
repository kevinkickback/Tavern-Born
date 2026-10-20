import { describe, expect, test } from 'vitest'
import {
  CLASS_CASTING_PRODUCERS,
  getClassCastingGainAuthority,
  getCurrentClassCastingProducer,
} from '@/lib/5etools/classCastingSource'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import type { OptionalDeclarationOwner } from '@/lib/5etools/optionalClassDeclarationStructure'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { makeClassCastingData, makeClassCastingLayer } from '../fixtures/classCastingFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const EK: OptionalDeclarationOwner = ['subclass', 'fighter', 'phb', 'eldritch knight', 'phb']
const spellcasting = 'subclass-feature|spellcasting|fighter|phb|eldritch knight|phb|3|phb'
const catalog = (data = makeClassCastingData(), owner: OptionalDeclarationOwner = EK) =>
  scopeClassChoiceFeatureCatalogs(
    buildClassChoiceFeatureCatalogs(data),
    owner[0] === 'subclass'
      ? getFeatureOwnerKey(...(owner.slice(1) as [string, string, string, string]))
      : undefined,
  )
const current = (data = makeClassCastingData(), owner = EK, target = spellcasting) =>
  getCurrentClassCastingProducer(catalog(data, owner), owner, target, 3)

describe('source-qualified casting producers and consumed table authority', () => {
  test('native and copied producers retain complete class identity through spelling refresh', () => {
    const data = makeClassCastingData()
    for (const producer of CLASS_CASTING_PRODUCERS) {
      const { owner, target, level } = producer.declaration
      const [, name, source] = JSON.parse(producer.parent) as string[]
      const parent = data.classes.find(
        (row) => row.name.toLowerCase() === name && row.source.toLowerCase() === source,
      )!
      for (const identity of [
        { name: parent.name.toUpperCase(), source: parent.source.toLowerCase() },
        { name: ` ${parent.name} `, source: ` ${parent.source} ` },
      ]) {
        const refreshed = { ...parent, ...identity }
        const currentData = {
          ...data,
          classes: data.classes.map((row) => (row === parent ? refreshed : row)),
        }
        const before = JSON.stringify(currentData)
        const value = getCurrentClassCastingProducer(
          catalog(currentData, owner),
          owner,
          target,
          level,
        )
        expect(value, JSON.stringify(owner)).toBeTruthy()
        expect(value!.declaration.classData).toBe(refreshed)
        if (owner[0] === 'class') expect(value!.declaration.parent).toBe(refreshed)
        expect(JSON.stringify(currentData)).toBe(before)
      }
    }
  })

  test.each(
    CLASS_CASTING_PRODUCERS.filter((row) => row.declaration.owner[0] === 'subclass'),
  )('an unproven subclass slot override cannot replace the certified provider for $declaration.owner', (producer) => {
    const data = makeClassCastingData()
    const { owner, target, level } = producer.declaration
    const withSlots = (spellSlotProgression: unknown) => ({
      ...data,
      classes: data.classes.map((cls) =>
        cls.name.toLowerCase() === owner[1] && cls.source.toLowerCase() === owner[2]
          ? {
              ...cls,
              subclasses: cls.subclasses!.map((sub) =>
                sub.name.toLowerCase() === owner[3] && sub.source.toLowerCase() === owner[4]
                  ? { ...sub, spellSlotProgression: spellSlotProgression as never }
                  : sub,
              ),
            }
          : cls,
      ),
    })
    const gain = (value: typeof data) =>
      getClassCastingGainAuthority(catalog(value, owner), owner, target, level, 'class-known', 3)
    expect(
      gain(withSlots(Array.from({ length: 20 }, () => [0, 0, 0, 0, 0, 0, 0, 0, 1]))),
    ).toBeUndefined()
    expect(gain(withSlots(null))?.maxSpellLevel).toBe(1)
    expect(gain(withSlots(undefined))?.maxSpellLevel).toBe(1)
    expect(gain(data)?.maxSpellLevel).toBe(1)
  })

  test('every native relation survives production parsing, layering and its exact selected owner', () => {
    const data = makeClassCastingData(),
      before = JSON.stringify(data)
    for (const row of CLASS_CASTING_PRODUCERS) {
      const d = row.declaration
      expect(
        getCurrentClassCastingProducer(catalog(data, d.owner), d.owner, d.target, d.level),
        JSON.stringify(d.owner) + ' ' + d.target,
      ).toBeTruthy()
    }
    expect(JSON.stringify(data)).toBe(before)
    const restored = JSON.parse(before) as typeof data
    for (const row of CLASS_CASTING_PRODUCERS) {
      const d = row.declaration
      expect(
        getCurrentClassCastingProducer(catalog(restored, d.owner), d.owner, d.target, d.level),
      ).toBeTruthy()
    }
  })

  test('identical parent proofs are ambiguous while repeated source layers retain one winning proof', () => {
    const data = makeClassCastingData()
    const c = catalog(data)
    const parent = c.classCastingSources!.find(
      (row) => row.kind === 'casting-parent' && row.target === '["class","fighter","phb"]',
    )!
    expect(current(data)).toBeTruthy()
    expect(
      getCurrentClassCastingProducer(
        { ...c, classCastingSources: [...c.classCastingSources!, { ...parent }] },
        EK,
        spellcasting,
        3,
      ),
    ).toBeUndefined()
    expect(getCurrentClassCastingProducer(c, EK, spellcasting, 3)).toBeTruthy()

    const layer = makeClassCastingLayer('class/class-fighter.json')
    const repeated = composeGameDataLayers([layer, layer])
    expect(
      repeated.classCastingSources!.filter(
        (row) => row.kind === 'casting-parent' && row.target === parent.target,
      ),
    ).toHaveLength(1)
    expect(current(repeated)).toBeTruthy()
    expect(current(JSON.parse(JSON.stringify(repeated)))).toBeTruthy()
  })

  test('daily leveled preparation is excluded while genuine cantrip gains and Wizard increments remain', () => {
    const producer = (name: string, source: string) =>
      CLASS_CASTING_PRODUCERS.find(
        (row) =>
          JSON.stringify(row.declaration.owner) === JSON.stringify(['class', name, source]) &&
          row.declaration.target.includes('|spellcasting|'),
      )!
    for (const [name, source] of [
      ['cleric', 'phb'],
      ['druid', 'xphb'],
      ['artificer', 'tce'],
      ['artificer', 'efa'],
    ]) {
      expect(producer(name, source).domains['class-cantrip']?.[0].count).toBeGreaterThan(0)
      expect(producer(name, source).domains['class-known']).toBeUndefined()
    }
    for (const name of ['ranger', 'paladin'])
      expect(producer(name, 'xphb').domains['class-known']).toBeUndefined()
    for (const source of ['phb', 'xphb']) {
      expect(producer('wizard', source).domains['class-spellbook']).toEqual(
        Array.from({ length: 20 }, (_, i) => ({ level: i + 1, count: i === 0 ? 6 : 2 })),
      )
      expect(producer('wizard', source).domains['class-known']).toBeUndefined()
    }
    expect(producer('spellcaster sidekick', 'tce').domains).toEqual({})
    expect(producer('bard', 'xphb').domains['class-known']?.[0]).toEqual({ level: 1, count: 4 })
  })

  test('all eight Arcanum producers have only their separate exact gained level and spell level', () => {
    const arcanum = CLASS_CASTING_PRODUCERS.filter((row) =>
      row.declaration.target.includes('|mystic arcanum'),
    )
    expect(arcanum).toHaveLength(8)
    for (const source of ['phb', 'xphb']) {
      const rows = arcanum.filter((row) => row.declaration.owner[2] === source)
      expect(rows.map((row) => row.domains)).toEqual(
        [11, 13, 15, 17].map((level, i) => ({
          'class-arcanum': [{ level, count: 1, spellLevel: i + 6 }],
        })),
      )
    }
  })

  test('copied PHB school privilege stays with the requested target while actual XPHB table supplies its ceiling', () => {
    const owner: OptionalDeclarationOwner = [
      'subclass',
      'fighter',
      'xphb',
      'eldritch knight',
      'phb',
    ]
    const c = catalog(makeClassCastingData(), owner)
    const gain = getClassCastingGainAuthority(c, owner, spellcasting, 3, 'class-known', 3)
    expect(gain?.rule.schools).toEqual(['A', 'V'])
    expect(gain?.rule.unrestrictedGains).toEqual([3, 8, 14, 20])
    expect(gain?.maxSpellLevel).toBe(1)
    expect(gain?.provider).toBeUndefined()
    expect(gain?.effective.source).toBe('XPHB')
    const at = CLASS_CASTING_PRODUCERS.find(
      (row) => row.declaration.owner[1] === 'rogue' && row.declaration.owner[2] === 'phb',
    )!
    expect(at.domains['class-cantrip']?.[0]).toEqual({ level: 3, count: 2 })
    expect(at.schools).toEqual(['E', 'I'])
  })

  test('current empty evidence and optional proof substitution cannot supply casting authority', () => {
    const c = catalog()
    expect(
      getCurrentClassCastingProducer({ ...c, classCastingSources: [] }, EK, spellcasting, 3),
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer({ ...c, classCastingSources: undefined }, EK, spellcasting, 3),
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(
        {
          ...c,
          classCastingSources: c.classCastingSources!.map((row) => ({
            ...row,
            kind: 'declaration' as never,
          })),
        },
        EK,
        spellcasting,
        3,
      ),
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(c, EK, spellcasting.replace('|phb|3|', '|tce|3|'), 3),
    ).toBeUndefined()
    expect(getCurrentClassCastingProducer(c, EK, spellcasting, 4)).toBeUndefined()
  })

  test('changed actual parent is denied while a forged foreign table cannot affect own access', () => {
    const data = makeClassCastingData()
    const changed = {
      ...data,
      classes: data.classes.map((row) =>
        row.name === 'Fighter' && row.source === 'PHB'
          ? { ...row, cantripProgression: Array(20).fill(9) }
          : row,
      ),
    }
    expect(current(changed)).toBeUndefined()
    const forged = {
      ...data,
      classes: data.classes.map((row) =>
        row.name === 'Wizard' && row.source === 'PHB'
          ? { ...row, spellSlotProgression: Array(20).fill([99]) }
          : row,
      ),
    }
    const c = catalog(forged)
    // A foreign table cannot override the selected subclass's certified own table.
    expect(
      getClassCastingGainAuthority(c, EK, spellcasting, 3, 'class-known', 3)?.maxSpellLevel,
    ).toBe(1)
    expect(current(data)).toBeTruthy()
  })

  test('a subclass own table stays independent of absent and unreviewed foreign providers', () => {
    const data = makeClassCastingData()
    const absentWizard = {
      ...data,
      classes: data.classes.filter((row) => !(row.name === 'Wizard' && row.source === 'PHB')),
    }
    const alternate = getClassCastingGainAuthority(
      catalog(absentWizard),
      EK,
      spellcasting,
      3,
      'class-known',
      3,
    )
    expect(alternate?.provider).toBeUndefined()
    expect(alternate?.maxSpellLevel).toBe(1)
    const wizard = data.classes.find((row) => row.name === 'Wizard' && row.source === 'PHB')!
    const fake = { ...data, classes: [{ ...wizard, name: ' Wizard ' }, ...absentWizard.classes] }
    expect(
      getClassCastingGainAuthority(catalog(fake), EK, spellcasting, 3, 'class-known', 3)
        ?.maxSpellLevel,
    ).toBe(1)
    const unknown = {
      ...data,
      classes: [
        { ...wizard, name: 'Unreviewed full caster' },
        ...absentWizard.classes.filter(
          (row) => row.source !== 'PHB' || row.casterProgression !== 'full',
        ),
      ],
    }
    expect(
      getClassCastingGainAuthority(catalog(unknown), EK, spellcasting, 3, 'class-known', 3)
        ?.maxSpellLevel,
    ).toBe(1)
  })

  test('own table needs no foreign provider; winning parent without proof suspends and exact restore recovers', () => {
    const owner: OptionalDeclarationOwner = ['class', 'wizard', 'phb']
    const target = 'class-feature|spellcasting|wizard|phb|1|phb'
    const layer = makeClassCastingLayer('class/class-wizard.json')
    const data = composeGameDataLayers([layer])
    expect(
      getClassCastingGainAuthority(catalog(data, owner), owner, target, 1, 'class-spellbook', 1)
        ?.maxSpellLevel,
    ).toBe(1)
    const winner = makeGameDataFixture({
      classes: layer.classes,
      classFeatures: [],
      classCastingSources: [],
    })
    expect(
      getClassCastingGainAuthority(
        catalog(composeGameDataLayers([layer, winner]), owner),
        owner,
        target,
        1,
        'class-spellbook',
        1,
      ),
    ).toBeUndefined()
    expect(
      getClassCastingGainAuthority(
        catalog(composeGameDataLayers([layer, winner, layer]), owner),
        owner,
        target,
        1,
        'class-spellbook',
        1,
      )?.maxSpellLevel,
    ).toBe(1)
  })

  test('raw duplicate owner is denied before class Maps; unrelated sibling declaration stays independent', () => {
    const layers = [
      makeClassCastingLayer('class/class-fighter.json', (document) => {
        document.class.push(
          structuredClone(
            document.class.find((row) => row.name === 'Fighter' && row.source === 'PHB')!,
          ),
        )
      }),
      makeClassCastingLayer('class/class-wizard.json'),
    ]
    expect(
      getClassCastingGainAuthority(
        catalog(composeGameDataLayers(layers)),
        EK,
        spellcasting,
        3,
        'class-known',
        3,
      ),
    ).toBeUndefined()
    const sibling = makeClassCastingLayer('class/class-fighter.json', (document) => {
      const cls = document.class.find((row) => row.name === 'Fighter' && row.source === 'PHB')!
      ;(cls.classFeatures as unknown[]).push('Unrelated|Fighter||20')
      document.classFeature.push({
        name: 'Unrelated',
        className: 'Fighter',
        classSource: 'PHB',
        source: 'PHB',
        level: 20,
        entries: ['Independent text'],
      })
    })
    expect(
      current(composeGameDataLayers([sibling, makeClassCastingLayer('class/class-wizard.json')])),
    ).toBeTruthy()
  })
})
