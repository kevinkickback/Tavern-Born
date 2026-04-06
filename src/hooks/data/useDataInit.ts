import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { DEV_SEED_CHARACTERS } from '@/lib/seedCharacters';
import {
  isCacheForSource,
  isCacheStale,
  readGameDataCache,
} from '@/lib/storage/dataCache';

// DEV character seeding — tree-shaken away in production builds.
import { useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';

export function useDataInit() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated);
  const gameData = useGameDataStore((s) => s.gameData);
  const dataSourceConfig = useGameDataStore((s) => s.dataSourceConfig);
  const isLoading = useGameDataStore((s) => s.isLoading);
  const loadGameData = useGameDataStore((s) => s.loadGameData);
  const setGameData = useGameDataStore((s) => s.setGameData);
  const setCacheStatus = useGameDataStore((s) => s.setCacheStatus);

  const characters = useCharacterStore((s) => s.characters);
  const setCharacters = useCharacterStore((s) => s.setCharacters);

  const initialized = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV && characters.length === 0) {
      setCharacters(DEV_SEED_CHARACTERS);
    }
  }, [characters.length, setCharacters]);

  useEffect(() => {
    // Wait for Zustand to finish reading from IDB.
    if (!hasHydrated) return;
    // Only run once; data may already be present if user configured mid-session.
    if (initialized.current || gameData || isLoading) return;
    initialized.current = true;

    async function init() {
      const cache = await readGameDataCache();
      const config = dataSourceConfig;

      const hasCache = cache !== null;
      const hasSource = config !== null;

      if (!hasCache && !hasSource) {
        setCacheStatus('unconfigured');
        return;
      }

      if (hasCache && hasSource) {
        const sameSource = isCacheForSource(cache, config);
        const stale = isCacheStale(cache.cachedAt);

        if (!sameSource) {
          // Source changed — cache is for a different dataset; fetch fresh.
          await loadGameData(config);
          return;
        }

        if (stale) {
          // Same source but >24 h old — serve cache immediately for a fast
          // start, then silently refresh in background.
          setGameData(cache.data);
          setCacheStatus('stale');
          toast.info(
            'Game data is out of date — refreshing in the background…',
            {
              duration: 5000,
            },
          );
          loadGameData(config, true); // background=true, don't await
          return;
        }

        setGameData(cache.data);
        setCacheStatus('fresh');
        return;
      }

      if (hasCache && !hasSource) {
        setGameData(cache.data);
        setCacheStatus('offline');
        toast.warning(
          'No data source is configured. Using cached data — some content may be outdated.',
          { duration: 8000 },
        );
        return;
      }

      if (!hasCache && hasSource) {
        await loadGameData(config);
      }
    }

    init();
  }, [
    hasHydrated,
    gameData,
    isLoading,
    dataSourceConfig,
    loadGameData,
    setGameData,
    setCacheStatus,
  ]);
}
