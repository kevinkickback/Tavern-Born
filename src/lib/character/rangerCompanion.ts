import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import { getCurrentRangerFeatures } from '@/lib/5etools/rangerFeatureSource'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'

/** A Drakewarden has a declared companion stat block. Its essence is chosen each time it is summoned. */
export function getRangerCompanion(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const current = getCurrentRangerFeatures(character, catalogs)
  const specialization = current?.specialization
  if (!current || specialization?.subclass.shortName !== 'Drakewarden') return undefined
  const feature = specialization.earned('Drake Companion')
  const references = feature?.entries.flatMap((entry) =>
    typeof entry === 'string'
      ? [
          ...entry.matchAll(
            /See its game statistics in the accompanying \{@creature ([^{}|]+)\|([^{}|]+)\} stat block/g,
          ),
        ]
      : [],
  )
  if (references?.length !== 1) return undefined
  const [, name, source] = references[0]
  if (norm(source) !== norm(feature?.source)) return undefined
  const creatures = catalogs?.creatures?.filter(
    (creature) => norm(creature.name) === norm(name) && norm(creature.source) === norm(source),
  )
  if (creatures?.length !== 1) return undefined
  const [base] = creatures
  const bond = specialization.earned('Bond of Fang and Scale')
  const perfected = specialization.earned('Perfected Bond')
  const items = (entries: readonly unknown[] | undefined) =>
    (entries ?? [])
      .map(record)
      .flatMap((entry) =>
        entry.type === 'list' && Array.isArray(entry.items) ? entry.items.map(record) : [],
      )
  const medium = items(bond?.entries).some(
    (item) =>
      item.name === 'Drake Mount' &&
      Array.isArray(item.entries) &&
      item.entries.some(
        (entry) => typeof entry === 'string' && entry.startsWith('The drake grows to Medium size.'),
      ),
  )
  const large =
    medium &&
    items(perfected?.entries).some(
      (item) =>
        item.name === 'Large Drake' &&
        Array.isArray(item.entries) &&
        item.entries.some(
          (entry) =>
            typeof entry === 'string' && entry.startsWith('The drake grows to Large size.'),
        ),
    )
  const fly =
    typeof base.speed?.walk === 'number' &&
    bond?.entries.some(
      (entry) =>
        typeof entry === 'string' &&
        entry.endsWith(
          'When you summon your drake, it grows wings on its back and gains a flying speed equal to its walking speed.',
        ),
    )
  return {
    name: base.name,
    source: base.source,
    className: current.owner.name,
    classSource: current.owner.source,
    creature: {
      ...base,
      ...(medium && { size: [large ? 'L' : 'M'] }),
      ...(fly && { speed: { ...base.speed, fly: base.speed?.walk } }),
    },
  }
}
