import type { Character } from '@/types/character'

export const MAX_LIBRARY_BACKUP_SIZE = 250 * 1024 * 1024
export const LIBRARY_BACKUP_EXTENSION = '.tbclib'

const LIBRARY_BACKUP_KIND = 'tavern-born-library'
const LIBRARY_BACKUP_VERSION = 1

export interface PreparedCharacterDownload {
  filename: string
  text: string
}

export interface PreparedCharacterImport {
  characters: Array<{ label: string; character: Character }>
  failures: Array<{ label: string; reason: string; kind: 'parse' | 'validation' | 'format' }>
  isLibraryBackup: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeFilenameBase(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/[. ]+$/g, '') || 'character'
  )
}

export function prepareCharacterDownload(character: Character): PreparedCharacterDownload {
  return {
    filename: `${safeFilenameBase(character.name)}.tbc`,
    text: JSON.stringify(character, null, 2),
  }
}

export function prepareUnsupportedCharacterDownloads(
  characters: readonly unknown[],
): PreparedCharacterDownload[] {
  return characters.map((character, index) => {
    const name = isRecord(character) && typeof character.name === 'string' ? character.name : ''
    const suffix = characters.length === 1 ? '' : `-${index + 1}`
    return {
      filename: `${safeFilenameBase(name)}-legacy-backup${suffix}.tbc`,
      text: JSON.stringify(character, null, 2),
    }
  })
}

export function prepareLibraryDownload(
  characters: readonly Character[],
  exportedAt = new Date().toISOString(),
): PreparedCharacterDownload {
  if (characters.length === 0) throw new RangeError('Select at least one character to export.')
  const text = JSON.stringify(
    {
      kind: LIBRARY_BACKUP_KIND,
      version: LIBRARY_BACKUP_VERSION,
      exportedAt,
      characters,
    },
    null,
    2,
  )
  if (new Blob([text]).size > MAX_LIBRARY_BACKUP_SIZE) {
    throw new RangeError('Library backup exceeds the 250MB safety limit. Export fewer characters.')
  }
  return {
    filename: `tavern-born-library-${exportedAt.slice(0, 10)}${LIBRARY_BACKUP_EXTENSION}`,
    text,
  }
}

/** Parse one single-character file or versioned library backup, retaining valid entries. */
export function prepareCharacterImport(
  text: string,
  filename: string,
  validate: (value: unknown) => string | null,
): PreparedCharacterImport {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      characters: [],
      failures: [
        {
          label: filename,
          reason: `Could not parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
          kind: 'parse',
        },
      ],
      isLibraryBackup: false,
    }
  }

  const backup = isRecord(parsed) && parsed.kind === LIBRARY_BACKUP_KIND ? parsed : null
  const isLibraryBackup = backup !== null
  if (backup && (backup.version !== LIBRARY_BACKUP_VERSION || !Array.isArray(backup.characters))) {
    return {
      characters: [],
      failures: [
        {
          label: filename,
          reason: 'Unsupported or invalid library backup format.',
          kind: 'format',
        },
      ],
      isLibraryBackup: true,
    }
  }

  const values = backup ? (backup.characters as unknown[]) : [parsed]
  if (values.length === 0) {
    return {
      characters: [],
      failures: [
        { label: filename, reason: 'The library backup contains no characters.', kind: 'format' },
      ],
      isLibraryBackup: true,
    }
  }

  const characters: PreparedCharacterImport['characters'] = []
  const failures: PreparedCharacterImport['failures'] = []
  values.forEach((value, index) => {
    const name = isRecord(value) && typeof value.name === 'string' ? value.name.trim() : ''
    const label = isLibraryBackup ? `${filename} · ${name || `Character ${index + 1}`}` : filename
    const error = validate(value)
    if (error) failures.push({ label, reason: error, kind: 'validation' })
    else characters.push({ label, character: value as Character })
  })
  return { characters, failures, isLibraryBackup }
}

/** Keep the imported character's name unless it would collide in the destination library. */
export function getImportedCharacterName(
  sourceName: string,
  existingNames: readonly string[],
): string {
  const normalized = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()))
  if (!normalized.has(sourceName.trim().toLocaleLowerCase())) return sourceName
  const baseName = sourceName.trim() || 'Unnamed Character'
  let candidate = `${baseName} (Imported)`
  let sequence = 2
  while (normalized.has(candidate.toLocaleLowerCase())) {
    candidate = `${baseName} (Imported ${sequence})`
    sequence += 1
  }
  return candidate
}

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
