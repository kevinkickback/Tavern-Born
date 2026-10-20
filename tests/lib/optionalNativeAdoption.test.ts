import { expect, test } from 'vitest'
import { OPTIONAL_NATIVE_ROOTS } from '@/lib/5etools/optionalClassNativeRules'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import type { Character, OptionalClassFeatureAdoption } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeOptionalDeclarationCatalog,
  optionalDeclarationSources,
} from '../fixtures/optionalClassDeclarationFixtures'

const make = (root: (typeof OPTIONAL_NATIVE_ROOTS)[number], adopt = false) => {
  const document = optionalDeclarationSources.documents.find((document) =>
    document.data.class.some(
      (row) =>
        String(row.name).toLowerCase() === root.owner[1] &&
        String(row.source).toLowerCase() === root.owner[2],
    ),
  )!.data
  const cls = document.class.find(
    (row) =>
      String(row.name).toLowerCase() === root.owner[1] &&
      String(row.source).toLowerCase() === root.owner[2],
  )!
  const sub =
    root.owner[0] === 'subclass'
      ? document.subclass.find(
          (row) =>
            String(row.className).toLowerCase() === root.owner[1] &&
            String(row.classSource).toLowerCase() === root.owner[2] &&
            String(row.name).toLowerCase() === root.owner[3] &&
            String(row.source).toLowerCase() === root.owner[4],
        )
      : undefined
  return makeCharacterFixture({
    originSystem: root.owner[2] === 'xphb' ? '2024' : '2014',
    allowedSources: ['PHB', 'TCE', 'XPHB', 'PSA', 'SCAG', 'DMG', 'XGE', 'ERLW'],
    classProgression: [
      {
        name: String(cls.name),
        source: String(cls.source),
        levels: 20,
        ...(sub ? { subclass: String(sub.name), subclassSource: String(sub.source) } : {}),
      },
    ],
    variantRules: { optionalClassFeatures: true },
    optionalClassFeatureAdoptions: adopt
      ? [{ owner: root.owner, target: root.target, earnedLevel: root.level }]
      : [],
  })
}
const source = (root: (typeof OPTIONAL_NATIVE_ROOTS)[number]) => {
  const file = optionalDeclarationSources.documents.find((document) =>
    document.data.class.some(
      (cls) =>
        String(cls.name).toLowerCase() === root.owner[1] &&
        String(cls.source).toLowerCase() === root.owner[2],
    ),
  )!.file
  const { data } = makeOptionalDeclarationCatalog(file, root.owner)
  return { data, catalogs: buildClassChoiceFeatureCatalogs(data) }
}
test('actual native roots are individually selectable, strict-reopenable and source/permission/level scoped', () => {
  const failures: string[] = []
  for (const root of OPTIONAL_NATIVE_ROOTS) {
    const { catalogs } = source(root),
      character = make(root)
    const adoption: OptionalClassFeatureAdoption = {
      owner: root.owner,
      target: root.target,
      earnedLevel: root.level,
    }
    const state = createOptionalClassFeatureActivity(character, catalogs)
    const row = state.states.find(
      (row) =>
        row.root.target === root.target &&
        JSON.stringify(row.root.owner) === JSON.stringify(root.owner),
    )!
    if (!row.offered) {
      failures.push(JSON.stringify([root.owner, root.target, row.state]))
      continue
    }
    expect(state.declared(root.owner, root.target, root.level)).toBe(false)
    const result = setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      catalogs,
      adoption,
      true,
      [],
    )
    const chosen = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
    const active = createOptionalClassFeatureActivity(chosen, catalogs)
    expect(active.declared(root.owner, root.target, root.level), root.target).toBe(true)
    for (const original of root.replaces)
      expect(active.declared(root.owner, original.target, root.level, original.facet)).toBe(false)
    const missing = createOptionalClassFeatureActivity(chosen, {
      ...catalogs,
      optionalClassFeatureSources: [],
    })
    expect(missing.declared(root.owner, root.target, root.level)).toBe(false)
    for (const original of root.replaces)
      expect(missing.declared(root.owner, original.target, root.level, original.facet)).toBe(false)
    const off = createOptionalClassFeatureActivity(
      { ...chosen, variantRules: { optionalClassFeatures: false } },
      catalogs,
    )
    expect(off.declared(root.owner, root.target, root.level)).toBe(false)
    for (const original of root.replaces)
      expect(off.declared(root.owner, original.target, root.level, original.facet)).toBe(true)
    const cleared = setOptionalClassAdoptionCommand(
      chosen,
      chosen.provenance,
      undefined,
      adoption,
      false,
      getOptionalClassFamilyKeys(chosen, adoption),
    )
    const restored = characterPersistenceSchema.parse({
      ...chosen,
      ...cleared.characterPatch,
      provenance: cleared.provenanceUpdate,
    })
    expect(restored.optionalClassFeatureAdoptions).toEqual([])
    for (const original of root.replaces)
      expect(
        createOptionalClassFeatureActivity(restored, catalogs).declared(
          root.owner,
          original.target,
          root.level,
          original.facet,
        ),
      ).toBe(true)
    const lower = {
      ...chosen,
      classProgression: chosen.classProgression.map((row) => ({ ...row, levels: root.level - 1 })),
    } as Character
    expect(
      createOptionalClassFeatureActivity(lower, catalogs).declared(
        root.owner,
        root.target,
        root.level,
      ),
    ).toBe(false)
  }
  expect(failures).toEqual([])
})
test('actual Cleric alternatives replace only their own gain8 and preserve earned conditional upgrades and independent owners', () => {
  const roots = OPTIONAL_NATIVE_ROOTS.filter(
    (row) => row.owner[0] === 'subclass' && row.owner[1] === 'cleric',
  )
  expect(roots).toHaveLength(19)
  for (const root of roots) {
    const { catalogs } = source(root),
      character = make(root, true)
    const state = createOptionalClassFeatureActivity(character, catalogs)
    expect(root.replaces).toHaveLength(1)
    expect(root.replaces[0].target).toBe(root.original!.target)
    expect(state.declared(root.owner, root.replaces[0].target, 8)).toBe(false)
    const other = [...root.owner] as typeof root.owner
    other[3] = 'independent owner'
    const independent = {
      ...character,
      classProgression: character.classProgression.map((row) => ({
        ...row,
        subclass: 'independent owner',
      })),
    }
    expect(
      createOptionalClassFeatureActivity(independent, catalogs).declared(
        other,
        root.replaces[0].target,
        8,
      ),
    ).toBe(true)
    if (root.owner[3] === 'order domain')
      expect(
        state.declared(
          root.owner,
          "subclass-feature|order's wrath|cleric|phb|order|tce|17|tce",
          17,
        ),
      ).toBe(true)
  }
})
test('legacy Beast Master replacement preserves the intro and independent later upgrades under both actual class printings', () => {
  for (const root of OPTIONAL_NATIVE_ROOTS.filter((row) => row.name === 'Primal Companion')) {
    const { catalogs } = source(root),
      state = createOptionalClassFeatureActivity(make(root, true), catalogs)
    expect(
      state.declared(
        root.owner,
        'subclass-feature|beast master|ranger|phb|beast master|phb|3|phb',
        3,
      ),
    ).toBe(true)
    expect(
      state.declared(
        root.owner,
        "subclass-feature|ranger's companion|ranger|phb|beast master|phb|3|phb",
        3,
      ),
    ).toBe(false)
    for (const [name, level] of [
      ['exceptional training', 7],
      ['bestial fury', 11],
      ['share spells', 15],
    ] as const)
      expect(
        state.declared(
          root.owner,
          `subclass-feature|${name}|ranger|phb|beast master|phb|${level}|phb`,
          level,
        ),
      ).toBe(true)
  }
})
test('native adopted subclass summaries derive current exact features without materialized Feature mirrors', () => {
  const root = OPTIONAL_NATIVE_ROOTS.find(
    (row) => row.owner[0] === 'subclass' && row.owner[3] === 'life domain',
  )!
  const { data, catalogs } = source(root),
    character = make(root, true)
  const input = {
    ...data.lookups!,
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const vm = createCharacterSheetViewModel(character, input)
  for (const view of [vm, withoutSheetDescriptions(vm)]) {
    expect(
      view.optionalClassFeatureSummaries?.some((row) => row.compactText === 'Blessed Strikes'),
    ).toBe(true)
    expect(view.featuresSummary).toContain('Blessed Strikes')
    expect(view.classFeaturesSummary2014).toContain('Blessed Strikes')
  }
  const off = createCharacterSheetViewModel(
    { ...character, variantRules: { optionalClassFeatures: false } },
    input,
  )
  expect(
    off.optionalClassFeatureSummaries?.some((row) => row.compactText === 'Blessed Strikes'),
  ).toBe(false)
  expect(character.features).toEqual([])
})
