import { LEGACY_SUBCLASS_PREREQUISITE_FIXUPS } from '@/lib/5etools/rulesetMetadata'
import type { Class5e, ClassFeature } from '@/types/5etools'

export interface VariantRuleContentAvailability {
  optionalClassFeatures: boolean
  anyRaceSubclasses: boolean
  preferNewerPrintings: boolean
}

interface VariantRuleContent {
  classes: readonly Class5e[]
  classFeatures: readonly ClassFeature[]
  optionalFeatures: readonly unknown[]
  preferNewerPrintingsAvailable?: boolean
}

function isClassFeatureVariant(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const feature = value as { isClassFeatureVariant?: unknown; name?: unknown }
  return (
    feature.isClassFeatureVariant === true ||
    (typeof feature.name === 'string' && feature.name.startsWith('Optional Rule:'))
  )
}

function hasRestrictedSubclass(classes: readonly Class5e[]): boolean {
  const restrictions = LEGACY_SUBCLASS_PREREQUISITE_FIXUPS as Readonly<
    Record<string, { allowedRaceKeyword: string }>
  >

  return classes.some((classEntity) =>
    classEntity.subclasses?.some((subclass) => {
      const key = `${subclass.className || classEntity.name}|${subclass.classSource || classEntity.source}|${subclass.shortName}|${subclass.source}`
      return key in restrictions
    }),
  )
}

function hasNormalizedFeatureVariant(classes: readonly Class5e[]): boolean {
  return classes.some(
    (classEntity) =>
      classEntity.normalizedRules?.choices.some((choice) => choice.featureVariant !== undefined) ||
      classEntity.normalizedRules?.choiceDiagnostics.some(
        (diagnostic) => diagnostic.featureVariant !== undefined,
      ) ||
      classEntity.subclasses?.some(
        (subclass) =>
          subclass.normalizedRules?.choices.some((choice) => choice.featureVariant !== undefined) ||
          subclass.normalizedRules?.choiceDiagnostics.some(
            (diagnostic) => diagnostic.featureVariant !== undefined,
          ),
      ),
  )
}

export function getVariantRuleContentAvailability({
  classes,
  classFeatures,
  optionalFeatures,
  preferNewerPrintingsAvailable = false,
}: VariantRuleContent): VariantRuleContentAvailability {
  return {
    optionalClassFeatures:
      classFeatures.some(isClassFeatureVariant) ||
      optionalFeatures.some(isClassFeatureVariant) ||
      hasNormalizedFeatureVariant(classes),
    anyRaceSubclasses: hasRestrictedSubclass(classes),
    preferNewerPrintings: preferNewerPrintingsAvailable,
  }
}
