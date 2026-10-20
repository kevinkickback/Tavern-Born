import { expect, test } from 'vitest'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { OptionalClassFeatureAdoption, OptionalClassFeatureOwner } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'

const O: OptionalClassFeatureOwner = ['class', 'ranger', 'phb']
const T = (name: string, level: number, source = 'phb') =>
  `class-feature|${name}|ranger|phb|${level}|${source}`
const A = (index: number): OptionalClassFeatureAdoption => {
  const root = OPTIONAL_CLASS_FEATURE_RULES.roots[index]
  return { owner: root.owner, target: root.target, earnedLevel: root.level }
}
const actor = (adoptions?: OptionalClassFeatureAdoption[], levels = 20) =>
  makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels }],
    variantRules: { optionalClassFeatures: true },
    optionalClassFeatureAdoptions: adoptions,
  })

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])('independent Ranger families preserve mixed gain6 facets and compatible gain20: Deft=%s Foe=%s', (deft, foe) => {
  const { catalogs } = makeOptionalClassSourceData()
  const state = createOptionalClassFeatureActivity(
    actor([...(deft ? [A(0)] : []), ...(foe ? [A(1)] : [])]),
    catalogs,
  )
  expect(state.declared(O, T('deft explorer', 1, 'tce'), 1)).toBe(deft)
  expect(state.declared(O, T('favored foe', 1, 'tce'), 1)).toBe(foe)
  expect(state.declared(O, T('natural explorer', 1), 1)).toBe(!deft)
  expect(state.declared(O, T('natural explorer', 1), 1, 'favored-terrain')).toBe(!deft)
  expect(state.declared(O, T('natural explorer improvement', 10), 10, 'favored-terrain')).toBe(
    !deft,
  )
  expect(state.declared(O, T('favored enemy', 1), 1)).toBe(!foe)
  const combined = T('favored enemy and natural explorer improvements', 6)
  expect(state.declared(O, combined, 6, 'favored-terrain')).toBe(!deft)
  expect(state.declared(O, combined, 6, 'favored-enemy-language')).toBe(!foe)
  expect(state.declared(O, combined, 6)).toBe(!deft || !foe)
  const feature = catalogs.classFeatures.find(
    (row) => row.name === 'Favored Enemy and Natural Explorer improvements' && row.source === 'PHB',
  )!
  expect(state.entries(O, combined, feature.entries!)).toEqual(
    feature.entries!.filter((_, i) => (i === 0 ? !deft : !foe)),
  )
  expect(state.declared(O, T('foe slayer', 20), 20)).toBe(true)
  expect(state.declared(O, T('deft explorer improvement', 10, 'tce'), 10)).toBe(deft)
})

test('permission and old setup cannot infer adoption; OFF and source loss preserve exact intent with distinct reservation', () => {
  const { catalogs } = makeOptionalClassSourceData()
  const character = actor([A(0)])
  const before = JSON.stringify(character)
  const empty = { ...catalogs, optionalClassFeatureSources: [] }
  const missing = createOptionalClassFeatureActivity(character, empty)
  expect(missing.states[0].state).toBe('unavailable')
  expect(missing.declared(O, T('deft explorer', 1, 'tce'), 1)).toBe(false)
  expect(missing.declared(O, T('natural explorer', 1), 1)).toBe(false)
  const off = createOptionalClassFeatureActivity(
    { ...character, variantRules: { optionalClassFeatures: false } },
    empty,
  )
  expect(off.states[0].state).toBe('dormant-permission')
  expect(off.declared(O, T('natural explorer', 1), 1)).toBe(true)
  expect(
    createOptionalClassFeatureActivity(actor(), catalogs).states.every(
      (row) => row.state === 'unselected',
    ),
  ).toBe(true)
  expect(createOptionalClassFeatureActivity(character, catalogs).states[0].state).toBe('active')
  expect(JSON.stringify(character)).toBe(before)
})

test('child source/level loss leaves earned root and Canny while unavailable children remain suspended', () => {
  const { catalogs } = makeOptionalClassSourceData((doc) => {
    doc.classFeature = doc.classFeature.filter(
      (row) =>
        !(
          row.name === 'Deft Explorer Improvement' &&
          row.classSource === 'PHB' &&
          row.level === 10
        ),
    )
  })
  const current = createOptionalClassFeatureActivity(actor([A(0)]), catalogs)
  expect(current.states[0].state).toBe('active')
  expect(current.declared(O, T('deft explorer improvement', 6, 'tce'), 6)).toBe(true)
  expect(current.declared(O, T('deft explorer improvement', 10, 'tce'), 10)).toBe(false)
  const lower = createOptionalClassFeatureActivity(actor([A(0)], 5), catalogs)
  expect(lower.states[0].state).toBe('active')
  expect(lower.declared(O, T('deft explorer improvement', 6, 'tce'), 6)).toBe(false)
})

test('source catalog caches do not share character adoption and revised standard identities remain independent', () => {
  const { catalogs } = makeOptionalClassSourceData()
  const one = actor([A(0)]),
    two = actor()
  expect(createOptionalClassFeatureActivity(one, catalogs)).toBe(
    createOptionalClassFeatureActivity(one, catalogs),
  )
  expect(
    createOptionalClassFeatureActivity(two, catalogs).declared(O, T('deft explorer', 1, 'tce'), 1),
  ).toBe(false)
  const revised = createOptionalClassFeatureActivity(
    makeCharacterFixture({ classProgression: [{ name: 'Ranger', source: 'XPHB', levels: 9 }] }),
    catalogs,
  )
  expect(
    revised.declared(
      ['class', 'ranger', 'xphb'],
      'class-feature|deft explorer|ranger|xphb|2|xphb',
      2,
    ),
  ).toBe(true)
  expect(
    revised.declared(['class', 'ranger', 'xphb'], 'class-feature|expertise|ranger|xphb|9|xphb', 9),
  ).toBe(true)
})

test('strict save/reopen preserves known unavailable adoption without inferring missing records', () => {
  const current = actor([A(0), A(1), A(2)])
  const parsed = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(current)))
  expect(parsed.optionalClassFeatureAdoptions).toEqual(current.optionalClassFeatureAdoptions)
  expect(characterPersistenceSchema.parse(actor()).optionalClassFeatureAdoptions).toBeUndefined()
})

test.each(
  [
    [A(0), A(0)],
    [{ ...A(0), earnedLevel: 2 }],
    [{ ...A(0), owner: ['class', 'ranger', 'xphb'] }],
    [{ ...A(0), target: T('deft explorer improvement', 6, 'tce'), earnedLevel: 6 }],
    [{ ...A(0), target: 'class-feature|bardic versatility|bard|phb|4|tce' }],
    [{ ...A(0), target: A(0).target + '|extra' }],
    [{ ...A(0), family: 'invented' }],
  ].map((adoptions) => ({ adoptions })),
)('unknown/malformed/duplicate/child adoption fails strict admission: %j', ({ adoptions }) => {
  expect(
    characterPersistenceSchema.safeParse({ ...actor(), optionalClassFeatureAdoptions: adoptions })
      .success,
  ).toBe(false)
})
