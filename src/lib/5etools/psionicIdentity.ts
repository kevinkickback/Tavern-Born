import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'

export type PsionicPool = 'talent' | 'discipline' | 'bonus-discipline'
export const PSIONIC_CLASS_SOURCE = 'UATheMysticClass'
export const PSIONIC_ROOT_REF = 'Psionics|Mystic|UATheMysticClass|1|UATheMysticClass'
export const PSIONIC_ROOT_TARGET = getClassFeatureIdentity(
  decodeClassFeatureReference(PSIONIC_ROOT_REF),
)!
export const PSIONIC_ORDERS = [
  'Avatar',
  'Awakened',
  'Immortal',
  'Nomad',
  'Soul Knife',
  'Wu Jen',
] as const
export function psionicBonusRef(order: string): string {
  return `Bonus Disciplines|Mystic|${PSIONIC_CLASS_SOURCE}|${order}|${PSIONIC_CLASS_SOURCE}|1|${PSIONIC_CLASS_SOURCE}`
}
const part = (s: string | undefined) => s?.trim().toLowerCase() ?? ''
export function getPsionicChoiceId(
  owner: NormalizedCharacterChoice['owner'],
  pool: PsionicPool,
): string {
  const target =
    pool === 'bonus-discipline'
      ? getSubclassFeatureIdentity(
          decodeSubclassFeatureReference(
            psionicBonusRef(
              PSIONIC_ORDERS.find((o) => part(`Order of the ${o}`) === part(owner.subclassName)) ??
                '',
            ),
          ),
        )
      : PSIONIC_ROOT_TARGET
  if (!target) throw new RangeError('A psionic choice requires an exact declaring target.')
  return `psionic-choice:${encodeURIComponent(JSON.stringify([[part(owner.name), part(owner.source), part(owner.subclassName), part(owner.subclassSource)], target, pool, 1]))}`
}
export function decodePsionicChoiceId(
  id: string,
): { owner: string[]; target: string; pool: PsionicPool } | undefined {
  if (!id.startsWith('psionic-choice:')) return undefined
  try {
    const row: unknown = JSON.parse(decodeURIComponent(id.slice('psionic-choice:'.length)))
    if (!Array.isArray(row) || row.length !== 4) return undefined
    const [owner, target, pool, level] = row
    if (
      !Array.isArray(owner) ||
      owner.length !== 4 ||
      owner.some((p) => typeof p !== 'string') ||
      level !== 1 ||
      !['talent', 'discipline', 'bonus-discipline'].includes(pool)
    )
      return undefined
    const tuple = {
      type: owner[2] ? ('subclass' as const) : ('class' as const),
      name: owner[0],
      source: owner[1],
      ...(owner[2] ? { subclassName: owner[2], subclassSource: owner[3] } : {}),
    }
    if (part(tuple.name) !== 'mystic' || part(tuple.source) !== part(PSIONIC_CLASS_SOURCE))
      return undefined
    if (
      pool === 'bonus-discipline'
        ? !PSIONIC_ORDERS.some(
            (o) =>
              o !== 'Soul Knife' &&
              part(`Order of the ${o}`) === owner[2] &&
              owner[3] === part(PSIONIC_CLASS_SOURCE),
          )
        : owner[2] !== '' || owner[3] !== ''
    )
      return undefined
    return getPsionicChoiceId(tuple, pool) === id ? { owner, target, pool } : undefined
  } catch {
    return undefined
  }
}
