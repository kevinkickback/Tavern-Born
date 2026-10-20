// Closed adapters for prose-only fixed grants. Names, owners and pools come from qualified source.
const fail = (text) => {
  throw new Error(text)
}
const only = (value, fields) => Object.keys(value).every((key) => fields.includes(key))
const FEATURE_FIELDS = ['name', 'source', 'page', 'className', 'classSource', 'level', 'entries']
const SUBCLASS_FIELDS = [
  ...FEATURE_FIELDS,
  'subclassShortName',
  'subclassSource',
  'header',
  '_copy',
]
function skillTags(text) {
  if (typeof text !== 'string') fail('Missing fixed skill clause')
  const names = [...text.matchAll(/\{@skill ([^|}]+)\}/g)].map((row) => row[1].toLowerCase())
  const structure = text.replace(/\{@skill [^|}]+\}/g, 'S')
  if (
    !names.length ||
    !/^S(?:, S)*(?:,? (?:and|or) S)?$/.test(structure) ||
    new Set(names).size !== names.length
  )
    fail('Unsupported fixed skill tags')
  return names
}
function validateFeature(feature, fields) {
  if (
    !only(feature, fields) ||
    !Array.isArray(feature.entries) ||
    feature.entries.some((row) => typeof row !== 'string') ||
    !['name', 'source', 'className', 'classSource'].every(
      (key) => typeof feature[key] === 'string' && feature[key].trim(),
    ) ||
    (fields.includes('subclassShortName') &&
      !['subclassShortName', 'subclassSource'].every(
        (key) => typeof feature[key] === 'string' && feature[key].trim(),
      )) ||
    ['page', 'header'].some(
      (key) => feature[key] !== undefined && (!Number.isInteger(feature[key]) || feature[key] < 0),
    ) ||
    !Number.isInteger(feature.level) ||
    feature.level < 1 ||
    feature.level > 20
  )
    fail('Unsupported fixed proficiency producer')
}

export function deriveFixedProficiencyRules(documents, api) {
  const features = []
  const push = (feature, kind, mechanics, identity) => {
    const target = identity(feature)
    if (!target || features.some((row) => row.target === target))
      fail('Duplicate fixed proficiency target')
    features.push({
      target,
      name: feature.name,
      className: feature.className,
      classSource: feature.classSource,
      level: feature.level,
      kind,
      ...mechanics,
      digest: api.entriesDigest(feature.entries, false),
      metadataDigest: api.digest(api.metadata(feature)),
      fields: [
        ...Object.keys(feature),
        'featureOptionSourceConflict',
        'fixedProficiencySourceAudit',
      ].sort(),
    })
  }
  for (const document of documents) {
    for (const feature of api.materializeFeatures(document.subclassFeature ?? [])) {
      if (!['Survivalist', 'Royal Envoy'].includes(feature.name)) continue
      validateFeature(feature, SUBCLASS_FIELDS)
      if (feature.name === 'Survivalist') {
        const match =
          /^When you choose this archetype at (\d+)(?:st|nd|rd|th) level, you gain proficiency in the (.+) skills if you don't already have it\. Your proficiency bonus is doubled for any ability check you make that uses either of those proficiencies\.$/.exec(
            feature.entries[0],
          )
        if (feature.entries.length !== 1 || !match || Number(match[1]) !== feature.level)
          fail('Unsupported fixed skill pair clause')
        const skills = skillTags(match[2])
        if (skills.length !== 2) fail('Fixed either clause requires two skills')
        push(feature, 'fixed-skills', { skills }, api.subclassIdentity)
      } else {
        const intro =
          'A Purple Dragon Knight serves as an envoy of the Cormyrean crown. Knights of high standing are expected to conduct themselves with grace.'
        const grant =
          /^At (\d+)(?:st|nd|rd|th) level, you gain proficiency in the \{@skill ([^|}]+)\} skill\. If you are already proficient in it, you gain proficiency in one of the following skills of your choice: (.+)\.$/.exec(
            feature.entries[1],
          )
        const doubled =
          /^Your proficiency bonus is doubled for any ability check you make that uses \{@skill ([^|}]+)\}\. You receive this benefit regardless of the skill proficiency you gain from this feature\.$/.exec(
            feature.entries[2],
          )
        if (
          feature.entries.length !== 3 ||
          feature.entries[0] !== intro ||
          !grant ||
          !doubled ||
          Number(grant[1]) !== feature.level ||
          grant[2] !== doubled[1]
        )
          fail('Unsupported historical fallback clause')
        const skill = grant[2].toLowerCase()
        push(
          feature,
          'historical-skill',
          { skills: [skill], fallback: { name: skill, count: 1, skillPool: skillTags(grant[3]) } },
          api.subclassIdentity,
        )
      }
    }
    for (const feature of document.classFeature ?? []) {
      if (feature.name !== 'Tool Expertise') continue
      validateFeature(feature, [...FEATURE_FIELDS, 'otherSources'])
      const annotation = /^\{@i (\d+)(?:st|nd|rd|th)-level ([^}]+) feature\}$/.exec(
        feature.entries[0],
      )
      if (
        feature.entries.length !== 2 ||
        !annotation ||
        Number(annotation[1]) !== feature.level ||
        annotation[2] !== feature.className.toLowerCase() ||
        feature.entries[1] !==
          'Your proficiency bonus is now doubled for any ability check you make that uses your proficiency with a tool.' ||
        (feature.otherSources !== undefined &&
          (!Array.isArray(feature.otherSources) ||
            feature.otherSources.some(
              (row) =>
                !row ||
                typeof row !== 'object' ||
                Array.isArray(row) ||
                !only(row, ['source', 'page']) ||
                typeof row.source !== 'string' ||
                !row.source.trim() ||
                !Number.isInteger(row.page) ||
                row.page < 0,
            )))
      )
        fail('Unsupported proficient tool clause')
      push(feature, 'proficient-tools', {}, api.classIdentity)
    }
  }
  const directClasses = []
  for (const feature of features.filter((row) => row.kind === 'proficient-tools')) {
    const roots = documents
      .flatMap((doc) => doc.class ?? [])
      .filter(
        (row) =>
          row.name?.trim().toLowerCase() === feature.className.toLowerCase() &&
          row.source?.trim().toLowerCase() === feature.classSource.toLowerCase(),
      )
    if (roots.length !== 1 || roots[0]._copy || !Array.isArray(roots[0].classFeatures))
      fail('Ambiguous direct fixed owner')
    const rawDeclaration = `${feature.name}|${feature.className}|${feature.classSource}|${feature.level}`
    const occurrences = []
    const scan = (value, ordinal) => {
      if (typeof value === 'string') {
        if (api.classIdentity(api.decodeClass(value)) === feature.target) occurrences.push(ordinal)
      } else if (Array.isArray(value))
        value.forEach((row) => {
          scan(row, ordinal)
        })
      else if (value && typeof value === 'object')
        Object.values(value).forEach((row) => {
          scan(row, ordinal)
        })
    }
    roots[0].classFeatures.forEach(scan)
    if (occurrences.length !== 1 || roots[0].classFeatures[occurrences[0]] !== rawDeclaration)
      fail('Unsupported or duplicate direct fixed declaration')
    directClasses.push({
      owner: [feature.className.toLowerCase(), feature.classSource.toLowerCase()],
      target: feature.target,
      level: feature.level,
      rawDeclaration,
      declarationDigest: api.digest(rawDeclaration),
      ordinal: occurrences[0],
    })
  }
  return { features: features.sort((a, b) => a.target.localeCompare(b.target)), directClasses }
}

export function deriveConcreteToolNames(records, assess) {
  const names = new Set()
  for (const record of records) {
    const result = assess(record)
    if (result.kind === 'unsupported') fail(`${record.name}|${record.source}: ${result.reason}`)
    if (result.kind === 'eligible') names.add(result.name)
  }
  return [...names].sort()
}
