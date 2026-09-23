import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const CURRENT_CHARACTER_SCHEMA_VERSION = 2
const dataRoot = join(root, 'data')
const fixtureRoot = join(root, 'tests', 'fixtures')
const fixture2014Path = join(fixtureRoot, 'full-coverage-character-2014.tbc')
const fixture2024Path = join(fixtureRoot, 'full-coverage-character-2024.tbc')
const companion2014Path = join(fixtureRoot, 'companion-choice-character-2014.tbc')
const companion2024Path = join(fixtureRoot, 'companion-choice-character-2024.tbc')

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
const optionalFeatures = asArray(readJson(join(dataRoot, 'optionalfeatures.json')).optionalfeature)
const companionCreatures = ['bestiary-mm.json', 'bestiary-tce.json', 'bestiary-xphb.json'].flatMap(
  (fileName) => asArray(readJson(join(dataRoot, 'bestiary', fileName)).monster),
)
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

function requireEntity(entities, name, source) {
  const entity = entities.find(
    (candidate) => candidate.name === name && candidate.source === source,
  )
  if (!entity) throw new Error(`Missing corpus entity: ${name}|${source}`)
  return entity
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

function selectClassSpells(className, classSource, edition, countByLevel, excludedReferences = []) {
  const spellSource = edition === '2024' ? 'XPHB' : 'PHB'
  const excludedNames = new Set(excludedReferences.map((reference) => spellName(reference)))
  return Object.entries(countByLevel).flatMap(([rawLevel, count]) => {
    const level = Number(rawLevel)
    const candidates = spells
      .filter(
        (spell) =>
          spell.source === spellSource &&
          spell.level === level &&
          !excludedNames.has(spell.name) &&
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

function spellName(reference) {
  return reference.split('|')[0].trim()
}

function buildSpellProfiles(race, progression, edition) {
  const wizard = progression.find((entry) => entry.name === 'Wizard')
  const cleric = progression.find((entry) => entry.name === 'Cleric')
  if (!wizard || !cleric) throw new Error(`${edition} fixture requires Wizard and Cleric levels.`)

  const wizardCantripCandidates = selectClassSpells('Wizard', wizard.source, edition, { 0: 8 })
  const wizardCantrips = wizardCantripCandidates.slice(0, 5)
  const wizardSpellsByLevel = {
    1: selectClassSpells('Wizard', wizard.source, edition, { 1: 8 }),
    2: selectClassSpells('Wizard', wizard.source, edition, { 2: 4 }),
    3: selectClassSpells('Wizard', wizard.source, edition, { 3: 4 }),
    4: selectClassSpells('Wizard', wizard.source, edition, { 4: 4 }),
    5: selectClassSpells('Wizard', wizard.source, edition, { 5: 4 }),
  }
  const wizardSelectionsByClassLevel = new Map([
    [1, [...wizardCantrips.slice(0, 3), ...wizardSpellsByLevel[1].slice(0, 6)]],
    [2, wizardSpellsByLevel[1].slice(6, 8)],
    [3, wizardSpellsByLevel[2].slice(0, 2)],
    [4, [wizardCantrips[3], ...wizardSpellsByLevel[2].slice(2, 4)]],
    [5, wizardSpellsByLevel[3].slice(0, 2)],
    [6, wizardSpellsByLevel[3].slice(2, 4)],
    [7, wizardSpellsByLevel[4].slice(0, 2)],
    [8, wizardSpellsByLevel[4].slice(2, 4)],
    [9, wizardSpellsByLevel[5].slice(0, 2)],
    [10, [wizardCantrips[4], ...wizardSpellsByLevel[5].slice(2, 4)]],
  ])
  const wizardSpellbook = [...wizardSelectionsByClassLevel.values()]
    .flat()
    .filter((reference) => !wizardCantrips.includes(reference))
  const wizardPrepared = [
    ...wizardSpellsByLevel[1].slice(0, 4),
    ...wizardSpellsByLevel[2].slice(0, 2),
    ...wizardSpellsByLevel[3].slice(0, 2),
    ...wizardSpellsByLevel[4].slice(0, 2),
    ...wizardSpellsByLevel[5].slice(0, 2),
  ]
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
  const clericCantrips = selectClassSpells('Cleric', cleric.source, edition, { 0: 4 })
  const clericPreparedByClassLevel =
    edition === '2024'
      ? new Map([
          [1, selectClassSpells('Cleric', cleric.source, edition, { 1: 4 }, lifeDomainSpells)],
          [
            2,
            selectClassSpells('Cleric', cleric.source, edition, { 1: 5 }, lifeDomainSpells).slice(
              4,
              5,
            ),
          ],
          [3, selectClassSpells('Cleric', cleric.source, edition, { 2: 1 }, lifeDomainSpells)],
          [
            4,
            selectClassSpells('Cleric', cleric.source, edition, { 2: 2 }, lifeDomainSpells).slice(
              1,
              2,
            ),
          ],
          [5, selectClassSpells('Cleric', cleric.source, edition, { 3: 2 }, lifeDomainSpells)],
        ])
      : new Map()
  const clericPrepared =
    edition === '2024'
      ? [...clericPreparedByClassLevel.values()].flat()
      : selectClassSpells('Cleric', cleric.source, edition, { 1: 3, 2: 3, 3: 2 }, lifeDomainSpells)
  const bonusCantrips = wizardCantripCandidates.slice(-2)
  const bonusSpell = selectClassSpells('Wizard', wizard.source, edition, { 1: 7 }).slice(-1)
  const spellAttributions = [
    ...[...wizardSelectionsByClassLevel.entries()].flatMap(([classLevel, references]) =>
      references.map((reference) => ({
        reference,
        sourceType: 'class',
        sourceName: wizard.name,
        sourceRef: wizard.source,
        grantType: 'choice',
        spellGrantedAtLevel: classLevel,
        spellAttributionMode: 'exact',
      })),
    ),
    ...clericCantrips.map((reference, index) => ({
      reference,
      sourceType: 'class',
      sourceName: cleric.name,
      sourceRef: cleric.source,
      grantType: 'choice',
      spellGrantedAtLevel: index < 3 ? 1 : 4,
      spellAttributionMode: 'exact',
    })),
    ...(edition === '2024'
      ? [...clericPreparedByClassLevel.entries()].flatMap(([classLevel, references]) =>
          references.map((reference) => ({
            reference,
            sourceType: 'class',
            sourceName: cleric.name,
            sourceRef: cleric.source,
            grantType: 'choice',
            spellGrantedAtLevel: classLevel,
            spellAttributionMode: 'exact',
          })),
        )
      : clericPrepared.map((reference) => ({
          reference,
          sourceType: 'class',
          sourceName: cleric.name,
          sourceRef: cleric.source,
          grantType: 'choice',
        }))),
    ...lifeDomainSpells.map((reference) => ({
      reference,
      sourceType: 'subclass',
      sourceName: 'Life Domain',
      sourceRef: cleric.subclassSource,
      grantType: 'fixed',
    })),
  ]

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

  const profiles = [
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
      spellsKnown: edition === '2024' ? [...lifeDomainSpells, ...clericPrepared] : lifeDomainSpells,
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

  const racialReferences = [...racialProfile.cantrips, ...racialProfile.spellsKnown]
  spellAttributions.push(
    ...racialReferences.map((reference) => ({
      reference,
      sourceType: 'subrace',
      sourceName: edition === '2024' ? 'Drow Lineage' : 'High',
      sourceRef: race.source,
      grantType: edition === '2024' ? 'fixed' : 'choice',
    })),
    ...[...bonusCantrips, ...bonusSpell].map((reference) => ({
      reference,
      sourceType: 'feat',
      sourceName: 'Magic Initiate',
      sourceRef: edition === '2024' ? 'XPHB' : 'PHB',
      grantType: 'choice',
    })),
  )

  return { profiles, spellAttributions }
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

function normalizeLedgerKey(value) {
  return spellName(value).trim().toLowerCase()
}

function makeTag(sourceType, sourceName, grantType, sourceRef, extras = {}) {
  return {
    sourceType,
    sourceName,
    sourceRef,
    grantType,
    label: sourceType === 'manual' ? 'User Choice' : sourceName,
    ...extras,
  }
}

function addLedgerGrant(map, name, tag) {
  const ledgerKey = normalizeLedgerKey(name)
  const existing = map[ledgerKey] ?? []
  const duplicate = existing.some(
    (candidate) =>
      candidate.sourceType === tag.sourceType &&
      candidate.sourceName === tag.sourceName &&
      candidate.sourceRef === tag.sourceRef &&
      candidate.grantType === tag.grantType &&
      candidate.grantVariant === tag.grantVariant &&
      candidate.spellGrantedAtLevel === tag.spellGrantedAtLevel,
  )
  if (!duplicate) map[ledgerKey] = [...existing, tag]
}

function buildClassChoiceState(features, selections) {
  const materializedFeatures = [...features]
  const classFeatChoices = []

  for (const selection of selections) {
    const featureOptions = selection.selected.filter((option) =>
      ['classFeature', 'optionalFeature'].includes(option.entityType),
    )
    for (const option of featureOptions) {
      if (
        materializedFeatures.some(
          (feature) => feature.name === option.name && feature.source === option.source,
        )
      ) {
        continue
      }
      materializedFeatures.push({
        id: `class-choice:${encodeURIComponent(selection.choiceId)}:${encodeURIComponent(`${option.name}|${option.source ?? ''}`)}`,
        name: option.name,
        source: option.source ?? '',
        description: '',
        level: option.slotLevel,
      })
    }

    const featOptions = selection.selected.filter((option) => option.entityType === 'feat')
    if (featOptions.length === 0) continue
    classFeatChoices.push({
      id: selection.choiceId,
      className: selection.className,
      classSource: selection.classSource,
      progressionName: selection.label,
      categories: ['FS'],
      feats: featOptions.map((option) => ({
        id: `class-${selection.choiceId}-${option.name}-${option.source ?? ''}`,
        name: option.name,
        source: option.source ?? '',
        description: '',
        className: selection.className,
        classSource: selection.classSource,
        classLevel: option.slotLevel,
      })),
    })
  }

  return { features: materializedFeatures, classFeatChoices }
}

function buildFixtureProvenance({
  edition,
  race,
  selectedSubrace,
  background,
  progression,
  features,
  feats: selectedFeats,
  specialFeats,
  classFeatChoices,
  classChoiceSelections,
  spellAttributions,
  equipment,
  proficiencies,
  backgroundChoices,
}) {
  const provenance = emptyProvenance()
  const wizard = progression.find((entry) => entry.name === 'Wizard')
  const fighter = progression.find((entry) => entry.name === 'Fighter')
  const cleric = progression.find((entry) => entry.name === 'Cleric')
  if (!wizard || !fighter || !cleric) throw new Error('Fixture provenance requires all classes.')

  const wizardTag = makeTag('class', wizard.name, 'choice', wizard.source)
  const fighterTag = makeTag('class', fighter.name, 'choice', fighter.source)
  const clericTag = makeTag('class', cleric.name, 'choice', cleric.source)
  const backgroundTag = makeTag('background', background.name, 'choice', background.source)
  const raceTag = makeTag('race', race.name, 'fixed', race.source)
  const subraceTag = makeTag(
    'subrace',
    selectedSubrace?.name ?? race.name,
    'fixed',
    selectedSubrace?.source ?? race.source,
  )
  const manualTag = makeTag('manual', 'Full-coverage test fixture', 'choice')

  const proficiencyOwners = {
    armor: new Map([
      ['light armor', fighterTag],
      ['medium armor', fighterTag],
      ['shields', fighterTag],
    ]),
    weapons: new Map([
      ['simple weapons', fighterTag],
      ['martial weapons', fighterTag],
      ['longsword', edition === '2014' ? subraceTag : fighterTag],
      ['longbow', edition === '2014' ? subraceTag : fighterTag],
      ['dagger', wizardTag],
      ['light crossbow', wizardTag],
    ]),
    tools: new Map([
      ["thieves' tools", backgroundTag],
      ['dice set', backgroundTag],
      ["calligrapher's supplies", fighterTag],
      ['herbalism kit', clericTag],
    ]),
    skills: new Map([
      ['arcana', backgroundTag],
      ['history', backgroundTag],
      ['investigation', wizardTag],
      ['athletics', fighterTag],
      ['perception', fighterTag],
      ['insight', clericTag],
      ['religion', clericTag],
      ['deception', edition === '2024' ? backgroundTag : manualTag],
      ['stealth', edition === '2024' ? backgroundTag : manualTag],
    ]),
    languages: new Map([
      ['common', raceTag],
      ['elvish', raceTag],
      ['draconic', backgroundTag],
      ['dwarvish', backgroundTag],
    ]),
    savingThrows: new Map([
      ['intelligence', wizardTag],
      ['wisdom', wizardTag],
    ]),
  }
  for (const domain of Object.keys(provenance.proficiencies)) {
    for (const name of proficiencies[domain]) {
      addLedgerGrant(
        provenance.proficiencies[domain],
        name,
        proficiencyOwners[domain].get(name.toLowerCase()) ?? manualTag,
      )
    }
  }

  for (const feature of features) {
    if (feature.id.startsWith('class-choice:')) continue
    const definition = classFeatures.find(
      (candidate) => candidate.name === feature.name && candidate.source === feature.source,
    )
    const owner = progression.find(
      (entry) => entry.name === definition?.className && entry.source === definition?.classSource,
    )
    const isSubclass = Boolean(definition?.subclassShortName)
    addLedgerGrant(
      provenance.features,
      feature.name,
      owner
        ? makeTag(
            isSubclass ? 'subclass' : 'class',
            isSubclass ? (owner.subclass ?? owner.name) : owner.name,
            'fixed',
            isSubclass ? owner.subclassSource : owner.source,
          )
        : manualTag,
    )
  }

  for (const feat of selectedFeats) {
    addLedgerGrant(
      provenance.feats,
      feat.name,
      makeTag('class', feat.className, 'choice', feat.classSource),
    )
  }
  for (const feat of specialFeats) addLedgerGrant(provenance.feats, feat.name, manualTag)
  for (const choice of classFeatChoices) {
    for (const feat of choice.feats) {
      addLedgerGrant(
        provenance.feats,
        feat.name,
        makeTag('class', choice.className, 'choice', choice.classSource, {
          grantVariant: choice.id,
        }),
      )
    }
  }
  if (edition === '2024') {
    addLedgerGrant(
      provenance.feats,
      'Alert',
      makeTag('background', background.name, 'fixed', background.source),
    )
  }

  for (const selection of classChoiceSelections) {
    for (const option of selection.selected) {
      if (!['classFeature', 'optionalFeature'].includes(option.entityType)) continue
      addLedgerGrant(
        provenance.features,
        option.name,
        makeTag(
          selection.subclassName ? 'subclass' : 'class',
          selection.subclassName ?? selection.className,
          'choice',
          selection.subclassSource ?? selection.classSource,
          {
            grantVariant: selection.choiceId,
          },
        ),
      )
    }
  }

  for (const attribution of spellAttributions) {
    addLedgerGrant(
      provenance.spells,
      attribution.reference,
      makeTag(
        attribution.sourceType,
        attribution.sourceName,
        attribution.grantType,
        attribution.sourceRef,
        {
          ...(attribution.spellGrantedAtLevel
            ? { spellGrantedAtLevel: attribution.spellGrantedAtLevel }
            : {}),
          ...(attribution.spellAttributionMode
            ? { spellAttributionMode: attribution.spellAttributionMode }
            : {}),
        },
      ),
    )
  }

  equipment.forEach((item, index) => {
    const owner = index < 8 ? fighterTag : manualTag
    addLedgerGrant(provenance.equipment, item.name, owner)
  })

  if (edition === '2014') {
    provenance.abilityBonuses.push(
      { ability: 'dexterity', value: 2, sourceTag: raceTag },
      { ability: 'intelligence', value: 1, sourceTag: subraceTag },
    )
  } else {
    backgroundChoices.forEach((ability, index) => {
      provenance.abilityBonuses.push({
        ability,
        value: index === 0 ? 2 : 1,
        sourceTag: backgroundTag,
      })
    })
  }

  return provenance
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
  const maneuverNames = ["Commander's Strike", 'Disarming Attack', 'Precision Attack']
  selections.push({
    choiceId: `class:fighter|${source.toLowerCase()}|subclass:battle-master|${source.toLowerCase()}|choice:maneuvers|3`,
    label: 'Maneuvers',
    kind: 'optional-feature',
    className: 'Fighter',
    classSource: source,
    subclassName: 'Battle Master',
    subclassSource: source,
    classLevel: 3,
    selected: maneuverNames.map((name) => {
      const entity = editionEntity(optionalFeatures, name, edition)
      return {
        entityType: 'optionalFeature',
        name: entity.name,
        source: entity.source,
        slotLevel: 3,
      }
    }),
  })
  return selections
}

function buildFixture(seed, edition) {
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
  const movementOwner = selectedSubrace?.speed !== undefined ? selectedSubrace : race
  const walkSpeed =
    typeof movementOwner.speed === 'number' ? movementOwner.speed : movementOwner.speed?.walk
  if (typeof walkSpeed !== 'number')
    throw new Error(`Missing walking speed for fixture race: ${key(movementOwner)}`)
  const { profiles: mappedProfiles, spellAttributions } = buildSpellProfiles(
    race,
    progression,
    edition,
  )
  const mappedFeats = buildFeatSelections(seed, edition)
  const mappedSpecialFeats = buildSpecialFeats(seed, edition, mappedProfiles)
  const equipment = buildEquipment(seed, edition)
  const classChoiceSelections = buildClassChoiceSelections(edition)
  const classChoiceState = buildClassChoiceState(
    buildFeatureRows(progression),
    classChoiceSelections,
  )

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
  const provenance = buildFixtureProvenance({
    edition,
    race,
    selectedSubrace,
    background,
    progression,
    features: classChoiceState.features,
    feats: mappedFeats,
    specialFeats: mappedSpecialFeats,
    classFeatChoices: classChoiceState.classFeatChoices,
    classChoiceSelections,
    spellAttributions,
    equipment,
    proficiencies: seed.proficiencies,
    backgroundChoices,
  })

  const fixture = {
    ...seed,
    id: `full-coverage-character-${edition}`,
    schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
    name: `Full-Coverage Test Character (${edition})`,
    originSystem: edition,
    race: race.name,
    raceSource: race.source,
    ...(selectedSubrace
      ? { subrace: selectedSubrace.name, subraceSource: selectedSubrace.source }
      : { subrace: undefined, subraceSource: undefined }),
    background: background.name,
    backgroundSource: background.source,
    classProgression: progression,
    features: classChoiceState.features,
    feats: mappedFeats,
    specialFeats: mappedSpecialFeats,
    classFeatChoices: classChoiceState.classFeatChoices,
    classChoiceSelections,
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
    hitDiceUsed: Object.fromEntries(
      Object.entries(seed.hitDiceUsed ?? {}).map(([classKey, count]) => {
        const className = classKey.split('|')[0]
        const classEntry = progression.find((entry) => entry.name.toLowerCase() === className)
        if (!classEntry) throw new Error(`Unknown hit-die class ${classKey}`)
        return [`${classEntry.name.toLowerCase()}|${classEntry.source.toLowerCase()}`, count]
      }),
    ),
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
      speeds: { walk: walkSpeed },
      source: { kind: 'race', name: movementOwner.name, source: movementOwner.source },
    },
    details: {
      ...seed.details,
      organizationSelectionKey: 'The Harpers|SCAG',
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

function buildCompanionFixture(baseFixture, edition) {
  const source = edition === '2024' ? 'XPHB' : 'PHB'
  const ranger = editionEntity(classes, 'Ranger', edition)
  const beastMaster = requireEntity(
    subclasses.filter((candidate) => candidate.className === 'Ranger'),
    'Beast Master',
    source,
  )
  const progression = [
    {
      name: ranger.name,
      source: ranger.source,
      levels: 3,
      subclass: beastMaster.name,
      subclassSource: beastMaster.source,
    },
  ]
  const primalSource = edition === '2024' ? 'XPHB' : 'TCE'
  const primalCompanion = requireEntity(companionCreatures, 'Beast of the Land', primalSource)
  const classicCompanion =
    edition === '2014' ? requireEntity(companionCreatures, 'Wolf', 'MM') : undefined
  const defense = editionEntity(edition === '2024' ? feats : optionalFeatures, 'Defense', edition)
  const selected = [
    {
      choiceId: `class:ranger|${source.toLowerCase()}|choice:fighting-style|2`,
      label: 'Fighting Style',
      kind: edition === '2024' ? 'feat' : 'optional-feature',
      className: 'Ranger',
      classSource: source,
      classLevel: 2,
      selected: [
        {
          entityType: edition === '2024' ? 'feat' : 'optionalFeature',
          name: defense.name,
          source: defense.source,
          slotLevel: 2,
        },
      ],
    },
    ...(edition === '2024'
      ? [
          {
            choiceId: 'class:ranger|xphb|choice:weapon-mastery|1',
            label: 'Weapon Mastery',
            kind: 'item',
            className: 'Ranger',
            classSource: source,
            classLevel: 1,
            selected: ['Longbow', 'Shortsword'].map((name) => {
              const item = editionEntity(items, name, edition)
              return { entityType: 'item', name: item.name, source: item.source, slotLevel: 1 }
            }),
          },
        ]
      : []),
    ...(edition === '2014'
      ? [
          {
            choiceId: 'class:ranger|phb|subclass:beast-master|phb|choice:ranger-s-companion|3',
            label: "Ranger's Companion",
            kind: 'creature',
            inactive: true,
            className: 'Ranger',
            classSource: source,
            subclassName: beastMaster.name,
            subclassSource: beastMaster.source,
            classLevel: 3,
            selected: [
              {
                entityType: 'creature',
                name: classicCompanion.name,
                source: classicCompanion.source,
                slotLevel: 3,
              },
            ],
          },
        ]
      : []),
    {
      choiceId: `class:ranger|${source.toLowerCase()}|subclass:beast-master|${source.toLowerCase()}|choice:primal-companion|3`,
      label: 'Primal Companion',
      kind: 'creature',
      className: 'Ranger',
      classSource: source,
      subclassName: beastMaster.name,
      subclassSource: beastMaster.source,
      classLevel: 3,
      selected: [
        {
          entityType: 'creature',
          name: primalCompanion.name,
          source: primalCompanion.source,
          slotLevel: 3,
        },
      ],
    },
  ]
  const classChoiceState = buildClassChoiceState(
    [],
    selected.filter((choice) => !choice.inactive),
  )
  const spellReferences = selectClassSpells('Ranger', ranger.source, edition, {
    1: edition === '2024' ? 4 : 3,
  })
  const spellLevels = edition === '2024' ? [1, 1, 2, 3] : [2, 2, 3]
  const provenance = emptyProvenance()
  provenance.abilityBonuses = baseFixture.provenance.abilityBonuses
  const rangerTag = makeTag('class', ranger.name, 'fixed', ranger.source)
  const backgroundTag = makeTag(
    'background',
    baseFixture.background,
    'fixed',
    baseFixture.backgroundSource,
  )
  const raceTag = makeTag('race', baseFixture.race, 'fixed', baseFixture.raceSource)
  const proficiencies = {
    armor: ['Light Armor', 'Medium Armor', 'Shields'],
    weapons: ['Simple Weapons', 'Martial Weapons'],
    tools: [],
    skills:
      edition === '2024'
        ? ['animal handling', 'perception', 'survival', 'sleight of hand', 'stealth']
        : ['animal handling', 'perception', 'survival', 'arcana', 'history'],
    expertise: [],
    languages: ['Common', 'Elvish'],
    savingThrows: ['strength', 'dexterity'],
  }
  for (const domain of Object.keys(provenance.proficiencies)) {
    for (const name of proficiencies[domain]) {
      const isBackgroundSkill =
        domain === 'skills' && !['animal handling', 'perception', 'survival'].includes(name)
      addLedgerGrant(
        provenance.proficiencies[domain],
        name,
        domain === 'languages' ? raceTag : isBackgroundSkill ? backgroundTag : rangerTag,
      )
    }
  }
  spellReferences.forEach((reference, index) => {
    addLedgerGrant(
      provenance.spells,
      reference,
      makeTag('class', ranger.name, 'choice', ranger.source, {
        spellGrantedAtLevel: spellLevels[index],
        spellAttributionMode: 'exact',
      }),
    )
  })
  for (const selection of selected) {
    if (selection.inactive) continue
    for (const option of selection.selected) {
      if (option.entityType === 'feat') {
        addLedgerGrant(
          provenance.feats,
          option.name,
          makeTag('class', ranger.name, 'choice', ranger.source, {
            grantVariant: selection.choiceId,
          }),
        )
      } else if (option.entityType === 'optionalFeature') {
        addLedgerGrant(
          provenance.features,
          option.name,
          makeTag('class', ranger.name, 'choice', ranger.source, {
            grantVariant: selection.choiceId,
          }),
        )
      }
    }
  }
  const companionFeature = requireEntity(
    classFeatures.filter((feature) => feature.className === 'Ranger'),
    'Primal Companion',
    primalSource,
  )
  const companionEquipment = ['Longbow', 'Leather Armor'].map((name, index) =>
    toEquipment(
      editionEntity(items, name, edition),
      `companion-gear-${edition}-${index + 1}`,
      index === 1,
    ),
  )
  addLedgerGrant(
    provenance.features,
    companionFeature.name,
    makeTag('subclass', beastMaster.name, 'fixed', beastMaster.source),
  )
  for (const item of companionEquipment) {
    addLedgerGrant(provenance.equipment, item.name, rangerTag)
  }
  return JSON.parse(
    JSON.stringify({
      ...baseFixture,
      id: `companion-choice-character-${edition}`,
      name: `Companion Choice Test Character (${edition})`,
      currency: { cp: 0, sp: 0, ep: 0, gp: 25, pp: 0 },
      experiencePoints: 0,
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 14,
        charisma: 10,
      },
      proficiencies,
      classProgression: progression,
      classChoiceSelections: selected,
      classFeatChoices: classChoiceState.classFeatChoices,
      features: [
        {
          id: `companion-feature-${edition}`,
          name: companionFeature.name,
          source: companionFeature.source,
          description: '',
          level: 3,
        },
        ...classChoiceState.features,
      ],
      feats: [],
      specialFeats: [],
      fixedFeatOptions: {},
      asiChoices: [],
      equipment: companionEquipment,
      allowedSources: [
        ...new Set([
          source,
          baseFixture.raceSource,
          baseFixture.backgroundSource,
          'SCAG',
          primalSource,
          ...(edition === '2014' ? ['MM'] : []),
        ]),
      ].sort(),
      hitPoints: { current: 28, temporary: 0 },
      hitPointsInitialized: true,
      hitPointGains: [2, 3].map((level) => ({
        className: ranger.name,
        classSource: ranger.source,
        classLevel: level,
        characterLevel: level,
        hitDie: 10,
        dieResult: 6,
        method: 'average',
      })),
      hitPointAdjustments: [],
      maxHitPointsOverride: undefined,
      armorClassAdjustments: [],
      damageResistances: [],
      damageImmunities: [],
      conditionImmunities: [],
      hitDiceUsed: {},
      inspiration: false,
      deathSaves: { successes: 0, failures: 0 },
      conditions: [],
      exhaustion: 0,
      ritualCasting: false,
      classResources: {},
      spells: {
        ...baseFixture.spells,
        spellProfiles: [
          {
            id: `class:${ranger.name}|${ranger.source}`,
            type: 'class',
            label: `${ranger.name} (Lv 3)`,
            className: ranger.name,
            classSource: ranger.source,
            cantrips: [],
            spellsKnown: spellReferences,
            preparedSpells: edition === '2024' ? spellReferences : [],
            alwaysPrepared: false,
          },
          {
            id: 'special:unrestricted',
            type: 'special',
            label: 'Special (Unrestricted)',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: { 1: { max: 3, used: 1 } },
        pactSpellSlots: {},
      },
      provenance,
      details: {
        playerName: 'Fixture Runner',
        faction: 'The Harpers',
        rank: 'Scout',
        organizationSelectionKey: 'The Harpers|SCAG',
        appearance: 'A travel-worn ranger accompanied by a primal beast.',
        backstory: 'A Harper scout whose companion shares every journey.',
      },
      manualEffects: [],
      suppressedEffectIds: [],
      effectFlags: {},
      manualActions: [],
    }),
  )
}

const seed = readJson(fixture2014Path)
const character2014 = buildFixture(seed, '2014')
const character2024 = buildFixture(seed, '2024')
const companion2014 = buildCompanionFixture(character2014, '2014')
const companion2024 = buildCompanionFixture(character2024, '2024')

for (const [path, fixture] of [
  [fixture2014Path, character2014],
  [fixture2024Path, character2024],
  [companion2014Path, companion2014],
  [companion2024Path, companion2024],
]) {
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`)
}
