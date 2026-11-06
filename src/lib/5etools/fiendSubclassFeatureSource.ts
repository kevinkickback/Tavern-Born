import type { NativeSubclassOwner } from './nativeSubclassFeatureSource'

function fiendFeatureTarget(name: string, level: number, source: string) {
  return `subclass-feature|${name.toLowerCase()}|warlock|${source}|fiend|${source}|${level}|${source}`
}

function fiend(name: string, source: 'phb' | 'xphb', level: number) {
  return {
    className: 'Warlock',
    name,
    source,
    shortName: 'fiend',
    level,
    intro: fiendFeatureTarget(name, level, source),
    blessing: fiendFeatureTarget("Dark One's Blessing", level, source),
    direct: (
      [
        ["Dark One's Own Luck", 6],
        ['Fiendish Resilience', 10],
        ['Hurl Through Hell', 14],
      ] as const
    ).map(([name, gain]) => ({
      level: gain,
      target: fiendFeatureTarget(name, gain, source),
    })),
  } satisfies NativeSubclassOwner & {
    level: number
    intro: string
    blessing: string
    direct: Array<{ level: number; target: string }>
  }
}

export const NATIVE_FIEND_SUBCLASSES = {
  phb: fiend('The Fiend', 'phb', 1),
  xphb: fiend('Fiend Patron', 'xphb', 3),
}

const featureOwners = new Map(
  Object.values(NATIVE_FIEND_SUBCLASSES).flatMap((owner) =>
    [owner.intro, owner.blessing, ...owner.direct.map(({ target }) => target)].map(
      (target) => [target, owner] as const,
    ),
  ),
)

export function getNativeFiendFeatureOwner(target: string | undefined) {
  return target ? featureOwners.get(target) : undefined
}
