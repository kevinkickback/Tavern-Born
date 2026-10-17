import { describe, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseConditions, parseTrapHazards } from '@/lib/5etools/parsers'
import { buildCompendiumEntries } from '@/lib/compendiumEntries'
import { renderEntry } from '@/lib/renderer'
import { buildRecursiveLookup, getRecursiveTooltipData } from '@/lib/renderer/recursiveTooltip'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

const kinds = ['condition', 'disease', 'status', 'trap', 'hazard'] as const
const record = (kind: string, source = 'DMG') => ({
  name: 'Shared Rule',
  source,
  entries: [`${kind} rules from ${source}.`],
})
const documents = () => ({
  conditions: {
    condition: [record('condition')],
    disease: [record('disease')],
    status: [record('status')],
  },
  traps: { trap: [record('trap')], hazard: [record('hazard')] },
})

describe('compound reference resources', () => {
  test('retains all declared collections and authoritative kinds without changing input', () => {
    const raw = documents()
    Object.assign(raw.conditions.status[0], { _sourceType: 'condition' })
    const before = structuredClone(raw)
    const conditions = parseConditions(raw.conditions)
    const traps = parseTrapHazards(raw.traps)
    expect(conditions).toEqual(
      ['condition', 'disease', 'status'].map((kind) => ({ ...record(kind), _sourceType: kind })),
    )
    expect(traps).toEqual(
      ['trap', 'hazard'].map((kind) => ({ ...record(kind), _sourceType: kind })),
    )
    expect(raw).toEqual(before)
    expect(conditions[0]).not.toBe(raw.conditions.condition[0])
    expect(traps[0]).not.toBe(raw.traps.trap[0])
    expect(parseConditions({ condition: [], status: [record('status')] })).toHaveLength(1)
    expect(parseTrapHazards({ trap: [], hazard: [record('hazard')] })).toHaveLength(1)
    expect(parseConditions({})).toEqual([])
    expect(parseTrapHazards({})).toEqual([])
    const direct = [record('untyped')]
    expect(parseConditions(direct)).toEqual(direct)
    expect(parseTrapHazards(direct)).toBe(direct)
  })

  test('overlays only matching kinds and preserves independent rows and exact previews', () => {
    const raw = documents()
    const base = makeGameDataFixture({
      conditions: parseConditions(raw.conditions),
      trapHazards: parseTrapHazards(raw.traps),
    })
    const overlay = makeGameDataFixture({
      conditions: parseConditions({ status: [record('updated status'), record('status', 'ALT')] }),
      trapHazards: parseTrapHazards({ hazard: [record('updated hazard')] }),
    })
    const before = structuredClone([base, overlay])
    const combined = composeGameDataLayers([base, overlay])
    const entries = buildCompendiumEntries(combined)
    expect(combined.conditions).toHaveLength(4)
    expect(combined.trapHazards).toHaveLength(2)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(6)
    expect(entries.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['Condition', 'Disease', 'Status', 'Trap / Hazard']),
    )
    expect(
      entries.filter((entry) => entry.type === 'Trap / Hazard').map((entry) => entry.context),
    ).toEqual(expect.arrayContaining(['Trap', 'Hazard']))
    const lookup = buildRecursiveLookup(combined)
    for (const kind of kinds) {
      const preview = getRecursiveTooltipData(
        { kind, name: 'Shared Rule', source: 'DMG' },
        lookup,
        '',
      )
      expect(preview.html).toContain(
        `${kind === 'status' || kind === 'hazard' ? 'updated ' : ''}${kind} rules from DMG.`,
      )
      expect(preview.subtitle).toContain('DMG')
      const absent = getRecursiveTooltipData(
        { kind, name: 'Shared Rule', source: 'MISSING' },
        lookup,
        '',
      )
      expect(absent.html).toBeUndefined()
      const conflictingKind = buildRecursiveLookup({
        conditions: combined.conditions.filter(
          (row) => (row as { _sourceType: string })._sourceType !== kind,
        ),
        trapHazards: combined.trapHazards.filter(
          (row) => (row as { _sourceType: string })._sourceType !== kind,
        ),
      })
      expect(
        getRecursiveTooltipData({ kind, name: 'Shared Rule', source: 'DMG' }, conflictingKind, '')
          .html,
      ).toBeUndefined()
    }
    expect(
      getRecursiveTooltipData({ kind: 'status', name: 'Shared Rule', source: 'ALT' }, lookup, '')
        .html,
    ).toContain('status rules from ALT.')
    expect(
      getRecursiveTooltipData({ kind: 'condition', name: 'Shared Rule', source: 'ALT' }, lookup, '')
        .html,
    ).toBeUndefined()
    const restored = composeGameDataLayers([base])
    expect(
      getRecursiveTooltipData(
        { kind: 'hazard', name: 'Shared Rule', source: 'DMG' },
        buildRecursiveLookup(restored),
        '',
      ).html,
    ).toContain('hazard rules from DMG.')
    expect([base, overlay]).toEqual(before)
    expect(buildGameDataLookups(combined).conditionNames).toEqual(['Shared Rule'])
  })

  test('keeps established untagged helper previews without inventing disease rules', () => {
    const lookup = buildRecursiveLookup({
      conditions: [record('untyped')],
      trapHazards: [record('untyped')],
    })
    for (const kind of ['condition', 'status', 'trap', 'hazard']) {
      expect(
        getRecursiveTooltipData({ kind, name: 'Shared Rule', source: 'DMG' }, lookup, '').html,
      ).toContain('untyped rules')
    }
    expect(
      getRecursiveTooltipData({ kind: 'disease', name: 'Shared Rule', source: 'DMG' }, lookup, '')
        .html,
    ).toBeUndefined()
    expect(
      buildGameDataLookups(
        makeGameDataFixture({ conditions: parseConditions({ status: [record('status')] }) }),
      ).conditionNames,
    ).toEqual([])
  })

  test('renders disease references with upstream DMG defaults and exact explicit printing', () => {
    const disease = (name: string, source: string) => ({
      name,
      source,
      entries: [`${name} details.`],
    })
    const lookup = buildRecursiveLookup({
      conditions: parseConditions({
        disease: [disease('Lichen Plague', 'FRAiF'), disease('Sight Rot', 'DMG')],
      }),
    })
    const explicit = renderEntry('{@disease Lichen Plague|FRAiF}')
    expect(explicit).toContain('data-hover-type="disease"')
    expect(explicit).toContain('data-hover-source="FRAiF"')
    expect(renderEntry('{@disease sight rot}')).toContain('data-hover-source="DMG"')
    expect(
      getRecursiveTooltipData(
        { kind: 'disease', name: 'Lichen Plague', source: 'FRAiF' },
        lookup,
        '',
      ).html,
    ).toContain('Lichen Plague details.')
    expect(
      getRecursiveTooltipData({ kind: 'disease', name: 'sight rot', source: 'DMG' }, lookup, '')
        .html,
    ).toContain('Sight Rot details.')
    expect(
      getRecursiveTooltipData({ kind: 'disease', name: 'Sight Rot', source: 'PHB' }, lookup, '')
        .html,
    ).toBeUndefined()
  })
})
