import { createEmptyCharacter } from '@/lib/character/createCharacter'
import type { Character } from '@/types/character'

export type CharacterDuplicateMode = 'exact' | 'reusable-build'

const CHARACTER_TEMPLATE_KIND = 'tavern-born-character-template'
const CHARACTER_TEMPLATE_VERSION = 1

export interface CharacterTemplate {
  kind: typeof CHARACTER_TEMPLATE_KIND
  version: typeof CHARACTER_TEMPLATE_VERSION
  exportedAt: string
  build: Partial<Character>
}

const RUNTIME_KEYS = [
  'hitPoints',
  'hitPointsInitialized',
  'inspiration',
  'deathSaves',
  'conditions',
  'exhaustion',
  'hitDiceUsed',
  'classResources',
] as const

function cloneCharacter(character: Character): Character {
  return structuredClone(character)
}

function clearSlotUsage(character: Character): Character['spells'] {
  const clear = (slots: Character['spells']['spellSlots']) =>
    Object.fromEntries(
      Object.entries(slots).map(([level, slot]) => [level, { ...slot, used: 0 }]),
    ) as Character['spells']['spellSlots']

  return {
    ...character.spells,
    spellSlots: clear(character.spells.spellSlots),
    pactSpellSlots: character.spells.pactSpellSlots
      ? clear(character.spells.pactSpellSlots)
      : undefined,
  }
}

/** Resets mutable session state while preserving build choices and source-qualified references. */
function resetCharacterRuntimeState(character: Character): Character {
  const baseline = createEmptyCharacter()
  return {
    ...cloneCharacter(character),
    hitPoints: baseline.hitPoints,
    hitPointsInitialized: false,
    inspiration: false,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    exhaustion: 0,
    hitDiceUsed: 0,
    classResources: Object.fromEntries(
      Object.keys(character.classResources ?? {}).map((resourceId) => [resourceId, 0]),
    ),
    spells: clearSlotUsage(character),
  }
}

export function getDuplicateCharacterName(
  sourceName: string,
  mode: CharacterDuplicateMode,
  existingNames: readonly string[],
): string {
  const baseName = sourceName.trim() || 'Unnamed Character'
  const suffix = mode === 'exact' ? 'Copy' : 'Build Copy'
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
  mode: CharacterDuplicateMode,
  options: { id?: string; name?: string; now?: string } = {},
): Character {
  const now = options.now ?? new Date().toISOString()
  const copy =
    mode === 'reusable-build' ? resetCharacterRuntimeState(character) : cloneCharacter(character)
  return {
    ...copy,
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? `${character.name || 'Unnamed Character'} (Copy)`,
    createdAt: now,
    lastModified: now,
  }
}

/** Exports build decisions while omitting identity, portrait, narrative, and live session state. */
export function createCharacterTemplate(
  character: Character,
  exportedAt = new Date().toISOString(),
): CharacterTemplate {
  const build = cloneCharacter(character) as Character & Record<string, unknown>
  for (const key of [
    'id',
    'name',
    'portrait',
    'portraitTransform',
    'createdAt',
    'lastModified',
    'details',
  ]) {
    delete build[key]
  }
  for (const key of RUNTIME_KEYS) delete build[key]
  build.spells = clearSlotUsage(character)
  return {
    kind: CHARACTER_TEMPLATE_KIND,
    version: CHARACTER_TEMPLATE_VERSION,
    exportedAt,
    build,
  }
}

export function isCharacterTemplate(value: unknown): value is CharacterTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<CharacterTemplate>
  return (
    candidate.kind === CHARACTER_TEMPLATE_KIND &&
    candidate.version === CHARACTER_TEMPLATE_VERSION &&
    !!candidate.build &&
    typeof candidate.build === 'object' &&
    !Array.isArray(candidate.build)
  )
}

/** Materializes a template through the canonical character defaults with fresh identity. */
export function instantiateCharacterTemplate(
  template: CharacterTemplate,
  options: { id?: string; name?: string; now?: string } = {},
): Character {
  const now = options.now ?? new Date().toISOString()
  const source = template.build as Partial<Character> & Record<string, unknown>
  const sanitized = { ...source }
  for (const key of [
    'id',
    'name',
    'portrait',
    'portraitTransform',
    'createdAt',
    'lastModified',
    'details',
  ]) {
    delete sanitized[key]
  }
  for (const key of RUNTIME_KEYS) delete sanitized[key]
  return createEmptyCharacter({
    ...(sanitized as Partial<Character>),
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? 'Character from Template',
    createdAt: now,
    lastModified: now,
  })
}
