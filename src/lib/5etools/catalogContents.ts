const playerContent = {
  classes: ['class', 'classes'],
  subclass: ['subclass entry', 'subclass entries'],
  spells: ['spell', 'spells'],
  races: ['species', 'species'],
  subrace: ['subrace', 'subraces'],
  backgrounds: ['background', 'backgrounds'],
  feats: ['feat', 'feats'],
  items: ['item', 'items'],
  itemsBase: ['base item', 'base items'],
  creatures: ['creature stat block', 'creature stat blocks'],
  actions: ['action', 'actions'],
  conditions: ['condition or disease', 'conditions and diseases'],
  deities: ['deity', 'deities'],
  skills: ['skill', 'skills'],
  senses: ['sense', 'senses'],
  languages: ['language', 'languages'],
  optionalfeatures: ['optional feature', 'optional features'],
  variantrules: ['variant rule', 'variant rules'],
  trapHazards: ['trap or hazard', 'traps and hazards'],
  rewards: ['reward', 'rewards'],
  cultsBoons: ['cult or boon', 'cults and boons'],
  organizations: ['organization', 'organizations'],
  magicVariants: ['magic item variant', 'magic item variants'],
  psionics: ['psionic option', 'psionic options'],
} as const

const supportingContent = {
  classFeatures: ['class feature', 'class features'],
  'subclass feature': ['subclass feature', 'subclass features'],
  'optional class feature': ['optional class feature', 'optional class features'],
  'companion family': ['companion form', 'companion forms'],
  itemProperties: ['item property', 'item properties'],
  itemTypes: ['item type', 'item types'],
  itemMasteries: ['item mastery', 'item masteries'],
} as const

function suppliedSubraceCount({ race, subrace }: RawRaceData) {
  const identity = (...parts: unknown[]) =>
    parts.map((part) => (typeof part === 'string' ? part.trim().toLowerCase() : ''))
  const keys = subrace.map((entry) => {
    const child = asObject(entry)
    const copy = asObject(child._copy)
    return JSON.stringify(
      identity(
        child.raceName ?? copy.raceName,
        child.raceSource ?? copy.raceSource ?? child.source,
        child.name || 'Default',
        child.source,
      ),
    )
  })
  for (const entry of race) {
    const parent = asObject(entry)
    for (const value of asArray(parent.subraces)) {
      const child = asObject(value)
      keys.push(
        JSON.stringify(identity(parent.name, parent.source, child.name || 'Default', child.source)),
      )
    }
  }
  return new Set(keys).size
}

/** Describe the unique records in the additional layer, excluding the Included SRD. */
export function listCatalogContents(keys: readonly string[], suppliedRaces: RawRaceData) {
  const counts = new Map<string, number>()
  for (const key of keys) {
    const family = key.slice(0, key.indexOf(': '))
    counts.set(family, (counts.get(family) ?? 0) + 1)
  }
  // A supplied subrace can attach to an SRD species only when the layers are composed.
  counts.set('subrace', suppliedSubraceCount(suppliedRaces))
  const describe = (labels: Record<string, readonly [string, string]>) =>
    Object.entries(labels).flatMap(([family, [singular, plural]]) => {
      const count = counts.get(family)
      return count ? [`${count} ${count === 1 ? singular : plural}`] : []
    })
  return { primary: describe(playerContent), supporting: describe(supportingContent) }
}

export function describeCatalogContents(contents: readonly string[]) {
  if (contents.length > 4) return `${contents.slice(0, 4).join(', ')}, and more`
  if (contents.length < 2) return contents[0]
  return `${contents.slice(0, -1).join(', ')} and ${contents[contents.length - 1]}`
}

import type { RawRaceData } from './dataLoader'
import { asArray, asObject } from './parsers/shared'
