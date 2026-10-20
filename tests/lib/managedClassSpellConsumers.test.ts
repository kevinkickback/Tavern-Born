import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { buildSpellProfileDisplayModels } from '@/lib/calculations/spellProfileDisplayModel'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { hasCurrentClassSpellListRoute } from '@/lib/character/classSpellAuthority'
import {
  setManagedClassSpellChoiceCommand,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { pruneNonracialSpellSelections } from '@/lib/character/commands/sourceSpellPruningCommand'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { addSpellGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import { getSpellRows } from '@/lib/provenance/summaries'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeBundledClassCastingLayer,
  makeClassCastingLayer,
} from '../fixtures/classCastingFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

const { data, context, lookups } = makeManagedClassSpellFixtures()
const slot: ManagedClassSpellSlot = [
  ['class', 'bard', 'phb'],
  'class-cantrip',
  'class-feature|spellcasting|bard|phb|1|phb',
  1,
  0,
]
const initial = () =>
  makeCharacterFixture({ classProgression: [{ name: 'Bard', source: 'PHB', levels: 1 }] })
const add = (character: Character, target = { name: 'Light', source: 'PHB' }) => {
  const result = setManagedClassSpellChoiceCommand(
    character,
    character.provenance,
    { slot, expected: null, expectedEmptyRevision: 0, target, policy: 'ignore-class-list' },
    context,
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}

describe('shared current numeric spell consumers', () => {
  test('a current differing full and short subclass name retains its parser default without accepting conflicts', () => {
    const current = composeGameDataLayers([
      data,
      makeBundledClassCastingLayer('class/class-bard.json'),
    ])
    const authority = { ...context, catalogs: buildClassChoiceFeatureCatalogs(current) }
    const entry = {
      name: 'Bard',
      source: 'XPHB',
      levels: 3,
      subclass: 'College of Lore',
      subclassSource: 'XPHB',
    }
    const saved = makeCharacterFixture({ classProgression: [entry] })
    const spell = lookups.spellsByKey['Acid Splash|PHB']
    const native = spell.classes!.fromSubclass!.find((row) => row.class.name === 'Bard')!
    expect(native.subclass).toMatchObject({ name: 'College of Lore', shortName: 'Lore' })
    for (const name of ['College of Lore', 'Lore', ' college OF lore ']) {
      expect(
        hasCurrentClassSpellListRoute(
          saved,
          entry,
          {
            ...spell,
            classSpellRoutes: [],
            classSpellRouteSource: undefined,
            classes: { fromSubclass: [{ ...native, subclass: { ...native.subclass, name } }] },
          },
          authority,
        ),
      ).toBe(true)
    }
    for (const subclass of [
      { ...native.subclass, name: 'Conflicting College' },
      { ...native.subclass, shortName: 'Conflicting Lore' },
    ]) {
      expect(
        hasCurrentClassSpellListRoute(
          saved,
          entry,
          {
            ...spell,
            classSpellRoutes: [],
            classSpellRouteSource: undefined,
            classes: { fromSubclass: [{ ...native, subclass }] },
          },
          authority,
        ),
      ).toBe(false)
    }
  })

  test('current fixed provenance follows provider loss and restoration while preserving independent grants', () => {
    const saved: Character = characterPersistenceSchema.parse(
      JSON.parse(readFileSync('tests/fixtures/full-coverage-character-2014.tbc', 'utf8')),
    )
    saved.provenance = addSpellGrant(saved.provenance, 'Bless|PHB', {
      ...makeSourceTag('feat', 'Magic Initiate', 'choice', 'PHB'),
      grantSource: 'PHB',
    })
    saved.provenance = addSpellGrant(saved.provenance, 'Bless|XPHB', {
      ...makeSourceTag('manual', 'User Choice', 'choice'),
      grantSource: 'XPHB',
    })
    const current = composeGameDataLayers([
      data,
      makeBundledClassCastingLayer('class/class-cleric.json'),
    ])
    const catalogs = buildClassChoiceFeatureCatalogs(current)
    const before = JSON.stringify(saved)
    for (const visible of [true, false, true]) {
      const projected = projectManagedClassSpellState(saved, {
        ...context,
        catalogs: visible ? catalogs : { ...catalogs, classes: [] },
        spellsByKey: visible ? lookups.spellsByKey : {},
      }).character
      const fixed = projected.provenance.spells.bless.filter((tag) => tag.sourceType === 'subclass')
      expect(fixed.length > 0).toBe(visible)
      expect(
        getSpellRows(projected.provenance)
          .filter((row) => row.itemName.toLowerCase() === 'bless')
          .some((row) => row.sourceTypes.includes('subclass')),
      ).toBe(visible)
      expect(
        projected.provenance.spells.bless.filter((tag) =>
          ['feat', 'manual'].includes(tag.sourceType),
        ),
      ).toEqual(
        saved.provenance.spells.bless.filter((tag) => ['feat', 'manual'].includes(tag.sourceType)),
      )
    }
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('Spells completion counts earlier numeric choices even when a later subclass grants the same target', () => {
    const celestial = JSON.parse(
      readFileSync('tests/fixtures/managedClassFixedSubclass.json', 'utf8'),
    )
    const current = composeGameDataLayers([
      data,
      makeClassCastingLayer('class/class-warlock.json', (document) => {
        document.subclass = [...(document.subclass ?? []), celestial]
      }),
    ])
    const primary = {
      ...lookups,
      classesByKey: buildClassLookup(current.classes),
      classChoiceClasses: current.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
    }
    const entry = { name: 'Warlock', source: 'XPHB', levels: 1 }
    const initial = makeCharacterFixture({ classProgression: [entry] })
    const selected = setManagedClassSpellChoicesCommand(
      initial,
      initial.provenance,
      getManagedClassSpellSlots(entry)
        .filter((slot) => slot[1] === 'class-cantrip')
        .map((slot, index) => ({
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: ['Light', 'Eldritch Blast'][index], source: 'XPHB' },
          policy: 'ignore-class-list' as const,
        })),
      { ...context, catalogs: primary.classChoiceFeatureCatalogs },
    )
    const saved = characterPersistenceSchema.parse({
      ...initial,
      ...selected.characterPatch,
      provenance: selected.provenanceUpdate,
      classProgression: [
        { ...entry, levels: 3, subclass: 'Celestial Patron', subclassSource: 'XPHB' },
      ],
    })
    const before = JSON.stringify(saved)
    for (const visible of [true, false, true]) {
      const spellsByKey = visible
        ? primary.spellsByKey
        : Object.fromEntries(
            Object.entries(primary.spellsByKey).filter(
              ([, spell]) => getSpellReferenceKey(spell.name, spell.source) !== 'light|xphb',
            ),
          )
      const calculation = createCharacterCalculationContext(
        saved,
        { ...primary, spellsByKey },
        primary,
      )
      const profile = calculation.character.spells.spellProfiles.find(
        (row) => row.className === 'Warlock',
      )!
      const fixed = new Set(
        profile.fixedSpells?.map((reference) => getSpellReferenceKey(reference)),
      )
      const models = buildSpellProfileDisplayModels({
        spellProfiles: [profile],
        managedClassSpellStatuses: calculation.managedClassSpellStatuses,
        detailsByProfileId: new Map([[profile.id, { profileId: profile.id, cantripLimit: 2 }]]),
        groupedItems: new Map([
          [
            profile.id,
            profile.cantrips.map((name) => ({
              profileId: profile.id,
              profileLabel: profile.label,
              name,
              level: 0,
              kind: 'cantrip' as const,
              prepared: false,
              isFixed: fixed.has(getSpellReferenceKey(name)),
            })),
          ],
        ]),
      })
      expect(models[0].missingCantrips).toBe(visible ? 0 : 1)
      expect(
        profile.cantrips.some((name) => getSpellReferenceKey(name) === 'sacred flame|xphb'),
      ).toBe(true)
    }
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('native Arcane Trickster default-printing Mage Hand is current only with its exact target', () => {
    const saved = makeCharacterFixture({
      classProgression: [
        {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
          subclassSource: 'PHB',
        },
      ],
    })
    const before = JSON.stringify(saved)
    const missingDefault = Object.fromEntries(
      Object.entries(lookups.spellsByKey).filter(
        ([, spell]) => getSpellReferenceKey(spell.name, spell.source) !== 'mage hand|phb',
      ),
    )
    for (const [spellsByKey, expected] of [
      [lookups.spellsByKey, true],
      [missingDefault, false],
      [{}, false],
      [lookups.spellsByKey, true],
    ] as const) {
      const primary = { ...lookups, spellsByKey }
      const calculation = createCharacterCalculationContext(saved, primary, lookups)
      expect(
        calculation.character.spells.spellProfiles
          .find((row) => row.className === 'Rogue')
          ?.cantrips.some((row) => getSpellReferenceKey(row) === 'mage hand|phb'),
      ).toBe(expected)
      const actions = deriveCharacterActions(calculation.character, {
        abilityModifiers: calculation.abilityScores.modifiers,
        proficiencyBonus: 2,
        spellsByKey: lookups.spellsByKey,
        effectiveSpellProfiles: calculation.character.spells.spellProfiles,
        classChoiceFeatureCatalogs: primary.classChoiceFeatureCatalogs,
      })
      expect(actions.some((action) => action.name === 'Mage Hand')).toBe(expected)
      expect(
        createCharacterSheetViewModel(saved, lookups, primary).spellRows.some(
          (row) => row.name === 'Mage Hand',
        ),
      ).toBe(expected)
    }
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('current knowledge, prerequisites, Actions, PDF and readiness agree across target loss and exact restore', () => {
    const saved = add(initial())
    const before = JSON.stringify(saved)
    for (const available of [true, false, true]) {
      const primary = { ...lookups, spellsByKey: available ? lookups.spellsByKey : {} }
      const calculation = createCharacterCalculationContext(saved, primary, lookups)
      const profiles = calculation.character.spells.spellProfiles
      expect(profiles.find((row) => row.className === 'Bard')?.cantrips).toEqual(
        available ? ['Light|PHB'] : [],
      )
      expect(calculation.managedClassSpellStatuses[0].active).toBe(available)
      expect(calculation.character.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
      expect(calculation.character.managedClassSpellRevision).toBe(1)
      expect(characterPersistenceSchema.safeParse(calculation.character).success).toBe(true)
      const snapshot = buildPrerequisiteSnapshot({
        character: saved,
        classChoiceFeatureCatalogs: primary.classChoiceFeatureCatalogs,
        effectiveSpellProfiles: profiles,
      })
      expect(snapshot.spells?.cantrips).toEqual(available ? ['Light|PHB'] : [])
      const actions = deriveCharacterActions(calculation.character, {
        abilityModifiers: calculation.abilityScores.modifiers,
        proficiencyBonus: 2,
        spellsByKey: lookups.spellsByKey,
        effectiveSpellProfiles: profiles,
        classChoiceFeatureCatalogs: primary.classChoiceFeatureCatalogs,
      })
      expect(actions.some((action) => action.name === 'Light')).toBe(available)
      const pdf = createCharacterSheetViewModel(saved, lookups, primary)
      expect(pdf.spellRows.some((row) => row.name === 'Light')).toBe(available)
      const issues = validateSpells(saved, calculation, primary.spellsByKey)
      expect(issues.some((issue) => issue.explanation.includes('Light (PHB)'))).toBe(!available)
    }
    expect(JSON.stringify(saved)).toBe(before)
    // Supplying only retained text does not establish a current numeric source.
    expect(
      createCharacterSheetViewModel(saved, lookups, {}).spellRows.some(
        (row) => row.name === 'Light',
      ),
    ).toBe(false)
  })

  test('source pruning preserves numeric intent and its saved relation while current filtering suspends benefit', () => {
    const character = initial()
    character.allowedSources = ['PHB', 'TCE']
    const saved = add(character, { name: 'Mind Sliver', source: 'TCE' })
    const pruning = pruneNonracialSpellSelections(saved, saved.provenance, () => false)
    expect(pruning.characterPatch).toEqual({})
    expect(pruning.provenanceUpdate).toBe(saved.provenance)
    const disabled = { ...saved, allowedSources: ['PHB'] }
    const calculation = createCharacterCalculationContext(disabled, lookups, lookups)
    expect(calculation.managedClassSpellStatuses[0].active).toBe(false)
    expect(calculation.character.managedClassSpellChoices).toEqual(saved.managedClassSpellChoices)
    expect(characterPersistenceSchema.safeParse(disabled).success).toBe(true)
    expect(
      createCharacterCalculationContext(saved, lookups, lookups).managedClassSpellStatuses[0]
        .active,
    ).toBe(true)
  })

  test('actual Mark expansion requires the exact current selected race and suite context', () => {
    const races = parseRaces(
      JSON.parse(readFileSync('tests/fixtures/managedClassSpellExpansion.json', 'utf8')),
    ) as Race5e[]
    const primary = { ...lookups, racesByKey: buildRaceLookup(races) }
    const character = makeCharacterFixture({
      race: 'Halfling',
      raceSource: 'PHB',
      subrace: 'Mark of Hospitality',
      subraceSource: 'ERLW',
      allowedSources: ['PHB', 'ERLW'],
      classProgression: [{ name: 'Sorcerer', source: 'PHB', levels: 1 }],
    })
    const address: ManagedClassSpellSlot = [
      ['class', 'sorcerer', 'phb'],
      'class-known',
      'class-feature|spellcasting|sorcerer|phb|1|phb',
      1,
      0,
    ]
    const request = {
      slot: address,
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: 'Goodberry', source: 'PHB' },
      policy: 'default' as const,
    }
    const resolution = resolveRaceReference(
      {
        name: character.race,
        source: character.raceSource,
        subraceName: character.subrace,
        subraceSource: character.subraceSource,
      },
      primary,
      primary,
    )
    const result = setManagedClassSpellChoiceCommand(character, character.provenance, request, {
      ...context,
      currentRaceResolution: resolution,
    })
    const saved = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(characterPersistenceSchema.safeParse(saved).success).toBe(true)
    for (const current of [primary, { ...primary, racesByKey: {} }, primary]) {
      const calculation = createCharacterCalculationContext(saved, current, primary)
      expect(calculation.managedClassSpellStatuses[0].active).toBe(current === primary)
    }
    expect(() =>
      setManagedClassSpellChoiceCommand(
        { ...character, subraceSource: 'XPHB' },
        character.provenance,
        request,
        { ...context, currentRaceResolution: resolution },
      ),
    ).toThrow('spell list')
    expect(() =>
      setManagedClassSpellChoiceCommand(
        { ...character, allowedSources: ['PHB'] },
        character.provenance,
        request,
        { ...context, currentRaceResolution: resolution },
      ),
    ).toThrow('spell list')
  })
})
