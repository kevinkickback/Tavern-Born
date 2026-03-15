import { useEffect, useRef } from "react";
import { useCharacterStore } from "@/store/characterStore";
import { useGameDataStore } from "@/store/gameDataStore";
import { DEV_SEED_CHARACTERS } from "@/lib/seedCharacters";

const DEFAULT_DATA_SOURCE = {
	type: "remote" as const,
	path: "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master",
	isValid: true,
};

export function useSeedData() {
	const characters = useCharacterStore((state) => state.characters);
	const setCharacters = useCharacterStore((state) => state.setCharacters);
	const dataSourceConfig = useGameDataStore((state) => state.dataSourceConfig);
	const gameData = useGameDataStore((state) => state.gameData);
	const loadGameData = useGameDataStore((state) => state.loadGameData);
	const isLoading = useGameDataStore((state) => state.isLoading);
	const setDataSourceConfig = useGameDataStore(
		(state) => state.setDataSourceConfig,
	);

	const hasSetDefaultConfig = useRef(false);

	useEffect(() => {
		if (characters.length === 0 && import.meta.env.DEV) {
			setCharacters(DEV_SEED_CHARACTERS);
		}
	}, [characters.length, setCharacters]);

	useEffect(() => {
		if (!dataSourceConfig && !isLoading && !hasSetDefaultConfig.current) {
			setDataSourceConfig(DEFAULT_DATA_SOURCE);
			hasSetDefaultConfig.current = true;
		}
	}, [dataSourceConfig, isLoading, setDataSourceConfig]);

	useEffect(() => {
		if (dataSourceConfig && !gameData && !isLoading) {
			loadGameData(dataSourceConfig);
		}
	}, [dataSourceConfig, gameData, isLoading, loadGameData]);
}
