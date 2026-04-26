import { useCallback } from 'react'
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import {
  applyRaceGrants,
  diffProficiencyGrants,
  reconcileRaceChange,
  reconcileSubraceChange,
  resolveRaceGrantFilterOptions,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Item5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { extractFixedGrantNames } from './provenanceHelpers'

function getEffectiveRaceLanguageBlocks(race: {
  lineage?: string | boolean
  languageProficiencies?: unknown[]
}): unknown[] {
  if (Array.isArray(race.languageProficiencies) && race.languageProficiencies.length > 0) {
    return race.languageProficiencies
  }
  if (typeof race.lineage === 'string') {
    return [{ common: true, anyStandard: 1 }]
  }
  return []
}

function dedupeValues(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined
  const deduped = Array.from(new Set(values.map(normalizeKey))).filter(Boolean)
  return deduped.length > 0 ? deduped : undefined
}

interface UseRaceProvenanceParams {
  character: Character | null
  ledger: ProvenanceLedger
  items: Item5e[]
  itemsBase: Item5e[]
  updateCharacter: (id: string, updates: Partial<Character>) => void
}

export function useRaceProvenance({
  character,
  ledger,
  items,
  itemsBase,
  updateCharacter,
}: UseRaceProvenanceParams) {
  const resolveRaceChoiceOptions = useCallback(
    (domain: 'armor' | 'weapons', fromFilter: string) =>
      resolveRaceGrantFilterOptions(domain, fromFilter, {
        items,
        itemsBase,
        allowedSources: character?.allowedSources,
      }),
    [character?.allowedSources, items, itemsBase],
  )

  const applyRaceSelection = useCallback(
    (
      race: {
        name: string
        source?: string
        lineage?: string | boolean
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
      },
      subrace?: {
        name: string
        source?: string
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
        overwrite?: { ability?: boolean }
      },
      raceAsiBlockIndex: 0 | 1 = 0,
    ) => {
      if (!character) return
      const normalizedSelection = normalizeRaceSelectionForOriginSystem(
        race as Race5e,
        subrace as Race5e | undefined,
        character.originSystem,
      )
      const normalizedRace = normalizedSelection.race
      const normalizedSubrace = normalizedSelection.subrace
      if (!normalizedRace) return
      const oldRaceName = character.race || undefined
      const oldSubraceName = character.subrace || undefined
      let newLedger = reconcileRaceChange(ledger, oldRaceName, oldSubraceName)
      newLedger = applyRaceGrants(
        normalizedRace,
        normalizedSubrace,
        newLedger,
        resolveRaceChoiceOptions,
        raceAsiBlockIndex,
        1,
        { suppressLanguageGrants: character.originSystem === '2024' },
      )
      newLedger = ensureOriginLanguageBaseline(newLedger, character.originSystem)
      ensureOriginSystemInvariants(newLedger, character.originSystem)

      let nextProficiencies = { ...character.proficiencies }
      const nextSkills = { ...(character.skills ?? {}) }

      for (const [sourceType, sourceName] of [
        ['race', oldRaceName],
        ['subrace', oldSubraceName],
      ] as const) {
        if (!sourceName) continue
        for (const domain of ['skills', 'languages', 'tools', 'armor', 'weapons'] as const) {
          const { toRemove } = diffProficiencyGrants(ledger, domain, sourceType, sourceName)
          if (toRemove.length === 0) continue

          nextProficiencies = {
            ...nextProficiencies,
            [domain]: nextProficiencies[domain].filter(
              (name) => !toRemove.includes(normalizeKey(name)),
            ),
          }

          if (domain === 'skills') {
            for (const removed of toRemove) {
              const existing = nextSkills[removed]
              nextSkills[removed] = {
                proficient: false,
                expertise: false,
                bonus: existing?.bonus ?? 0,
              }
            }
          }
        }
      }

      const raceSkills = extractProficiencyBlockNames(normalizedRace.skillProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const raceLanguages = extractProficiencyBlockNames(
        getEffectiveRaceLanguageBlocks(normalizedRace),
        {
          includeAnyStandard: false,
        },
      ).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceSkills = extractProficiencyBlockNames(
        normalizedSubrace?.skillProficiencies ?? [],
        {
          includeAnyStandard: false,
        },
      ).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceLanguages = extractProficiencyBlockNames(
        normalizedSubrace?.languageProficiencies ?? [],
        {
          includeAnyStandard: false,
        },
      ).filter((name) => !name.toLowerCase().startsWith('choose '))
      const languagesToApply =
        character.originSystem === '2024' ? [] : [...raceLanguages, ...subraceLanguages]

      const raceTools = extractFixedGrantNames(normalizedRace.toolProficiencies)
      const raceWeapons = extractFixedGrantNames(normalizedRace.weaponProficiencies)
      const raceArmor = extractFixedGrantNames(normalizedRace.armorProficiencies)
      const subraceTools = extractFixedGrantNames(normalizedSubrace?.toolProficiencies)
      const subraceWeapons = extractFixedGrantNames(normalizedSubrace?.weaponProficiencies)
      const subraceArmor = extractFixedGrantNames(normalizedSubrace?.armorProficiencies)

      nextProficiencies = {
        ...nextProficiencies,
        skills: [
          ...new Set([
            ...nextProficiencies.skills,
            ...raceSkills.map(normalizeKey),
            ...subraceSkills.map(normalizeKey),
          ]),
        ],
        languages: [...new Set([...nextProficiencies.languages, ...languagesToApply])],
        tools: [...new Set([...nextProficiencies.tools, ...raceTools, ...subraceTools])],
        weapons: [...new Set([...nextProficiencies.weapons, ...raceWeapons, ...subraceWeapons])],
        armor: [...new Set([...nextProficiencies.armor, ...raceArmor, ...subraceArmor])],
      }

      for (const skillName of [...raceSkills, ...subraceSkills]) {
        const normalized = normalizeKey(skillName)
        const existing = nextSkills[normalized]
        nextSkills[normalized] = {
          proficient: true,
          expertise: existing?.expertise ?? false,
          bonus: existing?.bonus ?? 0,
        }
      }

      // Apply darkvision from race/subrace
      const darkvisionRange = normalizedSubrace?.darkvision ?? normalizedRace.darkvision
      const nextVisions = (character.visions ?? []).filter((v) => v.type !== 'darkvision')
      if (typeof darkvisionRange === 'number' && darkvisionRange > 0) {
        nextVisions.push({ type: 'darkvision', range: darkvisionRange })
      }

      const damageResistances = dedupeValues([
        ...(normalizedRace.resist ?? []),
        ...(normalizedSubrace?.resist ?? []),
      ])
      const damageImmunities = dedupeValues([
        ...(normalizedRace.immune ?? []),
        ...(normalizedSubrace?.immune ?? []),
      ])
      const conditionImmunities = dedupeValues([
        ...(normalizedRace.conditionImmune ?? []),
        ...(normalizedSubrace?.conditionImmune ?? []),
      ])

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: nextProficiencies,
        skills: nextSkills,
        visions: nextVisions.length > 0 ? nextVisions : undefined,
        damageResistances,
        damageImmunities,
        conditionImmunities,
      })
    },
    [character, ledger, resolveRaceChoiceOptions, updateCharacter],
  )

  const applySubraceChange = useCallback(
    (
      race: {
        name: string
        source?: string
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
      },
      subrace?: {
        name: string
        source?: string
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
        overwrite?: { ability?: boolean }
      },
    ) => {
      if (!character) return
      const normalizedSelection = normalizeRaceSelectionForOriginSystem(
        race as Race5e,
        subrace as Race5e | undefined,
        character.originSystem,
      )
      const normalizedSubrace = normalizedSelection.subrace
      const oldSubraceName = character.subrace || undefined
      let newLedger = reconcileSubraceChange(ledger, oldSubraceName)
      if (normalizedSubrace) {
        newLedger = applyRaceGrants(
          {
            name: race.name,
            source: race.source,
            skillProficiencies: [],
            languageProficiencies: [],
            toolProficiencies: [],
            weaponProficiencies: [],
            armorProficiencies: [],
            ability: [],
          },
          normalizedSubrace,
          newLedger,
          resolveRaceChoiceOptions,
          (character.raceAsiBlockIndex ?? 0) as 0 | 1,
          1,
          { suppressLanguageGrants: character.originSystem === '2024' },
        )
      }
      newLedger = ensureOriginLanguageBaseline(newLedger, character.originSystem)
      ensureOriginSystemInvariants(newLedger, character.originSystem)

      let nextProficiencies = { ...character.proficiencies }
      const nextSkills = { ...(character.skills ?? {}) }

      if (oldSubraceName) {
        for (const domain of ['skills', 'languages', 'tools', 'armor', 'weapons'] as const) {
          const { toRemove } = diffProficiencyGrants(ledger, domain, 'subrace', oldSubraceName)
          if (toRemove.length === 0) continue

          nextProficiencies = {
            ...nextProficiencies,
            [domain]: nextProficiencies[domain].filter(
              (name) => !toRemove.includes(normalizeKey(name)),
            ),
          }

          if (domain === 'skills') {
            for (const removed of toRemove) {
              const existing = nextSkills[removed]
              nextSkills[removed] = {
                proficient: false,
                expertise: false,
                bonus: existing?.bonus ?? 0,
              }
            }
          }
        }
      }

      const subraceSkills = extractProficiencyBlockNames(
        normalizedSubrace?.skillProficiencies ?? [],
        {
          includeAnyStandard: false,
        },
      ).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceLanguages = extractProficiencyBlockNames(
        normalizedSubrace?.languageProficiencies ?? [],
        {
          includeAnyStandard: false,
        },
      ).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceLanguagesToApply = character.originSystem === '2024' ? [] : subraceLanguages
      const subraceTools = extractFixedGrantNames(normalizedSubrace?.toolProficiencies)
      const subraceWeapons = extractFixedGrantNames(normalizedSubrace?.weaponProficiencies)
      const subraceArmor = extractFixedGrantNames(normalizedSubrace?.armorProficiencies)

      nextProficiencies = {
        ...nextProficiencies,
        skills: [...new Set([...nextProficiencies.skills, ...subraceSkills.map(normalizeKey)])],
        languages: [...new Set([...nextProficiencies.languages, ...subraceLanguagesToApply])],
        tools: [...new Set([...nextProficiencies.tools, ...subraceTools])],
        weapons: [...new Set([...nextProficiencies.weapons, ...subraceWeapons])],
        armor: [...new Set([...nextProficiencies.armor, ...subraceArmor])],
      }

      for (const skillName of subraceSkills) {
        const normalized = normalizeKey(skillName)
        const existing = nextSkills[normalized]
        nextSkills[normalized] = {
          proficient: true,
          expertise: existing?.expertise ?? false,
          bonus: existing?.bonus ?? 0,
        }
      }

      // Apply darkvision from subrace (overrides race darkvision)
      const subraceVisions = (character.visions ?? []).filter((v) => v.type !== 'darkvision')
      const darkvisionRange = normalizedSubrace?.darkvision ?? race.darkvision
      if (typeof darkvisionRange === 'number' && darkvisionRange > 0) {
        subraceVisions.push({ type: 'darkvision', range: darkvisionRange })
      }

      const damageResistances = dedupeValues([
        ...(race.resist ?? []),
        ...(normalizedSubrace?.resist ?? []),
      ])
      const damageImmunities = dedupeValues([
        ...(race.immune ?? []),
        ...(normalizedSubrace?.immune ?? []),
      ])
      const conditionImmunities = dedupeValues([
        ...(race.conditionImmune ?? []),
        ...(normalizedSubrace?.conditionImmune ?? []),
      ])

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: nextProficiencies,
        skills: nextSkills,
        visions: subraceVisions.length > 0 ? subraceVisions : undefined,
        damageResistances,
        damageImmunities,
        conditionImmunities,
      })
    },
    [character, ledger, resolveRaceChoiceOptions, updateCharacter],
  )

  return { applyRaceSelection, applySubraceChange }
}
