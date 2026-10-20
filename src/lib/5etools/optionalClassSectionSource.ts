import type { GameData, OptionalClassSectionSource } from '@/types/5etools'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getCurrentOptionalClassDeclaration } from './optionalClassFeatureSource'
import { OPTIONAL_CLASS_SECTION_RULES } from './optionalClassSectionRules'
import { readOptionalClassSectionInput } from './optionalClassSectionStructure'

const digest = (value: unknown) => getFeatureSourceDigest([value], false)
const fields = new Set(['version', 'target', 'origin', 'input', 'diagnostic'])

/** Keep only the thirteen compact subtrees/context. Absence is an explicit exact-identity result. */
export function parseOptionalClassSections(
  book: unknown,
  books: unknown,
  origin: string,
): OptionalClassSectionSource[] {
  return OPTIONAL_CLASS_SECTION_RULES.sections.map((descriptor) => {
    const input = readOptionalClassSectionInput(book, books, descriptor.locator)
    return {
      version: 1,
      target: descriptor.target,
      origin,
      ...(input ? { input } : {}),
      ...(!input || digest(input) !== descriptor.digest
        ? { diagnostic: 'The current optional section or its parent context cannot be verified.' }
        : {}),
    }
  })
}

/** Later provided section identities replace earlier candidates; same-layer duplicates remain visible. */
export function mergeOptionalClassSections(
  layers: readonly Pick<GameData, 'optionalClassSections'>[],
): OptionalClassSectionSource[] {
  let result: OptionalClassSectionSource[] = []
  for (const layer of layers) {
    const incoming = (layer.optionalClassSections ?? []).filter(
      (row) => row && typeof row === 'object' && typeof row.target === 'string',
    )
    const targets = new Set(incoming.map((row) => row.target))
    result = [...result.filter((row) => !targets.has(row.target)), ...incoming]
  }
  return result
}

type SectionCatalog = NonNullable<Parameters<typeof getCurrentOptionalClassDeclaration>[0]> & {
  optionalClassSections?: readonly OptionalClassSectionSource[]
}
const cache = new WeakMap<SectionCatalog, Map<string, ReturnType<typeof resolveCurrentSection>>>()
function resolveCurrentSection(catalogs: SectionCatalog, target: string) {
  const descriptor = OPTIONAL_CLASS_SECTION_RULES.sections.find((row) => row.target === target)
  if (!descriptor) return undefined
  const found = (catalogs.optionalClassSections ?? []).filter((row) => row && row.target === target)
  if (found.length !== 1) return undefined
  const source = found[0]
  if (
    source.version !== 1 ||
    typeof source.origin !== 'string' ||
    !source.origin.trim() ||
    !source.input ||
    source.diagnostic ||
    Object.keys(source).some((field) => !fields.has(field)) ||
    digest(source.input) !== descriptor.digest
  )
    return undefined
  const grant = getCurrentOptionalClassDeclaration(
    catalogs,
    descriptor.owner,
    descriptor.grantingTarget,
  )
  if (
    !grant ||
    (descriptor.progression &&
      digest(
        grant.classData.optionalfeatureProgression?.filter(
          (row) => row.name === descriptor.progression!.name,
        ),
      ) !== digest([descriptor.progression]))
  )
    return undefined
  return { descriptor, source, grant }
}
/** Character-independent current authority; permission and explicit adoption belong to actor activity. */
export function getCurrentOptionalClassSection(
  catalogs: SectionCatalog | undefined,
  target: string,
) {
  if (!catalogs) return undefined
  let derived = cache.get(catalogs)
  if (!derived) {
    derived = new Map()
    cache.set(catalogs, derived)
  }
  if (!derived.has(target)) derived.set(target, resolveCurrentSection(catalogs, target))
  return derived.get(target)
}
