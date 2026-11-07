// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, expect, test } from 'vitest'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getCurrentFixedProficiencies } from '@/lib/character/fixedProficiencyAuthority'
import { getFixedLanguageDetails } from '@/lib/character/fixedProficiencyOwnership'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const hasCatalog = existsSync('data/class/class-sorcerer.json')
const editions = [
  { source: 'PHB', originSystem: '2014', gain: 1 },
  { source: 'XPHB', originSystem: '2024', gain: 3 },
] as const

const sharedOrigins = [
  ['PSK', 'Pyromancer (PSK)', 'Heart of Fire', "Pyromancer's Fury"],
  ['XGE', 'Divine Soul', 'Divine Magic', 'Otherworldly Wings'],
  ['XGE', 'Storm Sorcery', 'Tempestuous Magic', "Storm's Fury"],
  ['DSotDQ', 'Lunar Sorcery', 'Lunar Embodiment', 'Lunar Empowerment'],
] as const
const reviewedOrigins = {
  PHB: [
    ...sharedOrigins,
    ['PHB', 'Wild Magic', 'Tides of Chaos', 'Controlled Chaos'],
    ['XGE', 'Shadow Magic', 'Eyes of the Dark', 'Shadow Walk'],
    ['TCE', 'Aberrant Mind', 'Psionic Spells', 'Revelation in Flesh'],
    ['TCE', 'Clockwork Soul', 'Clockwork Magic', 'Trance of Order'],
  ],
  XPHB: [
    ...sharedOrigins,
    ['XPHB', 'Aberrant Sorcery', 'Psionic Spells', 'Revelation in Flesh'],
    ['XPHB', 'Clockwork Sorcery', 'Clockwork Spells', 'Trance of Order'],
    ['XPHB', 'Wild Magic Sorcery', 'Tides of Chaos', 'Controlled Chaos'],
    ['FRHoF', 'Spellfire Sorcery', 'Spellfire Burst', 'Honed Spellfire'],
    ['RHW', 'Shadow Sorcery', 'Power of Shadow', 'Shadow Walk'],
  ],
} as const
let data: GameData

beforeAll(async () => {
  if (!hasCatalog) return
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
  data = composeGameDataLayers([
    await load('bundled', 'resources/srd/core/data'),
    await load('local', 'data'),
  ])
})

function fixture(edition: (typeof editions)[number], subclass: string, subclassSource: string) {
  const build = (sources: string[]) => {
    const filtered = {
      ...data,
      classes: DataFilter.filterClasses(data.classes, { sources }),
      languages: DataFilter.filterLanguages(data.languages, { sources }),
    }
    return {
      ...buildGameDataLookups(filtered),
      classChoiceClasses: filtered.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(filtered),
    }
  }
  const sources = [edition.source, subclassSource]
  const primary = build(sources)
  const raw = buildGameDataLookups(data)
  const absent = build([edition.source])
  const reopen = (saved: Character, result?: CharacterCommandResult) =>
    characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify(
          result
            ? { ...saved, ...result.characterPatch, provenance: result.provenanceUpdate }
            : saved,
        ),
      ),
    )
  const actor = (levels: number) =>
    reopen(
      makeCharacterFixture({
        originSystem: edition.originSystem,
        allowedSources: sources,
        classProgression: [
          { name: 'Sorcerer', source: edition.source, levels, subclass, subclassSource },
        ],
      }),
    )
  const calculate = (saved: Character, lookups = primary) =>
    createCharacterCalculationContext(saved, lookups, raw)
  const profile = (saved: Character, lookups = primary) =>
    calculate(saved, lookups).character.spells.spellProfiles.find(
      (row) => row.id === 'class:Sorcerer|' + edition.source,
    )
  return { actor, calculate, profile, primary, raw, absent, reopen }
}

test.skipIf(!hasCatalog).each(editions)(
  'Divine Soul $source has one earned affinity and separate Cleric access',
  (edition) => {
    const { source, gain } = edition
    const { actor, calculate, profile, primary, absent, reopen } = fixture(
      edition,
      'Divine Soul',
      'XGE',
    )
    const saved = actor(gain)
    const catalogs = primary.classChoiceFeatureCatalogs
    const cls = catalogs.classes.find((row) => row.name === 'Sorcerer' && row.source === source)
    if (!cls) throw new Error('Missing exact Sorcerer class')
    const subclass = getSelectedSubclassData(cls, saved.classProgression[0])
    const choices = getCharacterClassChoices(
      cls,
      subclass,
      createOptionalClassFeatureActivity(saved, catalogs),
      catalogs,
    )
    const choice = choices.find((row) => row.label === 'Divine Soul Affinity')
    if (!choice) throw new Error('Missing earned affinity')
    expect(choice.level).toBe(gain)
    const options = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      gain,
      saved,
    ).filter(isClassChoiceOptionEligible)
    expect(options.map((row) => row.reference.name).sort()).toEqual([
      'Chaos',
      'Evil',
      'Good',
      'Law',
      'Neutrality',
    ])
    expect(profile(saved)?.spellsKnown).toEqual([])
    const choose = (character: Character, name: string) => {
      const option = options.find((row) => row.reference.name === name)
      if (!option) throw new Error('Missing affinity')
      return reopen(
        character,
        applyClassChoiceSelectionWithGrantsCommand(
          character,
          character.provenance,
          choice,
          [option.reference],
          {
            classes: catalogs.classes,
            catalogs,
            spellContext: calculate(character).classChoices.spellContext,
          },
        ),
      )
    }
    const fixed = (character: Character, lookups = primary) =>
      profile(character, lookups)
        ?.fixedSpells?.map((ref) => ref.toLowerCase())
        .sort() ?? []
    const law = choose(saved, 'Law')
    expect(fixed(law)).toEqual(['bless|' + source.toLowerCase()])
    expect(fixed(law, absent)).toEqual([])
    expect(fixed(law)).toEqual(['bless|' + source.toLowerCase()])
    const poolAt = (character: Character, kind: 'class-cantrip' | 'class-known') => {
      const context = calculate(character).classChoices.spellContext
      const slot = getManagedClassSpellSlots(
        character.classProgression[0],
        character,
        catalogs,
      ).find((row) => row[1] === kind && row[3] === (kind === 'class-cantrip' ? 1 : gain))
      if (!slot) throw new Error('Missing Sorcerer choice')
      return { context, slot, pool: getManagedClassSpellPool(character, slot, context) }
    }
    expect(poolAt(saved, 'class-cantrip').pool.defaultReferences).toContain(
      'guidance|' + source.toLowerCase(),
    )
    if (gain > 1)
      expect(poolAt(actor(gain - 1), 'class-cantrip').pool.defaultReferences).not.toContain(
        'guidance|' + source.toLowerCase(),
      )
    const { context, slot, pool } = poolAt(law, 'class-known')
    expect(pool.defaultReferences).toContain('cure wounds|' + source.toLowerCase())
    expect(pool.defaultReferences).not.toContain('bless|' + source.toLowerCase())
    const learned = reopen(
      law,
      setManagedClassSpellChoiceCommand(
        law,
        law.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: law.managedClassSpellRevision ?? 0,
          target: { name: 'Cure Wounds', source },
          policy: 'default',
        },
        context,
      ),
    )
    const good = choose(learned, 'Good')
    expect(fixed(good)).toEqual(['cure wounds|' + source.toLowerCase()])
    expect(calculate(good).managedClassSpellStatuses).toContainEqual(
      expect.objectContaining({ active: true, choice: learned.managedClassSpellChoices?.[0] }),
    )
  },
)

test.skipIf(!hasCatalog).each(editions)(
  'Lunar Sorcery $source gains its table spells, Moon Fire and the level-6 casting rule',
  (edition) => {
    const { source, gain } = edition
    const { actor, calculate, profile, primary, raw, absent } = fixture(
      edition,
      'Lunar Sorcery',
      'DSotDQ',
    )
    const first = ['shield', 'ray of sickness', 'color spray']
    const second = ['lesser restoration', 'blindness/deafness', 'alter self']
    const fixed = (level: number, lookups = primary) =>
      profile(actor(level), lookups)
        ?.fixedSpells?.map((ref) => ref.toLowerCase())
        .sort() ?? []
    const exact = (names: string[]) => names.map((name) => name + '|' + source.toLowerCase()).sort()
    const firstNames = [...first, ...(gain === 3 ? second : []), 'sacred flame']
    if (gain > 1) expect(fixed(gain - 1)).toEqual([])
    expect(fixed(gain)).toEqual(exact(firstNames))
    expect(fixed(3)).toEqual(exact([...first, ...second, 'sacred flame']))
    expect(fixed(gain, absent)).toEqual([])
    expect(fixed(gain)).toEqual(exact(firstNames))
    const earned = [...first, ...second, 'sacred flame']
    for (const [level, spells] of [
      [5, ['dispel magic', 'vampiric touch', 'phantom steed']],
      [7, ['death ward', 'confusion', 'hallucinatory terrain']],
      [9, ["rary's telepathic bond", 'hold monster', 'mislead']],
    ] as const) {
      expect(fixed(level - 1)).toEqual(exact(earned))
      earned.push(...spells)
      expect(fixed(level)).toEqual(exact(earned))
    }
    const notes = (level: number) =>
      calculate(actor(level)).fixedClassSpellStatuses.find(
        (row) => row.reference.toLowerCase() === 'shield|' + source.toLowerCase(),
      )?.castingNote
    expect(notes(5)).toContain('One use per Long Rest across all phases')
    expect(notes(6)).toContain('Waxing and Waning')
    expect(notes(6)).toContain('Full Moon')
    const sheet = createCharacterSheetViewModel(actor(6), raw, primary)
    expect(sheet.spellRows.find((row) => row.name === 'Shield')?.castingNote).toContain(
      'Waxing and Waning',
    )
  },
)

test.skipIf(!hasCatalog)(
  'revised Shadow Sorcery gains a casting-only Summon Beast at level 6',
  async () => {
    const { actor, calculate, profile, primary, raw, absent } = fixture(
      editions[1],
      'Shadow Sorcery',
      'RHW',
    )
    const saved = actor(6)
    const cast = (level: number, lookups = primary) =>
      calculate(level === 6 ? saved : actor(level), lookups).fixedClassSpellStatuses.find(
        (row) =>
          row.target === 'subclass-feature|beasts of ill omen|sorcerer|xphb|shadow|rhw|6|rhw',
      )
    expect(cast(5)).toBeUndefined()
    expect(cast(6)).toMatchObject({
      reference: 'Summon Beast|XPHB',
      castOnly: { castingTime: 'Bonus Action', ignoresMaterial: true },
      prepared: false,
      active: true,
    })
    expect(cast(6)?.castingNote).toContain('Spend 3 Sorcery Points to cast as a Bonus Action')
    expect(cast(6, absent)?.active).not.toBe(true)
    expect(cast(6)?.active).toBe(true)
    const owner = saved.classProgression[0]
    const cls = primary.classChoiceFeatureCatalogs.classes.find(
      (candidate) => candidate.name === owner.name && candidate.source === owner.source,
    )
    if (!cls) throw new Error('Missing revised Sorcerer source')
    const conflicting = {
      ...cls,
      subclasses: cls.subclasses?.map((origin) =>
        origin.name === owner.subclass && origin.source === owner.subclassSource
          ? {
              ...origin,
              additionalSpells: origin.additionalSpells?.map((block) => ({
                ...block,
                resourceName: 'Ki',
              })),
            }
          : origin,
      ),
    }
    expect(
      getEarnedSubclassSpellGrants(conflicting, owner)?.some((grant) => grant.mode === 'cast-only'),
    ).toBe(false)
    expect(profile(saved)?.spellsKnown).not.toContain('Summon Beast|XPHB')
    expect(profile(saved)?.alwaysPreparedSpells).not.toContain('Summon Beast|XPHB')
    const sheet = createCharacterSheetViewModel(saved, raw, primary)
    const row = sheet.spellRows.find((spell) => spell.name === 'Summon Beast')
    expect(row).toMatchObject({
      prepared: false,
      castOnly: true,
      level: '2',
      castingTime: 'Bonus Action',
      material: false,
    })
    expect(row?.castingNote).toContain('without a spell slot, preparation, or Material components')
    for (const template of ['2024-official', '2024-custom'] as const) {
      const bytes = await generateTestCharacterSheet(sheet, template, {
        text: { descriptions: 'full', overflow: 'notes' },
      })
      const form = (await PDFDocument.load(bytes)).getForm()
      const names = form
        .getFields()
        .filter(
          (field) =>
            field instanceof PDFTextField &&
            /^Text_1(?:2[2-9]|[34]\d|5[01])$/.test(field.getName()),
        ) as PDFTextField[]
      const summon = names.find((field) => field.getText() === 'Summon Beast')
      expect(summon, template).toBeDefined()
      const index = Number(summon?.getName().slice(5)) - 122
      expect(form.getTextField(`Text_${152 + index}`).getText()).toMatch(/^Bonus(?:;|$)/)
      expect(form.getCheckBox(`Checkbox_${61 + index * 3}`).isChecked()).toBe(false)
    }
  },
  20_000,
)

test.skipIf(!hasCatalog).each(editions)(
  'Storm Sorcery $source grants its exact Wind Speaker language at the subclass gain',
  (edition) => {
    const { actor, calculate, primary, absent, reopen } = fixture(edition, 'Storm Sorcery', 'XGE')
    const saved = actor(edition.gain)
    const projected = reopen(calculate(saved).character)
    expect(projected.proficiencies.languages).toContain('primordial')
    const tags = projected.provenance?.proficiencies.languages.primordial ?? []
    expect(tags).toContainEqual(
      expect.objectContaining({
        sourceName: 'Storm Sorcery',
        sourceRef: 'XGE',
        grantType: 'fixed',
      }),
    )
    expect(
      getFixedLanguageDetails(
        primary.classChoiceFeatureCatalogs.languages ?? [],
        'primordial',
        tags,
      )?.source,
    ).toBe(edition.source)
    expect(calculate(projected, absent).character.proficiencies.languages).not.toContain(
      'primordial',
    )
    expect(calculate(projected).character.proficiencies.languages).toContain('primordial')
    const catalogs = primary.classChoiceFeatureCatalogs
    for (const keepWrongGain of [false, true]) {
      const classes = catalogs.classes.map((row) =>
        row.name === 'Sorcerer' && row.source === edition.source
          ? {
              ...row,
              classFeatureRefs: row.classFeatureRefs?.flatMap((ref) =>
                ref.gainSubclassFeature && ref.feature?.level === edition.gain
                  ? keepWrongGain
                    ? [{ ...ref, ref: `Wrong Origin|Sorcerer|${edition.source}|${edition.gain}` }]
                    : []
                  : [ref],
              ),
            }
          : row,
      )
      expect(
        getCurrentFixedProficiencies(saved, { ...catalogs, classes }).some(({ rule }) =>
          rule.languages?.includes('primordial'),
        ),
      ).toBe(false)
    }
    expect(
      getCurrentFixedProficiencies(saved, catalogs).some(({ rule }) =>
        rule.languages?.includes('primordial'),
      ),
    ).toBe(true)
    if (edition.gain > 1)
      expect(calculate(actor(edition.gain - 1)).character.proficiencies.languages).not.toContain(
        'primordial',
      )
  },
)

test.skipIf(!hasCatalog)(
  'reviewed Sorcerer origin rules print at their exact earning levels',
  async () => {
    for (const edition of editions) {
      const { source, gain } = edition
      for (const [printing, name, initial, later] of reviewedOrigins[source]) {
        const { actor, primary, raw, absent } = fixture(edition, name, printing)
        const gained = actor(gain)
        const view = (level: number, visible = primary) =>
          createCharacterSheetViewModel(level === gain ? gained : actor(level), raw, visible)
        const names = (level: number, visible = primary) =>
          view(level, visible).declaredClassFeatureSummaries?.map((row) => row.compactText)
        if (gain > 1) expect(names(gain - 1), name).not.toContain(initial)
        expect(names(gain), name).toContain(initial)
        expect(names(13), name).not.toContain(later)
        expect(names(14), name).toContain(later)
        if (source === 'XPHB' && name === 'Divine Soul') {
          expect(names(gain, absent)).not.toContain(initial)
          expect(names(gain)).toContain(initial)
          const print = async (descriptions: 'full' | 'names') => {
            const bytes = await generateTestCharacterSheet(view(gain), '2024-official', {
              text: { descriptions, overflow: 'notes' },
            })
            const pdf = await PDFDocument.load(bytes)
            return pdf
              .getForm()
              .getFields()
              .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
              .join(' ')
              .replace(/\s+/g, ' ')
          }
          const full = await print('full')
          expect(full).toContain(initial)
          expect(full).toContain('cleric spell list or the sorcerer spell list')
          const compact = await print('names')
          expect(compact).toContain(initial)
          expect(compact).not.toContain('cleric spell list or the sorcerer spell list')
        }
      }
    }
  },
  90_000,
)
