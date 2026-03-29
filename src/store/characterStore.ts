import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Character } from "@/types/character";
import { createIdbStorage } from "@/lib/storage/idb-storage";

const generateId = () => {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

interface CharacterState {
	characters: Character[];
	activeCharacterId: string | null;
	activeCharacter: Character | null;

	setCharacters: (characters: Character[]) => void;
	addCharacter: (character: Character) => void;
	updateCharacter: (id: string, updates: Partial<Character>) => void;
	deleteCharacter: (id: string) => void;
	setActiveCharacter: (id: string | null) => void;
	createNewCharacter: (initial: Partial<Character>) => Character;
}

const createEmptyCharacter = (initial: Partial<Character> = {}): Character => {
	const now = new Date().toISOString();

	return {
		id: generateId(),
		version: "1.0.0",
		name: "",
		race: "",
		class: "",
		background: "",
		level: 1,
		experiencePoints: 0,
		abilityScores: {
			strength: 10,
			dexterity: 10,
			constitution: 10,
			intelligence: 10,
			wisdom: 10,
			charisma: 10,
		},
		proficiencyBonus: 2,
		proficiencies: {
			armor: [],
			weapons: [],
			tools: [],
			languages: [],
			savingThrows: [],
		},
		features: [],
		feats: [],
		spells: {
			cantrips: [],
			spellsKnown: [],
			spellSlots: {
				level1: { max: 0, used: 0 },
				level2: { max: 0, used: 0 },
				level3: { max: 0, used: 0 },
				level4: { max: 0, used: 0 },
				level5: { max: 0, used: 0 },
				level6: { max: 0, used: 0 },
				level7: { max: 0, used: 0 },
				level8: { max: 0, used: 0 },
				level9: { max: 0, used: 0 },
			},
			preparedSpells: [],
		},
		equipment: [],
		hitPoints: {
			max: 0,
			current: 0,
			temporary: 0,
		},
		armorClass: 10,
		initiative: 0,
		speed: 30,
		savingThrows: {
			strength: { proficient: false, bonus: 0 },
			dexterity: { proficient: false, bonus: 0 },
			constitution: { proficient: false, bonus: 0 },
			intelligence: { proficient: false, bonus: 0 },
			wisdom: { proficient: false, bonus: 0 },
			charisma: { proficient: false, bonus: 0 },
		},
		skills: {},
		details: {},
		createdAt: now,
		lastModified: now,
		...initial,
	};
};

export const useCharacterStore = create<CharacterState>()(
	persist(
		(set, get) => ({
			characters: [],
			activeCharacterId: null,
			activeCharacter: null,

			setCharacters: (characters) => set({ characters }),

			addCharacter: (character) =>
				set((state) => ({
					characters: [...state.characters, character],
				})),

			updateCharacter: (id, updates) =>
				set((state) => {
					const characters = state.characters.map((char) =>
						char.id === id
							? { ...char, ...updates, lastModified: new Date().toISOString() }
							: char,
					);
					const activeCharacter =
						state.activeCharacterId === id && state.activeCharacter
							? {
									...state.activeCharacter,
									...updates,
									lastModified: new Date().toISOString(),
								}
							: state.activeCharacter;
					return { characters, activeCharacter };
				}),

			deleteCharacter: (id) =>
				set((state) => ({
					characters: state.characters.filter((char) => char.id !== id),
					activeCharacterId:
						state.activeCharacterId === id ? null : state.activeCharacterId,
					activeCharacter:
						state.activeCharacterId === id ? null : state.activeCharacter,
				})),

			setActiveCharacter: (id) =>
				set((state) => {
					const character = id
						? state.characters.find((c) => c.id === id) || null
						: null;
					return {
						activeCharacterId: id,
						activeCharacter: character,
					};
				}),

			createNewCharacter: (initial) => {
				const character = createEmptyCharacter(initial);
				get().addCharacter(character);
				return character;
			},
		}),
		{
			name: "character-storage",
			storage: createIdbStorage(),
			partialize: (state) => ({
				characters: state.characters,
				activeCharacterId: state.activeCharacterId,
			}),
			onRehydrateStorage: () => (state) => {
				if (state) {
					// Rehydrate activeCharacter from activeCharacterId after loading
					const active = state.activeCharacterId
						? state.characters.find((c) => c.id === state.activeCharacterId) ||
							null
						: null;
					state.activeCharacter = active;
				}
			},
		},
	),
);
