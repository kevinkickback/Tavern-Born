import { addChoicePlaceholder, addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { ChoiceRecord, ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { OriginSystem } from '@/types/character'

export const ORIGIN_2024_LANGUAGE_SOURCE = '2024 Origin Languages'
/**
 * FALLBACK: The 2024 XPHB origin system grants one base language (Common) plus
 * ORIGIN_2024_LANGUAGE_CHOICE_COUNT additional choices. 5etools does not encode
 * this in any JSON file (XPHB races and backgrounds both have null
 * languageProficiencies; data/charcreationoptions.json contains no language grant
 * data). This constant is a necessary hardcode with no JSON replacement available.
 * If the base language ever changes in a future printing, update here.
 */
export const ORIGIN_2024_BASE_LANGUAGE = 'Common'
export const ORIGIN_2024_LANGUAGE_CHOICE_ID = 'origin:2024:languages'
/**
 * FALLBACK: The number of additional language choices granted by the 2024 origin
 * system. 5etools does not encode this value in any data file. Update here if
 * the rules change in a future printing.
 */
export const ORIGIN_2024_LANGUAGE_CHOICE_COUNT = 2

function makeOriginLanguageTag(grantType: SourceTag['grantType']): SourceTag {
  return makeSourceTag('manual', ORIGIN_2024_LANGUAGE_SOURCE, grantType)
}

function buildOriginLanguageChoice(): ChoiceRecord {
  return {
    id: ORIGIN_2024_LANGUAGE_CHOICE_ID,
    domain: 'languages',
    sourceTag: makeOriginLanguageTag('placeholder'),
    chooseCount: ORIGIN_2024_LANGUAGE_CHOICE_COUNT,
    optionPool: [],
    selected: [],
    status: 'pending',
  }
}

export function is2024OriginLanguageTag(tag: {
  sourceType?: string
  sourceName?: string
}): boolean {
  return tag.sourceType === 'manual' && tag.sourceName === ORIGIN_2024_LANGUAGE_SOURCE
}

export function count2024OriginLanguageChoiceUnits(
  choices: Array<{
    domain: string
    chooseCount: number
    sourceTag: { sourceType?: string; sourceName?: string }
  }>,
): number {
  return choices
    .filter((choice) => choice.domain === 'languages' && is2024OriginLanguageTag(choice.sourceTag))
    .reduce((total, choice) => total + choice.chooseCount, 0)
}

export function ensureOriginLanguageBaseline(
  ledger: ProvenanceLedger,
  originSystem: OriginSystem,
): ProvenanceLedger {
  if (originSystem !== '2024') return ledger

  let result = ledger
  result = addGrant(result, 'languages', ORIGIN_2024_BASE_LANGUAGE, makeOriginLanguageTag('fixed'))
  result = addChoicePlaceholder(result, buildOriginLanguageChoice())
  return result
}
