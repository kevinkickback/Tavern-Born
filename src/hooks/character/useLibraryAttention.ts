import { useEffect, useMemo, useState } from 'react'
import { useItemPropertyLookup } from '@/hooks/data/useGameData'
import { getFilteredGameData } from '@/lib/5etools/filteredGameData'
import { getCatalogCharacterReadiness } from '@/lib/readiness/catalogCharacterReadiness'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'

// Keep saved-character answers even when their source sets outnumber the filtered catalog cache.
const savedReadiness = new WeakMap<GameData, WeakMap<Character, boolean>>()
const readinessWithoutCatalog = new WeakMap<Character, boolean>()
const emptyAttention: ReadonlySet<string> = new Set()
const SLICE_MS = 8

function characterNeedsAttention(
  character: Character,
  catalog: GameData | null,
  itemProperties: Readonly<Record<string, string>>,
) {
  let cache = catalog && savedReadiness.get(catalog)
  if (catalog && !cache) {
    cache = new WeakMap()
    savedReadiness.set(catalog, cache)
  }
  cache ??= readinessWithoutCatalog
  const cached = cache.get(character)
  if (cached !== undefined) return cached

  const { originSystem, allowedSources, variantRules } = character
  const filtered = getFilteredGameData(catalog, {
    allowedSources: allowedSources ? getEffectiveSources(allowedSources, originSystem) : undefined,
    originSystem,
    preferNewerPrintings: variantRules?.preferNewerPrintings,
  })
  const needsAttention =
    getCatalogCharacterReadiness(character, filtered, catalog, itemProperties).status ===
    'incomplete'
  cache.set(character, needsAttention)
  return needsAttention
}

export function useLibraryAttention(
  characters: readonly Character[],
  catalog: GameData | null,
  missingContent: ReadonlySet<string>,
) {
  const itemProperties = useItemPropertyLookup()
  const inputs = useMemo(
    () => ({ characters, catalog, missingContent, itemProperties }),
    [characters, catalog, missingContent, itemProperties],
  )
  const [completed, setCompleted] = useState<{
    inputs: typeof inputs
    ids: ReadonlySet<string>
  }>()

  useEffect(() => {
    if (inputs.characters.length === 0) return

    const ids = new Set<string>()
    let index = 0
    let timer: number
    const checkBatch = () => {
      const start = performance.now()
      while (index < inputs.characters.length) {
        const character = inputs.characters[index++]
        if (
          inputs.missingContent.has(character.id) ||
          characterNeedsAttention(character, inputs.catalog, inputs.itemProperties)
        ) {
          ids.add(character.id)
        }
        if (performance.now() - start >= SLICE_MS) break
      }
      if (index < inputs.characters.length) {
        timer = window.setTimeout(checkBatch)
      } else {
        setCompleted({ inputs, ids })
      }
    }
    timer = window.setTimeout(checkBatch)
    return () => window.clearTimeout(timer)
  }, [inputs])

  if (characters.length === 0) return emptyAttention
  return completed?.inputs === inputs ? completed.ids : undefined
}
