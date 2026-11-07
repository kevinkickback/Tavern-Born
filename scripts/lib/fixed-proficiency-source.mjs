import { deriveThievesCant } from './class-proficiency-source.mjs'

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

function deriveDruidic(feature) {
  validateFeature(feature, [...FEATURE_FIELDS, 'srd', 'srd52', 'basicRules2024'])
  const classic = feature.source === 'PHB'
  const match = classic
    ? /^You know \{@language ([^|{}]+)\}, the secret language of druids\. You can speak the language and use it to leave hidden messages\. /.exec(
        feature.entries[0],
      )
    : /^You know ([^.,{}]+), the secret language of Druids\. While learning this ancient tongue, you also unlocked the magic of communicating with animals; you always have the \{@spell ([^|#{}]+\|[^|#{}]+)\} spell prepared\.$/.exec(
        feature.entries[0],
      )
  if (
    !match ||
    feature.entries.length !== (classic ? 1 : 2) ||
    match[1] !== feature.name ||
    feature.classSource !== feature.source
  )
    fail('Unsupported Druidic grant clause')
  return {
    languages: [match[1].toLowerCase()],
    languageSource: feature.source,
    ...(match[2] && { alwaysPreparedSpell: match[2] }),
  }
}

const bardCollegeTraining = new Map([
  [
    'subclass-feature|bonus proficiencies|bard|phb|valor|phb|3|phb',
    [
      'ad073a13ddb561483fbabe6593a8575963658bb0fef6545e50618b69b5dbce90',
      { armor: ['medium', 'shields'], weapons: ['martial'] },
    ],
  ],
  [
    'subclass-feature|martial training|bard|xphb|valor|xphb|3|xphb',
    [
      'ead1f9c9b3c2176059a9b25bd7cee90830d42a53e0fd72a15d6559df13b86c67',
      { armor: ['medium', 'shields'], weapons: ['martial'] },
    ],
  ],
  [
    'subclass-feature|bonus proficiencies|bard|phb|swords|xge|3|xge',
    [
      'cda40923cfa7efdb9346f58df7b12b23fd256d410e4734bffc157bc0bcef8ead',
      { armor: ['medium'], weapons: ['scimitar'] },
    ],
  ],
  [
    'subclass-feature|channeler|bard|xphb|spirits|rhw|3|rhw',
    [
      '81538ebca283008bf3911485a1a198c11931bf08bdf480a81ae20ea3cd06e7ed',
      { tools: ['playing cards'] },
    ],
  ],
])

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
      const target = api.subclassIdentity(feature)
      const bardTraining = bardCollegeTraining.get(target)
      if (bardTraining || target === 'subclass-feature|primal lore|bard|xphb|moon|frhof|3|frhof') {
        const digest =
          bardTraining?.[0] ?? '3785fca05cb215e85fbe0a900ab78a57e8e34297bbf8a705c5bb199d977acc32'
        if (
          feature._copy ||
          !only(feature, [...SUBCLASS_FIELDS, 'srd52', 'basicRules2024']) ||
          !Array.isArray(feature.entries) ||
          api.entriesDigest(feature.entries, false) !== digest
        )
          fail('Unsupported Bard college fixed proficiency source')
        if (bardTraining) {
          push(feature, 'fixed-training', { training: bardTraining[1] }, api.subclassIdentity)
        } else {
          push(
            feature,
            'fixed-languages',
            { languages: ['druidic'], languageSource: 'XPHB' },
            api.subclassIdentity,
          )
        }
        continue
      }
      if (
        feature.name === 'Wind Speaker' &&
        feature.className === 'Sorcerer' &&
        feature.classSource === 'PHB' &&
        feature.subclassShortName === 'Storm' &&
        feature.subclassSource === 'XGE' &&
        feature.source === 'XGE'
      ) {
        validateFeature(feature, SUBCLASS_FIELDS)
        if (
          feature.level !== 1 ||
          api.entriesDigest(feature.entries, false) !==
            '14469546d676a5cb2672d938a273a9f6125e1ad47482b9f11297082bbd57bd0f'
        )
          fail('Unsupported Wind Speaker grant clause')
        push(
          feature,
          'fixed-languages',
          { languages: ['primordial'], languageSource: 'PHB', useClassLanguagePrinting: true },
          api.subclassIdentity,
        )
        continue
      }
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
      const cant = deriveThievesCant(feature)
      const language = cant
        ? { languages: [cant.language] }
        : feature.name === 'Druidic' &&
            feature.className === 'Druid' &&
            ['PHB', 'XPHB'].includes(feature.source)
          ? deriveDruidic(feature)
          : undefined
      if (language) {
        // The bundled SRD strips the printed page and Basic Rules availability flags.
        const { page: _page, basicRules: _basic, basicRules2024: _basic2024, ...bundled } = feature
        push(
          feature,
          'fixed-languages',
          {
            ...language,
            bundledMetadataDigest: api.digest(api.metadata(bundled)),
          },
          api.classIdentity,
        )
        continue
      }
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
  for (const feature of features.filter((row) => row.target.startsWith('class-feature|'))) {
    const roots = documents
      .flatMap((doc) => doc.class ?? [])
      .filter(
        (row) =>
          row.name?.trim().toLowerCase() === feature.className.toLowerCase() &&
          row.source?.trim().toLowerCase() === feature.classSource.toLowerCase(),
      )
    if (roots.length !== 1 || roots[0]._copy || !Array.isArray(roots[0].classFeatures))
      fail('Ambiguous direct fixed owner')
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
    const source =
      feature.kind === 'fixed-languages' && feature.classSource === 'PHB' ? '' : feature.classSource
    const rawDeclaration = `${feature.name}|${feature.className}|${source}|${feature.level}`
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
