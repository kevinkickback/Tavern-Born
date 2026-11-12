import { expect, test } from 'vitest'
import { getClassicSpellReprints } from '@/lib/5etools/classicSpellReprints'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import { getIncludedSrdSpellReprints } from '@/lib/5etools/includedSrdSpellProof'
import { getCurrentOathSpellReprints } from '@/lib/5etools/legacyPaladinOathSpells'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import type { Spell5e } from '@/types/5etools'
import { makeGameDataFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'

const original = makeSpellFixture({ name: 'Compelled Duel', reprintedAs: ['Compelled Duel|XPHB'] })
const contender = makeSpellFixture({ name: 'Other Spell', reprintedAs: ['Compelled Duel|XPHB'] })
const replacement = { ...contender, reprintedAs: ['Other Spell|XPHB'] }
const rename = makeSpellFixture({ name: 'Branding Smite', reprintedAs: ['Shining Smite|XPHB'] })

const parse = (spell: Spell5e[], origin: string) => parseSpells({ spell }, { origin }) as Spell5e[]
const layer = (spell: Spell5e[], origin: string) =>
  makeGameDataFixture({ spells: parse(spell, origin) })

test.each([
  false,
  true,
])('preserves a competing claim in either duplicate order (%s)', (reversed) => {
  const rows = reversed ? [replacement, contender] : [contender, replacement]
  const base = layer([original, rename], 'base')
  const duplicateLayer = makeGameDataFixture({
    spells: rows.flatMap((spell, index) => parse([spell], `overlay-${index}`)),
  })
  const direct = buildSpellLookup([...base.spells, ...duplicateLayer.spells])
  const composed = composeGameDataLayers([base, duplicateLayer])
  const cached = buildSpellLookup(JSON.parse(JSON.stringify(composed.spells)) as Spell5e[])
  for (const lookup of [direct, cached]) {
    const explicit = getClassicSpellReprints(lookup)
    expect(explicit.byClassic.get('compelled duel|phb')).toBeUndefined()
    expect(explicit.byRevised.get('compelled duel|xphb')).toBeUndefined()
    expect(explicit.byClassic.get('branding smite|phb')?.revised).toBe('Shining Smite|XPHB')
    expect(getCurrentOathSpellReprints(lookup).get('compelled duel|xphb')).toBeUndefined()
  }

  const restored = composeGameDataLayers([base, duplicateLayer, layer([replacement], 'refresh')])
  const lookup = buildSpellLookup(restored.spells)
  expect(getClassicSpellReprints(lookup).byRevised.get('compelled duel|xphb')?.classic.name).toBe(
    'Compelled Duel',
  )
  expect(getCurrentOathSpellReprints(lookup).get('compelled duel|xphb')).toBe(1)
})

test('a competing explicit claim also suspends an exact Included SRD proof', () => {
  const included = makeSpellFixture({ name: 'Compelled Duel' })
  const expected = new Map([['compelled duel', getFeatureSourceDigest([included], false) ?? '']])
  const base = layer([included], 'included')
  expect(
    getIncludedSrdSpellReprints(buildSpellLookup(base.spells), expected).get('compelled duel|xphb'),
  ).toBe(1)
  const composed = composeGameDataLayers([base, layer([contender, replacement], 'overlay')])
  expect(
    getIncludedSrdSpellReprints(buildSpellLookup(composed.spells), expected).get(
      'compelled duel|xphb',
    ),
  ).toBeUndefined()
})

test('a malformed duplicate winner still vetoes the other row’s outgoing claim', () => {
  const malformed = { ...replacement, classSpellRouteSource: {} } as unknown as Spell5e
  const base = layer([original], 'base')
  const duplicateLayer = layer([contender, malformed], 'overlay')
  const direct = buildSpellLookup([...base.spells, ...[...duplicateLayer.spells].reverse()])
  const composed = buildSpellLookup(composeGameDataLayers([base, duplicateLayer]).spells)
  for (const lookup of [direct, composed]) {
    expect(getClassicSpellReprints(lookup).byRevised.get('compelled duel|xphb')).toBeUndefined()
    expect(lookup['Other Spell|PHB'].classSpellRoutes).toEqual([])
  }
})

test('a malformed route package cannot authorize a reprint or crash an unrelated fallback', () => {
  const malformed = { ...contender, classSpellRouteSource: {} } as unknown as Spell5e
  const included = makeSpellFixture({ name: 'Unrelated Spell' })
  const expected = new Map([['unrelated spell', getFeatureSourceDigest([included], false) ?? '']])
  const lookup = buildSpellLookup(layer([malformed, included], 'base').spells)
  expect(getClassicSpellReprints(lookup).byRevised.get('compelled duel|xphb')).toBeUndefined()
  expect(getIncludedSrdSpellReprints(lookup, expected).get('unrelated spell|xphb')).toBe(1)
})
