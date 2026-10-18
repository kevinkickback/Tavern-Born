import type { NormalizedCharacterChoice } from '@/types/classRules'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'

export const STORM_ENVIRONMENTS = ['Desert', 'Sea', 'Tundra'] as const
export type StormEnvironment = (typeof STORM_ENVIRONMENTS)[number]
export const stormFeatureRef = (name: string, level: number) =>
  `${name}|Barbarian|PHB|Storm Herald|XGE|${level}|XGE`
export const stormTarget = (name: string, level: number) =>
  getSubclassFeatureIdentity(decodeSubclassFeatureReference(stormFeatureRef(name, level)))!
export const STORM_AURA_TARGET = stormTarget('Storm Aura', 3)
export const STORM_TARGETS = new Set([
  STORM_AURA_TARGET,
  stormTarget('Path of the Storm Herald', 3),
  stormTarget('Storm Soul', 6),
  stormTarget('Shielding Storm', 10),
  stormTarget('Raging Storm', 14),
  ...[3, 6, 14].flatMap((level) => STORM_ENVIRONMENTS.map((name) => stormTarget(name, level))),
])
const normalize = (value: string) => value.trim().toLowerCase()
export function getStormAuraChoiceId(
  owner: Pick<
    NormalizedCharacterChoice['owner'],
    'name' | 'source' | 'subclassName' | 'subclassSource'
  >,
  level: number,
): string {
  return `subclass-options:${encodeURIComponent(JSON.stringify([[owner.name, owner.source, owner.subclassName ?? '', owner.subclassSource ?? ''].map(normalize), STORM_AURA_TARGET, 'environment', level]))}`
}
export const isStormAuraChoiceId = (id: string) => id.startsWith('subclass-options:')
