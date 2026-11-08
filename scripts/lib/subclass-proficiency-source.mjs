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
  'srd52',
  'basicRules2024',
  'entries',
  '_copy',
]
const orderSource = (feature) =>
  feature.className === 'Cleric' &&
  feature.subclassShortName === 'Order' &&
  feature.source === 'TCE' &&
  same(feature.otherSources, [{ source: 'GGR', page: 25 }])
const ROOT_FIELDS = [
  'name',
  'shortName',
  'source',
  'className',
  'classSource',
  'page',
  'otherSources',
  'reprintedAs',
  'isReprinted',
  'edition',
  'spellcastingAbility',
  'additionalSpells',
  'subclassFeatures',
  'hasFluff',
  'hasFluffImages',
  '_copy',
  'fluff',
  'srd',
  'srd52',
  'basicRules2024',
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
      'srd',
      'srd52',
      'basicRules',
      'basicRules2024',
      'referenceSources',
      'reprintedAs',
      'type',
      'rarity',
      'items',
    ]) ||
    group.type !== (source === 'PHB' ? 'AT' : `AT|${source}`) ||
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

export function deriveSubclassProficiencyRules(
  features,
  toolsFor,
  identity,
  digest,
  banneretLanguages,
) {
  const seen = new Set()
  const paired = features
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
  const skillRules = new Map([
    [
      'subclass-feature|enchanting conversationalist|wizard|xphb|enchanter|au|3|au',
      {
        body: 'ffa637b456039a2cf908ab25740d95752a22d3dad461a817aeba76873e4c6dac',
        gain: 'class-feature|wizard subclass|wizard|xphb|3|xphb',
        line: 0,
        size: 3,
        modifier: { ability: 'intelligence', minimum: 1 },
      },
    ],
    [
      "subclass-feature|genie's splendor|paladin|xphb|noble genies|frhof|3|frhof",
      {
        body: '3b2c4cd56abd82ef10c08572babe419fc460a4b4c8a8133883c9ee62825845d2',
        gain: 'class-feature|paladin subclass|paladin|xphb|3|xphb',
        line: 1,
        size: 4,
      },
    ],
    [
      'subclass-feature|bonus proficiencies|bard|phb|lore|phb|3|phb',
      {
        body: '9d52343bde0d675d8d598d268c762fe560a104b5fe4c400593e5d660008eae2f',
        gain: 'class-feature|bard college|bard|phb|3|phb',
        count: 3,
      },
    ],
    [
      'subclass-feature|bonus proficiencies|bard|xphb|lore|xphb|3|xphb',
      {
        body: '123c96dc263a9746a220624ca5bc345ea63c98a7563b8128f57aaf383172b84d',
        gain: 'class-feature|bard subclass|bard|xphb|3|xphb',
        count: 3,
      },
    ],
    [
      'subclass-feature|primal lore|bard|xphb|moon|frhof|3|frhof',
      {
        body: '3785fca05cb215e85fbe0a900ab78a57e8e34297bbf8a705c5bb199d977acc32',
        gain: 'class-feature|bard subclass|bard|xphb|3|xphb',
        count: 1,
        line: 1,
        size: 6,
      },
    ],
    [
      'subclass-feature|acolyte of nature|cleric|phb|nature|phb|1|phb',
      {
        body: 'a333dc9b77f5dfb06f7ce040f476bf0263109e41d5c39b104b42cb0a170aea70',
        line: 0,
        size: 3,
      },
    ],
    [
      'subclass-feature|acolyte of strength|cleric|phb|strength (psa)|psa|1|psa',
      {
        body: '8016ac673ade8b69f3ef6b76464bc136ff2732129528f1339bbfdcec77d6f135',
        line: 0,
        size: 4,
      },
    ],
    [
      'subclass-feature|bonus proficiencies|cleric|phb|order|tce|1|tce',
      {
        body: '7794c6de8f2c398b33a360f8d16a68c0181cda23f451789df91f26078c17a1f2',
        line: 0,
        size: 2,
      },
    ],
    [
      'subclass-feature|implement of peace|cleric|phb|peace|tce|1|tce',
      {
        body: '4c99ea02e62d4a382b77eed4f78d566dd9f33f6a4d6c6d75763b8263244420df',
        line: 1,
        size: 3,
      },
    ],
    [
      'subclass-feature|student of arcana|cleric|xphb|arcana|au|3|au',
      {
        body: '08c4d06e11f9585e6e79ede71ee9231fc13bcc77bc7f6258c35e5121abe1d9f3',
        classSkills: true,
        size: 6,
      },
    ],
  ])
  const simpleSkills = features.flatMap((feature) => {
    const target = identity(feature)
    const rule = skillRules.get(target)
    if (!rule) return []
    if (
      seen.has(target) ||
      !only(feature, orderSource(feature) ? [...FEATURE_FIELDS, 'otherSources'] : FEATURE_FIELDS) ||
      !Array.isArray(feature.entries) ||
      digest(feature.entries) !== rule.body
    )
      fail(`Unsupported ${feature.name} source`)
    seen.add(target)
    const cleric = feature.className === 'Cleric'
    const gainTargets = cleric
      ? [
          ...(feature.classSource === 'PHB'
            ? ['class-feature|divine domain|cleric|phb|1|phb']
            : []),
          'class-feature|cleric subclass|cleric|xphb|3|xphb',
        ]
      : [rule.gain]
    const startingSkillPoolBase = rule.classSkills
      ? [...feature.entries[1].entries[0].matchAll(/\{@skill ([^|}]+)\|XPHB\}/g)].map((match) =>
          match[1].toLowerCase(),
        )
      : undefined
    const skillPool =
      rule.line === undefined
        ? null
        : [...feature.entries[rule.line].matchAll(/\{@skill ([^|}]+)(?:\|XPHB)?\}/g)].map((match) =>
            match[1].toLowerCase(),
          )
    if (
      (skillPool && new Set(skillPool).size !== rule.size) ||
      (startingSkillPoolBase && startingSkillPoolBase.length !== 1)
    )
      fail(`Unverified ${feature.name} skill pool`)
    return [
      {
        target,
        digest: rule.body,
        optional: false,
        ...(cleric ? { subclassGainTargets: gainTargets } : { subclassGainTarget: rule.gain }),
        ...(startingSkillPoolBase && { startingSkillPoolBase }),
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        ...(rule.modifier && { skillModifier: { label: feature.name, ...rule.modifier } }),
        domains: [
          {
            domain: 'skills',
            count: rule.count ?? 1,
            skillPool,
            ...((skillPool === null || cleric) && { excludeExisting: true }),
          },
        ],
      },
    ]
  })
  const giantPower = features.flatMap((feature) => {
    const target = identity(feature)
    if (target !== 'subclass-feature|giant power|barbarian|phb|giant|bgg|3|bgg') return []
    if (
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      digest(feature.entries) !== 'c109955cf9249ef99e5a92e48a36544b97a62b2a48cd2d5db92a71ba7e2f3dab'
    )
      fail('Unsupported Giant Power language clause')
    seen.add(target)
    return [
      {
        target,
        digest: digest(feature.entries),
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        optional: false,
        domains: [{ domain: 'languages', count: 1, requiresKnownLanguage: 'giant' }],
      },
    ]
  })
  const studentOfWar = features.flatMap((feature) => {
    if (
      feature.name !== 'Student of War' ||
      feature.className !== 'Fighter' ||
      feature.subclassShortName !== 'Battle Master' ||
      feature.source !== feature.classSource ||
      feature.subclassSource !== feature.classSource ||
      !['PHB', 'XPHB'].includes(feature.classSource)
    )
      return []
    const target = identity(feature)
    if (
      !target ||
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      !Array.isArray(feature.entries) ||
      feature.entries.length !== 1 ||
      typeof feature.entries[0] !== 'string'
    )
      fail('Unsupported Student of War proficiency producer')
    seen.add(target)
    const revised = feature.classSource === 'XPHB'
    const match = revised
      ? /^You gain proficiency with (one|two) type of \{@item ([^}]+)\} of your choice, and you gain proficiency in (one|two) skill of your choice from the skills available to Fighters at level 1\.$/.exec(
          feature.entries[0],
        )
      : /^At (\d+)(?:st|nd|rd|th) level, you gain proficiency with (one|two) type of \{@filter (artisan's tools)\|items\|source=(phb)\|miscellaneous=mundane\|type=artisan's tools\} of your choice\.$/i.exec(
          feature.entries[0],
        )
    if (!match || (!revised && Number(match[1]) !== feature.level))
      fail('Unsupported Student of War rule')
    const group = revised
      ? match[2]
      : `${match[3][0].toUpperCase()}${match[3].slice(1).replace(' tools', ' Tools')}|${match[4].toUpperCase()}`
    const { names: toolPool, category: toolCategory } = toolsFor(group)
    const domains = [
      { domain: 'tools', count: NUMBERS[match[revised ? 1 : 2]], toolPool, toolCategory },
    ]
    if (revised)
      domains.push({
        domain: 'skills',
        count: NUMBERS[match[3]],
        skillPool: null,
        excludeExisting: true,
      })
    return [
      {
        target,
        digest: digest(feature.entries),
        optional: false,
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        ...(revised && { startingSkillPoolBase: [] }),
        subclassGainPosition: 'first',
        domains,
      },
    ]
  })
  const skillOrLanguage = features.flatMap((feature) => {
    if (
      feature.name !== 'Bonus Proficiency' ||
      feature.className !== 'Fighter' ||
      feature.classSource !== 'PHB' ||
      feature.source !== 'XGE' ||
      feature.subclassSource !== 'XGE' ||
      !['Cavalier', 'Samurai'].includes(feature.subclassShortName)
    )
      return []
    const target = identity(feature)
    const [entry] = Array.isArray(feature.entries) ? feature.entries : []
    const match =
      typeof entry === 'string' &&
      /^When you choose this archetype at (\d+)(?:st|nd|rd|th) level, you gain proficiency in (one) of the following skills of your choice: ((?:\{@skill [^{}|]+\}, )+or \{@skill [^{}|]+\})\. Alternatively, you learn (one) language of your choice\.$/.exec(
        entry,
      )
    if (
      !target ||
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      feature.entries?.length !== 1 ||
      !match ||
      Number(match[1]) !== feature.level ||
      match[2] !== match[4]
    )
      fail('Unsupported skill-or-language proficiency producer')
    const skillPool = [...match[3].matchAll(/\{@skill ([^}]+)\}/g)].map((tag) =>
      tag[1].toLowerCase(),
    )
    if (new Set(skillPool).size !== skillPool.length) fail('Duplicate skill alternative')
    seen.add(target)
    return [
      {
        target,
        digest: digest(feature.entries),
        optional: false,
        subclassGainPosition: 'first',
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        domains: [
          {
            domain: 'skill-or-language',
            count: NUMBERS[match[2]],
            skillPool,
            excludeExisting: true,
          },
        ],
      },
    ]
  })
  const knightlyEnvoy = features.flatMap((feature) => {
    if (
      feature.name !== 'Knightly Envoy' ||
      feature.className !== 'Fighter' ||
      feature.classSource !== 'XPHB' ||
      feature.subclassShortName !== 'Banneret' ||
      feature.source !== 'FRHoF' ||
      feature.subclassSource !== feature.source
    )
      return []
    const target = identity(feature)
    const section = (name) => {
      const rows = Array.isArray(feature.entries)
        ? feature.entries.filter((entry) => entry?.name === name)
        : []
      const [row] = rows
      return rows.length === 1 &&
        row.type === 'entries' &&
        only(row, ['name', 'type', 'entries']) &&
        Array.isArray(row.entries) &&
        row.entries.length === 1 &&
        typeof row.entries[0] === 'string'
        ? row.entries[0]
        : ''
    }
    const polyglot =
      /^You learn (one|two) languages? from the language tables in the Player's Handbook or chapter 2 of this book\. When you finish a \{@variantrule Long Rest\|XPHB\}, you can replace a language learned from this benefit with another language you have heard, seen signed, or read in the past 24 hours\.$/.exec(
        section('Polyglot'),
      )
    const wellSpoken =
      /^You gain proficiency in (one|two) of the following skills of your choice: ((?:\{@skill [^{}|]+\|XPHB\}, )+or \{@skill [^{}|]+\|XPHB\})\.$/.exec(
        section('Well Spoken'),
      )
    if (
      !target ||
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      !polyglot ||
      !wellSpoken ||
      !banneretLanguages?.length
    )
      fail('Unsupported Knightly Envoy proficiency producer')
    const skillPool = [...wellSpoken[2].matchAll(/\{@skill ([^{}|]+)\|XPHB\}/g)].map((tag) =>
      tag[1].toLowerCase(),
    )
    if (new Set(skillPool).size !== skillPool.length) fail('Duplicate Knightly Envoy skill')
    seen.add(target)
    return [
      {
        target,
        digest: digest(feature.entries.filter((entry) => entry?.name !== 'Comprehension')),
        optional: false,
        subclassGainPosition: 'first',
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        domains: [
          { domain: 'skills', count: NUMBERS[wellSpoken[1]], skillPool, excludeExisting: true },
          {
            domain: 'languages',
            count: NUMBERS[polyglot[1]],
            languagePool: [...new Set(banneretLanguages.map(([name]) => name))],
            languageSources: banneretLanguages,
            replacement: { cadence: 'long-rest', maximumPerEvent: 1 },
          },
        ],
      },
    ]
  })
  const archerLore = features.flatMap((feature) => {
    if (
      feature.name !== 'Arcane Archer Lore' ||
      feature.className !== 'Fighter' ||
      feature.classSource !== 'PHB' ||
      feature.subclassShortName !== 'Arcane Archer' ||
      feature.source !== 'XGE' ||
      feature.subclassSource !== 'XGE'
    )
      return []
    const target = identity(feature)
    const [entry] = Array.isArray(feature.entries) ? feature.entries : []
    const skillText =
      typeof entry === 'string' &&
      entry.replace(/, and you choose to learn either [^.]+ cantrip\.$/, '.')
    const match =
      skillText &&
      /^At (\d+)(?:st|nd|rd|th) level, you learn magical theory or some of the secrets of nature—typical for practitioners of this elven martial tradition\. You choose to gain proficiency in either the \{@skill ([^{}|]+)\} or the \{@skill ([^{}|]+)\} skill\.$/.exec(
        skillText,
      )
    if (
      !target ||
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      feature.entries?.length !== 1 ||
      !match ||
      Number(match[1]) !== feature.level ||
      match[2] === match[3]
    )
      fail('Unsupported Arcane Archer Lore skill producer')
    seen.add(target)
    return [
      {
        target,
        digest: digest([skillText]),
        optional: false,
        subclassGainPosition: 'first',
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        domains: [
          {
            domain: 'skills',
            count: 1,
            skillPool: match.slice(2).map((skill) => skill.toLowerCase()),
            excludeExisting: true,
          },
        ],
      },
    ]
  })
  const dragonTongues = features.flatMap((feature) => {
    const monk =
      feature.name === 'Draconic Disciple' &&
      feature.className === 'Monk' &&
      feature.subclassShortName === 'Ascendant Dragon'
    const ranger =
      feature.name === 'Draconic Gift' &&
      feature.className === 'Ranger' &&
      feature.subclassShortName === 'Drakewarden'
    if (
      !(monk || ranger) ||
      feature.classSource !== 'PHB' ||
      feature.source !== 'FTD' ||
      feature.subclassSource !== 'FTD'
    )
      return []
    const target = identity(feature)
    const clauses =
      feature.entries?.flatMap((entry) =>
        entry?.type === 'list' && Array.isArray(entry.items)
          ? entry.items.filter((item) => item?.type === 'item' && item.name === 'Tongue of Dragons')
          : [],
      ) ?? []
    const clause = clauses[0]?.entry
    if (
      !target ||
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      feature._copy ||
      clauses.length !== 1 ||
      typeof clause !== 'string' ||
      !/^You learn to speak, read, and write (?:\{@language [^{}|]+\}|Draconic) or one other language of your choice\.$/.test(
        clause,
      )
    )
      fail(`Unsupported ${feature.name} language clause`)
    seen.add(target)
    return [
      {
        target,
        digest: digest(feature.entries),
        optional: false,
        subclassGainPosition: 'first',
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        domains: [{ domain: 'languages', count: 1, excludeExisting: true }],
      },
    ]
  })
  const feyGlamour = features.flatMap((feature) => {
    if (
      feature.name !== 'Otherworldly Glamour' ||
      feature.className !== 'Ranger' ||
      feature.subclassShortName !== 'Fey Wanderer' ||
      feature.source !== feature.subclassSource ||
      !(
        (feature.classSource === 'PHB' && feature.source === 'TCE') ||
        (feature.classSource === 'XPHB' && feature.source === 'XPHB')
      )
    )
      return []
    const target = identity(feature)
    const clauses = (Array.isArray(feature.entries) ? feature.entries : []).flatMap((entry) => {
      const match =
        typeof entry === 'string' &&
        /^(?:In addition, you gain|You also gain) proficiency in (one|two) of (?:the following|these) skills of your choice: ((?:\{@skill [^{}]+\}, )+or \{@skill [^{}]+\})\.$/.exec(
          entry,
        )
      return match ? [match] : []
    })
    const [clause] = clauses
    const tags = clause ? [...clause[2].matchAll(/\{@skill ([^{}|]+)(?:\|([^{}|]+))?\}/g)] : []
    const skillPool = tags.map((tag) => tag[1].toLowerCase())
    if (
      !target ||
      seen.has(target) ||
      !only(feature, FEATURE_FIELDS) ||
      feature._copy ||
      clauses.length !== 1 ||
      tags.some((tag) => tag[2] !== (feature.source === 'XPHB' ? 'XPHB' : undefined)) ||
      new Set(skillPool).size !== tags.length ||
      tags.length < NUMBERS[clause[1]]
    )
      fail('Unsupported Otherworldly Glamour proficiency clause')
    seen.add(target)
    return [
      {
        target,
        digest: digest(feature.entries),
        optional: false,
        subclassGainPosition: 'first',
        fields: [
          ...Object.keys(feature),
          'featureOptionSourceConflict',
          'subclassProficiencySourceAudit',
        ].sort(),
        domains: [
          { domain: 'skills', count: NUMBERS[clause[1]], skillPool, excludeExisting: true },
        ],
      },
    ]
  })
  return [
    ...paired,
    ...simpleSkills,
    ...giantPower,
    ...studentOfWar,
    ...skillOrLanguage,
    ...knightlyEnvoy,
    ...archerLore,
    ...dragonTongues,
    ...feyGlamour,
  ].sort((a, b) => a.target.localeCompare(b.target))
}

/** Discover finite owner certificates from the SAME production copies and UID traversal. */
export function deriveSubclassProficiencyCertificates(documents, rules, api) {
  const rootFields = [...ROOT_FIELDS, ...(api.sourceFields ?? [])]
  const allowedFeature = (row) =>
    only(row, [
      ...FEATURE_FIELDS,
      ...(api.sourceFields ?? []),
      ...(orderSource(row) ? ['otherSources'] : []),
    ])
  const validateMetadata = (record, root = false) => {
    for (const field of ['srd', 'srd52', 'basicRules2024']) {
      if (record[field] !== undefined && typeof record[field] !== 'boolean')
        fail(`Unsupported subclass ${field} metadata`)
    }
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
        !only(raw, rootFields)
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
          !only(matches[0], rootFields)
        )
          fail('Ambiguous subclass copy base')
        copies.push({ key, digest: (api.rootDigest ?? api.digest)(matches[0]) })
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
        rawDigest: (api.rootDigest ?? api.digest)(raw),
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
      if (rows.length !== 1 || effective.length !== 1 || !allowedFeature(rows[0]))
        fail('Missing, duplicate or unsupported enabling feature')
      const raw = rows[0],
        feature = effective[0],
        copies = []
      validateMetadata(raw)
      validateMetadata(feature)
      // Leaf mechanics use the closed grammar above. Parent prose and wrappers need a separate
      // reviewed semantic checkpoint that ordinary generation cannot silently refresh.
      if (!supported.has(target)) {
        const reviewed = (api.reviewedAncestors ?? semanticCheckpoint.ancestors).filter(
          (row) => row.target === target,
        )
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
        if (matches.length !== 1 || !allowedFeature(matches[0])) fail('Ambiguous feature copy base')
        copies.push({ target: parent, digest: api.digest(matches[0]) })
        validateMetadata(matches[0])
        current = matches[0]
      }
      result.features.push({
        target,
        rawDigest: (api.featureDigest ?? api.digest)(raw),
        metadataDigest: api.digest(api.metadata(feature)),
        fields: Object.keys(feature).sort(),
        entries: (api.featureEntries?.(feature) ?? feature.entries).map((entry) => ({
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
