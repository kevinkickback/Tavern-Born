import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { useCharacterStore } from '@/store/characterStore'
import { initThemeFromStorage } from '@/lib/themeManager'

import "./styles/main.css"
import "./styles/theme.css"
import "./styles/index.css"

const syncUnsavedStateToElectron = () => {
  const hasUnsavedChanges = useCharacterStore.getState().hasUnsavedChanges()
  window.electronAPI?.setUnsavedChanges?.(hasUnsavedChanges)
}

syncUnsavedStateToElectron()
useCharacterStore.subscribe(() => {
  syncUnsavedStateToElectron()
})

initThemeFromStorage()

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
  </ErrorBoundary>
)
