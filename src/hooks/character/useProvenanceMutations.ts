import { useCallback } from 'react'
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  getBackgroundEquipmentBlocks,
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { getBackgroundAbilityData, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import {
  addAbilityBonus,
  addGrant,
  applyBackgroundGrants,
  applyClassGrants,
  applyClassSpellGrant,
  applyFeatGrant,
  applyOptionalFeatureGrant,
  applyRaceGrants,
  diffProficiencyGrants,
  makeSourceTag,
  reconcileBackgroundChange,
  reconcileClassChange,
  reconcileRaceChange,
  reconcileSubraceChange,
  resolveChoice,
  resolveRaceGrantFilterOptions,
} from '@/lib/provenance'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import type { ChoiceDomain, ProvenanceLedger } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'

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

const SAVING_THROW_NAME_BY_KEY: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
}

function normalizeSavingThrowName(name: string): string {
  const normalized = normalizeKey(name)
  return SAVING_THROW_NAME_BY_KEY[normalized] ?? normalized
}

function generateEquipmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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
      const oldRaceName = character.race || undefined
      const oldSubraceName = character.subrace || undefined
      let newLedger = reconcileRaceChange(ledger, oldRaceName, oldSubraceName)
      newLedger = applyRaceGrants(
        race,
        subrace,
        newLedger,
        resolveRaceChoiceOptions,
        raceAsiBlockIndex,
      )

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

      const raceSkills = extractProficiencyBlockNames(race.skillProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const raceLanguages = extractProficiencyBlockNames(getEffectiveRaceLanguageBlocks(race), {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceSkills = extractProficiencyBlockNames(subrace?.skillProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceLanguages = extractProficiencyBlockNames(subrace?.languageProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const raceTools = extractFixedGrantNames(race.toolProficiencies)
      const raceWeapons = extractFixedGrantNames(race.weaponProficiencies)
      const raceArmor = extractFixedGrantNames(race.armorProficiencies)
      const subraceTools = extractFixedGrantNames(subrace?.toolProficiencies)
      const subraceWeapons = extractFixedGrantNames(subrace?.weaponProficiencies)
      const subraceArmor = extractFixedGrantNames(subrace?.armorProficiencies)

      nextProficiencies = {
        ...nextProficiencies,
        skills: [
          ...new Set([
            ...nextProficiencies.skills,
            ...raceSkills.map(normalizeKey),
            ...subraceSkills.map(normalizeKey),
          ]),
        ],
        languages: [
          ...new Set([...nextProficiencies.languages, ...raceLanguages, ...subraceLanguages]),
        ],
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
      const darkvisionRange = subrace?.darkvision ?? race.darkvision
      const nextVisions = (character.visions ?? []).filter((v) => v.type !== 'darkvision')
      if (typeof darkvisionRange === 'number' && darkvisionRange > 0) {
        nextVisions.push({ type: 'darkvision', range: darkvisionRange })
      }

      const damageResistances = dedupeValues([...(race.resist ?? []), ...(subrace?.resist ?? [])])
      const damageImmunities = dedupeValues([...(race.immune ?? []), ...(subrace?.immune ?? [])])
      const conditionImmunities = dedupeValues([
        ...(race.conditionImmune ?? []),
        ...(subrace?.conditionImmune ?? []),
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
      const oldSubraceName = character.subrace || undefined
      let newLedger = reconcileSubraceChange(ledger, oldSubraceName)
      if (subrace) {
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
          subrace,
          newLedger,
          resolveRaceChoiceOptions,
          (character.raceAsiBlockIndex ?? 0) as 0 | 1,
        )
      }

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

      const subraceSkills = extractProficiencyBlockNames(subrace?.skillProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceLanguages = extractProficiencyBlockNames(subrace?.languageProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const subraceTools = extractFixedGrantNames(subrace?.toolProficiencies)
      const subraceWeapons = extractFixedGrantNames(subrace?.weaponProficiencies)
      const subraceArmor = extractFixedGrantNames(subrace?.armorProficiencies)

      nextProficiencies = {
        ...nextProficiencies,
        skills: [...new Set([...nextProficiencies.skills, ...subraceSkills.map(normalizeKey)])],
        languages: [...new Set([...nextProficiencies.languages, ...subraceLanguages])],
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
      const darkvisionRange = subrace?.darkvision ?? race.darkvision
      if (typeof darkvisionRange === 'number' && darkvisionRange > 0) {
        subraceVisions.push({ type: 'darkvision', range: darkvisionRange })
      }

      const damageResistances = dedupeValues([...(race.resist ?? []), ...(subrace?.resist ?? [])])
      const damageImmunities = dedupeValues([...(race.immune ?? []), ...(subrace?.immune ?? [])])
      const conditionImmunities = dedupeValues([
        ...(race.conditionImmune ?? []),
        ...(subrace?.conditionImmune ?? []),
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
          skills?: { choose?: { from: string[]; count: number } }
        }
      },
      subclass?: { name: string; source?: string },
    ) => {
      if (!character) return

      const oldClassName = character.class || undefined
      const oldSubclassName = character.subclass || undefined

      let newLedger = reconcileClassChange(ledger, oldClassName, oldSubclassName)
      newLedger = applyClassGrants(cls, subclass, newLedger, { itemLookup })

      const updates: Partial<typeof character> = { provenance: newLedger }
      let newProfs = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }
      let newEquipment = [...(character.equipment ?? [])]

      if (oldClassName) {
        const domains = ['armor', 'weapons', 'tools', 'savingThrows'] as const
        for (const domain of domains) {
          const { toRemove } = diffProficiencyGrants(ledger, domain, 'class', oldClassName)
          if (toRemove.length > 0) {
            if (domain === 'savingThrows') {
              newProfs = {
                ...newProfs,
                savingThrows: newProfs.savingThrows.filter(
                  (name) => !toRemove.includes(normalizeSavingThrowName(name)),
                ),
              }
            } else {
              const cased = character.proficiencies[domain as 'armor' | 'weapons' | 'tools']
              newProfs = {
                ...newProfs,
                [domain]: cased.filter((name) => !toRemove.includes(normalizeKey(name))),
              }
            }
          }
        }

        const classEquipmentToRemove = Object.entries(ledger.equipment)
          .filter(
            ([, tags]) =>
              tags.length > 0 &&
              tags.every((tag) => tag.sourceType === 'class' && tag.sourceName === oldClassName),
          )
          .map(([name]) => name)
        newEquipment = removeSourceGrantedEquipment(newEquipment, classEquipmentToRemove)
      }

      const profs = cls.startingProficiencies ?? {}
      const isNarrativeTool = (value: string) => /of your choice|choose|one type of/i.test(value)
      const toolsFromArray = (profs.tools ?? [])
        .filter((tool): tool is string => typeof tool === 'string')
        .map((tool) => stripItemTag(tool))
        .filter((tool) => tool && !isNarrativeTool(tool))
      const toolsFromBlocks = extractProficiencyBlockNames(profs.toolProficiencies ?? [], {
        includeAnyStandard: false,
      })
      newProfs = {
        ...newProfs,
        armor: [
          ...new Set([
            ...newProfs.armor,
            ...(profs.armor ?? [])
              .filter((armor): armor is string => typeof armor === 'string')
              .map((armor) => stripItemTag(armor)),
          ]),
        ],
        weapons: [
          ...new Set([
            ...newProfs.weapons,
            ...(profs.weapons ?? [])
              .filter((weapon): weapon is string => typeof weapon === 'string')
              .map((weapon) => stripItemTag(weapon)),
          ]),
        ],
        tools: [...new Set([...newProfs.tools, ...toolsFromArray, ...toolsFromBlocks])],
        savingThrows: [
          ...new Set([
            ...newProfs.savingThrows,
            ...(cls.proficiency ?? []).map(normalizeSavingThrowName),
          ]),
        ],
      }
      updates.proficiencies = newProfs
      updates.skills = newSkills
      const classChoiceKey = getClassChoiceKey(cls.name, cls.source)
      const savedBlockChoices = character.classEquipmentChoices?.[classChoiceKey] ?? []
      const classBlocks = getClassDefaultEquipmentBlocks(cls.startingEquipment)
      const classEquipment = resolveEquipmentWithBlockChoices(
        classBlocks,
        itemLookup,
        savedBlockChoices,
      )
      newLedger = replaceClassEquipmentGrants(
        newLedger,
        cls.name,
        cls.source,
        classEquipment.items.map((item) => item.name),
      )
      updates.provenance = newLedger
      updates.equipment = upsertGrantedEquipment(newEquipment, classEquipment.items)
      updates.classEquipmentChoices = {
        ...(character.classEquipmentChoices ?? {}),
        [classChoiceKey]: savedBlockChoices,
      }

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
      const oldBgName = character.background || undefined

      let newLedger = reconcileBackgroundChange(ledger, oldBgName)
      newLedger = applyBackgroundGrants(bg, newLedger, { itemLookup })

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

      const skills: string[] = extractProficiencyBlockNames(bg.skillProficiencies ?? [], {
        includeAnyStandard: false,
      }).filter((name) => !name.toLowerCase().startsWith('choose '))
      const languages: string[] = extractProficiencyBlockNames(bg.languageProficiencies ?? [], {
        includeAnyStandard: false,
      })
      const tools: string[] = extractProficiencyBlockNames(bg.toolProficiencies ?? [], {
        includeAnyStandard: false,
      })
      newProfs = {
        ...newProfs,
        skills: [...new Set([...(newProfs.skills ?? []), ...skills])],
        languages: [...new Set([...newProfs.languages, ...languages])],
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

      updateCharacter(character.id, {
        feats: selectedFeats.map((feat) => ({
          id: `${feat.name}-${feat.source ?? ''}`,
          name: feat.name,
          source: feat.source ?? '',
          description: '',
        })),
        provenance: newLedger,
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
      if (!choice || choice.selected.length >= choice.chooseCount) return

      const newSelected = [...choice.selected, feat.name]
      let newLedger = resolveChoice(ledger, choiceId, newSelected)
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
      const bgData = getBackgroundAbilityData(bg)
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

      const bgTag = makeSourceTag('background', bg.name, 'choice', bg.source)
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

  return {
    applyRaceSelection,
    applySubraceChange,
    applyClassSelection,
    applyClassEquipmentChoice,
    applyBackgroundSelection,
    applyBackgroundAbilityChoices,
    applySpellSelection,
    applyInferredClassSpellSelection,
    applyFeatSelection,
    removeFeatProvenance,
    replaceFeatSelections,
    applyOptionalFeatureSelection,
    applyManualProficiencyToggle,
    applyManualSpellGrant,
    removeSpellProvenance,
    applyManualEquipmentGrant,
    removeEquipmentProvenance,
    resolveFeatChoiceSelection,
    removeFeatChoiceSelection,
    resolveChoiceSelection,
  }
}
