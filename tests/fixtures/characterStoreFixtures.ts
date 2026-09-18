import { useCharacterStore } from '@/store/characterStore'
import type { Character } from '@/types/character'

export function resetCharacterStore(): void {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
}

export function setActiveCharacter(character: Character): void {
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}
