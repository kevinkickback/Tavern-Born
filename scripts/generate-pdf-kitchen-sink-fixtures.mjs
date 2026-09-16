import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const CURRENT_CHARACTER_SCHEMA_VERSION = 1
const dataRoot = join(root, 'data')
const fixtureRoot = join(root, 'tests', 'fixtures')
const legacyFixturePath = join(fixtureRoot, 'pdf-kitchen-sink-2014.tbc')
const revisedFixturePath = join(fixtureRoot, 'pdf-kitchen-sink-2024.tbc')

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

function buildFixture(seed, edition) {
  const seedSpeed = seed.movement.speeds.walk
  const race = editionEntity(races, seed.race, edition)
  const background = editionEntity(backgrounds, seed.background, edition)
  const progression = buildProgression(seed, edition)
  const primary = progression[0]
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

  const mappedProfiles = seed.spells.spellProfiles.map((profile) => ({
    ...profile,
    id:
      profile.type === 'class'
        ? `class:${profile.className}|${edition === '2024' ? 'XPHB' : 'PHB'}`
        : profile.type === 'racial'
          ? `racial:${race.name}|${race.source}`
          : profile.id,
    ...(profile.className
      ? { classSource: editionEntity(classes, profile.className, edition).source }
      : {}),
    ...(profile.type === 'racial'
      ? { raceName: race.name, raceSource: race.source, label: `${race.name} Racial Magic` }
      : {}),
    cantrips: profile.cantrips.map((spell) => sourceQualifiedReference(spell, spells, edition)),
    spellsKnown: profile.spellsKnown.map((spell) =>
      sourceQualifiedReference(spell, spells, edition),
    ),
    preparedSpells: profile.preparedSpells.map((spell) =>
      sourceQualifiedReference(spell, spells, edition),
    ),
    ...(profile.fixedSpells
      ? {
          fixedSpells: profile.fixedSpells.map((spell) =>
            sourceQualifiedReference(spell, spells, edition),
          ),
        }
      : {}),
    ...(profile.alwaysPreparedSpells
      ? {
          alwaysPreparedSpells: profile.alwaysPreparedSpells.map((spell) =>
            sourceQualifiedReference(spell, spells, edition),
          ),
        }
      : {}),
    ...(profile.choices
      ? {
          choices: profile.choices.map((choice) => ({
            ...choice,
            ...(choice.pool
              ? {
                  pool: choice.pool.map((spell) =>
                    sourceQualifiedReference(spell, spells, edition),
                  ),
                }
              : {}),
            selected: choice.selected.map((spell) =>
              sourceQualifiedReference(spell, spells, edition),
            ),
          })),
        }
      : {}),
    ...(profile.spellSwaps
      ? {
          spellSwaps: Object.fromEntries(
            Object.entries(profile.spellSwaps).map(([level, swap]) => [
              level,
              {
                removed: sourceQualifiedReference(swap.removed, spells, edition),
                added: sourceQualifiedReference(swap.added, spells, edition),
              },
            ]),
          ),
        }
      : {}),
  }))

  const mappedClassFeatChoices = seed.classFeatChoices.map((choice) => ({
    ...choice,
    id: choice.id.replaceAll('|phb|', `|${primary.source.toLowerCase()}|`),
    classSource: editionEntity(classes, choice.className, edition).source,
    feats: choice.feats.map((feat) => mapFeat(feat, edition)),
  }))

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
  const fixedFeatOptions = Object.fromEntries(
    Object.entries(seed.fixedFeatOptions).map(([selectionKey, options]) => {
      const [featName, , ...keyParts] = selectionKey.split('|')
      const feat = mapFeat({ name: featName, source: 'PHB', options }, edition)
      return [[feat.name, feat.source, ...keyParts].join('|'), feat.options ?? options]
    }),
  )

  const fixture = {
    ...seed,
    id: `pdf-kitchen-sink-${edition}-character`,
    schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
    name: edition === '2024' ? 'Seraphina Manypaths (2024)' : 'Seraphina Manypaths (2014)',
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
    feats: seed.feats.map((feat) => mapFeat(feat, edition)),
    specialFeats: seed.specialFeats.map((feat) => mapFeat(feat, edition)),
    classFeatChoices: mappedClassFeatChoices,
    fixedFeatOptions,
    asiChoices: seed.asiChoices.map((choice) => ({
      ...choice,
      classSource: editionEntity(classes, choice.className, edition).source,
    })),
    spells: { ...seed.spells, spellProfiles: mappedProfiles },
    equipment: buildEquipment(seed, edition),
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
        ...seed.feats.map((feat) => editionEntity(feats, feat.name, edition).source),
        ...buildEquipment(seed, edition).map((item) => item.source),
      ]),
    ].sort(),
    raceAsiChoices: [],
    backgroundAsiBlockIndex: edition === '2024' ? 0 : seed.backgroundAsiBlockIndex,
    backgroundAsiChoices: edition === '2024' ? backgroundChoices : seed.backgroundAsiChoices,
    backgroundEquipmentChoices: [],
    classEquipmentChoices: {},
    movement: {
      speeds: { walk: seedSpeed },
      source: { kind: 'manual', name: 'Kitchen sink fixture' },
    },
    details: {
      ...seed.details,
      organizationSelectionKey: '',
      organizationCustomName: '',
      organizationCustomDescription: '',
      organizationCustomImage: '',
    },
    provenance: emptyProvenance(),
  }

  return JSON.parse(JSON.stringify(fixture))
}

const seed = readJson(legacyFixturePath)
const legacy = buildFixture(seed, '2014')
const revised = buildFixture(seed, '2024')

for (const [path, fixture] of [
  [legacyFixturePath, legacy],
  [revisedFixturePath, revised],
]) {
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`)
}
