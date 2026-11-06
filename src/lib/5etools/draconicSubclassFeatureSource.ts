export {
  findNativeSubclass as findNativeDraconicSubclass,
  getDirectSubclassFeatureReference as getDirectDraconicFeatureReference,
} from './nativeSubclassFeatureSource'

export const NATIVE_DRACONIC_SUBCLASSES = {
  phb: {
    className: 'Sorcerer',
    shortName: 'draconic',
    name: 'Draconic Bloodline',
    source: 'phb',
    wings: 'subclass-feature|dragon wings|sorcerer|phb|draconic|phb|14|phb',
    presence: 'subclass-feature|draconic presence|sorcerer|phb|draconic|phb|18|phb',
  },
  xphb: {
    className: 'Sorcerer',
    shortName: 'draconic',
    name: 'Draconic Sorcery',
    source: 'xphb',
    wings: 'subclass-feature|dragon wings|sorcerer|xphb|draconic|xphb|14|xphb',
    companion: 'subclass-feature|dragon companion|sorcerer|xphb|draconic|xphb|18|xphb',
  },
} as const

export function getNativeDraconicFeatureOwner(target: string | undefined) {
  const { phb, xphb } = NATIVE_DRACONIC_SUBCLASSES
  if (target === phb.wings || target === phb.presence) return phb
  if (target === xphb.wings || target === xphb.companion) return xphb
}
