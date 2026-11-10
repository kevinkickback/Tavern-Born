import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
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
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
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
import {
  getDisplayedClassFeatures,
  projectClassLevelFeatures,
} from '@/pages/build/class/model/pageUtils'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

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

  const loadWithCopy = (parent: 'Cleric' | 'Druid', actor = 'Lightkeeper', source = 'EXAMPLE') =>
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
    expect(getEarnedSubclassSpellGrants(cls, character.classProgression[0])).toEqual([])
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
