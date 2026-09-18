import type { PreviewBounds, PreviewPosition } from '@/lib/overlayPosition'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import type { Spell5e } from '@/types/5etools'

export type RulesPreviewDescriptor =
  | {
      key: string
      kind: 'generic'
      title: string
      subtitle?: string
      html?: string
      recursiveLookup: RecursiveLookup
    }
  | {
      key: string
      kind: 'spell'
      title: string
      spell: Spell5e
      sourceContext?: string
      recursiveLookup: RecursiveLookup
    }

export interface TransientRulesPreview {
  id: string
  parentId: string | null
  anchor: HTMLElement | null
  anchorBounds: PreviewBounds
  descriptor: RulesPreviewDescriptor
  placement: 'top-start' | 'right-start'
  position: PreviewPosition
  sourceElement: HTMLElement | null
  positionLocked: boolean
}

interface PinnedRulesPreview {
  descriptor: RulesPreviewDescriptor
  position: PreviewPosition
}

export interface RulesPreviewState {
  pinned: PinnedRulesPreview | null
  chain: TransientRulesPreview[]
}

export type RulesPreviewAction =
  | { type: 'open-root'; preview: TransientRulesPreview }
  | { type: 'open-child'; parentId: string; preview: TransientRulesPreview }
  | { type: 'move-preview'; id: string; position: PreviewPosition }
  | { type: 'close-chain' }
  | { type: 'close-descendants'; parentId: string }
  | { type: 'close-newest' }
  | { type: 'pin'; preview: PinnedRulesPreview }
  | { type: 'move-pinned'; position: PreviewPosition }
  | { type: 'unpin'; preview: TransientRulesPreview }
  | { type: 'close-pinned' }
  | { type: 'close-all' }

export const initialRulesPreviewState: RulesPreviewState = {
  pinned: null,
  chain: [],
}

export function rulesPreviewReducer(
  state: RulesPreviewState,
  action: RulesPreviewAction,
): RulesPreviewState {
  switch (action.type) {
    case 'open-root':
      return {
        ...state,
        chain: [action.preview],
      }
    case 'open-child': {
      if (action.parentId === 'rules-preview-pinned') {
        const existingSlot = state.chain[0]
        return {
          ...state,
          chain: [
            existingSlot
              ? {
                  ...action.preview,
                  id: existingSlot.id,
                  anchor: null,
                  anchorBounds: existingSlot.anchorBounds,
                  position: existingSlot.position,
                  positionLocked: true,
                }
              : action.preview,
          ],
        }
      }
      const parentIndex = state.chain.findIndex((preview) => preview.id === action.parentId)
      if (parentIndex < 0) return state
      const parent = {
        ...state.chain[parentIndex],
        parentId: null,
        anchor: null,
        positionLocked: true,
      }
      const reusableSlot = state.chain.find((preview) => preview.id !== parent.id)
      const child = reusableSlot
        ? {
            ...action.preview,
            id: reusableSlot.id,
            anchor: null,
            anchorBounds: reusableSlot.anchorBounds,
            position: reusableSlot.position,
            positionLocked: true,
          }
        : action.preview
      return { ...state, chain: [parent, child] }
    }
    case 'move-preview': {
      const index = state.chain.findIndex((preview) => preview.id === action.id)
      if (index < 0) return state
      const current = state.chain[index]
      if (
        current.position.left === action.position.left &&
        current.position.top === action.position.top
      ) {
        return state
      }
      const chain = [...state.chain]
      chain[index] = { ...current, position: action.position }
      return { ...state, chain }
    }
    case 'close-chain':
      return state.chain.length > 0 ? { ...state, chain: [] } : state
    case 'close-descendants': {
      if (action.parentId === 'rules-preview-pinned') {
        return state.chain.length > 0 ? { ...state, chain: [] } : state
      }
      const parentIndex = state.chain.findIndex((preview) => preview.id === action.parentId)
      if (parentIndex < 0 || parentIndex === state.chain.length - 1) return state
      return { ...state, chain: state.chain.slice(0, parentIndex + 1) }
    }
    case 'close-newest':
      return state.chain.length > 0 ? { ...state, chain: state.chain.slice(0, -1) } : state
    case 'pin':
      return { pinned: action.preview, chain: [] }
    case 'move-pinned':
      if (!state.pinned) return state
      if (
        state.pinned.position.left === action.position.left &&
        state.pinned.position.top === action.position.top
      ) {
        return state
      }
      return { ...state, pinned: { ...state.pinned, position: action.position } }
    case 'unpin':
      return { pinned: null, chain: [action.preview] }
    case 'close-pinned':
      return state.pinned ? { ...state, pinned: null } : state
    case 'close-all':
      return initialRulesPreviewState
  }
}
