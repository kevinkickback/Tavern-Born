import { DIVINE_ORDER_OPTIONS } from './divineOrderIdentity'
import { DIRECT_FIXED_CLASS_CERTIFICATES, fixedProficiencyRule } from './fixedProficiencyRules'
import { getSubclassProficiencyRootCertificate } from './subclassProficiencyRegistry'

const PREFIX = 'feature-fixed-proficiencies:'
type FixedProficiencyOwner = [string, string] | [string, string, string, string]
export interface FixedProficiencyRelation {
  owner: FixedProficiencyOwner
  target: string
  level: number
}
export const isFixedProficiencyId = (id: string) => id.startsWith(PREFIX)
export const getFixedProficiencyId = ({ owner, target, level }: FixedProficiencyRelation) =>
  PREFIX + encodeURIComponent(JSON.stringify([owner, target, level]))

export const isProtectorProficiencyRelation = ({
  owner,
  target,
  level,
}: FixedProficiencyRelation) =>
  owner.length === 2 &&
  owner[0] === 'cleric' &&
  owner[1] === 'xphb' &&
  target === DIVINE_ORDER_OPTIONS.protector &&
  level === 1

export const isDirectFixedProficiencyRelation = ({
  owner,
  target,
  level,
}: FixedProficiencyRelation) =>
  DIRECT_FIXED_CLASS_CERTIFICATES.some(
    (row) =>
      owner.length === 2 &&
      row.owner[0] === owner[0] &&
      row.owner[1] === owner[1] &&
      row.target === target &&
      row.level === level,
  )

/** Offline identity is finite and independent of whether its source is currently enabled. */
export function decodeFixedProficiencyId(id: string): FixedProficiencyRelation | undefined {
  if (!isFixedProficiencyId(id)) return undefined
  try {
    const value: unknown = JSON.parse(decodeURIComponent(id.slice(PREFIX.length)))
    if (!Array.isArray(value) || value.length !== 3) return undefined
    const [owner, target, level] = value
    if (
      !Array.isArray(owner) ||
      ![2, 4].includes(owner.length) ||
      !owner.every(
        (part) => typeof part === 'string' && part.trim() && part === part.trim().toLowerCase(),
      ) ||
      typeof target !== 'string' ||
      !Number.isInteger(level)
    )
      return undefined
    const rule = fixedProficiencyRule(target)
    if (!rule || level < rule.level || level > 20) return undefined
    const relation = { owner: owner as FixedProficiencyOwner, target, level }
    const qualified =
      owner.length === 2
        ? isDirectFixedProficiencyRelation(relation) || isProtectorProficiencyRelation(relation)
        : getSubclassProficiencyRootCertificate(owner)?.paths.some(
            (path) => path.target === target && path.level === level,
          )
    return qualified && getFixedProficiencyId(relation) === id ? relation : undefined
  } catch {
    return undefined
  }
}
