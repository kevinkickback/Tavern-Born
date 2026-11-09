import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  decodeFixedProficiencyId,
  getFixedProficiencyId,
} from '@/lib/5etools/fixedProficiencyIdentity'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { projectOwnedProficiencies } from '@/lib/character/classProficiencyFoundation'
import { selectSubclass } from '@/lib/character/commands/classCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const bundled = 'resources/srd/data/class/class-cleric.json'
const configured = 'data/class/class-cleric.json'
const intro = 'Life Domain|Cleric||Life||1'
const relation = {
  owner: ['cleric', 'phb', 'life domain', 'phb'] as [string, string, string, string],
  target: 'subclass-feature|bonus proficiency|cleric|phb|life|phb|1|phb',
  level: 1,
}
type Document = {
  class: Record<string, unknown>[]
  subclass: Record<string, unknown>[]
  subclassFeature: Record<string, unknown>[]
}
const raw = (path: string): Document => JSON.parse(readFileSync(path, 'utf8'))
const target = (row: Record<string, unknown>) =>
  row.name === 'Bonus Proficiency' &&
  row.classSource === 'PHB' &&
  row.subclassShortName === 'Life' &&
  row.subclassSource === 'PHB' &&
  row.source === 'PHB' &&
  row.level === 1

function parsed(document: Document): GameData {
  const layers = parseClassDocument(document, 'class/class-cleric.json')
  return makeGameDataFixture({
    ...layers,
    classes: layers.classes as Class5e[],
    classFeatures: layers.classFeatures as ClassFeature[],
  })
}

function actor(source = 'PHB', levels = 1, initialArmor: string[] = []) {
  const character = createEmptyCharacter({
    name: 'Life Cleric',
    originSystem: source === 'PHB' ? '2014' : '2024',
    allowedSources: ['PHB', source],
    classProgression: [{ name: 'Cleric', source, levels }],
  })
  return { ...character, proficiencies: { ...character.proficiencies, armor: initialArmor } }
}

function select(character: Character, data: GameData, name = 'Life Domain', source = 'PHB') {
  const result = selectSubclass(character, character.provenance, name, source, undefined, {
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  })
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )
}
const project = (character: Character, data: GameData) =>
  projectOwnedProficiencies(character, buildClassChoiceFeatureCatalogs(data)).effective

function verify(path: string) {
  const source = raw(path)
  const data = parsed(source)
  const cleric = select(actor(), data)
  expect(cleric.proficiencies.armor).toContain('heavy')
  expect(cleric.provenance.proficiencies.armor.heavy).toEqual([
    expect.objectContaining({
      sourceType: 'subclass',
      sourceName: 'Life Domain',
      sourceRef: 'PHB',
      grantType: 'fixed',
      grantVariant: getFixedProficiencyId(relation),
    }),
  ])
  expect(decodeFixedProficiencyId(getFixedProficiencyId(relation))).toEqual(relation)
  expect(
    decodeFixedProficiencyId(
      getFixedProficiencyId({
        ...relation,
        owner: ['cleric', 'xphb', 'life domain', 'phb'],
        level: 3,
      }),
    ),
  ).toBeUndefined()
  const noLeaf = {
    ...source,
    subclassFeature: source.subclassFeature.filter((row) => !target(row)),
  }
  const lost = composeGameDataLayers([data, parsed(noLeaf)])
  expect(project(cleric, lost).proficiencies.armor).not.toContain('heavy')
  expect(project(cleric, composeGameDataLayers([lost, data])).proficiencies.armor).toContain(
    'heavy',
  )

  const withManual = select(actor('PHB', 1, ['heavy']), data)
  expect(project(withManual, lost).provenance.proficiencies.armor.heavy).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
  expect(select(cleric, data, '', '').proficiencies.armor).not.toContain('heavy')
  expect(select(withManual, data, '', '').proficiencies.armor).toContain('heavy')
  expect(select(actor('XPHB', 3), data).proficiencies.armor).not.toContain('heavy')
  expect(select(actor('XPHB', 3), data, 'Life Domain', 'XPHB').proficiencies.armor).not.toContain(
    'heavy',
  )

  const changed = structuredClone(source)
  const leaf = changed.subclassFeature.find(target)
  if (!leaf) throw new Error('Missing exact Life proficiency source')
  leaf.entries = ['You gain proficiency with heavy armor while outdoors.']
  expect(project(cleric, parsed(changed)).proficiencies.armor).not.toContain('heavy')
  const duplicate = {
    ...source,
    subclassFeature: [...source.subclassFeature, ...source.subclassFeature.filter(target)],
  }
  expect(
    project(cleric, composeGameDataLayers([data, parsed(duplicate)])).proficiencies.armor,
  ).not.toContain('heavy')

  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const cls = data.classes.find((row) => row.name === 'Cleric' && row.source === 'PHB')
  const domain = cls?.subclasses?.find((row) => row.name === 'Life Domain' && row.source === 'PHB')
  if (!cls || !domain) throw new Error('Missing exact Life Domain source')
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey('Cleric', 'PHB', 'Life Domain', 'PHB'),
  ).subclassFeatureCandidates
  if (!scoped) throw new Error('Missing exact subclass candidate index')
  expect(getCurrentSubclassProficiencyCertificate(cls, domain, new Map())).toBeUndefined()
  const detached = structuredClone(domain)
  const root = detached.subclassFeatureRefs?.find((row) => row.ref === intro)?.feature
  const reference = root?.entries?.find(
    (row) =>
      row &&
      typeof row === 'object' &&
      'subclassFeature' in row &&
      row.subclassFeature === 'Bonus Proficiency|Cleric||Life||1',
  ) as { feature?: unknown } | undefined
  if (!reference?.feature) throw new Error('Missing actual nested grant')
  delete reference.feature
  expect(getCurrentSubclassProficiencyCertificate(cls, detached, scoped)).toBeUndefined()
}

test('classic bundled Life Domain training follows exact ownership and whole-package recovery', () => {
  verify(bundled)
})

test.skipIf(!existsSync(configured))('configured Life Domain uses its own complete package', () => {
  verify(configured)
  const base = parsed(raw(bundled))
  const external = parsed(raw(configured))
  const classic = select(actor(), base)
  expect(project(classic, composeGameDataLayers([base, external])).proficiencies.armor).toContain(
    'heavy',
  )
})
