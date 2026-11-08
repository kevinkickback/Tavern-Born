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
function validateFeature(feature, fields, structured = false) {
  if (
    !only(feature, fields) ||
    !Array.isArray(feature.entries) ||
    (!structured && feature.entries.some((row) => typeof row !== 'string')) ||
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

function deriveTrainingTool(tool, source, itemDocuments) {
  const name = tool.toLowerCase()
  const records = itemDocuments.flatMap((doc) => [...(doc.item ?? []), ...(doc.baseitem ?? [])])
  const matching = (printing) =>
    records.filter(
      (item) =>
        item.name?.toLowerCase() === name &&
        item.source === printing &&
        ['AT', 'T'].includes(item.type?.split('|')[0]),
    )
  const originals = matching(source)
  if (originals.length !== 1) fail('Ambiguous fixed training tool')
  const reprints = (originals[0].reprintedAs ?? []).filter(
    (reference) => typeof reference === 'string' && reference.toLowerCase() === `${name}|xphb`,
  )
  const reprint =
    source === 'PHB' && reprints.length === 1 && matching('XPHB').length === 1 ? 'XPHB' : undefined
  return { name, source, ...(reprint && { reprint }) }
}

function deriveMonkTraining(feature, itemDocuments) {
  const mercy =
    feature.name === 'Implements of Mercy' &&
    feature.subclassShortName === 'Mercy' &&
    (feature.classSource === 'PHB'
      ? feature.source === 'TCE'
      : feature.classSource === 'XPHB' && feature.source === 'XPHB')
  const drunken =
    feature.name === 'Bonus Proficiencies' &&
    feature.subclassShortName === 'Drunken Master' &&
    feature.classSource === 'PHB' &&
    feature.source === 'XGE'
  if (
    feature.className !== 'Monk' ||
    feature.source !== feature.subclassSource ||
    (!mercy && !drunken)
  )
    return undefined
  validateFeature(feature, SUBCLASS_FIELDS, mercy)
  if (feature._copy) fail('Copied Monk training feature')
  const classical = feature.classSource === 'PHB'
  const clause = feature.entries[mercy && classical ? 1 : 0]
  if (typeof clause !== 'string') fail('Missing Monk training grant')
  const match = mercy
    ? /^You gain proficiency in the (\{@skill [^{}]+\} and \{@skill [^{}]+\}) skills(?:, and you gain| and) proficiency with the \{@item ([^{}|]+)\|([^{}|]+)\}\.$/.exec(
        clause,
      )
    : /^When you choose this tradition at (\d+)(?:st|nd|rd|th) level, you gain proficiency in the (\{@skill [^{}]+\}) skill if you don't already have it\. [^.]+\. You also gain proficiency with \{@item ([^{}|]+)\|([^{}|]+)\} if you don't already have it\.$/.exec(
        clause,
      )
  const [tags, tool, printing] = match?.slice(mercy ? 1 : 2) ?? []
  if (
    !tags ||
    printing.toUpperCase() !== feature.classSource ||
    (!mercy && Number(match[1]) !== feature.level)
  )
    fail('Unsupported Monk training grant')
  const skills = [...tags.matchAll(/\{@skill ([^|{}]+)(?:\|([^|{}]+))?\}/g)]
  if (
    skills.length !== (mercy ? 2 : 1) ||
    skills.some((tag) => tag[2] !== (classical ? undefined : feature.classSource))
  )
    fail('Unsupported Monk skill source')
  const trainingTool = deriveTrainingTool(tool, feature.classSource, itemDocuments)
  return {
    training: { skills: skills.map((tag) => tag[1].toLowerCase()), tools: [trainingTool.name] },
    trainingTool,
  }
}

function deriveRogueToolTraining(feature, itemDocuments) {
  const revised =
    feature.classSource === 'XPHB' &&
    feature.source === 'XPHB' &&
    feature.subclassShortName === 'Assassin' &&
    feature.name === "Assassin's Tools"
  const classic =
    feature.classSource === 'PHB' &&
    ((feature.source === 'PHB' &&
      feature.subclassShortName === 'Assassin' &&
      feature.name === 'Bonus Proficiencies') ||
      (feature.source === 'XGE' &&
        feature.subclassShortName === 'Mastermind' &&
        feature.name === 'Master of Intrigue'))
  if (
    feature.className !== 'Rogue' ||
    feature.source !== feature.subclassSource ||
    !(revised || classic)
  )
    return undefined
  validateFeature(feature, [...SUBCLASS_FIELDS, 'srd', 'srd52', 'basicRules2024'])
  const line = feature.entries[0]
  const clause = revised
    ? /^You gain a (\{@item [^{}]+\}) and a (\{@item [^{}]+\}), and you have proficiency with them\.$/.exec(
        line,
      )
    : /^When you choose this archetype at (\d+)(?:st|nd|rd|th) level, you gain proficiency with the (\{@item [^{}]+\})(?: and the |, the )(\{@item [^{}]+\})(?:\.|, and one \{@item [^{}]+\} of your choice\. You also learn \w+ languages? of your choice\.)$/.exec(
        line,
      )
  if (!clause || feature._copy || (!revised && Number(clause[1]) !== feature.level))
    fail('Unsupported Rogue tool training grant')
  const source = revised ? 'XPHB' : 'PHB'
  const trainingTools = clause.slice(revised ? 1 : 2).map((tag) => {
    const match = /^\{@item ([^{}|]+)\|([^{}|]+)\}$/.exec(tag)
    if (!match || match[2].toUpperCase() !== source)
      fail('Unsupported Rogue training tool reference')
    return deriveTrainingTool(match[1], source, itemDocuments)
  })
  if (new Set(trainingTools.map((row) => row.name)).size !== 2)
    fail('Duplicate Rogue training tools')
  return { training: { tools: trainingTools.map((row) => row.name) }, trainingTools }
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

const heavy = { armor: ['heavy'] }
const heavyAndMartial = { ...heavy, weapons: ['martial'] }
const clericDomainTraining = new Map([
  [
    'subclass-feature|bonus proficiency|cleric|phb|death|dmg|1|dmg',
    ['9b922e8c3cd04cc219682e2a52ebdc5f7717f5700f2a7e7a7277f2c45f49c803', { weapons: ['martial'] }],
  ],
  [
    'subclass-feature|bonus proficiency|cleric|phb|nature|phb|1|phb',
    ['10e57a32318d54dfff9585879066b76dca5f4fd18432d9420f33f6fc4fbcfca4', heavy],
  ],
  [
    'subclass-feature|bonus proficiencies|cleric|phb|tempest|phb|1|phb',
    ['27f1f3b2e22022f4a24f7ed468d3dece559ccd125ac29a91057c46daf48a1337', heavyAndMartial],
  ],
  [
    'subclass-feature|bonus proficiencies|cleric|phb|war|phb|1|phb',
    ['27f1f3b2e22022f4a24f7ed468d3dece559ccd125ac29a91057c46daf48a1337', heavyAndMartial],
  ],
  [
    'subclass-feature|bonus proficiency|cleric|phb|solidarity (psa)|psa|1|psa',
    ['0304e2bb832fbcbd35697d52218ce3a0edffbfd8ee95b634980f559e8cc5d235', heavy],
  ],
  [
    'subclass-feature|bonus proficiency|cleric|phb|strength (psa)|psa|1|psa',
    ['10e57a32318d54dfff9585879066b76dca5f4fd18432d9420f33f6fc4fbcfca4', heavy],
  ],
  [
    'subclass-feature|bonus proficiencies|cleric|phb|zeal (psa)|psa|1|psa',
    ['27f1f3b2e22022f4a24f7ed468d3dece559ccd125ac29a91057c46daf48a1337', heavyAndMartial],
  ],
  [
    'subclass-feature|bonus proficiencies|cleric|phb|order|tce|1|tce',
    ['7794c6de8f2c398b33a360f8d16a68c0181cda23f451789df91f26078c17a1f2', heavy],
  ],
  [
    'subclass-feature|bonus proficiencies|cleric|phb|twilight|tce|1|tce',
    ['aa020e3bb541ac6a8c2974acf8a01bf949b602999a8aa6cf1baadfd31d5dc6fe', heavyAndMartial],
  ],
  [
    'subclass-feature|bonus proficiency|cleric|phb|forge|xge|1|xge',
    [
      '7a6e43269e3a9554ef011b4051e4623f2d2396b620830dc6459dc9391c3b052d',
      { ...heavy, tools: ["smith's tools"] },
    ],
  ],
])
const arcaneInitiate = 'subclass-feature|arcane initiate|cleric|phb|arcana|scag|1|scag'

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
      const monk = deriveMonkTraining(feature, api.toolDocuments)
      const rogue = deriveRogueToolTraining(feature, api.toolDocuments)
      if (rogue) {
        push(
          feature,
          'fixed-training',
          { ...rogue, subclassGainPosition: 'first' },
          api.subclassIdentity,
        )
        continue
      }
      if (monk) {
        push(
          feature,
          'fixed-training',
          { ...monk, subclassGainPosition: 'first' },
          api.subclassIdentity,
        )
        continue
      }
      if (
        feature.name === 'Arcane Archer Lore' &&
        feature.className === 'Fighter' &&
        feature.classSource === 'XPHB' &&
        feature.subclassShortName === 'Arcane Archer' &&
        feature.source === 'AU' &&
        feature.subclassSource === 'AU'
      ) {
        validateFeature(feature, SUBCLASS_FIELDS, true)
        const sections = feature.entries.filter((entry) => entry?.name === 'Skills')
        const [section] = sections
        const text =
          sections.length === 1 &&
          section.type === 'entries' &&
          only(section, ['type', 'name', 'entries']) &&
          section.entries?.length === 1 &&
          typeof section.entries[0] === 'string'
            ? section.entries[0]
            : ''
        const match =
          /^You gain proficiency in the \{@skill ([^{}|]+)\|XPHB\} and \{@skill ([^{}|]+)\|XPHB\} skills\. If you already have one of these proficiencies, you instead gain proficiency in a different skill of your choice from the skills available to Fighters at level 1 \(or in two skills available to Fighters at level 1 if you have both\)\.$/.exec(
            text,
          )
        if (feature._copy || !match || match[1] === match[2])
          fail('Unsupported revised Arcane Archer Lore skill producer')
        const skills = match.slice(1).map((skill) => skill.toLowerCase())
        push(
          feature,
          'fixed-training',
          {
            training: { skills },
            startingSkillFallbacks: skills,
            subclassGainPosition: 'first',
          },
          api.subclassIdentity,
        )
        continue
      }
      if (
        feature.name === 'Iron Mind' &&
        feature.className === 'Ranger' &&
        feature.subclassShortName === 'Gloom Stalker' &&
        feature.subclassSource === feature.source &&
        ((feature.classSource === 'PHB' && feature.source === 'XGE') ||
          (feature.classSource === 'XPHB' && feature.source === 'XPHB'))
      ) {
        validateFeature(feature, SUBCLASS_FIELDS)
        const line = feature.entries[0]
        const opening =
          feature.classSource === 'PHB'
            ? /^By (\d+)(?:st|nd|rd|th) level, you have honed your ability to resist the mind-altering powers of your prey\. /.exec(
                line,
              )
            : /^You have honed your ability to resist mind-altering powers\. /.exec(line)
        const clause = opening && line.slice(opening[0].length)
        const saves =
          clause &&
          /^You gain proficiency in (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throws\. If you already have this proficiency, you instead gain proficiency in (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) or (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throws \(your choice\)\.$/.exec(
            clause,
          )
        if (
          feature._copy ||
          feature.entries.length !== 1 ||
          !saves ||
          (feature.classSource === 'PHB' && Number(opening[1]) !== feature.level) ||
          new Set(saves.slice(1)).size !== 3
        )
          fail('Unsupported Iron Mind saving throw grant')
        const [fixed, ...alternatives] = saves.slice(1).map((name) => name.toLowerCase())
        push(
          feature,
          'fixed-training',
          {
            training: { savingThrows: [fixed] },
            subclassGainPosition: 'at-level',
            fallback: { name: fixed, count: 1, savingThrowPool: alternatives },
          },
          api.subclassIdentity,
        )
        continue
      }
      if (
        feature.name === 'Elegant Courtier' &&
        feature.className === 'Fighter' &&
        feature.classSource === 'PHB' &&
        feature.source === 'XGE' &&
        feature.subclassShortName === 'Samurai' &&
        feature.subclassSource === feature.source
      ) {
        validateFeature(feature, SUBCLASS_FIELDS)
        const bonus =
          /^Starting at (\d+)(?:st|nd|rd|th) level, your discipline and attention to detail allow you to excel in social situations\. Whenever you make a (Charisma) \(\{@skill ([^|{}]+)\}\) check, you gain a bonus to the check equal to your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier\.$/.exec(
            feature.entries[0],
          )
        const save =
          /^Your self-control also causes you to gain proficiency in (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throws\. If you already have this proficiency, you instead gain proficiency in (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) or (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throws \(your choice\)\.$/.exec(
            feature.entries[1],
          )
        if (
          feature._copy ||
          feature.entries.length !== 2 ||
          !bonus ||
          Number(bonus[1]) !== feature.level ||
          !save ||
          new Set(save.slice(1)).size !== 3
        )
          fail('Unsupported Elegant Courtier proficiency producer')
        const [fixed, ...alternatives] = save.slice(1).map((name) => name.toLowerCase())
        push(
          feature,
          'fixed-training',
          {
            training: { savingThrows: [fixed] },
            subclassGainPosition: 'at-level',
            fallback: { name: fixed, count: 1, savingThrowPool: alternatives },
            skillCheckModifier: {
              skill: bonus[3].toLowerCase(),
              checkAbility: bonus[2].toLowerCase(),
              bonusAbility: bonus[4].toLowerCase(),
            },
          },
          api.subclassIdentity,
        )
        continue
      }
      if (target === 'subclass-feature|unfettered mind|cleric|xphb|knowledge|frhof|6|frhof') {
        validateFeature(feature, SUBCLASS_FIELDS)
        if (
          feature._copy ||
          api.entriesDigest(feature.entries, false) !==
            'd0691c227d9e1d465134490834ddc45ec7564f4c4e08c6d78c27e7212a997271'
        )
          fail('Unsupported Unfettered Mind source')
        push(
          feature,
          'fixed-training',
          {
            training: { savingThrows: ['intelligence'] },
            subclassGain: {
              owner: ['cleric', 'xphb', 'knowledge domain', 'frhof'],
              target: 'class-feature|subclass feature|cleric|xphb|6|xphb',
              position: 'at-level',
            },
            fallback: {
              name: 'intelligence',
              count: 1,
              savingThrowPool: ['strength', 'dexterity', 'constitution', 'wisdom', 'charisma'],
            },
          },
          api.subclassIdentity,
        )
        continue
      }
      const clericTraining = clericDomainTraining.get(target)
      if (clericTraining || target === arcaneInitiate) {
        const orderReference =
          target === 'subclass-feature|bonus proficiencies|cleric|phb|order|tce|1|tce' &&
          JSON.stringify(feature.otherSources) === JSON.stringify([{ source: 'GGR', page: 25 }])
        validateFeature(feature, [
          ...SUBCLASS_FIELDS,
          'srd',
          'srd52',
          'basicRules2024',
          ...(orderReference ? ['otherSources'] : []),
        ])
        const digest =
          clericTraining?.[0] ?? '0787b6fbfddec98cd53ac175bb1850859bd36889d312c8f72edb0423ca39b0da'
        if (feature._copy || api.entriesDigest(feature.entries, false) !== digest)
          fail('Unsupported Cleric domain training source')
        if (clericTraining)
          push(feature, 'fixed-training', { training: clericTraining[1] }, api.subclassIdentity)
        else
          push(
            feature,
            'fixed-training',
            { training: { skills: ['arcana'] } },
            api.subclassIdentity,
          )
        continue
      }
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
      if (
        feature.className === 'Rogue' &&
        feature.name === 'Slippery Mind' &&
        feature.classSource === feature.source &&
        ['PHB', 'XPHB'].includes(feature.source)
      ) {
        validateFeature(feature, [
          ...FEATURE_FIELDS,
          'srd',
          'srd52',
          'basicRules',
          'basicRules2024',
        ])
        const line = feature.entries[0]
        const classical = feature.source === 'PHB'
        const match = classical
          ? /^By (\d+)(?:st|nd|rd|th) level, you have acquired greater mental strength\. You gain proficiency in ([A-Za-z]+) saving throws\.$/.exec(
              line,
            )
          : /^Your cunning mind is exceptionally difficult to control\. You gain proficiency in ([A-Za-z]+) and ([A-Za-z]+) saving throws\.$/.exec(
              line,
            )
        const saves = (match?.slice(classical ? 2 : 1) ?? []).map((name) => name.toLowerCase())
        if (
          !match ||
          feature.entries.length !== 1 ||
          (classical && Number(match[1]) !== feature.level) ||
          new Set(saves).size !== saves.length ||
          saves.some(
            (name) =>
              ![
                'strength',
                'dexterity',
                'constitution',
                'intelligence',
                'wisdom',
                'charisma',
              ].includes(name),
          )
        )
          fail('Unsupported Slippery Mind saving throw grant')
        const { page: _page, basicRules: _basic, basicRules2024: _basic2024, ...bundled } = feature
        push(
          feature,
          'fixed-training',
          {
            training: { savingThrows: saves },
            bundledMetadataDigest: api.digest(api.metadata(bundled)),
          },
          api.classIdentity,
        )
        continue
      }
      if (
        feature.className === 'Monk' &&
        feature.classSource === feature.source &&
        ((feature.source === 'PHB' && feature.name === 'Diamond Soul') ||
          (feature.source === 'XPHB' && feature.name === 'Disciplined Survivor'))
      ) {
        validateFeature(feature, [...FEATURE_FIELDS, 'srd', 'srd52', 'basicRules2024', 'consumes'])
        const clause = feature.entries[0]
        const classic =
          /^Beginning at (\d+)(?:st|nd|rd|th) level, your mastery of ki grants you proficiency in all saving throws\.$/.exec(
            clause,
          )
        if (
          feature.source === 'PHB'
            ? Number(classic?.[1]) !== feature.level
            : clause !==
              'Your physical and mental discipline grant you proficiency in all saving throws.'
        )
          fail('Unsupported Monk saving throw grant')
        const { page: _page, basicRules2024: _basic, ...bundled } = feature
        push(
          feature,
          'fixed-training',
          {
            training: {
              savingThrows: [
                'strength',
                'dexterity',
                'constitution',
                'intelligence',
                'wisdom',
                'charisma',
              ],
            },
            bundledMetadataDigest: api.digest(api.metadata(bundled)),
          },
          api.classIdentity,
        )
        continue
      }
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
    const omittedSource =
      feature.classSource === 'PHB' &&
      (feature.kind === 'fixed-languages' || ['Monk', 'Rogue'].includes(feature.className))
    const source = omittedSource ? '' : feature.classSource
    const rawDeclaration = roots[0].classFeatures[occurrences[0]]
    if (
      occurrences.length !== 1 ||
      (rawDeclaration !== `${feature.name}|${feature.className}|${source}|${feature.level}` &&
        !(
          ['Monk', 'Rogue'].includes(feature.className) &&
          rawDeclaration ===
            `${feature.name}|${feature.className}|${feature.classSource}|${feature.level}`
        ))
    )
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
