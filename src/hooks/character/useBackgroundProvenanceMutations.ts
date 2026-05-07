import { useCallback, useMemo } from 'react'
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
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Item5e } from '@/types/5etools'

const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()
const CURRENCY_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const

export function useBackgroundProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyBackgroundSelection = useCallback(
    (
      bg: {
        name: string
        source?: string
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        startingEquipment?: unknown
        feats?: unknown[]
      },
      blockChoices: string[] = [],
    ) => {
      if (!character) return
      const normalizedBg = normalizeBackgroundForOriginSystem(
        bg as Background5e,
        character.originSystem,
      )
      if (!normalizedBg) return
      const oldBgName = character.background || undefined
      const isBackgroundChanged =
        oldBgName !== bg.name || (character.backgroundSource ?? '') !== (bg.source ?? '')

      let newLedger = reconcileBackgroundChange(ledger, oldBgName)
      newLedger = applyBackgroundGrants(normalizedBg, newLedger, {
        itemLookup,
        suppressLanguageGrants: character.originSystem === '2024',
      })
      newLedger = ensureOriginLanguageBaseline(newLedger, character.originSystem)
      ensureOriginSystemInvariants(newLedger, character.originSystem)

      let newProfs = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }
      let newEquipment = [...(character.equipment ?? [])]
      if (oldBgName) {
        for (const domain of ['skills', 'languages', 'tools'] as const) {
          const { toRemove } = diffProficiencyGrants(ledger, domain, 'background', oldBgName)
          if (toRemove.length > 0) {
            if (domain === 'skills') {
              newProfs = {
                ...newProfs,
                skills: (newProfs.skills ?? []).filter(
                  (name) => !toRemove.includes(normalizeKey(name)),
                ),
              }
              for (const removed of toRemove) {
                const existing = newSkills[removed]
                newSkills[removed] = {
                  proficient: false,
                  expertise: false,
                  bonus: existing?.bonus ?? 0,
                }
              }
              continue
            }
            newProfs = {
              ...newProfs,
              [domain]: newProfs[domain].filter((name) => !toRemove.includes(normalizeKey(name))),
            }
          }
        }

        const backgroundEquipmentToRemove = Object.entries(ledger.equipment)
          .filter(
            ([, tags]) =>
              tags.length > 0 &&
              tags.every((tag) => tag.sourceType === 'background' && tag.sourceName === oldBgName),
          )
          .map(([name]) => name)
        newEquipment = removeSourceGrantedEquipment(newEquipment, backgroundEquipmentToRemove)
      }

      const skills: string[] = extractProficiencyBlockNames(normalizedBg.skillProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const languages: string[] = extractProficiencyBlockNames(
        normalizedBg.languageProficiencies ?? [],
        { includeAnyStandard: false },
      )
      const languagesToApply = character.originSystem === '2024' ? [] : languages
      const tools: string[] = extractProficiencyBlockNames(normalizedBg.toolProficiencies ?? [], {
        includeAnyStandard: false,
      })
      newProfs = {
        ...newProfs,
        skills: [...new Set([...(newProfs.skills ?? []), ...skills])],
        languages: [...new Set([...newProfs.languages, ...languagesToApply])],
        tools: [...new Set([...newProfs.tools, ...tools])],
      }

      for (const skillName of skills) {
        const norm = normalizeKey(skillName)
        const existing = newSkills[norm]
        newSkills[norm] = {
          proficient: true,
          expertise: existing?.expertise ?? false,
          bonus: existing?.bonus ?? 0,
        }
      }

      const bgBlocks = getBackgroundEquipmentBlocks(bg.startingEquipment)
      const resolvedBackgroundPackage = resolveEquipmentWithBlockChoices(
        bgBlocks,
        itemLookup,
        blockChoices,
      )

      const previousBackgroundCurrency = character.backgroundCurrencyGrant
      const nextCurrency = {
        cp: character.currency?.cp ?? 0,
        sp: character.currency?.sp ?? 0,
        ep: character.currency?.ep ?? 0,
        gp: character.currency?.gp ?? 0,
        pp: character.currency?.pp ?? 0,
      }

      if (previousBackgroundCurrency) {
        for (const key of CURRENCY_KEYS) {
          nextCurrency[key] = Math.max(
            0,
            nextCurrency[key] - (previousBackgroundCurrency[key] ?? 0),
          )
        }
      }

      for (const key of CURRENCY_KEYS) {
        nextCurrency[key] += resolvedBackgroundPackage.currency[key] ?? 0
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: newProfs,
        skills: newSkills,
        equipment: upsertGrantedEquipment(newEquipment, resolvedBackgroundPackage.items),
        currency: nextCurrency,
        backgroundCurrencyGrant: resolvedBackgroundPackage.currency,
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
      })
    },
    [character, ledger, updateCharacter, itemLookup],
  )

  /**
   * Apply (or update) the player's background ability score choices.
   * Replaces any existing background ability bonus records in the ledger.
   * Writes new records derived from the chosen block + ordered selections.
   */
  const applyBackgroundAbilityChoices = useCallback(
    (
      bg: { name: string; source?: string; ability?: unknown[] },
      blockIndex: number,
      choices: string[],
    ) => {
      if (!character) return
      if (character.originSystem !== '2024') return
      const normalizedBg = normalizeBackgroundForOriginSystem(
        bg as Background5e,
        character.originSystem,
      )
      if (!normalizedBg) return
      const bgData = getBackgroundAbilityData(normalizedBg)
      const block = bgData.blocks[blockIndex]
      if (!block) return

      const cleanedBonuses = ledger.abilityBonuses.filter(
        (r) => !(r.sourceTag.sourceType === 'background' && r.sourceTag.sourceName === bg.name),
      )
      let newLedger: ProvenanceLedger = {
        ...ledger,
        abilityBonuses: cleanedBonuses,
      }

      const bgTag = makeSourceTag('background', normalizedBg.name, 'choice', normalizedBg.source)
      const seen = new Set<string>()
      for (let i = 0; i < block.weights.length; i++) {
        const ability = normalizeAbilityName(choices[i] ?? '')
        if (!ability || seen.has(ability)) continue
        seen.add(ability)
        newLedger = addAbilityBonus(newLedger, {
          ability,
          value: block.weights[i],
          sourceTag: bgTag,
        })
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        backgroundAsiBlockIndex: blockIndex,
        backgroundAsiChoices: choices,
      })
    },
    [character, ledger, updateCharacter],
  )

  return { applyBackgroundSelection, applyBackgroundAbilityChoices }
}
