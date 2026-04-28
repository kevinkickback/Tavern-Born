import type { Character } from '@/types/character'

export interface SourceConflict {
  source: string
  items: string[]
}

export function detectSourceConflicts(
  character: Character,
  allowedSources: string[],
): SourceConflict[] {
  const allowed = new Set(allowedSources)
  const bySource = new Map<string, string[]>()

  const flag = (label: string, source?: string) => {
    if (!source || allowed.has(source)) return
    if (!bySource.has(source)) bySource.set(source, [])
    bySource.get(source)?.push(label)
  }

  flag(character.race, character.raceSource)
  if (character.subrace) flag(character.subrace, character.subraceSource)

  if (character.classProgression?.length) {
    for (const cls of character.classProgression) {
      flag(cls.name, cls.source)
      if (cls.subclass) flag(`${cls.subclass} (subclass)`, cls.subclassSource)
    }
  } else {
    flag(character.class, character.classSource)
    if (character.subclass) flag(`${character.subclass} (subclass)`, character.subclassSource)
  }

  flag(character.background, character.backgroundSource)

  for (const feat of character.feats) {
    flag(feat.name, feat.source)
  }
  for (const feat of character.specialFeats ?? []) {
    flag(feat.name, feat.source)
  }

  return Array.from(bySource.entries()).map(([source, items]) => ({ source, items }))
}
