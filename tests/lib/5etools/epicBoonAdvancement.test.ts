import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { decodeClassFeatureReference } from '@/lib/5etools/classFeatureIdentity'
import { normalizeClassRules } from '@/lib/5etools/classRuleNormalization'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  getEpicBoonAdvancementReference,
  isEpicBoonAdvancement,
} from '@/lib/5etools/epicBoonAdvancement'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import type { Class5e, ClassFeature, ClassFeatureReference, GameData } from '@/types/5etools'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

const coreClasses = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard',
]
const configuredClassDir = 'data/class'
const bundledClassDir = 'resources/srd/data/class'
const owner = { name: 'Ranger', source: 'XPHB' }
const uid = 'Epic Boon|Ranger|XPHB|19'
const tagged = {
  name: 'Epic Boon',
  className: 'Ranger',
  classSource: 'XPHB',
  source: 'XPHB',
  level: 19,
  entries: [
    'You gain an {@filter Epic Boon feat|feats|category=EB} or another {@5etools feat|feats.html} of your choice for which you qualify. {@feat Boon of Dimensional Travel|XPHB} is recommended.',
  ],
} satisfies ClassFeature
const ref = { ...decodeClassFeatureReference(uid), feature: tagged }

function verifyCoreGains(directory: string) {
  for (const name of coreClasses) {
    const payload = JSON.parse(
      readFileSync(join(directory, `class-${name.toLowerCase()}.json`), 'utf8'),
    )
    const { classes, classFeatures } = parseClassDocument(payload) as {
      classes: Class5e[]
      classFeatures: ClassFeature[]
    }
    const current = classes.find((cls) => cls.name === name && cls.source === 'XPHB')!
    const gains = current.classFeatureRefs ?? []
    const epicBoon = getEpicBoonAdvancementReference(gains, current)
    expect(epicBoon?.ref, name).toBe(`Epic Boon|${name}|XPHB|19`)
    expect(epicBoon?.feature && isEpicBoonAdvancement(epicBoon.feature), name).toBe(true)
    expect(
      classFeatures.filter(
        (feature) => feature.className === name && isEpicBoonAdvancement(feature),
      ),
      name,
    ).toHaveLength(1)
    expect(
      current.normalizedRules?.asiLevels.filter((level) => level === 19),
      name,
    ).toEqual([19])
    expect(
      current.normalizedRules?.choices.filter((choice) => choice.label === 'Epic Boon'),
      name,
    ).toEqual([])
  }
}

test('bundled revised core classes retain one level-19 advancement', () => {
  verifyCoreGains(bundledClassDir)
})

test.runIf(existsSync(join(configuredClassDir, 'index.json')))(
  'configured revised core classes and Artificer each receive one level-19 advancement',
  () => {
    verifyCoreGains(configuredClassDir)
    const { classes } = parseClassDocument(
      JSON.parse(readFileSync(join(configuredClassDir, 'class-artificer.json'), 'utf8')),
    ) as { classes: Class5e[] }
    const artificer = classes.find((cls) => cls.name === 'Artificer' && cls.source === 'EFA')!
    const gain = getEpicBoonAdvancementReference(artificer.classFeatureRefs ?? [], artificer)
    expect(gain?.ref).toBe('Epic Boon|Artificer|EFA|19|EFA')
    expect(gain?.feature && isEpicBoonAdvancement(gain.feature)).toBe(true)
    expect(artificer.normalizedRules?.asiLevels.filter((level) => level === 19)).toEqual([19])
    const classic = classes.find((cls) => cls.name === 'Artificer' && cls.source === 'TCE')!
    expect(getEpicBoonAdvancementReference(classic.classFeatureRefs ?? [], classic)).toBeUndefined()
  },
)

test('preserves independently authored neighboring choices and ASI levels', () => {
  const styleRef: ClassFeatureReference = {
    ...decodeClassFeatureReference('Fighting Style|Ranger|XPHB|2'),
    feature: {
      ...tagged,
      name: 'Fighting Style',
      level: 2,
      entries: ['You gain a {@filter Fighting Style feat|feats|category=FS} of your choice.'],
    },
  }
  const asiRef = decodeClassFeatureReference('Ability Score Improvement|Ranger|XPHB|4')
  const rules = normalizeClassRules(owner, [styleRef, asiRef, ref])
  expect(rules.asiLevels).toEqual([4, 19])
  expect(rules.choices.map((choice) => choice.label)).toEqual(['Fighting Style'])
})

test.each([
  { ref: 'Epic Boon|Ranger|XPHB|19|TCE' },
  { ref: 'Epic Boon|Ranger|PHB|19|XPHB' },
  { ref: 'Epic Boon|Paladin|XPHB|19' },
  { className: 'Paladin' },
  { source: 'TCE' },
  { level: 18 },
  { gainSubclassFeature: true },
  { feature: { ...tagged, source: 'TCE' } },
  { feature: { ...tagged, classSource: 'PHB' } },
  { feature: { ...tagged, sourceIdentityConflict: true as const } },
])('rejects conflicting gain evidence %j without swallowing the original choice', (patch) => {
  const altered = { ...ref, ...patch }
  expect(getEpicBoonAdvancementReference([altered], owner)).toBeUndefined()
  expect(normalizeClassRules(owner, [altered]).choices.map((choice) => choice.label)).toContain(
    'Epic Boon',
  )
})

test('rejects an alternate owner, duplicated gains, and duplicate raw feature producers', () => {
  expect(getEpicBoonAdvancementReference([ref], { ...owner, source: 'PHB' })).toBeUndefined()
  expect(
    getEpicBoonAdvancementReference([ref], { ...owner, sourceIdentityConflict: true }),
  ).toBeUndefined()
  expect(getEpicBoonAdvancementReference([ref, { ...ref }], owner)).toBeUndefined()

  const layer = (classFeature: ClassFeature[]) =>
    makeGameDataFixture(
      parseClassDocument({
        class: [{ ...owner, edition: 'one', classFeatures: [uid] }],
        classFeature,
      }) as Pick<GameData, 'classes' | 'classFeatures'>,
    )
  const duplicates = layer([tagged, { ...tagged, page: 5 }])
  for (const data of [duplicates, composeGameDataLayers([duplicates])]) {
    expect(data.classes[0].classFeatureRefs?.[0].feature?.sourceIdentityConflict).toBe(true)
    expect(data.classes[0].normalizedRules?.choices.map((choice) => choice.label)).toContain(
      'Epic Boon',
    )
  }
  const restored = composeGameDataLayers([duplicates, layer([tagged])])
  expect(restored.classes[0].normalizedRules?.asiLevels).toEqual([19])
  expect(restored.classes[0].normalizedRules?.choices).toEqual([])
})

test.each([
  { entries: [tagged.entries[0].replace('or another', 'and another')] },
  { entries: [tagged.entries[0], 'You also gain a second feat.'] },
  { entries: [tagged.entries[0].replace('category=EB', 'category=G')] },
  { additionalSpells: [{ known: { 19: ['shield|xphb'] } }] },
])('keeps the legacy normalized filter for unverified feature content %j', (patch) => {
  const feature = { ...tagged, ...patch }
  expect(isEpicBoonAdvancement(feature)).toBe(false)
  expect(
    normalizeClassRules(owner, [{ ...ref, feature }]).choices.map((choice) => choice.label),
  ).toContain('Epic Boon')
})

test('can identify the saved gain while its declaration is missing', () => {
  const missing = decodeClassFeatureReference(uid)
  expect(getEpicBoonAdvancementReference([missing], owner)).toBe(missing)
  expect(normalizeClassRules(owner, [missing]).asiLevels).toEqual([19])
})
