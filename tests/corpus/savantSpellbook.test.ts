// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { renderHook } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  getCurrentSavantSpellbookGrant,
  getSavantSpellbookGain,
} from '@/lib/5etools/savantSpellbookRules'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  type ManagedClassSpellRequest,
  retainEarnedManagedClassSpells,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeBundledClassCastingLayer } from '../fixtures/classCastingFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const variants = [
  ['bundled', 'resources/srd/data'],
  ...(existsSync('data/class/class-wizard.json') ? [['local', 'data']] : []),
] as Array<['bundled' | 'local', string]>

const lookups = (data: GameData) => ({
  ...buildGameDataLookups(data),
  classChoiceClasses: data.classes,
  classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
})
const source = 'XPHB'
const entry = { name: 'Wizard', source, subclass: 'Evoker', subclassSource: source, levels: 20 }

const schools = [
  ['Abjurer', 'XPHB', 'A'],
  ['Diviner', 'XPHB', 'D'],
  ['Illusionist', 'XPHB', 'I'],
  ['Conjurer', 'AU', 'C'],
  ['Enchanter', 'AU', 'E'],
  ['Necromancer', 'AU', 'N'],
  ['Transmuter', 'AU', 'T'],
] as const

test.skipIf(!existsSync('data/class/class-wizard.json'))(
  'configured Savants earn only their school spellbook picks at each Wizard spell tier',
  async () => {
    const raw = composeGameDataLayers([
      await new FiveEToolsDataLoader(
        { type: 'local', path: resolve('data'), isValid: true },
        {
          type: 'local',
          readJson: async (file) => JSON.parse(await readFile(resolve('data', file), 'utf8')),
        },
      ).loadAllData(),
    ])
    const rawLookups = buildGameDataLookups(raw)
    useGameDataStore.setState({ gameData: { ...raw, lookups: rawLookups } })
    const visible = (allowedSources: string[]) => {
      const hook = renderHook(() =>
        useCharacterGameDataParams({ allowedSources, originSystem: '2024' }),
      )
      const current = lookups(hook.result.current)
      hook.unmount()
      return current
    }
    const current = visible([source, 'AU'])
    const withoutUnearthedArcana = visible([source])
    for (const [subclass, printing, school] of schools) {
      const owner = { ...entry, subclass, subclassSource: printing }
      const actor = makeCharacterFixture({
        originSystem: '2024',
        allowedSources: [source, printing],
        classProgression: [owner],
      })
      const context = (character: Character, catalog = current) =>
        createCharacterCalculationContext(character, catalog, rawLookups).classChoices.spellContext
      const slots = getManagedClassSpellSlots(owner).filter(getSavantSpellbookGain)
      const levels = [3, 3, 5, 7, 9, 11, 13, 15, 17]
      expect(
        slots.map((slot) => slot[3]),
        subclass,
      ).toEqual(levels)
      for (const gain of new Set(levels)) {
        const earned = (level: number) =>
          getManagedClassSpellSlots({ ...owner, levels: level }).filter(getSavantSpellbookGain)
        expect(
          earned(gain - 1).some((slot) => slot[3] === gain),
          subclass,
        ).toBe(false)
        expect(
          earned(gain).filter((slot) => slot[3] === gain),
          subclass,
        ).toEqual(slots.filter((slot) => slot[3] === gain))
      }
      let saved = actor
      for (const slot of slots) {
        const live = context(saved)
        const pool = getManagedClassSpellPool(saved, slot, live)
        const tier = Math.floor((slot[3] + 1) / 2)
        expect(pool.reason, subclass).toBeUndefined()
        expect(pool.allowedLevels, subclass).toEqual(
          Array.from({ length: tier }, (_, index) => index + 1),
        )
        expect(
          pool.spells.every(
            (spell) => spell.school === school && spell.level >= 1 && spell.level <= tier,
          ),
          subclass,
        ).toBe(true)
        const next = pool.spells.find(
          (spell) =>
            spell.source === source &&
            !saved.managedClassSpellChoices?.some((row) => row.target.name === spell.name),
        )
        if (!next) throw new Error(`No exact ${school} spell for ${subclass} at ${slot[3]}`)
        const result = setManagedClassSpellChoicesCommand(
          saved,
          saved.provenance,
          [
            {
              slot,
              expected: null,
              expectedEmptyRevision: saved.managedClassSpellRevision ?? 0,
              target: { name: next.name, source },
              policy: 'default',
            },
          ],
          live,
        )
        saved = characterPersistenceSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...saved,
              ...result.characterPatch,
              provenance: result.provenanceUpdate,
            }),
          ),
        )
      }
      expect(
        saved.managedClassSpellChoices?.filter(({ slot }) => getSavantSpellbookGain(slot)),
        subclass,
      ).toHaveLength(9)
      if (printing === 'AU') {
        expect(
          getManagedClassSpellPool(saved, slots[0], context(saved, withoutUnearthedArcana)).reason,
        ).toBeDefined()
        expect(getManagedClassSpellPool(saved, slots[0], context(saved)).reason).toBeUndefined()
      }
    }
  },
  90_000,
)

test.each([
  ['|XPHB', true],
  ['|PHB', false],
  ['|XPHB|unexpected', false],
] as const)('checks the complete raw Savant feature reference suffix %s', (suffix, allowed) => {
  const data = composeGameDataLayers([
    makeBundledClassCastingLayer('class/class-wizard.json', (doc) => {
      const intro = doc.subclassFeature.find(
        (row) => row.name === 'Evoker' && row.classSource === source,
      )
      const reference = (intro?.entries as Record<string, unknown>[] | undefined)?.find(
        (row) =>
          row?.type === 'refSubclassFeature' &&
          typeof row.subclassFeature === 'string' &&
          row.subclassFeature.startsWith('Evocation Savant|'),
      )
      if (!reference) throw new Error('Missing bundled Savant feature reference')
      reference.subclassFeature = String(reference.subclassFeature) + suffix
    }),
  ])
  const wizard = data.classes.find((row) => row.name === 'Wizard' && row.source === source)!
  const slot = getManagedClassSpellSlots(entry).find(getSavantSpellbookGain)!
  const catalog = scopeClassChoiceFeatureCatalogs(
    buildClassChoiceFeatureCatalogs(data),
    getFeatureOwnerKey('Wizard', source, 'Evoker', source),
  )
  expect(!!getCurrentSavantSpellbookGrant(slot, wizard, catalog)).toBe(allowed)
})

afterEach(() => useGameDataStore.setState({ gameData: null }))

test.each(variants)(
  'Savant adds exact learned spellbook choices in %s data',
  async (type, root) => {
    const rawData = composeGameDataLayers([
      await new FiveEToolsDataLoader(
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
      ).loadAllData(),
    ])
    useGameDataStore.setState({ gameData: { ...rawData, lookups: buildGameDataLookups(rawData) } })
    const filtered = renderHook(() =>
      useCharacterGameDataParams({ allowedSources: [source], originSystem: '2024' }),
    )
    const data = filtered.result.current
    filtered.unmount()
    const current = lookups(data)
    const actor = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: [source],
      classProgression: [entry],
      race: '',
      raceSource: '',
    })
    const view = (candidate: Character, supplied = current) =>
      createCharacterCalculationContext(candidate, supplied, current)
    const change = (candidate: Character, ...requests: ManagedClassSpellRequest[]) => {
      const result = setManagedClassSpellChoicesCommand(
        candidate,
        candidate.provenance,
        requests,
        view(candidate).classChoices.spellContext,
      )
      return characterPersistenceSchema.parse(
        JSON.parse(
          JSON.stringify({
            ...candidate,
            ...result.characterPatch,
            provenance: result.provenanceUpdate,
          }),
        ),
      )
    }
    const slots = getManagedClassSpellSlots(entry)
    const savant = slots.filter(getSavantSpellbookGain)
    expect(savant.map((slot) => slot[3])).toEqual([3, 3, 5, 7, 9, 11, 13, 15, 17])
    expect(getManagedClassSpellSlots({ ...entry, levels: 2 }).some(getSavantSpellbookGain)).toBe(
      false,
    )
    expect(
      getManagedClassSpellSlots({
        ...entry,
        subclass: 'School of Evocation',
        subclassSource: 'PHB',
      }).some(getSavantSpellbookGain),
    ).toBe(false)
    const [initial, second, next] = savant
    const context = view(actor).classChoices.spellContext
    const firstPool = getManagedClassSpellPool(actor, initial, context)
    expect(firstPool.reason).toBeUndefined()
    expect(firstPool.allowedLevels).toEqual([1, 2])
    expect(firstPool.spells.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Magic Missile', 'Shatter']),
    )
    expect(
      firstPool.spells.every((row) => row.school === 'V' && row.level > 0 && row.level <= 2),
    ).toBe(true)
    expect(getManagedClassSpellPool(actor, next, context).allowedLevels).toEqual([1, 2, 3])
    const request = (
      candidate: Character,
      slot: ManagedClassSpellSlot,
      name: string,
      prepare = false,
      policy: ManagedClassSpellRequest['policy'] = 'default',
    ): ManagedClassSpellRequest => ({
      slot,
      target: { name, source },
      expected: null,
      expectedEmptyRevision: candidate.managedClassSpellRevision ?? 0,
      prepare,
      policy,
    })
    for (const name of ['Fire Bolt', 'Mirror Image', 'Fireball']) {
      expect(() => change(actor, request(actor, initial, name))).toThrow()
    }
    expect(() =>
      change(actor, request(actor, initial, 'Magic Missile', false, 'ignore-class-list')),
    ).toThrow(/Wizard spell list/)
    const book = slots.find(
      (slot) => slot[1] === 'class-spellbook' && !getSavantSpellbookGain(slot),
    )!
    expect(() =>
      change(
        actor,
        request(actor, initial, 'Magic Missile'),
        request(actor, book, 'Magic Missile'),
      ),
    ).toThrow()
    const cap = (level: number) =>
      slots.find(
        (slot) => slot[1] === 'class-spellbook-specialty' && slot[3] === level && slot[4] === 0,
      )!
    const learned = change(
      actor,
      request(actor, initial, 'Magic Missile'),
      request(actor, second, 'Shatter', true),
      request(actor, next, 'Fireball'),
      request(actor, cap(18), 'Magic Missile'),
      request(actor, cap(20), 'Fireball'),
    )
    const calculation = view(learned)
    const active = calculation.managedClassSpellStatuses.filter(({ active }) => active)
    expect(active).toHaveLength(5)
    expect(
      calculation.character.spells.spellProfiles.find((row) => row.className === 'Wizard'),
    ).toMatchObject({
      spellsKnown: ['Magic Missile|XPHB', 'Shatter|XPHB', 'Fireball|XPHB'],
      preparedSpells: ['Shatter|XPHB'],
      alwaysPreparedSpells: ['Magic Missile|XPHB', 'Fireball|XPHB'],
    })
    expect(learned.provenance.spells.shatter).toContainEqual(
      expect.objectContaining({
        sourceName: 'Evoker',
        sourceRef: 'XPHB',
        label: 'Evocation Savant',
        spellGrantedAtLevel: 3,
      }),
    )
    const sheet = createCharacterSheetViewModel(learned, current, current)
    expect(sheet.spellRows.find((row) => row.name === 'Shatter')).toMatchObject({ prepared: true })
    expect(sheet.spellRows.find((row) => row.name === 'Fireball')).toMatchObject({
      prepared: true,
      castingNote: expect.stringContaining('Signature Spells'),
    })
    if (type === 'bundled') {
      const bytes = await generateTestCharacterSheet(sheet, '2024-official', {
        text: { descriptions: 'full', overflow: 'notes' },
      })
      const pdf = await PDFDocument.load(bytes)
      const fields = pdf
        .getForm()
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
      expect(fields).toContain('Shatter')
      expect(fields).toContain('Signature Spells')
    }
    for (const missing of [
      { additionalSpells: undefined },
      { subclassFeatureRefs: [] },
      { sourceIdentityConflict: true as const },
    ]) {
      const changed = lookups({
        ...data,
        classes: data.classes.map((cls) =>
          cls.name === 'Wizard' && cls.source === source
            ? {
                ...cls,
                subclasses: cls.subclasses?.map((row) =>
                  row.name === 'Evoker' && row.source === source ? { ...row, ...missing } : row,
                ),
              }
            : cls,
        ),
      })
      expect(view(learned, changed).managedClassSpellStatuses.every((row) => !row.active)).toBe(
        true,
      )
    }
    const fireball = learned.managedClassSpellChoices!.find(
      (row) => getSavantSpellbookGain(row.slot) && row.target.name === 'Fireball',
    )!
    const cleared = change(learned, { slot: fireball.slot, expected: fireball })
    expect(
      view(cleared).managedClassSpellStatuses.find(
        ({ choice }) =>
          choice.slot[1] === 'class-spellbook-specialty' && choice.target.name === 'Fireball',
      )?.active,
    ).toBe(false)
    expect(view(learned).managedClassSpellStatuses.every((row) => row.active)).toBe(true)
    let complete = learned
    for (const slot of savant.slice(3)) {
      const names = new Set(complete.managedClassSpellChoices?.map((row) => row.target.name))
      const pool = getManagedClassSpellPool(
        complete,
        slot,
        view(complete).classChoices.spellContext,
      )
      const spell = pool.spells.find((row) => row.source === source && !names.has(row.name))
      if (!spell) throw new Error('Savant slot has no eligible unused bundled spell')
      complete = change(complete, request(complete, slot, spell.name))
    }
    expect(
      view(complete).managedClassSpellStatuses.filter(
        ({ choice, active }) => active && getSavantSpellbookGain(choice.slot),
      ),
    ).toHaveLength(9)
    expect(
      getManagedClassSpellSlots(entry).filter(
        (slot) => slot[1] === 'class-spellbook' && !getSavantSpellbookGain(slot),
      ),
    ).toHaveLength(44)
    const swapped = retainEarnedManagedClassSpells(complete, [
      { ...entry, subclass: undefined, subclassSource: undefined },
    ])
    expect(swapped.managedClassSpellChoices?.some((row) => getSavantSpellbookGain(row.slot))).toBe(
      false,
    )
    expect(characterPersistenceSchema.safeParse(swapped).success).toBe(true)
    const rolled = retainEarnedManagedClassSpells(learned, [{ ...entry, levels: 4 }])
    expect(
      rolled.managedClassSpellChoices?.filter((row) => getSavantSpellbookGain(row.slot)),
    ).toHaveLength(2)
    expect(rolled.managedClassSpellRevision).toBe((learned.managedClassSpellRevision ?? 0) + 1)
    expect(characterPersistenceSchema.safeParse(rolled).success).toBe(true)
  },
  40_000,
)
