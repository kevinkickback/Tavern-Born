import type { ZodTypeAny } from 'zod'
import { mapWithConcurrency } from '@/lib/async'
import { COMPANION_FAMILY_BOOK, parseCompanionFamilySources } from './companionFamilySource'
import { isMissingCatalogResource, type JsonResourceReader } from './resourceReader'
import {
  ActionDataSchema,
  BackgroundDataSchema,
  BookDataSchema,
  ConditionDataSchema,
  FeatDataSchema,
  GenericDataSchema,
  IndexSchema,
  ItemDataSchema,
  LanguageDataSchema,
  OptionalClassBookDataSchema,
  OptionalFeatureDataSchema,
  PsionicDataSchema,
  RaceDataSchema,
  TrapHazardDataSchema,
} from './schemas'

interface FileValidationConfig {
  name: string
  schema: ZodTypeAny
  optionalSupport?: boolean
  collections?: string[]
}

const CANDIDATE_FILES: FileValidationConfig[] = [
  {
    name: COMPANION_FAMILY_BOOK,
    schema: GenericDataSchema.refine((data) => parseCompanionFamilySources(data, 'WoW').length > 0),
    optionalSupport: true,
  },
  {
    name: 'book/book-tce.json',
    schema: OptionalClassBookDataSchema,
    optionalSupport: true,
  },
  { name: 'books.json', schema: BookDataSchema },
  { name: 'adventures.json', schema: GenericDataSchema, collections: ['adventure'] },
  { name: 'races.json', schema: RaceDataSchema, collections: ['race', 'subrace'] },
  { name: 'fluff-races.json', schema: GenericDataSchema, collections: ['raceFluff'] },
  { name: 'fluff-backgrounds.json', schema: GenericDataSchema, collections: ['backgroundFluff'] },
  { name: 'class/index.json', schema: IndexSchema },
  { name: 'backgrounds.json', schema: BackgroundDataSchema },
  { name: 'spells/index.json', schema: IndexSchema },
  { name: 'bestiary/index.json', schema: IndexSchema },
  { name: 'generated/gendata-spell-source-lookup.json', schema: GenericDataSchema },
  { name: 'feats.json', schema: FeatDataSchema },
  { name: 'items.json', schema: ItemDataSchema, collections: ['item', 'itemGroup'] },
  {
    name: 'items-base.json',
    schema: ItemDataSchema,
    collections: [
      'baseitem',
      'itemProperty',
      'itemType',
      'itemTypeAdditionalEntries',
      'itemEntry',
      'itemMastery',
    ],
  },
  { name: 'actions.json', schema: ActionDataSchema },
  { name: 'conditionsdiseases.json', schema: ConditionDataSchema },
  { name: 'deities.json', schema: GenericDataSchema, collections: ['deity'] },
  { name: 'skills.json', schema: GenericDataSchema, collections: ['skill'] },
  { name: 'senses.json', schema: GenericDataSchema, collections: ['sense'] },
  { name: 'languages.json', schema: LanguageDataSchema },
  {
    name: 'magicvariants.json',
    schema: GenericDataSchema,
    collections: ['magicvariant', 'variant'],
  },
  { name: 'optionalfeatures.json', schema: OptionalFeatureDataSchema },
  { name: 'psionics.json', schema: PsionicDataSchema },
  { name: 'variantrules.json', schema: GenericDataSchema, collections: ['variantrule'] },
  { name: 'trapshazards.json', schema: TrapHazardDataSchema },
  { name: 'rewards.json', schema: GenericDataSchema, collections: ['reward'] },
  { name: 'cultsboons.json', schema: GenericDataSchema, collections: ['cult', 'boon'] },
]

/** Inventory every attempt; confirmed reads are reused by the parser of the same candidate. */
export async function inspectCatalogResources(
  reader: JsonResourceReader,
  previous: readonly string[],
  signal: AbortSignal,
  unknownPriorInventory = false,
) {
  const reads = new Map<string, Promise<unknown>>()
  const readJson = (path: string) => {
    const pending = reads.get(path)
    if (pending) return pending
    const read = reader.readJson(path, signal)
    reads.set(path, read)
    return read
  }
  const rows = await mapWithConcurrency(CANDIDATE_FILES, 6, async (file) => {
    signal.throwIfAborted()
    const presentation = file.name.startsWith('fluff-')
    const previouslyAvailable = previous.includes(file.name)
    try {
      const data = await readJson(file.name)
      const valid =
        file.schema.safeParse(data).success &&
        (!file.collections ||
          (() => {
            const rows = data as Record<string, unknown>
            const declared = file.collections.filter((key) => key in rows)
            return declared.length > 0 && declared.every((key) => Array.isArray(rows[key]))
          })())
      return {
        file,
        admitted: valid || file.optionalSupport,
        warning: !valid ? `Incompatible ${file.name}` : undefined,
        unavailable: !valid && presentation,
        blocking:
          !valid &&
          !file.optionalSupport &&
          (!presentation || previouslyAvailable || unknownPriorInventory),
      }
    } catch (error) {
      signal.throwIfAborted()
      const detail = error instanceof Error ? error.message : String(error)
      if (isMissingCatalogResource(reader.type, error)) return { file, admitted: false }
      const optional =
        (presentation || file.optionalSupport) && !previouslyAvailable && !unknownPriorInventory
      return {
        file,
        admitted: false,
        warning: `Could not read ${file.name} — ${detail}`,
        unavailable: true,
        blocking: !optional,
      }
    }
  })
  const errors = rows.flatMap((row) => (row.blocking && row.warning ? [row.warning] : []))
  if (errors.length) throw new Error(errors.join('; '))
  const resources = rows.filter((row) => row.admitted).map((row) => row.file.name)
  if (!resources.length)
    throw new Error('No compatible game data files were found at this location.')
  return {
    resources,
    unavailable: rows.filter((row) => row.unavailable).map(({ file }) => file.name),
    warnings: rows.flatMap((row) => (row.warning ? [row.warning] : [])),
    reader: { type: reader.type, readJson },
  }
}
