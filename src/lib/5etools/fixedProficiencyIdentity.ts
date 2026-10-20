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
    const qualified =
      owner.length === 2
        ? rule.kind === 'proficient-tools' &&
          DIRECT_FIXED_CLASS_CERTIFICATES.some(
            (row) =>
              JSON.stringify(row.owner) === JSON.stringify(owner) &&
              row.target === target &&
              row.level === level,
          )
        : rule.kind !== 'proficient-tools' &&
          getSubclassProficiencyRootCertificate(owner)?.paths.some(
            (path) => path.target === target && path.level === level,
          )
    const relation = { owner: owner as FixedProficiencyOwner, target, level }
    return qualified && getFixedProficiencyId(relation) === id ? relation : undefined
  } catch {
    return undefined
  }
}
