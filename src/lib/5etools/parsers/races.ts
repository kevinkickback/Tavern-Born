import { RACE_STRUCTURED_ENTRY_FIELDS } from '@/lib/5etools/rulesetMetadata'
import { CopyResolutionError, resolveCopiedRecords, resolveRecordVersions } from '../copyResolution'
import { mergeSubraceForVersions } from '../mergeSubrace'
import { asArray, asObject } from './shared'

function raceKey(name: unknown, source: unknown): string {
  return [name, source]
    .map((part) => (typeof part === 'string' ? part.trim().toLowerCase() : ''))
    .join('|')
}

function normalizeRacePresentationEntries(race: Record<string, unknown>): Record<string, unknown> {
  const entries = asArray(race.entries)
  const presentationEntries = entries.filter((entry) => {
    const entryObject = asObject(entry)
    const field =
      typeof entryObject.name === 'string'
        ? RACE_STRUCTURED_ENTRY_FIELDS[entryObject.name]
        : undefined
    return !field || race[field] === undefined
  })
  return { ...race, presentationEntries }
}

export function parseRaces(
  data: unknown,
  options?: { deferResolutionErrors?: boolean },
): unknown[] {
  const obj = asObject(data)
  const rawRaces = (obj.race ? asArray(obj.race) : Array.isArray(data) ? data : []) as Array<
    Record<string, unknown> & { name: string; source: string }
  >
  const resolvedRaces = resolveCopiedRecords(rawRaces, 'race')
  const resolvedSubraces = resolveCopiedRecords(asArray(obj.subrace) as typeof rawRaces, 'subrace')
  const diagnostics = [...resolvedRaces.diagnostics, ...resolvedSubraces.diagnostics]
  const races = resolvedRaces.records
  const raceKeys = new Set(races.map((race) => raceKey(race.name, race.source)))
  const subraceEntries = resolvedSubraces.records

  // Group subraces by parent race. The parent is identified by raceName + raceSource.
  // Some subraces store this directly; others use _copy.raceName / _copy.raceSource.
  const subraceMap = new Map<string, unknown[]>()
  for (const sr of subraceEntries) {
    const srObj = asObject(sr)
    const copyObj = asObject(srObj._copy)
    const raceName: string | undefined =
      typeof srObj.raceName === 'string' ? srObj.raceName : (copyObj.raceName as string | undefined)
    const raceSource: string | undefined =
      (typeof srObj.raceSource === 'string' ? srObj.raceSource : undefined) ??
      (typeof copyObj.raceSource === 'string' ? copyObj.raceSource : undefined) ??
      (typeof srObj.source === 'string' ? srObj.source : undefined)
    if (!raceName) continue
    const key = raceKey(raceName, raceSource)
    if (!raceKeys.has(key)) {
      diagnostics.push({
        entity: `${String(srObj.name ?? 'Default')}|${String(srObj.source ?? '')}`,
        reason: `missing parent race ${raceName}|${raceSource ?? ''}`,
      })
      continue
    }
    if (!subraceMap.has(key)) subraceMap.set(key, [])
    subraceMap.get(key)?.push(sr)
  }

  const result = races.map((race) => {
    const raceObj = asObject(race)
    const key = raceKey(raceObj.name, raceObj.source)
    const nested = [...asArray(raceObj.subraces), ...(subraceMap.get(key) ?? [])]
    const versions = raceObj._copy
      ? { records: [], diagnostics: [] }
      : resolveRecordVersions(race, 'race')
    diagnostics.push(...versions.diagnostics)
    const versionSubraces = versions.records.map((version) => ({
      ...version,
      name: extractVersionDisplayName(version.name, race.name),
      _isVersion: true,
    }))

    const GAMEPLAY_KEYS = new Set([
      'entries',
      'ability',
      'traitTags',
      'darkvision',
      'resist',
      'immune',
      'conditionImmune',
      'languageProficiencies',
      'skillProficiencies',
      'toolProficiencies',
      'weaponProficiencies',
      'armorProficiencies',
      'additionalSpells',
      'feats',
      'speed',
      'size',
      'overwrite',
    ])
    const allSubraces = [
      ...nested.flatMap((subrace) => {
        const subraceObj = asObject(subrace)
        if (subraceObj._copy)
          diagnostics.push({
            entity: `${String(subraceObj.name ?? 'Default')}|${String(subraceObj.source ?? '')}`,
            reason: 'inline subrace copies must be supplied in the subrace collection',
          })
        let subraceVersions: ReturnType<typeof resolveRecordVersions> = {
          records: [],
          diagnostics: [],
        }
        const hasVersions =
          subraceObj._versions !== undefined &&
          (!Array.isArray(subraceObj._versions) || subraceObj._versions.length > 0)
        if (hasVersions && !subraceObj._copy && !raceObj._copy) {
          try {
            subraceVersions = resolveRecordVersions(
              mergeSubraceForVersions(race, subraceObj),
              'race',
            )
          } catch (error) {
            subraceVersions.diagnostics.push({
              entity: `${race.name}|${race.source}/subrace:${String(subraceObj.name ?? 'Default')}|${String(subraceObj.source ?? race.source)}`,
              reason: String(error),
            })
          }
        }
        diagnostics.push(...subraceVersions.diagnostics)
        // Nameless entries become 'Default'. Tag metadata-only ones so the display
        // layer can suppress a lone Default that adds nothing to the base race.
        const hasGameplay = Object.keys(subraceObj).some((k) => GAMEPLAY_KEYS.has(k))
        const ordinary = normalizeRacePresentationEntries({
          ...subraceObj,
          ...(typeof subraceObj.name === 'string' && subraceObj.name.trim().length > 0
            ? {}
            : { name: 'Default', _isMetadataDefault: !hasGameplay }),
        })
        if (!subraceObj._copy && !raceObj._copy && !subraceVersions.diagnostics.length)
          delete ordinary._versions
        return [
          ordinary,
          ...subraceVersions.records.map((version) =>
            normalizeRacePresentationEntries({
              ...version,
              _isVersion: true,
            }),
          ),
        ]
      }),
      ...versionSubraces.map((version) => normalizeRacePresentationEntries(asObject(version))),
    ]

    const normalizedRace = normalizeRacePresentationEntries(raceObj)
    if (!raceObj._copy && !versions.diagnostics.length) delete normalizedRace._versions
    if (allSubraces.length === 0) return normalizedRace
    return { ...normalizedRace, subraces: allSubraces }
  })
  if (diagnostics.length && !options?.deferResolutionErrors)
    throw new CopyResolutionError(diagnostics, 'in race data')
  return result
}

/**
 * Extract display name from a version name like "Elf; Drow Lineage" -> "Drow Lineage",
 * or "Dragonborn (Black)" -> "Black".
 */
function extractVersionDisplayName(fullName: string, parentName: string): string {
  const semiIdx = fullName.indexOf(';')
  if (semiIdx >= 0) return fullName.substring(semiIdx + 1).trim()
  // These labels are persisted identities for existing top-level versions.
  const parenMatch = fullName.match(/\(([^)]+)\)/)
  if (parenMatch) return parenMatch[1]
  // Fallback: strip parent name prefix
  if (fullName.startsWith(parentName))
    return fullName.substring(parentName.length).trim() || fullName
  return fullName
}

function getFirstStringFromEntries(entries: unknown[]): string | null {
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry
    }
    const entryObj = asObject(entry)
    const nestedEntries = asArray(entryObj.entries)
    if (nestedEntries.length > 0) {
      const nested = getFirstStringFromEntries(nestedEntries)
      if (nested) return nested
    }
  }

  return null
}

export function parseRaceFluffSummaries(
  data: unknown,
): Array<{ name: string; source: string; summary: string }> {
  const obj = asObject(data)
  const raceFluff = asArray(obj.raceFluff)

  return raceFluff
    .map((entry) => {
      const fluff = asObject(entry)
      const name = typeof fluff.name === 'string' ? fluff.name : ''
      const source = typeof fluff.source === 'string' ? fluff.source : ''
      const summary = getFirstStringFromEntries(asArray(fluff.entries))

      if (!name || !source || !summary) return null
      return { name, source, summary }
    })
    .filter(
      (
        value,
      ): value is {
        name: string
        source: string
        summary: string
      } => value !== null,
    )
}
