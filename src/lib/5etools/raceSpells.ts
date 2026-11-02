import type { RaceAdditionalSpells } from '@/types/5etools'
import { parseAdditionalSpellBlocks, parseAdditionalSpellFilter } from './additionalSpells'

export type { ParsedAdditionalSpellBlock as ParsedRaceSpellBlock } from './additionalSpells'

/** Race-specific legacy filter convention; other actors require an explicit level. */
export const parseChooseFilter = (filter: string) => parseAdditionalSpellFilter(filter, 0)

/** Race actors interpret multiple blocks as alternative suites. */
export const parseRaceSpellBlocks = (blocks: RaceAdditionalSpells[] | undefined) =>
  parseAdditionalSpellBlocks(blocks, { filterLevelDefault: 0 })

export const parseRaceSpells = (blocks: RaceAdditionalSpells[] | undefined) =>
  parseRaceSpellBlocks(blocks).flatMap((block) => block.grants)
