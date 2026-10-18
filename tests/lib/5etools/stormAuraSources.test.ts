import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import {
  deriveStormAuraEffects,
  getStormAuraSelectionStates,
} from '@/lib/character/stormAuraSelections'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { makeStormAuraFixture, selectStormAura } from '../../fixtures/stormAuraFixtures'

const path = 'data/class/class-barbarian.json'
const cases = ['PHB', 'XPHB'].flatMap((source) =>
  [3, 6, 10, 14].flatMap((level) =>
    ['Desert', 'Sea', 'Tundra'].map((environment) => ({ source, level, environment })),
  ),
)
test.skipIf(!existsSync(path)).each(cases)(
  'configured $source Storm Herald $environment at $level',
  ({ source, level, environment }) => {
    const fixture = makeStormAuraFixture(level, source, (document) =>
      Object.assign(document, JSON.parse(readFileSync(path, 'utf8'))),
    )
    const saved = selectStormAura(fixture, environment)
    expect(saved.classChoiceSelections![0].selected[0].ref).toBe(
      `${environment}|Barbarian|PHB|Storm Herald|XGE|3|XGE`,
    )
    const current = getStormAuraSelectionStates(saved, fixture.data.classes, fixture.catalogs)[0]
    expect(current.recovery).toBe(false)
    expect(current.storm?.stages.every((stage) => stage.available)).toBe(true)
    expect(current.storm?.stages).toHaveLength(
      level === 3 ? 1 : level === 6 ? 2 : level === 10 ? 3 : 4,
    )
    const effects = deriveStormAuraEffects([current])
    expect(effects.some((effect) => effect.target.kind === 'damage-resistance')).toBe(level >= 6)
    expect(effects.some((effect) => effect.target.kind === 'speed')).toBe(
      level >= 6 && environment === 'Sea',
    )
    const actions = deriveRulesTextActions(saved, undefined, {
      classes: fixture.data.classes,
      classChoiceFeatureCatalogs: fixture.catalogs,
    }).filter((action) => action.source.kind === 'subclass')
    expect(actions[0]).toMatchObject({ name: `Storm Aura — ${environment}`, kind: 'bonus-action' })
    expect(actions[0].description).toContain('but not through total cover')
    const vm = createCharacterSheetViewModel(saved, {
      ...fixture.data.lookups!,
      classChoiceClasses: fixture.data.classes,
      classChoiceFeatureCatalogs: fixture.catalogs,
    })
    expect(vm.featuresSummary).toContain('but not through total cover')
    expect(vm.classFeaturesSummary2014).toContain('but not through total cover')
    expect(actions.some((action) => action.kind === 'reaction')).toBe(
      level >= 14 && environment !== 'Tundra',
    )
  },
)

test.skipIf(!existsSync(path)).each([
  { name: 'Sea', level: 6, kind: 'condition', aura: true },
  { name: 'Storm Aura', level: 3, kind: 'delay', aura: false },
  { name: 'Sea', level: 6, kind: 'prerequisite', aura: true },
  { name: 'Sea', level: 6, kind: 'negation', aura: true },
  { name: 'Path of the Storm Herald', level: 3, kind: 'condition', aura: false },
  { name: 'Sea', level: 6, kind: 'duplicate-metadata', aura: true },
  { name: 'Storm Aura', level: 3, kind: 'reorder', aura: false },
])(
  'configured source mutation $name $kind withdraws unsupported rules and restores exact IDs',
  ({ name, level, kind, aura }) => {
    const original = makeStormAuraFixture(14, 'PHB', (doc) =>
      Object.assign(doc, JSON.parse(readFileSync(path, 'utf8'))),
    )
    const saved = selectStormAura(original)
    const changed = makeStormAuraFixture(14, 'PHB', (doc) => {
      Object.assign(doc, JSON.parse(readFileSync(path, 'utf8')))
      const row = doc.subclassFeature.find((value) => value.name === name && value.level === level)!
      if (kind === 'prerequisite')
        Object.assign(row, { prerequisite: [{ condition: 'underwater' }] })
      else if (kind === 'duplicate-metadata')
        doc.subclassFeature.push({ ...row, ...{ prerequisite: [{ condition: 'underwater' }] } })
      else if (kind === 'reorder') row.entries = [...row.entries!].reverse()
      else if (kind === 'negation')
        row.entries = row.entries!.map((entry) =>
          typeof entry === 'string'
            ? entry.replace('You gain resistance', 'You do not gain resistance')
            : entry,
        )
      else
        row.entries = [
          kind === 'delay'
            ? 'This feature grants no benefits until class level 18.'
            : 'All benefits of this feature apply only while you are underwater.',
          ...row.entries!,
        ]
    })
    const current = getStormAuraSelectionStates(saved, changed.data.classes, changed.catalogs)[0]
    expect(current.storm?.stages[0].available).toBe(aura)
    expect(current.storm?.stages.find((stage) => stage.name === 'Storm Soul')?.available).toBe(
      false,
    )
    expect(current.storm?.stages.find((stage) => stage.name === 'Shielding Storm')?.available).toBe(
      false,
    )
    expect(deriveStormAuraEffects([current])).toEqual([])
    const raw = JSON.stringify(saved)
    expect(
      getStormAuraSelectionStates(
        saved,
        original.data.classes,
        original.catalogs,
      )[0].storm?.stages.every((stage) => stage.available),
    ).toBe(true)
    const actions = deriveRulesTextActions(saved, undefined, {
      classes: original.data.classes,
      classChoiceFeatureCatalogs: original.catalogs,
    }).filter((action) => action.source.kind === 'subclass')
    expect(actions[0].name).toBe('Storm Aura — Sea')
    expect(JSON.stringify(saved)).toBe(raw)
  },
)
test.skipIf(!existsSync(path))(
  'configured source accepts equivalent duplicates, reordered keys and enrichment',
  () => {
    const fixture = makeStormAuraFixture(14, 'XPHB', (doc) => {
      Object.assign(doc, JSON.parse(readFileSync(path, 'utf8')))
      const row = doc.subclassFeature.find((value) => value.name === 'Sea' && value.level === 6)!
      doc.subclassFeature.push(Object.fromEntries(Object.entries(row).reverse()) as typeof row)
    })
    const saved = selectStormAura(fixture)
    expect(
      getStormAuraSelectionStates(
        saved,
        fixture.data.classes,
        fixture.catalogs,
      )[0].storm?.stages.every((stage) => stage.available),
    ).toBe(true)
  },
)
