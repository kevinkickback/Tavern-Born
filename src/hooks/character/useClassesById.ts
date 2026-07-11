import { useMemo } from 'react'
import { useClasses, useClassLookup } from '@/hooks/data/useGameData'
import { toClassProfileId } from '@/lib/calculations/spellProfiles'
import type { Class5e } from '@/types/5etools'

/**
 * Returns a memoized Map<profileId, Class5e> combining the filtered class list
 * and the raw class lookup. Used by spell slot calculation and spellcasting detail hooks.
 */
export function useClassesById(): Map<string, Class5e> {
  const classes = useClasses()
  const classLookup = useClassLookup()

  return useMemo(() => {
    const map = new Map<string, Class5e>()
    for (const cls of classes) {
      map.set(toClassProfileId(cls.name, cls.source), cls)
      if (!map.has(toClassProfileId(cls.name))) {
        map.set(toClassProfileId(cls.name), cls)
      }
    }
    for (const cls of Object.values(classLookup)) {
      if (!cls) continue
      map.set(toClassProfileId(cls.name, cls.source), cls)
      if (!map.has(toClassProfileId(cls.name))) {
        map.set(toClassProfileId(cls.name), cls)
      }
    }
    return map
  }, [classes, classLookup])
}
