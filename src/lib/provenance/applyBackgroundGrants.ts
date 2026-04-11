import {
  buildItemLookup,
  resolveBackgroundStartingEquipment,
} from '@/lib/5etools/startingEquipment'
import { addChoicePlaceholder, addGrant } from './ledger'
import { normalizeGenericToolChoice, normalizeKey } from './normalization'
import { makeSourceTag } from './sourceLabels'
import type { ChoiceRecord, ProvenanceLedger } from './types'

type ProfBlock = Record<string, boolean | { choose?: { from: string[]; count: number } } | number>

function toProfBlocks(blocks: unknown[] | undefined): ProfBlock[] {
  return (blocks ?? []).filter(
    (block): block is ProfBlock =>
      typeof block === 'object' && block !== null && !Array.isArray(block),
  )
}

function applyProfBlocks(
  ledger: ProvenanceLedger,
  domain: 'skills' | 'languages' | 'tools',
  blocks: ProfBlock[],
  tag: import('./types').SourceTag,
  choiceIdPrefix: string,
): ProvenanceLedger {
  let result = ledger
  let choiceIndex = 0
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose' || key === 'anyStandard') continue
      if (domain === 'tools') {
        const generic = normalizeGenericToolChoice(key)
        if (generic) {
          if (val === true || (typeof val === 'number' && val > 0)) {
            const choiceRecord: ChoiceRecord = {
              id: `${choiceIdPrefix}:${domain}:generic:${choiceIndex}`,
              domain,
              sourceTag: { ...tag, grantType: 'placeholder' },
              chooseCount: typeof val === 'number' && val > 0 ? val : 1,
              optionPool: [generic],
              selected: [],
              status: 'pending',
            }
            result = addChoicePlaceholder(result, choiceRecord)
            choiceIndex++
            continue
          }
        }
      }
      if (val === true) {
        result = addGrant(result, domain, key, tag)
      }
    }
    const anyStandard = (block as { anyStandard?: number }).anyStandard
    if (anyStandard) {
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:any:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: anyStandard,
        optionPool: [],
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
    }
    const choose = (block as { choose?: { from?: string[]; count?: number } }).choose
    if (choose) {
      const normalizedPool =
        domain === 'tools'
          ? (choose.from ?? []).map((entry) => normalizeGenericToolChoice(entry) ?? entry)
          : (choose.from ?? [])
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:choose:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: choose.count ?? 1,
        optionPool: normalizedPool,
        selected: [],
        status: 'pending',
      }
      result = addChoicePlaceholder(result, choiceRecord)
      choiceIndex++
    }
  }
  return result
}

/**
 * Apply proficiency grants from a background to the ledger.
 * Handles fixed and choice-based skill, language, and tool proficiencies.
 */
export function applyBackgroundGrants(
  bg: {
    name: string
    source?: string
    startingEquipment?: unknown
    skillProficiencies?: unknown[]
    languageProficiencies?: unknown[]
    toolProficiencies?: unknown[]
  },
  ledger: ProvenanceLedger,
): ProvenanceLedger {
  let result = ledger
  const bgTag = makeSourceTag('background', bg.name, 'fixed', bg.source)
  const prefix = `background:${normalizeKey(bg.name)}`

  result = applyProfBlocks(result, 'skills', toProfBlocks(bg.skillProficiencies), bgTag, prefix)
  result = applyProfBlocks(
    result,
    'languages',
    toProfBlocks(bg.languageProficiencies),
    bgTag,
    prefix,
  )
  result = applyProfBlocks(result, 'tools', toProfBlocks(bg.toolProficiencies), bgTag, prefix)

  // Starting equipment defaults (choice option A from each block).
  for (const item of resolveBackgroundStartingEquipment(
    bg.startingEquipment,
    buildItemLookup([]),
  )) {
    result = addGrant(result, 'equipment', item.name, bgTag)
  }

  return result
}
