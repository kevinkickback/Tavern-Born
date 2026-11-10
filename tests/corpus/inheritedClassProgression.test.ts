// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  getClassSpellProfilePolicy,
  replacementSpellcastingAddress,
} from '@/lib/5etools/classCastingRules'
import { getCurrentClassCastingProducer } from '@/lib/5etools/classCastingSource'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
  getSubclassFeatureReferenceLevel,
} from '@/lib/5etools/classFeatureIdentity'
import {
  getClassResourceRecoveryAtLevel,
  normalizeClassRules,
} from '@/lib/5etools/classRuleNormalization'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { getWeaponInscriptionSetup } from '@/lib/5etools/weaponInscribedSpells'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import { getWalkingSpeed } from '@/lib/calculations/movement'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  applyClassSelectionCommand,
  applyLevelDown,
  applyLevelUp,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { removeManualEquipmentCommand } from '@/lib/character/commands/equipmentCommands'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { setWeaponInscription } from '@/lib/character/commands/weaponInscriptionCommands'
import { getDirectClassPreparedSpellGrants } from '@/lib/character/directClassPreparedSpells'
import {
  getEpicBoonSlots,
  projectEpicBoonSlots,
  replaceEpicBoonSelection,
} from '@/lib/character/epicBoonSlots'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { getRevisedClassFeatSlot } from '@/lib/character/revisedClassFeatSlot'
import { getSelectedFeatureCantripSlots } from '@/lib/character/selectedFeatureSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import {
  getDisplayedClassFeatures,
  projectClassLevelFeatures,
} from '@/pages/build/class/model/pageUtils'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const sources = ['XPHB', 'WoW']
const available = [
  'class/class-deathknight.json',
  'class/class-demonhunter.json',
  'class/class-warlock.json',
  'class/class-cleric.json',
  'generated/gendata-spell-source-lookup.json',
].every((path) => existsSync(`data/${path}`))
const reopen = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )

describe.runIf(available)('configured inherited class progression', () => {
  let data: GameData
  let lookups: ReturnType<typeof buildGameDataLookups>
  let catalogs: ReturnType<typeof buildClassChoiceFeatureCatalogs>

  const loadWithCopy = (
    parent: 'Cleric' | 'Druid',
    actor = 'Lightkeeper',
    source = 'EXAMPLE',
    conflictingFeatureText?: 'nested' | 'inline',
  ) =>
    new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true },
      {
        type: 'local',
        readJson: async (file) => {
          const document = JSON.parse(await readFile(`data/${file}`, 'utf8'))
          if (actor === 'Priest' && file === 'class/class-priest.json') {
            document.class = document.class.filter(
              (row: { source: string }) => row.source !== source,
            )
          }
          if (file === `class/class-${parent.toLowerCase()}.json`) {
            document._meta.internalCopies.push('class')
            document.class.push({
              name: actor,
              source,
              _copy: { name: parent, source: 'XPHB' },
            })
            if (parent === 'Cleric' && actor === 'Lightkeeper') {
              const original = document.class.find(
                (row: { source: string }) => row.source === 'XPHB',
              )
              const root = document.classFeature.find(
                (row: { source: string; name: string }) =>
                  row.source === 'XPHB' && row.name === 'Spellcasting',
              )
              document.class.push({
                name: 'Wardkeeper',
                source,
                _copy: { name: parent, source: 'XPHB' },
                classFeatures: original.classFeatures.map((ref: unknown) =>
                  ref === 'Spellcasting|Cleric|XPHB|1'
                    ? `Spellcasting|Wardkeeper|${source}|1`
                    : ref,
                ),
              })
              document.classFeature.push({
                ...root,
                className: 'Wardkeeper',
                classSource: source,
                source,
              })
            }
          }
          if (source === 'EXAMPLE' && file === 'generated/gendata-spell-source-lookup.json') {
            for (const name of ['sacred flame', 'cure wounds']) {
              document.xphb[name].class.EXAMPLE = { Lightkeeper: true, Wardkeeper: true }
            }
          }
          if (actor === 'Lightkeeper' && file === 'class/class-fighter.json') {
            document._meta.internalCopies ??= []
            if (!document._meta.internalCopies.includes('class'))
              document._meta.internalCopies.push('class')
            document.class.push(
              {
                name: 'Tactician',
                source,
                _copy: { name: 'Fighter', source: 'XPHB' },
              },
              {
                name: 'Tactician',
                source: 'OTHER',
                _copy: { name: 'Fighter', source: 'XPHB' },
              },
            )
          }
          if (actor === 'Lightkeeper' && file === 'class/class-deathknight.json') {
            const template = document.class.find(
              (row: { name: string }) => row.name === 'Death Knight',
            )
            document.class.push({ ...structuredClone(template), name: 'Wardblade', source })
          }
          if (conflictingFeatureText && file === 'class/class-druid.json') {
            const terrain = document.subclassFeature.find(
              (row: { name: string; source: string }) =>
                row.name === 'Circle of the Land Spells' && row.source === 'XPHB',
            )
            terrain.entries[0] = terrain.entries[0].replace('land: arid, polar', 'land: polar')
          }
          if (conflictingFeatureText && file === 'class/class-barbarian.json') {
            const echo = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Echo of the Elements',
            )
            echo.entries[0] = echo.entries[0].replace(
              'Wind Wall|XPHB}.',
              'Wind Wall|XPHB} by also expending a spell slot.',
            )
          }
          if (conflictingFeatureText && file === 'class/class-deathknight.json') {
            const oath = document.subclass.find(
              (row: { name: string }) => row.name === 'Oath of the Ebon Blade',
            )
            const frost = oath.additionalSpells.find(
              (row: { name: string }) => row.name === 'Frost',
            )
            const blood = oath.additionalSpells.find(
              (row: { name: string }) => row.name === 'Blood',
            )
            oath.name = 'Oath of the Ebon Blade #2'
            frost.name = 'Frost #2'
            frost.prepared['3'][1] += '#c'
            blood.prepared['3'][1] = 'chains of ice|wow'
            const spellTable = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Oath of the Ebon Blade Spells',
            ).entries[1]
            spellTable.colLabels[3] = 'Spells (Frost #2)'
            spellTable.rows[0][2] = '{@spell Chains of Ice|WoW}'
            const forging = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Runeforging',
            )
            forging.entries[2].name = 'Frost #2'
            const smite = document.classFeature.find(
              (row: { name: string }) => row.name === 'Runic Smite',
            )
            smite.entries[1] = smite.entries[1].replace(
              'Long Rest|XPHB',
              conflictingFeatureText === 'inline' ? 'Long Rest|XPHB|Short Rest' : 'Long Rest|WoW',
            )
            const steed = document.classFeature.find(
              (row: { name: string; className: string }) =>
                row.name === 'Faithful Steed' && row.className === 'Death Knight',
            )
            if (conflictingFeatureText === 'inline') {
              steed.entries[2] = steed.entries[2].replace(
                'can be Undead.',
                'can be Undead; you can cast the spell without a slot only while you have the Undead creature type.',
              )
            } else {
              steed.entries[3].entries.push(
                'You can only cast Find Steed in this way while you have the Undead creature type.',
              )
            }
          }
          return document
        },
      },
    ).loadAllData()
  beforeAll(async () => {
    data = composeGameDataLayers([await loadWithCopy('Cleric')])
    lookups = buildGameDataLookups(data)
    catalogs = buildClassChoiceFeatureCatalogs(data)
  }, 45_000)

  const classRow = (name: string, source = 'WoW') =>
    data.classes.find((row) => row.name === name && row.source === source)!
  const spellContext = (character: Character) => ({
    catalogs,
    spellsByKey: lookups.spellsByKey,
    abilityScores: character.abilityScores,
  })
  const calculation = (character: Character) =>
    createCharacterCalculationContext(character, {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    })
  const start = (name: string, source = 'WoW') => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['XPHB', source],
      classProgression: [],
      initialClass: undefined,
    })
    return reopen(
      character,
      applyClassSelectionCommand(
        character,
        character.provenance,
        classRow(name, source),
        undefined,
        lookups.itemLookup,
        { classChoiceFeatureCatalogs: catalogs },
      ),
    )
  }
  const levelUp = (character: Character, hitDie: number) => {
    const [entry] = character.classProgression
    return reopen(
      character,
      applyLevelUp(
        character,
        character.provenance,
        [{ ...entry, levels: entry.levels + 1 }],
        {
          className: entry.name,
          classSource: entry.source,
          classLevel: entry.levels + 1,
          hitDie,
          dieResult: hitDie / 2 + 1,
          method: 'average',
        },
        calculation(character),
      ),
    )
  }

  const reachLevel = (character: Character, level: number) => {
    const [entry] = character.classProgression
    const die = classRow(entry.name, entry.source).hd!.faces
    while (character.classProgression[0].levels < level) character = levelUp(character, die)
    return character
  }
  const chooseSubclass = (character: Character, name: string) =>
    reopen(
      character,
      selectSubclass(character, character.provenance, name, 'WoW', undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
  const fixedSpells = (character: Character) =>
    calculation(character)
      .character.spells.spellProfiles.flatMap((profile) => profile.fixedSpells ?? [])
      .map((reference) => reference.toLowerCase())

  test('earned base spells are always prepared and keep their own slot-free use through save and export', async () => {
    const initial = start('Death Knight')
    const profileId = 'class:Death Knight|WoW'
    const prepared = (character: Character) =>
      calculation(character)
        .character.spells.spellProfiles.find((row) => row.id === profileId)
        ?.alwaysPreparedSpells?.map((reference) => reference.toLowerCase()) ?? []
    expect(prepared(initial)).toEqual([])
    const second = reachLevel(initial, 2)
    expect(prepared(second)).toEqual(['rune strike|wow'])
    expect(prepared(reachLevel(second, 4))).toEqual(['rune strike|wow'])
    const fifth = reachLevel(second, 5)
    expect(prepared(fifth)).toEqual(['rune strike|wow', 'find steed|xphb'])
    expect(calculation(fifth).fixedClassSpellStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: ['class', 'death knight', 'wow'],
          featureName: 'Runic Smite',
          active: true,
          prepared: true,
          castingNote: expect.stringContaining('once without expending a spell slot'),
        }),
        expect.objectContaining({
          owner: ['class', 'death knight', 'wow'],
          featureName: 'Faithful Steed',
          active: true,
          prepared: true,
          castingNote: expect.stringContaining('finish a Long Rest'),
        }),
      ]),
    )
    const ordinaryPrepare = (
      character: Character,
      reference: string,
      current = spellContext(character),
    ) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId,
        reference,
        true,
        current,
      )
    expect(() => ordinaryPrepare(fifth, 'Find Steed|XPHB')).toThrow('already always prepared')
    const withoutSteed = {
      ...spellContext(fifth),
      catalogs: {
        ...catalogs,
        classFeatures: catalogs.classFeatures.filter(
          (row) => row.name !== 'Faithful Steed' || row.className !== 'Death Knight',
        ),
      },
    }
    const stored = reopen(fifth, ordinaryPrepare(fifth, 'Find Steed|XPHB', withoutSteed))
    expect(prepared(stored)).toContain('find steed|xphb')
    const withdrawn = projectManagedClassSpellState(stored, withoutSteed)
    expect(
      withdrawn.character.spells.spellProfiles.find((row) => row.id === profileId),
    ).toMatchObject({ preparedSpells: ['Find Steed|XPHB'] })
    expect(
      withdrawn.fixedClassSpellStatuses.some((row) => row.featureName === 'Faithful Steed'),
    ).toBe(false)
    expect(
      prepared(reopen(fifth, applyLevelDown(fifth, fifth.provenance, calculation(fifth)))),
    ).toEqual(['rune strike|wow'])
    expect(prepared({ ...fifth, allowedSources: ['XPHB'] })).toEqual([])
    expect(prepared(fifth)).toContain('find steed|xphb')

    const restored = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const vm = createCharacterSheetViewModel(stored, restored, restored)
    expect(vm.spellRows.find((row) => row.name === 'Rune Strike')).toMatchObject({
      level: '1',
      prepared: true,
      castingNote: expect.stringContaining('Long Rest'),
    })
    expect(vm.spellRows.find((row) => row.name === 'Find Steed')).toMatchObject({
      level: '2',
      prepared: true,
      castingNote: expect.stringContaining('Long Rest'),
    })
    expect(vm.actions.some((action) => action.name === 'Rune Strike')).toBe(true)
    for (const template of ['2024-official', '2014-custom'] as const) {
      const doc = await PDFDocument.load(
        await generateTestCharacterSheet(vm, template, {
          text: { descriptions: 'full', overflow: 'notes' },
        }),
      )
      const text = doc
        .getForm()
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
      expect(text, template).toContain(
        'Runic Smite (Death Knight · WoW) — Cast this spell once without expending a spell slot.',
      )
      expect(text, template).toContain(
        'Faithful Steed (Death Knight · WoW) — Cast this spell once without expending a spell slot.',
      )
    }
  }, 60_000)

  test('the daily schedule uses the actual selected owner under a different source', () => {
    const actor = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['EXAMPLE', 'WoW', 'XPHB'],
      classProgression: [{ name: 'Wardblade', source: 'EXAMPLE', levels: 5 }],
    })
    const status = calculation(actor).fixedClassSpellStatuses
    expect(status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: ['class', 'wardblade', 'example'],
          reference: 'rune strike|wow',
          active: true,
        }),
        expect.objectContaining({
          owner: ['class', 'wardblade', 'example'],
          reference: 'find steed|xphb',
          active: true,
        }),
      ]),
    )
    const mixed = {
      ...actor,
      classProgression: [
        ...actor.classProgression,
        { name: 'Death Knight', source: 'WoW', levels: 5 },
      ],
    }
    const rules = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const sheet = createCharacterSheetViewModel(mixed, rules, rules)
    const notes = [
      sheet.spellRows.find((row) => row.name === 'Find Steed')?.castingNote,
      sheet.actions.find((row) => row.name === 'Find Steed')?.description,
    ]
    for (const note of notes) {
      expect(note).toContain('Faithful Steed (Wardblade · EXAMPLE)')
      expect(note).toContain('Faithful Steed (Death Knight · WoW)')
    }
  })

  test('mislabelled rest and conditional spell text withhold slot-free preparation', async () => {
    const conflicting = composeGameDataLayers([
      await loadWithCopy('Cleric', 'Lightkeeper', 'EXAMPLE', 'inline'),
    ])
    const actor = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [{ name: 'Death Knight', source: 'WoW', levels: 5 }],
    })
    expect(
      getDirectClassPreparedSpellGrants(
        actor,
        conflicting.classes,
        buildClassChoiceFeatureCatalogs(conflicting),
      ),
    ).toEqual([])
  }, 45_000)

  test('inscribed spells follow the marked inventory row and the subclass’s earned schedule', () => {
    let character: Character = chooseSubclass(
      reachLevel(start('Death Knight'), 3),
      'Oath of the Ebon Blade',
    )
    character = {
      ...character,
      equipment: [
        ...character.equipment,
        {
          id: 'sword-a',
          name: 'Longsword',
          source: 'XPHB',
          type: 'M',
          quantity: 1,
          equipped: false,
        },
        {
          id: 'sword-b',
          name: 'Longsword',
          source: 'XPHB',
          type: 'M',
          quantity: 1,
          equipped: true,
        },
        { id: 'bow', name: 'Longbow', source: 'XPHB', type: 'R', quantity: 1, equipped: true },
      ],
    }
    const setup = () =>
      getWeaponInscriptionSetup(character, character.classProgression[0], catalogs)
    const edit = (rune?: string, weaponId?: string) => {
      const draft = setup()
      const expected = draft?.saved && {
        weaponId: draft.saved.weapon.id,
        rune: draft.saved.mark.rune,
        target: draft.saved.mark.target,
      }
      const equipment = setWeaponInscription(
        character,
        character.classProgression[0],
        rune && weaponId && draft?.current
          ? { target: draft.current.target, rune, weaponId }
          : undefined,
        expected,
        catalogs,
      )
      character = characterPersistenceSchema.parse(
        JSON.parse(JSON.stringify({ ...character, equipment })),
      )
    }
    expect(setup()?.weapons.map((row) => row.id)).toEqual(
      expect.arrayContaining(['sword-a', 'sword-b']),
    )
    expect(setup()?.weapons.map((row) => row.id)).not.toContain('bow')
    expect(fixedSpells(character)).toEqual(['death grip|wow', 'rune strike|wow'])
    expect(() => edit('Frost', 'bow')).toThrow(/melee weapon/)
    edit('Frost', 'sword-a')
    expect(fixedSpells(character)).toEqual([
      'death grip|wow',
      'chains of ice|wow',
      'rune strike|wow',
    ])
    expect(setup()?.active).toBe(true)
    const marked = character
    const previousPrinting = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...marked,
          equipment: marked.equipment.map((weapon) => ({
            ...weapon,
            weaponInscriptions: weapon.weaponInscriptions?.map((mark) => ({
              ...mark,
              target: mark.target.replace('|runeforging|', '|runic power|'),
            })),
          })),
        }),
      ),
    )
    const dormant = getWeaponInscriptionSetup(
      previousPrinting,
      previousPrinting.classProgression[0],
      catalogs,
    )
    expect(dormant?.saved?.mark.target).toContain('|runic power|')
    expect(dormant?.active).toBe(false)
    expect(fixedSpells(previousPrinting)).toEqual(['death grip|wow', 'rune strike|wow'])
    const oldMark = dormant?.saved?.mark
    const currentTarget = dormant?.current?.target
    expect(
      oldMark &&
        currentTarget &&
        setWeaponInscription(
          previousPrinting,
          previousPrinting.classProgression[0],
          { target: currentTarget, weaponId: 'sword-b', rune: 'Blood' },
          { target: oldMark.target, weaponId: 'sword-a', rune: oldMark.rune },
          catalogs,
        ).flatMap((item) => item.weaponInscriptions ?? []),
    ).toEqual([expect.objectContaining({ target: currentTarget, rune: 'blood' })])
    const classLookups = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const vm = createCharacterSheetViewModel(marked, classLookups, classLookups)
    expect(vm.spellRows.find((row) => row.name === 'Chains of Ice')).toMatchObject({
      prepared: true,
    })
    expect(
      getEarnedSubclassSpellGrants(classRow('Death Knight'), marked.classProgression[0], 3, {
        character: marked,
        catalogs: { ...catalogs, items: [], itemsBase: [] },
      })?.map((row) => row.spellName),
    ).toEqual(['Death Grip|WoW'])
    expect(fixedSpells({ ...character, allowedSources: ['XPHB'] })).toEqual([])
    expect(fixedSpells(marked)).toContain('chains of ice|wow')

    edit('Frost', 'sword-b')
    expect(character.equipment.find((row) => row.id === 'sword-a')?.weaponInscriptions).toEqual([])
    expect(fixedSpells(character)).toContain('chains of ice|wow')
    character = reachLevel(character, 5)
    expect(fixedSpells(character)).toEqual(
      expect.arrayContaining(['death and decay|wow', 'frostscythe|wow']),
    )
    edit('Blood', 'sword-b')
    expect(fixedSpells(character)).not.toContain('frostscythe|wow')
    expect(fixedSpells(character)).toEqual(
      expect.arrayContaining(['vampiric blood|wow', 'spiritual weapon|xphb']),
    )

    const removed = reopen(
      character,
      removeManualEquipmentCommand(character, character.provenance, 'sword-b'),
    )
    const retainedSpells = [
      'death grip|wow',
      'death and decay|wow',
      'rune strike|wow',
      'find steed|xphb',
    ]
    expect(fixedSpells(removed)).toEqual(retainedSpells)
    expect(
      fixedSpells({
        ...removed,
        equipment: [
          ...removed.equipment,
          {
            id: 'sword-b',
            name: 'Longsword',
            source: 'XPHB',
            type: 'M',
            quantity: 1,
            equipped: false,
          },
        ],
      }),
    ).toEqual(retainedSpells)
    const rolledBack = reopen(
      marked,
      applyLevelDown(marked, marked.provenance, calculation(marked)),
    )
    expect(rolledBack.equipment.every((item) => !item.weaponInscriptions?.length)).toBe(true)
    edit()
    expect(fixedSpells(character)).toEqual(retainedSpells)
  })

  test('copied class grants follow their earned features and authored replacements', () => {
    const druid = start('Druid')
    expect(fixedSpells(druid)).toEqual(['speak with animals|xphb'])
    const withoutOriginal = data.classes.filter(
      (row) => row.name !== 'Druid' || row.source !== 'XPHB',
    )
    expect(
      getDirectClassPreparedSpellGrants(druid, withoutOriginal, {
        ...catalogs,
        classes: withoutOriginal,
      }),
    ).toEqual([
      expect.objectContaining({
        owner: ['class', 'druid', 'wow'],
        reference: 'Speak with Animals|XPHB',
      }),
    ])
    expect(fixedSpells(start('Hunter'))).toEqual(["hunter's mark|xphb"])
    const paladin = start('Paladin')
    expect(fixedSpells(paladin)).toEqual([])
    expect(fixedSpells(reachLevel(paladin, 2))).toEqual(['divine smite|xphb'])
    expect(fixedSpells(reachLevel(paladin, 5))).toEqual(['divine smite|xphb', 'find steed|xphb'])
    expect(fixedSpells({ ...paladin, allowedSources: ['XPHB'] })).toEqual([])

    const hunter = reachLevel(start('Hunter'), 6)
    expect(getWalkingSpeed(calculation(chooseSubclass(hunter, 'Hunter')).movement)).toBe(40)
    expect(getWalkingSpeed(calculation(chooseSubclass(hunter, 'Beast Master')).movement)).toBe(30)
    const monk = reachLevel(start('Monk'), 6)
    expect(getWalkingSpeed(calculation({ ...monk, equipment: [] }).movement)).toBe(45)
    const shaman = reachLevel(start('Shaman'), 5)
    expect(getWalkingSpeed(calculation({ ...shaman, equipment: [] }).movement)).toBe(40)
    for (const row of [monk, shaman]) {
      const unarmored = {
        ...row,
        equipment: [],
        abilityScores: {
          strength: 10,
          dexterity: 16,
          constitution: 16,
          intelligence: 10,
          wisdom: 16,
          charisma: 10,
        },
      }
      const context = calculation(unarmored)
      expect(
        computeEffectiveCharacterArmorClass(
          unarmored,
          context.abilityScores.total,
          context.effects.sourceDeclarations,
        ),
      ).toBe(16)
    }
  })

  test('inherited feature counters use exact owners and earned levels', () => {
    const resource = (character: Character, label: string) => {
      const [entry] = character.classProgression
      const context = calculation(character)
      return getCharacterClassResources(character, () => classRow(entry.name, entry.source), {
        catalogs,
        charismaModifier: 0,
        abilityModifiers: context.abilityScores.modifiers,
        effects: context.effects.declarations,
        effectContext: context.effects.resolutionContext,
        unlimitedWildShape: false,
      }).find((row) => row.label === label)
    }
    expect(resource(start('Evoker'), 'Innate Sorcery')).toMatchObject({ max: 2 })
    expect(resource(start('Mage'), 'Arcane Recovery')).toMatchObject({ max: 1 })
    expect(resource(reachLevel(start('Paladin'), 5), 'Lay on Hands (HP)')).toMatchObject({
      max: 25,
    })
    const warrior = reachLevel(start('Warrior'), 17)
    expect(resource(warrior, 'Action Surge')).toMatchObject({ max: 2 })
    expect(resource(chooseSubclass(warrior, 'Battle Master'), 'Superiority Dice')).toMatchObject({
      max: 6,
    })
    const tactician = start('Tactician', 'EXAMPLE')
    expect(resource(tactician, 'Action Surge')).toBeUndefined()
    const veteran = reachLevel(tactician, 2)
    const surge = resource(veteran, 'Action Surge')
    expect(surge).toMatchObject({ max: 1 })
    expect(surge?.id).not.toBe(resource(warrior, 'Action Surge')?.id)
    expect(resource({ ...veteran, allowedSources: ['XPHB'] }, 'Action Surge')).toBeUndefined()
  })

  test('prints inherited resource counts and recovery in the four shipped sheets', async () => {
    const warrior = chooseSubclass(reachLevel(start('Warrior'), 17), 'Battle Master')
    const cls = classRow('Warrior')
    const definitions = getCharacterClassResources(warrior, () => cls, {
      catalogs,
      charismaModifier: 0,
      unlimitedWildShape: false,
    })
    const spent = Object.fromEntries(
      definitions.map((row) => [row.id, row.label === 'Action Surge' ? 1 : 2]),
    )
    const current = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const view = createCharacterSheetViewModel(
      { ...warrior, classResources: spent },
      current,
      current,
    )
    expect(view.classResourceRows.find((row) => row.label === 'Superiority Dice')).toMatchObject({
      used: 4,
      max: 6,
    })
    for (const template of [
      '2014-official',
      '2014-custom',
      '2024-official',
      '2024-custom',
    ] as const) {
      const bytes = await generateTestCharacterSheet(view, template, {
        pages: { spells: false },
        text: { descriptions: 'names', overflow: 'ellipsis' },
      })
      const form = (await PDFDocument.load(bytes)).getForm()
      const text = form
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
      expect(text, template).toContain('Restores all uses on a short or long rest')
      expect(text, template).toMatch(/Restores 1 use on a short rest; all uses on a long rest/i)
      if (template === '2014-custom') {
        const index =
          view.classResourceRows.findIndex((row) => row.label === 'Superiority Dice') + 1
        expect(form.getTextField(`Limited Feature ${index}`).getText()).toBe('Superiority Dice')
        expect(form.getTextField(`Limited Feature Max Usages ${index}`).getText()).toBe('6')
        expect(form.getTextField(`Limited Feature Used ${index}`).getText()).toBe('4')
        expect(form.getDropdown(`Limited Feature Recovery ${index}`).getSelected()).toEqual(['S/L'])
      } else {
        expect(text, template).toMatch(/Action Surge\s*[—-]\s*1\/2 available/)
        expect(text, template).toMatch(/Superiority Dice\s*[—-]\s*2\/6 available/)
      }
    }
  }, 60_000)

  test('keeps same-label resource owners and carries inherited overflow onto Notes', async () => {
    const warrior = chooseSubclass(reachLevel(start('Warrior'), 17), 'Battle Master')
    const actor: Character = {
      ...warrior,
      allowedSources: ['XPHB', 'WoW', 'EXAMPLE'],
      classProgression: [
        ...warrior.classProgression,
        { name: 'Tactician', source: 'EXAMPLE', levels: 2 },
      ],
    }
    const current = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const first = createCharacterSheetViewModel(actor, current, current)
    const sameName = first.classResourceRows.filter((row) => row.label === 'Action Surge')
    expect(sameName.map((row) => row.owner?.name)).toEqual(['Warrior', 'Tactician'])
    actor.classResources = Object.fromEntries(
      sameName.map((row) => [row.id, row.owner?.name === 'Warrior' ? 1 : 0]),
    )
    const view = createCharacterSheetViewModel(actor, current, current)
    const withoutCopy = {
      ...current,
      classChoiceFeatureCatalogs: {
        ...catalogs,
        classes: data.classes.filter((row) => row.name !== 'Tactician'),
      },
    }
    expect(
      createCharacterSheetViewModel(actor, current, withoutCopy)
        .classResourceRows.filter((row) => row.label === 'Action Surge')
        .map((row) => row.owner?.name),
    ).toEqual(['Warrior'])
    expect(
      view.classResourceRows.filter((row) => row.label === 'Action Surge').map((row) => row.used),
    ).toEqual([1, 1])
    const overflowView = {
      ...view,
      classResourceRows: [
        ...Array.from({ length: 8 }, (_, index) => ({
          ...view.classResourceRows[0],
          id: `filler-${index}`,
          label: `Filler ${index}`,
          inherited: false,
        })),
        ...view.classResourceRows,
      ],
    }
    const generate = (notes?: boolean) =>
      generateTestCharacterSheet(overflowView, '2014-custom', {
        pages: { notes, spells: false },
        text: { descriptions: 'names', overflow: 'ellipsis' },
        onReport: (report) => {
          const sections = notes === false ? report.omitted : report.preserved
          expect(sections.some((section) => section.id === 'capacity:class-resources')).toBe(true)
        },
      })
    const form = (await PDFDocument.load(await generate())).getForm()
    const notes = form
      .getFields()
      .flatMap((field) =>
        field instanceof PDFTextField && /Notes\.(Left|Right)$/.test(field.getName())
          ? [field.getText() ?? '']
          : [],
      )
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(notes).toContain('Action Surge (Warrior) — 1/2 available')
    expect(notes).toContain('Action Surge (Tactician) — 0/1 available')
    await generate(false)

    const twoPrintings: Character = {
      ...start('Tactician', 'EXAMPLE'),
      allowedSources: ['XPHB', 'EXAMPLE', 'OTHER'],
      classProgression: [
        { name: 'Tactician', source: 'EXAMPLE', levels: 2 },
        { name: 'Tactician', source: 'OTHER', levels: 2 },
      ],
    }
    const counters = createCharacterSheetViewModel(twoPrintings, current, current).classResourceRows
    twoPrintings.classResources = Object.fromEntries(
      counters
        .filter((row) => row.label === 'Action Surge')
        .map((row) => [row.id, row.owner?.source === 'EXAMPLE' ? 0 : 1]),
    )
    const duplicateLabels = createCharacterSheetViewModel(twoPrintings, current, current)
    const fitted = (
      await PDFDocument.load(
        await generateTestCharacterSheet(duplicateLabels, '2014-custom', {
          pages: { spells: false },
          text: { descriptions: 'names', overflow: 'ellipsis' },
        }),
      )
    ).getForm()
    const allText = fitted
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(allText).toContain('Action Surge (Tactician · EXAMPLE) — 0/1 available')
    expect(allText).toContain('Action Surge (Tactician · OTHER) — 1/1 available')
  }, 60_000)

  test.each([
    {
      className: 'Druid',
      subclass: 'Circle of the Land',
      label: 'Terrain',
      option: 'Arid Land',
      selected: 'fire bolt|xphb',
      common: [],
    },
    {
      className: 'Evoker',
      subclass: 'Draconic Sorcery',
      label: 'Specialization',
      option: 'Devastation',
      selected: 'azure strike|wow',
      common: ['chromatic orb|xphb', "dragon's breath|xphb"],
    },
  ])('a $className named spell choice can be saved, reopened, and cleared', ({
    className,
    subclass,
    label,
    option,
    selected,
    common,
  }) => {
    let character = chooseSubclass(reachLevel(start(className), 3), subclass)
    const cls = classRow(className)
    const sc = cls.subclasses!.find((row) => row.name === subclass)!
    const choice = getClassChoiceCandidates(cls, sc, catalogs).find((row) => row.label === label)!
    const view = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      3,
      character,
    ).find((row) => row.reference.name === option)!
    expect(view.availability).toBe('eligible')
    expect(fixedSpells(character)).toEqual(expect.arrayContaining(common))
    expect(fixedSpells(character)).not.toContain(selected)
    const authority = {
      classes: data.classes,
      catalogs,
      feats: data.feats,
      spellContext: spellContext(character),
    }
    character = reopen(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [view.reference],
        authority,
      ),
    )
    expect(character.classChoiceSelections).toEqual([
      expect.objectContaining({ choiceId: choice.id }),
    ])
    expect(fixedSpells(character)).toEqual(expect.arrayContaining([...common, selected]))
    expect(fixedSpells({ ...character, allowedSources: ['XPHB'] })).not.toContain(selected)
    character = reopen(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [],
        authority,
      ),
    )
    expect(fixedSpells(character)).toEqual(expect.arrayContaining(common))
    expect(fixedSpells(character)).not.toContain(selected)
  })

  test('Savant gains use the copied owner while restricted subclass spells stay cast-only', () => {
    const mage = chooseSubclass(reachLevel(start('Mage'), 3), 'Evoker')
    const mageSlots = getManagedClassSpellSlots(mage.classProgression[0], mage, catalogs).filter(
      (slot) => slot[3] === 3 && slot[0][0] === 'subclass',
    )
    expect(mageSlots).toHaveLength(2)
    const saved = reopen(
      mage,
      setManagedClassSpellChoicesCommand(
        mage,
        mage.provenance,
        [
          {
            slot: mageSlots[0],
            expected: null,
            expectedEmptyRevision: mage.managedClassSpellRevision ?? 0,
            target: { name: 'Scorching Ray', source: 'XPHB' },
            policy: 'default',
          },
        ],
        spellContext(mage),
      ),
    )
    expect(
      calculation(saved).character.spells.spellProfiles.flatMap((profile) => profile.spellsKnown),
    ).toContain('Scorching Ray|XPHB')

    const shaman = reachLevel(start('Shaman'), 10)
    const elements = chooseSubclass(shaman, 'Path of the Elements')
    expect(fixedSpells(elements)).toContain('elementalism|xphb')
    const casts = (character: Character) =>
      calculation(character).fixedClassSpellStatuses.filter((row) => row.active && row.castOnly)
    expect(casts(elements).map((row) => row.reference.toLowerCase())).toEqual([
      'daylight|xphb',
      'water walk|xphb',
      'wind wall|xphb',
    ])
    expect(casts(elements)[0].castingNote).toContain('Spend one use of Rage')
    expect(fixedSpells(elements)).not.toContain('daylight|xphb')
    const guardians = casts(chooseSubclass(shaman, 'Path of the Spiritual Guardian'))
    expect(guardians.map((row) => row.reference.toLowerCase())).toEqual([
      'augury|xphb',
      'clairvoyance|xphb',
    ])
    expect(guardians[0].castingNote).toContain('One shared use per Short or Long Rest')
    expect(guardians[0].castOnly).toEqual({ ignoresMaterial: true })
  })

  test('authored option and casting restrictions must agree with the structured schedule', async () => {
    const conflicting = composeGameDataLayers([
      await loadWithCopy('Cleric', 'Lightkeeper', 'EXAMPLE', 'nested'),
    ])
    const current = buildClassChoiceFeatureCatalogs(conflicting)
    const druid = conflicting.classes.find((row) => row.name === 'Druid' && row.source === 'WoW')!
    const land = druid.subclasses!.find((row) => row.name === 'Circle of the Land')
    expect(
      getClassChoiceCandidates(druid, land, current).some((row) => row.label === 'Terrain'),
    ).toBe(false)

    const shaman = chooseSubclass(reachLevel(start('Shaman'), 6), 'Path of the Elements')
    const [entry] = shaman.classProgression
    const cls = conflicting.classes.find(
      (row) => row.name === entry.name && row.source === entry.source,
    )
    const grants = getEarnedSubclassSpellGrants(cls, entry, 6, {
      character: shaman,
      catalogs: current,
    })
    expect(grants?.map((grant) => grant.spellName)).toEqual(['elementalism|xphb'])

    const knight = reachLevel(start('Death Knight'), 5)
    const deathKnight = reopen(
      knight,
      selectSubclass(knight, knight.provenance, 'Oath of the Ebon Blade #2', 'WoW', undefined, {
        classChoiceFeatureCatalogs: current,
      }),
    )
    const [owner] = deathKnight.classProgression
    expect(getDirectClassPreparedSpellGrants(deathKnight, conflicting.classes, current)).toEqual([])
    const setup = getWeaponInscriptionSetup(deathKnight, owner, current)
    expect(setup?.current?.runes).toContain('Frost #2')
    if (!setup?.current || !setup.weapons.length) throw Error('Missing an eligible melee weapon')
    const equipment = setWeaponInscription(
      deathKnight,
      owner,
      { target: setup.current.target, rune: 'Frost #2', weaponId: setup.weapons[0].id },
      undefined,
      current,
    )
    const saved = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify({ ...deathKnight, equipment })),
    )
    const sourceClass = conflicting.classes.find(
      (row) => row.name === owner.name && row.source === owner.source,
    )
    const ranks = new Map([
      ['chains of ice|wow', 1],
      ['frostscythe|wow', 2],
    ])
    const spells = getEarnedSubclassSpellGrants(sourceClass, owner, 5, {
      character: saved,
      catalogs: current,
      spells: ranks,
    })
    expect(spells?.map((spell) => spell.spellName.toLowerCase())).toEqual([
      'death grip|wow',
      'death and decay|wow',
      'frostscythe|wow',
    ])
    const blood = setWeaponInscription(
      saved,
      owner,
      { target: setup.current.target, rune: 'Blood', weaponId: setup.weapons[0].id },
      { target: setup.current.target, rune: 'frost #2', weaponId: setup.weapons[0].id },
      current,
    )
    const bloodSpells = getEarnedSubclassSpellGrants(sourceClass, owner, 5, {
      character: { ...saved, equipment: blood },
      catalogs: current,
      spells: ranks,
    })
    expect(
      bloodSpells?.find((spell) => spell.spellName.toLowerCase() === 'chains of ice|wow'),
    ).toMatchObject({ isCantrip: false })
  }, 45_000)

  test('the roster displays exact inherited class and subclass features and earns Epic Boons', () => {
    const cohort = data.classes.filter((cls) => cls.source === 'WoW')
    expect(cohort).toHaveLength(13)
    for (const cls of cohort) {
      const features = getDisplayedClassFeatures(cls, catalogs)
      expect(features.map(getClassFeatureIdentity), cls.name).toEqual(
        cls.classFeatureRefs?.filter((ref) => ref.feature).map(getClassFeatureIdentity),
      )
      const character = makeCharacterFixture({
        originSystem: '2024',
        allowedSources: sources,
        classProgression: [{ name: cls.name, source: cls.source, levels: 19 }],
      })
      expect(getEpicBoonSlots(character, catalogs, data.feats), cls.name).toEqual([
        expect.objectContaining({ current: true, state: 'empty' }),
      ])
      for (const subclass of cls.subclasses ?? []) {
        const groups = projectClassLevelFeatures(
          new Map(),
          cls,
          subclass,
          subclass,
          [],
          20,
          catalogs,
        )
        for (const ref of subclass.subclassFeatureRefs ?? []) {
          const level = getSubclassFeatureReferenceLevel(ref)
          if (!ref.feature || !level || level <= 3) continue
          expect(
            groups.get(level)?.map(getSubclassFeatureIdentity),
            `${cls.name} / ${subclass.name} / ${ref.name}`,
          ).toContain(getSubclassFeatureIdentity(ref))
        }
      }
    }
    const knight = classRow('Death Knight')
    const aura = 'class-feature|aura of protection|paladin|xphb|6|xphb'
    expect(getDisplayedClassFeatures(knight, catalogs).map(getClassFeatureIdentity)).toContain(aura)
    expect(getDisplayedClassFeatures({ ...knight, classFeatures: [] }, catalogs)).toEqual([])
    expect(
      getDisplayedClassFeatures(knight, {
        ...catalogs,
        ambiguousClassFeatureTargets: new Set([aura]),
      }).map(getClassFeatureIdentity),
    ).not.toContain(aura)
  })

  test('class tables supply earned counters when the owner still declares the matching rules', () => {
    for (const [name, label, level, max, shortRest] of [
      ['Death Knight', 'Channel Divinity', 3, 2, 1],
      ['Demon Hunter', 'Favored Enemy', 1, 2, undefined],
      ['Druid', 'Wild Shape', 2, 2, 1],
      ['Evoker', 'Sorcery Points', 5, 5, 2],
      ['Hunter', 'Favored Enemy', 1, 2, undefined],
      ['Monk', 'Focus Points', 2, 2, 'all'],
      ['Paladin', 'Channel Divinity', 3, 2, 1],
      ['Priest', 'Channel Divinity', 2, 2, 1],
      ['Shaman', 'Rages', 1, 2, 1],
      ['Warrior', 'Second Wind', 1, 2, 1],
    ] as const) {
      const cls = classRow(name)
      const resource = getClassResourceDefs(cls, level).find((row) => row.label === label)
      expect(resource?.maxPerLevel[level - 1], name).toBe(max)
      expect(getClassResourceRecoveryAtLevel(resource!, level - 1), name).toMatchObject({
        longRest: 'all',
        ...(shortRest === undefined ? {} : { shortRest }),
      })
      expect(getClassResourceRecoveryAtLevel(resource!, level - 1).shortRest, name).toBe(shortRest)
      expect(
        normalizeClassRules({ ...cls, classFeatures: [] }, cls.classFeatureRefs ?? []).resources,
      ).not.toContainEqual(expect.objectContaining({ label }))
    }
    const [configured] = getClassResourceDefs(classRow('Druid'), 2)
    const [core] = getClassResourceDefs(classRow('Druid', 'XPHB'), 2)
    expect(configured.id).not.toBe(core.id)
    const character = {
      ...levelUp(start('Druid'), 8),
      classResources: { [configured.id]: 1 },
    }
    const resources = (current: typeof catalogs) =>
      getCharacterClassResources(character, () => classRow('Druid'), {
        catalogs: current,
        charismaModifier: 0,
        unlimitedWildShape: false,
      })
    expect(resources(catalogs)).toContainEqual(
      expect.objectContaining({ id: configured.id, current: 1 }),
    )
    expect(
      resources({ ...catalogs, classes: data.classes.filter((cls) => cls.source !== 'WoW') }),
    ).not.toContainEqual(expect.objectContaining({ id: configured.id }))
    expect(resources(catalogs)).toContainEqual(
      expect.objectContaining({ id: configured.id, current: 1 }),
    )
  })

  test('inherited Epic Boon selections suspend and can clear when their class source is removed', () => {
    let character = start('Druid')
    for (let level = 2; level <= 19; level++) character = levelUp(character, 8)
    const [slot] = getEpicBoonSlots(character, catalogs, data.feats)
    const expected = 'class-feature|epic boon|druid|xphb|19|xphb'
    const context = calculation(character)
    const authority = {
      catalogs,
      feats: data.feats,
      prerequisites: {
        ...context.classChoices.prerequisites,
        progression: character.classProgression,
      },
    }
    const alert = data.feats.find((feat) => feat.name === 'Alert' && feat.source === 'XPHB')!
    for (const replacement of [
      {
        abilityChanges: { wisdom: 2 } as Record<string, 1 | 2>,
        before: context.abilityScores.total,
      },
      { feat: alert },
    ]) {
      const saved = characterPersistenceSchema.parse(
        JSON.parse(
          JSON.stringify(replaceEpicBoonSelection(character, slot, replacement, authority)),
        ),
      )
      const claim = 'feat' in replacement ? saved.feats[0] : saved.asiChoices?.[0]
      expect(claim?.epicBoonTarget).toBe(expected)
      const missing = { ...catalogs, classes: data.classes.filter((cls) => cls.source !== 'WoW') }
      const [dormant] = getEpicBoonSlots(saved, missing, data.feats)
      expect(dormant).toMatchObject({ current: false, state: 'unavailable', hasClaims: true })
      const projected = projectEpicBoonSlots(saved, [dormant])
      expect(projected.asiChoices ?? []).toHaveLength(0)
      expect(projected.feats).toHaveLength(0)
      const cleared = replaceEpicBoonSelection(saved, dormant, null)
      expect(getEpicBoonSlots(cleared, catalogs, data.feats)[0].state).toBe('empty')
      expect(getEpicBoonSlots(saved, catalogs, data.feats)[0].state).toBe('selected')
    }
  })

  test.each([
    ['Priest', 'WoW'],
    ['Lightkeeper', 'EXAMPLE'],
  ])('%s uses only its declared list and keeps spell intent across reload and source withdrawal', (name, source) => {
    let character = start(name, source)
    const [entry] = character.classProgression
    const [slot] = getManagedClassSpellSlots(entry, character, catalogs)
    expect(slot?.slice(0, 2)).toEqual([
      ['class', name.toLowerCase(), source.toLowerCase()],
      'class-cantrip',
    ])
    const select = (spell: string) =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            target: { name: spell, source: 'XPHB' },
            policy: 'default',
          },
        ],
        spellContext(character),
      )

    expect(() => select('Fire Bolt')).toThrow()
    if (source === 'EXAMPLE') expect(() => select('Guidance')).toThrow()
    character = reopen(character, select('Sacred Flame'))
    const profileId = `class:${name}|${source}`
    const prepare = (prepared: boolean, context = spellContext(character)) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId,
        'Cure Wounds|XPHB',
        prepared,
        context,
      )
    character = reopen(character, prepare(true))
    if (source === 'EXAMPLE') {
      expect(
        character.spells.spellProfiles.find((profile) => profile.id === profileId)
          ?.dailyCastingTarget,
      ).toBe('class-feature|spellcasting|cleric|xphb|1|xphb')
    }
    const current = projectManagedClassSpellState(character, spellContext(character))
    expect(current.statuses).toContainEqual(expect.objectContaining({ active: true }))
    expect(current.dailyStatuses).toContainEqual(
      expect.objectContaining({ profileId, active: true }),
    )
    const withdrawn = {
      ...spellContext(character),
      catalogs: { ...catalogs, classCastingSources: [] },
    }
    const inactive = projectManagedClassSpellState(character, withdrawn)
    expect(inactive.statuses).toContainEqual(expect.objectContaining({ active: false }))
    expect(inactive.dailyStatuses).toContainEqual(
      expect.objectContaining({ profileId, active: false }),
    )
    expect(getManagedClassSpellSlots(entry, character, withdrawn.catalogs)).toContainEqual(slot)
    const cleared = reopen(character, prepare(false, withdrawn))
    expect(
      cleared.spells.spellProfiles.find((profile) => profile.id === profileId)?.preparedSpells,
    ).not.toContain('Cure Wounds|XPHB')
  })

  test('an empty catalog-discovered cantrip slot expires when its level is lost offline', () => {
    let character = start('Lightkeeper', 'EXAMPLE')
    for (let level = 2; level <= 4; level++) character = levelUp(character, 8)
    const [entry] = character.classProgression
    const slot = getManagedClassSpellSlots(entry, character, catalogs).find(
      (slot) => slot[1] === 'class-cantrip' && slot[3] === 4,
    )
    expect(slot).toBeDefined()
    const expectedEmptyRevision = character.managedClassSpellRevision ?? 0
    character = reopen(
      character,
      applyLevelDown(
        character,
        character.provenance,
        createCharacterCalculationContext(character, {}),
      ),
    )
    expect(character.classProgression[0].levels).toBe(3)
    character = levelUp(character, 8)
    expect(character.managedClassSpellRevision).toBeGreaterThan(expectedEmptyRevision)
    expect(() =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [
          {
            slot: slot!,
            expected: null,
            expectedEmptyRevision,
            target: { name: 'Sacred Flame', source: 'XPHB' },
            policy: 'default',
          },
        ],
        spellContext(character),
      ),
    ).toThrow(/empty spell choice changed/i)
  })

  test.each([
    ['Lightkeeper', 'EXAMPLE'],
    ['Priest', 'WoW'],
  ])(
    '%s can clear dormant daily intent and prepare under a newly declared parent',
    async (name, source) => {
      let character = start(name, source)
      const profileId = `class:${name}|${source}`
      const prepare = (prepared: boolean, context = spellContext(character)) =>
        setDailyClassSpellPreparedCommand(
          character,
          character.provenance,
          profileId,
          'Cure Wounds|XPHB',
          prepared,
          context,
        )
      character = reopen(character, prepare(true))
      const replacementData = composeGameDataLayers([await loadWithCopy('Druid', name, source)])
      const replacement = {
        ...spellContext(character),
        catalogs: buildClassChoiceFeatureCatalogs(replacementData),
        spellsByKey: buildGameDataLookups(replacementData).spellsByKey,
      }
      expect(projectManagedClassSpellState(character, replacement).dailyStatuses).toContainEqual(
        expect.objectContaining({ profileId, active: false }),
      )
      character = reopen(character, prepare(false, replacement))
      expect(
        character.spells.spellProfiles.find((row) => row.id === profileId)?.dailyCastingTarget,
      ).toBeUndefined()
      character = reopen(character, prepare(true, replacement))
      expect(
        character.spells.spellProfiles.find((row) => row.id === profileId)?.dailyCastingTarget,
      ).toBe('class-feature|spellcasting|druid|xphb|1|xphb')
      expect(projectManagedClassSpellState(character, replacement).dailyStatuses).toContainEqual(
        expect.objectContaining({ profileId, active: true }),
      )
    },
    25_000,
  )

  test('Death Knight earns weapon mastery, daily preparation and Fighting Style at the source levels', () => {
    let character = start('Death Knight')
    const cls = classRow('Death Knight')
    const choices = cls.normalizedRules!.choices
    const mastery = choices.find((choice) => choice.label === 'Weapon Mastery')!
    const fightingStyle = choices.find((choice) => choice.label === 'Fighting Style')!
    const currentOptions = (choice: typeof mastery) =>
      resolveClassChoiceOptions(
        choice,
        { ...createClassChoiceCatalogs(catalogs), feats: data.feats },
        [],
        character.classProgression[0].levels,
        character,
      )
    const choose = (choice: typeof mastery, names: string[]) => {
      const options = names.map(
        (name) =>
          currentOptions(choice).find(
            (row) =>
              row.reference.name === name &&
              row.reference.source === 'XPHB' &&
              row.availability === 'eligible',
          )!.reference,
      )
      return reopen(
        character,
        applyClassChoiceSelectionWithGrantsCommand(
          character,
          character.provenance,
          choice,
          options,
          {
            classes: data.classes,
            catalogs,
            feats: data.feats,
            spellContext: spellContext(character),
          },
        ),
      )
    }
    expect(getRequiredChoiceSelectionCount(mastery, 1)).toBe(2)
    character = choose(mastery, ['Longsword', 'Javelin'])
    expect(character.classChoiceSelections?.[0]).toMatchObject({
      className: 'Death Knight',
      classSource: 'WoW',
    })
    expect(calculation(character).classCasting.slots.shared[1]?.max).toBe(2)
    const prepare = (spell: string) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        'class:Death Knight|WoW',
        spell,
        true,
        spellContext(character),
      )
    character = reopen(character, prepare('Heroism|XPHB'))
    expect(() => prepare('Consecration|WoW')).toThrow()
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses,
    ).toContainEqual(expect.objectContaining({ profileId: 'class:Death Knight|WoW', active: true }))
    character = levelUp(character, 10)
    expect(getRequiredChoiceSelectionCount(fightingStyle, 2)).toBe(1)
    const unlinked = createClassChoiceCatalogs({
      ...catalogs,
      classes: data.classes.map((row) => (row === cls ? { ...row, classFeatures: [] } : row)),
    })
    const alternative = {
      ...fightingStyle,
      options: [{ entityType: 'feat' as const, name: 'Defense', source: 'XPHB' }],
    }
    for (const choice of [mastery, fightingStyle, alternative]) {
      const result = resolveClassChoiceOptions(
        choice,
        { ...unlinked, feats: data.feats },
        [],
        2,
        character,
      )
      expect(result.some((option) => option.availability === 'eligible')).toBe(false)
    }
    const defense = currentOptions(fightingStyle).find(
      (row) => row.reference.name === 'Defense' && row.reference.source === 'XPHB',
    )
    expect(defense).toBeDefined()
    expect(defense?.prerequisite).toBeUndefined()
    character = choose(fightingStyle, ['Blessed Warrior'])
    const bonus = getSelectedFeatureCantripSlots(character, catalogs)
    expect(bonus).toHaveLength(2)
    character = reopen(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        bonus.map((slot, index) => ({
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: index ? 'Resistance' : 'Guidance', source: 'XPHB' },
          policy: 'default',
        })),
        spellContext(character),
      ),
    )
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses.map((row) => [
        row.choice.slot[0],
        row.active,
      ]),
    ).toEqual([
      [['class', 'death knight', 'wow'], true],
      [['class', 'death knight', 'wow'], true],
    ])
    expect(character.classChoiceSelections?.map((row) => row.classSource)).toEqual(['WoW', 'WoW'])
    character = levelUp(character, 10)
    const oath = cls.subclasses!.find((row) => row.name === 'Oath of the Ebon Blade')!
    character = reopen(
      character,
      selectSubclass(character, character.provenance, oath.name, oath.source, undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
    expect(
      getEarnedSubclassSpellGrants(cls, character.classProgression[0])?.map((grant) =>
        grant.spellName.toLowerCase(),
      ),
    ).toEqual(['death grip|wow'])
    character = levelUp(character, 10)
    const featRequest = { name: 'Death Knight', source: 'WoW', level: 4 }
    expect(getRevisedClassFeatSlot(character, featRequest, catalogs)).toMatchObject({
      openFeatCategories: true,
      hasSpellcastingFeature: true,
    })
    expect(
      getRevisedClassFeatSlot(character, featRequest, {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources?.filter(
          (row) => row.kind !== 'casting-copy',
        ),
      })?.hasSpellcastingFeature,
    ).toBeUndefined()
  }, 25_000)

  test('Warlock earns Pact Magic and Mystic Arcanum with its own list, profile and inverse', () => {
    let character: Character = start('Warlock')
    const slots = () =>
      getManagedClassSpellSlots(character.classProgression[0], character, catalogs)
    const choose = (earned: ManagedClassSpellSlot[], names: string[]) =>
      reopen(
        character,
        setManagedClassSpellChoicesCommand(
          character,
          character.provenance,
          earned.map((slot, index) => ({
            slot,
            expected: null,
            expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
            target: { name: names[index], source: 'XPHB' },
            policy: 'default',
          })),
          spellContext(character),
        ),
      )
    const first = slots()
    expect(first.map((slot) => [slot[0], slot[1]])).toEqual([
      [['class', 'warlock', 'wow'], 'class-cantrip'],
      [['class', 'warlock', 'wow'], 'class-cantrip'],
      [['class', 'warlock', 'wow'], 'class-known'],
      [['class', 'warlock', 'wow'], 'class-known'],
    ])
    expect(calculation(character).classCasting.slots.pact[1]?.max).toBe(1)
    character = choose(first, ['Eldritch Blast', 'Mage Hand', 'Hex', 'Armor of Agathys'])
    character = levelUp(character, 8)
    expect(calculation(character).classCasting.slots.pact[1]?.max).toBe(2)
    character = choose(
      slots().filter((slot) => slot[3] === 2),
      ['Witch Bolt'],
    )
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses.every(
        (row) => row.active,
      ),
    ).toBe(true)
    const lost = {
      ...spellContext(character),
      catalogs: {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources?.filter(
          (row) => row.kind !== 'casting-copy',
        ),
      },
    }
    expect(
      projectManagedClassSpellState(character, lost).statuses.every((row) => !row.active),
    ).toBe(true)
    expect(character.managedClassSpellChoices).toHaveLength(5)
    character = reopen(
      character,
      applyLevelDown(character, character.provenance, calculation(character)),
    )
    expect(character.managedClassSpellChoices).toHaveLength(4)

    const veteran = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [{ name: 'Warlock', source: 'WoW', levels: 11 }],
    })
    const arcanum = getManagedClassSpellSlots(veteran.classProgression[0]).find(
      (slot) => slot[1] === 'class-arcanum',
    )!
    const pool = getManagedClassSpellPool(veteran, arcanum, spellContext(veteran))
    expect(pool.spells.length).toBeGreaterThan(0)
    expect(new Set(pool.spells.map((spell) => spell.level))).toEqual(new Set([6]))
    expect(calculation(veteran).classCasting.slots.pact[5]?.max).toBe(3)
    character = veteran
    expect(() => choose([arcanum], ['Mass Suggestion'])).toThrow(/spell list/)
    character = choose([arcanum], ['Circle of Death'])
    expect(character.managedClassSpellChoices?.[0]).toMatchObject({
      slot: [['class', 'warlock', 'wow'], 'class-arcanum', arcanum[2], 11, 0],
      target: { name: 'Circle of Death', source: 'XPHB' },
    })
  }, 30_000)

  test('casting authority requires the current selected copy and exact retained declaration', () => {
    const cls = classRow('Warlock')
    const entry = {
      name: cls.name,
      source: cls.source,
      levels: 1,
    }
    const { owner, rule } = getClassSpellProfilePolicy(entry)
    const target = rule!.declaration.target
    const current = (source = catalogs) => getCurrentClassCastingProducer(source, owner, target, 1)
    expect(current()?.effective.source).toBe('WoW')
    for (const broken of [
      { ...cls, classFeatures: [] },
      { ...cls, classFeatureRefs: [] },
      { ...cls, spellcastingAbility: 'wis' },
      { ...cls, sourceIdentityConflict: true as const },
      {
        ...cls,
        classFeatureRefs: [
          ...cls.classFeatureRefs!,
          {
            ref: 'Pact Magic|Warlock|PHB|1',
            name: 'Pact Magic',
            className: 'Warlock',
            source: 'PHB',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
    ]) {
      const changed = {
        ...catalogs,
        classes: data.classes.map((row) => (row === cls ? broken : row)),
      }
      expect(current(changed)).toBeUndefined()
      expect(getManagedClassSpellSlots(entry, undefined, changed)).toEqual([])
    }
    expect(
      getClassSpellProfilePolicy({ name: 'Demon Hunter', source: 'WoW', levels: 1 }).rule,
    ).toBeUndefined()
    const warrior = classRow('Warrior').normalizedRules!.choices.find(
      (choice) => choice.label === 'Weapon Mastery',
    )!
    expect(getRequiredChoiceSelectionCount(warrior, 4)).toBe(4)
    expect(
      resolveClassChoiceOptions(warrior, createClassChoiceCatalogs(catalogs), [], 4).length,
    ).toBeGreaterThan(4)
  })

  test('Demon Hunter prepares its own spells with the replacement rule and keeps exact saved intent', () => {
    let character = start('Demon Hunter')
    const [entry] = character.classProgression
    const { owner, rule } = getClassSpellProfilePolicy(entry, catalogs.classCastingSources)
    const target = replacementSpellcastingAddress(
      'class-feature|spellcasting|demon hunter|wow|1|wow',
      'class-feature|spellcasting|ranger|xphb|1|xphb',
    )
    expect(rule?.declaration.target).toBe(target)
    expect(
      getCurrentClassCastingProducer(catalogs, owner, target, 1)?.declaration.feature,
    ).toMatchObject({ className: 'Demon Hunter', source: 'WoW' })
    expect(getManagedClassSpellSlots(entry, character, catalogs)).toEqual([])
    const profileId = 'class:Demon Hunter|WoW'
    const prepare = (reference: string, prepared = true, context = spellContext(character)) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId,
        reference,
        prepared,
        context,
      )
    expect(calculation(character).classCasting.details).toContainEqual(
      expect.objectContaining({
        profileId,
        preparedSpellLimit: 2,
        maxSpellLevel: 1,
      }),
    )
    expect(calculation(character).classCasting.slots.shared[1]?.max).toBe(2)
    expect(() => prepare('Freezing Trap|WoW')).toThrow(/spell list/i)
    expect(() => prepare('Lesser Restoration|XPHB')).toThrow(/outside the level/i)
    character = reopen(character, prepare('Cure Wounds|XPHB'))
    character = reopen(character, prepare('Ensnaring Strike|XPHB'))
    expect(() => prepare('Fog Cloud|XPHB')).toThrow(/limit/i)
    expect(character.spells.spellProfiles.find((row) => row.id === profileId)).toMatchObject({
      dailyCastingTarget: target,
      preparedSpells: ['Cure Wounds|XPHB', 'Ensnaring Strike|XPHB'],
    })
    const blockedSources = { ...character, allowedSources: ['XPHB'] }
    expect(
      projectManagedClassSpellState(blockedSources, spellContext(blockedSources)).dailyStatuses,
    ).toHaveLength(2)
    expect(
      projectManagedClassSpellState(blockedSources, spellContext(blockedSources)).dailyStatuses,
    ).toEqual([
      expect.objectContaining({ active: false }),
      expect.objectContaining({ active: false }),
    ])
    const withdrawn = {
      ...spellContext(character),
      catalogs: { ...catalogs, classCastingSources: [] },
    }
    expect(
      projectManagedClassSpellState(character, withdrawn).dailyStatuses.every(
        ({ active }) => !active,
      ),
    ).toBe(true)
    const cleared = reopen(character, prepare('Cure Wounds|XPHB', false, withdrawn))
    expect(
      cleared.spells.spellProfiles.find((row) => row.id === profileId)?.preparedSpells,
    ).toEqual(['Ensnaring Strike|XPHB'])
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses.every(
        ({ active }) => active,
      ),
    ).toBe(true)
    for (let level = 2; level <= 5; level++) character = levelUp(character, 10)
    expect(calculation(character).classCasting.slots.shared).toMatchObject({
      1: { max: 4 },
      2: { max: 2 },
    })
    expect(calculation(character).classCasting.details).toContainEqual(
      expect.objectContaining({
        profileId,
        preparedSpellLimit: 6,
        maxSpellLevel: 2,
      }),
    )
    character = reopen(character, prepare('Lesser Restoration|XPHB'))
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses,
    ).toHaveLength(3)
  })

  test('a replacement from a separate source supports bounded numeric choices and offline clear', () => {
    let character = start('Wardkeeper', 'EXAMPLE')
    const [entry] = character.classProgression
    const target = replacementSpellcastingAddress(
      'class-feature|spellcasting|wardkeeper|example|1|example',
      'class-feature|spellcasting|cleric|xphb|1|xphb',
    )
    const slots = getManagedClassSpellSlots(entry, character, catalogs)
    expect(slots).toHaveLength(3)
    const [slot] = slots
    expect(slot).toEqual([['class', 'wardkeeper', 'example'], 'class-cantrip', target, 1, 0])
    const pick = (name: string) =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            policy: 'default',
            target: { name, source: 'XPHB' },
          },
        ],
        spellContext(character),
      )
    expect(() => pick('Guidance')).toThrow()
    character = reopen(character, pick('Sacred Flame'))
    const [choice] = character.managedClassSpellChoices!
    const withoutTemplate: Character = {
      ...character,
      originSystem: '2014',
      allowedSources: ['EXAMPLE'],
    }
    expect(calculation(withoutTemplate).classCasting.details).toEqual([])
    expect(
      projectManagedClassSpellState(withoutTemplate, spellContext(withoutTemplate)).statuses,
    ).toContainEqual(
      expect.objectContaining({ active: false, reason: expect.stringMatching(/casting feature/i) }),
    )
    const offline = {
      ...spellContext(character),
      catalogs: { ...catalogs, classCastingSources: [] },
    }
    expect(projectManagedClassSpellState(character, offline).statuses).toContainEqual(
      expect.objectContaining({ active: false }),
    )
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        managedClassSpellChoices: [
          { ...choice, slot: [slot[0], slot[1], target.replace('wardkeeper', 'other'), 1, 0] },
        ],
      }).success,
    ).toBe(false)
    const cleared = reopen(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [{ slot, expected: choice }],
        offline,
      ),
    )
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses,
    ).toContainEqual(expect.objectContaining({ active: true }))
    const cls = classRow('Wardkeeper', 'EXAMPLE')
    const authored = cls.classFeatureRefs!.find((ref) => ref.name === 'Spellcasting')!.feature!
    for (const replacement of [
      { ...authored, entries: [...authored.entries!, 'You can prepare one additional spell.'] },
      { ...authored, source: '' },
    ]) {
      const changed = buildClassChoiceFeatureCatalogs({
        ...data,
        classes: data.classes.map((row) =>
          row !== cls
            ? row
            : {
                ...row,
                classFeatureRefs: row.classFeatureRefs?.map((ref) =>
                  ref.feature !== authored ? ref : { ...ref, feature: replacement },
                ),
              },
        ),
        classFeatures: data.classFeatures.map((feature) =>
          getClassFeatureIdentity(feature) === getClassFeatureIdentity(authored)
            ? replacement
            : feature,
        ),
      })
      expect(getManagedClassSpellSlots(entry, undefined, changed)).toEqual([])
    }
  })

  test('source filters cannot hide a competing casting declaration on a copied class', async () => {
    const layer = await new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true, availableResources: ['class/index.json'] },
      {
        type: 'local',
        readJson: async (file) => {
          const document = JSON.parse(await readFile(`data/${file}`, 'utf8'))
          if (file === 'class/class-warlock.json') {
            const copy = document.class.find((row: { source: string }) => row.source === 'WoW')
            const parent = document.class.find((row: { source: string }) => row.source === 'XPHB')
            copy.classFeatures = [...parent.classFeatures, 'Pact Magic|Warlock|PHB|1']
          }
          if (file === 'class/class-demonhunter.json') {
            const copy = document.class.find((row: { source: string }) => row.source === 'WoW')
            copy.classFeatures.push('Spellcasting|Ranger|PHB|2')
          }
          return document
        },
      },
    ).loadAllData()
    const loaded = composeGameDataLayers([layer])
    const filtered = buildClassChoiceFeatureCatalogs({
      ...loaded,
      classes: DataFilter.filterClasses(loaded.classes, { sources }),
    })
    const { owner, rule } = getClassSpellProfilePolicy({
      name: 'Warlock',
      source: 'WoW',
      levels: 1,
    })
    const copy = filtered.classes!.find((row) => row.name === 'Warlock' && row.source === 'WoW')
    expect(copy?.classFeatureRefs?.filter((ref) => ref.name === 'Pact Magic')).toHaveLength(1)
    expect(
      getClassSpellProfilePolicy(
        { name: 'Demon Hunter', source: 'WoW', levels: 1 },
        filtered.classCastingSources,
      ).rule,
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(filtered, owner, rule!.declaration.target, 1),
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(
        filtered,
        owner,
        'class-feature|mystic arcanum|warlock|xphb|11|xphb',
        11,
      ),
    ).toBeDefined()
  })
})
