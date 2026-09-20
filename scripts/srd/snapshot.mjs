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

function filterCollections(payload, collections, relativePath, coverage, rootExclusions = {}) {
  const output = {}
  for (const collection of collections) {
    const exclusionKey = `${relativePath}#${collection}`
    const exclusions = new Set(rootExclusions[exclusionKey] ?? [])
    const candidates = selectedArray(payload, collection)
    const records = candidates.filter(
      (record, index) =>
        !exclusions.has(auditIdentity(record, collection, `${collection}[${index}]`)),
    )
    assertUniqueIdentities(relativePath, collection, records)
    output[collection] = records
    coverage.roots[`${relativePath}#${collection}`] = records.length
    if (candidates.length !== records.length) {
      coverage.exclusions[exclusionKey] = candidates.length - records.length
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

function selectApprovedSupport(records, references, collection, allowlist, coverage) {
  const approvals = new Map()
  for (const approval of allowlist.dependencies ?? []) {
    if (approval?.collection !== collection || !Array.isArray(approval.identities)) continue
    for (const identity of approval.identities) approvals.set(identity, approval)
  }
  const selected = []
  const seen = new Set()

  for (const reference of [...references].sort()) {
    const record = findSupportRecord(records, reference)
    if (!record) throw new Error(`Missing ${collection} dependency for ${reference}`)
    const identity = supportIdentity(record)
    const approval = approvals.get(identity)
    if (!approval) {
      throw new Error(
        `Unapproved ${collection} dependency ${identity} (referenced as ${reference})`,
      )
    }
    if (seen.has(identity)) continue
    seen.add(identity)
    selected.push(record)
    coverage.dependencies.push({
      collection,
      identity,
      reason: `Referenced by an SRD item as ${reference}`,
      srdVersion: approval.srdVersion,
      officialSection: approval.officialSection,
    })
  }

  return selected.sort((left, right) => supportIdentity(left).localeCompare(supportIdentity(right)))
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

  const files = new Map()
  const coverage = { roots: {}, dependencies: [], exclusions: {} }
  const rootOutputs = new Map()

  for (const [relativePath, collections] of Object.entries(ROOT_COLLECTIONS)) {
    const output = filterCollections(
      await readJson(sourceRoot, relativePath),
      collections,
      relativePath,
      coverage,
      allowlist.rootExclusions,
    )
    rootOutputs.set(relativePath, output)
    addFile(files, `data/${relativePath}`, output)
  }

  addFile(files, 'data/books.json', { book: [] })
  addFile(files, 'data/adventures.json', { adventure: [] })
  addFile(files, 'data/magicvariants.json', { magicvariant: [] })

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
      allowlist.rootExclusions,
    )
    if (output.class.length === 0 && output.subclass.length === 0) continue
    bundledClassIndex[slug] = filename
    addFile(files, `data/${relativePath}`, output)
  }
  addFile(files, 'data/class/index.json', bundledClassIndex)

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
    addFile(files, `data/${relativePath}`, { spell: spells })
  }
  addFile(files, 'data/spells/index.json', bundledSpellIndex)

  const lookup = await readJson(sourceRoot, 'generated/gendata-spell-source-lookup.json')
  addFile(
    files,
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
  const supportReferences = collectItemSupportReferences([
    ...baseitems,
    ...(itemOutput?.item ?? []),
    ...(itemOutput?.itemGroup ?? []),
  ])
  const itemProperties = selectApprovedSupport(
    itemsBase.itemProperty ?? [],
    supportReferences.itemProperty,
    'itemProperty',
    allowlist,
    coverage,
  )
  const itemTypes = selectApprovedSupport(
    itemsBase.itemType ?? [],
    supportReferences.itemType,
    'itemType',
    allowlist,
    coverage,
  )
  addFile(files, 'data/items-base.json', {
    baseitem: baseitems,
    itemMastery: itemMasteries,
    itemProperty: itemProperties,
    itemType: itemTypes,
  })

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
