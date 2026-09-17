import type { Character } from '@/types/character'

function cloneCharacter(character: Character): Character {
  return structuredClone(character)
}

export function getDuplicateCharacterName(
  sourceName: string,
  existingNames: readonly string[],
): string {
  const baseName = sourceName.trim() || 'Unnamed Character'
  const suffix = 'Copy'
  const candidate = `${baseName} (${suffix})`
  const normalizedNames = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()))
  if (!normalizedNames.has(candidate.toLocaleLowerCase())) return candidate
  let sequence = 2
  while (normalizedNames.has(`${baseName} (${suffix} ${sequence})`.toLocaleLowerCase())) {
    sequence += 1
  }
  return `${baseName} (${suffix} ${sequence})`
}

/** Creates an independent copy with fresh identity and timestamps. */
export function duplicateCharacter(
  character: Character,
  options: { id?: string; name?: string; now?: string } = {},
): Character {
  const now = options.now ?? new Date().toISOString()
  const copy = cloneCharacter(character)
  return {
    ...copy,
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? `${character.name || 'Unnamed Character'} (Copy)`,
    createdAt: now,
    lastModified: now,
  }
}
