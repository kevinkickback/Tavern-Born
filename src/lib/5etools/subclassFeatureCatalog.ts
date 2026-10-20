import type { GameData, SubclassFeature } from '@/types/5etools'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'

/** Shared source-layer traversal; later complete targets replace earlier parsed mirrors. */
export function collectLayerSubclassFeatures(
  layers: readonly Pick<GameData, 'classes'>[],
): Map<string, SubclassFeature> {
  const features = new Map<string, SubclassFeature>()
  const traversedObjects = new WeakSet<object>()

  const visit = (feature: SubclassFeature | undefined) => {
    if (!feature) return
    const identity = getSubclassFeatureIdentity(feature)
    if (identity) features.set(identity, feature)

    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(walk)
        return
      }
      if (!value || typeof value !== 'object') return
      if (traversedObjects.has(value)) return
      traversedObjects.add(value)
      const record = value as Record<string, unknown>
      if (record.type === 'refSubclassFeature' && record.feature) {
        visit(record.feature as SubclassFeature)
      }
      for (const [key, nested] of Object.entries(record)) {
        if (key !== 'feature') walk(nested)
      }
    }

    walk(feature.entries)
  }

  for (const layer of layers) {
    for (const classData of layer.classes) {
      for (const subclass of classData.subclasses ?? []) {
        for (const reference of subclass.subclassFeatureRefs ?? []) {
          visit(reference.feature)
        }
        for (const feature of subclass.subclassFeatures ?? []) {
          if (typeof feature === 'object') visit(feature)
        }
        for (const group of subclass.levelFeatures ?? []) {
          for (const feature of group.features) visit(feature)
        }
      }
    }
  }
  return features
}
