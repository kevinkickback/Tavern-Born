import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { renderHook } from '@testing-library/react'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { loadGameDataSourceStack } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

const readJson = (root: string) => async (file: string) =>
  JSON.parse(await readFile(resolve(root, file), 'utf8'))

export async function loadStandardJourneyData() {
  const dataRoot = resolve('data')
  const inventory = await readdir(dataRoot, { recursive: true, withFileTypes: true })
  const availableResources = inventory
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => relative(dataRoot, resolve(entry.parentPath, entry.name)).replace(/\\/g, '/'))
  return loadGameDataSourceStack(
    {
      base: {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.1',
        isValid: true,
      },
      additional: { type: 'local', path: dataRoot, isValid: true, availableResources },
    },
    {
      baseReader: { type: 'bundled', readJson: readJson('resources/srd/data') },
      additionalReader: { type: 'local', readJson: readJson('data') },
    },
  )
}

export function getStandardJourneyCatalog(
  data: Awaited<ReturnType<typeof loadStandardJourneyData>>,
  edition: Character['originSystem'],
) {
  const sources = SOURCE_PRESETS.find((preset) => preset.id === 'recommended')!.abbreviations
  const raw = buildGameDataLookups(data)
  const previous = useGameDataStore.getState().gameData
  useGameDataStore.setState({ gameData: { ...data, lookups: raw } })
  const filtered = (() => {
    try {
      const hook = renderHook(() =>
        useCharacterGameDataParams({ allowedSources: sources, originSystem: edition }),
      )
      const result = hook.result.current
      hook.unmount()
      return result
    } finally {
      useGameDataStore.setState({ gameData: previous })
    }
  })()
  const lookups = buildGameDataLookups(filtered)
  const catalogs = {
    ...createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(filtered)),
    feats: filtered.feats,
  }
  return {
    edition,
    sources,
    catalogs,
    raw,
    primary: {
      ...lookups,
      classChoiceClasses: filtered.classes,
      classChoiceFeatureCatalogs: catalogs,
      featExpertiseFeats: filtered.feats,
    },
    paths: filtered.classes
      .filter((cls) => !cls.isSidekick)
      .flatMap((cls) => (cls.subclasses ?? []).map((subclass) => ({ cls, subclass }))),
  }
}

export type StandardJourneyCatalog = ReturnType<typeof getStandardJourneyCatalog>
