// Closed development-time adapters for prose-only paired proficiency grants. Runtime uses certificates.
import semanticCheckpoint from './subclass-proficiency-ancestor-semantics.json' with {
  type: 'json',
}

const NUMBERS = { one: 1, two: 2 }
const fail = (message) => {
  throw new Error(message)
}
const only = (value, fields) => Object.keys(value).every((key) => fields.includes(key))
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const FEATURE_FIELDS = [
  'name',
  'source',
  'page',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'header',
  'srd',
  'entries',
  '_copy',
]
const ROOT_FIELDS = [
  'name',
  'shortName',
  'source',
  'className',
  'classSource',
  'page',
  'reprintedAs',
  'isReprinted',
  'edition',
  'additionalSpells',
  'subclassFeatures',
  'hasFluffImages',
  '_copy',
  'fluff',
  'srd',
  'optionalfeatureProgression',
]
const COPY_FIELDS = [
  'name',
  'source',
  'shortName',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  '_preserve',
]
const PRESERVE_FIELDS = [
  'page',
  'otherSources',
  'referenceSources',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
]
function checkCopy(record) {
  if (!record._copy) return
  if (
    !only(record._copy, COPY_FIELDS) ||
    (record._copy._preserve &&
      (!only(record._copy._preserve, PRESERVE_FIELDS) ||
        Object.values(record._copy._preserve).some((value) => value !== true)))
  )
    fail('Unsupported subclass proficiency copy directive')
}

export function deriveArtisanToolPool(uid, documents, classify) {
  const [name, source, ...extra] = uid.split('|')
  if (!name || !source || extra.length) fail('Tool group must be fully qualified')
  const groups = documents
    .flatMap((doc) => doc.itemGroup ?? [])
    .filter((row) => row.name === name && row.source === source)
  if (groups.length !== 1) fail('Artisan tool group missing or ambiguous')
  const group = groups[0]
  if (
    !only(group, [
      'name',
      'source',
      'page',
      'srd52',
      'basicRules2024',
      'type',
      'rarity',
      'items',
    ]) ||
    group.type !== `AT|${source}` ||
    group.rarity !== 'none' ||
    !Array.isArray(group.items) ||
    !group.items.length
  )
    fail('Unsupported artisan group shape')
  const records = documents.flatMap((doc) => [...(doc.item ?? []), ...(doc.baseitem ?? [])])
  const names = group.items.map((uid) => {
    if (typeof uid !== 'string') fail('Malformed tool group member')
    const [memberName, memberSource, ...extra] = uid.split('|')
    if (!memberName || !memberSource || extra.length) fail('Unqualified tool group member')
    const matches = records.filter((row) => row.name === memberName && row.source === memberSource)
    if (
      matches.length !== 1 ||
      !classify.selectable(matches[0]) ||
      !classify.types(matches[0].type).includes('AT')
    )
      fail('Missing, ambiguous or ineligible tool group member')
    return memberName.toLowerCase()
  })
  if (new Set(names).size !== names.length) fail('Duplicate tool group member')
  return { names: names.sort(), category: 'AT', group, members: group.items }
}

export function deriveSubclassProficiencyRules(features, toolsFor, identity, digest) {
  const seen = new Set()
  return features
    .filter((row) => row.name === 'Blessings of Knowledge')
    .map((feature) => {
      const target = identity(feature)
      if (
        !target ||
        seen.has(target) ||
        ['name', 'source', 'className', 'classSource', 'subclassShortName', 'subclassSource'].some(
          (field) => typeof feature[field] !== 'string' || !feature[field].trim(),
        ) ||
        !Number.isInteger(feature.level) ||
        feature.level < 1 ||
        feature.level > 20
      )
        fail('Duplicate or malformed paired proficiency producer')
      seen.add(target)
      if (
        !only(feature, FEATURE_FIELDS) ||
        !Array.isArray(feature.entries) ||
        feature.entries.some((entry) => typeof entry !== 'string')
      )
        fail('Unsupported paired proficiency source shape')
      const [first, second] = feature.entries
      const legacy =
        /^At (\d+)(?:st|nd|rd|th) level, you learn (one|two) languages of your choice\. You also become proficient in your choice of (one|two) of the following skills: (.+)\.$/.exec(
          first,
        )
      const revised =
        /^You gain proficiency with (one|two) type of \{@item ([^}]+)\} of your choice and in (one|two) of the following skills of your choice: (.+)\. You have \{@variantrule Expertise\|XPHB\} in those two skills\.$/.exec(
          first,
        )
      if (
        !(
          legacy &&
          feature.entries.length === 2 &&
          Number(legacy[1]) === feature.level &&
          second ===
            'Your proficiency bonus is doubled for any ability check you make that uses either of those skills.'
        ) &&
        !(revised && feature.entries.length === 1)
      )
        fail('Unsupported paired proficiency clauses')
      const poolText = legacy?.[4] ?? revised[4]
      if (!/^(?:\{@skill [^|}]+(?:\|XPHB)?\}(?:, |, or | or )?)+$/.test(poolText))
        fail('Malformed paired skill pool')
      const skillPool = [...poolText.matchAll(/\{@skill ([^|}]+)(?:\|XPHB)?\}/g)].map((row) =>
        row[1].toLowerCase(),
      )
      if (!skillPool.length || new Set(skillPool).size !== skillPool.length)
        fail('Duplicate paired skill pool')
      const sibling = legacy
        ? { domain: 'languages', count: NUMBERS[legacy[2]] }
        : {
            domain: 'tools',
            count: NUMBERS[revised[1]],
            toolPool: toolsFor(revised[2]).names,
            toolCategory: toolsFor(revised[2]).category,
          }
      const count = NUMBERS[legacy?.[3] ?? revised[3]]
      // The revised clause itself refers to those TWO skills; do not accept a changed count independently.
      if (revised && count !== 2)
        fail('Revised paired count conflicts with linked Expertise clause')
      return {
        target,
        digest: digest(feature.entries),
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        optional: false,
        domains: [
          {
            domain: 'expertise',
            count,
            tools: [],
            skillPool,
            coupled: true,
            excludeExisting: !!revised,
            distinctEarlier: false,
          },
          sibling,
        ],
      }
    })
    .sort((a, b) => a.target.localeCompare(b.target))
}

/** Discover finite owner certificates from the SAME production copies and UID traversal. */
export function deriveSubclassProficiencyCertificates(documents, rules, api) {
  const validateMetadata = (record, root = false) => {
    if (record.srd !== undefined && typeof record.srd !== 'boolean')
      fail('Unsupported subclass srd metadata')
    if (root && record.optionalfeatureProgression !== undefined) {
      if (!api.validateProgression) fail('Unadmitted subclass progression metadata')
      api.validateProgression(record)
    }
  }
  const result = { features: [], roots: [] }
  const supported = new Set(rules.map((rule) => rule.target))
  const admittedContexts = api.admittedContexts ?? []
  const admittedOwners = new Set(admittedContexts.map((row) => JSON.stringify(row.owner)))
  const admittedTargets = new Set(
    admittedContexts.flatMap((row) => row.paths.map((path) => path.target)),
  )
  if (
    admittedOwners.size !== admittedContexts.length ||
    [...admittedTargets].some((target) => !supported.has(target))
  )
    fail('Invalid admitted subclass proficiency contexts')
  for (const document of documents) {
    const rawRoots = document.subclass ?? []
    const rawFeatures = document.subclassFeature ?? []
    const roots = api.materializeRoots(rawRoots)
    const features = api.materializeFeatures(rawFeatures)
    const candidates = (target) => features.filter((row) => api.identity(row) === target)
    const resolve = (target) =>
      candidates(target).length === 1 ? candidates(target)[0] : undefined
    const needed = new Set()
    for (let index = 0; index < roots.length; index++) {
      const root = roots[index],
        raw = rawRoots[index]
      const refs = (root.subclassFeatures ?? []).map((uid) => api.decode(uid))
      const paths = api.paths(refs, resolve).filter((path) => supported.has(path.target))
      const owner = api.owner(root)
      // Admitted owners must still validate their original intro/semantics when a changed
      // descendant makes path discovery empty. Another owner cannot replace that evidence.
      if (!paths.length && !admittedOwners.has(JSON.stringify(owner))) continue
      if (
        !owner ||
        rawRoots.filter((row) => same(api.owner(row), owner)).length !== 1 ||
        !only(raw, ROOT_FIELDS)
      )
        fail('Missing, duplicate or unsupported subclass root')
      checkCopy(raw)
      validateMetadata(raw, true)
      validateMetadata(root, true)
      const copies = []
      let current = raw
      const seen = new Set()
      while (current._copy) {
        checkCopy(current)
        const key = api.copyKey(current._copy)
        if (!key || seen.has(key)) fail('Invalid subclass copy closure')
        seen.add(key)
        const matches = rawRoots.filter((row) => api.copyKey(row) === key)
        if (
          matches.length !== 1 ||
          rawRoots.filter((row) => same(api.owner(row), api.owner(matches[0]))).length !== 1 ||
          !only(matches[0], ROOT_FIELDS)
        )
          fail('Ambiguous subclass copy base')
        copies.push({ key, digest: api.digest(matches[0]) })
        validateMetadata(matches[0], true)
        current = matches[0]
      }
      const intro = api.intro(root, refs)?.ref
      if (
        !intro ||
        paths.some(
          (path) =>
            path.refs[0] !== intro &&
            !(path.refs.length === 1 && refs.some((ref) => ref.ref === path.refs[0])),
        ) ||
        new Set(paths.map((path) => path.target)).size !== paths.length
      )
        fail('Ambiguous enabling proficiency path')
      needed.add(api.identity(api.decode(intro)))
      for (const path of paths)
        for (const uid of path.refs) needed.add(api.identity(api.decode(uid)))
      result.roots.push({
        owner,
        shortName: root.shortName,
        rawDigest: api.digest(raw),
        metadataDigest: api.digest(api.metadata(root, true)),
        fields: Object.keys(root).sort(),
        copies,
        declarations: root.subclassFeatures,
        intro,
        paths,
      })
    }
    const rawByTarget = (target) => rawFeatures.filter((row) => api.identity(row) === target)
    for (const target of needed) {
      const rows = rawByTarget(target),
        effective = candidates(target)
      if (rows.length !== 1 || effective.length !== 1 || !only(rows[0], FEATURE_FIELDS))
        fail('Missing, duplicate or unsupported enabling feature')
      const raw = rows[0],
        feature = effective[0],
        copies = []
      validateMetadata(raw)
      validateMetadata(feature)
      // Leaf mechanics use the closed grammar above. Parent prose and wrappers need a separate
      // reviewed semantic checkpoint that ordinary generation cannot silently refresh.
      if (!supported.has(target)) {
        const reviewed = semanticCheckpoint.ancestors.filter((row) => row.target === target)
        if (reviewed.length !== 1 || reviewed[0].digest !== api.digest(feature))
          fail(`Unreviewed enabling feature semantics: ${target}`)
      }
      let current = raw
      const seen = new Set()
      while (current._copy) {
        checkCopy(current)
        const parent = api.identity(current._copy)
        if (!parent || seen.has(parent)) fail('Invalid feature copy closure')
        seen.add(parent)
        const matches = rawByTarget(parent)
        if (matches.length !== 1 || !only(matches[0], FEATURE_FIELDS))
          fail('Ambiguous feature copy base')
        copies.push({ target: parent, digest: api.digest(matches[0]) })
        validateMetadata(matches[0])
        current = matches[0]
      }
      result.features.push({
        target,
        rawDigest: api.digest(raw),
        metadataDigest: api.digest(api.metadata(feature)),
        fields: Object.keys(feature).sort(),
        entries: feature.entries.map((entry) => ({
          digest: api.entriesDigest([entry]),
          ...(entry?.type === 'refSubclassFeature'
            ? { reference: api.identity(api.decode(entry.subclassFeature)) }
            : {}),
        })),
        copies,
      })
    }
  }
  for (const key of ['features', 'roots']) {
    const identity = (row) => (key === 'features' ? row.target : JSON.stringify(row.owner))
    if (new Set(result[key].map(identity)).size !== result[key].length)
      fail('Duplicate checkpoint producer')
    result[key].sort((a, b) => identity(a).localeCompare(identity(b)))
  }
  if (
    rules.some(
      (rule) =>
        !result.roots.some((root) => root.paths.some((path) => path.target === rule.target)),
    )
  )
    fail('No enabling root for proficiency target')
  const contextKey = (row) => JSON.stringify(row.owner)
  const currentContexts = result.roots
    .filter(
      (row) =>
        admittedOwners.has(contextKey(row)) ||
        row.paths.some((path) => admittedTargets.has(path.target)),
    )
    .map(({ owner, intro, paths }) => ({ owner, intro, paths }))
    .sort((a, b) => contextKey(a).localeCompare(contextKey(b)))
  const expectedContexts = [...admittedContexts].sort((a, b) =>
    contextKey(a).localeCompare(contextKey(b)),
  )
  if (!same(currentContexts, expectedContexts))
    fail('Unreviewed admitted subclass proficiency owner/intro/path closure')
  return result
}
