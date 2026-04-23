import { useCallback } from 'react'
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  getBackgroundEquipmentBlocks,
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { getBackgroundAbilityData, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { computeApplyClassSelectionUpdates } from '@/lib/character/commands/classSelectionOrchestrationCommand'
import { generateEquipmentId } from '@/lib/character/ids'
import {
  addAbilityBonus,
  addGrant,
  applyBackgroundGrants,
  applyClassSpellGrant,
  applyFeatGrant,
  applyOptionalFeatureGrant,
  applyRaceGrants,
  diffProficiencyGrants,
  makeSourceTag,
  reconcileBackgroundChange,
  reconcileRaceChange,
  reconcileSubraceChange,
  removeGrantsBySource,
  resolveChoice,
  resolveRaceGrantFilterOptions,
} from '@/lib/provenance'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import type { ChoiceDomain, ProvenanceLedger } from '@/lib/provenance/types'
import type { Background5e, Item5e, Race5e, Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'

const CURRENCY_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const

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

interface UseProvenanceMutationsParams {
  character: Character | null
  ledger: ProvenanceLedger
  itemLookup: Map<string, Item5e>
  items: Item5e[]
  itemsBase: Item5e[]
  patch: (newLedger: ProvenanceLedger) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
}

function extractFixedGrantNames(blocks: unknown[] | undefined): string[] {
  return extractProficiencyBlockNames(Array.isArray(blocks) ? blocks : [], {
    includeAnyStandard: false,
  })
    .filter((name) => !name.toLowerCase().startsWith('choose '))
    .map((name) => stripItemTag(name))
}

function removeSourceGrantedEquipment(
  equipment: Character['equipment'],
  sourceNames: string[],
): Character['equipment'] {
  if (sourceNames.length === 0) return equipment
  return equipment.filter((item) => !sourceNames.includes(normalizeKey(item.name)))
}

function upsertGrantedEquipment(
  equipment: Character['equipment'],
  granted: Array<Omit<Character['equipment'][number], 'id' | 'equipped' | 'attuned'>>,
): Character['equipment'] {
  const next = [...equipment]

  for (const item of granted) {
    const existingIndex = next.findIndex(
      (eq) =>
        normalizeKey(eq.name) === normalizeKey(item.name) &&
        normalizeKey(eq.source ?? '') === normalizeKey(item.source ?? ''),
    )

    if (existingIndex === -1) {
      next.push({
        id: generateEquipmentId(),
        equipped: false,
        attuned: false,
        ...item,
      })
      continue
    }

    const existing = next[existingIndex]
    next[existingIndex] = {
      ...existing,
      quantity: existing.quantity + item.quantity,
      type: existing.type || item.type,
      ac: existing.ac ?? item.ac,
      armorType: existing.armorType ?? item.armorType,
      weight: existing.weight ?? item.weight,
      value: existing.value ?? item.value,
      rarity: existing.rarity ?? item.rarity,
      reqAttune: existing.reqAttune ?? item.reqAttune,
      weaponCategory: existing.weaponCategory ?? item.weaponCategory,
      dmg1: existing.dmg1 ?? item.dmg1,
      dmg2: existing.dmg2 ?? item.dmg2,
      dmgType: existing.dmgType ?? item.dmgType,
      properties: existing.properties ?? item.properties,
      range: existing.range ?? item.range,
    }
  }

  return next
}

function getClassChoiceKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`
}

function dedupeValues(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined
  const deduped = Array.from(new Set(values.map(normalizeKey))).filter(Boolean)
  return deduped.length > 0 ? deduped : undefined
}

function replaceClassEquipmentGrants(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  equipmentNames: string[],
): ProvenanceLedger {
  const nextEquipment: Record<string, import('@/lib/provenance/types').SourceTag[]> = {}

  for (const [itemName, tags] of Object.entries(ledger.equipment)) {
    const retained = tags.filter(
      (tag) =>
        !(
          tag.sourceType === 'class' &&
          tag.sourceName === className &&
          (tag.sourceRef ?? '') === (classSource ?? '')
        ),
    )
    if (retained.length > 0) nextEquipment[itemName] = retained
  }

  let nextLedger: ProvenanceLedger = { ...ledger, equipment: nextEquipment }
  const classTag = makeSourceTag('class', className, 'fixed', classSource)
  for (const itemName of equipmentNames) {
    nextLedger = addGrant(nextLedger, 'equipment', itemName, classTag)
  }

  return nextLedger
}

export function useProvenanceMutations({
  character,
  ledger,
  itemLookup,
  items,
  itemsBase,
  patch,
  updateCharacter,
}: UseProvenanceMutationsParams) {
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

  const applyClassSelection = useCallback(
    (
      cls: {
        name: string
        source?: string
        proficiency?: string[]
        startingEquipment?: unknown
        startingProficiencies?: {
          armor?: string[]
          weapons?: string[]
          tools?: string[]
          toolProficiencies?: Record<
            string,
            number | boolean | { choose?: { from?: string[]; count?: number } }
          >[]
          skills?: Array<string | Record<string, unknown>>
        }
      },
      subclass?: { name: string; source?: string },
    ) => {
      if (!character) return

      const updates = computeApplyClassSelectionUpdates(
        character,
        ledger,
        cls,
        subclass,
        itemLookup,
      )
      updateCharacter(character.id, updates)
    },
    [character, ledger, updateCharacter, itemLookup],
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
        {
          includeAnyStandard: false,
        },
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

  const applyClassEquipmentChoice = useCallback(
    (
      cls: {
        name: string
        source?: string
        startingEquipment?: unknown
      },
      blockIndex: number,
      choice: string,
    ) => {
      if (!character) return

      const classEquipmentToRemove = Object.entries(ledger.equipment)
        .filter(([, tags]) =>
          tags.some(
            (tag) =>
              tag.sourceType === 'class' &&
              tag.sourceName === cls.name &&
              (tag.sourceRef ?? '') === (cls.source ?? ''),
          ),
        )
        .map(([name]) => name)

      const nextEquipment = removeSourceGrantedEquipment(
        [...(character.equipment ?? [])],
        classEquipmentToRemove,
      )
      const classChoiceKey = getClassChoiceKey(cls.name, cls.source)
      const currentChoices = [...(character.classEquipmentChoices?.[classChoiceKey] ?? [])]
      // Ensure the array is big enough, then update the specific block index
      while (currentChoices.length <= blockIndex) {
        currentChoices.push('a')
      }
      currentChoices[blockIndex] = choice.toLowerCase()

      const classBlocks = getClassDefaultEquipmentBlocks(cls.startingEquipment)
      const resolvedClassEquipment = resolveEquipmentWithBlockChoices(
        classBlocks,
        itemLookup,
        currentChoices,
      )
      const nextLedger = replaceClassEquipmentGrants(
        ledger,
        cls.name,
        cls.source,
        resolvedClassEquipment.items.map((item) => item.name),
      )

      updateCharacter(character.id, {
        provenance: nextLedger,
        equipment: upsertGrantedEquipment(nextEquipment, resolvedClassEquipment.items),
        classEquipmentChoices: {
          ...(character.classEquipmentChoices ?? {}),
          [classChoiceKey]: currentChoices,
        },
      })
    },
    [character, ledger, itemLookup, updateCharacter],
  )

  const applySpellSelection = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spellName: string,
      grantedAtLevel?: number,
    ) => {
      if (!character) return
      const newLedger = applyClassSpellGrant(ledger, className, classSource, spellName, 'choice', {
        ...(grantedAtLevel ? { spellGrantedAtLevel: grantedAtLevel } : {}),
        spellAttributionMode: grantedAtLevel ? 'exact' : undefined,
      })
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const applyBatchSpellSelections = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spells: Array<{ name: string; grantedAtLevel?: number }>,
    ) => {
      if (!character || spells.length === 0) return
      let accumulated = ledger
      for (const spell of spells) {
        accumulated = applyClassSpellGrant(
          accumulated,
          className,
          classSource,
          spell.name,
          'choice',
          {
            ...(spell.grantedAtLevel ? { spellGrantedAtLevel: spell.grantedAtLevel } : {}),
            spellAttributionMode: spell.grantedAtLevel ? 'exact' : undefined,
          },
        )
      }
      patch(accumulated)
    },
    [character, ledger, patch],
  )

  const applyInferredClassSpellSelection = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spellName: string,
      grantedAtLevel: number,
    ) => {
      if (!character) return
      const newLedger = applyClassSpellGrant(ledger, className, classSource, spellName, 'choice', {
        spellGrantedAtLevel: grantedAtLevel,
        spellAttributionMode: 'inferred-lowest-eligible',
      })
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const applyFeatSelection = useCallback(
    (featName: string, featSource: string | undefined) => {
      if (!character) return
      const newLedger = applyFeatGrant(ledger, featName, featSource, true)
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const removeFeatProvenance = useCallback(
    (featName: string) => {
      if (!character) return
      const normKey = normalizeKey(featName)
      const newFeats = { ...ledger.feats }
      delete newFeats[normKey]
      patch({ ...ledger, feats: newFeats })
    },
    [character, ledger, patch],
  )

  const replaceFeatSelections = useCallback(
    (selectedFeats: Array<{ name: string; source?: string }>) => {
      if (!character) return
      const oldNames = new Set((character.feats ?? []).map((feat) => feat.name))
      const newNames = new Set(selectedFeats.map((feat) => feat.name))

      // Feats being removed that had option grants configured
      const removedWithOptions = (character.feats ?? []).filter(
        (f) => !newNames.has(f.name) && f.options != null,
      )

      let newLedger = { ...ledger, feats: { ...ledger.feats } }
      for (const name of oldNames) {
        if (!newNames.has(name)) {
          const normKey = normalizeKey(name)
          delete newLedger.feats[normKey]
        }
      }
      for (const feat of selectedFeats) {
        if (!oldNames.has(feat.name)) {
          newLedger = applyFeatGrant(newLedger, feat.name, feat.source, true)
        }
      }

      // Retract option grants for each removed feat atomically in this same update
      let nextSpellProfiles = character.spells.spellProfiles
      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }
      let newAbilityScores = { ...character.abilityScores }

      for (const removedFeat of removedWithOptions) {
        const opts = removedFeat.options as NonNullable<typeof removedFeat.options>

        // Retract spell grants from special profile
        const spellNames = new Set((opts.spells ?? []).map((key) => key.split('|')[0]))
        if (spellNames.size > 0) {
          nextSpellProfiles = nextSpellProfiles.map((p) => {
            if (p.id !== SPECIAL_SPELL_PROFILE_ID) return p
            return {
              ...p,
              cantrips: p.cantrips.filter((s) => !spellNames.has(s)),
              spellsKnown: p.spellsKnown.filter((s) => !spellNames.has(s)),
            }
          })
        }

        // Retract skill proficiencies
        for (const skillName of opts.skills ?? []) {
          const normKey = normalizeKey(skillName)
          newProficiencies = {
            ...newProficiencies,
            skills: newProficiencies.skills.filter((s) => normalizeKey(s) !== normKey),
          }
          const existing = newSkills[normKey]
          newSkills[normKey] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
        }

        // Retract language and tool proficiencies
        for (const lang of opts.languages ?? []) {
          newProficiencies = {
            ...newProficiencies,
            languages: newProficiencies.languages.filter((l) => l !== lang),
          }
        }
        for (const tool of opts.tools ?? []) {
          newProficiencies = {
            ...newProficiencies,
            tools: newProficiencies.tools.filter((t) => t !== tool),
          }
        }

        // Retract ability score bonus
        if (opts.abilityScore) {
          const abilityName = normalizeAbilityName(opts.abilityScore)
          if (abilityName) {
            newAbilityScores = {
              ...newAbilityScores,
              [abilityName]: Math.max(1, (newAbilityScores[abilityName] ?? 10) - 1),
            }
          }
        }

        // Retract expertise
        if (opts.expertiseSkill) {
          const normKey = normalizeKey(opts.expertiseSkill)
          const existing = newSkills[normKey]
          newSkills[normKey] = {
            proficient: existing?.proficient ?? false,
            expertise: false,
            bonus: existing?.bonus ?? 0,
          }
        }

        // Remove all provenance records attributed to this feat's option grants
        newLedger = removeGrantsBySource(newLedger, 'feat', removedFeat.name)
      }

      updateCharacter(character.id, {
        feats: selectedFeats.map((feat) => {
          const existing = (character.feats ?? []).find((f) => f.name === feat.name)
          return {
            id: existing?.id ?? `${feat.name}-${feat.source ?? ''}`,
            name: feat.name,
            source: feat.source ?? '',
            description: existing?.description ?? '',
            options: existing?.options,
          }
        }),
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  const applyOptionalFeatureSelection = useCallback(
    (
      featureName: string,
      featureSource: string | undefined,
      grantingSourceName: string,
      grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
    ) => {
      if (!character) return
      const newLedger = applyOptionalFeatureGrant(
        ledger,
        featureName,
        featureSource,
        grantingSourceName,
        grantingSourceType,
      )
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const applyManualProficiencyToggle = useCallback(
    (
      domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons' | 'savingThrows',
      itemName: string,
      added: boolean,
    ) => {
      if (!character) return
      if (added) {
        const tag = makeSourceTag('manual', 'User Choice', 'choice')
        patch(addGrant(ledger, domain, itemName, tag))
      } else {
        const normKey = normalizeKey(itemName)
        const map = ledger.proficiencies[domain]
        const filtered = (map[normKey] ?? []).filter((tag) => tag.sourceType !== 'manual')
        const newMap =
          filtered.length > 0
            ? { ...map, [normKey]: filtered }
            : Object.fromEntries(Object.entries(map).filter(([key]) => key !== normKey))
        patch({
          ...ledger,
          proficiencies: { ...ledger.proficiencies, [domain]: newMap },
        })
      }
    },
    [character, ledger, patch],
  )

  const applyManualSpellGrant = useCallback(
    (spellName: string) => {
      if (!character) return
      const tag = makeSourceTag('manual', 'User Choice', 'choice')
      patch(addGrant(ledger, 'spells', spellName, tag))
    },
    [character, ledger, patch],
  )

  const removeSpellProvenance = useCallback(
    (spellName: string) => {
      if (!character) return
      const normKey = normalizeKey(spellName)
      const newSpells = { ...ledger.spells }
      delete newSpells[normKey]
      patch({ ...ledger, spells: newSpells })
    },
    [character, ledger, patch],
  )

  /** Atomically remove old spell provenance and add replacement in one update. */
  const swapSpellProvenance = useCallback(
    (
      className: string,
      classSource: string | undefined,
      removedName: string,
      addedName: string,
    ) => {
      if (!character) return
      const removedKey = normalizeKey(removedName)
      const removedTags = ledger.spells[removedKey] ?? []
      const sourceRef = classSource ?? ''
      const removedClassTags = removedTags.filter(
        (tag) =>
          tag.sourceType === 'class' &&
          tag.sourceName === className &&
          (tag.sourceRef ?? '') === sourceRef,
      )
      const inheritedGrantedAtLevel = removedClassTags.find(
        (tag) => !!tag.spellGrantedAtLevel,
      )?.spellGrantedAtLevel

      // Remove only the swapped class grant; keep unrelated grants for this spell.
      const retainedTags = removedTags.filter(
        (tag) =>
          !(
            tag.sourceType === 'class' &&
            tag.sourceName === className &&
            (tag.sourceRef ?? '') === sourceRef
          ),
      )

      const updatedSpells = { ...ledger.spells }
      if (retainedTags.length > 0) {
        updatedSpells[removedKey] = retainedTags
      } else {
        delete updatedSpells[removedKey]
      }

      const withRemoval = { ...ledger, spells: updatedSpells }
      // Add replacement spell, inheriting the original pick's level attribution.
      const withAdd = applyClassSpellGrant(
        withRemoval,
        className,
        classSource,
        addedName,
        'choice',
        inheritedGrantedAtLevel ? { spellGrantedAtLevel: inheritedGrantedAtLevel } : {},
      )
      patch(withAdd)
    },
    [character, ledger, patch],
  )

  const applyManualEquipmentGrant = useCallback(
    (itemName: string) => {
      if (!character) return
      const tag = makeSourceTag('manual', 'User Choice', 'choice')
      patch(addGrant(ledger, 'equipment', itemName, tag))
    },
    [character, ledger, patch],
  )

  const removeEquipmentProvenance = useCallback(
    (itemName: string) => {
      if (!character) return
      const normKey = normalizeKey(itemName)
      const newEquipment = { ...ledger.equipment }
      delete newEquipment[normKey]
      patch({ ...ledger, equipment: newEquipment })
    },
    [character, ledger, patch],
  )

  const resolveFeatChoiceSelection = useCallback(
    (choiceId: string, feat: { name: string; source?: string }) => {
      if (!character) return
      const choice = ledger.choices.find((c) => c.id === choiceId && c.domain === 'feats')
      if (!choice) return

      let newLedger = ledger

      // If already resolved, remove previous selections from feats map before replacing
      if (choice.selected.length > 0) {
        for (const prevName of choice.selected) {
          const normKey = normalizeKey(prevName)
          const tags = newLedger.feats[normKey] ?? []
          const filtered = tags.filter(
            (t) => !(t.grantType === 'choice' && t.sourceName === choice.sourceTag.sourceName),
          )
          const newFeats =
            filtered.length > 0
              ? { ...newLedger.feats, [normKey]: filtered }
              : Object.fromEntries(Object.entries(newLedger.feats).filter(([k]) => k !== normKey))
          newLedger = { ...newLedger, feats: newFeats }
        }
        newLedger = resolveChoice(newLedger, choiceId, [feat.name])
      } else if (choice.selected.length < choice.chooseCount) {
        newLedger = resolveChoice(newLedger, choiceId, [...choice.selected, feat.name])
      } else {
        return
      }

      const tag = makeSourceTag(
        choice.sourceTag.sourceType,
        choice.sourceTag.sourceName,
        'choice',
        choice.sourceTag.sourceRef,
      )
      newLedger = addGrant(newLedger, 'feats', feat.name, tag)

      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, ledger, updateCharacter],
  )

  const removeFeatChoiceSelection = useCallback(
    (choiceId: string, featName: string) => {
      if (!character) return
      const normKey = normalizeKey(featName)
      const choice = ledger.choices.find((c) => c.id === choiceId && c.domain === 'feats')
      if (!choice) return

      const newSelected = choice.selected.filter((s) => normalizeKey(s) !== normKey)
      let newLedger = resolveChoice(ledger, choiceId, newSelected)

      const tags = newLedger.feats[normKey] ?? []
      const filtered = tags.filter(
        (t) => !(t.grantType === 'choice' && t.sourceName === choice.sourceTag.sourceName),
      )
      const newFeats =
        filtered.length > 0
          ? { ...newLedger.feats, [normKey]: filtered }
          : Object.fromEntries(Object.entries(newLedger.feats).filter(([k]) => k !== normKey))
      newLedger = { ...newLedger, feats: newFeats }

      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, ledger, updateCharacter],
  )

  const resolveChoiceSelection = useCallback(
    (
      domain: Extract<ChoiceDomain, 'skills' | 'languages' | 'tools' | 'armor' | 'weapons'>,
      itemName: string,
      adding: boolean,
      choiceId?: string,
    ) => {
      if (!character) return
      const normKey = normalizeKey(itemName)

      if (adding) {
        const matchingChoice = choiceId
          ? ledger.choices.find(
              (choice) =>
                choice.id === choiceId &&
                choice.domain === domain &&
                choice.selected.length < choice.chooseCount,
            )
          : ledger.choices.find(
              (choice) =>
                choice.domain === domain &&
                choice.selected.length < choice.chooseCount &&
                (choice.optionPool.length === 0 ||
                  choice.optionPool.some((poolEntry) => normalizeKey(poolEntry) === normKey)),
            )
        if (!matchingChoice) return

        const newSelected = [...matchingChoice.selected, itemName]
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected)
        const tag = makeSourceTag(
          matchingChoice.sourceTag.sourceType,
          matchingChoice.sourceTag.sourceName,
          'choice',
          matchingChoice.sourceTag.sourceRef,
        )
        newLedger = addGrant(newLedger, domain, itemName, tag)

        if (domain === 'skills') {
          const nextSkillProficiencies = [
            ...new Set([...(character.proficiencies.skills ?? []), normalizeKey(itemName)]),
          ]
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              skills: nextSkillProficiencies,
            },
            skills: {
              ...(character.skills ?? {}),
              [normKey]: {
                ...(character.skills?.[normKey] ?? {
                  bonus: 0,
                  expertise: false,
                }),
                proficient: true,
              },
            },
          })
        } else {
          const profDomain = domain as 'armor' | 'weapons' | 'tools' | 'languages'
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              [profDomain]: [...new Set([...character.proficiencies[profDomain], itemName])],
            },
          })
        }
      } else {
        const matchingChoice = choiceId
          ? ledger.choices.find(
              (choice) =>
                choice.id === choiceId &&
                choice.domain === domain &&
                choice.selected.some((selected) => normalizeKey(selected) === normKey),
            )
          : ledger.choices.find(
              (choice) =>
                choice.domain === domain &&
                choice.selected.some((selected) => normalizeKey(selected) === normKey),
            )
        if (!matchingChoice) return

        const newSelected = matchingChoice.selected.filter(
          (selected) => normalizeKey(selected) !== normKey,
        )
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected)

        const map = newLedger.proficiencies[
          domain as keyof typeof newLedger.proficiencies
        ] as Record<string, import('@/lib/provenance/types').SourceTag[]>
        if (map) {
          const tags = map[normKey] ?? []
          const filtered = tags.filter(
            (tag) =>
              !(
                tag.grantType === 'choice' && tag.sourceName === matchingChoice.sourceTag.sourceName
              ),
          )
          const newMap =
            filtered.length > 0
              ? { ...map, [normKey]: filtered }
              : Object.fromEntries(Object.entries(map).filter(([key]) => key !== normKey))
          newLedger = {
            ...newLedger,
            proficiencies: { ...newLedger.proficiencies, [domain]: newMap },
          }
        }

        if (domain === 'skills') {
          const nextSkillProficiencies = (character.proficiencies.skills ?? []).filter(
            (proficiency) => normalizeKey(proficiency) !== normKey,
          )
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              skills: nextSkillProficiencies,
            },
            skills: {
              ...(character.skills ?? {}),
              [normKey]: {
                ...(character.skills?.[normKey] ?? {}),
                proficient: false,
                expertise: false,
              },
            },
          })
        } else {
          const profDomain = domain as 'armor' | 'weapons' | 'tools' | 'languages'
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              [profDomain]: character.proficiencies[profDomain].filter(
                (proficiency) => normalizeKey(proficiency) !== normKey,
              ),
            },
          })
        }
      }
    },
    [character, ledger, updateCharacter],
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
      if (character.originSystem !== '2024') {
        return
      }
      const normalizedBg = normalizeBackgroundForOriginSystem(
        bg as Background5e,
        character.originSystem,
      )
      if (!normalizedBg) return
      const bgData = getBackgroundAbilityData(normalizedBg)
      const block = bgData.blocks[blockIndex]
      if (!block) return

      // Remove stale background ability bonus records
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

  /**
   * Commit a feat together with its follow-up option selections.
   * Writes the feat (with `options` field), applies spell/proficiency/ability grants,
   * and removes any pending `featOptions` choice record for this feat.
   */
  const commitFeatWithOptions = useCallback(
    (
      feat: { name: string; source?: string },
      selections: FeatOptionSelections,
      allSpells?: Spell5e[],
    ) => {
      if (!character) return

      const featTag = makeSourceTag('feat', feat.name, 'choice', feat.source)
      let newLedger = ledger

      // ── Spell grants ────────────────────────────────────────────────────────
      const existingSpecial = character.spells.spellProfiles.find(
        (p) => p.id === SPECIAL_SPELL_PROFILE_ID,
      )
      const nextCantrips = [...(existingSpecial?.cantrips ?? [])]
      const nextSpellsKnown = [...(existingSpecial?.spellsKnown ?? [])]

      for (const compositeKey of selections.spells ?? []) {
        const spellName = compositeKey.split('|')[0]
        newLedger = addGrant(newLedger, 'spells', spellName, featTag)
        const spellData = allSpells?.find(
          (s) => `${s.name}|${s.source ?? ''}` === compositeKey || s.name === spellName,
        )
        if (spellData?.level === 0) {
          if (!nextCantrips.includes(spellName)) nextCantrips.push(spellName)
        } else {
          if (!nextSpellsKnown.includes(spellName)) nextSpellsKnown.push(spellName)
        }
      }

      const nextSpellProfiles = existingSpecial
        ? character.spells.spellProfiles.map((p) =>
            p.id === SPECIAL_SPELL_PROFILE_ID
              ? { ...p, cantrips: nextCantrips, spellsKnown: nextSpellsKnown }
              : p,
          )
        : [
            ...character.spells.spellProfiles,
            {
              id: SPECIAL_SPELL_PROFILE_ID,
              type: 'special' as const,
              label: 'Special',
              cantrips: nextCantrips,
              spellsKnown: nextSpellsKnown,
              preparedSpells: [],
              alwaysPrepared: true,
            },
          ]

      // ── Proficiency grants ──────────────────────────────────────────────────
      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }

      for (const skillName of selections.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newLedger = addGrant(newLedger, 'skills', skillName, featTag)
        if (!newProficiencies.skills.includes(normKey)) {
          newProficiencies = { ...newProficiencies, skills: [...newProficiencies.skills, normKey] }
        }
        newSkills[normKey] = {
          proficient: true,
          expertise: newSkills[normKey]?.expertise ?? false,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }

      for (const lang of selections.languages ?? []) {
        newLedger = addGrant(newLedger, 'languages', lang, featTag)
        if (!newProficiencies.languages.includes(lang)) {
          newProficiencies = {
            ...newProficiencies,
            languages: [...newProficiencies.languages, lang],
          }
        }
      }

      for (const tool of selections.tools ?? []) {
        newLedger = addGrant(newLedger, 'tools', tool, featTag)
        if (!newProficiencies.tools.includes(tool)) {
          newProficiencies = { ...newProficiencies, tools: [...newProficiencies.tools, tool] }
        }
      }

      // ── Ability score grant ─────────────────────────────────────────────────
      let newAbilityScores = { ...character.abilityScores }
      if (selections.abilityScore) {
        const abilityName = normalizeAbilityName(selections.abilityScore)
        if (abilityName) {
          newLedger = addAbilityBonus(newLedger, {
            ability: abilityName,
            value: 1,
            sourceTag: featTag,
          })
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: (newAbilityScores[abilityName] ?? 10) + 1,
          }
        }
      }

      // ── Optional feature grant ──────────────────────────────────────────────
      if (selections.optionalFeature) {
        newLedger = addGrant(newLedger, 'features', selections.optionalFeature, featTag)
      }

      // ── Expertise grant ─────────────────────────────────────────────────────
      if (selections.expertiseSkill) {
        const normKey = normalizeKey(selections.expertiseSkill)
        newSkills[normKey] = {
          proficient: newSkills[normKey]?.proficient ?? true,
          expertise: true,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }

      // ── Remove pending featOptions choice record ─────────────────────────────
      newLedger = {
        ...newLedger,
        choices: newLedger.choices.filter(
          (c) => !(c.domain === 'featOptions' && c.sourceTag.sourceName === feat.name),
        ),
      }

      // ── Write feat with options ──────────────────────────────────────────────
      const nextFeats = (character.feats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: selections } : f,
      )
      const nextSpecialFeats = (character.specialFeats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: selections } : f,
      )

      updateCharacter(character.id, {
        feats: nextFeats,
        specialFeats: nextSpecialFeats,
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  /**
   * Retract all grants made by a feat's option selections.
   * Call before removing a feat that has `options` set.
   */
  const retractFeatOptionGrants = useCallback(
    (feat: { name: string }, featOptions: FeatOptionSelections) => {
      if (!character) return

      // Remove all provenance records attributed to this feat
      const newLedger = removeGrantsBySource(ledger, 'feat', feat.name)

      // Remove feat-granted spells from special profile
      const spellNames = new Set((featOptions.spells ?? []).map((key) => key.split('|')[0]))
      const nextSpellProfiles = character.spells.spellProfiles.map((p) => {
        if (p.id !== SPECIAL_SPELL_PROFILE_ID) return p
        return {
          ...p,
          cantrips: p.cantrips.filter((s) => !spellNames.has(s)),
          spellsKnown: p.spellsKnown.filter((s) => !spellNames.has(s)),
        }
      })

      // Retract skill proficiencies
      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }

      for (const skillName of featOptions.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newProficiencies = {
          ...newProficiencies,
          skills: newProficiencies.skills.filter((s) => normalizeKey(s) !== normKey),
        }
        const existing = newSkills[normKey]
        newSkills[normKey] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
      }

      for (const lang of featOptions.languages ?? []) {
        newProficiencies = {
          ...newProficiencies,
          languages: newProficiencies.languages.filter((l) => l !== lang),
        }
      }

      for (const tool of featOptions.tools ?? []) {
        newProficiencies = {
          ...newProficiencies,
          tools: newProficiencies.tools.filter((t) => t !== tool),
        }
      }

      // Retract ability score bonus
      let newAbilityScores = { ...character.abilityScores }
      if (featOptions.abilityScore) {
        const abilityName = normalizeAbilityName(featOptions.abilityScore)
        if (abilityName) {
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: Math.max(1, (newAbilityScores[abilityName] ?? 10) - 1),
          }
        }
      }

      // Retract expertise
      if (featOptions.expertiseSkill) {
        const normKey = normalizeKey(featOptions.expertiseSkill)
        const existing = newSkills[normKey]
        newSkills[normKey] = {
          proficient: existing?.proficient ?? false,
          expertise: false,
          bonus: existing?.bonus ?? 0,
        }
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  /**
   * Atomically retract old feat option grants and apply new ones.
   * Use when the user re-opens FeatOptionsModal to edit an already-configured feat.
   */
  const editFeatWithOptions = useCallback(
    (
      feat: { name: string; source?: string },
      oldOptions: FeatOptionSelections,
      newSelections: FeatOptionSelections,
      allSpells?: Spell5e[],
    ) => {
      if (!character) return

      // ── Step 1: Retract old grants ──────────────────────────────────────────
      let newLedger = removeGrantsBySource(ledger, 'feat', feat.name)

      const oldSpellNames = new Set((oldOptions.spells ?? []).map((key) => key.split('|')[0]))
      let nextSpellProfiles = character.spells.spellProfiles.map((p) => {
        if (p.id !== SPECIAL_SPELL_PROFILE_ID) return p
        return {
          ...p,
          cantrips: p.cantrips.filter((s) => !oldSpellNames.has(s)),
          spellsKnown: p.spellsKnown.filter((s) => !oldSpellNames.has(s)),
        }
      })

      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }

      for (const skillName of oldOptions.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newProficiencies = {
          ...newProficiencies,
          skills: newProficiencies.skills.filter((s) => normalizeKey(s) !== normKey),
        }
        const existing = newSkills[normKey]
        newSkills[normKey] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
      }
      for (const lang of oldOptions.languages ?? []) {
        newProficiencies = {
          ...newProficiencies,
          languages: newProficiencies.languages.filter((l) => l !== lang),
        }
      }
      for (const tool of oldOptions.tools ?? []) {
        newProficiencies = {
          ...newProficiencies,
          tools: newProficiencies.tools.filter((t) => t !== tool),
        }
      }

      let newAbilityScores = { ...character.abilityScores }
      if (oldOptions.abilityScore) {
        const abilityName = normalizeAbilityName(oldOptions.abilityScore)
        if (abilityName) {
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: Math.max(1, (newAbilityScores[abilityName] ?? 10) - 1),
          }
        }
      }
      if (oldOptions.expertiseSkill) {
        const normKey = normalizeKey(oldOptions.expertiseSkill)
        const existing = newSkills[normKey]
        newSkills[normKey] = {
          proficient: existing?.proficient ?? false,
          expertise: false,
          bonus: existing?.bonus ?? 0,
        }
      }

      // ── Step 2: Apply new grants ────────────────────────────────────────────
      const featTag = makeSourceTag('feat', feat.name, 'choice', feat.source)

      const existingSpecial = nextSpellProfiles.find((p) => p.id === SPECIAL_SPELL_PROFILE_ID)
      const nextCantrips = [...(existingSpecial?.cantrips ?? [])]
      const nextSpellsKnown = [...(existingSpecial?.spellsKnown ?? [])]

      for (const compositeKey of newSelections.spells ?? []) {
        const spellName = compositeKey.split('|')[0]
        newLedger = addGrant(newLedger, 'spells', spellName, featTag)
        const spellData = allSpells?.find(
          (s) => `${s.name}|${s.source ?? ''}` === compositeKey || s.name === spellName,
        )
        if (spellData?.level === 0) {
          if (!nextCantrips.includes(spellName)) nextCantrips.push(spellName)
        } else {
          if (!nextSpellsKnown.includes(spellName)) nextSpellsKnown.push(spellName)
        }
      }

      nextSpellProfiles = existingSpecial
        ? nextSpellProfiles.map((p) =>
            p.id === SPECIAL_SPELL_PROFILE_ID
              ? { ...p, cantrips: nextCantrips, spellsKnown: nextSpellsKnown }
              : p,
          )
        : [
            ...nextSpellProfiles,
            {
              id: SPECIAL_SPELL_PROFILE_ID,
              type: 'special' as const,
              label: 'Special',
              cantrips: nextCantrips,
              spellsKnown: nextSpellsKnown,
              preparedSpells: [],
              alwaysPrepared: true,
            },
          ]

      for (const skillName of newSelections.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newLedger = addGrant(newLedger, 'skills', skillName, featTag)
        if (!newProficiencies.skills.includes(normKey)) {
          newProficiencies = { ...newProficiencies, skills: [...newProficiencies.skills, normKey] }
        }
        newSkills[normKey] = {
          proficient: true,
          expertise: newSkills[normKey]?.expertise ?? false,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }
      for (const lang of newSelections.languages ?? []) {
        newLedger = addGrant(newLedger, 'languages', lang, featTag)
        if (!newProficiencies.languages.includes(lang)) {
          newProficiencies = {
            ...newProficiencies,
            languages: [...newProficiencies.languages, lang],
          }
        }
      }
      for (const tool of newSelections.tools ?? []) {
        newLedger = addGrant(newLedger, 'tools', tool, featTag)
        if (!newProficiencies.tools.includes(tool)) {
          newProficiencies = { ...newProficiencies, tools: [...newProficiencies.tools, tool] }
        }
      }

      if (newSelections.abilityScore) {
        const abilityName = normalizeAbilityName(newSelections.abilityScore)
        if (abilityName) {
          newLedger = addAbilityBonus(newLedger, {
            ability: abilityName,
            value: 1,
            sourceTag: featTag,
          })
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: (newAbilityScores[abilityName] ?? 10) + 1,
          }
        }
      }
      if (newSelections.optionalFeature) {
        newLedger = addGrant(newLedger, 'features', newSelections.optionalFeature, featTag)
      }
      if (newSelections.expertiseSkill) {
        const normKey = normalizeKey(newSelections.expertiseSkill)
        newSkills[normKey] = {
          proficient: newSkills[normKey]?.proficient ?? true,
          expertise: true,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }

      // Remove any stale pending choice record
      newLedger = {
        ...newLedger,
        choices: newLedger.choices.filter(
          (c) => !(c.domain === 'featOptions' && c.sourceTag.sourceName === feat.name),
        ),
      }

      const nextFeats = (character.feats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: newSelections } : f,
      )
      const nextSpecialFeats = (character.specialFeats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: newSelections } : f,
      )

      updateCharacter(character.id, {
        feats: nextFeats,
        specialFeats: nextSpecialFeats,
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  return {
    applyRaceSelection,
    applySubraceChange,
    applyClassSelection,
    applyClassEquipmentChoice,
    applyBackgroundSelection,
    applyBackgroundAbilityChoices,
    applySpellSelection,
    applyBatchSpellSelections,
    applyInferredClassSpellSelection,
    applyFeatSelection,
    removeFeatProvenance,
    replaceFeatSelections,
    applyOptionalFeatureSelection,
    applyManualProficiencyToggle,
    applyManualSpellGrant,
    removeSpellProvenance,
    swapSpellProvenance,
    applyManualEquipmentGrant,
    removeEquipmentProvenance,
    resolveFeatChoiceSelection,
    removeFeatChoiceSelection,
    resolveChoiceSelection,
    commitFeatWithOptions,
    retractFeatOptionGrants,
    editFeatWithOptions,
  }
}
