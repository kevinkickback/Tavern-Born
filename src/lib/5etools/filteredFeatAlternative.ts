import type { ClassFeatureReference } from '@/types/5etools'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'

const introduction =
  'You gain a {@filter Fighting Style feat|feats|category=FS} of your choice. Instead of choosing one of those feats, you can choose the option below.'
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
const only = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value)

/**
 * Version1 XPHB prose-only relationship: a sole explicit refFeat replaces the filtered pick,
 * never adds a second quota. Keep the exact declared UID dynamic, including for new producers.
 * Source: pinned b9061583 class Paladin/Ranger Fighting Style. Other shapes are diagnostic.
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
  const nested = wrapper && Array.isArray(wrapper.entries) ? object(wrapper.entries[0]) : undefined
  if (
    owner.type !== 'class' ||
    ref.source?.trim().toLowerCase() !== 'xphb' ||
    ref.classSource?.trim().toLowerCase() !== 'xphb' ||
    ref.feature?.source?.trim().toLowerCase() !== 'xphb' ||
    ref.feature?.classSource?.trim().toLowerCase() !== 'xphb' ||
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
    entries[0] !== introduction ||
    !wrapper ||
    !only(wrapper, ['type', 'entries']) ||
    wrapper.type !== 'entries' ||
    !Array.isArray(wrapper.entries) ||
    wrapper.entries.length !== 1 ||
    !nested ||
    !only(nested, ['type', 'feat']) ||
    nested.type !== 'refFeat' ||
    typeof nested.feat !== 'string'
  )
    return { present: true }
  const parts = nested.feat.split('|')
  if (parts.length !== 2 || parts.some((part) => !part.trim() || /[{}#]/u.test(part)))
    return { present: true }
  return {
    present: true,
    option: {
      entityType: 'feat',
      name: parts[0].trim(),
      source: parts[1].trim(),
    } as NormalizedChoiceOptionReference,
  }
}
