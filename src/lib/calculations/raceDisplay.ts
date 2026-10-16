import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character, SpellProfile } from '@/types/character'

export type RaceDisplaySelection = Pick<Character, 'race' | 'subrace' | 'subraceSource'>

type RacialDisplaySource =
  | { kind: string; name: string; source?: string }
  | Pick<SourceTag, 'sourceType' | 'sourceName' | 'sourceRef'>

/** Presentation only: never use these labels as selection values or owner identities. */
export function getSubraceDisplayName(parentName: string, subraceName: string): string {
  const parent = parentName.trim()
  const child = subraceName.trim()
  if (!parent || child.slice(0, parent.length).toLowerCase() !== parent.toLowerCase()) return child

  let suffix = child.slice(parent.length).trim()
  if (suffix.startsWith('(')) {
    let depth = 0
    let close = -1
    for (let i = 0; i < suffix.length; i++) {
      if (suffix[i] === '(') depth++
      if (suffix[i] === ')' && --depth === 0) {
        close = i
        break
      }
    }
    if (close < 0) return child
    const tail = suffix.slice(close + 1).trim()
    if (tail && !tail.startsWith(';')) return child
    suffix = suffix.slice(1, close) + tail
  } else if (suffix.startsWith(';')) {
    suffix = suffix.slice(1)
  } else {
    return child
  }

  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < suffix.length; i++) {
    if (suffix[i] === '(') depth++
    if (suffix[i] === ')' && --depth < 0) return child
    if (suffix[i] === ';' && depth === 0) {
      parts.push(suffix.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(suffix.slice(start).trim())
  return depth === 0 && parts.every(Boolean) ? parts.join(': ') : child
}

/** Retain parent context for summaries that do not show a separate race heading. */
export function getRaceDisplayName(parentName: string, subraceName?: string): string {
  if (!subraceName) return parentName
  if (!parentName) return subraceName
  return `${parentName} (${getSubraceDisplayName(parentName, subraceName)})`
}

/** Derived racial sources may call a child owner "race"; match its complete saved printing. */
export function getRacialSourceDisplayName(
  selection: RaceDisplaySelection | null | undefined,
  source: RacialDisplaySource,
): string {
  const [kind, name, book] =
    'sourceType' in source
      ? ([source.sourceType, source.sourceName, source.sourceRef] as const)
      : ([source.kind, source.name, source.source] as const)
  if (
    !selection ||
    !normalizeOwnerIdentity(selection.race) ||
    !normalizeOwnerIdentity(selection.subrace) ||
    !normalizeOwnerIdentity(selection.subraceSource) ||
    (kind !== 'race' && kind !== 'subrace') ||
    normalizeOwnerIdentity(name) !== normalizeOwnerIdentity(selection.subrace) ||
    normalizeOwnerIdentity(book) !== normalizeOwnerIdentity(selection.subraceSource)
  )
    return name
  return getRaceDisplayName(selection.race, name)
}

export function getSpellProfileDisplayLabel(profile: {
  label: string
  racial?: SpellProfile['racial']
}): string {
  const state = profile.racial
  if (!state) return profile.label
  return getRaceDisplayName(
    state.context.parent.name,
    state.ownerType === 'subrace' ? state.context.child?.name : undefined,
  )
}
