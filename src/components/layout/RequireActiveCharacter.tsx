import { useLayoutEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

export function RequireActiveCharacter() {
  const hasCharacter = useCharacterStore((state) => !!state.activeCharacter)
  const activating = useGameDataStore((state) => state.isCatalogActivating)
  const recovering = useGameDataStore((state) => state.isStartupRecovering)
  const hasGameData = useGameDataStore((state) => state.gameData !== null)
  const protectCatalog = useGameDataStore((state) => state.protectCatalog)
  useLayoutEffect(() => {
    if (hasCharacter && hasGameData && !activating && !recovering) return protectCatalog()
  }, [hasCharacter, hasGameData, activating, recovering, protectCatalog])
  if (recovering) return null
  if (hasCharacter && activating) return <p role="status">Applying game data…</p>
  return hasCharacter ? <Outlet /> : <Navigate to="/" replace />
}
