import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import { getParsedClassSpellSlotProgression } from './classSpellSlotTable'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
} from './optionalClassDeclarationStructure'
import { getDeclaredSubclassGains, getOwnedSubclassFeature } from './ownedSubclassFeature'
import { collectSubclassProficiencyPaths } from './subclassProficiencyCertificates'

const traditions = [
  [
    'Abjurer',
    'XPHB',
    'Abjuration',
    'A',
    'e0ec20eaa1b160500ed6b51b2e39adfd3df109b87d5f7285848974e6969387c6',
  ],
  [
    'Diviner',
    'XPHB',
    'Divination',
    'D',
    '3a573e4745c2d90d9136bede9fa82096257c2c7c03004dd1004aeb7e2c420161',
  ],
  [
    'Evoker',
    'XPHB',
    'Evocation',
    'V',
    '1c607a61f4c1e4c58d28fcd0a7b1468056d0c513925b014991a3a52aaa39aaf3',
  ],
  [
    'Illusionist',
    'XPHB',
    'Illusion',
    'I',
    'd4ba45f27af82196b9e3f9e7b24b634544b175d80cfa56a6e9a60ae0e2bede5b',
  ],
  [
    'Conjurer',
    'AU',
    'Conjuration',
    'C',
    'c9c45b67ed090f5626b9eeadfb2257d215dfad131c127b116324565278f8b933',
  ],
  [
    'Enchanter',
    'AU',
    'Enchantment',
    'E',
    '724882b53a9663c68768f33e1cb94a595a5adfb39596dc7bd28c39873c0e3f80',
  ],
  [
    'Necromancer',
    'AU',
    'Necromancy',
    'N',
    '804f6f49f557c9d6a04417c98751c8bfbb8268cfbbc179e4c11c4d7dbd48dd2d',
  ],
  [
    'Transmuter',
    'AU',
    'Transmutation',
    'T',
    'a8f484883a68ea959349bc6ca667ceb01d4ab29810f9c36508e3ea85d076d532',
  ],
] as const

const rules = traditions.map(([subclass, source, schoolName, school, body]) => {
  const name = `${schoolName} Savant`
  const printing = norm(source)
  return {
    owner: ['subclass', 'wizard', 'xphb', norm(subclass), printing] as const,
    name,
    introTarget: `subclass-feature|${norm(subclass)}|wizard|xphb|${norm(subclass)}|${printing}|3|${printing}`,
    target: `subclass-feature|${norm(name)}|wizard|xphb|${norm(subclass)}|${printing}|3|${printing}`,
    introduction: `${subclass}|Wizard|XPHB|${subclass}|${source}|3${source === 'XPHB' ? '' : `|${source}`}`,
    school,
    body,
  }
})

export function isSavantSpellbookSourceTarget(target: string | undefined) {
  return rules.some((rule) => rule.target === target || rule.introTarget === target)
}
const featureFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'entries',
  'page',
  'header',
  'srd52',
  'basicRules2024',
  'featureOptionSourceConflict',
])

// Finite addresses preserve source-free admission and rollback even for empty slots.
// Current entitlement still requires the authored schedule and class slot table below.
const earned = Array.from({ length: 8 }, (_, index) => ({
  level: index * 2 + 3,
  count: index === 0 ? 2 : 1,
  tier: index + 2,
}))

export function getSavantSpellbookGain(slot: ManagedClassSpellSlot) {
  if (
    !Array.isArray(slot) ||
    slot.length !== 5 ||
    !Array.isArray(slot[0]) ||
    slot[1] !== 'class-spellbook' ||
    !Number.isInteger(slot[4]) ||
    slot[4] < 0
  )
    return undefined
  const rule = rules.find(
    ({ owner, target }) =>
      slot[2] === target &&
      slot[0].length === owner.length &&
      slot[0][0] === 'subclass' &&
      (slot[0][1] === 'wizard' && slot[0][2] === 'xphb'
        ? owner.every((part, index) => slot[0][index] === part)
        : slot[0]
            .slice(1)
            .every(
              (part) =>
                typeof part === 'string' && part && part === norm(part) && !/[|#{}]/.test(part),
            )),
  )
  const gain = earned.find((row) => row.level === slot[3] && slot[4] < row.count)
  return rule && gain ? { ...gain, rule } : undefined
}

export function getSavantSpellbookSlots(
  entry: CharacterClassEntry,
  cls?: Class5e,
  catalogs?: SavantCatalog,
): ManagedClassSpellSlot[] {
  const owner = [
    'subclass',
    norm(entry.name),
    norm(entry.source),
    norm(entry.subclass),
    norm(entry.subclassSource),
  ] as const
  const rule =
    owner[1] === 'wizard' && owner[2] === 'xphb'
      ? rules.find((rule) => rule.owner.every((part, index) => owner[index] === part))
      : cls &&
        catalogs &&
        rules.find(({ target }) =>
          getCurrentSavantSpellbookGrant(
            [[...owner], 'class-spellbook', target, 3, 0],
            cls,
            catalogs,
          ),
        )
  if (!rule) return []
  const { target } = rule
  return earned.flatMap((gain) =>
    gain.level <= entry.levels
      ? Array.from(
          { length: gain.count },
          (_, ordinal): ManagedClassSpellSlot => [
            [...owner],
            'class-spellbook',
            target,
            gain.level,
            ordinal,
          ],
        )
      : [],
  )
}

type SavantCatalog = {
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}

type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : undefined

function readFilter(value: unknown, tier: number) {
  const row = record(value)
  if (!row || Object.keys(row).length !== 1 || typeof row.choose !== 'string') return undefined
  const clauses = row.choose.split('|')
  const parts = new Map<string, string>()
  for (const clause of clauses) {
    const [field, content, extra] = clause.split('=')
    if (!content || extra !== undefined || parts.has(field)) return undefined
    parts.set(field, content)
  }
  const authored = parts.get('level')?.split(';')
  // Wizard spellbooks contain level 1+ spells. The upstream filter also contains 0.
  const levels = authored?.[0] === '0' ? authored.slice(1) : authored
  const className = parts.get('class')
  const school = parts.get('school')
  if (
    parts.size !== 3 ||
    !levels ||
    !className ||
    !school ||
    norm(className) !== 'wizard' ||
    levels.length !== tier ||
    levels.some((level, index) => level !== String(index + 1)) ||
    !/^[ACDEINVT]$/.test(school)
  )
    return undefined
  return { classes: [className], school, levels: levels.map(Number) }
}

/** Confirm the exact current subclass and its linked Savant declaration before reading grants. */
export function getCurrentSavantSpellbookGrant(
  slot: ManagedClassSpellSlot,
  cls: Class5e,
  catalogs: SavantCatalog,
) {
  const gain = getSavantSpellbookGain(slot)
  if (!gain) return undefined
  const { target, introduction, body, school, name } = gain.rule
  const owner = slot[0]
  const native = gain.rule.owner.every((part, index) => owner[index] === part)
  if (
    cls.sourceIdentityConflict ||
    cls._copy ||
    norm(cls.name) !== owner[1] ||
    norm(cls.source) !== owner[2]
  )
    return undefined
  const boundaries = (cls.classFeatureRefs ?? []).filter((row) => row.gainSubclassFeature)
  const levels = boundaries.map(getClassFeatureReferenceLevel)
  const first = boundaries[levels.indexOf(3)]
  const firstTarget = 'class-feature|wizard subclass|wizard|xphb|3|xphb'
  if (
    native
      ? levels.some((level) => level === undefined || level < 3) ||
        levels.filter((level) => level === 3).length !== 1 ||
        !first?.feature ||
        first.feature.sourceIdentityConflict ||
        getClassFeatureIdentity(decodeClassFeatureReference(first.ref)) !== firstTarget ||
        getClassFeatureIdentity(first.feature) !== firstTarget ||
        !exactOptionalDeclarationReference(
          first as unknown as RecordValue,
          first.ref,
          'classFeature',
        )
      : Math.min(...getDeclaredSubclassGains(cls)) !== 3
  )
    return undefined
  const matches = cls.subclasses?.filter(
    (row) =>
      norm(row.name) === owner[3] &&
      norm(row.source) === owner[4] &&
      norm(row.className) === owner[1] &&
      norm(row.classSource) === owner[2],
  )
  const subclass = matches?.length === 1 ? matches[0] : undefined
  if (
    !subclass ||
    subclass.sourceIdentityConflict ||
    (native &&
      (subclass._copy ||
        norm(subclass.shortName) !== owner[3] ||
        subclass.subclassFeatures?.filter((ref) => ref === introduction).length !== 1))
  )
    return undefined

  const matchesFeature = (row: SubclassFeature, key: string, signature: string) =>
    !row.sourceIdentityConflict &&
    !row.featureOptionSourceConflict &&
    !row.isClassFeatureVariant &&
    !row._copy &&
    getSubclassFeatureIdentity(row) === key &&
    getFeatureSourceDigest([row]) === signature
  const resolve = (key: string) => {
    const candidates = catalogs.subclassFeatureCandidates
      ? (catalogs.subclassFeatureCandidates.get(key) ?? [])
      : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === key)
    const first = candidates[0]
    const signature = first && getFeatureSourceDigest([first])
    // Filtering creates equivalent reference and level views of the same raw producer.
    // Raw duplicate declarations are marked as conflicts before those views are built.
    return signature && candidates.every((row) => matchesFeature(row, key, signature))
      ? first
      : undefined
  }
  const paths = native
    ? collectSubclassProficiencyPaths(
        subclass.subclassFeatureRefs ?? [],
        resolve,
        (key, attached) => {
          const current = resolve(key)
          const signature = current && getFeatureSourceDigest([current])
          return !!signature && matchesFeature(attached, key, signature)
        },
      )
    : []
  const declarations = paths.filter((path) => path.target === target)
  const declaration = native
    ? declarations.length === 1
      ? declarations[0]
      : undefined
    : getOwnedSubclassFeature(cls, subclass, target, catalogs)
  const feature = resolve(target)
  if (
    !declaration ||
    declaration.level !== 3 ||
    declaration.refs.length !== 2 ||
    (native
      ? declaration.refs[0] !== introduction
      : decodeOptionalDeclaration(declaration.refs[0], 'subclassFeature')?.target !==
        gain.rule.introTarget) ||
    decodeOptionalDeclaration(declaration.refs[1], 'subclassFeature')?.target !== target ||
    !feature ||
    !hasFeatureSourceShape(feature, featureFields) ||
    getFeatureSourceDigest(feature.entries ?? [], false) !== body
  )
    return undefined

  const blocks = subclass.additionalSpells
  const block = Array.isArray(blocks) && blocks.length === 1 ? record(blocks[0]) : undefined
  const schedule = record(block?.known)
  const table = getParsedClassSpellSlotProgression(cls)
  if (
    !block ||
    Object.keys(block).some((key) => key !== 'known' && key !== 'prepared' && key !== 'innate') ||
    !schedule ||
    !table ||
    Object.keys(schedule).length !== earned.length
  )
    return undefined

  // Corroborate every authored gain against the class's own spell tiers, not multiclass slots.
  const tierAt = (level: number) =>
    table[level - 1]?.reduce((tier, count, index) => (count > 0 ? index + 1 : tier), 0) ?? 0
  const choicesAt = (level: number) => {
    const values = schedule[String(level)]
    // Independent fixed spells use strings in the same schedule. They have no Savant ordinal.
    return Array.isArray(values) ? values.filter((value) => typeof value !== 'string') : undefined
  }
  for (const row of earned) {
    const choices = choicesAt(row.level)
    if (
      !choices ||
      choices.length !== row.count ||
      tierAt(row.level) !== row.tier ||
      tierAt(row.level - 1) !== row.tier - 1 ||
      choices.some((choice) => readFilter(choice, row.tier)?.school !== school)
    )
      return undefined
  }
  const filter = readFilter(choicesAt(gain.level)?.[slot[4]], gain.tier)
  return filter && { ...filter, name }
}

export const getSavantSpellbookLabel = (slot: ManagedClassSpellSlot) =>
  getSavantSpellbookGain(slot)?.rule.name
