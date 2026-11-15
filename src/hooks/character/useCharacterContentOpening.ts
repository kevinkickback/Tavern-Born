import { useCallback, useRef, useState } from 'react'
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
  gameData: ReturnType<typeof useGameDataStore.getState>['gameData']
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
    gameData,
    missing: [...missing.values()],
  }
}

export function useCharacterContentOpening(onOpened?: () => void) {
  const [pending, setPending] = useState<PendingOpen | null>(null)
  const trigger = useRef<HTMLElement | null>(null)

  const rememberTrigger = useCallback(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [])

  const cancel = useCallback(() => setPending(null), [])
  const finish = useCallback(
    (request: PendingOpen) => {
      const state = useCharacterStore.getState()
      cancel()
      if (
        useGameDataStore.getState().isCatalogActivating ||
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
      if (useGameDataStore.getState().isCatalogActivating) return
      const request = inspectCharacter(id)
      if (!request) cancel()
      else if (request.missing.length) setPending(request)
      else finish(request)
    },
    [cancel, finish],
  )

  return {
    pending,
    rememberTrigger,
    restoreFocus: () => {
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true })
    },
    requestOpen,
    cancel,
    openLimited: () => {
      if (!pending) return
      if (pending.gameData !== useGameDataStore.getState().gameData) {
        if (useCharacterStore.getState().activeCharacterId === pending.previousId)
          requestOpen(pending.id)
        else cancel()
      } else finish(pending)
    },
  }
}
