import type { GameData, Item5e, ItemEntryDiagnostic } from '@/types/5etools'
import { getItemEntryIdentity, getRawItems } from './itemEntries'
import { DAMAGE_TYPE_LABEL_FALLBACKS } from './rulesetMetadata'

// Bounded adaptation of Renderer.item at 5etools b9061583 (render.js:12942–13382).
type Row = Record<string, unknown>
const record = (v: unknown): Row | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : undefined
const identity = (r: Row) => getItemEntryIdentity(String(r.name), String(r.source))
const isShieldTarget = (v: unknown): v is Row => {
  const r = record(v)
  return (
    typeof r?.name === 'string' &&
    r.name.trim().toLowerCase() === 'shield' &&
    typeof r.source === 'string' &&
    ['phb', 'xphb'].includes(r.source.trim().toLowerCase())
  )
}

/** Serializable raw authority precedes ordinary itemsBase duplicate collapse. */
export function getFixedShieldBases(data: GameData): unknown[] {
  return data.fixedShieldBases ?? getRawItems(data).itemsBase.filter(isShieldTarget)
}

export function mergeFixedShieldBases(layers: readonly GameData[]): unknown[] {
  return mergeBases(layers, getFixedShieldBases, isShieldTarget)
}

// Keep every named row from these sources until the winning raw identity is known.
// Filtering by family first could revive a lower-layer base after an invalid override.
const isCoreBaseTarget = (value: unknown): value is Row => {
  const row = record(value)
  return (
    typeof row?.name === 'string' &&
    !!row.name.trim() &&
    typeof row.source === 'string' &&
    ['phb', 'xphb'].includes(row.source.trim().toLowerCase())
  )
}

export function getFixedEquipmentBases(data: GameData): unknown[] {
  if (data.fixedEquipmentBases) return data.fixedEquipmentBases
  const { items, itemsBase } = getRawItems(data)
  // Ordinary exact claims can shadow a base but do not supply baseitem authority.
  return [
    ...itemsBase.filter(isCoreBaseTarget),
    ...items.filter(isCoreBaseTarget).map((row) => ({
      ...row,
      startingEquipmentCategory: 'Other',
    })),
  ]
}

export function mergeFixedEquipmentBases(layers: readonly GameData[]): unknown[] {
  return mergeBases(layers, getFixedEquipmentBases, isCoreBaseTarget)
}

function mergeBases(
  layers: readonly GameData[],
  getBases: (data: GameData) => unknown[],
  isTarget: (value: unknown) => value is Row,
): unknown[] {
  return layers.reduce<unknown[]>((merged, layer) => {
    const rows = getBases(layer).filter(isTarget)
    const replaced = new Set(rows.map(identity))
    return [...merged.filter((r) => !isTarget(r) || !replaced.has(identity(r))), ...rows]
  }, [])
}

const BASE_FIELDS = new Set([
  'name',
  'source',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'referenceSources',
  'reprintedAs',
  'edition',
  'type',
  'rarity',
  'weight',
  'value',
  'ac',
  'entries',
  'hasFluff',
  'hasFluffImages',
  'startingEquipmentCategory',
])
const TEMPLATE_FIELDS = new Set([
  'name',
  'source',
  'type',
  'edition',
  'requires',
  'excludes',
  'entries',
  'inherits',
  'hasFluffImages',
])
const INHERITED_FIELDS = new Set([
  'namePrefix',
  'source',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
  'tier',
  'rarity',
  'bonusAc',
  'entries',
  'classFeatures',
  'lootTables',
])

const WEAPON_TAGS = [
  'weapon',
  'axe',
  'bow',
  'club',
  'crossbow',
  'dagger',
  'firearm',
  'hammer',
  'lance',
  'mace',
  'net',
  'polearm',
  'rapier',
  'spear',
  'sword',
] as const
const WEAPON_BASE_FIELDS = new Set([
  ...BASE_FIELDS,
  ...WEAPON_TAGS,
  'ammoType',
  'dmg1',
  'dmg2',
  'dmgType',
  'mastery',
  'property',
  'range',
  'weaponCategory',
])
const CORE_TEMPLATE_FIELDS = new Set([...TEMPLATE_FIELDS, 'referenceSources'])
const ARMOR_BASE_FIELDS = new Set([...BASE_FIELDS, 'armor', 'strength', 'stealth'])
const WEAPON_INHERITED_FIELDS = new Set(
  [...INHERITED_FIELDS].map((field) => (field === 'bonusAc' ? 'bonusWeapon' : field)),
)
const AMMUNITION_TEMPLATE_FIELDS = new Set([...CORE_TEMPLATE_FIELDS, 'ammo'])
const AMMUNITION_INHERITED_FIELDS = new Set([...WEAPON_INHERITED_FIELDS, 'miscTags'])
const RESISTANCE_INHERITED_FIELDS = new Set(
  [...INHERITED_FIELDS]
    .filter((field) => field !== 'namePrefix' && field !== 'bonusAc')
    .concat('nameSuffix', 'resist', 'reqAttune', 'hasRefs'),
)
const RESISTANCE_TYPES = new Set(
  Object.values(DAMAGE_TYPE_LABEL_FALLBACKS).map((type) => type.toLowerCase()),
)
const AMMUNITION_TAGS = ['arrow', 'bolt', 'bulletFirearm', 'bulletSling', 'needleBlowgun']
const AMMUNITION_BASE_FIELDS = new Set([...BASE_FIELDS, ...AMMUNITION_TAGS, 'miscTags'])

/** Upstream OR-of-AND requirements and any-key exclusions use own fields. */
function matches(candidate: unknown, requirements: Row, every: boolean): boolean {
  if (candidate == null) return false
  return Object.entries(requirements)[every ? 'every' : 'some'](([key, requirement]) => {
    const value = Object.getOwnPropertyDescriptor(candidate, key)?.value
    if (Array.isArray(requirement))
      return Array.isArray(value)
        ? value.some((x) => requirement.includes(x))
        : requirement.includes(value)
    const nested = record(requirement)
    if (nested) return matches(value, nested, every)
    return Array.isArray(value) ? value.includes(requirement) : value === requirement
  })
}

function validMetadata(row: Row): boolean {
  return (
    ['srd', 'srd52'].every(
      (key) =>
        row[key] === undefined || typeof row[key] === 'boolean' || typeof row[key] === 'string',
    ) &&
    ['basicRules', 'basicRules2024'].every(
      (key) => row[key] === undefined || typeof row[key] === 'boolean',
    ) &&
    ['rarity', 'tier'].every((key) => row[key] === undefined || typeof row[key] === 'string') &&
    ['page', 'weight', 'value'].every(
      (key) =>
        row[key] === undefined || (typeof row[key] === 'number' && Number.isFinite(row[key])),
    ) &&
    ['referenceSources', 'reprintedAs', 'classFeatures', 'lootTables'].every(
      (key) =>
        row[key] === undefined ||
        (Array.isArray(row[key]) && row[key].every((value) => typeof value === 'string')),
    )
  )
}

const isPublicBase = (row: Row, source: string) =>
  Boolean(source === 'PHB' ? row.srd || row.basicRules : row.srd52 || row.basicRules2024)

function validPublicBase(row: Row, source: string): boolean {
  return (
    row.source === source &&
    validMetadata(row) &&
    row.edition === (source === 'PHB' ? 'classic' : 'one') &&
    row.rarity === 'none' &&
    (row.entries === undefined || Array.isArray(row.entries)) &&
    isPublicBase(row, source)
  )
}

function validShieldBase(row: Row, source: string): boolean {
  return (
    row.name === 'Shield' &&
    validPublicBase(row, source) &&
    Object.keys(row).every((k) => BASE_FIELDS.has(k)) &&
    (!Object.getOwnPropertyDescriptor(row, 'startingEquipmentCategory') ||
      row.startingEquipmentCategory === 'Basic' ||
      row.startingEquipmentCategory === 'Other') &&
    row.type === (source === 'PHB' ? 'S' : 'S|XPHB') &&
    typeof row.ac === 'number' &&
    Number.isFinite(row.ac)
  )
}

function validDirectPublicBase(row: Row, source: string): boolean {
  return (
    validPublicBase(row, source) &&
    typeof row.name === 'string' &&
    row.name === row.name.trim() &&
    !row.name.includes('|') &&
    row.startingEquipmentCategory === 'Basic' &&
    !row.sourceIdentityConflict
  )
}

function isBodyArmor(row: Row, source: string): boolean {
  const suffix = source === 'PHB' ? '' : '|XPHB'
  return ['LA', 'MA', 'HA'].some((type) => row.type === `${type}${suffix}`)
}

function validArmorBase(row: Row, source: string): boolean {
  return (
    validDirectPublicBase(row, source) &&
    isBodyArmor(row, source) &&
    Object.keys(row).every((field) => ARMOR_BASE_FIELDS.has(field)) &&
    (row.armor === undefined || typeof row.armor === 'boolean') &&
    typeof row.ac === 'number' &&
    Number.isSafeInteger(row.ac) &&
    row.ac > 0 &&
    (row.strength === undefined ||
      (typeof row.strength === 'string' && /^\d+$/.test(row.strength))) &&
    (row.stealth === undefined || typeof row.stealth === 'boolean')
  )
}

function isCoreAmmunition(row: Row, source: string): boolean {
  return row.type === (source === 'PHB' ? 'A' : 'A|XPHB') && !row.packContents
}

function hasSupportedAmmunitionTags(row: Row): boolean {
  return (
    row.miscTags === undefined ||
    (Array.isArray(row.miscTags) && row.miscTags.every((tag) => tag === 'CNS'))
  )
}

function validAmmunitionBase(row: Row, source: string): boolean {
  return (
    validDirectPublicBase(row, source) &&
    isCoreAmmunition(row, source) &&
    Object.keys(row).every((field) => AMMUNITION_BASE_FIELDS.has(field)) &&
    AMMUNITION_TAGS.every((field) => row[field] === undefined || typeof row[field] === 'boolean') &&
    hasSupportedAmmunitionTags(row)
  )
}

function validWeaponBase(row: Row, source: string): boolean {
  const typeSuffix = source === 'PHB' ? '' : '|XPHB'
  const damage = (value: unknown) => typeof value === 'string' && /^\d+(?:d\d+)?$/.test(value)
  const label = (value: unknown) => typeof value === 'string' && !!value.trim()
  return (
    validDirectPublicBase(row, source) &&
    row.weapon === true &&
    Object.keys(row).every((field) => WEAPON_BASE_FIELDS.has(field)) &&
    WEAPON_TAGS.every((field) => row[field] === undefined || typeof row[field] === 'boolean') &&
    (row.type === `M${typeSuffix}` || row.type === `R${typeSuffix}`) &&
    (row.weaponCategory === 'simple' || row.weaponCategory === 'martial') &&
    damage(row.dmg1) &&
    (row.dmg2 === undefined || damage(row.dmg2)) &&
    label(row.dmgType) &&
    (row.range === undefined || label(row.range)) &&
    (row.ammoType === undefined || label(row.ammoType)) &&
    (row.mastery === undefined || (Array.isArray(row.mastery) && row.mastery.every(label))) &&
    (row.property === undefined ||
      (Array.isArray(row.property) &&
        row.property.every((entry) => {
          if (label(entry)) return true
          const property = record(entry)
          return (
            !!property &&
            label(property.uid) &&
            (property.note === undefined || typeof property.note === 'string') &&
            Object.keys(property).every((key) => key === 'uid' || key === 'note')
          )
        })))
  )
}

export function generateFixedBonusShields(data: GameData, definitions: readonly Row[]) {
  return generateEquipmentVariants(data, definitions, 'shield')
}

export function generateFixedBonusWeapons(data: GameData, definitions: readonly Row[]) {
  return generateEquipmentVariants(data, definitions, 'weapon')
}

export function generateFixedBonusArmor(data: GameData, definitions: readonly Row[]) {
  return generateEquipmentVariants(data, definitions, 'armor')
}

export function generateFixedBonusAmmunition(data: GameData, definitions: readonly Row[]) {
  return generateEquipmentVariants(data, definitions, 'ammunition')
}

export function generateResistanceArmor(
  data: GameData,
  definitions: readonly Row[],
  fixedItems: readonly Item5e[],
) {
  return generateEquipmentVariants(data, definitions, 'resistanceArmor', fixedItems)
}

export function generateMaterialArmor(data: GameData, definitions: readonly Row[]) {
  return generateEquipmentVariants(data, definitions, 'materialArmor')
}

const MATERIAL_ARMOR_FIELDS = new Set([...INHERITED_FIELDS, 'strength', 'stealth'])

function validMaterialArmor(inherited: Row, material: string): boolean {
  return (
    inherited.namePrefix === `${material} ` &&
    inherited.bonusAc === undefined &&
    (material === 'Mithral'
      ? inherited.strength === null && inherited.stealth === false
      : inherited.strength === undefined && inherited.stealth === undefined)
  )
}

function validResistanceArmor(inherited: Row, name: string, source: string): boolean {
  const resistance = inherited.resist
  const entry =
    Array.isArray(inherited.entries) && inherited.entries.length === 1 && inherited.entries[0]
  const reference =
    typeof entry === 'string' && /^\{#itemEntry Armor of Resistance(?:\|(DMG|XDMG))?}$/.exec(entry)
  return (
    Array.isArray(resistance) &&
    resistance.length === 1 &&
    RESISTANCE_TYPES.has(resistance[0]) &&
    inherited.nameSuffix === name.slice('Armor'.length) &&
    inherited.nameSuffix ===
      ` of ${resistance[0][0].toUpperCase()}${resistance[0].slice(1)} Resistance` &&
    inherited.reqAttune === true &&
    (inherited.hasRefs === undefined || inherited.hasRefs === true) &&
    !!reference &&
    (reference[1] ?? 'DMG') === source
  )
}

const FIXED_PATTERNS = {
  shield: /^\+([123]) Shield \(\*\)$/,
  weapon: /^\+([123]) Weapon$/,
  armor: /^\+([123]) Armor$/,
  ammunition: /^\+([123]) Ammunition$/,
  resistanceArmor: /^Armor of .+ Resistance$/,
  materialArmor: /^(Mithral|Adamantine) Armor$/,
}
const BASE_VALIDATORS = {
  shield: validShieldBase,
  weapon: validWeaponBase,
  armor: validArmorBase,
  ammunition: validAmmunitionBase,
  resistanceArmor: validArmorBase,
  materialArmor: validArmorBase,
}
const CORE_BASE_MATCHERS = {
  weapon: (row: Row) => row.weapon === true,
  armor: isBodyArmor,
  ammunition: isCoreAmmunition,
  resistanceArmor: isBodyArmor,
  materialArmor: isBodyArmor,
}

function generateEquipmentVariants(
  data: GameData,
  definitions: readonly Row[],
  family: keyof typeof FIXED_PATTERNS,
  otherGenerated: readonly Item5e[] = [],
): { items: Item5e[]; diagnostics: ItemEntryDiagnostic[] } {
  const shield = family === 'shield'
  const ammunition = family === 'ammunition'
  const resistanceArmor = family === 'resistanceArmor'
  const materialArmor = family === 'materialArmor'
  const baseLabel = shield ? 'Shield' : resistanceArmor || materialArmor ? 'armor' : family
  const templateLabel = resistanceArmor
    ? 'resistance armor'
    : materialArmor
      ? 'material armor'
      : `fixed-${family}`
  const bonusField = family === 'weapon' || ammunition ? 'bonusWeapon' : 'bonusAc'
  const templateFields = ammunition
    ? AMMUNITION_TEMPLATE_FIELDS
    : shield
      ? TEMPLATE_FIELDS
      : CORE_TEMPLATE_FIELDS
  const inheritedFields = resistanceArmor
    ? RESISTANCE_INHERITED_FIELDS
    : materialArmor
      ? MATERIAL_ARMOR_FIELDS
      : ammunition
        ? AMMUNITION_INHERITED_FIELDS
        : bonusField === 'bonusWeapon'
          ? WEAPON_INHERITED_FIELDS
          : INHERITED_FIELDS
  const diagnostics: ItemEntryDiagnostic[] = []
  const diagnose = (path: string, message: string) => {
    if (diagnostics.length < 32) diagnostics.push({ path: `magicVariants.${path}`, message })
  }
  const groups = new Map<string, Row[]>()
  const inputs = shield
    ? getFixedShieldBases(data).filter(isShieldTarget)
    : getFixedEquipmentBases(data).filter(isCoreBaseTarget)
  for (const value of inputs) {
    const key = identity(value)
    groups.set(key, [...(groups.get(key) ?? []), value])
  }
  const occupied = new Set([...data.items, ...data.itemsBase, ...otherGenerated].map(identity)),
    generated = new Map<string, Item5e[]>()
  for (const definition of definitions) {
    const match = FIXED_PATTERNS[family].exec(String(definition.name))
    if (!match || !['DMG', 'XDMG'].includes(String(definition.source))) continue
    const source = String(definition.source),
      baseSource = source === 'DMG' ? 'PHB' : 'XPHB',
      path = `${definition.name}|${source}`
    const inherited = record(definition.inherits),
      requires = definition.requires,
      excludes = record(definition.excludes)
    if (
      !inherited ||
      !Object.keys(definition).every((key) => templateFields.has(key)) ||
      (ammunition && (definition.ammo !== true || !hasSupportedAmmunitionTags(inherited))) ||
      (!shield &&
        (!validMetadata(definition) ||
          !inherited.rarity ||
          inherited.rarity === 'none' ||
          inherited.rarity === 'unknown')) ||
      (definition.hasFluffImages !== undefined && typeof definition.hasFluffImages !== 'boolean') ||
      !validMetadata(inherited) ||
      definition.type !== `GV|${source}` ||
      inherited.source !== source ||
      (resistanceArmor
        ? !validResistanceArmor(inherited, String(definition.name), source)
        : materialArmor
          ? !validMaterialArmor(inherited, match[1])
          : inherited.namePrefix !== `+${match[1]} ` || inherited[bonusField] !== `+${match[1]}`) ||
      !Array.isArray(inherited.entries) ||
      !Object.keys(inherited).every((k) => inheritedFields.has(k)) ||
      !Array.isArray(requires) ||
      !requires.every((row) => record(row)) ||
      (definition.excludes !== undefined && !excludes) ||
      ![undefined, 'classic', 'one'].includes(definition.edition as string | undefined)
    ) {
      diagnose(path, `Unsupported ${templateLabel} template shape.`)
      continue
    }
    let entries: unknown[]
    try {
      let unsupported = false
      const encoded = JSON.stringify(inherited.entries).replace(
        /\{=([^}]+)}/g,
        (_token, field: string) => {
          if (materialArmor || field !== bonusField) unsupported = true
          return String(inherited[bonusField])
        },
      )
      if (unsupported) throw new Error('Unsupported property injector')
      entries = JSON.parse(encoded)
    } catch {
      diagnose(path, `Unsupported ${templateLabel} text injector.`)
      continue
    }
    const matchesTemplate = (row: Row) =>
      (row.edition === definition.edition ||
        (row.edition === 'one' && definition.edition !== 'classic')) &&
      requires.some((requirement) => matches(row, requirement, true)) &&
      (!excludes || !matches(row, excludes, false))
    const shieldBases = groups.get(identity({ name: baseLabel, source: baseSource }))
    const candidates = shield
      ? shieldBases
        ? [shieldBases]
        : []
      : [...groups.values()].filter((rows) =>
          rows.some(
            (row) =>
              row.startingEquipmentCategory === 'Basic' &&
              row.source === baseSource &&
              CORE_BASE_MATCHERS[family](row, baseSource) &&
              isPublicBase(row, baseSource),
          ),
        )
    if (candidates.length === 0) {
      diagnose(path, `Unavailable exact public ${baseLabel} base from ${baseSource}.`)
      continue
    }
    for (const bases of candidates) {
      const base = bases[0]
      if (!shield && !bases.some(matchesTemplate)) continue
      if (bases.length !== 1 || !BASE_VALIDATORS[family](base, baseSource)) {
        diagnose(path, `Ambiguous or unsupported direct public ${baseLabel} base.`)
        continue
      }
      if (shield && !matchesTemplate(base)) continue
      const output = structuredClone(base) as unknown as Item5e
      for (const key of [
        'value',
        'srd',
        'srd52',
        'basicRules',
        'basicRules2024',
        'page',
        'reprintedAs',
        'referenceSources',
        'hasFluff',
        'hasFluffImages',
      ])
        delete output[key]
      for (const [key, value] of Object.entries(inherited))
        if (!['namePrefix', 'nameSuffix', 'entries', 'reprintedAs'].includes(key))
          output[key] = structuredClone(value)
      output.name = resistanceArmor
        ? `${base.name}${inherited.nameSuffix}`
        : `${inherited.namePrefix}${base.name}`
      output.entries = structuredClone([...entries, ...((base.entries ?? []) as unknown[])])
      const baseName = String(base.name)
      output.baseItem = `${baseName.toLowerCase()}|${baseSource.toLowerCase()}`
      output.genericVariant = { name: definition.name, source }
      output.magicVariantGenerated = {
        base: { name: baseName, source: baseSource },
        template: { name: String(definition.name), source },
      }
      output.startingEquipmentCategory = 'Other'
      const key = identity(output)
      if (occupied.has(key)) {
        diagnose(
          path,
          `Generated ${family} collides with concrete equipment; concrete item retained.`,
        )
        continue
      }
      generated.set(key, [...(generated.get(key) ?? []), output])
    }
  }
  const items = [...generated.values()].flatMap((rows) => {
    if (rows.length === 1) return rows
    diagnose(`${rows[0].name}|${rows[0].source}`, `Ambiguous generated ${family} identity.`)
    return []
  })
  return { items, diagnostics }
}
