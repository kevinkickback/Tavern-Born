import semantics from './optional-class-feature-semantics.json' with { type: 'json' }

// isClassFeatureVariant identifies candidates, not individual adoption or replacement edges.
// The reviewed complete meanings guard the three prose-only Ranger mappings and mixed gain6 facets.
// Ordinary generation reads this independent semantic input; it never rewrites it.
const fail = (message) => {
  throw new Error(message)
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const key = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const FIREARM = 'class-feature|optional rule: firearm proficiency|artificer|tce|1|tce'
const ownerKey = (row) => JSON.stringify(['class', key(row.name), key(row.source)])
function occurrences(value, target, api) {
  if (typeof value === 'string') return api.classIdentity(api.decodeClass(value)) === target ? 1 : 0
  if (!value || typeof value !== 'object') return 0
  return Object.values(value).reduce((sum, row) => sum + occurrences(row, target, api), 0)
}

export function deriveOptionalClassFeatureRules(documents, ruleRows, api) {
  if (ruleRows.length !== 1 || api.digest(ruleRows[0]) !== api.digest(semantics.authorityRule))
    fail('Optional Class Features|TCE authority changed')
  const classFeatures = documents.flatMap((document) => document.classFeature ?? [])
  const classified = documents
    .flatMap((document) => [
      ...(document.classFeature ?? [])
        .filter((row) => row.isClassFeatureVariant === true || api.classIdentity(row) === FIREARM)
        .map((row) => ({ kind: 'classFeature', target: api.classIdentity(row) })),
      ...api
        .materializeSubclassFeatures(document.subclassFeature ?? [])
        .filter((row) => row.isClassFeatureVariant === true)
        .map((row) => ({ kind: 'subclassFeature', target: api.subclassIdentity(row) })),
    ])
    .sort((left, right) => left.target?.localeCompare(right.target ?? '') ?? -1)
  if (classified.some((row) => !row.target) || !same(classified, semantics.knownOptionalTargets))
    fail(
      'Known optional class declaration census changed; independently assess its identity/defaults',
    )
  const pilot = semantics.pilot
  const parents = documents
    .flatMap((document) => document.class ?? [])
    .filter((row) => ownerKey(row) === JSON.stringify(pilot.owner))
  if (parents.length !== 1) fail('Ranger optional parent is missing or ambiguous')
  const parent = parents[0]
  if (parent._copy || Object.keys(parent).some((field) => !pilot.classFields.includes(field)))
    fail('Ranger optional parent shape changed')
  const features = pilot.features.map((expected) => {
    const rows = classFeatures.filter((row) => api.classIdentity(row) === expected.target)
    if (rows.length !== 1 || api.digest(rows[0]) !== api.digest(expected.sourceRecord))
      fail('Complete Ranger optional/facet meaning changed: ' + expected.target)
    const row = rows[0]
    if (
      !Array.isArray(row.entries) ||
      !row.entries.length ||
      !Number.isInteger(row.level) ||
      row.level < 1 ||
      row.level > 20
    )
      fail('Unsupported Ranger feature shape')
    return {
      target: expected.target,
      name: row.name,
      source: row.source,
      level: row.level,
      fields: Object.keys(row).sort(),
      digest: api.digest(row),
    }
  })
  const featureByTarget = new Map(features.map((row) => [row.target, row]))
  const declarations = pilot.declarations.map((expected) => {
    if (
      !Array.isArray(parent.classFeatures) ||
      !parent.classFeatures.includes(expected.rawDeclaration) ||
      occurrences(parent.classFeatures, expected.target, api) !== 1
    )
      fail('Ranger exact root/facet declaration changed: ' + expected.target)
    const decoded = api.decodeClass(expected.rawDeclaration)
    if (
      api.classIdentity(decoded) !== expected.target ||
      decoded.level !== featureByTarget.get(expected.target)?.level
    )
      fail('Ranger declaration and target disagree')
    return { ...expected, level: decoded.level }
  })
  const roots = pilot.roots.map((root) => {
    const source = featureByTarget.get(root.target)
    if (!source || !classified.some((row) => row.target === root.target))
      fail('Pilot root is not an optional declaration')
    for (const target of [
      ...root.children,
      ...root.replaces.map((row) => row.target),
      ...root.compatible,
    ])
      if (!featureByTarget.has(target)) fail('Pilot dependency lacks complete semantic evidence')
    if (!!root.family !== !!root.replaces.length) fail('Only replacement roots reserve a family')
    for (const facet of root.replaces) {
      if (!facet.entryIndexes) continue
      const original = pilot.features.find((row) => row.target === facet.target).sourceRecord
      if (
        !facet.facet ||
        !facet.entryIndexes.length ||
        new Set(facet.entryIndexes).size !== facet.entryIndexes.length ||
        facet.entryIndexes.some(
          (index) => !Number.isInteger(index) || index < 0 || index >= original.entries.length,
        )
      )
        fail('Invalid reviewed replacement facet')
    }
    return {
      ...root,
      owner: pilot.owner,
      level: source.level,
      name: source.name,
      source: source.source,
    }
  })
  return {
    version: 1,
    knownOptionalTargets: classified,
    parents: [{ owner: pilot.owner, fields: pilot.classFields, declarations }],
    features,
    roots,
  }
}
