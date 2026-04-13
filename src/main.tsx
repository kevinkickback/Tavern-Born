import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { initThemeFromStorage } from '@/lib/themeManager'
import { useCharacterStore } from '@/store/characterStore'
import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'

import './styles/main.css'

const syncUnsavedStateToElectron = () => {
  const hasUnsavedChanges = useCharacterStore.getState().hasUnsavedChanges()
  window.electronAPI?.setUnsavedChanges?.(hasUnsavedChanges)
}

syncUnsavedStateToElectron()
useCharacterStore.subscribe(() => {
  syncUnsavedStateToElectron()
})

initThemeFromStorage()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
  </ErrorBoundary>,
)
