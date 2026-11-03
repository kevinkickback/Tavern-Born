// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import {
  useCharacterGameDataParams,
  useFilteredGameDataParams,
} from '@/hooks/data/useFilteredGameData'
import { getLegacySubclassChoices } from '@/lib/5etools/legacySubclassChoices'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoiceDiagnostics,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeLegacySubclassActor, makeLegacySubclassData } from '../fixtures/legacySubclassFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const available = [
  'data/class/class-bard.json',
  'data/class/class-monk.json',
  'data/items-base.json',
  'data/optionalfeatures.json',
].every(existsSync)
describe.runIf(available)('configured source-owned Swords and Kensei setup', () => {
  let raw: GameData
  beforeAll(() => {
    raw = makeLegacySubclassData()
  })
  afterEach(() => {
    cleanup()
    resetCharacterStore()
  })
  function view(edition: '2014' | '2024', family: 'Bard' | 'Monk', level = 3, data = raw) {
    useGameDataStore.setState({ gameData: data })
    const hook = renderHook(() =>
      useCharacterGameDataParams({ originSystem: edition, allowedSources: ['XGE'] }),
    )
    const d = hook.result.current,
      cat = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(d))
    const character = makeLegacySubclassActor(data, edition, family, level),
      owner = character.classProgression[0]
    const cls = d.classes.find((c) => c.name === owner.name && c.source === owner.source)!,
      sub = cls.subclasses!.find(
        (s) => s.name === owner.subclass && s.source === owner.subclassSource,
      )!
    const choices = getCharacterClassChoices(
      cls,
      sub,
      createOptionalClassFeatureActivity(character, cat),
      cat,
    ).filter((c) => c.owner.type === 'subclass')
    return { d, cat, character, cls, sub, choices }
  }
  const save = (
    f: ReturnType<typeof view>,
    a: Character,
    choice: NormalizedCharacterChoice,
    picks: NormalizedChoiceOptionReference[],
  ) => {
    const result = applyClassChoiceSelectionWithGrantsCommand(a, a.provenance, choice, picks, {
      classes: f.d.classes,
      catalogs: f.cat,
    })
    return characterPersistenceSchema.parse({
      ...a,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const pick = (f: ReturnType<typeof view>, a: Character, label: string, names: string[]) => {
    const choice = f.choices.find((c) => c.label === label)!
    const options = resolveClassChoiceOptions(choice, f.cat, [], a.classProgression[0].levels, a)
    return save(
      f,
      a,
      choice,
      names.map((name) => {
        const option = options.find(
          (v) =>
            v.reference.name.toLowerCase() === name.toLowerCase() && v.availability === 'eligible',
        )
        expect(option, name).toBeDefined()
        return option!.reference
      }),
    )
  }
  function duties(f: ReturnType<typeof view>, character: Character, cat = f.cat) {
    const calc = createCharacterCalculationContext(character, {
      ...buildGameDataLookups(f.d),
      classChoiceClasses: f.d.classes,
      classChoiceFeatureCatalogs: cat,
    })
    return validateClassChoices(character, calc, cat)
  }
  for (const edition of ['2014', '2024'] as const) {
    test(
      edition + ' Swords uses only the two exact PHB optional features and no extra quota',
      () => {
        const f = view(edition, 'Bard'),
          choice = f.choices[0]
        expect(f.choices).toHaveLength(1)
        expect(choice.selectionCountByLevel).toEqual([0, 0, ...Array(18).fill(1)])
        const options = resolveClassChoiceOptions(choice, f.cat, [], 3, f.character)
        expect(
          options.map((v) => [v.reference.name, v.reference.source, v.reference.entityType]),
        ).toEqual([
          ['Dueling', 'PHB', 'optionalFeature'],
          ['Two-Weapon Fighting', 'PHB', 'optionalFeature'],
        ])
        const a = pick(f, f.character, 'Fighting Style', ['Dueling'])
        expect(getEffectiveClassChoiceFeatureRoutes(a, f.cat).featureIds.size).toBe(1)
        expect(duties(f, a).some((v) => v.title === 'Finish Fighting Style')).toBe(false)
        expect(() =>
          save(f, a, choice, [{ entityType: 'feat', name: 'Dueling', source: 'XPHB' }]),
        ).toThrow()
        expect(() =>
          save(f, a, { ...choice, id: choice.id + '-other' }, [options[0].reference]),
        ).toThrow()
        expect(save(f, a, choice, []).classChoiceSelections).toEqual([])
      },
    )
    test(edition + ' Kensei initial ranges, longbow exception, tools and later slots', () => {
      const f = view(edition, 'Monk', 20)
      expect(f.choices.map((c) => c.label)).toEqual(
        expect.arrayContaining([
          'Kensei melee weapon',
          'Kensei ranged weapon',
          'Additional Kensei weapons',
          'Way of the Brush',
        ]),
      )
      const pools = Object.fromEntries(
        f.choices.map((c) => [
          c.label,
          resolveClassChoiceOptions(c, f.cat, [], 20, f.character).filter(
            (v) => v.availability === 'eligible',
          ),
        ]),
      )
      expect(pools['Kensei melee weapon']).toHaveLength(21)
      expect(pools['Kensei ranged weapon']).toHaveLength(7)
      expect(pools['Additional Kensei weapons']).toHaveLength(28)
      expect(pools['Way of the Brush'].map((v) => v.reference.name)).toEqual([
        "Calligrapher's Supplies",
        "Painter's Supplies",
      ])
      expect(pools['Kensei ranged weapon'].map((v) => v.reference.name)).toContain('Longbow')
      expect(pools['Additional Kensei weapons'].map((v) => v.reference.name)).not.toEqual(
        expect.arrayContaining(['Staff', 'Wooden Staff', 'Greatsword', 'Net']),
      )
      let a = pick(f, f.character, 'Kensei melee weapon', ['Javelin'])
      a = pick(f, a, 'Kensei ranged weapon', ['Longbow'])
      a = pick(f, a, 'Way of the Brush', ["Painter's Supplies"])
      a = pick(f, a, 'Additional Kensei weapons', ['Whip', 'Longsword', 'Blowgun'])
      expect(
        a
          .classChoiceSelections!.find((s) => s.label === 'Additional Kensei weapons')!
          .selected.map((v) => v.slotLevel),
      ).toEqual([6, 11, 17])
      expect(a.proficiencies.weapons).toEqual(
        expect.arrayContaining(['javelin', 'longbow', 'whip', 'longsword', 'blowgun']),
      )
      expect(a.proficiencies.tools).toContain("painter's supplies")
      expect(a.equipment).toEqual(f.character.equipment)
      expect(
        duties(f, a).filter((v) =>
          /Finish (Kensei|Additional Kensei|Way of the Brush)/.test(v.title),
        ),
      ).toEqual([])
      const current = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(a)))
      expect(refreshClassProficiencyState(current, f.d.classes, f.cat).proficiencies).toEqual(
        a.proficiencies,
      )
      const rollback = applyClassProgressionUpdate(
        a,
        a.provenance,
        [{ ...a.classProgression[0], levels: 6 }],
        undefined,
        { classChoiceFeatureCatalogs: f.cat },
      )
      const lower = characterPersistenceSchema.parse({
        ...a,
        ...rollback.characterPatch,
        provenance: rollback.provenanceUpdate,
      })
      expect(
        lower
          .classChoiceSelections!.find((s) => s.label === 'Additional Kensei weapons')!
          .selected.map((v) => v.slotLevel),
      ).toEqual([6])
      expect(lower.proficiencies.weapons).not.toContain('longsword')
      expect(lower.proficiencies.weapons).toContain('whip')
    })
  }
  test('wrong pool/printing and cross-pool duplicates cannot be selected by the command', () => {
    const f = view('2024', 'Monk', 6),
      melee = f.choices.find((c) => c.label === 'Kensei melee weapon')!,
      extra = f.choices.find((c) => c.label === 'Additional Kensei weapons')!
    for (const pick of [
      { name: 'Longbow', source: 'PHB' },
      { name: 'Longsword', source: 'XPHB' },
      { name: 'Staff', source: 'PHB' },
      { name: 'Greatsword', source: 'PHB' },
    ])
      expect(() => save(f, f.character, melee, [{ entityType: 'item', ...pick }])).toThrow()
    const a = pick(f, f.character, melee.label, ['Longsword'])
    expect(() =>
      save(f, a, extra, [{ entityType: 'item', name: 'Longsword', source: 'PHB' }]),
    ).toThrow()
  })
  test('explicitly absent dependency catalog suspends benefits and readiness, exact restoration recovers intent', () => {
    const f = view('2024', 'Monk'),
      a = pick(f, f.character, 'Kensei ranged weapon', ['Longbow']),
      missing = { ...f.cat, legacySubclassChoices: [] }
    const dormant = refreshClassProficiencyState(a, f.d.classes, missing)
    expect(dormant.classChoiceSelections).toEqual(a.classChoiceSelections)
    expect(dormant.proficiencies.weapons).not.toContain('longbow')
    expect(
      duties(f, dormant, missing).some(
        (v) =>
          new URL(v.navigationTarget, 'http://local').searchParams.get('choice') ===
            a.classChoiceSelections![0].choiceId && v.severity === 'blocking',
      ),
    ).toBe(true)
    expect(
      refreshClassProficiencyState(dormant, f.d.classes, f.cat).proficiencies.weapons,
    ).toContain('longbow')
    expect(
      save(
        { ...f, cat: missing },
        dormant,
        f.choices.find((c) => c.label === 'Kensei ranged weapon')!,
        [],
      ).classChoiceSelections,
    ).toEqual([])
    expect(characterPersistenceSchema.safeParse(dormant).success).toBe(true)
  })
  test('Clear preserves untracked preexisting weapons/tools and source-owned siblings', () => {
    const f = view('2024', 'Monk'),
      before = {
        ...f.character,
        proficiencies: {
          ...f.character.proficiencies,
          weapons: [...f.character.proficiencies.weapons, 'longbow'],
          tools: ["painter's supplies"],
        },
      }
    let a = pick(f, before, 'Kensei ranged weapon', ['Longbow'])
    a = pick(f, a, 'Way of the Brush', ["Painter's Supplies"])
    a = save(f, a, f.choices.find((c) => c.label === 'Kensei ranged weapon')!, [])
    expect(a.proficiencies.weapons).toContain('longbow')
    expect(a.provenance.proficiencies.weapons.longbow.map((t) => t.sourceType)).toEqual(['manual'])
    expect(a.classChoiceSelections!.some((s) => s.label === 'Way of the Brush')).toBe(true)
    a = save(f, a, f.choices.find((c) => c.label === 'Way of the Brush')!, [])
    expect(a.proficiencies.tools).toEqual(["painter's supplies"])
    expect(a.provenance.proficiencies.tools["painter's supplies"].map((t) => t.sourceType)).toEqual(
      ['manual'],
    )
  })
  test.each([
    'parent',
    'root',
    'leaf',
    'path',
  ])('conflicting %s authority cannot fall back to cached normalized choices', (field) => {
    const changed = makeLegacySubclassData((raw) => {
      if (field === 'parent')
        raw.monk.class.push(structuredClone(raw.monk.class.find((c) => c.source === 'XPHB')!))
      if (field === 'root')
        raw.monk.subclass.push(
          structuredClone(
            raw.monk.subclass.find(
              (s) => s.name === 'Way of the Kensei' && s.classSource === 'XPHB',
            )!,
          ),
        )
      if (field === 'leaf')
        raw.monk.subclassFeature.push(
          structuredClone(raw.monk.subclassFeature.find((s) => s.name === 'Path of the Kensei')!),
        )
      if (field === 'path') {
        const intro = raw.monk.subclassFeature.find((s) => s.name === 'Way of the Kensei')!
        intro.entries = []
      }
    })
    const f = view('2024', 'Monk', 3, changed)
    expect(f.choices).toEqual([])
    expect(
      getCharacterClassChoiceDiagnostics(
        f.cls,
        f.sub,
        createOptionalClassFeatureActivity(f.character, f.cat),
        f.cat,
      ).some((d) => d.featureName === 'Path of the Kensei'),
    ).toBe(true)
  })
  test('non-target mixed subclass mirror metadata cannot throw or replace current root authority', () => {
    const f = view('2014', 'Monk'),
      before = getLegacySubclassChoices(f.cls, f.sub, f.cat)
    ;(f.sub.subclassFeatures as unknown[]).push(null, {}, 17)
    expect(getLegacySubclassChoices(f.cls, f.sub, f.cat)).toEqual(before)
  })
  test.each([
    'duplicate',
    'missing',
    'wrong-printing',
    'magic',
  ])('unavailable target (%s) never borrows another printing', (field) => {
    const changed = makeLegacySubclassData((raw) => {
      const item = raw.items.baseitem.find((v) => v.name === 'Longbow' && v.source === 'PHB')!
      if (field === 'duplicate') raw.items.baseitem.push(structuredClone(item))
      if (field === 'missing' || field === 'wrong-printing')
        raw.items.baseitem = raw.items.baseitem.filter((v) => v !== item)
      if (field === 'magic') item.rarity = 'rare'
    })
    const f = view('2024', 'Monk', 3, changed),
      choice = f.choices.find((c) => c.label === 'Kensei ranged weapon')!
    expect(
      resolveClassChoiceOptions(choice, f.cat, [], 3, f.character).some(
        (v) => v.reference.name === 'Longbow',
      ),
    ).toBe(false)
    expect(() =>
      save(f, f.character, choice, [{ entityType: 'item', name: 'Longbow', source: 'PHB' }]),
    ).toThrow()
    expect(f.d.itemsBase.some((v) => v.source === 'PHB')).toBe(false)
  })
  test.each([
    'duplicate',
    'missing',
    'wrong-printing',
    'wrong-type',
  ])('Swords refuses an unavailable exact optional feature (%s) and retains its other option', (field) => {
    const changed = makeLegacySubclassData((raw) => {
      const row = raw.optional.optionalfeature.find(
        (v) => v.name === 'Dueling' && v.source === 'PHB',
      )!
      if (field === 'duplicate') raw.optional.optionalfeature.push(structuredClone(row))
      if (field === 'missing')
        raw.optional.optionalfeature = raw.optional.optionalfeature.filter((v) => v !== row)
      if (field === 'wrong-printing') row.source = 'TEST'
      if (field === 'wrong-type') row.featureType = ['FS:F']
    })
    const f = view('2024', 'Bard', 3, changed),
      choice = f.choices[0]
    expect(
      resolveClassChoiceOptions(choice, f.cat, [], 3, f.character).map((v) => v.reference.name),
    ).toEqual(['Two-Weapon Fighting'])
    expect(() =>
      save(f, f.character, choice, [
        { entityType: 'optionalFeature', name: 'Dueling', source: 'PHB' },
      ]),
    ).toThrow()
  })
  test.each([
    'Bard',
    'Monk',
  ] as const)('%s saved setup has current details and source-free recovery with stale-handle protection', (family) => {
    const f = view('2024', family),
      label = family === 'Bard' ? 'Fighting Style' : 'Kensei ranged weapon',
      name = family === 'Bard' ? 'Dueling' : 'Longbow'
    const a = pick(f, f.character, label, [name]),
      id = a.classChoiceSelections![0].choiceId
    expect(
      buildRetainedCharacterDetails(a, f.d, raw).choiceDetailsById.get(id)?.[0].availability,
    ).toBe('available')
    const missing = { ...f.cat, classes: [], legacySubclassChoices: [] }
    const states = getFeatureOptionSelectionStates(a, f.d.classes, missing)
    expect(states.find((s) => s.selection.choiceId === id)?.recovery).toBe(true)
    const handle = getOptionalPoolSelectionHandle(a.classChoiceSelections![0])
    expect(() =>
      retainSavedFeatureOptionsCommand(
        a,
        a.provenance,
        id,
        [],
        { classes: f.d.classes, catalogs: missing },
        handle + '-stale',
      ),
    ).toThrow()
    const clear = retainSavedFeatureOptionsCommand(
      a,
      a.provenance,
      id,
      [],
      { classes: f.d.classes, catalogs: missing },
      handle,
    )
    const cleared = characterPersistenceSchema.parse({
      ...a,
      ...clear.characterPatch,
      provenance: clear.provenanceUpdate,
    })
    expect(cleared.classChoiceSelections).toEqual([])
    expect(cleared.proficiencies.weapons).not.toContain('longbow')
    expect(cleared.features.some((v) => v.name === 'Dueling')).toBe(false)
  })
  test.each([
    'Bard',
    'Monk',
  ] as const)('%s ordinary target metadata cannot promote unavailable family dependencies to active details', (family) => {
    const f = view('2014', family),
      label = family === 'Bard' ? 'Fighting Style' : 'Kensei ranged weapon',
      name = family === 'Bard' ? 'Dueling' : 'Longbow',
      a = pick(f, f.character, label, [name]),
      id = a.classChoiceSelections![0].choiceId,
      missing = { ...f.d, legacySubclassChoices: [] }
    expect(family === 'Bard' ? f.d.optionalfeatures : f.d.itemsBase).toEqual(
      expect.arrayContaining([expect.objectContaining({ name, source: 'PHB' })]),
    )
    const before = JSON.stringify(a)
    const unavailable = buildRetainedCharacterDetails(a, missing, raw).choiceDetailsById.get(id)![0]
    expect(unavailable.availability).toBe('source-unavailable')
    const entities = family === 'Bard' ? raw.optionalfeatures : raw.itemsBase
    const target = entities.find(
      (v) =>
        !!v &&
        typeof v === 'object' &&
        'name' in v &&
        v.name === name &&
        'source' in v &&
        v.source === 'PHB',
    ) as { entries?: unknown[] }
    expect(unavailable.entries).toEqual(target.entries ?? [])
    expect(
      buildRetainedCharacterDetails(a, f.d, raw).choiceDetailsById.get(id)![0].availability,
    ).toBe('available')
    expect(JSON.stringify(a)).toBe(before)
  })
  test.each([
    'Bard',
    'Monk',
  ] as const)('%s root UID explicit defaults preserve the same qualified feature in both editions', (family) => {
    const changed = makeLegacySubclassData((raw) => {
      const doc = family === 'Bard' ? raw.bard : raw.monk,
        name = family === 'Bard' ? 'College of Swords' : 'Way of the Kensei',
        short = family === 'Bard' ? 'Swords' : 'Kensei',
        root = doc.subclass.find((s) => s.name === name && s.classSource === 'PHB')!
      const refs = root.subclassFeatures as string[]
      refs[0] = `${name}|${family}|PHB|${short}|XGE|3|XGE`
    })
    for (const edition of ['2014', '2024'] as const) {
      const f = view(edition, family, 3, changed)
      expect(f.choices).toHaveLength(family === 'Bard' ? 1 : 3)
      expect(
        pick(f, f.character, family === 'Bard' ? 'Fighting Style' : 'Kensei ranged weapon', [
          family === 'Bard' ? 'Dueling' : 'Longbow',
        ]).classChoiceSelections,
      ).toHaveLength(1)
    }
  })
  test.each([
    'Bard',
    'Monk',
  ] as const)('%s unrestricted source view retains scoped setup dependencies', (family) => {
    const f = view('2014', family)
    const d = renderHook(() => useFilteredGameDataParams({})).result.current
    const cat = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(d))
    const choice = f.choices.find(
      (v) => v.label === (family === 'Bard' ? 'Fighting Style' : 'Kensei ranged weapon'),
    )!
    expect(
      resolveClassChoiceOptions(choice, cat, [], 3, f.character).filter(
        (v) => v.availability === 'eligible',
      ),
    ).toHaveLength(family === 'Bard' ? 2 : 7)
  })
  test.each([
    ['Bard', 'open'],
    ['Monk', 'open'],
    ['Bard', 'queue'],
    ['Monk', 'queue'],
  ] as const)('%s %s captured confirmation cannot overwrite a newer allocation', (family, mode) => {
    const f = view('2024', family),
      label =
        family === 'Bard'
          ? 'Fighting Style'
          : mode === 'open'
            ? 'Kensei ranged weapon'
            : 'Kensei melee weapon',
      initial = family === 'Bard' ? 'Dueling' : 'Longbow',
      newer = family === 'Bard' ? 'Two-Weapon Fighting' : mode === 'open' ? 'Sling' : 'Longsword',
      draft = family === 'Bard' ? 'Dueling' : mode === 'open' ? 'Dart' : 'Javelin',
      a =
        mode === 'open' && family === 'Monk' ? pick(f, f.character, label, [initial]) : f.character,
      choice = f.choices.find((v) => v.label === label)!,
      catalogs = {
        ...f.cat,
        creatures: f.d.creatures ?? [],
        feats: f.d.feats,
        items: f.d.items,
        itemsBase: f.d.itemsBase,
        itemMasteries: [],
      }
    setActiveCharacter(a)
    const hook = renderHook(() => {
      const character = useCharacterStore((s) => s.activeCharacter)
      return useClassChoiceController({
        character,
        viewingClassData: f.cls,
        viewingClassEntry: character!.classProgression[0],
        viewingSubclassData: f.sub,
        viewingClassLevel: 3,
        catalogs,
      })
    })
    act(() =>
      mode === 'open'
        ? hook.result.current.open(choice)
        : hook.result.current.configureSubclass(f.sub),
    )
    expect(hook.result.current.activeChoice?.id).toBe(choice.id)
    const confirm = hook.result.current.confirm,
      option = hook.result.current.activeOptionViews.find((v) => v.reference.name === draft)!,
      latest = pick(f, a, label, [newer])
    act(() => {
      setActiveCharacter(latest)
      confirm([option])
    })
    expect(useCharacterStore.getState().activeCharacter).toEqual(latest)
  })
  test('Longbow exception requires a current ranged weapon in initial and later pools', () => {
    const changed = makeLegacySubclassData((raw) => {
      raw.items.baseitem.find((v) => v.name === 'Longbow' && v.source === 'PHB')!.type = 'M'
    })
    const f = view('2024', 'Monk', 6, changed)
    for (const label of ['Kensei ranged weapon', 'Additional Kensei weapons']) {
      const choice = f.choices.find((v) => v.label === label)!
      expect(
        resolveClassChoiceOptions(choice, f.cat, [], 6, f.character).some(
          (v) => v.reference.name === 'Longbow',
        ),
      ).toBe(false)
      expect(() =>
        save(f, f.character, choice, [{ entityType: 'item', name: 'Longbow', source: 'PHB' }]),
      ).toThrow()
    }
    const restored = view('2024', 'Monk', 6)
    expect(
      pick(restored, restored.character, 'Kensei ranged weapon', ['Longbow']).proficiencies.weapons,
    ).toContain('longbow')
  })
  test('subclass removal retracts only Kensei-owned proficiencies and selections', () => {
    const f = view('2024', 'Monk'),
      a = pick(f, f.character, 'Kensei ranged weapon', ['Longbow'])
    const replacement = f.cls.subclasses!.find((s) => s.name !== 'Way of the Kensei')!
    const result = applyClassProgressionUpdate(
      a,
      a.provenance,
      [
        {
          ...a.classProgression[0],
          subclass: replacement.name,
          subclassSource: replacement.source,
        },
      ],
      undefined,
      { classChoiceFeatureCatalogs: f.cat },
    )
    const replaced = characterPersistenceSchema.parse({
      ...a,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    expect(replaced.classChoiceSelections).toEqual([])
    expect(replaced.proficiencies.weapons).not.toContain('longbow')
    expect(replaced.proficiencies.weapons).toContain('simple')
  })
  test('a Kensei item reference never supplies mastery from changed item metadata', () => {
    const f = view('2024', 'Monk'),
      a = pick(f, f.character, 'Kensei ranged weapon', ['Longbow'])
    const item = raw.itemsBase.find((i) => i.name === 'Longbow' && i.source === 'PHB')!
    const equipped = {
      ...a,
      equipment: [
        {
          id: 'kensei-bow',
          name: 'Longbow',
          source: 'PHB',
          type: 'R',
          quantity: 1,
          equipped: true,
          weaponCategory: 'martial',
          dmg1: '1d8',
          dmgType: 'P',
        },
      ],
    }
    const attacks = deriveWeaponActions(equipped, {
      abilityModifiers: {
        strength: 0,
        dexterity: 2,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
      },
      proficiencyBonus: 2,
      itemLookup: new Map([['longbow|phb', { ...item, mastery: ['Slow|XPHB'] }]]),
    })
    expect(attacks).toHaveLength(1)
    expect(attacks[0].mastery).toEqual([])
  })
  for (const [edition, template] of [
    ['2014', '2014-official'],
    ['2024', '2024-official'],
  ] as const)
    test(
      edition +
        ' selected names, active proficiencies and actual PDF survive source loss/restoration',
      async () => {
        const f = view(edition, 'Monk'),
          a = pick(f, f.character, 'Kensei ranged weapon', ['Longbow'])
        const current = {
          ...buildGameDataLookups(f.d),
          sourceCatalog: f.d.sources,
          classChoiceClasses: f.d.classes,
          classChoiceFeatureCatalogs: f.cat,
        }
        const absent = {
          ...current,
          classChoiceFeatureCatalogs: { ...f.cat, legacySubclassChoices: [] },
        }
        const before = JSON.stringify(a)
        for (const lookups of [current, absent, current]) {
          const calc = createCharacterCalculationContext(a, lookups, current),
            present = lookups === current
          expect(calc.character.proficiencies.weapons.includes('longbow')).toBe(present)
          const vm = createCharacterSheetViewModel(a, current, lookups)
          expect(vm.featuresSummary).toContain('Longbow')
          expect(
            vm.featuresSummary.includes('Kensei ranged weapon: Longbow (rules unavailable)'),
          ).toBe(!present)
          expect(withoutSheetDescriptions(vm).featuresSummary).toContain('Longbow')
        }
        const bytes = await generateTestCharacterSheet(
          createCharacterSheetViewModel(a, current, current),
          template,
        )
        const text = (await PDFDocument.load(bytes))
          .getForm()
          .getFields()
          .flatMap((f) => (f instanceof PDFTextField ? [f.getText() ?? ''] : []))
          .join('\n')
        expect(text).toContain('Longbow')
        expect(JSON.stringify(a)).toBe(before)
      },
    )
})
