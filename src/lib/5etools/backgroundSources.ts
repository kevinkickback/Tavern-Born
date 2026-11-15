import type { GameData } from '@/types/5etools'
import { CopyResolutionError, resolveCopiedRecords } from './copyResolution'
import { parseBackgrounds } from './parsers/basic'

type Backgrounds = GameData['backgrounds']
const rawBackgrounds = new WeakMap<GameData, Backgrounds>()

const key = ({ name, source }: Backgrounds[number]) =>
  JSON.stringify([name.trim().toLowerCase(), source.trim().toLowerCase()])

export function prepareBackgroundSources(
  data: GameData,
  backgrounds: Backgrounds,
  deferResolutionErrors = false,
) {
  rawBackgrounds.set(data, backgrounds)
  const seen = new Set<string>()
  for (const background of backgrounds) {
    const identity = key(background)
    if (seen.has(identity))
      throw new CopyResolutionError(
        [
          {
            entity: `${background.name}|${background.source}`,
            reason: 'Duplicate background identity',
          },
        ],
        'in backgrounds',
      )
    seen.add(identity)
  }
  if (!backgrounds.some((row) => Object.getOwnPropertyDescriptor(row, '_copy'))) return backgrounds
  // Fluff belongs to its own exact printing; it is never part of the parent mechanics.
  const originals = backgrounds.map(({ fluffEntries: _fluff, ...row }) => row)
  const { records, diagnostics } = resolveCopiedRecords(originals, 'background')
  if (diagnostics.length && !deferResolutionErrors)
    throw new CopyResolutionError(diagnostics, 'in backgrounds')
  const resolved = records.map((row, index) => {
    const { fluffEntries } = backgrounds[index]
    return fluffEntries ? { ...row, fluffEntries } : row
  })
  return parseBackgrounds(resolved) as Backgrounds
}

export function composeBackgroundSources(data: GameData, layers: readonly GameData[]) {
  const winners = new Map<string, Backgrounds>()
  for (const layer of layers) {
    const groups = new Map<string, Backgrounds>()
    for (const row of rawBackgrounds.get(layer) ?? layer.backgrounds ?? []) {
      const identity = key(row)
      const group = groups.get(identity) ?? []
      group.push(row)
      groups.set(identity, group)
    }
    for (const [identity, group] of groups) winners.set(identity, group)
  }
  return prepareBackgroundSources(data, [...winners.values()].flat())
}
