import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const CURRENT_CHARACTER_SCHEMA_VERSION = 1
const dataRoot = join(root, 'data')
const fixtureRoot = join(root, 'tests', 'fixtures')
const fixture2014Path = join(fixtureRoot, 'comprehensive-character-2014.tbc')
const fixture2024Path = join(fixtureRoot, 'comprehensive-character-2024.tbc')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function key(entity) {
  return `${entity.name}|${entity.source}`
}

function loadIndexedPayloads(directory) {
  const index = readJson(join(dataRoot, directory, 'index.json'))
  return Object.values(index).map((fileName) => readJson(join(dataRoot, directory, fileName)))
}

const classPayloads = loadIndexedPayloads('class')
const spellPayloads = loadIndexedPayloads('spells')
const spellSourceLookup = readJson(join(dataRoot, 'generated', 'gendata-spell-source-lookup.json'))
const classes = classPayloads.flatMap((payload) => asArray(payload.class))
const subclasses = classPayloads.flatMap((payload) => asArray(payload.subclass))
const classFeatures = classPayloads.flatMap((payload) => [
  ...asArray(payload.classFeature),
  ...asArray(payload.subclassFeature),
])
const spells = spellPayloads.flatMap((payload) => asArray(payload.spell))
const racePayload = readJson(join(dataRoot, 'races.json'))
const races = asArray(racePayload.race)
const subraces = asArray(racePayload.subrace)
const backgrounds = asArray(readJson(join(dataRoot, 'backgrounds.json')).background)
const feats = asArray(readJson(join(dataRoot, 'feats.json')).feat)
const itemsPayload = readJson(join(dataRoot, 'items.json'))
const baseItemsPayload = readJson(join(dataRoot, 'items-base.json'))
const items = [
  ...asArray(itemsPayload.item),
  ...asArray(baseItemsPayload.baseitem),
  ...asArray(baseItemsPayload.item),
]

function buildLookup(entities) {
  return new Map(entities.map((entity) => [key(entity), entity]))
}

const featLookup = buildLookup(feats)

function editionEntity(entities, name, edition) {
  const marker = edition === '2024' ? 'srd52' : 'srd'
  const marked = entities.find((entity) => entity.name === name && entity[marker] === true)
  if (marked) return marked
  const source = edition === '2024' ? 'XPHB' : 'PHB'
  const exact = entities.find((entity) => entity.name === name && entity.source === source)
  if (!exact) throw new Error(`Missing ${edition} corpus entity: ${name}`)
  return exact
}

function sourceQualifiedReference(reference, entities, edition) {
  const separator = reference.lastIndexOf('|')
  const name = separator >= 0 ? reference.slice(0, separator) : reference
  const entity = editionEntity(entities, name, edition)
  return key(entity)
}

function isSpellOnClassList(spell, className, classSource) {
  const lookupEntry =
    spellSourceLookup[String(spell.source).toLowerCase()]?.[String(spell.name).toLowerCase()]
  return Boolean(lookupEntry?.class?.[classSource]?.[className])
}

function selectClassSpells(className, classSource, edition, countByLevel) {
  const spellSource = edition === '2024' ? 'XPHB' : 'PHB'
  return Object.entries(countByLevel).flatMap(([rawLevel, count]) => {
    const level = Number(rawLevel)
    const candidates = spells
      .filter(
        (spell) =>
          spell.source === spellSource &&
          spell.level === level &&
          isSpellOnClassList(spell, className, classSource),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
    if (candidates.length < count) {
      throw new Error(
        `${edition} ${className} has only ${candidates.length} level-${level} spells; ${count} are required.`,
      )
    }
    return candidates.slice(0, count).map(key)
  })
}

function requireSpellReferences(names, edition) {
  return names.map((name) => sourceQualifiedReference(name, spells, edition))
}

function buildSpellProfiles(race, progression, edition) {
  const wizard = progression.find((entry) => entry.name === 'Wizard')
  const cleric = progression.find((entry) => entry.name === 'Cleric')
  if (!wizard || !cleric) throw new Error(`${edition} fixture requires Wizard and Cleric levels.`)

  const wizardCantripCandidates = selectClassSpells('Wizard', wizard.source, edition, { 0: 8 })
  const wizardCantrips = wizardCantripCandidates.slice(0, 5)
  const wizardSpellbook = selectClassSpells('Wizard', wizard.source, edition, {
    1: 6,
    2: 5,
    3: 5,
    4: 4,
    5: 4,
  })
  const wizardPrepared = [
    ...wizardSpellbook.slice(0, 3),
    ...wizardSpellbook.slice(6, 9),
    ...wizardSpellbook.slice(11, 13),
    ...wizardSpellbook.slice(16, 18),
    ...wizardSpellbook.slice(20, 22),
  ]
  const clericCantrips = selectClassSpells('Cleric', cleric.source, edition, { 0: 4 })
  const clericPrepared = selectClassSpells('Cleric', cleric.source, edition, {
    1: 3,
    2: 3,
    3: 2,
  })
  const lifeDomainSpells = requireSpellReferences(
    [
      'Bless',
      'Cure Wounds',
      'Lesser Restoration',
      'Spiritual Weapon',
      'Beacon of Hope',
      'Revivify',
    ],
    edition,
  )
  const bonusCantrips = wizardCantripCandidates.slice(-2)
  const bonusSpell = selectClassSpells('Wizard', wizard.source, edition, { 1: 7 }).slice(-1)

  const racialProfile =
    edition === '2024'
      ? {
          id: `racial:${race.name}|${race.source}`,
          type: 'racial',
          label: `${race.name} Racial Magic`,
          raceName: race.name,
          raceSource: race.source,
          castingAbility: 'intelligence',
          castingAbilityOptions: ['intelligence', 'wisdom', 'charisma'],
          fixedSpells: requireSpellReferences(
            ['Dancing Lights', 'Faerie Fire', 'Darkness'],
            edition,
          ),
          cantrips: requireSpellReferences(['Dancing Lights'], edition),
          spellsKnown: requireSpellReferences(['Faerie Fire', 'Darkness'], edition),
          preparedSpells: [],
          alwaysPrepared: true,
        }
      : {
          id: `racial:${race.name}|${race.source}`,
          type: 'racial',
          label: `${race.name} Racial Magic`,
          raceName: race.name,
          raceSource: race.source,
          castingAbility: 'intelligence',
          choices: [
            {
              id: 'high-elf-cantrip',
              count: 1,
              isCantrip: true,
              filter: { level: 0, classes: ['Wizard'] },
              selected: [wizardCantripCandidates[5]],
            },
          ],
          cantrips: [wizardCantripCandidates[5]],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: true,
        }

  return [
    {
      id: `class:Wizard|${wizard.source}`,
      type: 'class',
      label: `Wizard (Lv ${wizard.levels})`,
      className: 'Wizard',
      classSource: wizard.source,
      cantrips: wizardCantrips,
      spellsKnown: wizardSpellbook,
      preparedSpells: wizardPrepared,
      alwaysPrepared: false,
    },
    {
      id: `class:Cleric|${cleric.source}`,
      type: 'class',
      label: `Cleric (Lv ${cleric.levels})`,
      className: 'Cleric',
      classSource: cleric.source,
      fixedSpells: lifeDomainSpells,
      alwaysPreparedSpells: lifeDomainSpells,
      cantrips: clericCantrips,
      spellsKnown: lifeDomainSpells,
      preparedSpells: clericPrepared,
      alwaysPrepared: false,
    },
    racialProfile,
    {
      id: 'special:unrestricted',
      type: 'special',
      label: 'Special (Unrestricted)',
      fixedSpells: [...bonusCantrips, ...bonusSpell],
      cantrips: bonusCantrips,
      spellsKnown: bonusSpell,
      preparedSpells: [],
      alwaysPrepared: true,
    },
  ]
}

function resolveArmorType(type) {
  const code = typeof type === 'string' ? type.split('|')[0] : type
  if (code === 'LA') return 'light'
  if (code === 'MA') return 'medium'
  if (code === 'HA') return 'heavy'
  if (code === 'S') return 'shield'
  return undefined
}

function toEquipment(item, id, equipped = false, attuned = false) {
  return {
    id,
    name: item.name,
    type: item.type ?? 'G',
    quantity: 1,
    equipped,
    attuned,
    description: '',
    ...(item.weight !== undefined ? { weight: item.weight } : {}),
    ...(item.value !== undefined ? { value: item.value } : {}),
    ...(item.rarity !== undefined ? { rarity: item.rarity } : {}),
    ...(item.reqAttune !== undefined ? { reqAttune: Boolean(item.reqAttune) } : {}),
    ...(item.ac !== undefined ? { ac: item.ac } : {}),
    ...(resolveArmorType(item.type) ? { armorType: resolveArmorType(item.type) } : {}),
    ...(item.weaponCategory !== undefined ? { weaponCategory: item.weaponCategory } : {}),
    ...(item.dmg1 !== undefined ? { dmg1: item.dmg1 } : {}),
    ...(item.dmg2 !== undefined ? { dmg2: item.dmg2 } : {}),
    ...(item.dmgType !== undefined ? { dmgType: item.dmgType } : {}),
    ...(item.property !== undefined ? { properties: item.property } : {}),
    ...(item.range !== undefined ? { range: item.range } : {}),
    source: item.source,
    ...(item.wondrous !== undefined ? { wondrous: item.wondrous } : {}),
    ...(item.tattoo !== undefined ? { tattoo: item.tattoo } : {}),
    ...(item.focus !== undefined ? { focus: item.focus } : {}),
  }
}

function buildEquipment(seed, edition) {
  const firstRows = seed.equipment.slice(0, 13).map((existing, index) => {
    const counterpart = editionEntity(items, existing.name, edition)
    return toEquipment(
      counterpart,
      `corpus-item-${edition}-${index + 1}`,
      existing.equipped,
      existing.attuned,
    )
  })
  const used = new Set(firstRows.map((item) => key(item)))
  const source = edition === '2024' ? 'XPHB' : 'PHB'
  const nonWeaponTypes = new Set(['M', 'R', 'LA', 'MA', 'HA', 'S'])
  const candidates = items
    .filter(
      (item) =>
        item.source === source &&
        !used.has(key(item)) &&
        !nonWeaponTypes.has(typeof item.type === 'string' ? item.type.split('|')[0] : item.type) &&
        (!item.rarity || item.rarity === 'none') &&
        !item.reqAttune,
    )
    .sort((left, right) => left.name.localeCompare(right.name))
  if (candidates.length === 0) throw new Error(`The ${edition} corpus has no mundane equipment.`)
  const remaining = Array.from({ length: 90 - firstRows.length }, (_, index) =>
    toEquipment(candidates[index % candidates.length], `corpus-gear-${edition}-${index + 1}`),
  )
  return [...firstRows, ...remaining]
}

function emptyProvenance() {
  return {
    proficiencies: {
      armor: {},
      weapons: {},
      tools: {},
      languages: {},
      skills: {},
      savingThrows: {},
    },
    abilityBonuses: [],
    features: {},
    feats: {},
    spells: {},
    equipment: {},
    choices: [],
  }
}

function buildFeatureRows(progression, limit = 17) {
  const rows = []
  const seen = new Set()
  for (const entry of progression) {
    const matching = classFeatures
      .filter(
        (feature) =>
          feature.className === entry.name &&
          feature.classSource === entry.source &&
          feature.source === entry.source &&
          Number(feature.level ?? 1) <= entry.levels &&
          (!feature.subclassShortName || feature.subclassShortName === entry.subclass),
      )
      .sort((left, right) => Number(left.level ?? 1) - Number(right.level ?? 1))
    for (const feature of matching) {
      const featureKey = key(feature)
      if (seen.has(featureKey)) continue
      seen.add(featureKey)
      rows.push({
        id: `corpus-feature-${rows.length + 1}`,
        name: feature.name,
        source: feature.source,
        description: '',
        level: Number(feature.level ?? 1),
      })
      if (rows.length === limit) return rows
    }
  }
  throw new Error(`Selected progression provides only ${rows.length} canonical feature rows.`)
}

function mapFeat(record, edition) {
  let entity
  try {
    entity = editionEntity(feats, record.name, edition)
  } catch {
    entity = featLookup.get(`${record.name}|${record.source}`)
  }
  if (!entity) throw new Error(`Missing feat corpus entity: ${record.name}|${record.source}`)
  return {
    ...record,
    source: entity.source,
    description: '',
    ...(record.prerequisites !== undefined ? { prerequisites: '' } : {}),
    ...(record.classSource ? { classSource: edition === '2024' ? 'XPHB' : 'PHB' } : {}),
    ...(record.options?.spells
      ? {
          options: {
            ...record.options,
            spells: record.options.spells.map((spell) =>
              sourceQualifiedReference(spell, spells, edition),
            ),
          },
        }
      : {}),
  }
}

function buildProgression(seed, edition) {
  return seed.classProgression.map((entry) => {
    const classEntity = editionEntity(classes, entry.name, edition)
    const exactSubclass = subclasses.find(
      (subclass) =>
        subclass.className === entry.name &&
        subclass.name === entry.subclass &&
        subclass.source === classEntity.source,
    )
    const subclassEntity =
      exactSubclass ??
      subclasses.find(
        (subclass) =>
          subclass.className === entry.name &&
          subclass.source === classEntity.source &&
          subclass.srd52 === (edition === '2024' ? true : subclass.srd52),
      )
    if (!subclassEntity) throw new Error(`Missing ${edition} subclass for ${entry.name}`)
    return {
      ...entry,
      source: classEntity.source,
      subclass: subclassEntity.name,
      subclassSource: subclassEntity.source,
    }
  })
}

function buildFeatSelections(seed, edition) {
  if (edition === '2014') return seed.feats.map((feat) => mapFeat(feat, edition))

  const source = 'XPHB'
  return [
    {
      id: 'feat-war-caster',
      name: 'War Caster',
      source,
      description: '',
      prerequisites: '',
      options: { abilityScore: 'intelligence' },
      className: 'Wizard',
      classSource: source,
      classLevel: 4,
    },
    {
      id: 'feat-fey-touched',
      name: 'Fey-Touched',
      source,
      description: '',
      prerequisites: '',
      options: {
        abilityScore: 'intelligence',
        spells: requireSpellReferences(['Bless'], edition),
      },
      className: 'Wizard',
      classSource: source,
      classLevel: 8,
    },
    {
      id: 'feat-resilient',
      name: 'Resilient',
      source,
      description: '',
      prerequisites: '',
      options: { abilityScore: 'constitution' },
      className: 'Fighter',
      classSource: source,
      classLevel: 4,
    },
    {
      id: 'feat-skill-expert',
      name: 'Skill Expert',
      source,
      description: '',
      prerequisites: '',
      options: {
        abilityScore: 'wisdom',
        skills: ['performance'],
        expertiseSkill: 'performance',
      },
      className: 'Cleric',
      classSource: source,
      classLevel: 4,
    },
  ].map((feat) => mapFeat(feat, edition))
}

function buildSpecialFeats(seed, edition, spellProfiles) {
  const specialProfile = spellProfiles.find((profile) => profile.id === 'special:unrestricted')
  if (!specialProfile) throw new Error(`${edition} fixture requires a special spell profile.`)
  const [firstCantrip, secondCantrip] = specialProfile.cantrips
  const firstSpell = specialProfile.spellsKnown[0]
  if (!firstCantrip || !secondCantrip || !firstSpell) {
    throw new Error(`${edition} fixture requires complete Magic Initiate spell selections.`)
  }
  return seed.specialFeats.map((feat) =>
    mapFeat(
      feat.name === 'Magic Initiate'
        ? {
            ...feat,
            options: {
              spellcastingClass: 'Wizard Spells',
              spells: [firstCantrip, secondCantrip, firstSpell],
            },
          }
        : feat,
      edition,
    ),
  )
}

function buildClassChoiceSelections(edition) {
  const source = edition === '2024' ? 'XPHB' : 'PHB'
  const selections = [
    {
      choiceId: `class:fighter|${source.toLowerCase()}|choice:fighting-style|1`,
      label: 'Fighting Style',
      kind: edition === '2024' ? 'feat' : 'optional-feature',
      className: 'Fighter',
      classSource: source,
      classLevel: 1,
      selected: [
        {
          entityType: edition === '2024' ? 'feat' : 'optionalFeature',
          name: 'Defense',
          source,
          slotLevel: 1,
        },
      ],
    },
  ]
  if (edition === '2024') {
    selections.push(
      {
        choiceId: 'class:fighter|xphb|choice:weapon-mastery|1',
        label: 'Weapon Mastery',
        kind: 'item',
        className: 'Fighter',
        classSource: source,
        classLevel: 1,
        selected: ['Battleaxe', 'Dagger', 'Greatsword', 'Longbow'].map((name) => ({
          entityType: 'item',
          name,
          source,
          slotLevel: 1,
        })),
      },
      {
        choiceId: 'class:cleric|xphb|choice:divine-order|1',
        label: 'Divine Order',
        kind: 'class-feature',
        className: 'Cleric',
        classSource: source,
        classLevel: 1,
        selected: [
          {
            entityType: 'classFeature',
            name: 'Protector',
            source,
            slotLevel: 1,
          },
        ],
      },
    )
  }
  return selections
}

function buildFixture(seed, edition) {
  const seedSpeed = seed.movement.speeds.walk
  const race = editionEntity(races, seed.race, edition)
  const background = editionEntity(backgrounds, edition === '2024' ? 'Criminal' : 'Sage', edition)
  const progression = buildProgression(seed, edition)
  const selectedSubrace =
    edition === '2014'
      ? subraces.find(
          (subrace) =>
            subrace.raceName === race.name &&
            subrace.raceSource === race.source &&
            subrace.name === seed.subrace,
        )
      : asArray(race._versions)
          .map((version) => ({
            ...version,
            name:
              typeof version.name === 'string'
                ? (version.name.split(';').at(-1)?.trim() ?? version.name)
                : undefined,
            source: version.source ?? race.source,
          }))
          .find((version) => version.name)
  const mappedProfiles = buildSpellProfiles(race, progression, edition)
  const mappedFeats = buildFeatSelections(seed, edition)
  const mappedSpecialFeats = buildSpecialFeats(seed, edition, mappedProfiles)
  const equipment = buildEquipment(seed, edition)

  const abilityNames = {
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma',
  }
  const backgroundChoices = asArray(background.ability?.[0]?.choose?.weighted?.from)
    .slice(0, 2)
    .map((ability) => abilityNames[ability])
  const provenance = emptyProvenance()
  if (edition === '2024') {
    provenance.feats.alert = [
      {
        sourceType: 'background',
        sourceName: background.name,
        sourceRef: background.source,
        grantType: 'fixed',
        label: background.name,
      },
    ]
  }

  const fixture = {
    ...seed,
    id: `comprehensive-character-${edition}`,
    schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
    name: `Comprehensive Test Character (${edition})`,
    originSystem: edition,
    race: race.name,
    raceSource: race.source,
    ...(selectedSubrace
      ? { subrace: selectedSubrace.name, subraceSource: selectedSubrace.source }
      : { subrace: undefined, subraceSource: undefined }),
    background: background.name,
    backgroundSource: background.source,
    classProgression: progression,
    features: buildFeatureRows(progression),
    feats: mappedFeats,
    specialFeats: mappedSpecialFeats,
    classFeatChoices: [],
    classChoiceSelections: buildClassChoiceSelections(edition),
    fixedFeatOptions: {},
    asiChoices: [],
    spells: { ...seed.spells, spellProfiles: mappedProfiles },
    equipment,
    hitPoints: {
      current: seed.hitPoints.current,
      temporary: seed.hitPoints.temporary,
    },
    hitPointGains: seed.hitPointGains.map((gain) => ({
      ...gain,
      classSource: editionEntity(classes, gain.className, edition).source,
    })),
    hitPointAdjustments: seed.hitPointAdjustments.map((adjustment) => ({
      ...adjustment,
      ...(adjustment.sourceRef?.includes('|')
        ? {
            sourceRef: sourceQualifiedReference(adjustment.sourceRef, feats, edition),
          }
        : {}),
    })),
    allowedSources: [
      ...new Set([
        race.source,
        background.source,
        ...progression.map((entry) => entry.source),
        ...mappedFeats.map((feat) => feat.source),
        ...mappedSpecialFeats.map((feat) => feat.source),
        ...equipment.map((item) => item.source),
      ]),
    ].sort(),
    raceAsiChoices: [],
    backgroundAsiBlockIndex: edition === '2024' ? 0 : undefined,
    backgroundAsiChoices: edition === '2024' ? backgroundChoices : undefined,
    backgroundCurrencyGrant: undefined,
    backgroundEquipmentChoices: [],
    backgroundEquipmentItemChoices: {},
    classEquipmentChoices: {},
    classEquipmentItemChoices: {},
    raceAsiBlockIndex: undefined,
    movement: {
      speeds: { walk: seedSpeed },
      source: { kind: 'manual', name: 'Comprehensive test fixture' },
    },
    details: {
      ...seed.details,
      organizationSelectionKey: '',
      organizationCustomName: '',
      organizationCustomDescription: '',
      organizationCustomImage: '',
    },
    provenance,
    movementAdjustments: seed.movementAdjustments ?? [],
    movementOverrides: seed.movementOverrides ?? {},
    manualEffects: seed.manualEffects ?? [],
    suppressedEffectIds: seed.suppressedEffectIds ?? [],
    effectFlags: seed.effectFlags ?? {},
    manualActions: seed.manualActions ?? [],
  }

  return JSON.parse(JSON.stringify(fixture))
}

const seed = readJson(fixture2014Path)
const character2014 = buildFixture(seed, '2014')
const character2024 = buildFixture(seed, '2024')

for (const [path, fixture] of [
  [fixture2014Path, character2014],
  [fixture2024Path, character2024],
]) {
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`)
}
