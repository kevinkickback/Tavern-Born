import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type {
  Class5e,
  Subclass5e,
  SubclassAdditionalSpells,
  SubclassFeature,
} from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
  getSubclassFeatureIdentity,
  isExactSubclassFeatureReference,
} from './classFeatureIdentity'
import {
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { exactOptionalDeclarationReference } from './optionalClassDeclarationStructure'
import { parseSpellToken } from './spellTokens'

export const LAND_GROUP = 'circle-of-the-land-terrain'
const name = 'Circle of the Land'
const featureName = 'Circle Spells'
const rules = (['PHB', 'XPHB'] as const).map((source) => {
  const level = source === 'PHB' ? 2 : 3
  const owner = {
    type: 'subclass',
    name: 'Druid',
    source,
    subclassName: name,
    subclassSource: source,
  } as const
  const ref = `${source === 'PHB' ? featureName : 'Circle of the Land Spells'}|Druid|${source}|Land|${source}|${level}|${source}`
  const target = `subclass-feature|${ref.toLowerCase()}`
  return {
    owner,
    source,
    level,
    ref,
    target,
    id: getFeatureLiteralChoiceId(owner, target, LAND_GROUP, target, level),
  }
})

export const getLandChoiceRule = (id: string) => rules.find((rule) => rule.id === id)

export function isCircleOfTheLand(
  className: string,
  classSource: string,
  subclassName: string,
  subclassSource?: string,
) {
  return (
    norm(className) === 'druid' &&
    ['phb', 'xphb'].includes(norm(classSource)) &&
    norm(subclassName) === norm(name) &&
    ['phb', 'xphb'].includes(norm(subclassSource))
  )
}

export function isValidLandSelection(selection: CharacterClassChoiceSelection) {
  const rule = getLandChoiceRule(selection.choiceId)
  const option = selection.selected[0]
  const target = option && decodeFeatureOptionReference(option)
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    norm(selection.className) === 'druid' &&
    norm(selection.classSource) === norm(rule.source) &&
    norm(selection.subclassName) === norm(name) &&
    norm(selection.subclassSource) === norm(rule.source) &&
    selection.classLevel === rule.level &&
    selection.selected.length === 1 &&
    option.entityType === 'featureOption' &&
    option.slotLevel === rule.level &&
    norm(option.source) === norm(rule.source) &&
    target?.format === 'source-group' &&
    target.group === LAND_GROUP &&
    target.parentIdentity === rule.target
  )
}

function getLandFeature(
  subclass: Subclass5e,
  target: string,
  level: number,
): SubclassFeature | undefined {
  const resolve = (refs: readonly unknown[], key: 'ref' | 'subclassFeature', expected: string) => {
    const matches = refs.filter((row): row is Record<string, unknown> => {
      const ref = row as Record<string, unknown> | undefined
      return (
        typeof ref?.[key] === 'string' &&
        getSubclassFeatureIdentity(decodeSubclassFeatureReference(ref[key] as string)) === expected
      )
    })
    const row = matches.length === 1 ? matches[0] : undefined
    const feature = row?.feature as SubclassFeature | undefined
    return row &&
      !row.sourceIdentityConflict &&
      !row.isClassFeatureVariant &&
      isExactSubclassFeatureReference(row, row[key] as string) &&
      feature &&
      !feature.sourceIdentityConflict &&
      !feature.featureOptionSourceConflict &&
      !feature.isClassFeatureVariant &&
      getSubclassFeatureIdentity(feature) === expected
      ? feature
      : undefined
  }
  const refs = subclass.subclassFeatureRefs ?? []
  if (level > 3) return resolve(refs, 'ref', target)
  const source = norm(subclass.source)
  const root = resolve(
    refs,
    'ref',
    `subclass-feature|circle of the land|druid|${source}|land|${source}|${level}|${source}`,
  )
  const children = (root?.entries ?? []).filter(
    (entry) => (entry as { type?: string } | undefined)?.type === 'refSubclassFeature',
  )
  return resolve(children, 'subclassFeature', target)
}
function getLandOwner(
  cls: Pick<Class5e, 'name' | 'source' | 'classFeatureRefs' | 'sourceIdentityConflict'>,
  subclass: Subclass5e,
) {
  const rule = rules.find(({ source }) => norm(source) === norm(cls.source))
  if (
    !rule ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    !isCircleOfTheLand(cls.name, cls.source, subclass.name, subclass.source) ||
    norm(subclass.className) !== 'druid' ||
    norm(subclass.classSource) !== norm(rule.source) ||
    norm(subclass.source) !== norm(rule.source) ||
    norm(subclass.shortName) !== 'land'
  )
    return undefined
  const gains = (cls.classFeatureRefs ?? []).filter((row) => row.gainSubclassFeature)
  const levels = gains.map(getClassFeatureReferenceLevel)
  if (
    levels.some((level) => level === undefined || level < rule.level) ||
    levels.filter((level) => level === rule.level).length !== 1
  )
    return undefined
  const gain = gains[levels.indexOf(rule.level)]
  const expectedGain =
    rule.source === 'PHB'
      ? 'class-feature|druid circle|druid|phb|2|phb'
      : 'class-feature|druid subclass|druid|xphb|3|xphb'
  if (
    !gain?.feature ||
    gain.feature.sourceIdentityConflict ||
    gain.feature.isClassFeatureVariant ||
    getClassFeatureIdentity(decodeClassFeatureReference(gain.ref)) !== expectedGain ||
    getClassFeatureIdentity(gain.feature) !== expectedGain ||
    !exactOptionalDeclarationReference(
      gain as unknown as Record<string, unknown>,
      gain.ref,
      'classFeature',
    )
  )
    return undefined
  return rule
}

function getLandTerrainSource(cls: Class5e, subclass: Subclass5e) {
  const rule = getLandOwner(cls, subclass)
  if (!rule) return undefined
  const feature = getLandFeature(subclass, rule.target, rule.level)
  const blocks = subclass.additionalSpells
  if (
    !feature ||
    !Array.isArray(blocks) ||
    !blocks.length ||
    blocks.some(
      (block) =>
        !block ||
        typeof block.name !== 'string' ||
        !block.name.trim() ||
        !block.prepared ||
        block.expanded ||
        block.innate ||
        (rule.source === 'XPHB' && block.known) ||
        !Object.keys(block.prepared).length ||
        Object.entries(block.prepared).some(
          ([level, spells]) =>
            !/^(?:[1-9]|1[0-9]|20)$/.test(level) ||
            Number(level) < rule.level ||
            !Array.isArray(spells) ||
            !spells.length ||
            spells.some((spell) => typeof spell !== 'string' || !parseSpellToken(spell).name),
        ),
    )
  )
    return undefined
  if (new Set(blocks.map((block) => norm(block.name))).size !== blocks.length) return undefined
  return {
    rule,
    feature,
    blocks: blocks as Array<
      SubclassAdditionalSpells & { name: string; prepared: Record<string, string[]> }
    >,
  }
}

export function getLandTerrainSetup(
  cls: Class5e,
  subclass: Subclass5e,
): NormalizedCharacterChoice | undefined {
  const land = getLandTerrainSource(cls, subclass)
  if (!land) return undefined
  const { rule, blocks } = land
  return {
    id: rule.id,
    kind: 'feature-option',
    label: 'Circle of the Land Terrain',
    owner: { ...rule.owner, featureName: land.feature.name, featureSource: rule.source },
    level: rule.level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
      Number(index + 1 >= rule.level),
    ),
    options: blocks.map((block) => ({
      entityType: 'featureOption',
      name: block.name,
      source: rule.source,
      ref: encodeSourceGroupOptionReference(
        { kind: 'subclassFeature', ref: rule.ref },
        LAND_GROUP,
        block.name,
      ),
    })),
    repeatable: false,
    replacement: { cadence: 'never' },
    source: {
      kind: 'class-feature-options',
      field: `subclassFeatureRefs:${rule.ref}:entries.additionalSpells`,
    },
  }
}

export function getChosenLandTerrain(
  cls: Class5e,
  subclass: Subclass5e,
  selections: readonly CharacterClassChoiceSelection[],
) {
  const land = getLandTerrainSource(cls, subclass)
  if (!land) return undefined
  const rows = selections.filter((row) => row.choiceId === land.rule.id)
  if (rows.length !== 1 || rows[0].inactive || !isValidLandSelection(rows[0])) return undefined
  const block = land.blocks.find((block) => norm(block.name) === norm(rows[0].selected[0].name))
  return block ? { block, feature: land.feature } : undefined
}

export function resolveLandTerrainOption(
  option: NormalizedChoiceOptionReference,
  classes: readonly Class5e[] | undefined,
) {
  const target = decodeFeatureOptionReference(option)
  const rule = rules.find((row) => row.target === target?.parentIdentity)
  if (
    !rule ||
    target?.format !== 'source-group' ||
    target.group !== LAND_GROUP ||
    norm(option.source) !== norm(rule.source) ||
    !option.ref
  )
    return undefined
  const owners = classes?.filter(
    (cls) => norm(cls.name) === 'druid' && norm(cls.source) === norm(rule.source),
  )
  const cls = owners?.length === 1 ? owners[0] : undefined
  const matches = cls?.subclasses?.filter(
    (row) => norm(row.name) === norm(name) && norm(row.source) === norm(rule.source),
  )
  const subclass = matches?.length === 1 ? matches[0] : undefined
  const land = cls && subclass && getLandTerrainSource(cls, subclass)
  const block = land?.blocks.find((row) => norm(row.name) === target.literal)
  if (!land || !block) return undefined
  return {
    name: block.name,
    source: rule.source,
    ref: option.ref,
    group: LAND_GROUP,
    entries: [
      ...Object.entries(block.prepared).map(
        ([level, spells]) =>
          `Druid level ${level}: ${spells.map((spell) => `{@spell ${landTerrainSpellToken(block.name, Number(level), spell, land.feature).name}}`).join(', ')}.`,
      ),
      ...(land.feature.entries ?? []).filter(
        (entry) => typeof entry === 'string' && /long rest/i.test(entry),
      ),
    ],
  }
}

// The bundled PHB Swamp table links the SRD printing rather than the configured name.
export function landTerrainSpellToken(
  terrain: string,
  level: number,
  raw: string,
  feature: SubclassFeature,
) {
  const spell = parseSpellToken(raw)
  if (
    norm(feature.source) !== 'phb' ||
    norm(terrain) !== 'swamp' ||
    level !== 3 ||
    norm(spell.name) !== "melf's acid arrow|phb"
  )
    return spell
  const tables = (feature.entries ?? []).filter(
    (entry): entry is { type: string; caption: string; rows: unknown[] } => {
      const table = entry as { type?: unknown; caption?: unknown; rows?: unknown } | undefined
      return table?.type === 'table' && table.caption === 'Swamp' && Array.isArray(table.rows)
    },
  )
  if (
    tables.length === 1 &&
    tables[0].rows.some(
      (row) =>
        Array.isArray(row) &&
        row[0] === '3rd' &&
        typeof row[1] === 'string' &&
        row[1].includes('{@spell Acid Arrow|PHB}'),
    )
  )
    return { ...spell, name: 'Acid Arrow|PHB' }
  return spell
}

export function hasLandSanctuary(subclass: Subclass5e) {
  return !!getLandFeature(
    subclass,
    "subclass-feature|nature's sanctuary|druid|xphb|land|xphb|14|xphb",
    14,
  )
}

export function getLandWardResistance(subclass: Subclass5e, terrain: string): string | undefined {
  const feature = getLandFeature(
    subclass,
    "subclass-feature|nature's ward|druid|xphb|land|xphb|10|xphb",
    10,
  )
  const tables = (feature?.entries ?? [])
    .flatMap((entry) => {
      const group = entry as { type?: unknown; entries?: unknown } | undefined
      return group?.type === 'entries' && Array.isArray(group.entries) ? group.entries : []
    })
    .filter((entry) => entry?.type === 'table' && entry.caption === "Nature's Ward")
  const rows: unknown = tables.length === 1 ? tables[0].rows : undefined
  if (!Array.isArray(rows)) return undefined
  const matches = rows.filter(
    (row) =>
      Array.isArray(row) &&
      row.length === 2 &&
      typeof row[0] === 'string' &&
      norm(`${row[0]} Land`) === norm(terrain),
  )
  const resistance: unknown = matches.length === 1 ? matches[0][1] : undefined
  return typeof resistance === 'string' && resistance.trim() ? resistance : undefined
}

export const LAND_BONUS_REF = 'bonus cantrip|druid|phb|land|phb|2|phb'
export const LAND_BONUS_TARGET = `subclass-feature|${LAND_BONUS_REF}`
export function getClassicLandBonusCantrip(cls: Class5e, subclass: Subclass5e) {
  const rule = getLandOwner(cls, subclass)
  if (rule?.source !== 'PHB') return undefined
  const feature = getLandFeature(subclass, LAND_BONUS_TARGET, rule.level)
  const blocks = subclass.additionalSpells
  if (
    !feature ||
    !Array.isArray(blocks) ||
    !blocks.length ||
    blocks.some(
      (block) => JSON.stringify(block?.known) !== '{"1":{"_":[{"choose":"level=0|class=Druid"}]}}',
    )
  )
    return undefined
  return feature
}
