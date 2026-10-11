import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import type { CharacterAction } from '@/types/actions'

/** Canonical issued IDs; callers admit legacy label keys only for one active target. */
export function getFeatureActionIdIdentity(id: string): string | undefined {
  const separator = id.indexOf(':')
  const kind = id.slice(0, separator)
  if (kind !== 'class-feature' && kind !== 'subclass-feature') return undefined
  try {
    const uid = decodeURIComponent(id.slice(separator + 1))
    const parts = uid.split('|').map((part) => part.trim().toLowerCase())
    if (parts.length === 2 && parts[0]) return `legacy:${kind}|${parts.join('|')}`
    return kind === 'class-feature'
      ? getClassFeatureIdentity(decodeClassFeatureReference(uid))
      : getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))
  } catch {
    return undefined
  }
}

export function matchesCharacterActionId(action: CharacterAction, id: string): boolean {
  if (action.id === id || action.idAliases?.includes(id)) return true
  const identity = getFeatureActionIdIdentity(id)
  return !!identity && !!action.featureIdentities?.includes(identity)
}
