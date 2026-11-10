import type { ClassFeatureReference } from '@/types/5etools'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'

const introduction =
  'You gain a {@filter Fighting Style feat|feats|category=FS} of your choice. Instead of choosing one of those feats, you can choose the option below.'
const alternativeText = 'the \\{@feat [^{}|#]+\\|[^{}|#]+\\} option(?: in the \\{@book [^{}]+\\})?'
const listedAlternatives = new RegExp(
  `^As an? ([^,]+), you can choose a \\{@filter Fighting Style feat\\|feats\\|category=FS\\}(?:, ${alternativeText})*, or ${alternativeText} below\\.$`,
)
const norm = (value?: string) => value?.trim().toLowerCase()
export const namesFilteredFeatAlternatives = (entry: unknown) =>
  typeof entry === 'string' && listedAlternatives.test(entry)
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
const only = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value)

/**
 * A filtered pick and the qualified alternatives share one quota. The exact
 * linked feat records must corroborate any alternatives enumerated in the prose.
 */
export function getFilteredFeatAlternative(
  ref: ClassFeatureReference,
  owner: NormalizedCharacterChoice['owner'],
  filter: NormalizedChoiceOptionReference['entityType'],
  categories: string[] | undefined,
  count: number,
) {
  const entries = ref.feature?.entries
  const hasReference = (value: unknown, depth = 0): boolean => {
    if (depth > 12 || !value || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some((row) => hasReference(row, depth + 1))
    const row = value as Record<string, unknown>
    return row.type === 'refFeat' || hasReference(row.entries, depth + 1)
  }
  if (filter !== 'feat' || !hasReference(entries)) return { present: false }
  const wrapper = Array.isArray(entries) ? object(entries[1]) : undefined
  const text = Array.isArray(entries) && typeof entries[0] === 'string' ? entries[0] : ''
  const listed = listedAlternatives.exec(text)
  const implicit =
    text === introduction && norm(ref.source) === 'xphb' && norm(ref.classSource) === 'xphb'
  if (
    owner.type !== 'class' ||
    (!implicit &&
      (!listed ||
        norm(listed[1]) !== norm(ref.className) ||
        norm(ref.className) !== norm(owner.name) ||
        norm(ref.classSource) !== norm(owner.source))) ||
    !ref.ref ||
    getClassFeatureIdentity(decodeClassFeatureReference(ref.ref)) !==
      getClassFeatureIdentity(ref) ||
    !ref.feature ||
    getClassFeatureIdentity(ref.feature) !== getClassFeatureIdentity(ref) ||
    count !== 1 ||
    categories?.length !== 1 ||
    categories[0] !== 'FS' ||
    !Array.isArray(entries) ||
    entries.length !== 2 ||
    !wrapper ||
    !only(wrapper, ['type', 'entries']) ||
    wrapper.type !== 'entries' ||
    !Array.isArray(wrapper.entries) ||
    !wrapper.entries.length ||
    (implicit && wrapper.entries.length !== 1)
  )
    return { present: true }
  const options: NormalizedChoiceOptionReference[] = []
  const refs: string[] = []
  for (const item of wrapper.entries) {
    const nested = object(item)
    if (
      !nested ||
      !only(nested, ['type', 'feat']) ||
      nested.type !== 'refFeat' ||
      typeof nested.feat !== 'string'
    )
      return { present: true }
    const parts = nested.feat.split('|').map((part) => part.trim())
    if (parts.length !== 2 || parts.some((part) => !part || /[{}#]/u.test(part)))
      return { present: true }
    refs.push(parts.join('|').toLowerCase())
    options.push({ entityType: 'feat', name: parts[0], source: parts[1] })
  }
  if (
    new Set(refs).size !== refs.length ||
    (listed &&
      JSON.stringify(refs) !==
        JSON.stringify(
          [...text.matchAll(/\{@feat ([^{}]+)\}/g)].map((match) =>
            match[1].split('|').map(norm).join('|'),
          ),
        ))
  )
    return { present: true }
  return { present: true, options }
}
