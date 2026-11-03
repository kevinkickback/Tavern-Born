import { matchesClassChoiceFilter } from '@/lib/character/classChoiceFilters'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type {
  Class5e,
  GameData,
  Item5e,
  OptionalFeatureLike,
  Subclass5e,
  SubclassFeature,
} from '@/types/5etools'
import type {
  ClassChoiceDiagnostic,
  LegacySubclassChoiceCatalog,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import { parseFilterTags } from './choiceFilterTags'
import { getNormalizedClassChoiceId } from './classChoiceId'
import { inferSelectionCounts, normalizeProgression } from './classChoiceNormalization'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
  isExactSubclassFeatureReference,
} from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getItemPropertyLabel } from './itemProperties'
import {
  KENSEI_POOLS,
  type KenseiPool,
  legacyChoiceKey as key,
  legacyChoiceOwner,
} from './legacySubclassChoiceIdentity'
import { buildItemPropertyLookup, buildItemTypeLookup } from './lookups'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

const rules = {
  swords: {
    name: 'Bard',
    subclass: 'College of Swords',
    intro: 'College of Swords|Bard||Swords|XGE|3',
    leaf: 'Fighting Style|Bard||Swords|XGE|3',
    introDigest: '323e5654bf876a19fc81f1905979b06bce1281f3fa4d9e83a2bdee7f14952790',
    leafDigest: 'e01d88348358280997a142249b0376e8d90a4ff08499ba7967d4116bbc8a188d',
  },
  kensei: {
    name: 'Monk',
    subclass: 'Way of the Kensei',
    intro: 'Way of the Kensei|Monk||Kensei|XGE|3',
    leaf: 'Path of the Kensei|Monk||Kensei|XGE|3',
    introDigest: '2258f381e4683baef79dffe42a469cbb55a9eeec3c6ba1e1205b76e7f8cf4a9f',
    leafDigest: 'b7800b2faf65d08d2f341e4dc434d3f5424c1527e5c152aea319ba996ff577b3',
  },
} as const
/** Closed prose semantics, from pinned b9061583 XGE declarations. Counts/tags stay source-derived. */
export function getLegacySubclassFamily(
  cls: Pick<Class5e, 'name' | 'source'>,
  sub: Pick<Subclass5e, 'name' | 'source'> | undefined,
) {
  if (!sub || key(sub.source) !== 'xge' || !['phb', 'xphb'].includes(key(cls.source)))
    return undefined
  return (Object.keys(rules) as Array<keyof typeof rules>).find(
    (f) => key(cls.name) === key(rules[f].name) && key(sub.name) === key(rules[f].subclass),
  )
}
export function legacySubclassChoiceDiagnostic(
  cls: Pick<Class5e, 'name' | 'source'>,
  sub: Pick<Subclass5e, 'name' | 'source'> | undefined,
): ClassChoiceDiagnostic[] {
  const family = getLegacySubclassFamily(cls, sub)
  return family
    ? [
        {
          code: 'unverified-required-choice',
          className: cls.name,
          classSource: cls.source,
          subclassName: sub!.name,
          subclassSource: sub!.source,
          featureName: decodeSubclassFeatureReference(rules[family].leaf).name,
          level: 3,
          message:
            'Required subclass setup cannot be verified. Restore the exact subclass and feature declarations.',
        },
      ]
    : []
}
interface LegacySourceCatalog {
  classes?: readonly Class5e[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}
const target = (uid: string) => getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))!
const unconflicted = (v: object) =>
  !['sourceIdentityConflict', 'featureOptionSourceConflict'].some(
    (k) => (v as Record<string, unknown>)[k] === true,
  )

/** Actual selected owner is separate from the original PHB feature target encoded by a copy. */
export function getLegacySubclassChoices(
  cls: Pick<Class5e, 'name' | 'source'>,
  selected: Pick<Subclass5e, 'name' | 'source'> | undefined,
  catalogs: LegacySourceCatalog,
) {
  const family = getLegacySubclassFamily(cls, selected)
  if (!family) return []
  const rule = rules[family],
    parents = (catalogs.classes ?? []).filter(
      (c) => key(c.name) === key(cls.name) && key(c.source) === key(cls.source),
    )
  if (parents.length !== 1 || !unconflicted(parents[0])) return []
  const roots = (parents[0].subclasses ?? []).filter(
    (s) => key(s.name) === key(selected!.name) && key(s.source) === key(selected!.source),
  )
  if (roots.length !== 1) return []
  const sub = roots[0],
    owner = legacyChoiceOwner(parents[0].source, family)
  if (
    !unconflicted(sub) ||
    key(sub.className) !== key(cls.name) ||
    key(sub.classSource) !== key(cls.source) ||
    sub.subclassFeatureRefs?.filter(
      (r) => typeof r.ref === 'string' && target(r.ref) === target(rule.intro),
    ).length !== 1 ||
    sub.subclassFeatures?.filter(
      (r) =>
        (typeof r === 'string'
          ? target(r)
          : r && typeof r === 'object'
            ? getSubclassFeatureIdentity(r)
            : undefined) === target(rule.intro),
    ).length !== 1
  )
    return []
  const declarations = collectUnconditionalFeatureReferences(
    sub.subclassFeatureRefs ?? [],
    'subclassFeature',
  )
  const get = (uid: string, digest: string) => {
    const rows = declarations.filter((r) => r.target === target(uid))
    if (rows.length !== 1 || rows[0].level !== 3) return undefined
    const ref = rows[0].reference,
      feature = ref.feature as SubclassFeature | undefined
    const candidates = catalogs.subclassFeatureCandidates?.get(target(uid))
    const valid = (f: SubclassFeature) =>
      unconflicted(f) &&
      getSubclassFeatureIdentity(f) === target(uid) &&
      Array.isArray(f.entries) &&
      getFeatureSourceDigest(f.entries) === digest
    return unconflicted(ref) &&
      isExactSubclassFeatureReference(ref as unknown as Record<string, unknown>, uid) &&
      feature &&
      valid(feature) &&
      (catalogs.subclassFeatureCandidates === undefined ||
        (!!candidates?.length && candidates.every(valid)))
      ? feature
      : undefined
  }
  if (!get(rule.intro, rule.introDigest)) return []
  const leaf = get(rule.leaf, rule.leafDigest)
  if (!leaf) return []
  const base = (
    label: string,
    level: number,
    counts: readonly number[],
    options: NormalizedChoiceOptionReference[] = [],
  ): NormalizedCharacterChoice => ({
    id: getNormalizedClassChoiceId(owner, label, level),
    label,
    kind: family === 'swords' ? 'optional-feature' : 'item',
    owner: { ...owner, featureName: leaf.name, featureSource: leaf.source },
    level,
    minimumSelections: Math.max(...counts),
    maximumSelections: Math.max(...counts),
    selectionCountByLevel: counts,
    options,
    repeatable: false,
    replacement: { cadence: 'never' },
    source: {
      kind: 'class-feature-options',
      field:
        level === leaf.level
          ? `subclassFeatureRefs:${rule.leaf}:entries.legacy-v1`
          : `legacy-subclass-gain-v1:${rule.leaf}`,
    },
  })
  if (family === 'swords') {
    const progression = sub.optionalfeatureProgression?.filter(
      (p) => p.name === 'Fighting Style' && JSON.stringify(p.featureType) === '["FS:B"]',
    )
    const block = leaf.entries![1] as {
      count?: number
      entries?: Array<{ type?: string; optionalfeature?: string }>
    }
    if (progression?.length !== 1 || block.count !== 1 || block.entries?.length !== 2) return []
    const counts = normalizeProgression(progression[0].progression)
    if (counts.some((n, i) => n !== (i >= 2 ? block.count : 0))) return []
    const options = block.entries.map((v) => ({
      entityType: 'optionalFeature' as const,
      name: v.optionalfeature!.split('|')[0],
      source: v.optionalfeature!.split('|')[1] || 'PHB',
    }))
    return [base('Fighting Style', 3, counts, options)]
  }
  const text = JSON.stringify(leaf.entries),
    filter = parseFilterTags(text).find((r) => r.entityType === 'item')?.filter
  if (!filter) return []
  const total = inferSelectionCounts(text, 3, 2)
  const tools = [...text.matchAll(/\{@item ([^|}]+)\|([^|}]+)(?:\|[^}]*)?\}/gu)].map((m) => ({
    entityType: 'item' as const,
    name: m[1],
    source: m[2],
  }))
  if (tools.length !== 2) return []
  return (Object.entries(KENSEI_POOLS) as [KenseiPool, (typeof KENSEI_POOLS)[KenseiPool]][]).map(
    ([pool, p]) => ({
      ...base(
        p.label,
        p.level,
        pool === 'additional'
          ? total.map((n) => Math.max(0, n - 2))
          : total.map((n) => (n ? 1 : 0)),
        pool === 'tools'
          ? tools
          : pool === 'ranged' || pool === 'additional'
            ? [{ entityType: 'item' as const, name: 'Longbow', source: filter.source! }]
            : [],
      ),
      ...(pool === 'tools'
        ? {}
        : {
            optionFilter: {
              ...filter,
              ...(pool === 'additional'
                ? {}
                : { weaponRanges: [pool === 'melee' ? ('melee' as const) : ('ranged' as const)] }),
            },
          }),
    }),
  )
}

export function isLegacyChoiceItemEligible(
  choice: NormalizedCharacterChoice,
  item: Item5e,
  catalog: Pick<LegacySubclassChoiceCatalog, 'itemPropertyByAbbr' | 'itemTypeByAbbr'>,
): boolean {
  if (
    !unconflicted(item) ||
    key(item.source) !== 'phb' ||
    (item.rarity !== undefined && key(item.rarity) !== 'none') ||
    item.reqAttune ||
    item.wondrous
  )
    return false
  if (choice.label === KENSEI_POOLS.tools.label)
    return (
      choice.options.some(
        (v) => key(v.name) === key(item.name) && key(v.source) === key(item.source),
      ) && item.type?.toString().split('|')[0] === 'AT'
    )
  const type = item.type?.toString().split('|')[0]
  if (!['M', 'R'].includes(type ?? '')) return false
  return (
    (type === 'R' &&
      (!choice.optionFilter?.weaponRanges?.length ||
        choice.optionFilter.weaponRanges.includes('ranged')) &&
      choice.options.some(
        (v) => key(v.name) === key(item.name) && key(v.source) === key(item.source),
      )) ||
    (!!choice.optionFilter &&
      key(getItemPropertyLabel('H|PHB', catalog.itemPropertyByAbbr)) === 'heavy' &&
      key(getItemPropertyLabel('S|PHB', catalog.itemPropertyByAbbr)) === 'special' &&
      matchesClassChoiceFilter(
        item,
        choice.optionFilter,
        catalog.itemPropertyByAbbr,
        catalog.itemTypeByAbbr,
        [],
        20,
      ))
  )
}

/** Build once per filtered view. Scoped dependencies never change ordinary catalog availability. */
export function buildLegacySubclassChoiceCatalogs(
  data: GameData,
  classes: readonly Class5e[],
): LegacySubclassChoiceCatalog[] {
  const owners = classes.flatMap((cls) =>
    (cls.subclasses ?? []).flatMap((sub) => {
      const choices = getLegacySubclassChoices(cls, sub, { classes })
      return choices.length ? [{ cls, sub, choices }] : []
    }),
  )
  if (!owners.length) return []
  const lookups = {
    itemPropertyByAbbr: buildItemPropertyLookup(data.itemProperties ?? []),
    itemTypeByAbbr: buildItemTypeLookup(data.itemTypes ?? []),
  }
  const unique = <T extends { name: string; source?: string }>(rows: readonly T[]) => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const k = `${key(row.name)}|${key(row.source)}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return rows.filter(
      (row) => counts.get(`${key(row.name)}|${key(row.source)}`) === 1 && unconflicted(row),
    )
  }
  const items = unique(data.itemsBase ?? []),
    optional = unique(
      (data.optionalfeatures ?? []).filter(
        (v): v is OptionalFeatureLike =>
          !!v && typeof v === 'object' && 'name' in v && 'source' in v,
      ),
    )
  return owners.map(({ cls, sub, choices }) => ({
    ownerKey: getFeatureOwnerKey(cls.name, cls.source, sub.name, sub.source),
    ...lookups,
    items: items.filter((item) =>
      choices.some(
        (choice) => choice.kind === 'item' && isLegacyChoiceItemEligible(choice, item, lookups),
      ),
    ),
    optionalFeatures: optional.filter((row) =>
      choices.some((c) =>
        c.options.some(
          (v) =>
            v.entityType === 'optionalFeature' &&
            key(v.name) === key(row.name) &&
            key(v.source) === key(row.source),
        ),
      ),
    ),
  }))
}
