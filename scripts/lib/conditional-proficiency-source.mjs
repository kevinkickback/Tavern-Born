// Closed development adapters. Runtime consumes finite certificates and qualified conditions only.
import leaves from './conditional-proficiency-semantics.json' with { type: 'json' }
import ancestors from './subclass-proficiency-ancestor-semantics.json' with { type: 'json' }

const fail = (message) => {
  throw new Error(message)
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const only = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => fields.includes(key))
const subclassFields = [
  'name',
  'source',
  'page',
  'srd',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'header',
  'entries',
  '_copy',
]
function featureShape(feature) {
  if (
    !only(feature, subclassFields) ||
    !Array.isArray(feature.entries) ||
    !['name', 'source', 'className', 'classSource', 'subclassShortName', 'subclassSource'].every(
      (key) => typeof feature[key] === 'string' && feature[key].trim(),
    ) ||
    !Number.isInteger(feature.level) ||
    feature.level < 1 ||
    feature.level > 20 ||
    ['page', 'header'].some(
      (key) => feature[key] !== undefined && (!Number.isInteger(feature[key]) || feature[key] < 0),
    ) ||
    (feature.srd !== undefined && typeof feature.srd !== 'boolean')
  )
    fail('Unsupported conditional subclass metadata')
}
function assertSemantic(seed, target, value, digest) {
  const rows = seed.filter((row) => row.target === target)
  if (rows.length !== 1 || rows[0].digest !== digest(value))
    fail(`Unreviewed complete conditional semantics: ${target}`)
}
function tableProgression(carver) {
  const tables = carver.entries.filter(
    (row) => row?.type === 'table' && row.caption === 'Runes Known',
  )
  if (
    tables.length !== 1 ||
    !same(tables[0].colLabels, ['Fighter Level', 'Number of Runes']) ||
    !Array.isArray(tables[0].rows)
  )
    fail('Unsupported rune count table')
  const result = {}
  let lastLevel = 0,
    lastCount = 0
  for (const row of tables[0].rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string' ||
      !/^[1-9]\d*(?:st|nd|rd|th)$/.test(row[0]) ||
      !/^[1-9]\d*$/.test(row[1])
    )
      fail('Malformed rune count row')
    const level = Number.parseInt(row[0], 10),
      count = Number(row[1])
    if (level <= lastLevel || level > 20 || count <= lastCount)
      fail('Invalid rune count progression')
    result[level] = count
    lastLevel = level
    lastCount = count
  }
  if (!lastLevel) fail('Missing rune count progression')
  return result
}

export function validateConditionalSubclassProgression(root, rules) {
  const progression = root.optionalfeatureProgression
  const fire = rules.find((row) => row.family === 'fire-rune')
  if (
    !fire ||
    root.className !== fire.className ||
    root.shortName !== fire.progressionOwner.shortName ||
    root.source !== fire.progressionOwner.source ||
    !Array.isArray(progression) ||
    progression.length !== 1
  )
    fail('Unadmitted conditional progression owner')
  const row = progression[0],
    expected = fire.progression
  if (
    !only(row, ['name', 'featureType', 'progression']) ||
    row.name !== expected.name ||
    !same(row.featureType, expected.featureType) ||
    !only(row.progression, Object.keys(expected.progression)) ||
    Object.keys(row.progression).length !== Object.keys(expected.progression).length ||
    Object.entries(row.progression).some(
      ([level, count]) =>
        !/^[1-9]\d*$/.test(level) || Number(level) > 20 || !Number.isInteger(count) || count < 1,
    ) ||
    !same(row.progression, expected.progression)
  )
    fail('Rune root progression disagrees with its closed source table')
}

export function deriveConditionalProficiencyRules(documents, optionalRecords, api) {
  const features = documents.flatMap((doc) => api.materializeFeatures(doc.subclassFeature ?? []))
  const roots = documents.flatMap((doc) => api.materializeRoots(doc.subclass ?? []))
  const matching = (name, source) =>
    features.filter((row) => row.name === name && row.source === source)
  const dragonRows = matching('Dragon Ancestor', 'PHB'),
    carverRows = matching('Rune Carver', 'TCE')
  const optionalTargets = leaves.leaves.filter((row) => row.target.startsWith('optionalFeature|'))
  if (optionalTargets.length !== 1) fail('Invalid admitted conditional optional target')
  const fireRows = optionalRecords.filter(
    (row) => api.optionalIdentity(row) === optionalTargets[0].target,
  )
  if (dragonRows.length !== 1 || carverRows.length !== 1 || fireRows.length !== 1)
    fail('Conditional source missing or duplicated')
  const dragon = dragonRows[0],
    carver = carverRows[0],
    fire = fireRows[0]
  for (const row of [dragon, carver]) featureShape(row)
  const dragonTarget = api.identity(dragon),
    carverTarget = api.identity(carver)
  const fireTarget = api.optionalIdentity(fire)
  assertSemantic(leaves.leaves, dragonTarget, dragon, api.digest)
  assertSemantic(leaves.leaves, fireTarget, fire, api.digest)
  assertSemantic(ancestors.ancestors, carverTarget, carver, api.digest)
  if (
    !only(fire, ['name', 'source', 'page', 'featureType', 'entries']) ||
    !Number.isInteger(fire.page) ||
    fire.page < 0 ||
    !same(fire.featureType, ['RN']) ||
    !Array.isArray(fire.entries) ||
    fire.entries.length !== 2 ||
    fire.entries.some((row) => typeof row !== 'string')
  )
    fail('Unsupported Fire Rune metadata')
  const fireClause =
    /^This rune's magic channels the masterful craftsmanship of great smiths\. (While wearing or carrying an object inscribed with this rune, your proficiency bonus is doubled for any ability check you make that uses your proficiency with a (tool)\.)$/.exec(
      fire.entries[0],
    )
  const dragonClause =
    /^You can speak, read, and write \{@language Draconic\}\. Additionally, (whenever you make a (Charisma) check when interacting with dragons, your proficiency bonus is doubled if it applies to the check\.)$/.exec(
      dragon.entries[2],
    )
  if (
    !fireClause ||
    !dragonClause ||
    dragon.entries.length !== 3 ||
    dragon.entries[1]?.type !== 'table'
  )
    fail('Unsupported complete conditional proficiency clause')
  const progression = tableProgression(carver)
  const optionGroups = carver.entries.filter((row) => row?.type === 'options')
  const fireRefs = optionGroups
    .flatMap((row) => row.entries ?? [])
    .filter(
      (row) =>
        row?.type === 'refOptionalfeature' && row.optionalfeature === `${fire.name}|${fire.source}`,
    )
  if (
    optionGroups.length !== 1 ||
    fireRefs.length !== 1 ||
    !only(fireRefs[0], ['type', 'optionalfeature']) ||
    optionGroups[0].count !== Object.values(progression)[0]
  )
    fail('Missing exact native Fire Rune option')
  const fireRoots = roots.filter(
    (root) =>
      root.className === carver.className &&
      root.shortName === carver.subclassShortName &&
      root.source === carver.subclassSource,
  )
  if (!fireRoots.length) fail('Missing rune owner')
  const first = fireRoots[0].optionalfeatureProgression
  if (
    !Array.isArray(first) ||
    first.length !== 1 ||
    typeof first[0].name !== 'string' ||
    !first[0].name.trim()
  )
    fail('Missing native rune progression')
  const result = [
    {
      family: 'fire-rune',
      target: carverTarget,
      name: fire.name,
      proficiencyType: fireClause[2],
      note: fireClause[1],
      className: carver.className,
      classSource: carver.classSource,
      level: carver.level,
      optionalTarget: fireTarget,
      progressionOwner: { shortName: carver.subclassShortName, source: carver.subclassSource },
      progression: {
        name: carver.entries
          .find((row) => row?.type === 'table' && row.caption === 'Runes Known')
          .caption.replace(/ Known$/, ''),
        featureType: fire.featureType,
        progression,
      },
    },
    {
      family: 'dragon-ancestor',
      target: dragonTarget,
      name: dragon.name,
      proficiencyType: 'any',
      abilities: [dragonClause[2].toLowerCase()],
      note: dragonClause[1][0].toUpperCase() + dragonClause[1].slice(1),
      className: dragon.className,
      classSource: dragon.classSource,
      level: dragon.level,
    },
  ]
  for (const root of fireRoots) validateConditionalSubclassProgression(root, result)
  const terrainRows = documents
    .flatMap((doc) => doc.classFeature ?? [])
    .filter((row) => api.classIdentity(row) === api.terrainTarget)
  if (terrainRows.length !== 1 || !api.isTerrainSource(terrainRows[0]))
    fail('Unreviewed Natural Explorer source')
  const terrain = terrainRows[0]
  const clause =
    / (When you make an (Intelligence) or (Wisdom) check related to your favored terrain, your proficiency bonus is doubled if you are using a (skill) that you're proficient in\.)$/.exec(
      terrain.entries[0],
    )
  if (!clause) fail('Unsupported complete favored terrain clause')
  result.push({
    family: 'favored-terrain',
    target: api.classIdentity(terrain),
    name: terrain.name,
    proficiencyType: clause[4],
    abilities: [clause[2].toLowerCase(), clause[3].toLowerCase()],
    note: clause[1],
    className: terrain.className,
    classSource: terrain.classSource,
    level: terrain.level,
  })
  return {
    features: result.sort((a, b) => a.target.localeCompare(b.target)),
    optional: [{ target: fireTarget, digest: api.digest(fire), fields: Object.keys(fire).sort() }],
  }
}
