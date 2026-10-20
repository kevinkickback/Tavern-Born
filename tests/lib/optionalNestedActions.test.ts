import { expect, test } from 'vitest'
import { OPTIONAL_NATIVE_ROOTS } from '@/lib/5etools/optionalClassNativeRules'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalDeclarationCatalog } from '../fixtures/optionalClassDeclarationFixtures'

const roots = OPTIONAL_NATIVE_ROOTS.filter(
  (root) =>
    (root.owner[1] === 'paladin' && root.name === 'Channel Divinity: Harness Divine Power') ||
    root.name === 'Primal Companion' ||
    (root.owner[1] === 'cleric' && root.name === 'Channel Divinity: Harness Divine Power'),
)
test.each(
  roots,
)('current adopted $name under $owner reaches Actions exactly once with stable identity', (root) => {
  const { data } = makeOptionalDeclarationCatalog(`class/class-${root.owner[1]}.json`, root.owner)
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const cls = data.classes.find(
    (cls) => cls.name.toLowerCase() === root.owner[1] && cls.source.toLowerCase() === root.owner[2],
  )!
  const sub =
    root.owner[0] === 'subclass'
      ? cls.subclasses!.find(
          (sub) =>
            sub.name.toLowerCase() === root.owner[3] && sub.source.toLowerCase() === root.owner[4],
        )
      : undefined
  const character = makeCharacterFixture({
    originSystem: root.owner[2] === 'xphb' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    classProgression: [
      {
        name: cls.name,
        source: cls.source,
        levels: root.level,
        ...(sub ? { subclass: sub.name, subclassSource: sub.source } : {}),
      },
    ],
    variantRules: { optionalClassFeatures: true },
    optionalClassFeatureAdoptions: [
      { owner: root.owner, target: root.target, earnedLevel: root.level },
    ],
  })
  const context = {
    classes: data.classes,
    availableClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const actions = (actor = character, current = context) =>
    deriveRulesTextActions(actor, undefined, current).filter((action) => action.name === root.name)
  const active = actions()
  expect(active).toHaveLength(1)
  expect(active[0].kind).toBe(root.name === 'Primal Companion' ? 'action' : 'bonus-action')
  const off = { ...character, variantRules: { optionalClassFeatures: false } }
  expect(actions(off)).toEqual([])
  expect(actions({ ...character, optionalClassFeatureAdoptions: [] })).toEqual([])
  expect(
    actions(character, {
      ...context,
      classChoiceFeatureCatalogs: { ...catalogs, optionalClassFeatureSources: [] },
    }),
  ).toEqual([])
  expect(
    actions({
      ...character,
      classProgression: character.classProgression.map((owner) => ({
        ...owner,
        levels: root.level - 1,
      })),
    }),
  ).toEqual([])
  expect(actions().map((action) => action.id)).toEqual(active.map((action) => action.id))
  const independent = {
    ...off,
    features: [
      {
        id: 'independent-action',
        name: root.name,
        source: 'TCE',
        description: 'As an action, use this independent ability.',
      },
    ],
  }
  expect(actions(independent).map((action) => action.id)).toEqual(['feature:independent-action'])
  const vm = createCharacterSheetViewModel(character, {
    ...data.lookups!,
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  })
  for (const view of [vm, withoutSheetDescriptions(vm)])
    expect(view.actions.filter((action) => action.id === active[0].id)).toHaveLength(1)
  expect(character.features).toEqual([])
})
