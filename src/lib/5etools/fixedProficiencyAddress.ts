export const FIXED_PROFICIENCY_PREFIX = 'feature-fixed-proficiencies:'

type FixedProficiencyOwner = [string, string] | [string, string, string, string]
export interface FixedProficiencyRelation {
  owner: FixedProficiencyOwner
  target: string
  level: number
}

export const getFixedProficiencyId = ({ owner, target, level }: FixedProficiencyRelation) =>
  FIXED_PROFICIENCY_PREFIX + encodeURIComponent(JSON.stringify([owner, target, level]))
