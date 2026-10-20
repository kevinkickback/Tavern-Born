// Class features expose prose, not structured Expertise grants. These closed adapters run only
// during development; the reviewed generated checkpoint owns offline admission and runtime audits.
const METADATA = new Set([
  'name',
  'source',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'className',
  'classSource',
  'level',
  'isClassFeatureVariant',
  'entries',
])
const NUMBERS = { one: 1, two: 2 }
const toolsIn = (text) => [
  ...new Set([...text.matchAll(/\{@item ([^|}]+)\|phb\}/g)].map((row) => row[1].toLowerCase())),
]
const fail = (message) => {
  throw new Error(message)
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const EXPERTISE_ENTRIES = [
  'Expertise is a feature that enhances your use of a skill proficiency. When you make an ability check with a skill proficiency in which you have Expertise, your {@variantrule Proficiency|XPHB|Proficiency Bonus} is doubled for that check unless the bonus is doubled by another feature.',
  "If you gain Expertise, you gain it in one {@variantrule skill|XPHB} in which you have proficiency. You can't have Expertise in the same skill proficiency more than once.",
]
const LANGUAGE_CONTEXT = [
  'Your character knows at least three languages: Common plus two languages you roll or choose from the Standard Languages table. Knowledge of a language means your character can communicate in it, read it, and write it. Your class and other features might also give you languages.',
  'The Standard Languages table lists languages that are widespread on D&D worlds. Every player character knows Common, which originated in the planar metropolis of Sigil, the hub of the multiverse. The other standard languages originated with the first members of the most prominent species in the worlds of D&D and have since spread widely.',
  'The Rare Languages table lists languages that are either secret or derived from other planes of existence and thus less widespread in the worlds of the Material Plane. Some features let a character learn a rare language.',
]
const PRIMORDIAL_NOTE =
  '*Primordial includes the Aquan, Auran, Ignan, and Terran dialects. Creatures that know one of these dialects can communicate with those that know a different one.'
const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key))

export function validateExpertiseRule(rules) {
  if (rules.length !== 1) fail('Expertise|XPHB is missing or ambiguous')
  const rule = rules[0]
  if (
    !onlyKeys(rule, ['name', 'source', 'page', 'srd52', 'basicRules2024', 'ruleType', 'entries']) ||
    rule.name !== 'Expertise' ||
    rule.source !== 'XPHB' ||
    rule.ruleType !== 'C' ||
    !Number.isInteger(rule.page) ||
    rule.page < 0 ||
    ['srd52', 'basicRules2024'].some(
      (key) => rule[key] !== undefined && typeof rule[key] !== 'boolean',
    ) ||
    !same(rule.entries, EXPERTISE_ENTRIES)
  )
    fail('Expertise|XPHB interpretation or metadata changed')
}

function validateShape(feature) {
  if (Object.keys(feature).some((key) => !METADATA.has(key)))
    fail(`Unknown proficiency metadata: ${feature.name}`)
  for (const field of ['name', 'source', 'className', 'classSource'])
    if (typeof feature[field] !== 'string' || !feature[field].trim()) fail(`Missing ${field}`)
  if (
    !Number.isInteger(feature.level) ||
    feature.level < 1 ||
    feature.level > 20 ||
    !Array.isArray(feature.entries)
  )
    fail('Invalid proficiency feature')
  for (const field of ['srd', 'srd52', 'basicRules', 'basicRules2024', 'isClassFeatureVariant'])
    if (feature[field] !== undefined && typeof feature[field] !== 'boolean')
      fail(`Unsupported ${field}`)
  if (feature.page !== undefined && (!Number.isInteger(feature.page) || feature.page < 0))
    fail('Invalid page')
}

/** Source book tables are development-time semantic input, not a runtime full-book dependency. */
export function deriveLanguagePool(book) {
  // The feature links {@book chapter 2|XPHB|2|Choose Languages}. Header matches
  // elsewhere cannot substitute for that target (5etools uses a book chapter index).
  const sections = []
  const findSection = (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    if (value.name === 'Choose Languages') sections.push({ value, path })
    if (Array.isArray(value.entries))
      value.entries.forEach((child, index) => {
        findSection(child, [...path, 'entries', String(index)])
      })
  }
  findSection(book?.data?.[2], ['data', '2'])
  if (sections.length !== 1) fail('Referenced Choose Languages section missing or ambiguous')
  const section = sections[0]
  if (
    !onlyKeys(section.value, ['type', 'name', 'page', 'id', 'entries']) ||
    section.value.type !== 'entries' ||
    !Number.isInteger(section.value.page) ||
    typeof section.value.id !== 'string' ||
    !Array.isArray(section.value.entries) ||
    section.value.entries.length !== 5 ||
    !same(
      [section.value.entries[0], section.value.entries[1], section.value.entries[3]],
      LANGUAGE_CONTEXT,
    )
  )
    fail('Unsupported language-section qualifier or shape')
  const matches = []
  for (const index of [2, 4])
    matches.push({
      value: section.value.entries[index],
      path: [...section.path, 'entries', String(index)],
    })
  if (matches.length !== 2 || new Set(matches.map(({ value }) => value.caption)).size !== 2)
    fail('Language tables missing or ambiguous')
  const names = matches.flatMap(({ value }) => {
    const standard = value.caption === 'Standard Languages'
    if (
      !['Standard Languages', 'Rare Languages'].includes(value.caption) ||
      value.type !== 'table' ||
      !onlyKeys(value, [
        'type',
        'caption',
        'srd52',
        'basicRules2024',
        'colLabels',
        'colStyles',
        'rows',
        'footnotes',
      ]) ||
      !same(
        value.colLabels,
        standard ? ['{@dice 1d12}', 'Language', 'Origin'] : ['Language', 'Origin'],
      ) ||
      !same(value.footnotes, standard ? undefined : [PRIMORDIAL_NOTE]) ||
      !Array.isArray(value.colStyles) ||
      value.colStyles.length !== value.colLabels.length ||
      value.colStyles.some((style) => typeof style !== 'string') ||
      ['srd52', 'basicRules2024'].some(
        (key) => value[key] !== undefined && typeof value[key] !== 'boolean',
      )
    )
      fail('Unsupported language-table qualifier or shape')
    const index = value.colLabels?.indexOf('Language')
    if (index < 0 || !Array.isArray(value.rows)) fail('Language column missing')
    return value.rows.map((row) => {
      if (
        !Array.isArray(row) ||
        row.length !== value.colLabels.length ||
        typeof row.at(-1) !== 'string'
      )
        fail('Unsupported language row')
      if (standard && row[0] !== '—') {
        const cell = row[0],
          roll = cell?.roll
        if (
          !cell ||
          !onlyKeys(cell, ['type', 'roll']) ||
          cell.type !== 'cell' ||
          !roll ||
          !(
            (onlyKeys(roll, ['exact']) &&
              Number.isInteger(roll.exact) &&
              roll.exact >= 1 &&
              roll.exact <= 12) ||
            (onlyKeys(roll, ['min', 'max']) &&
              Number.isInteger(roll.min) &&
              Number.isInteger(roll.max) &&
              roll.min >= 1 &&
              roll.min <= roll.max &&
              roll.max <= 12)
          )
        )
          fail('Unsupported language roll cell')
      }
      const cell = row[index]
      if (typeof cell !== 'string') fail('Unsupported language cell')
      const tagged = /^\{@language ([^|}]+)\|XPHB\}$/.exec(cell)
      const plain = /^[A-Za-z' ]+\*?$/.test(cell) ? cell.replace(/\*$/, '') : undefined
      if (standard ? !tagged : !plain || (cell.endsWith('*') && cell !== 'Primordial*'))
        fail('Unsupported language name shape')
      if (!tagged && !plain) fail('Unsupported language name')
      return (tagged?.[1] ?? plain).toLowerCase()
    })
  })
  if (new Set(names).size !== names.length) fail('Duplicate language name')
  return { names: names.sort(), tables: matches }
}

function deriveDomains(feature, languagePool) {
  validateShape(feature)
  const entries = feature.entries
  // No fuzzy prose inference. Full entry/wrapper shapes and the current/future clauses must match.
  const strings = entries.filter((entry) => typeof entry === 'string')
  const sidekick =
    strings[0] === `{@i ${feature.level}${feature.level === 3 ? 'rd' : 'th'}-level Expert feature}`
  const current = strings[sidekick ? 1 : 0]
  const base = {
    domain: 'expertise',
    tools: [],
    skillPool: null,
    excludeExisting: false,
    distinctEarlier: false,
  }
  let count, future
  if (feature.name === 'Expertise' && entries.length === strings.length) {
    const phb =
      /^At (\d+)(?:st|nd|rd|th) level, (?:you can )?choose (?:another )?(one|two)(?: more)? (?:of your skill proficiencies(?:, or one of your skill proficiencies and your proficiency with \{@item [^|}]+\|phb\})?|skill proficiencies)\. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies\.$/.exec(
        current,
      )
    const laterTools =
      /^At (\d+)(?:st|nd|rd|th) level, you can choose (one|two) more of your proficiencies \(in skills or with \{@item [^|}]+\|phb\}\) to gain the benefit of Expertise\.$/.exec(
        current,
      )
    const revised =
      /^You gain \{@variantrule Expertise\|XPHB\} in (one|two) of your [Ss]kill [Pp]roficiencies of your choice\.(?: (?:\{@skill [^|}]+\|XPHB\} and \{@skill [^|}]+\|XPHB\} are recommended if you have proficiency in them\.))?$/.exec(
        current,
      )
    const lacking =
      /^Choose (one|two) of your skill proficiencies with which you lack \{@variantrule Expertise\|XPHB\}\. You gain \{@variantrule Expertise\|XPHB\} in (?:that skill|those skills)\.$/.exec(
        current,
      )
    const expert =
      /^Choose (one|two) of the sidekick's skill proficiencies\. The sidekick's proficiency bonus is doubled for any ability check it makes that uses any of the chosen proficiencies\.$/.exec(
        current,
      )
    if (phb || laterTools) {
      const row = phb ?? laterTools
      if (Number(row[1]) !== feature.level) fail('Current gain level disagrees')
      count = NUMBERS[row[2]]
      base.tools = toolsIn(current)
      base.distinctEarlier = /another| more /.test(current)
    } else if (revised || lacking) {
      count = NUMBERS[(revised ?? lacking)[1]]
      base.excludeExisting = true
    } else if (sidekick && expert) count = NUMBERS[expert[1]]
    else fail(`Unrecognized Expertise clause: ${feature.className} ${feature.level}`)
    const tail = strings.slice(sidekick ? 2 : 1)
    if (tail.length > 1) fail('Unknown extra Expertise clause')
    if (tail.length) {
      const text = tail[0]
      const legacy =
        /^At (\d+)(?:st|nd|rd|th) level, (?:you can )?choose (?:another )?(one|two)(?: more)? (?:skill proficiencies|of (?:your proficiencies \(in skills or with \{@item [^|}]+\|phb\}\)|the sidekick's skill proficiencies)) to gain this benefit\.$/.exec(
          text,
        )
      const newer =
        /^At (.+) level (\d+), you gain \{@variantrule Expertise\|XPHB\} in (one|two) more of your skill proficiencies of your choice\.$/.exec(
          text,
        )
      if (legacy)
        future = { level: Number(legacy[1]), count: NUMBERS[legacy[2]], tools: toolsIn(text) }
      else if (newer && newer[1] === feature.className)
        future = { level: Number(newer[2]), count: NUMBERS[newer[3]], tools: [] }
      else fail('Unknown future Expertise clause')
    }
  } else if (feature.name === 'Scholar' && entries.length === 1 && strings.length === 1) {
    const scholar =
      /^While studying magic, you also specialized in another field of study\. Choose (one|two) of the following skills in which you have proficiency: (.+)\. You have \{@variantrule Expertise\|XPHB\} in the chosen skill\.$/.exec(
        current,
      )
    if (!scholar) fail('Unknown Scholar clause')
    const skills = [...scholar[2].matchAll(/\{@skill ([^|}]+)\|XPHB\}/g)].map((row) =>
      row[1].toLowerCase(),
    )
    if (
      !skills.length ||
      !/^(?:\{@skill [^|}]+\|XPHB\}(?:, |, or | or )?)+$/.test(scholar[2]) ||
      new Set(skills).size !== skills.length
    )
      fail('Unsupported Scholar pool')
    count = NUMBERS[scholar[1]]
    base.skillPool = skills
    base.excludeExisting = true
  } else if (feature.name === 'Deft Explorer') {
    const canny = entries[2]
    const cannySkill =
      'Choose one of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses the chosen skill.'
    const cannyLanguages =
      'You can also speak, read, and write two additional languages of your choice.'
    if (
      feature.isClassFeatureVariant === true &&
      same(entries, [
        '{@i 1st-level ranger {@variantrule optional class features|tce|optional feature}, which replaces the Natural Explorer feature}',
        'You are an unsurpassed explorer and survivor, both in the wilderness and in dealing with others on your travels. You gain the Canny benefit below, and you gain an additional benefit below when you reach 6th level and 10th level in this class.',
        { name: 'Canny', type: 'entries', entries: [cannySkill, cannyLanguages] },
      ])
    ) {
      return {
        domains: [
          { ...base, count: NUMBERS[/Choose (one)/.exec(canny.entries[0])[1]] },
          {
            domain: 'languages',
            count: NUMBERS[/(two) additional languages/.exec(canny.entries[1])[1]],
          },
        ],
      }
    }
    const skill = entries[1]?.entries?.[0]?.entries?.[0]
    const language = entries[1]?.entries?.[1]?.entries?.[0]
    const skillMatch =
      /^Choose (one|two) of your skill proficiencies with which you lack \{@variantrule Expertise\|XPHB\}\. You gain \{@variantrule Expertise\|XPHB\} in that skill\.$/.exec(
        skill,
      )
    const languageMatch =
      /^You know (one|two) languages of your choice from the language tables in \{@book chapter 2\|XPHB\|2\|Choose Languages\}\.$/.exec(
        language,
      )
    if (
      !skillMatch ||
      !languageMatch ||
      !same(entries, [
        'Thanks to your travels, you gain the following benefits.',
        {
          type: 'entries',
          entries: [
            { type: 'entries', name: 'Expertise', entries: [skill] },
            { type: 'entries', name: 'Languages', entries: [language] },
          ],
        },
      ])
    )
      fail('Unsupported Deft Explorer structure')
    return {
      domains: [
        { ...base, count: NUMBERS[skillMatch[1]], excludeExisting: true },
        { domain: 'languages', count: NUMBERS[languageMatch[1]], languagePool },
      ],
    }
  } else fail(`Unsupported proficiency structure: ${feature.name}`)
  return { domains: [{ ...base, count }], future }
}

export function deriveClassProficiencyRules(features, { languagePool, identity, digest }) {
  const candidates = features.filter((feature) =>
    ['Expertise', 'Scholar', 'Deft Explorer'].includes(feature.name),
  )
  const seen = new Set()
  const derived = candidates.map((feature) => {
    const target = identity(feature)
    if (!target || seen.has(target)) fail(`Duplicate/malformed proficiency producer: ${target}`)
    seen.add(target)
    const { domains, future } = deriveDomains(feature, languagePool)
    return {
      feature,
      future,
      rule: {
        target,
        digest: digest(feature.entries, false),
        fields: [...Object.keys(feature), 'featureOptionSourceConflict'].sort(),
        optional: feature.isClassFeatureVariant === true,
        domains,
      },
    }
  })
  for (const row of derived)
    if (row.future) {
      const next = derived.filter(
        ({ feature }) =>
          feature.className === row.feature.className &&
          feature.classSource === row.feature.classSource &&
          feature.source === row.feature.source &&
          feature.name === row.feature.name &&
          feature.level === row.future.level,
      )
      if (
        next.length !== 1 ||
        next[0].rule.domains[0].count !== row.future.count ||
        !same(next[0].rule.domains[0].tools, row.future.tools)
      )
        fail('Future gain missing, ambiguous or conflicting')
      next[0].rule.domains[0].distinctEarlier = true
    }
  return derived.map(({ rule }) => rule).sort((a, b) => a.target.localeCompare(b.target))
}
