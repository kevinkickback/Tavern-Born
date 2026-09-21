import { LEGACY_SUBCLASS_PREREQUISITE_FIXUPS } from '@/lib/5etools/rulesetMetadata'
import type { Class5e, ClassFeature } from '@/types/5etools'

export interface VariantRuleContentAvailability {
  optionalClassFeatures: boolean
  bladesingerAnyRace: boolean
  battleragerAnyRace: boolean
}

interface VariantRuleContent {
  classes: readonly Class5e[]
  classFeatures: readonly ClassFeature[]
  optionalFeatures: readonly unknown[]
}

type RestrictedSubclassRule = 'bladesingerAnyRace' | 'battleragerAnyRace'

function isClassFeatureVariant(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const feature = value as { isClassFeatureVariant?: unknown; name?: unknown }
  return (
    feature.isClassFeatureVariant === true ||
    (typeof feature.name === 'string' && feature.name.startsWith('Optional Rule:'))
  )
}

function hasRestrictedSubclass(classes: readonly Class5e[], rule: RestrictedSubclassRule): boolean {
  const restrictions = LEGACY_SUBCLASS_PREREQUISITE_FIXUPS as Readonly<
    Record<string, { variantOverride: RestrictedSubclassRule }>
  >

  return classes.some((classEntity) =>
    classEntity.subclasses?.some((subclass) => {
      const key = `${subclass.className || classEntity.name}|${subclass.classSource || classEntity.source}|${subclass.shortName}|${subclass.source}`
      return restrictions[key]?.variantOverride === rule
    }),
  )
}

export function getVariantRuleContentAvailability({
  classes,
  classFeatures,
  optionalFeatures,
}: VariantRuleContent): VariantRuleContentAvailability {
  return {
    optionalClassFeatures:
      classFeatures.some(isClassFeatureVariant) || optionalFeatures.some(isClassFeatureVariant),
    bladesingerAnyRace: hasRestrictedSubclass(classes, 'bladesingerAnyRace'),
    battleragerAnyRace: hasRestrictedSubclass(classes, 'battleragerAnyRace'),
  }
}
