import { createContext, useContext } from 'react'
import { toast } from 'sonner'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Character } from '@/types/character'
import { parseCharacterUpdate, useCharacterStore } from './characterStore'

interface CharacterEditingState {
  activeCharacter: Character | null
  updateCharacter: (id: string, updates: Partial<Character>) => void | Promise<void>
}

type CharacterEditingStore = Pick<
  StoreApi<CharacterEditingState>,
  'getState' | 'getInitialState' | 'subscribe'
>

export const CharacterEditingContext = createContext<CharacterEditingStore>(useCharacterStore)

export function useCharacterEditingStore() {
  return useContext(CharacterEditingContext)
}

export function useEditingCharacter() {
  return useStore(useCharacterEditingStore(), (state) => state.activeCharacter)
}

export function createCharacterEditingDraft(character: Character | null) {
  return createStore<CharacterEditingState>((set, get) => ({
    activeCharacter: character,
    updateCharacter: (id, updates) => {
      const current = get().activeCharacter
      if (current?.id !== id) return
      const parsed = parseCharacterUpdate(current, updates)
      if (!parsed.data) {
        toast.error('The choice could not be applied to this draft.')
        return
      }
      set({ activeCharacter: parsed.data })
    },
  }))
}
