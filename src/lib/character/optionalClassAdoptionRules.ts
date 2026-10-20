import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import {
  OPTIONAL_NATIVE_POOLS,
  OPTIONAL_NATIVE_ROOTS,
  type OptionalNativeAdoptionRoot,
} from '@/lib/5etools/optionalClassNativeRules'
import { OPTIONAL_CLASS_SECTION_RULES } from '@/lib/5etools/optionalClassSectionRules'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

// Spell-list sections are enabled with the managed spell-intent boundary, not by option-pool work.
const OPTIONAL_CLASS_POOL_SECTIONS = OPTIONAL_CLASS_SECTION_RULES.sections.filter(
  (row) => row.progression && row.members.every(([kind]) => kind === 'optionalFeature'),
)
export const OPTIONAL_CLASS_ADOPTION_ROOTS: readonly OptionalNativeAdoptionRoot[] = [
  ...OPTIONAL_CLASS_FEATURE_RULES.roots.map(
    (root) =>
      OPTIONAL_NATIVE_ROOTS.find(
        (row) =>
          row.target === root.target && JSON.stringify(row.owner) === JSON.stringify(root.owner),
      )!,
  ),
  ...OPTIONAL_CLASS_POOL_SECTIONS.map((row) => ({
    owner: row.owner,
    target: row.target,
    name: row.name,
    source: row.source,
    level: row.level,
    children: [],
    replaces: [],
    compatible: [],
  })),
  ...OPTIONAL_NATIVE_ROOTS.filter(
    (root) =>
      !OPTIONAL_CLASS_FEATURE_RULES.roots.some(
        (row) =>
          row.target === root.target && JSON.stringify(row.owner) === JSON.stringify(root.owner),
      ),
  ),
]

/** A section extends one existing actual class progression, without adding a slot. */
const sectionByChoice = new Map(
  OPTIONAL_CLASS_POOL_SECTIONS.map((row) => [
    getNormalizedClassChoiceId(
      { type: 'class', name: row.owner[1], source: row.owner[2] },
      row.progression!.name,
      row.level,
    ),
    row,
  ]),
)
const nativeByChoice = new Map(
  OPTIONAL_NATIVE_POOLS.map((pool) => [
    pool.choiceId,
    {
      ...pool,
      source: OPTIONAL_NATIVE_ROOTS.find(
        (root) =>
          root.target === pool.target && JSON.stringify(root.owner) === JSON.stringify(pool.owner),
      )!.source,
      members: pool.members.map((row) => [row.entityType, row.name, row.source] as const),
    },
  ]),
)
export function getOptionalClassPoolSection(choice: Pick<NormalizedCharacterChoice, 'id'>) {
  return sectionByChoice.get(choice.id) ?? nativeByChoice.get(choice.id)
}

export function getOptionalClassPoolSelectionSection(selection: CharacterClassChoiceSelection) {
  return sectionByChoice.get(selection.choiceId) ?? nativeByChoice.get(selection.choiceId)
}
