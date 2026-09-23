import { Navigate, Route, Routes } from 'react-router-dom'
import { useCharacterStore } from '@/store/characterStore'
import { CharacterSheetPage } from './CharacterSheetPage'

/** Keep template routing and its metadata out of the startup renderer. */
export function CharacterSheetRoutes() {
  const originSystem = useCharacterStore((state) => state.activeCharacter?.originSystem)
  return (
    <Routes>
      <Route
        index
        element={<Navigate to={`/character-sheet/${originSystem ?? '2024'}/custom`} replace />}
      />
      <Route path="2014" element={<Navigate to="/character-sheet/2014/custom" replace />} />
      <Route path="2024" element={<Navigate to="/character-sheet/2024/custom" replace />} />
      <Route
        path="2014/official"
        element={<CharacterSheetPage key="2014-official" templateId="2014-official" />}
      />
      <Route
        path="2014/custom"
        element={<CharacterSheetPage key="2014-custom" templateId="2014-custom" />}
      />
      <Route
        path="2024/official"
        element={<CharacterSheetPage key="2024-official" templateId="2024-official" />}
      />
      <Route
        path="2024/custom"
        element={<CharacterSheetPage key="2024-custom" templateId="2024-custom" />}
      />
    </Routes>
  )
}
