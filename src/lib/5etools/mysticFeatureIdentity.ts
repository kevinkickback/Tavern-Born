import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { PSIONIC_CLASS_SOURCE } from './psionicIdentity'

export const ARCANE_DABBLER = 'Arcane Dabbler'

export const mysticLimitedSubclassUses = {
  Awakened: ['Psionic Investigation', 'Spectral Form'],
  Nomad: ['Memory of One Thousand Steps'],
} as const

function getMysticSubclassTarget(name: string, order: string, level: number) {
  return getSubclassFeatureIdentity({
    name,
    className: 'Mystic',
    classSource: PSIONIC_CLASS_SOURCE,
    subclassShortName: order,
    subclassSource: PSIONIC_CLASS_SOURCE,
    source: PSIONIC_CLASS_SOURCE,
    level,
  })
}

export const getArcaneDabblerTarget = (level: number) =>
  getMysticSubclassTarget(ARCANE_DABBLER, 'Wu Jen', level)

export function isArcaneDabblerDeclaration(value: unknown) {
  if (typeof value !== 'string') return false
  const segments = value.split('|').length
  if (segments !== 6 && segments !== 7) return false
  const declaration = decodeSubclassFeatureReference(value)
  const { level } = declaration
  return (
    !!level &&
    level >= 1 &&
    level <= 20 &&
    getSubclassFeatureIdentity(declaration) === getArcaneDabblerTarget(level)
  )
}

export function isDirectMysticFeatureTarget(target: string | undefined) {
  if (!target) return false
  const level = Number(target.split('|')[6])
  if (!Number.isInteger(level) || level < 1 || level > 20) return false
  return (
    target === getArcaneDabblerTarget(level) ||
    target === getMysticSubclassTarget('Immortal Durability', 'Immortal', level) ||
    Object.entries(mysticLimitedSubclassUses).some(([order, features]) =>
      features.some((feature) => target === getMysticSubclassTarget(feature, order, level)),
    )
  )
}
