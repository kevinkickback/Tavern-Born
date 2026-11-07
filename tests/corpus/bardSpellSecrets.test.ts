// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import {
  getCurrentBardJackOfAllTrades,
  getCurrentBardMagicalSecrets,
  hasCurrentBardWordsOfCreation,
} from '@/lib/5etools/bardSpellSources'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { BARD_PRIMAL_LORE_SPELL_SLOT } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { applySkillProficiencyActionCommand } from '@/lib/character/commands/skillProficiencyCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { addGrant, emptyProvenance } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character, Equipment } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const stacks = [['bundled', 'resources/srd/core/data']] as Array<['bundled' | 'local', string]>
if (existsSync('data/class/class-bard.json')) stacks.push(['local', 'data'])

const load = (type: 'bundled' | 'local', root: string) =>
  new FiveEToolsDataLoader(
    type === 'bundled'
      ? {
          type,
          path: 'srd/core',
          packId: 'tavern-born-srd-core',
          packVersion: '1.0.1',
          isValid: true,
        }
      : { type, path: resolve(root), isValid: true },
    { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
  ).loadAllData()

const reopen = (actor: Character, result?: ReturnType<typeof applyClassProgressionUpdate>) =>
  characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        result
          ? { ...actor, ...result.characterPatch, provenance: result.provenanceUpdate }
          : actor,
      ),
    ),
  )

test.each(
  stacks,
)('Copied Bard base producers cannot authorize current benefits (%s)', async (_type, path) => {
  const input = JSON.parse(await readFile(resolve(path, 'class/class-bard.json'), 'utf8')) as {
    classFeature: ClassFeature[]
  }
  const copied = new Set(['Jack of All Trades', 'Magical Secrets', 'Words of Creation'])
  const resolveBenefits = (classFeature: ClassFeature[]) => {
    const parsed = parseClassDocument({ ...input, classFeature })
    const classes = parsed.classes as Class5e[]
    const bard = classes.find((row) => row.name === 'Bard' && row.source === 'XPHB')!
    const catalogs = { classFeatures: parsed.classFeatures as ClassFeature[] }
    return [
      !!getCurrentBardJackOfAllTrades(bard, catalogs),
      !!getCurrentBardMagicalSecrets(classes, catalogs, 'xphb', 10),
      hasCurrentBardWordsOfCreation(bard, catalogs),
    ]
  }
  expect(resolveBenefits(input.classFeature)).toEqual([true, true, true])
  expect(
    resolveBenefits(
      input.classFeature.map((row) =>
        copied.has(row.name) ? { ...row, _copy: { name: row.name, source: 'XGE' } } : row,
      ),
    ),
  ).toEqual([false, false, false])
})

test.each(
  stacks,
)('Magical Secrets uses only the exact earned slots and current lists (%s)', async (type) => {
  const layers = await Promise.all(
    (type === 'bundled' ? stacks.slice(0, 1) : stacks).map(([kind, path]) => load(kind, path)),
  )
  const data = composeGameDataLayers(layers)
  const raw = buildGameDataLookups(data)
  if (type === 'local') {
    const collegeFixture = (source: string, college: string, printing: string) => {
      const sources = [source, printing]
      const current = { ...data, classes: DataFilter.filterClasses(data.classes, { sources }) }
      const lookups = {
        ...buildGameDataLookups(current),
        classChoiceClasses: current.classes,
        classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
      }
      const at = (levels: number) =>
        makeCharacterFixture({
          originSystem: source === 'PHB' ? '2014' : '2024',
          allowedSources: sources,
          classProgression: [
            { name: 'Bard', source, levels, subclass: college, subclassSource: printing },
          ],
        })
      const calculate = (actor: Character) => createCharacterCalculationContext(actor, lookups, raw)
      return { at, calculate, lookups }
    }
    for (const [source, college, printing, armor, weapons, tools, languages] of [
      ['PHB', 'College of Valor', 'PHB', ['medium', 'shields'], ['martial'], [], []],
      ['XPHB', 'College of Valor', 'XPHB', ['medium', 'shields'], ['martial'], [], []],
      ['PHB', 'College of Swords', 'XGE', ['medium'], ['scimitar'], [], []],
      ['XPHB', 'College of Swords', 'XGE', ['medium'], ['scimitar'], [], []],
      ['XPHB', 'College of Spirits', 'RHW', [], [], ['playing cards'], []],
      ['XPHB', 'College of the Moon', 'FRHoF', [], [], [], ['druidic']],
    ] as const) {
      const { at, calculate } = collegeFixture(source, college, printing)
      const projected = calculate(at(3)).character
      const domains = { armor, weapons, tools, languages }
      for (const [domain, expected] of Object.entries(domains)) {
        const key = domain as keyof typeof domains
        for (const name of expected) {
          expect(projected.proficiencies[key], college).toContain(name)
          expect(calculate(at(2)).character.proficiencies[key], college).not.toContain(name)
        }
      }
      if (college === 'College of Valor' || college === 'College of Swords') {
        expect(() => reopen(projected)).not.toThrow()
        const partial = structuredClone(projected)
        delete partial.provenance.proficiencies.armor.medium
        expect(() => reopen(partial)).toThrow()
      }
    }
    const moon = collegeFixture('XPHB', 'College of the Moon', 'FRHoF')
    const moonActor = moon.at(3)
    const moonContext = moon.calculate(moonActor).classChoices.spellContext
    expect(
      getManagedClassSpellSlots(
        moonActor.classProgression[0],
        moonActor,
        moon.lookups.classChoiceFeatureCatalogs,
      ),
    ).toContainEqual(BARD_PRIMAL_LORE_SPELL_SLOT)
    const moonPool = getManagedClassSpellPool(moonActor, BARD_PRIMAL_LORE_SPELL_SLOT, moonContext)
    expect(moonPool.defaultReferences.has('druidcraft|xphb')).toBe(true)
    expect(moonPool.defaultReferences.has('vicious mockery|xphb')).toBe(false)
    const moonChosen = reopen(
      moonActor,
      setManagedClassSpellChoiceCommand(
        moonActor,
        moonActor.provenance,
        {
          slot: BARD_PRIMAL_LORE_SPELL_SLOT,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: 'Druidcraft', source: 'XPHB' },
          policy: 'default',
        },
        moonContext,
      ),
    )
    expect(moon.calculate(moonChosen).managedClassSpellStatuses).toMatchObject([{ active: true }])
    const moonRolled = reopen(
      moonChosen,
      applyClassProgressionUpdate(moonChosen, moonChosen.provenance, [
        { name: 'Bard', source: 'XPHB', levels: 2 },
      ]),
    )
    expect(moonRolled.managedClassSpellChoices).toEqual([])

    const dance = collegeFixture('XPHB', 'College of Dance', 'XPHB')
    const dancer = dance.at(3)
    dancer.abilityScores = { ...dancer.abilityScores, dexterity: 14, charisma: 16 }
    const shield: Equipment = {
      id: 'shield',
      name: 'Shield',
      type: 'S',
      quantity: 1,
      equipped: true,
      armorType: 'shield',
      ac: 2,
    }
    const sheet = (actor: Character) => createCharacterSheetViewModel(actor, raw, dance.lookups)
    expect(sheet(dancer).effectiveArmorClass).toBe(15)
    expect(sheet({ ...dancer, equipment: [shield] }).effectiveArmorClass).toBe(14)
    const alternateSpelling = reopen({
      ...dancer,
      classProgression: [
        {
          ...dancer.classProgression[0],
          name: ' Bard ',
          subclass: ' College of Dance ',
          subclassSource: ' XPHB ',
        },
      ],
    })
    expect(sheet(alternateSpelling).effectiveArmorClass).toBe(15)
    expect(dance.calculate(alternateSpelling).effects.declarations).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Jack of All Trades' })]),
    )
    expect(
      sheet(dancer).declaredClassFeatureSummaries?.find(
        (row) => row.compactText === 'Dazzling Footwork',
      )?.text,
    ).toMatch(/unarmored defense.*charisma/is)

    for (const [source, college, printing, reference, mode, level] of [
      ['PHB', 'College of Spirits', 'VRGR', 'Guidance|PHB', 'known', 3],
      ['PHB', 'College of Glamour', 'XGE', 'Command|PHB', 'cast-only', 6],
      ['XPHB', 'College of Glamour', 'XPHB', 'Command|XPHB', 'prepared', 6],
      ['XPHB', 'College of the Moon', 'FRHoF', 'Moonbeam|XPHB', 'prepared', 6],
      ['XPHB', 'College of Spirits', 'RHW', 'Guidance|XPHB', 'known', 3],
      ['XPHB', 'College of Spirits', 'RHW', 'Spirit Guardians|XPHB', 'prepared', 6],
    ] as const) {
      const fixture = collegeFixture(source, college, printing)
      const at = (levels: number) => fixture.calculate(fixture.at(levels))
      const status = (levels: number) =>
        at(levels).fixedClassSpellStatuses.find((row) => row.reference === reference)
      expect(status(level - 1), reference).toBeUndefined()
      expect(status(level), reference).toMatchObject({
        active: true,
        prepared: mode === 'prepared',
        castingNote: expect.any(String),
        ...(mode === 'cast-only' && { castOnly: { castingTime: 'Bonus Action' } }),
      })
      const profile = at(level).character.spells.spellProfiles.find(
        (row) => row.id === `class:Bard|${source}`,
      )!
      if (mode === 'known') expect(profile.cantrips).toContain(reference)
      else if (mode === 'prepared') expect(profile.alwaysPreparedSpells).toContain(reference)
      else expect(profile.spellsKnown).not.toContain(reference)
    }
  }
  for (const source of ['PHB', 'XPHB'] as const) {
    const classic = source === 'PHB'
    const current = {
      ...data,
      classes: DataFilter.filterClasses(data.classes, { sources: [source] }),
    }
    const lookups = {
      ...buildGameDataLookups(current),
      classChoiceClasses: current.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
    }
    const actor = makeCharacterFixture({
      originSystem: classic ? '2014' : '2024',
      allowedSources: [source],
      classProgression: [{ name: 'Bard', source, levels: 20 }],
    })
    const context = (character: Character) =>
      createCharacterCalculationContext(character, lookups, raw)
    const starting = makeCharacterFixture({
      originSystem: classic ? '2014' : '2024',
      allowedSources: [source],
      classProgression: [{ name: 'Bard', source, levels: 1 }],
    })
    const startingChoice = context(starting).character.provenance.choices.find(
      (row) => row.sourceTag.sourceName === 'Bard' && row.domain === 'skills',
    )!
    expect(startingChoice).toMatchObject({ chooseCount: 3, selected: [] })
    expect(startingChoice.optionPool).toHaveLength(18)
    const startingPick = applySkillProficiencyActionCommand(
      starting,
      starting.provenance,
      'Arcana',
      `ledger:add:${startingChoice.id}`,
      {
        classes: current.classes,
        feats: current.feats,
        catalogs: lookups.classChoiceFeatureCatalogs,
      },
    )
    const restored = reopen(starting, startingPick)
    expect(
      restored.provenance.choices.find((row) => row.id === startingChoice.id)?.selected,
    ).toEqual(['arcana'])
    expect(context(restored).character.proficiencies.skills).toContain('arcana')
    const jack = (levels: number) =>
      context({
        ...restored,
        classProgression: [{ name: 'Bard', source, levels }],
      }).effects.declarations.filter((row) => row.label === 'Jack of All Trades')
    expect(jack(1)).toEqual([])
    expect(jack(2)).toHaveLength(17)
    expect(
      jack(2).some((row) => row.target.kind === 'skill-modifier' && row.target.skill === 'arcana'),
    ).toBe(false)
    expect(jack(20)[0].operation).toEqual({ kind: 'add', value: 3 })
    const slots = getManagedClassSpellSlots(actor.classProgression[0]).filter(
      (slot) => slot[1] === 'class-known',
    )
    const pool = (slot: ManagedClassSpellSlot) =>
      getManagedClassSpellPool(actor, slot, context(actor).classChoices.spellContext)
    const at = (level: number) => slots.filter((slot) => slot[3] === level)
    const level10 = at(10)[0]
    expect(level10).toBeDefined()
    if (type === 'local') {
      const variant = { name: "Ashardalon's Stride", source: 'FTD' }
      const allowedSources = [source, 'FTD']
      const withBook = { ...actor, allowedSources }
      const key = "ashardalon's stride|ftd"
      const variantPool = (character: Character, slot: ManagedClassSpellSlot) =>
        getManagedClassSpellPool(character, slot, context(character).classChoices.spellContext)
      expect(variantPool(actor, level10).defaultReferences.has(key)).toBe(false)
      expect(variantPool(withBook, level10).defaultReferences.has(key)).toBe(true)
      const chosen = reopen(
        withBook,
        setManagedClassSpellChoiceCommand(
          withBook,
          withBook.provenance,
          {
            slot: level10,
            expected: null,
            expectedEmptyRevision: 0,
            target: variant,
            policy: 'default',
          },
          context(withBook).classChoices.spellContext,
        ),
      )
      expect(context(chosen).managedClassSpellStatuses).toMatchObject([{ active: true }])
      expect(
        context({ ...chosen, allowedSources: [source] }).managedClassSpellStatuses,
      ).toMatchObject([{ active: false }])
      expect(context(reopen(chosen)).managedClassSpellStatuses).toMatchObject([{ active: true }])

      const lore = {
        ...withBook,
        classProgression: [
          { name: 'Bard', source, levels: 6, subclass: 'College of Lore', subclassSource: source },
        ],
      }
      const loreSlot = getManagedClassSpellSlots(lore.classProgression[0]).find(
        (slot) => slot[0][0] === 'subclass',
      )!
      expect(variantPool(lore, loreSlot).defaultReferences.has(key)).toBe(true)
    }
    const previous = slots.find((slot) => slot[3] === 1)!
    if (type === 'local') {
      const outsideList = classic
        ? { name: 'Gift of Alacrity', source: 'EGW' }
        : { name: 'Armor of Agathys', source }
      const withBook = { ...actor, allowedSources: [...new Set([source, outsideList.source])] }
      for (const slot of [previous, level10]) {
        const spellContext = context(withBook).classChoices.spellContext
        const request = {
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: outsideList,
        }
        expect(() =>
          setManagedClassSpellChoiceCommand(
            withBook,
            withBook.provenance,
            { ...request, policy: 'default' },
            spellContext,
          ),
        ).toThrow()
        const override = reopen(
          withBook,
          setManagedClassSpellChoiceCommand(
            withBook,
            withBook.provenance,
            { ...request, policy: 'ignore-class-list' },
            spellContext,
          ),
        )
        expect(context(override).managedClassSpellStatuses).toMatchObject([
          { active: true, choice: { policy: 'ignore-class-list' } },
        ])
      }
    }
    const target = classic ? 'Eldritch Blast' : 'Revivify'
    expect(
      pool(previous).defaultReferences.has(`${target.toLowerCase()}|${source.toLowerCase()}`),
    ).toBe(false)
    expect(
      pool(level10).defaultReferences.has(`${target.toLowerCase()}|${source.toLowerCase()}`),
    ).toBe(true)
    if (classic) {
      for (const [level, rank] of [
        [10, 5],
        [14, 7],
        [18, 9],
      ]) {
        expect(at(level)).toHaveLength(2)
        for (const slot of at(level))
          expect(pool(slot).allowedLevels).toEqual(
            Array.from({ length: rank + 1 }, (_, tier) => tier),
          )
      }
    } else {
      expect(pool(level10).allowedLevels).not.toContain(0)
      expect(pool(level10).defaultReferences.has('eldritch blast|xphb')).toBe(false)
      const words = (character: Character) =>
        context(character).fixedClassSpellStatuses.filter(
          (row) => row.featureName === 'Words of Creation',
        )
      expect(words({ ...actor, classProgression: [{ name: 'Bard', source, levels: 19 }] })).toEqual(
        [],
      )
      expect(words(actor)).toMatchObject(
        ['Power Word Heal', 'Power Word Kill'].map((name) => ({
          active: true,
          prepared: true,
          reference: `${name}|XPHB`,
          castingNote: expect.stringContaining('second creature within 10 feet'),
        })),
      )
    }
    const grant = setManagedClassSpellChoiceCommand(
      actor,
      actor.provenance,
      {
        slot: level10,
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: target, source },
        policy: 'default',
      },
      context(actor).classChoices.spellContext,
    )
    const saved = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...actor,
          ...grant.characterPatch,
          provenance: grant.provenanceUpdate,
        }),
      ),
    )
    const calculated = context(saved)
    expect(calculated.managedClassSpellStatuses[0]).toMatchObject({ active: true })
    const profile = calculated.character.spells.spellProfiles.find(
      (row) => row.id === `class:Bard|${source}`,
    )!
    expect(profile[classic ? 'cantrips' : 'spellsKnown']).toContain(`${target}|${source}`)

    let lore = makeCharacterFixture({
      originSystem: classic ? '2014' : '2024',
      allowedSources: [source],
      classProgression: [
        { name: 'Bard', source, levels: 6, subclass: 'College of Lore', subclassSource: source },
      ],
    })
    lore.proficiencies.skills = ['perception']
    const catalogs = lookups.classChoiceFeatureCatalogs
    const optionCatalogs = createClassChoiceCatalogs(catalogs)
    const cls = current.classes.find((row) => row.name === 'Bard' && row.source === source)!
    const choice = getCharacterClassChoices(
      cls,
      getSelectedSubclassData(cls, lore.classProgression[0]),
      createOptionalClassFeatureActivity(lore, catalogs),
      catalogs,
    ).find((row) => row.label === 'Bonus Proficiencies skills')!
    expect(choice).toMatchObject({ level: 3, minimumSelections: 3, maximumSelections: 3 })
    const options = resolveClassChoiceOptions(choice, optionCatalogs, [], 3, lore)
      .filter(isClassChoiceOptionEligible)
      .map((row) => row.reference)
    expect(options.map((row) => row.name.toLowerCase())).not.toContain('perception')
    const picked = options.slice(0, 3)
    expect(picked).toHaveLength(3)
    const commandContext = {
      classes: current.classes,
      catalogs: optionCatalogs,
      spellContext: context(lore).classChoices.spellContext,
    }
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        lore,
        lore.provenance,
        choice,
        [picked[0], picked[0], picked[1]],
        commandContext,
      ),
    ).toThrow()
    const training = applyClassChoiceSelectionWithGrantsCommand(
      lore,
      lore.provenance,
      choice,
      picked,
      {
        classes: current.classes,
        catalogs: optionCatalogs,
        spellContext: context(lore).classChoices.spellContext,
      },
    )
    lore = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...lore,
          ...training.characterPatch,
          provenance: training.provenanceUpdate,
        }),
      ),
    )
    expect(context(lore).character.proficiencies.skills).toEqual(
      expect.arrayContaining(['perception', ...picked.map((row) => row.name.toLowerCase())]),
    )
    const selectedSkills = picked.map((row) => row.name.toLowerCase())
    const skillTarget = `subclass-feature|bonus proficiencies|bard|${source.toLowerCase()}|lore|${source.toLowerCase()}|3|${source.toLowerCase()}`
    const withoutLoreLeaf = {
      ...cls,
      subclasses: cls.subclasses?.map((row) =>
        row.name === 'College of Lore' && row.source === source
          ? {
              ...row,
              subclassFeatureRefs: row.subclassFeatureRefs?.map((ref) =>
                ref.ref === row.introFeatureRef && ref.feature
                  ? {
                      ...ref,
                      feature: {
                        ...ref.feature,
                        entries: ref.feature.entries?.filter(
                          (entry) =>
                            !entry ||
                            typeof entry !== 'object' ||
                            !('subclassFeature' in entry) ||
                            typeof entry.subclassFeature !== 'string' ||
                            getSubclassFeatureIdentity(
                              decodeSubclassFeatureReference(entry.subclassFeature),
                            ) !== skillTarget,
                        ),
                      },
                    }
                  : ref,
              ),
            }
          : row,
      ),
    }
    const missingLeaf = {
      ...current,
      classes: current.classes.map((row) => (row === cls ? withoutLoreLeaf : row)),
    }
    const suspended = createCharacterCalculationContext(
      lore,
      {
        ...lookups,
        classChoiceClasses: missingLeaf.classes,
        classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(missingLeaf),
      },
      raw,
    )
    expect(suspended.character.proficiencies.skills).toEqual(['perception'])
    expect(lore.classChoiceSelections?.some((row) => row.choiceId === choice.id)).toBe(true)
    expect(context(reopen(lore)).character.proficiencies.skills).toEqual(
      expect.arrayContaining(selectedSkills),
    )
    const overlap = {
      ...lore,
      provenance: addGrant(
        lore.provenance ?? emptyProvenance(),
        'skills',
        selectedSkills[0],
        makeSourceTag('manual', 'User Choice', 'choice'),
      ),
    }
    const priorLevel = reopen(
      overlap,
      applyClassProgressionUpdate(overlap, overlap.provenance, [
        { name: 'Bard', source, levels: 2 },
      ]),
    )
    expect(context(priorLevel).character.proficiencies.skills.sort()).toEqual(
      ['perception', selectedSkills[0]].sort(),
    )
    const loreSlots = getManagedClassSpellSlots(lore.classProgression[0]).filter(
      (slot) => slot[0][0] === 'subclass',
    )
    expect(loreSlots).toHaveLength(2)
    for (const [ordinal, name] of ['Guidance', 'Revivify'].entries()) {
      const slot = loreSlots[ordinal]
      const spellContext = context(lore).classChoices.spellContext
      const selection = getManagedClassSpellPool(lore, slot, spellContext)
      expect(selection.allowedLevels).toEqual([0, 1, 2, 3])
      expect(selection.defaultReferences.has(`${name.toLowerCase()}|${source.toLowerCase()}`)).toBe(
        true,
      )
      const chosen = setManagedClassSpellChoiceCommand(
        lore,
        lore.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: lore.managedClassSpellRevision ?? 0,
          target: { name, source },
          policy: 'default',
        },
        spellContext,
      )
      lore = characterPersistenceSchema.parse(
        JSON.parse(
          JSON.stringify({
            ...lore,
            ...chosen.characterPatch,
            provenance: chosen.provenanceUpdate,
          }),
        ),
      )
    }
    const loreProfile = context(lore).character.spells.spellProfiles.find(
      (row) => row.id === `class:Bard|${source}`,
    )!
    expect(loreProfile.cantrips).toContain(`Guidance|${source}`)
    expect(loreProfile.spellsKnown).toContain(`Revivify|${source}`)
    expect(loreProfile.alwaysPreparedSpells?.includes(`Revivify|${source}`) ?? false).toBe(!classic)
    const rolled = applyClassProgressionUpdate(lore, lore.provenance, [
      { ...lore.classProgression[0], levels: 5 },
    ])
    const withdrawn = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...lore,
          ...rolled.characterPatch,
          provenance: rolled.provenanceUpdate,
        }),
      ),
    )
    expect(withdrawn.managedClassSpellChoices).toEqual([])
    expect(
      context(withdrawn).character.spells.spellProfiles.find(
        (row) => row.id === `class:Bard|${source}`,
      )?.cantrips,
    ).not.toContain(`Guidance|${source}`)
  }
}, 30_000)
