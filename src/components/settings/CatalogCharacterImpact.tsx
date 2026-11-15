import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { materializeCatalogCandidate } from '@/lib/5etools/catalogClient'
import type { CatalogCandidate } from '@/lib/5etools/catalogProtocol'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import { useCharacterStore } from '@/store/characterStore'

export function CatalogCharacterImpact({ candidate }: { candidate: CatalogCandidate }) {
  const characters = useCharacterStore((state) => state.characters)
  const [requested, setRequested] = useState(false)
  const [result, setResult] = useState<string[] | 'unavailable'>()

  useEffect(() => {
    if (!requested) return
    const controller = new AbortController()
    setResult(undefined)
    void materializeCatalogCandidate(candidate, controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return
        const proposed = createGameDataAvailabilityIndex(data)
        setResult(
          characters
            .filter((character) => characterUsesContentOutsideCatalog(character, proposed))
            .map(({ name }) => name),
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult('unavailable')
      })
    return () => controller.abort()
  }, [candidate, characters, requested])

  if (!characters.length) return null
  return (
    <div className="text-sm">
      {!requested && (
        <Button variant="outline" onClick={() => setRequested(true)}>
          Check saved characters
        </Button>
      )}
      {requested && !result && <p role="status">Checking saved characters…</p>}
      {result === 'unavailable' ? (
        <p>Couldn’t check saved characters. Check the source again to refresh this preview.</p>
      ) : result?.length ? (
        <p>Saved characters with content unavailable in this preview: {result.join(', ')}</p>
      ) : (
        result && <p>All saved characters’ checked content is available in this preview.</p>
      )}
    </div>
  )
}
