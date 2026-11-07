import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createGameDataAvailabilityIndex,
  getUnavailableCharacterContent,
  type UnavailableCharacterContent,
} from '@/lib/character/additionalContentAvailability'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

interface PendingOpen {
  id: string
  previousId: string | null
  name: string
  missing: UnavailableCharacterContent[]
}

function inspectCharacter(id: string) {
  const state = useCharacterStore.getState()
  const character = state.characters.find((row) => row.id === id)
  if (!character) return undefined
  const { gameData } = useGameDataStore.getState()
  const missing = new Map<string, UnavailableCharacterContent>()
  if (gameData) {
    const availability = createGameDataAvailabilityIndex(gameData)
    for (const { name, source } of getUnavailableCharacterContent(character, availability)) {
      missing.set(JSON.stringify([name, source]), { name, source })
    }
  }
  return {
    id,
    previousId: state.activeCharacterId,
    name: character.name,
    missing: [...missing.values()],
  }
}

export function useCharacterContentOpening(onOpened?: () => void) {
  const [pending, setPending] = useState<PendingOpen | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryMessage, setRetryMessage] = useState<string | null>(null)
  const currentRequest = useRef<PendingOpen | null>(null)
  const retryRequest = useRef<PendingOpen | null>(null)
  const canRetry = useGameDataStore((state) => state.dataSourceConfig !== null)
  useEffect(
    () => () => {
      currentRequest.current = null
    },
    [],
  )

  const cancel = useCallback(() => {
    currentRequest.current = null
    retryRequest.current = null
    setPending(null)
    setRetrying(false)
    setRetryMessage(null)
  }, [])
  const finish = useCallback(
    (request: PendingOpen) => {
      const state = useCharacterStore.getState()
      cancel()
      if (
        state.activeCharacterId !== request.previousId ||
        !state.characters.some((row) => row.id === request.id)
      )
        return
      state.setActiveCharacter(request.id)
      onOpened?.()
    },
    [cancel, onOpened],
  )

  const requestOpen = useCallback(
    (id: string) => {
      cancel()
      const request = inspectCharacter(id)
      if (!request) return
      if (!request.missing.length) {
        finish(request)
        return
      }
      currentRequest.current = request
      setPending(request)
    },
    [cancel, finish],
  )

  const retry = async () => {
    const request = currentRequest.current
    if (!request || retryRequest.current === request) return
    const { dataSourceConfig, gameData, loadGameData, isLoading, isBackgroundRefreshing } =
      useGameDataStore.getState()
    if (!dataSourceConfig) return
    if (isLoading || isBackgroundRefreshing) {
      setRetryMessage('A source check is already in progress. Try again after it finishes.')
      return
    }
    retryRequest.current = request
    setRetrying(true)
    setRetryMessage(null)
    try {
      await loadGameData(dataSourceConfig, Boolean(gameData))
    } catch {
      // The source can fail before reporting an outcome. Recheck the current catalog below.
    }
    if (currentRequest.current !== request) return
    retryRequest.current = null
    setRetrying(false)
    const latest = inspectCharacter(request.id)
    if (!latest || latest.previousId !== request.previousId) {
      cancel()
      return
    }
    if (!latest.missing.length) {
      finish(latest)
      return
    }
    currentRequest.current = latest
    setPending(latest)
    setRetryMessage(
      useGameDataStore.getState().error ?? 'The original rules are still unavailable.',
    )
  }

  return {
    pending,
    retrying,
    retryMessage,
    canRetry,
    requestOpen,
    cancel,
    retry,
    openLimited: () => {
      if (currentRequest.current) finish(currentRequest.current)
    },
  }
}
