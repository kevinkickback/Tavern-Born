// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getAlchemistChemicalDefenses } from '@/lib/5etools/artificerAlchemistSpells'
import {
  getArtificerAttunedSaveBonus,
  getArtificerAttunementLimit,
  getArtificerClassResources,
  getCurrentArtificerRules,
} from '@/lib/5etools/artificerJourneyRules'
import { getProgressiveChoiceGainCount } from '@/lib/5etools/classChoiceNormalization'
import { parseItems, parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { prepareToolProficiencySources } from '@/lib/5etools/toolProficiencySource'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { getClassProficiencyWorkflow } from '@/lib/character/classProficiencyWorkflow'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getEpicBoonSlots } from '@/lib/character/epicBoonSlots'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { getClassStaticFeatureSummaries } from '@/lib/pdf/classStaticFeatureSummaries'
import type { Class5e, ClassFeature, Item5e, OptionalFeatureLike } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'

const file = 'data/class/class-artificer.json'
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const actor = (source: string, levels: number) =>
  createEmptyCharacter({
    name: 'Artificer source journey',
    originSystem: source === 'EFA' ? '2024' : '2014',
    allowedSources: source === 'EFA' ? [source, 'XPHB', 'XDMG'] : [source, 'PHB', 'DMG'],
    classProgression: [{ name: 'Artificer', source, levels }],
  })

function load(
  document = read(file),
  items: Item5e[] = [],
  optionalfeatures: OptionalFeatureLike[] = [],
) {
  const parsed = parseClassDocument(document, file)
  const classes = parsed.classes as Class5e[]
  const catalogs = buildClassChoiceFeatureCatalogs({
    classes,
    classFeatures: parsed.classFeatures as ClassFeature[],
    items,
    optionalfeatures,
  })
  return { classes, catalogs }
}

test.skipIf(!existsSync(file)).each(['TCE', 'EFA'])(
  '%s Armorer models come from the first feature and survive strict reopen',
  (source) => {
    const { classes, catalogs } = load()
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === source)!
    const specialty = cls.subclasses!.find(
      (row) => row.name === 'Armorer' && row.source === source,
    )!
    const choice = getClassChoiceCandidates(cls, specialty, catalogs).find(
      (row) => row.label === 'Armor Model',
    )!
    const current = actor(source, choice.level)
    Object.assign(current.classProgression[0], { subclass: specialty.name, subclassSource: source })
    const withoutModel = getClassStaticFeatureSummaries(current, catalogs, false).find(
      (row) => row.compactText === 'Armor Model',
    )
    expect(withoutModel?.text).toMatch(/choose one of the following armor models/i)
    expect(withoutModel?.text).toMatch(/Lightning Launcher/i)
    const options = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      choice.level,
      current,
    )
    expect(
      options.filter((row) => row.availability === 'eligible').map((row) => row.reference.name),
    ).toEqual(
      source === 'TCE' ? ['Guardian', 'Infiltrator'] : ['Dreadnaught', 'Guardian', 'Infiltrator'],
    )
    const selected = options.find((row) => row.reference.name === 'Guardian')!
    expect(selected.presentation).toMatchObject({ featureTypeLabels: ['Armor Model'] })
    expect(JSON.stringify(selected.entries)).toMatch(/Thunder Gauntlets|Thunder Pulse/i)
    const result = applyClassChoiceSelectionWithGrantsCommand(
      current,
      current.provenance,
      choice,
      [selected.reference],
      { classes, catalogs },
    )
    const reopened = characterPersistenceSchema.parse({
      ...current,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    expect(reopened.classChoiceSelections?.[0]?.selected).toMatchObject([
      { name: 'Guardian', slotLevel: choice.level },
    ])
  },
)

test.skipIf(!existsSync(file)).each(['TCE', 'EFA'])(
  '%s Alchemist grants distinct limited feature casts when their source feature is earned',
  (source) => {
    const { classes } = load()
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === source)!
    const at = (level: number) =>
      getEarnedSubclassSpellGrants(cls, {
        name: 'Artificer',
        source,
        levels: level,
        subclass: 'Alchemist',
        subclassSource: source,
      })!
    expect(at(8).filter((row) => row.mode === 'cast-only' || row.mode === 'innate')).toEqual([])
    expect(at(9).filter((row) => row.mode === 'cast-only')).toMatchObject([
      {
        level: 9,
        feature: {
          name: 'Restorative Reagents',
          castingNote: expect.stringContaining('Intelligence modifier casts'),
        },
      },
    ])
    const late = at(15).filter((row) => row.mode === 'cast-only' && row.level === 15)
    expect(late.map((row) => row.spellName.toLowerCase())).toEqual(
      source === 'TCE'
        ? ['greater restoration|phb', 'heal|phb']
        : ["tasha's bubbling cauldron|xphb"],
    )
    expect(late.every((row) => row.castOnly?.ignoresMaterial)).toBe(true)
    expect(at(15).some((row) => row.mode === 'innate')).toBe(false)
    expect(at(15).some((row) => row.mode === 'prepared')).toBe(true)
    const defenses = (level: number) => {
      const current = actor(source, level)
      Object.assign(current.classProgression[0], { subclass: 'Alchemist', subclassSource: source })
      return getAlchemistChemicalDefenses(current, classes).map((row) => row.target)
    }
    expect(defenses(14)).toEqual([])
    expect(defenses(15)).toEqual([
      { kind: 'damage-resistance', damageType: 'acid' },
      { kind: 'damage-resistance', damageType: 'poison' },
      { kind: 'condition-immunity', condition: 'poisoned' },
    ])
  },
)

test.skipIf(!existsSync(file))(
  'a compatible new source model is selectable without a code entry',
  () => {
    const document = read(file)
    const armor = document.subclassFeature.find(
      (row: ClassFeature) => row.name === 'Armor Model' && row.source === 'EFA',
    )
    const original = document.subclassFeature.find(
      (row: ClassFeature) => row.name === 'Dreadnaught' && row.source === 'EFA',
    )
    const uid = 'Vanguard|Artificer|EFA|Armorer|EFA|3|EFA'
    armor.entries[0] = armor.entries[0].replace(
      ', or {@subclassFeature Infiltrator|Artificer|EFA|Armorer|EFA|3|EFA}',
      `, {@subclassFeature Infiltrator|Artificer|EFA|Armorer|EFA|3|EFA}, or {@subclassFeature ${uid}}`,
    )
    armor.entries.push({ type: 'refSubclassFeature', subclassFeature: uid })
    document.subclassFeature.push({
      ...original,
      name: 'Vanguard',
      entries: ['New current model rule.'],
    })
    const { classes, catalogs } = load(document)
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === 'EFA')!
    const specialty = cls.subclasses?.find((row) => row.name === 'Armorer' && row.source === 'EFA')
    const choice = getClassChoiceCandidates(cls, specialty, catalogs).find(
      (row) => row.label === 'Armor Model',
    )!
    const current = actor('EFA', choice.level)
    Object.assign(current.classProgression[0], { subclass: 'Armorer', subclassSource: 'EFA' })
    const selected = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      choice.level,
      current,
    ).find((row) => row.reference.name === 'Vanguard')
    expect(selected).toMatchObject({
      availability: 'eligible',
      entries: ['New current model rule.'],
    })
    const result = applyClassChoiceSelectionWithGrantsCommand(
      current,
      current.provenance,
      choice,
      [selected!.reference],
      { classes, catalogs },
    )
    expect(
      characterPersistenceSchema.parse({
        ...current,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }).classChoiceSelections?.[0]?.selected,
    ).toMatchObject([{ name: 'Vanguard', slotLevel: choice.level }])
  },
)

test.skipIf(!existsSync(file))(
  'classic Infusions enforce the structured prerequisite at the original gain',
  () => {
    const optional = parseOptionalFeatures(
      read('data/optionalfeatures.json'),
    ) as OptionalFeatureLike[]
    const { classes, catalogs } = load(undefined, [], optional)
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === 'TCE')!
    const choice = getClassChoiceCandidates(cls, undefined, catalogs).find(
      (row) => row.label === 'Infusions',
    )!
    const resolve = (levels: number) =>
      resolveClassChoiceOptions(
        choice,
        createClassChoiceCatalogs(catalogs),
        [],
        levels,
        actor('TCE', levels),
      ).find((row) => row.reference.name === 'Arcane Propulsion Armor')!
    const armor = resolve(14)
    expect(armor).toMatchObject({ availability: 'eligible', minimumClassLevel: 14 })
    expect(resolve(2)).toMatchObject({ availability: 'retained', minimumClassLevel: 14 })
    const character = actor('TCE', 14)
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [armor.reference],
        { classes, catalogs },
        undefined,
        '',
        2,
      ),
    ).toThrow(/prerequisites.*at this gain/)
  },
)

test.skipIf(!existsSync(file))(
  'classic Replicate Magic Item keeps separate source-qualified item plans',
  () => {
    const items = (parseItems(read('data/items.json')) as Item5e[]).filter(
      (row) =>
        row.source === 'DMG' &&
        ['Bag of Holding', 'Sending Stones', 'Boots of Elvenkind'].includes(row.name),
    )
    const optional = parseOptionalFeatures(
      read('data/optionalfeatures.json'),
    ) as OptionalFeatureLike[]
    const { classes, catalogs } = load(undefined, items, optional)
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === 'TCE')!
    const choice = getClassChoiceCandidates(cls, undefined, catalogs).find(
      (row) => row.label === 'Infusions',
    )!
    const character = actor('TCE', 6)
    const rows = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      6,
      character,
    )
    const earlier = rows.filter(
      (row) => row.reference.entityType === 'item' && row.minimumClassLevel === 2,
    )
    expect(earlier.map((row) => row.reference.name)).toEqual(
      expect.arrayContaining(['Bag of Holding', 'Sending Stones']),
    )
    const late = rows.find((row) => row.reference.name === 'Boots of Elvenkind')!
    expect(late.minimumClassLevel).toBe(6)
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [late.reference],
        { classes, catalogs },
        undefined,
        '',
        2,
      ),
    ).toThrow(/prerequisites.*at this gain/)
    expect(rows.some((row) => row.reference.name === 'Replicate Magic Item')).toBe(false)
  },
)

test.skipIf(!existsSync(file))(
  'revised Alchemist has separate historical tool fallbacks at the same gain',
  () => {
    const items = ['data/items.json', 'data/items-base.json'].flatMap(
      (path) => parseItems(read(path)) as Item5e[],
    )
    const { classes, catalogs } = load(undefined, prepareToolProficiencySources(items, items))
    let character = actor('EFA', 3)
    character.classProgression[0] = {
      ...character.classProgression[0],
      subclass: 'Alchemist',
      subclassSource: 'EFA',
    }
    character.proficiencies.tools = ["alchemist's supplies", 'herbalism kit']
    const workflow = () =>
      getClassProficiencyWorkflow(character, classes, catalogs).filter(
        (row) => row.subclassName === 'Alchemist' && row.domain === 'tools',
      )
    expect(workflow().map((row) => row.level)).toEqual([3, 3])
    for (const initial of workflow()) {
      const current = workflow().find((row) => row.id === initial.id)!
      const historical = setHistoricalProficiencySetupCommand(
        character,
        character.provenance,
        current.choice!,
        true,
        catalogs,
      )
      character = characterPersistenceSchema.parse({
        ...character,
        ...historical.characterPatch,
        provenance: historical.provenanceUpdate,
      })
      const ready = workflow().find((row) => row.id === initial.id)!
      const selected = ready.options.find((row) => row.availability === 'eligible')!
      expect(selected.reference.name.toLowerCase()).not.toBe("alchemist's supplies")
      const result = applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        ready.choice!,
        [selected.reference],
        { classes, catalogs },
      )
      character = characterPersistenceSchema.parse({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
      expect(character.proficiencies.tools).toContain(selected.reference.name.toLowerCase())
    }
    const selected = character.classChoiceSelections?.filter(
      (row) => row.subclassName === 'Alchemist',
    )
    expect(
      new Set(selected?.flatMap((row) => row.selected.map((option) => option.name))).size,
    ).toBe(2)
  },
)

test.skipIf(!existsSync(file))(
  'revised plans keep separate earned slots and the revised Epic Boon',
  () => {
    const items = (parseItems(read('data/items.json')) as Item5e[]).filter(
      (row) =>
        row.source === 'XDMG' &&
        [
          'Bag of Holding',
          'Sending Stones',
          'Wand of Secrets',
          'Goggles of Night',
          'Pipes of Haunting',
        ].includes(row.name),
    )
    const { classes, catalogs } = load(undefined, items)
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === 'EFA')!
    const choice = getClassChoiceCandidates(cls, undefined, catalogs).find(
      (row) => row.label === 'Replicate Magic Item',
    )!
    const current = actor('EFA', 6)
    const options = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      6,
      current,
    )
    const later = options.find((row) => row.reference.name === 'Pipes of Haunting')!
    expect(later).toMatchObject({ availability: 'eligible', minimumClassLevel: 6 })
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        current,
        current.provenance,
        choice,
        [later.reference],
        { classes, catalogs },
      ),
    ).toThrow(/earned level/)
    expect([2, 5, 6].map((level) => getProgressiveChoiceGainCount(choice, level))).toEqual([
      4, 0, 1,
    ])
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        current,
        current.provenance,
        choice,
        [later.reference],
        { classes, catalogs },
        undefined,
        '',
        2,
      ),
    ).toThrow(/prerequisites.*at this gain/)
    const first = options.filter(
      (row) => row.availability === 'eligible' && row.minimumClassLevel === 2,
    )
    expect(first).toHaveLength(4)
    const opening = applyClassChoiceSelectionWithGrantsCommand(
      current,
      current.provenance,
      choice,
      first.map((row) => row.reference),
      { classes, catalogs },
      undefined,
      '',
      2,
    )
    const saved = characterPersistenceSchema.parse({
      ...current,
      ...opening.characterPatch,
      provenance: opening.provenanceUpdate,
    })
    const expanded = applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance,
      choice,
      [later.reference],
      { classes, catalogs },
      undefined,
      getOptionalPoolSelectionHandle(saved.classChoiceSelections![0]),
      6,
    )
    const reopened = characterPersistenceSchema.parse({
      ...saved,
      ...expanded.characterPatch,
      provenance: expanded.provenanceUpdate,
    })
    expect(reopened.classChoiceSelections![0].selected.map((row) => row.slotLevel)).toEqual([
      2, 2, 2, 2, 6,
    ])
    expect(getEpicBoonSlots(actor('EFA', 18), catalogs, [])).toEqual([])
    expect(getEpicBoonSlots(actor('EFA', 19), catalogs, [])).toMatchObject([
      { state: 'empty', current: true },
    ])
    expect(getEpicBoonSlots(actor('TCE', 19), catalogs, [])).toEqual([])
  },
)

test.skipIf(!existsSync(file))(
  'revised plan catch-all rows use current wondrous and consumable item traits',
  () => {
    const expected = [
      'Cloak of Protection',
      'Amulet of Health',
      'Potion of Healing',
      'Spell Scroll (Cantrip)',
    ]
    const items = (parseItems(read('data/items.json')) as Item5e[]).filter(
      (row) => row.source === 'XDMG' && expected.includes(row.name),
    )
    expect(items.map((row) => row.name)).toEqual(expect.arrayContaining(expected))
    const { classes, catalogs } = load(undefined, items)
    const cls = classes.find((row) => row.name === 'Artificer' && row.source === 'EFA')!
    const choice = getClassChoiceCandidates(cls, undefined, catalogs).find(
      (row) => row.label === 'Replicate Magic Item',
    )!
    const current = actor('EFA', 14)
    const rows = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      14,
      current,
    )
    const eligible = rows.filter((row) => row.availability === 'eligible')
    expect(eligible.map((row) => [row.reference.name, row.minimumClassLevel])).toEqual(
      expect.arrayContaining([
        ['Cloak of Protection', 10],
        ['Amulet of Health', 14],
      ]),
    )
    const save = (name: string, level: number) =>
      applyClassChoiceSelectionWithGrantsCommand(
        current,
        current.provenance,
        choice,
        [{ entityType: 'item', name, source: 'XDMG' }],
        { classes, catalogs },
        undefined,
        '',
        level,
      )
    for (const name of expected.slice(2)) {
      expect(eligible.some((row) => row.reference.name === name)).toBe(false)
      expect(() => save(name, 2)).toThrow(/current source/)
    }
    expect(() => save('Amulet of Health', 10)).toThrow(/prerequisites.*at this gain/)
    const result = save('Amulet of Health', 14)
    const reopened = characterPersistenceSchema.parse({
      ...current,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    expect(reopened.classChoiceSelections?.[0]?.selected).toMatchObject([
      { name: 'Amulet of Health', slotLevel: 14 },
    ])
  },
)

test.skipIf(!existsSync(file))(
  'Artificer attunement and Flash of Genius follow earned rules',
  () => {
    const document = read(file)
    const current = (source: string, level: number) =>
      getCurrentArtificerRules(actor(source, level), load(document).catalogs)
    for (const source of ['TCE', 'EFA']) {
      expect(
        [9, 10, 14, 18].map((level) => getArtificerAttunementLimit(current(source, level), 3)),
      ).toEqual([3, 4, 5, 6])
    }
    expect(getArtificerAttunedSaveBonus(current('TCE', 19), 5)).toBeUndefined()
    expect(getArtificerAttunedSaveBonus(current('TCE', 20), 5)?.value).toBe(5)
    expect(getArtificerAttunedSaveBonus(current('EFA', 20), 5)).toBeUndefined()
    const adept = document.classFeature.find(
      (row: ClassFeature) => row.name === 'Magic Item Adept' && row.source === 'EFA',
    )
    adept.entries[0] = adept.entries[0].replace('four', 'five')
    expect(getArtificerAttunementLimit(current('EFA', 10), 3)).toBe(5)

    const { catalogs } = load(document)
    const flash = (level: number, attuned: boolean) => {
      const character = actor('EFA', level)
      character.equipment = [
        {
          id: 'test-magic-item',
          name: 'Attuned item',
          type: 'W',
          source: 'XDMG',
          quantity: 1,
          equipped: true,
          attuned,
        },
      ]
      return getArtificerClassResources(character, character.classProgression[0], catalogs, 4)[0]
    }
    expect(flash(6, false)).toBeUndefined()
    expect(flash(7, false)).toMatchObject({
      recovery: { longRest: 'all' },
      maxPerLevel: expect.arrayContaining([4]),
    })
    expect(flash(14, false)).toMatchObject({ recovery: { shortRest: 1, longRest: 'all' } })
    expect(flash(20, false)).toMatchObject({ recovery: { shortRest: 1, longRest: 'all' } })
    expect(flash(20, true)).toMatchObject({ recovery: { shortRest: 'all', longRest: 'all' } })
  },
)
