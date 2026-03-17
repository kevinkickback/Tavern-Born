// Startup data initialisation hook.
//
// Runs once after the Zustand store has hydrated from IDB and implements the
// five launch scenarios:
//
//  1. Neither cache nor source  → show setup modal (modal detects gameData===null)
//  2. Both exist, cache fresh   → load from cache instantly
//  3. Both exist, cache stale   → load from cache NOW, refresh from source in background
//     Both exist, source changed → fetch fresh from new source (blocking)
//  4. Only cache (offline mode) → load from cache + warn via toast
//  5. Only source, no cache     → fetch from source, write cache
//
// DEV-only: seeds test characters when the character store is empty.

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useGameDataStore } from '@/store/gameDataStore'
import {
    readGameDataCache,
    isCacheStale,
    isCacheForSource,
} from '@/lib/dataCache'

// DEV character seeding — tree-shaken away in production builds.
import { useCharacterStore } from '@/store/characterStore'
import { DEV_SEED_CHARACTERS } from '@/lib/seedCharacters'

export function useDataInit() {
    const hasHydrated  = useGameDataStore((s) => s.hasHydrated)
    const gameData     = useGameDataStore((s) => s.gameData)
    const dataSourceConfig = useGameDataStore((s) => s.dataSourceConfig)
    const isLoading    = useGameDataStore((s) => s.isLoading)
    const loadGameData = useGameDataStore((s) => s.loadGameData)
    const setGameData  = useGameDataStore((s) => s.setGameData)
    const setCacheStatus = useGameDataStore((s) => s.setCacheStatus)

    // DEV only
    const characters   = useCharacterStore((s) => s.characters)
    const setCharacters = useCharacterStore((s) => s.setCharacters)

    const initialized = useRef(false)

    // ── DEV: seed test characters ──────────────────────────────────────────
    useEffect(() => {
        if (import.meta.env.DEV && characters.length === 0) {
            setCharacters(DEV_SEED_CHARACTERS)
        }
    }, [characters.length, setCharacters])

    // ── Main startup init — runs once after IDB hydration ─────────────────
    useEffect(() => {
        // Wait for Zustand to finish reading from IDB.
        if (!hasHydrated) return
        // Only run once; data may already be present if user configured mid-session.
        if (initialized.current || gameData || isLoading) return
        initialized.current = true

        async function init() {
            const cache  = await readGameDataCache()
            const config = dataSourceConfig

            const hasCache  = cache !== null
            const hasSource = config !== null

            // ── Scenario 1: nothing exists ────────────────────────────────
            if (!hasCache && !hasSource) {
                setCacheStatus('unconfigured')
                return
            }

            // ── Scenarios 2 & 3: both exist ───────────────────────────────
            if (hasCache && hasSource) {
                const sameSource = isCacheForSource(cache, config)
                const stale      = isCacheStale(cache.cachedAt)

                if (!sameSource) {
                    // Source changed — cache is for a different dataset; fetch fresh.
                    await loadGameData(config)
                    return
                }

                if (stale) {
                    // Same source but >24 h old — serve cache immediately for a fast
                    // start, then silently refresh in background.
                    setGameData(cache.data)
                    setCacheStatus('stale')
                    toast.info('Game data is out of date — refreshing in the background…', {
                        duration: 5000,
                    })
                    loadGameData(config, true) // background=true, don't await
                    return
                }

                // Same source, still fresh — serve from cache.
                setGameData(cache.data)
                setCacheStatus('fresh')
                return
            }

            // ── Scenario 4: only cache, no source (offline mode) ──────────
            if (hasCache && !hasSource) {
                setGameData(cache.data)
                setCacheStatus('offline')
                toast.warning(
                    'No data source is configured. Using cached data — some content may be outdated.',
                    { duration: 8000 },
                )
                return
            }

            // ── Scenario 5: source configured, no cache yet ───────────────
            if (!hasCache && hasSource) {
                await loadGameData(config!)
            }
        }

        init()
    }, [hasHydrated, gameData, isLoading, dataSourceConfig, loadGameData, setGameData, setCacheStatus])
}
