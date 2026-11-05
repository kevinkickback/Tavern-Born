import { extractProficiencyBlockNames } from '@/lib/5etools/proficiencyBlockNames'
import { stripItemTag } from '@/lib/provenance/normalization'

export function extractFixedGrantNames(blocks: unknown[] | undefined): string[] {
  return extractProficiencyBlockNames(Array.isArray(blocks) ? blocks : [], {
    includeAnyStandard: false,
  })
    .filter((name) => !name.toLowerCase().startsWith('choose '))
    .map((name) => stripItemTag(name))
}
