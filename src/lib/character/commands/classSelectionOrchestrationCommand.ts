import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { mergeSkillState } from '@/lib/calculations/skills'
import { generateEquipmentId } from '@/lib/character/ids'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  addGrant,
  applyClassGrants,
  diffProficiencyGrants,
  makeSourceTag,
  reconcileClassChange,
} from '@/lib/provenance'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'
import type { Character, Skills } from '@/types/character'

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

const isNarrativeTool = (value: string) => /of your choice|choose|one type of/i.test(value)

/**
 * Derive the starting proficiencies and skills map for a brand-new character.
 *
 * This is the single source of truth for converting class + background entities
 * into the `character.proficiencies` array fields and `character.skills` map used
 * by the character builder.  Call it from `CharacterCreationWizard` so the wizard
 * produces the same result as the individual `applyClassSelection` /
 * `applyBackgroundSelection` mutation hooks.
 */
export function buildInitialCharacterProficiencies(
  cls:
    | {
        proficiency?: string[]
        startingProficiencies?: {
          armor?: string[]
          weapons?: string[]
          tools?: string[]
          toolProficiencies?: Record<
            string,
            number | boolean | { choose?: { from?: string[]; count?: number } }
          >[]
        }
      }
    | undefined,
  normalizedBackground:
    | {
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
      }
    | undefined,
): {
  proficiencies: {
    armor: string[]
    weapons: string[]
    tools: string[]
    skills: string[]
    languages: string[]
    savingThrows: string[]
  }
  skills: Skills
} {
  const clsProfs = cls?.startingProficiencies ?? {}

  const armor = (clsProfs.armor ?? [])
    .filter((a): a is string => typeof a === 'string')
    .map(stripItemTag)
  const weapons = (clsProfs.weapons ?? [])
    .filter((w): w is string => typeof w === 'string')
    .map(stripItemTag)
  const classTools = [
    ...(clsProfs.tools ?? [])
      .filter((t): t is string => typeof t === 'string')
      .map(stripItemTag)
      .filter((t) => t && !isNarrativeTool(t)),
    ...extractProficiencyBlockNames((clsProfs.toolProficiencies as unknown[]) ?? [], {
      includeAnyStandard: false,
    }),
  ]
  const savingThrows = [...new Set((cls?.proficiency ?? []).map(normalizeSavingThrowName))]

  const bgSkills = extractProficiencyBlockNames(
    (normalizedBackground?.skillProficiencies as unknown[]) ?? [],
    { includeAnyStandard: false },
  ).filter((name) => !name.toLowerCase().startsWith('choose '))

  const bgLanguages = extractProficiencyBlockNames(
    (normalizedBackground?.languageProficiencies as unknown[]) ?? [],
    { includeAnyStandard: false },
  )
  const bgTools = extractProficiencyBlockNames(
    (normalizedBackground?.toolProficiencies as unknown[]) ?? [],
    { includeAnyStandard: false },
  )

  const tools = [...new Set([...classTools, ...bgTools])]
  const skills = [...new Set(bgSkills.map((s) => s.toLowerCase()))]
  const languages = [...new Set(['Common', ...bgLanguages])]

  return {
    proficiencies: { armor, weapons, tools, skills, languages, savingThrows },
    skills: mergeSkillState({}, skills),
  }
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

function replaceClassEquipmentGrants(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  equipmentNames: string[],
): ProvenanceLedger {
  const nextEquipment: Record<string, SourceTag[]> = {}

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

export function computeApplyClassSelectionUpdates(
  character: Character,
  ledger: ProvenanceLedger,
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
  subclass: { name: string; source?: string } | undefined,
  itemLookup: Map<string, Item5e>,
): Partial<Character> {
  const primaryClassEntry = getCharacterClassEntries(character)[0]
  const oldClassName = primaryClassEntry?.name ?? character.class ?? undefined
  const oldSubclassName = primaryClassEntry?.subclass ?? character.subclass ?? undefined

  let newLedger = reconcileClassChange(ledger, oldClassName, oldSubclassName)
  newLedger = applyClassGrants(cls, subclass, newLedger, { itemLookup })

  const updates: Partial<Character> = { provenance: newLedger }
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

  return updates
}
