import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassAdditionalSpells } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  canonicalFeatureOptionParent,
  decodeFeatureLiteralChoiceId,
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { getDeclaredSubclassGains, getOwnedSubclassFeature } from './ownedSubclassFeature'
import { parseSpellToken } from './spellTokens'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

const group = 'named-subclass-spells'
const kind = 'subclassFeature'
type Schedule = Record<string, string[]>
const isLevel = (level: string) => /^(?:[1-9]|1[0-9]|20)$/.test(level)
const validSpell = (spell: unknown): spell is string =>
  typeof spell === 'string' &&
  /^[^|#{}]+\|[^|#{}]+(?:#c)?$/i.test(spell) &&
  spell.split('|').every((part) => part.trim())
const key = (spell: string) => getSpellReferenceKey(parseSpellToken(spell).name)
const list = (spells: string[]) => spells.map(key).sort()

export function getNamedSubclassSpellRule(id: string) {
  const rule = decodeFeatureLiteralChoiceId(id)
  if (
    !rule ||
    rule.group !== group ||
    rule.pool !== rule.grant ||
    !rule.owner.every((part) => part && part === norm(part) && !/[|#{}]/.test(part)) ||
    !rule.grant.startsWith('subclass-feature|')
  )
    return undefined
  const parent = canonicalFeatureOptionParent(rule.grant.slice('subclass-feature|'.length), kind)
  if (!parent || parent.identity !== rule.grant || Number(parent.ref.split('|')[5]) !== rule.level)
    return undefined
  const [name, source, subclassName, subclassSource] = rule.owner
  const owner = { type: 'subclass' as const, name, source, subclassName, subclassSource }
  return getFeatureLiteralChoiceId(owner, rule.grant, group, rule.grant, rule.level) === id
    ? { owner, level: rule.level, target: rule.grant, source: parent.source }
    : undefined
}

export function isValidNamedSubclassSpellSelection(selection: CharacterClassChoiceSelection) {
  const rule = getNamedSubclassSpellRule(selection.choiceId)
  const option = selection.selected[0]
  const target = option && decodeFeatureOptionReference(option)
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    selection.classLevel === rule.level &&
    norm(selection.className) === rule.owner.name &&
    norm(selection.classSource) === rule.owner.source &&
    norm(selection.subclassName) === rule.owner.subclassName &&
    norm(selection.subclassSource) === rule.owner.subclassSource &&
    selection.selected.length === 1 &&
    option.entityType === 'featureOption' &&
    option.slotLevel === rule.level &&
    norm(option.source) === norm(rule.source) &&
    target?.format === 'source-group' &&
    target.kind === kind &&
    target.group === group &&
    target.parentIdentity === rule.target
  )
}

function readTables(tables: Record<string, unknown>[], column: number, width: number) {
  if (tables.length !== 1 || !Array.isArray(tables[0].rows)) return undefined
  const schedule: Schedule = {}
  for (const row of tables[0].rows) {
    if (
      !Array.isArray(row) ||
      row.length !== width ||
      typeof row[0] !== 'string' ||
      !isLevel(row[0]) ||
      schedule[row[0]] ||
      typeof row[column] !== 'string'
    )
      return undefined
    const matches = [...row[column].matchAll(/\{@spell ([^{}]+)\}/g)]
    const spells = matches.map((match) => match[1])
    if (
      !spells.length ||
      !spells.every(validSpell) ||
      matches.map((match) => match[0]).join(', ') !== row[column] ||
      new Set(list(spells)).size !== spells.length
    )
      return undefined
    schedule[row[0]] = spells
  }
  return schedule
}

function agrees(table: Schedule | undefined, authored: Schedule, common: Schedule = {}) {
  const levels = Object.keys(authored)
  return (
    !!table &&
    levels.length === Object.keys(table).length &&
    levels.every(
      (level) =>
        !!table[level] &&
        JSON.stringify(list([...(common[level] ?? []), ...table[level]])) ===
          JSON.stringify(list(authored[level])),
    )
  )
}

export function getNamedSubclassSpellSource(
  cls: Class5e,
  subclass: Subclass5e,
  catalogs?: Parameters<typeof getOwnedSubclassFeature>[3],
) {
  const blocks = subclass.additionalSpells
  if (
    !Array.isArray(blocks) ||
    blocks.length < 2 ||
    !blocks.every(
      (block): block is SubclassAdditionalSpells & { name: string; prepared: Schedule } =>
        typeof block?.name === 'string' &&
        !!block.name.trim() &&
        !!block.prepared &&
        !block.known &&
        !block.expanded &&
        !!Object.keys(block.prepared).length &&
        Object.entries(block.prepared).every(
          ([level, spells]) =>
            isLevel(level) &&
            Array.isArray(spells) &&
            !!spells.length &&
            spells.every(validSpell) &&
            new Set(list(spells)).size === spells.length,
        ),
    )
  )
    return undefined
  const named = blocks.map(({ name, prepared }) => ({ name, prepared }))
  if (new Set(named.map((block) => norm(block.name))).size !== named.length) return undefined
  const gains = getDeclaredSubclassGains(cls)
  const level = Math.min(...gains)
  const refs = collectUnconditionalFeatureReferences(subclass.subclassFeatureRefs ?? [], kind)
  const sources = refs.flatMap((row) => {
    if (row.level !== level) return []
    const found = getOwnedSubclassFeature(cls, subclass, row.target, catalogs)
    const [clause, ...entries] = found?.feature.entries ?? []
    if (
      !found ||
      typeof clause !== 'string' ||
      entries.some((entry) => record(entry).type !== 'table')
    )
      return []
    const tables = entries.map(record)
    const terrain =
      /^Whenever you finish a \{@variantrule Long Rest\|[^{}|]+\}, choose one type of ([\w -]+): ([\w ',-]+)\. Consult the table below that corresponds to the chosen type; you have the spells listed for your [\w -]+ level and lower prepared\.$/.exec(
        clause,
      )
    const terrainNames = terrain?.[2]
      .split(/, or | or |, /)
      .map((name) => norm(`${name} ${terrain[1]}`))
    if (
      tables.length === named.length &&
      terrainNames?.length === named.length &&
      new Set(terrainNames).size === named.length &&
      named.every(
        ({ name, prepared }) =>
          terrainNames.includes(norm(name)) &&
          agrees(
            readTables(
              tables.filter((table) => table.caption === name),
              1,
              2,
            ),
            prepared,
          ),
      )
    )
      return [{ ...found, common: {} as Schedule, named, label: 'Terrain' }]
    if (
      tables.length !== 1 ||
      !/^When you reach a [\w -]+ level specified in the .+ table, you thereafter always have the spells? in the Spells \(All\) column prepared\. You also have the additional spells listed in one other column of your choice\.$/.test(
        clause,
      )
    )
      return []
    const columns = tables[0].colLabels
    if (
      !Array.isArray(columns) ||
      columns.length !== named.length + 2 ||
      columns[1] !== 'Spells (All)' ||
      new Set(columns).size !== columns.length
    )
      return []
    const common = readTables(tables, 1, columns.length)
    if (
      !common ||
      !named.every(({ name, prepared }) => {
        const index = columns.indexOf(`Spells (${name})`)
        return index >= 2 && agrees(readTables(tables, index, columns.length), prepared, common)
      })
    )
      return []
    return [{ ...found, common, named, label: 'Specialization' }]
  })
  return sources.length === 1 &&
    sources[0].named.every(({ prepared }) =>
      Object.keys(prepared).every((gain) => Number(gain) >= level),
    )
    ? sources[0]
    : undefined
}

export function getNamedSubclassSpellSetup(
  cls: Class5e,
  subclass: Subclass5e,
  catalogs?: Parameters<typeof getOwnedSubclassFeature>[3],
): NormalizedCharacterChoice | undefined {
  const current = getNamedSubclassSpellSource(cls, subclass, catalogs)
  if (!current) return undefined
  const { feature, target, level, label } = current
  const owner = {
    type: 'subclass' as const,
    name: cls.name,
    source: cls.source,
    subclassName: subclass.name,
    subclassSource: subclass.source,
    featureName: feature.name,
    featureSource: feature.source,
  }
  return {
    id: getFeatureLiteralChoiceId(owner, target, group, target, level),
    kind: 'feature-option',
    label,
    owner,
    level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) => Number(index + 1 >= level)),
    options: current.named.map(({ name }) => ({
      entityType: 'featureOption',
      name,
      source: feature.source,
      ref: encodeSourceGroupOptionReference(
        { kind, ref: target.slice('subclass-feature|'.length) },
        group,
        name,
      ),
    })),
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: 'subclass.additionalSpells' },
  }
}
