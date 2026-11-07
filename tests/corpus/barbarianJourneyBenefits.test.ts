// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import {
  getCurrentGiantPower,
  hasIncludedSrdGiantSpellProof,
} from '@/lib/5etools/barbarianGiantPower'
import { getSavedBarbarianPathOption } from '@/lib/5etools/barbarianPathChoiceIdentity'
import { getBarbarianRitualGrants } from '@/lib/5etools/barbarianRitualSpells'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { getClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { REVISED_PRIMAL_KNOWLEDGE_TARGET } from '@/lib/5etools/classProficiencyRules'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClassDocument, parseClasses } from '@/lib/5etools/parsers/classes'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { giantPowerSpellSlots } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { getEffectiveCarryCapacity } from '@/lib/calculations/carryingCapacity'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  getCharacterClassResources,
  WARRIOR_OF_THE_GODS_RESOURCE_ID,
} from '@/lib/calculations/classResources'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getSelectedFeatureCantripSetups } from '@/lib/character/selectedFeatureSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { isValidClassProficiencySelection } from '@/lib/schema/classProficiencyValidation'
import type { Class5e, ClassFeature, Spell5e } from '@/types/5etools'
import type { Character, Equipment } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const catalogsToTest = [['bundled', 'resources/srd/core/data']] as Array<
  ['bundled' | 'local', string]
>
if (existsSync('data/class/class-barbarian.json')) catalogsToTest.push(['local', 'data'])

test('a new Barbarian path prints named intro rules and later declarations at their earned gains', async () => {
  const document = JSON.parse(
    await readFile('resources/srd/core/data/class/class-barbarian.json', 'utf8'),
  )
  document.subclass.push({
    name: 'Path of the Trial',
    shortName: 'Trial',
    className: 'Barbarian',
    classSource: 'XPHB',
    source: 'XPHB',
    subclassFeatures: [
      'Path of the Trial|Barbarian|XPHB|Trial|XPHB|3|XPHB',
      'Later Trial|Barbarian|XPHB|Trial|XPHB|6|XPHB',
    ],
  })
  const owner = {
    className: 'Barbarian',
    classSource: 'XPHB',
    subclassShortName: 'Trial',
    subclassSource: 'XPHB',
    source: 'XPHB',
  }
  document.subclassFeature.push(
    {
      ...owner,
      name: 'Path of the Trial',
      level: 3,
      entries: [
        'Ordinary introduction.',
        {
          type: 'entries',
          name: 'First Trial',
          entries: [
            { type: 'entries', name: 'Broken nested entry', entries: {} },
            'Earned inline rule.',
          ],
        },
      ],
    },
    { ...owner, name: 'Later Trial', level: 6, entries: ['Earned later rule.'] },
  )
  const parsed = parseClassDocument(document)
  const classes = parsed.classes as Class5e[]
  const classFeatures = parsed.classFeatures as ClassFeature[]
  const inputs = {
    classChoiceClasses: classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs({ classes, classFeatures }),
  }
  const sheet = (levels: number) =>
    createCharacterSheetViewModel(
      makeCharacterFixture({
        originSystem: '2024',
        allowedSources: ['XPHB'],
        classProgression: [
          {
            name: 'Barbarian',
            source: 'XPHB',
            subclass: 'Path of the Trial',
            subclassSource: 'XPHB',
            levels,
          },
        ],
      }),
      inputs,
      inputs,
    )
  const names = (levels: number) =>
    sheet(levels).declaredClassFeatureSummaries?.map((row) => row.compactText)
  expect(names(2)).not.toContain('First Trial')
  expect(names(3)).toContain('First Trial')
  expect(names(5)).not.toContain('Later Trial')
  expect(names(6)).toContain('Later Trial')
  for (const id of ['2024-official', '2024-custom'] as const) {
    const pdf = await PDFDocument.load(await generateTestCharacterSheet(sheet(6), id))
    const text = pdf
      .getForm()
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText()] : []))
      .join(' ')
    expect(text).toContain('Earned inline rule.')
    expect(text).toContain('Earned later rule.')
    expect(text).not.toContain('Ordinary introduction.')
    expect(text).not.toContain('Broken nested entry')
  }
}, 30_000)

test.skipIf(catalogsToTest.length === 1)(
  'Barbarian copied spell features require inherited Wisdom and a matching schedule',
  async () => {
    const document = JSON.parse(await readFile('data/class/class-barbarian.json', 'utf8'))
    const power = (doc: typeof document, source: string) => {
      const cls = (parseClasses(doc) as Class5e[]).find(
        (row) => row.name === 'Barbarian' && row.source === source,
      )
      const path = cls?.subclasses?.find(
        (row) => row.name === 'Path of the Giant' && row.source === 'BGG',
      )
      if (!cls || !path) throw new Error(`Missing Path of the Giant for ${source}`)
      return getCurrentGiantPower(cls, path)
    }
    expect(power(document, 'PHB')).toBeDefined()
    expect(power(document, 'XPHB')).toBeDefined()
    const classic = document.subclass.find(
      (row: { name: string; classSource: string }) =>
        row.name === 'Path of the Giant' && row.classSource === 'PHB',
    )
    const revised = document.subclass.find(
      (row: { name: string; classSource: string }) =>
        row.name === 'Path of the Giant' && row.classSource === 'XPHB',
    )
    revised.spellcastingAbility = 'wis'
    expect(power(document, 'PHB')).toBeDefined()
    expect(power(document, 'XPHB')).toBeUndefined()
    classic.spellcastingAbility = 'cha'
    expect(power(document, 'PHB')).toBeUndefined()
    expect(power(document, 'XPHB')).toBeUndefined()
    delete revised.spellcastingAbility
    classic.spellcastingAbility = 'wis'
    expect(power(document, 'XPHB')).toBeDefined()
    const feature = document.subclassFeature.find(
      (row: { name: string }) => row.name === 'Giant Power',
    )
    classic.additionalSpells[0].innate['3'] = ['light#c']
    expect(power(document, 'PHB')).toBeUndefined()
    feature.entries[1] = feature.entries[1].replace('{@spell druidcraft}', '{@spell light}')
    expect(power(document, 'PHB')).toEqual(['light|PHB', 'thaumaturgy|PHB'])
    expect(power(document, 'XPHB')).toEqual(['light|PHB', 'thaumaturgy|PHB'])
    for (const malformed of [
      { innate: { '3': ['light#c', { choose: { from: ['druidcraft#c'] } }] } },
      { innate: { '3': ['light|XPHB#c'] } },
      { innate: { '3': ['thaumaturgy#c'] } },
      { innate: { '3': { will: ['light#c'] } } },
      { innate: { '4': ['light#c'] } },
    ]) {
      classic.additionalSpells[0] = malformed
      expect(power(document, 'PHB')).toBeUndefined()
      expect(power(document, 'XPHB')).toBeUndefined()
    }
    const ancestral = document.subclass.filter(
      (row: { name: string }) => row.name === 'Path of the Ancestral Guardian',
    )
    ancestral.find(
      (row: { classSource: string }) => row.classSource === 'PHB',
    ).spellcastingAbility = 'cha'
    ancestral.find(
      (row: { classSource: string }) => row.classSource === 'XPHB',
    ).spellcastingAbility = 'wis'
    const revisedClass = (parseClasses(document) as Class5e[]).find(
      (row) => row.name === 'Barbarian' && row.source === 'XPHB',
    )
    const revisedPath = revisedClass?.subclasses?.find(
      (row) => row.name === 'Path of the Ancestral Guardian',
    )
    if (!revisedClass || !revisedPath) throw new Error('Missing revised Ancestral Guardian')
    expect(getBarbarianRitualGrants(revisedClass, revisedPath, 10)).toEqual([])
  },
)

test.skipIf(catalogsToTest.length === 1)(
  'Wild Heart rituals require the Wisdom ability declared by the feature',
  async () => {
    const document = JSON.parse(await readFile('data/class/class-barbarian.json', 'utf8'))
    const wild = document.subclass.find(
      (row: { name: string; classSource: string }) =>
        row.name === 'Path of the Wild Heart' && row.classSource === 'XPHB',
    )
    const grants = (source: string, name: string) => {
      const cls = (parseClasses(document) as Class5e[]).find(
        (row) => row.name === 'Barbarian' && row.source === source,
      )
      const path = cls?.subclasses?.find((row) => row.name === name && row.source === source)
      if (!cls || !path) throw new Error(`Missing ${name} for ${source}`)
      return getBarbarianRitualGrants(cls, path, 10)
    }
    for (const ability of [undefined, ' WIS ']) {
      wild.spellcastingAbility = ability
      expect(grants('XPHB', 'Path of the Wild Heart')).toHaveLength(3)
    }
    for (const ability of ['cha', 42, { code: 'wis' }]) {
      wild.spellcastingAbility = ability
      expect(grants('XPHB', 'Path of the Wild Heart')).toEqual([])
      expect(grants('PHB', 'Path of the Totem Warrior')).toHaveLength(3)
    }
  },
)

test('Included SRD proves both Giant Power cantrips without accepting changed classic records', async () => {
  const spells = await Promise.all(
    ['phb', 'xphb'].map(
      async (source) =>
        parseSpells(
          JSON.parse(
            await readFile(`resources/srd/core/data/spells/spells-${source}.json`, 'utf8'),
          ),
        ) as Spell5e[],
    ),
  )
  const byKey = buildSpellLookup(spells.flat())
  for (const name of ['Druidcraft', 'Thaumaturgy']) {
    const classicKey = `${name}|PHB`
    const classic = byKey[classicKey]
    expect(hasIncludedSrdGiantSpellProof(name, byKey)).toBe(true)
    for (const changed of [
      { ...classic, reprintedAs: ['Other Spell|XPHB'] },
      { ...classic, entries: ['Changed spell rules.'] },
    ])
      expect(hasIncludedSrdGiantSpellProof(name, { ...byKey, [classicKey]: changed })).toBe(false)
  }
  const duplicate = buildSpellLookup([...spells.flat(), structuredClone(byKey['Druidcraft|PHB'])])
  expect(hasIncludedSrdGiantSpellProof('Druidcraft', duplicate)).toBe(false)
})

test.each(catalogsToTest)(
  'Barbarian setup follows both base class tables and revised Primal Knowledge (%s)',
  async (type, directory) => {
    const root = resolve(directory)
    const data = composeGameDataLayers([
      await new FiveEToolsDataLoader(
        type === 'bundled'
          ? {
              type,
              path: 'srd/core',
              packId: 'tavern-born-srd-core',
              packVersion: '1.0.1',
              isValid: true,
            }
          : { type, path: root, isValid: true },
        { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
      ).loadAllData(),
    ])
    const raw = buildGameDataLookups(data)
    for (const source of ['PHB', 'XPHB'] as const) {
      const current = {
        ...data,
        classes: DataFilter.filterClasses(data.classes, { sources: [source, 'BGG', 'XGE'] }),
      }
      const catalogs = buildClassChoiceFeatureCatalogs(current)
      const cls = catalogs.classes?.find((row) => row.name === 'Barbarian' && row.source === source)
      if (!cls) throw new Error('Missing Barbarian class for ' + source)
      const lookups = {
        ...buildGameDataLookups(current),
        classChoiceClasses: current.classes,
        classChoiceFeatureCatalogs: catalogs,
      }
      const actor = (levels: number) =>
        makeCharacterFixture({
          originSystem: source === 'PHB' ? '2014' : '2024',
          allowedSources: [source],
          classProgression: [{ name: 'Barbarian', source, levels }],
          abilityScores: {
            strength: 22,
            dexterity: 14,
            constitution: 16,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
          movement: { speeds: { walk: 30 }, source: { kind: 'manual', name: 'Walking speed' } },
        })
      const calculate = (character: Character) =>
        createCharacterCalculationContext(character, lookups, raw)
      const sheet = (character: Character) => createCharacterSheetViewModel(character, raw, lookups)
      for (const level of [2, 3, 4, 5, 19, 20]) {
        const expected = [
          'Rage',
          'Unarmored Defense',
          ...(level >= 5 ? ['Fast Movement'] : []),
          ...(level === 20 ? ['Primal Champion'] : []),
          ...(source === 'XPHB' && level >= 3 ? ['Primal Knowledge'] : []),
        ]
        expect(
          sheet(actor(level)).declaredClassFeatureSummaries?.map((row) => row.compactText),
        ).toEqual(expected)
      }
      const withoutOwner = current.classes.filter((row) => row !== cls)
      const filteredSheet = createCharacterSheetViewModel(actor(20), raw, {
        ...lookups,
        classChoiceClasses: withoutOwner,
        classChoiceFeatureCatalogs: { ...catalogs, classes: withoutOwner },
      })
      expect(filteredSheet.declaredClassFeatureSummaries ?? []).toEqual([])
      expect(
        sheet(actor(20)).declaredClassFeatureSummaries?.map((row) => row.compactText),
      ).toContain('Primal Champion')
      const shield: Equipment = {
        id: 'shield',
        name: 'Shield',
        type: 'S',
        quantity: 1,
        equipped: true,
        armorType: 'shield',
        ac: 2,
      }
      const chain: Equipment = {
        id: 'chain',
        name: 'Chain Mail',
        type: 'HA',
        quantity: 1,
        equipped: true,
        armorType: 'heavy',
        ac: 16,
      }
      expect(sheet(actor(1)).effectiveArmorClass).toBe(15)
      expect(sheet({ ...actor(1), equipment: [shield] }).effectiveArmorClass).toBe(17)
      expect(sheet({ ...actor(1), equipment: [shield, chain] }).effectiveArmorClass).toBe(18)
      expect(calculate(actor(4)).movement.speeds.walk).toBe(30)
      expect(calculate(actor(5)).movement.speeds.walk).toBe(40)
      expect(calculate({ ...actor(5), equipment: [chain] }).movement.speeds.walk).toBe(30)
      expect(calculate(actor(19)).abilityScores.total.strength).toBe(22)
      expect(calculate(actor(20)).abilityScores.total.strength).toBe(source === 'PHB' ? 24 : 25)
      expect(calculate(actor(20)).abilityScores.total.constitution).toBe(20)
      const oppositeEdition = (character: Character) =>
        characterPersistenceSchema.parse({
          ...character,
          originSystem: source === 'PHB' ? '2024' : '2014',
          allowedSources: [],
        })
      const mismatched = oppositeEdition(actor(20))
      expect(sheet(mismatched).effectiveArmorClass).toBe(12)
      expect(calculate(mismatched).movement.speeds.walk).toBe(30)
      expect(calculate(mismatched).abilityScores.total.strength).toBe(22)
      if (type === 'local') {
        const ancestral = (level: number) => ({
          ...actor(level),
          allowedSources: [source, 'XGE'],
          classProgression: [
            {
              ...actor(level).classProgression[0],
              subclass: 'Path of the Ancestral Guardian',
              subclassSource: 'XGE',
            },
          ],
        })
        expect(calculate(ancestral(9)).fixedClassSpellStatuses).toEqual([])
        expect(calculate(ancestral(10)).fixedClassSpellStatuses).toMatchObject(
          ['Augury', 'Clairvoyance'].map((name) => ({
            reference: `${name}|${source}`,
            active: true,
            prepared: false,
            castOnly: { ignoresMaterial: true },
            castingNote: expect.stringContaining('shared use'),
          })),
        )
        const guardian = getSelectedSubclassData(cls, ancestral(10).classProgression[0])
        if (!guardian) throw new Error('Missing Ancestral Guardian')
        for (const spellcastingAbility of ['cha', 42, { code: 'wis' }]) {
          expect(
            getBarbarianRitualGrants(
              cls,
              { ...guardian, spellcastingAbility } as typeof guardian,
              10,
            ),
          ).toEqual([])
        }
        expect(
          calculate({ ...ancestral(10), allowedSources: [source] }).fixedClassSpellStatuses,
        ).toEqual([])
        if (source === 'PHB') {
          const zealot = {
            ...actor(3),
            allowedSources: [source, 'XGE'],
            classProgression: [
              {
                ...actor(3).classProgression[0],
                subclass: 'Path of the Zealot',
                subclassSource: 'XGE',
              },
            ],
          }
          const fury = getCharacterClassChoices(
            cls,
            getSelectedSubclassData(cls, zealot.classProgression[0]),
            createOptionalClassFeatureActivity(zealot, catalogs),
            catalogs,
          ).find((row) => row.label === 'Divine Fury')
          expect(fury).toMatchObject({ level: 3, minimumSelections: 1, maximumSelections: 1 })
          if (!fury) throw new Error('Missing classic Divine Fury setup')
          const available = createClassChoiceCatalogs(catalogs)
          const views = resolveClassChoiceOptions(fury, available, [], 3, zealot).filter(
            isClassChoiceOptionEligible,
          )
          const options = views.map((row) => row.reference)
          expect(options.map((row) => row.name)).toEqual(['Necrotic', 'Radiant'])
          for (const view of views)
            expect(view).toMatchObject({
              presentation: { featureTypeLabels: ['Divine Fury'] },
              searchText: expect.stringContaining('Divine Fury'),
            })
          const change = applyClassChoiceSelectionWithGrantsCommand(
            zealot,
            zealot.provenance,
            fury,
            [options[1]],
            {
              classes: current.classes,
              catalogs: available,
              spellContext: calculate(zealot).classChoices.spellContext,
            },
          )
          const reopened = characterPersistenceSchema.parse(
            JSON.parse(
              JSON.stringify({
                ...zealot,
                ...change.characterPatch,
                provenance: change.provenanceUpdate,
              }),
            ),
          )
          expect(getSavedBarbarianPathOption(reopened.classChoiceSelections?.[0])).toBe('Radiant')
          expect(
            getFeatureOptionSelectionStates(reopened, current.classes, catalogs),
          ).toMatchObject([{ recovery: false, details: [{ name: 'Radiant', available: true }] }])
        }
        const ritualist = (level: number) => ({
          ...actor(level),
          classProgression: [
            {
              ...actor(level).classProgression[0],
              subclass: source === 'PHB' ? 'Path of the Totem Warrior' : 'Path of the Wild Heart',
              subclassSource: source,
            },
          ],
        })
        if (source === 'PHB') {
          const totem = ritualist(6)
          const aspect = getCharacterClassChoices(
            cls,
            getSelectedSubclassData(cls, totem.classProgression[0]),
            createOptionalClassFeatureActivity(totem, catalogs),
            catalogs,
          ).find((choice) => choice.label === 'Aspect of the Beast')
          if (!aspect) throw new Error('Missing classic Aspect of the Beast')
          const available = createClassChoiceCatalogs(catalogs)
          const bear = resolveClassChoiceOptions(aspect, available, [], 6, totem).find(
            (row) => row.reference.name === 'Bear' && isClassChoiceOptionEligible(row),
          )
          if (!bear) throw new Error('Missing classic Bear option')
          const picked = applyClassChoiceSelectionWithGrantsCommand(
            totem,
            totem.provenance,
            aspect,
            [bear.reference],
            {
              classes: current.classes,
              catalogs: available,
              spellContext: calculate(totem).classChoices.spellContext,
            },
          )
          const saved = characterPersistenceSchema.parse(
            JSON.parse(
              JSON.stringify({
                ...totem,
                ...picked.characterPatch,
                provenance: picked.provenanceUpdate,
              }),
            ),
          )
          expect(getEffectiveCarryCapacity(22, calculate(totem).effects.declarations)).toBe(330)
          expect(getEffectiveCarryCapacity(22, calculate(saved).effects.declarations)).toBe(660)
        } else {
          for (const [level, max] of [
            [2, 0],
            [3, 4],
            [5, 4],
            [6, 5],
            [11, 5],
            [12, 6],
            [16, 6],
            [17, 7],
            [20, 7],
          ]) {
            const zealot = {
              ...actor(level),
              classProgression: [
                {
                  ...actor(level).classProgression[0],
                  subclass: 'Path of the Zealot',
                  subclassSource: 'XPHB',
                },
              ],
            }
            const track = sheet(zealot).classResourceRows.find(
              (row) => row.label === 'Warrior of the Gods (d12s)',
            )
            expect(track?.max ?? 0).toBe(max)
          }
          const zealot = {
            ...actor(17),
            classProgression: [
              {
                ...actor(17).classProgression[0],
                subclass: 'Path of the Zealot',
                subclassSource: 'XPHB',
              },
            ],
            classResources: { [WARRIOR_OF_THE_GODS_RESOURCE_ID]: 2 },
          }
          const tracked = (classes: typeof current.classes) => {
            const filtered = { ...catalogs, classes }
            const track = (row: { id: string }) => row.id === WARRIOR_OF_THE_GODS_RESOURCE_ID
            return {
              app: getCharacterClassResources(zealot, () => cls, {
                catalogs: filtered,
                charismaModifier: 0,
                unlimitedWildShape: false,
              }).find(track),
              pdf: createCharacterSheetViewModel(zealot, raw, {
                ...lookups,
                classChoiceClasses: classes,
                classChoiceFeatureCatalogs: filtered,
              }).classResourceRows.find(track),
            }
          }
          const filteredOut = current.classes.filter(
            (row) => row.name !== 'Barbarian' || row.source !== 'XPHB',
          )
          expect(tracked(filteredOut)).toEqual({ app: undefined, pdf: undefined })
          expect(tracked([...current.classes, cls])).toEqual({ app: undefined, pdf: undefined })
          expect(
            tracked(
              current.classes.map((row) =>
                row === cls
                  ? {
                      ...row,
                      subclasses: row.subclasses?.filter(
                        (path) => path.name !== 'Path of the Zealot',
                      ),
                    }
                  : row,
              ),
            ),
          ).toEqual({ app: undefined, pdf: undefined })
          expect(tracked(current.classes)).toMatchObject({
            app: { current: 2, max: 7 },
            pdf: { max: 7, used: 5 },
          })
        }
        for (const [level, names] of [
          [2, []],
          [3, ['Beast Sense', 'Speak with Animals']],
          [9, ['Beast Sense', 'Speak with Animals']],
          [10, ['Beast Sense', 'Speak with Animals', 'Commune with Nature']],
        ] as const) {
          const character = ritualist(level)
          const current = calculate(character)
          expect(current.fixedClassSpellStatuses).toMatchObject(
            names.map((name) => ({
              reference: `${name}|${source}`,
              active: true,
              prepared: false,
              castOnly: { castingTime: 'Ritual only' },
            })),
          )
          expect(
            current.character.spells.spellProfiles.flatMap((profile) => profile.spellsKnown),
          ).toEqual([])
          for (const name of names)
            expect(sheet(character).spellRows).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ name: expect.stringContaining(name) }),
              ]),
            )
        }
        expect(calculate(oppositeEdition(ritualist(10))).fixedClassSpellStatuses).toEqual([])
        const giant = {
          ...actor(3),
          allowedSources: [source, 'BGG'],
          classProgression: [
            {
              ...actor(3).classProgression[0],
              subclass: 'Path of the Giant',
              subclassSource: 'BGG',
            },
          ],
        }
        expect(getSelectedFeatureCantripSetups(giant, catalogs)).toContainEqual(
          expect.objectContaining({ name: 'Giant Power' }),
        )
        expect(getSelectedFeatureCantripSetups(oppositeEdition(giant), catalogs)).toEqual([])
        expect(calculate(oppositeEdition(giant)).character.proficiencies.languages).not.toContain(
          'giant',
        )
        const slot = giantPowerSpellSlots.find((slot) => slot[0][2] === source.toLowerCase())!
        const languageChoice = (character: Character) =>
          getCharacterClassChoices(
            cls,
            getSelectedSubclassData(cls, character.classProgression[0]),
            createOptionalClassFeatureActivity(character, catalogs),
            catalogs,
          ).find((choice) => choice.label === 'Giant Power languages')
        const withFixedGiant = calculate(giant).character
        expect(withFixedGiant.proficiencies.languages).toContain('giant')
        expect(withFixedGiant.provenance.proficiencies.languages.giant).toHaveLength(1)
        expect(() =>
          characterPersistenceSchema.parse(JSON.parse(JSON.stringify(withFixedGiant))),
        ).not.toThrow()
        expect(languageChoice(withFixedGiant)).toBeUndefined()
        expect(
          calculate({ ...withFixedGiant, allowedSources: [source] }).character.proficiencies
            .languages,
        ).not.toContain('giant')
        const alreadyGiant = {
          ...giant,
          proficiencies: { ...giant.proficiencies, languages: ['Giant'] },
        }
        const language = languageChoice(alreadyGiant)
        expect(language).toMatchObject({ level: 3, minimumSelections: 1 })
        if (!language) throw new Error('Missing Giant Power language fallback')
        const available = createClassChoiceCatalogs(catalogs)
        expect(languageChoice(oppositeEdition(alreadyGiant))).toBeUndefined()
        const alternatives = resolveClassChoiceOptions(language, available, [], 3, alreadyGiant)
          .filter(isClassChoiceOptionEligible)
          .map((row) => row.reference)
        expect(alternatives.some((row) => row.name.toLowerCase() === 'giant')).toBe(false)
        const alternative = alternatives.find((row) => row.name.toLowerCase() === 'elvish')
        if (!alternative) throw new Error('Missing an alternate Giant Power language')
        const languageGrant = applyClassChoiceSelectionWithGrantsCommand(
          alreadyGiant,
          alreadyGiant.provenance,
          language,
          [alternative],
          {
            classes: current.classes,
            catalogs: available,
            spellContext: calculate(alreadyGiant).classChoices.spellContext,
          },
        )
        const savedLanguage = characterPersistenceSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...alreadyGiant,
              ...languageGrant.characterPatch,
              provenance: languageGrant.provenanceUpdate,
            }),
          ),
        )
        expect(
          calculate(savedLanguage)
            .character.proficiencies.languages.map((name) => name.toLowerCase())
            .sort(),
        ).toEqual(['elvish', 'giant'])
        const withoutIndependentGiant = structuredClone(savedLanguage) as Character
        withoutIndependentGiant.proficiencies.languages =
          withoutIndependentGiant.proficiencies.languages.filter(
            (name) => name.toLowerCase() !== 'giant',
          )
        delete withoutIndependentGiant.provenance.proficiencies.languages.giant
        expect(calculate(withoutIndependentGiant).character.proficiencies.languages).toEqual([
          'giant',
        ])
        expect(
          getManagedClassSpellSlots(giant.classProgression[0], giant, catalogs),
        ).toContainEqual(slot)
        const spellContext = calculate(giant).classChoices.spellContext
        const pool = getManagedClassSpellPool(giant, slot, spellContext)
        expect([...pool.defaultReferences].sort()).toEqual([
          `druidcraft|${source.toLowerCase()}`,
          `thaumaturgy|${source.toLowerCase()}`,
        ])
        expect(calculate(giant).fixedClassSpellStatuses).toEqual([])
        const chosen = setManagedClassSpellChoiceCommand(
          giant,
          giant.provenance,
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            target: { name: 'Druidcraft', source },
            policy: 'default',
          },
          spellContext,
        )
        const reopened = characterPersistenceSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...giant,
              ...chosen.characterPatch,
              provenance: chosen.provenanceUpdate,
            }),
          ),
        )
        expect(calculate(reopened).managedClassSpellStatuses).toMatchObject([
          { active: true, castingNote: expect.stringContaining('Wisdom') },
        ])
        expect(
          calculate({ ...reopened, allowedSources: [source] }).managedClassSpellStatuses,
        ).toMatchObject([{ active: false }])
        const document = JSON.parse(await readFile('data/class/class-barbarian.json', 'utf8'))
        const classic = document.subclass.find(
          (row: { name: string; classSource: string }) =>
            row.name === 'Path of the Giant' && row.classSource === 'PHB',
        )
        const producer = document.subclassFeature.find(
          (row: { name: string }) => row.name === 'Giant Power',
        )
        classic.additionalSpells[0].innate['3'] = ['light#c']
        producer.entries[1] = producer.entries[1].replace('{@spell druidcraft}', '{@spell light}')
        const changed = (parseClasses(document) as Class5e[]).find(
          (row) => row.name === 'Barbarian' && row.source === source,
        )
        const changedPath = changed?.subclasses?.find((row) => row.name === 'Path of the Giant')
        if (!changedPath) throw new Error('Missing modified Giant path fixture')
        const classes = current.classes.map((row) =>
          row === cls
            ? {
                ...row,
                subclasses: row.subclasses?.map((path) =>
                  path.name === changedPath.name ? changedPath : path,
                ),
              }
            : row,
        )
        const changedLookups = {
          ...lookups,
          classChoiceClasses: classes,
          classChoiceFeatureCatalogs: { ...catalogs, classes },
        }
        const calculateChanged = (character: Character) =>
          createCharacterCalculationContext(character, changedLookups, raw)
        const changedContext = calculateChanged(giant).classChoices.spellContext
        expect(
          [...getManagedClassSpellPool(giant, slot, changedContext).defaultReferences].sort(),
        ).toEqual([`light|${source.toLowerCase()}`, `thaumaturgy|${source.toLowerCase()}`])
        const choice = setManagedClassSpellChoiceCommand(
          giant,
          giant.provenance,
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            target: { name: 'Light', source },
            policy: 'default',
          },
          changedContext,
        )
        const saved = characterPersistenceSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...giant,
              ...choice.characterPatch,
              provenance: choice.provenanceUpdate,
            }),
          ),
        )
        expect(saved.managedClassSpellChoices?.[0]?.slot).toEqual(slot)
        expect(calculate(saved).managedClassSpellStatuses).toMatchObject([{ active: false }])
        expect(calculateChanged(saved).managedClassSpellStatuses).toMatchObject([{ active: true }])
        expect(createCharacterSheetViewModel(saved, raw, changedLookups).spellRows).toContainEqual(
          expect.objectContaining({ name: expect.stringContaining('Light') }),
        )
      }
      if (source === 'PHB') continue
      const barbarian = actor(3)
      barbarian.proficiencies.skills = ['athletics']
      const choice = getCharacterClassChoices(
        cls,
        undefined,
        createOptionalClassFeatureActivity(barbarian, catalogs),
        catalogs,
      ).find((row) => row.label === 'Primal Knowledge skills')!
      expect(choice).toMatchObject({ level: 3, minimumSelections: 1, maximumSelections: 1 })
      const available = createClassChoiceCatalogs(catalogs)
      const options = resolveClassChoiceOptions(choice, available, [], 3, barbarian)
        .filter(isClassChoiceOptionEligible)
        .map((row) => row.reference)
      expect(options.map((row) => row.name.toLowerCase())).toEqual([
        'animal handling',
        'intimidation',
        'nature',
        'perception',
        'survival',
      ])
      const result = applyClassChoiceSelectionWithGrantsCommand(
        barbarian,
        barbarian.provenance,
        choice,
        [options[0]],
        {
          classes: current.classes,
          catalogs: available,
          spellContext: calculate(barbarian).classChoices.spellContext,
        },
      )
      const saved = characterPersistenceSchema.parse(
        JSON.parse(
          JSON.stringify({
            ...barbarian,
            ...result.characterPatch,
            provenance: result.provenanceUpdate,
          }),
        ),
      )
      expect(calculate(saved).character.proficiencies.skills).toEqual(
        expect.arrayContaining(['athletics', 'animal handling']),
      )
      for (const [printing, level] of [
        ['PHB', 3],
        ['XPHB', 4],
      ] as const) {
        const corrupted = structuredClone(saved) as Character
        const row = corrupted.classChoiceSelections?.[0]
        if (!row) throw new Error('Missing saved Primal Knowledge')
        row.classSource = printing
        row.classLevel = level
        row.choiceId = getClassProficiencyChoiceId(
          { name: 'Barbarian', source: printing },
          REVISED_PRIMAL_KNOWLEDGE_TARGET,
          'skills',
          level,
        )
        row.selected[0].slotLevel = level
        expect(isValidClassProficiencySelection(row)).toBe(false)
        corrupted.classProgression = [{ name: 'Barbarian', source: printing, levels: level }]
        expect(characterPersistenceSchema.safeParse(corrupted).success).toBe(false)
      }
      if (type === 'bundled') continue
      const wild = actor(6)
      wild.classProgression[0] = {
        ...wild.classProgression[0],
        subclass: 'Path of the Wild Heart',
        subclassSource: 'XPHB',
      }
      const aspect = getCharacterClassChoices(
        cls,
        getSelectedSubclassData(cls, wild.classProgression[0]),
        createOptionalClassFeatureActivity(wild, catalogs),
        catalogs,
      ).find((row) => row.label === 'Aspect of the Wilds')!
      expect(aspect).toMatchObject({ level: 6, minimumSelections: 1, maximumSelections: 1 })
      expect(
        getCharacterClassChoices(
          cls,
          getSelectedSubclassData(cls, wild.classProgression[0]),
          createOptionalClassFeatureActivity(oppositeEdition(wild), catalogs),
          catalogs,
        ).some((row) => row.label === 'Aspect of the Wilds'),
      ).toBe(false)
      const aspectViews = resolveClassChoiceOptions(aspect, available, [], 6, wild).filter(
        isClassChoiceOptionEligible,
      )
      const aspects = aspectViews.map((row) => row.reference)
      expect(aspects.map((row) => row.name).sort()).toEqual(['Owl', 'Panther', 'Salmon'])
      for (const view of aspectViews)
        expect(view).toMatchObject({
          presentation: { featureTypeLabels: ['Aspect of the Wilds'] },
          searchText: expect.stringContaining('Aspect of the Wilds'),
        })
      for (const option of aspects) {
        const change = applyClassChoiceSelectionWithGrantsCommand(
          wild,
          wild.provenance,
          aspect,
          [option],
          {
            classes: current.classes,
            catalogs: available,
            spellContext: calculate(wild).classChoices.spellContext,
          },
        )
        const pick = characterPersistenceSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...wild,
              ...change.characterPatch,
              provenance: change.provenanceUpdate,
            }),
          ),
        )
        const result = calculate(pick)
        expect(pick.classChoiceSelections).toMatchObject([
          { choiceId: aspect.id, selected: [{ name: option.name, slotLevel: 6 }] },
        ])
        expect(result.character.classChoiceSelections).toMatchObject(
          pick.classChoiceSelections ?? [],
        )
        expect(getSavedBarbarianPathOption(result.character.classChoiceSelections?.[0])).toBe(
          option.name,
        )
        expect(result.effects.sourceDeclarations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ label: `Aspect of the Wilds: ${option.name}` }),
          ]),
        )
        expect(calculate(oppositeEdition(pick)).effects.sourceDeclarations).not.toContainEqual(
          expect.objectContaining({ label: `Aspect of the Wilds: ${option.name}` }),
        )
        if (option.name === 'Owl')
          expect(result.senses).toEqual(expect.arrayContaining([{ type: 'darkvision', range: 60 }]))
        else expect(result.movement.speeds[option.name === 'Panther' ? 'climb' : 'swim']).toBe(40)
      }
    }
  },
  30_000,
)
