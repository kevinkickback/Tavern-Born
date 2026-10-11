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

/** Await a real durable import before selecting its character for a page journey. */
export async function importActiveCharacter(character: Character): Promise<void> {
  await useCharacterStore.getState().importCharacters([character])
  useCharacterStore.getState().setActiveCharacter(character.id)
}
