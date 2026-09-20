import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export const EXTRACTOR_VERSION = 1

const ROOT_COLLECTIONS = {
  'actions.json': ['action'],
  'backgrounds.json': ['background'],
  'conditionsdiseases.json': ['condition', 'disease', 'status'],
  'cultsboons.json': ['cult', 'boon'],
  'deities.json': ['deity'],
  'feats.json': ['feat'],
  'items.json': ['item', 'itemGroup'],
  'languages.json': ['language'],
  'optionalfeatures.json': ['optionalfeature'],
  'races.json': ['race', 'subrace'],
  'rewards.json': ['reward'],
  'senses.json': ['sense'],
  'skills.json': ['skill'],
  'trapshazards.json': ['trap', 'hazard'],
  'variantrules.json': ['variantrule'],
}

const CLASS_COLLECTIONS = ['class', 'subclass', 'classFeature', 'subclassFeature']
const ALLOWED_SPELL_CLASS_SOURCES = new Set(['PHB', 'XPHB'])
const STRIPPED_METADATA_KEYS = new Set([
  'additionalEntries',
  'additionalSources',
  'basicRules',
  'basicRules2024',
  'hasFluff',
  'hasFluffImages',
  'otherSources',
  'page',
  'reprintedAs',
  'soundClip',
])
const PROHIBITED_PRESENTATION_KEYS = new Set([
  'fluff',
  'fluffimages',
  'foundryimg',
  'image',
  'images',
  'token',
  'tokenurl',
])

export function isSrdRoot(record) {
  return Boolean(
    record && typeof record === 'object' && (record.srd === true || record.srd52 === true),
  )
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObject(value[key])]),
  )
}

export function stableJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`
}

export function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(join(root, ...relativePath.split('/')), 'utf8'))
}

function selectedArray(payload, key) {
  const values = Array.isArray(payload?.[key]) ? payload[key] : []
  return values.filter(isSrdRoot)
}

function addFile(files, relativePath, payload) {
  files.set(relativePath, stableJson(payload))
}

function sanitizeDataPayload(value, coverage) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeDataPayload(entry, coverage))
  if (!value || typeof value !== 'object') return value

  const output = {}
  for (const [key, entry] of Object.entries(value)) {
    if (STRIPPED_METADATA_KEYS.has(key)) {
      coverage.strippedMetadata[key] = (coverage.strippedMetadata[key] ?? 0) + 1
      continue
    }
    output[key] = sanitizeDataPayload(entry, coverage)
  }
  return output
}

function assertBundledDataPolicy(value, relativePath, allowedSources, path = '$') {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertBundledDataPolicy(entry, relativePath, allowedSources, `${path}[${index}]`)
    }
    return
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /\{@(?:image|img)\b/i.test(value)) {
      throw new Error(`Prohibited presentation reference in ${relativePath} at ${path}`)
    }
    return
  }

  if (typeof value.type === 'string' && value.type.toLowerCase() === 'image') {
    throw new Error(`Prohibited image payload in ${relativePath} at ${path}`)
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    if (PROHIBITED_PRESENTATION_KEYS.has(normalizedKey)) {
      throw new Error(`Prohibited presentation field ${key} in ${relativePath} at ${path}`)
    }
    if (
      normalizedKey.endsWith('source') &&
      typeof entry === 'string' &&
      !allowedSources.has(entry.toUpperCase())
    ) {
      throw new Error(`Unexpected source ${entry} in ${relativePath} at ${path}.${key}`)
    }
    assertBundledDataPolicy(entry, relativePath, allowedSources, `${path}.${key}`)
  }
}

function entityIdentity(record, collection, fallback) {
  if (!record || typeof record !== 'object') return fallback
  const name = typeof record.name === 'string' ? record.name : fallback
  const source = typeof record.source === 'string' ? record.source : 'unknown'
  const base = `${name}|${source}`
  if (collection === 'classFeature') {
    return `${base}|${record.className ?? ''}|${record.classSource ?? ''}|${record.level ?? ''}`
  }
  if (collection === 'subclassFeature') {
    return `${base}|${record.className ?? ''}|${record.classSource ?? ''}|${record.subclassShortName ?? ''}|${record.subclassSource ?? ''}|${record.level ?? ''}`
  }
  return base
}

function auditIdentity(record, collection, fallback) {
  const identity = entityIdentity(record, collection, fallback)
  if (collection === 'deity' && typeof record?.pantheon === 'string') {
    return `${identity}|${record.pantheon}`
  }
  return identity
}

function normalized(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function prepareAuditPolicy(allowlist, provenance) {
  const documentVersions = new Set(provenance.documents.map((document) => document.version))
  if (!Array.isArray(allowlist?.allowedSources) || allowlist.allowedSources.length === 0) {
    throw new Error('allowedSources must contain at least one source')
  }
  const allowedSources = new Set()
  for (const source of allowlist.allowedSources) {
    const normalizedSource = requireNonEmptyString(source, 'allowedSources[]').toUpperCase()
    if (allowedSources.has(normalizedSource)) {
      throw new Error(`Duplicate allowed source ${normalizedSource}`)
    }
    allowedSources.add(normalizedSource)
  }
  const rootExclusions = new Map()
  const dependencies = new Map()
  const referenceExclusions = new Map()

  for (const [key, rule] of Object.entries(allowlist?.rootExclusions ?? {})) {
    const reason = requireNonEmptyString(rule?.reason, `rootExclusions.${key}.reason`)
    if (!Array.isArray(rule?.identities) || rule.identities.length === 0) {
      throw new Error(`rootExclusions.${key}.identities must contain at least one identity`)
    }
    const identities = new Set()
    for (const identity of rule.identities) {
      requireNonEmptyString(identity, `rootExclusions.${key}.identities[]`)
      if (identities.has(identity)) throw new Error(`Duplicate root exclusion ${key}:${identity}`)
      identities.add(identity)
    }
    rootExclusions.set(key, { identities, reason, used: new Set() })
  }

  for (const [index, rule] of (allowlist?.dependencies ?? []).entries()) {
    const collection = requireNonEmptyString(rule?.collection, `dependencies[${index}].collection`)
    const srdVersion = requireNonEmptyString(rule?.srdVersion, `dependencies[${index}].srdVersion`)
    if (!documentVersions.has(srdVersion)) {
      throw new Error(`dependencies[${index}] references unknown SRD ${srdVersion}`)
    }
    const officialSection = requireNonEmptyString(
      rule?.officialSection,
      `dependencies[${index}].officialSection`,
    )
    const reason = requireNonEmptyString(rule?.reason, `dependencies[${index}].reason`)
    if (!Array.isArray(rule?.identities) || rule.identities.length === 0) {
      throw new Error(`dependencies[${index}].identities must contain at least one identity`)
    }
    for (const identity of rule.identities) {
      requireNonEmptyString(identity, `dependencies[${index}].identities[]`)
      const key = `${collection}:${identity}`
      if (dependencies.has(key)) throw new Error(`Duplicate dependency approval ${key}`)
      dependencies.set(key, { collection, identity, srdVersion, officialSection, reason })
    }
  }

  for (const [index, rule] of (allowlist?.referenceExclusions ?? []).entries()) {
    const collection = requireNonEmptyString(
      rule?.collection,
      `referenceExclusions[${index}].collection`,
    )
    const source = requireNonEmptyString(rule?.source, `referenceExclusions[${index}].source`)
    const reason = requireNonEmptyString(rule?.reason, `referenceExclusions[${index}].reason`)
    const key = `${collection}:${source.toUpperCase()}`
    if (referenceExclusions.has(key)) throw new Error(`Duplicate reference exclusion ${key}`)
    referenceExclusions.set(key, { collection, source: source.toUpperCase(), reason, used: 0 })
  }

  return {
    allowedSources,
    rootExclusions,
    dependencies,
    referenceExclusions,
    usedDependencies: new Set(),
  }
}

function assertAuditPolicyConsumed(policy) {
  for (const [key, rule] of policy.rootExclusions) {
    const unused = [...rule.identities].filter((identity) => !rule.used.has(identity))
    if (unused.length > 0)
      throw new Error(`Unused root exclusions for ${key}: ${unused.join(', ')}`)
  }
  const unusedDependencies = [...policy.dependencies.keys()].filter(
    (key) => !policy.usedDependencies.has(key),
  )
  if (unusedDependencies.length > 0) {
    throw new Error(`Unused dependency approvals: ${unusedDependencies.join(', ')}`)
  }
  for (const [key, rule] of policy.referenceExclusions) {
    if (rule.used === 0) throw new Error(`Unused reference exclusion ${key}`)
  }
}

function assertUniqueIdentities(relativePath, collection, records) {
  const seen = new Set()
  for (const [index, record] of records.entries()) {
    const identity = entityIdentity(record, collection, `${collection}[${index}]`)
    if (seen.has(identity)) {
      throw new Error(`Duplicate ${identity} in ${relativePath}#${collection}`)
    }
    seen.add(identity)
  }
}

function filterCollections(payload, collections, relativePath, coverage, auditPolicy) {
  const output = {}
  for (const collection of collections) {
    const exclusionKey = `${relativePath}#${collection}`
    const exclusionRule = auditPolicy.rootExclusions.get(exclusionKey)
    const exclusions = exclusionRule?.identities ?? new Set()
    const candidates = selectedArray(payload, collection)
    const records = candidates.filter((record, index) => {
      const identity = auditIdentity(record, collection, `${collection}[${index}]`)
      if (!exclusions.has(identity)) return true
      exclusionRule.used.add(identity)
      return false
    })
    assertUniqueIdentities(relativePath, collection, records)
    output[collection] = records
    coverage.roots[`${relativePath}#${collection}`] = records.length
    if (candidates.length !== records.length) {
      coverage.exclusions[exclusionKey] = candidates.length - records.length
      coverage.exclusionReasons[exclusionKey] = exclusionRule.reason
    }
  }
  return output
}

function parseReference(reference) {
  const [identifier, source] = reference.split('|')
  return { identifier, source }
}

function supportIdentity(record) {
  return `${record.abbreviation}|${record.source}`
}

function findSupportRecord(records, reference) {
  const { identifier, source } = parseReference(reference)
  if (source) {
    return records.find(
      (record) => record?.abbreviation === identifier && record?.source === source,
    )
  }

  const matches = records.filter((record) => record?.abbreviation === identifier)
  if (matches.length === 1) return matches[0]
  return (
    matches.find((record) => record?.source === 'PHB') ??
    matches.find((record) => record?.source === 'DMG')
  )
}

function collectItemSupportReferences(items) {
  const itemType = new Set()
  const itemProperty = new Set()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.type === 'string') itemType.add(item.type)
    if (Array.isArray(item.property)) {
      for (const property of item.property) {
        if (typeof property === 'string') itemProperty.add(property)
      }
    }
  }
  return { itemType, itemProperty }
}

function selectApprovedSupport(records, references, collection, auditPolicy, coverage) {
  const selected = []
  const seen = new Set()

  for (const reference of [...references].sort()) {
    const record = findSupportRecord(records, reference)
    if (!record) throw new Error(`Missing ${collection} dependency for ${reference}`)
    const identity = supportIdentity(record)
    const approvalKey = `${collection}:${identity}`
    const approval = auditPolicy.dependencies.get(approvalKey)
    if (!approval) {
      throw new Error(
        `Unapproved ${collection} dependency ${identity} (referenced as ${reference})`,
      )
    }
    auditPolicy.usedDependencies.add(approvalKey)
    if (seen.has(identity)) continue
    seen.add(identity)
    selected.push(record)
    coverage.dependencies.push({
      collection,
      identity,
      reason: approval.reason,
      reference,
      srdVersion: approval.srdVersion,
      officialSection: approval.officialSection,
    })
  }

  return selected.sort((left, right) => supportIdentity(left).localeCompare(supportIdentity(right)))
}

function parseClassFeatureReference(rawReference, owner) {
  const reference =
    typeof rawReference === 'string'
      ? rawReference
      : rawReference && typeof rawReference === 'object'
        ? rawReference.classFeature
        : undefined
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error(`Invalid classFeature reference on ${owner.name}|${owner.source}`)
  }
  const parts = reference.split('|')
  const level = Number.parseInt(parts[3] ?? '', 10)
  return {
    reference,
    name: parts[0] ?? '',
    className: parts[1] || owner.name || '',
    classSource: parts[2] || owner.source || '',
    level: Number.isNaN(level) ? undefined : level,
    source: parts[4] || parts[2] || owner.source || '',
  }
}

function parseSubclassFeatureReference(reference, owner) {
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error(`Invalid subclassFeature reference on ${owner.name}|${owner.source}`)
  }
  const parts = reference.split('|')
  const level = Number.parseInt(parts[5] ?? '', 10)
  return {
    reference,
    name: parts[0] ?? '',
    className: parts[1] || owner.className || '',
    classSource: parts[2] || owner.classSource || owner.source || '',
    subclassShortName: parts[3] || owner.shortName || owner.subclassShortName || '',
    subclassSource: parts[4] || owner.source || '',
    level: Number.isNaN(level) ? undefined : level,
    source: parts[6] || parts[4] || owner.source || '',
  }
}

function matchesReference(record, reference, fields) {
  return fields.every((field) => {
    if (field === 'level') return reference.level === undefined || record?.level === reference.level
    return normalized(record?.[field]) === normalized(reference[field])
  })
}

function findClassFeatureRecord(records, reference) {
  return records.find((record) =>
    matchesReference(record, reference, ['name', 'source', 'className', 'classSource', 'level']),
  )
}

function findSubclassFeatureRecord(records, reference) {
  return records.find((record) =>
    matchesReference(record, reference, [
      'name',
      'source',
      'className',
      'classSource',
      'subclassShortName',
      'subclassSource',
      'level',
    ]),
  )
}

function recordReferenceCoverage(coverage, key, resolved, excluded) {
  coverage.references[key] = { resolved, excluded }
}

function filterAuditedFeatureReferences({
  owners,
  records,
  field,
  collection,
  relativePath,
  parseReference,
  findRecord,
  auditPolicy,
  coverage,
}) {
  let resolved = 0
  let excluded = 0
  const exclusionReasons = new Set()
  const output = owners.map((owner) => {
    if (!Array.isArray(owner?.[field])) return owner
    const references = owner[field].filter((rawReference) => {
      const reference = parseReference(rawReference, owner)
      if (findRecord(records, reference)) {
        resolved += 1
        return true
      }
      const exclusionKey = `${collection}:${reference.source.toUpperCase()}`
      const exclusion = auditPolicy.referenceExclusions.get(exclusionKey)
      if (!exclusion) {
        throw new Error(
          `Missing ${collection} dependency ${reference.reference} in ${relativePath}`,
        )
      }
      exclusion.used += 1
      excluded += 1
      exclusionReasons.add(exclusion.reason)
      coverage.referenceExclusions.push({
        collection,
        reference: reference.reference,
        owner: `${owner.name}|${owner.source}`,
        reason: exclusion.reason,
      })
      return false
    })
    return { ...owner, [field]: references }
  })
  const coverageKey = `${relativePath}#${field}`
  recordReferenceCoverage(coverage, coverageKey, resolved, excluded)
  if (excluded > 0) {
    coverage.exclusions[coverageKey] = excluded
    coverage.exclusionReasons[coverageKey] = [...exclusionReasons].sort().join(' ')
  }
  return output
}

function validateInlineSubclassReferences(value, records, owner, relativePath) {
  let resolved = 0
  function visit(candidate) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry)
      return
    }
    if (!candidate || typeof candidate !== 'object') return
    if (candidate.type === 'refSubclassFeature') {
      const reference = parseSubclassFeatureReference(candidate.subclassFeature, owner)
      if (!findSubclassFeatureRecord(records, reference)) {
        throw new Error(
          `Missing subclassFeature dependency ${reference.reference} in ${relativePath}`,
        )
      }
      resolved += 1
    }
    for (const entry of Object.values(candidate)) visit(entry)
  }
  visit(value)
  return resolved
}

function validateBaseItemReferences(items, baseitems, coverage) {
  let resolved = 0
  for (const item of items) {
    if (typeof item?.baseItem !== 'string') continue
    const [name, source] = item.baseItem.split('|')
    const matches = baseitems.filter(
      (baseitem) =>
        normalized(baseitem?.name) === normalized(name) &&
        (!source || normalized(baseitem?.source) === normalized(source)),
    )
    if (matches.length !== 1) {
      throw new Error(
        `${matches.length === 0 ? 'Missing' : 'Ambiguous'} baseitem dependency ${item.baseItem} for ${item.name}|${item.source}`,
      )
    }
    resolved += 1
  }
  recordReferenceCoverage(coverage, 'items.json#baseItem', resolved, 0)
}

function filterSpellLookupEntry(entry) {
  if (!entry || typeof entry !== 'object') return {}
  const output = {}

  if (entry.class && typeof entry.class === 'object') {
    const classLookup = Object.fromEntries(
      Object.entries(entry.class).filter(([source]) => ALLOWED_SPELL_CLASS_SOURCES.has(source)),
    )
    if (Object.keys(classLookup).length > 0) output.class = classLookup
  }

  if (entry.subclass && typeof entry.subclass === 'object') {
    const subclassLookup = {}
    for (const [classSource, classNames] of Object.entries(entry.subclass)) {
      if (
        !ALLOWED_SPELL_CLASS_SOURCES.has(classSource) ||
        !classNames ||
        typeof classNames !== 'object'
      ) {
        continue
      }
      const filteredClassNames = {}
      for (const [className, subclassSources] of Object.entries(classNames)) {
        if (!subclassSources || typeof subclassSources !== 'object') continue
        const filteredSubclassSources = Object.fromEntries(
          Object.entries(subclassSources).filter(([source]) =>
            ALLOWED_SPELL_CLASS_SOURCES.has(source),
          ),
        )
        if (Object.keys(filteredSubclassSources).length > 0) {
          filteredClassNames[className] = filteredSubclassSources
        }
      }
      if (Object.keys(filteredClassNames).length > 0)
        subclassLookup[classSource] = filteredClassNames
    }
    if (Object.keys(subclassLookup).length > 0) output.subclass = subclassLookup
  }

  return output
}

function filterSpellLookup(payload, spellsBySource) {
  const output = {}
  for (const [source, spells] of spellsBySource) {
    const sourceKey = source.toLowerCase()
    const sourceLookup = payload?.[sourceKey]
    if (!sourceLookup || typeof sourceLookup !== 'object') continue
    const selectedNames = new Set(spells.map((spell) => String(spell.name).toLowerCase()))
    const entries = Object.fromEntries(
      Object.entries(sourceLookup)
        .filter(([name]) => selectedNames.has(name.toLowerCase()))
        .map(([name, entry]) => [name, filterSpellLookupEntry(entry)]),
    )
    output[sourceKey] = entries
  }
  return output
}

function buildManifest({ files, coverage, provenance, upstreamRevision }) {
  const checksums = Object.fromEntries(
    [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relativePath, contents]) => [relativePath, sha256(contents)]),
  )

  return {
    schemaVersion: 1,
    packId: 'tavern-born-srd-core',
    packVersion: provenance.packVersion,
    distributionStatus: provenance.distributionStatus,
    generatedAt: provenance.snapshotGeneratedAt,
    extractorVersion: EXTRACTOR_VERSION,
    upstreamRevision,
    documents: provenance.documents,
    license: provenance.license,
    transformationNotice: provenance.transformationNotice,
    coverage,
    files: checksums,
  }
}

export async function buildSrdSnapshot({ sourceRoot, provenance, allowlist, upstreamRevision }) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  if (!upstreamRevision) throw new Error('upstreamRevision is required')
  if (
    !provenance?.packVersion ||
    !provenance.snapshotGeneratedAt ||
    !Array.isArray(provenance.documents)
  ) {
    throw new Error('A valid provenance document is required')
  }
  for (const document of provenance.documents) {
    if (
      typeof document?.version !== 'string' ||
      typeof document?.downloadUrl !== 'string' ||
      !/^[a-f0-9]{64}$/.test(document?.sha256 ?? '') ||
      typeof document?.attribution !== 'string'
    ) {
      throw new Error(`Incomplete provenance for SRD ${document?.version ?? 'unknown'}`)
    }
  }

  const auditPolicy = prepareAuditPolicy(allowlist, provenance)
  const files = new Map()
  const coverage = {
    roots: {},
    dependencies: [],
    references: {},
    referenceExclusions: [],
    exclusions: {},
    exclusionReasons: {},
    strippedMetadata: {},
  }
  const addDataFile = (relativePath, payload) => {
    const sanitized = sanitizeDataPayload(payload, coverage)
    assertBundledDataPolicy(sanitized, relativePath, auditPolicy.allowedSources)
    addFile(files, relativePath, sanitized)
  }
  const rootOutputs = new Map()

  for (const [relativePath, collections] of Object.entries(ROOT_COLLECTIONS)) {
    const output = filterCollections(
      await readJson(sourceRoot, relativePath),
      collections,
      relativePath,
      coverage,
      auditPolicy,
    )
    rootOutputs.set(relativePath, output)
    addDataFile(`data/${relativePath}`, output)
  }

  addDataFile('data/books.json', { book: [] })
  addDataFile('data/adventures.json', { adventure: [] })
  addDataFile('data/magicvariants.json', { magicvariant: [] })
  addDataFile('data/fluff-races.json', { raceFluff: [] })
  addDataFile('data/fluff-backgrounds.json', { backgroundFluff: [] })

  const classIndex = await readJson(sourceRoot, 'class/index.json')
  const bundledClassIndex = {}
  for (const [slug, filename] of Object.entries(classIndex)) {
    if (typeof filename !== 'string') continue
    const relativePath = `class/${filename}`
    const output = filterCollections(
      await readJson(sourceRoot, relativePath),
      CLASS_COLLECTIONS,
      relativePath,
      coverage,
      auditPolicy,
    )
    if (output.class.length === 0 && output.subclass.length === 0) continue
    output.class = filterAuditedFeatureReferences({
      owners: output.class,
      records: output.classFeature,
      field: 'classFeatures',
      collection: 'classFeature',
      relativePath,
      parseReference: parseClassFeatureReference,
      findRecord: findClassFeatureRecord,
      auditPolicy,
      coverage,
    })
    output.subclass = filterAuditedFeatureReferences({
      owners: output.subclass,
      records: output.subclassFeature,
      field: 'subclassFeatures',
      collection: 'subclassFeature',
      relativePath,
      parseReference: parseSubclassFeatureReference,
      findRecord: findSubclassFeatureRecord,
      auditPolicy,
      coverage,
    })
    let inlineSubclassReferences = 0
    for (const feature of [...output.classFeature, ...output.subclassFeature]) {
      inlineSubclassReferences += validateInlineSubclassReferences(
        feature,
        output.subclassFeature,
        feature,
        relativePath,
      )
    }
    recordReferenceCoverage(
      coverage,
      `${relativePath}#inlineSubclassFeature`,
      inlineSubclassReferences,
      0,
    )
    bundledClassIndex[slug] = filename
    addDataFile(`data/${relativePath}`, output)
    addDataFile(`data/class/${filename.replace(/^class-/, 'fluff-class-')}`, {
      classFluff: [],
    })
  }
  addDataFile('data/class/index.json', bundledClassIndex)

  const spellIndex = await readJson(sourceRoot, 'spells/index.json')
  const bundledSpellIndex = {}
  const spellsBySource = new Map()
  for (const source of ['PHB', 'XPHB']) {
    const filename = spellIndex[source]
    if (typeof filename !== 'string') throw new Error(`Missing ${source} spell index entry`)
    const relativePath = `spells/${filename}`
    const spells = selectedArray(await readJson(sourceRoot, relativePath), 'spell')
    assertUniqueIdentities(relativePath, 'spell', spells)
    coverage.roots[`${relativePath}#spell`] = spells.length
    bundledSpellIndex[source] = filename
    spellsBySource.set(source, spells)
    addDataFile(`data/${relativePath}`, { spell: spells })
  }
  addDataFile('data/spells/index.json', bundledSpellIndex)

  const lookup = await readJson(sourceRoot, 'generated/gendata-spell-source-lookup.json')
  addDataFile(
    'data/generated/gendata-spell-source-lookup.json',
    filterSpellLookup(lookup, spellsBySource),
  )

  const itemsBase = await readJson(sourceRoot, 'items-base.json')
  const baseitems = selectedArray(itemsBase, 'baseitem')
  const itemMasteries = selectedArray(itemsBase, 'itemMastery')
  assertUniqueIdentities('items-base.json', 'baseitem', baseitems)
  assertUniqueIdentities('items-base.json', 'itemMastery', itemMasteries)
  coverage.roots['items-base.json#baseitem'] = baseitems.length
  coverage.roots['items-base.json#itemMastery'] = itemMasteries.length

  const itemOutput = rootOutputs.get('items.json')
  validateBaseItemReferences(
    [...(itemOutput?.item ?? []), ...(itemOutput?.itemGroup ?? [])],
    baseitems,
    coverage,
  )
  const supportReferences = collectItemSupportReferences([
    ...baseitems,
    ...(itemOutput?.item ?? []),
    ...(itemOutput?.itemGroup ?? []),
  ])
  const itemProperties = selectApprovedSupport(
    itemsBase.itemProperty ?? [],
    supportReferences.itemProperty,
    'itemProperty',
    auditPolicy,
    coverage,
  )
  const itemTypes = selectApprovedSupport(
    itemsBase.itemType ?? [],
    supportReferences.itemType,
    'itemType',
    auditPolicy,
    coverage,
  )
  addDataFile('data/items-base.json', {
    baseitem: baseitems,
    itemMastery: itemMasteries,
    itemProperty: itemProperties,
    itemType: itemTypes,
  })

  assertAuditPolicyConsumed(auditPolicy)
  const manifest = buildManifest({ files, coverage, provenance, upstreamRevision })
  addFile(files, 'manifest.json', manifest)
  return { files, manifest }
}

export function describeSnapshot(snapshot) {
  const rootCount = Object.values(snapshot.manifest.coverage.roots).reduce(
    (total, count) => total + count,
    0,
  )
  return {
    fileCount: snapshot.files.size,
    rootCount,
    dependencyCount: snapshot.manifest.coverage.dependencies.length,
    packVersion: snapshot.manifest.packVersion,
    manifestFile: basename('manifest.json'),
  }
}
