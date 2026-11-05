import { createContext } from 'react'

export const DialogPortalContext = createContext<{
  container: HTMLElement | null
  isAuxiliarySurface: (target: Element) => boolean
} | null>(null)
