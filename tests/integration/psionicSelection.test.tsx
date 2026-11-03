// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { parseClassDocument, parseClasses } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  getCharacterClassChoiceDiagnostics,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { resetCharacterStore } from '../fixtures/characterStoreFixtures'
import { makePsionicFixture } from '../fixtures/psionicFixtures'

afterEach(() => {
  cleanup()
  resetCharacterStore()
})
describe.skipIf(!existsSync('data/class/class-mystic.json') || !existsSync('data/psionics.json'))(
  'filtered offered Mystic setup',
  () => {
    test('raw and same-layer parent conflicts suspend all pools until a singular winning source restores them', () => {
      const { data, character } = makePsionicFixture()
      const raw = JSON.parse(readFileSync('data/class/class-mystic.json', 'utf8'))
      const original = raw.class[0]
      const changed = structuredClone(original)
      const table = changed.classTableGroups.find((group: { colLabels: string[] }) =>
        group.colLabels.includes('{@filter Talents Known|psionics|type=T}'),
      )
      const column = table.colLabels.indexOf('{@filter Talents Known|psionics|type=T}')
      table.rows[1][column] = 2
      const layer = (parents: unknown[]): GameData => ({
        ...data,
        classes: parseClassDocument({ ...raw, class: parents }).classes as GameData['classes'],
      })
      const singular = layer([original])
      const assertPools = (current: GameData, active: boolean, count = active ? 3 : 0) => {
        useGameDataStore.setState({ gameData: current })
        const hook = renderHook(() =>
          useCharacterGameDataParams({
            allowedSources: character.allowedSources,
            originSystem: '2014',
          }),
        )
        const filtered = hook.result.current
        const cls = filtered.classes.find((row) => row.name === 'Mystic')!
        const sub = cls.subclasses!.find((row) => row.name === 'Order of the Avatar')!
        const catalogs = buildClassChoiceFeatureCatalogs(filtered)
        const activity = createOptionalClassFeatureActivity(character, catalogs)
        expect(
          getCharacterClassChoices(cls, sub, activity, catalogs).filter(
            (row) => row.kind === 'psionic',
          ),
        ).toHaveLength(count)
        expect(
          getCharacterClassChoiceDiagnostics(cls, sub, activity, catalogs).some(
            (row) => row.featureName === 'Psionics',
          ),
        ).toBe(!active)
        expect(
          getCharacterClassChoiceDiagnostics(cls, sub, activity, catalogs).some(
            (row) => row.featureName === 'Bonus Disciplines',
          ),
        ).toBe(count !== 3)
        hook.unmount()
      }
      assertPools(composeGameDataLayers([singular]), true)
      for (const duplicate of [original, changed]) {
        for (const parents of [
          [original, duplicate],
          [duplicate, original],
        ]) {
          const conflicted = layer(
            parents.map((row) => ({ ...row, sourceIdentityConflict: false })),
          )
          expect(conflicted.classes.every((row) => row.sourceIdentityConflict)).toBe(true)
          assertPools(composeGameDataLayers([conflicted]), false)
          assertPools(composeGameDataLayers([conflicted, singular]), true)
          assertPools(composeGameDataLayers([singular, conflicted]), false)
          assertPools(composeGameDataLayers([conflicted, { ...data, classes: [] }]), false)
        }
      }
      // Separate parser calls still compete within one layer before ordinary Map composition.
      assertPools(
        composeGameDataLayers([
          { ...data, classes: [...singular.classes, ...layer([changed]).classes] },
        ]),
        false,
      )
      const avatar = raw.subclass.find(
        (row: { name: string }) => row.name === 'Order of the Avatar',
      )
      const subclassLayer = (owners: unknown[]): GameData => ({
        ...data,
        classes: parseClassDocument({ ...raw, subclass: owners }).classes as GameData['classes'],
      })
      const exact = subclassLayer([avatar])
      for (const changedOwner of [
        avatar,
        { ...avatar, subclassFeatures: avatar.subclassFeatures.slice(0, 1) },
        { ...avatar, subclassFeatures: [] },
      ]) {
        for (const owners of [
          [avatar, changedOwner],
          [changedOwner, avatar],
        ]) {
          const conflict = subclassLayer(
            owners.map((row) => ({ ...row, sourceIdentityConflict: false })),
          )
          expect(conflict.classes[0].subclasses!.every((row) => row.sourceIdentityConflict)).toBe(
            true,
          )
          // Current parent counts remain valid; only this conflicted bonus owner is suspended.
          assertPools(conflict, true, 2)
          assertPools(composeGameDataLayers([conflict]), true, 2)
          assertPools(composeGameDataLayers([conflict, exact]), true)
          assertPools(composeGameDataLayers([exact, conflict]), true, 2)
          assertPools(composeGameDataLayers([conflict, { ...data, classes: [] }]), true, 2)
        }
      }
      const separatelyParsedOwners = {
        ...data,
        classes: [
          {
            ...exact.classes[0],
            subclasses: [
              ...exact.classes[0].subclasses!,
              ...subclassLayer([{ ...avatar, subclassFeatures: [] }]).classes[0].subclasses!,
            ],
          },
        ],
      }
      assertPools(composeGameDataLayers([separatelyParsedOwners]), true, 2)
      expect(parseClasses([{ name: 'Fighter', source: 'PHB' }])).toMatchObject([
        { name: 'Fighter', source: 'PHB' },
      ])
      expect(parseClasses([original, original])).toMatchObject([
        { sourceIdentityConflict: true },
        { sourceIdentityConflict: true },
      ])
    })

    test.each([
      '2014',
      '2024',
    ] as const)('%s preserves all current base and bonus pools', (edition) => {
      const { data, character } = makePsionicFixture(edition)
      useGameDataStore.setState({ gameData: data })
      const { result } = renderHook(() =>
        useCharacterGameDataParams({
          allowedSources: character.allowedSources,
          originSystem: edition,
        }),
      )
      const current = result.current,
        catalogs = buildClassChoiceFeatureCatalogs(current),
        cls = current.classes.find((row) => row.name === 'Mystic')!
      for (const order of ['Avatar', 'Awakened', 'Immortal', 'Nomad', 'Soul Knife', 'Wu Jen']) {
        const sub = (cls.subclasses ?? []).find((row) => row.name === `Order of the ${order}`)!,
          actor = {
            ...character,
            classProgression: [{ ...character.classProgression[0], subclass: sub.name }],
          }
        const activity = createOptionalClassFeatureActivity(actor, catalogs),
          rows = getCharacterClassChoices(cls, sub, activity, catalogs)
        expect(rows.filter((row) => row.kind === 'psionic')).toHaveLength(
          order === 'Soul Knife' ? 2 : 3,
        )
        expect(getCharacterClassChoiceDiagnostics(cls, sub, activity, catalogs)).toEqual([])
      }
      const sub = (cls.subclasses ?? []).find((row) => row.name === 'Order of the Avatar')!,
        owner = [...catalogs.subclassTargets.candidatesByOwner.keys()].find((key) =>
          key.includes('order of the avatar'),
        )!,
        original = catalogs.subclassTargets.candidatesByOwner.get(owner)!,
        target = [...original.keys()].find((key) => key.includes('|bonus disciplines|'))!,
        valid = original.get(target)![0]
      for (const candidates of [
        [],
        [{ ...valid, source: 'PHB' }],
        [valid, { ...valid, source: 'PHB' }],
        [{ ...valid, source: 'PHB' }, valid],
      ]) {
        const byOwner = new Map(catalogs.subclassTargets.candidatesByOwner)
        byOwner.set(owner, new Map(original).set(target, candidates))
        const changed = {
            ...catalogs,
            subclassTargets: { ...catalogs.subclassTargets, candidatesByOwner: byOwner },
          },
          activity = createOptionalClassFeatureActivity(character, changed)
        expect(
          getCharacterClassChoices(cls, sub, activity, changed).some(
            (row) => row.label === 'Bonus Disciplines',
          ),
        ).toBe(false)
        expect(
          getCharacterClassChoiceDiagnostics(cls, sub, activity, changed).some(
            (row) => row.featureName === 'Bonus Disciplines',
          ),
        ).toBe(true)
      }
      expect(
        getCharacterClassChoices(
          cls,
          sub,
          createOptionalClassFeatureActivity(character, catalogs),
          catalogs,
        ).some((row) => row.label === 'Bonus Disciplines'),
      ).toBe(true)
    })
  },
)
