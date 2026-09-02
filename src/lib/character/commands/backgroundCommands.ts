import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  getBackgroundEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { getBackgroundAbilityData, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeBackgroundForOriginSystem,
} from '@/lib/calculations/originSystem'
import { mergeSkillState } from '@/lib/calculations/skills'
import {
  removeSourceGrantedEquipment,
  upsertGrantedEquipment,
} from '@/lib/character/equipmentHelpers'
import {
  addAbilityBonus,
  applyBackgroundGrants,
  diffProficiencyGrants,
  makeSourceTag,
  reconcileBackgroundChange,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Background5e, Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

const CURRENCY_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const

export function applyBackgroundSelectionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  background: Background5e,
  blockChoices: string[],
  itemLookup: Map<string, Item5e>,
): CharacterCommandResult {
  const normalizedBackground = normalizeBackgroundForOriginSystem(
    background,
    character.originSystem,
  )
  if (!normalizedBackground) return { characterPatch: {}, provenanceUpdate: ledger }

  const oldBackgroundName = character.background || undefined
  const isBackgroundChanged =
    oldBackgroundName !== background.name ||
    (character.backgroundSource ?? '') !== (background.source ?? '')
  let provenanceUpdate = reconcileBackgroundChange(ledger, oldBackgroundName)
  provenanceUpdate = applyBackgroundGrants(normalizedBackground, provenanceUpdate, {
    itemLookup,
    suppressLanguageGrants: character.originSystem === '2024',
  })
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureOriginSystemInvariants(provenanceUpdate, character.originSystem)

  let proficiencies = { ...character.proficiencies }
  let equipment = [...(character.equipment ?? [])]
  if (oldBackgroundName) {
    for (const domain of ['skills', 'languages', 'tools'] as const) {
      const { toRemove } = diffProficiencyGrants(ledger, domain, 'background', oldBackgroundName)
      if (toRemove.length === 0) continue
      proficiencies = {
        ...proficiencies,
        [domain]: proficiencies[domain].filter((name) => !toRemove.includes(normalizeKey(name))),
      }
    }

    const equipmentToRemove = Object.entries(ledger.equipment)
      .filter(
        ([, tags]) =>
          tags.length > 0 &&
          tags.every(
            (tag) => tag.sourceType === 'background' && tag.sourceName === oldBackgroundName,
          ),
      )
      .map(([name]) => name)
    equipment = removeSourceGrantedEquipment(equipment, equipmentToRemove)
  }

  const skills = extractProficiencyBlockNames(normalizedBackground.skillProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const languages = extractProficiencyBlockNames(normalizedBackground.languageProficiencies ?? [], {
    includeAnyStandard: false,
  })
  const tools = extractProficiencyBlockNames(normalizedBackground.toolProficiencies ?? [], {
    includeAnyStandard: false,
  })
  proficiencies = {
    ...proficiencies,
    skills: [...new Set([...proficiencies.skills, ...skills])],
    languages: [
      ...new Set([
        ...proficiencies.languages,
        ...(character.originSystem === '2024' ? [] : languages),
      ]),
    ],
    tools: [...new Set([...proficiencies.tools, ...tools])],
  }

  const blocks = getBackgroundEquipmentBlocks(background.startingEquipment)
  const resolvedPackage = resolveEquipmentWithBlockChoices(blocks, itemLookup, blockChoices)
  const currency = {
    cp: character.currency?.cp ?? 0,
    sp: character.currency?.sp ?? 0,
    ep: character.currency?.ep ?? 0,
    gp: character.currency?.gp ?? 0,
    pp: character.currency?.pp ?? 0,
  }
  for (const key of CURRENCY_KEYS) {
    currency[key] = Math.max(0, currency[key] - (character.backgroundCurrencyGrant?.[key] ?? 0))
    currency[key] += resolvedPackage.currency[key] ?? 0
  }

  return {
    characterPatch: {
      background: background.name,
      backgroundSource: background.source || undefined,
      proficiencies,
      skills: mergeSkillState(character.skills ?? {}, proficiencies.skills),
      equipment: upsertGrantedEquipment(equipment, resolvedPackage.items),
      currency,
      backgroundCurrencyGrant: resolvedPackage.currency,
      backgroundEquipmentChoices: blockChoices,
      backgroundAsiBlockIndex:
        character.originSystem === '2024'
          ? isBackgroundChanged
            ? 0
            : character.backgroundAsiBlockIndex
          : undefined,
      backgroundAsiChoices:
        character.originSystem === '2024'
          ? isBackgroundChanged
            ? []
            : character.backgroundAsiChoices
          : undefined,
    },
    provenanceUpdate,
  }
}

export function applyBackgroundAbilityChoicesCommand(
  character: Character,
  ledger: ProvenanceLedger,
  background: Background5e,
  blockIndex: number,
  choices: string[],
): CharacterCommandResult {
  if (character.originSystem !== '2024') {
    return { characterPatch: {}, provenanceUpdate: ledger }
  }
  const normalizedBackground = normalizeBackgroundForOriginSystem(
    background,
    character.originSystem,
  )
  if (!normalizedBackground) return { characterPatch: {}, provenanceUpdate: ledger }
  const block = getBackgroundAbilityData(normalizedBackground).blocks[blockIndex]
  if (!block) return { characterPatch: {}, provenanceUpdate: ledger }

  let provenanceUpdate: ProvenanceLedger = {
    ...ledger,
    abilityBonuses: ledger.abilityBonuses.filter(
      (bonus) =>
        !(
          bonus.sourceTag.sourceType === 'background' &&
          bonus.sourceTag.sourceName === background.name
        ),
    ),
  }
  const sourceTag = makeSourceTag(
    'background',
    normalizedBackground.name,
    'choice',
    normalizedBackground.source,
  )
  const seen = new Set<string>()
  for (let index = 0; index < block.weights.length; index++) {
    const ability = normalizeAbilityName(choices[index] ?? '')
    if (!ability || seen.has(ability)) continue
    seen.add(ability)
    provenanceUpdate = addAbilityBonus(provenanceUpdate, {
      ability,
      value: block.weights[index],
      sourceTag,
    })
  }

  return {
    characterPatch: {
      backgroundAsiBlockIndex: blockIndex,
      backgroundAsiChoices: choices,
    },
    provenanceUpdate,
  }
}
