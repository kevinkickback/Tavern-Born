import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import { classCastingDocuments, makeClassCastingLayer } from './classCastingFixtures'
import { makeManagedClassSpellFixtures } from './managedClassSpellFixtures'
import { makeOptionalClassSectionData } from './optionalClassSectionFixtures'

export const applyWarriorResult = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })

/** Actual optional/feat producers plus their actual class selection declarations. */
export function makeWarriorSpellFixtures(change?: (source: Record<string, any>) => void) {
  const source = JSON.parse(readFileSync('tests/fixtures/warriorSpellSources.json', 'utf8'))
  change?.(source)
  const spells = makeManagedClassSpellFixtures()
  const sections = makeOptionalClassSectionData().data
  const base = composeGameDataLayers(
    classCastingDocuments.map((row) =>
      makeClassCastingLayer(row.file, (doc) => {
        doc.classFeature = [
          ...(doc.classFeature ?? []),
          ...source.classFeature.filter((feature: { className: string }) =>
            doc.class.some((cls) => cls.name === feature.className),
          ),
        ]
      }),
    ),
  )
  const data = {
    ...base,
    spells: spells.spells,
    feats: source.feat,
    optionalfeatures: sections.optionalfeatures,
    optionalClassSections: sections.optionalClassSections,
  }
  data.lookups = buildGameDataLookups(data)
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  return {
    data,
    context: { catalogs, spellsByKey: spells.context.spellsByKey },
    source,
    lookups: {
      classesByKey: data.lookups.classesByKey,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
      spellsByKey: spells.context.spellsByKey,
    },
  }
}

export function selectWarriorFixture(
  fixture: ReturnType<typeof makeWarriorSpellFixtures>,
  name: 'Paladin' | 'Ranger',
  source: 'PHB' | 'XPHB',
) {
  const entry = { name, source, levels: 2 }
  let character = makeCharacterFixture({
    originSystem: source === 'XPHB' ? '2024' : '2014',
    classProgression: [entry],
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    variantRules: { optionalClassFeatures: true },
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  const catalogs = fixture.context.catalogs
  if (source === 'PHB') {
    const adoption = createOptionalClassFeatureActivity(character, catalogs).states.find(
      (row) =>
        row.root.owner[1] === name.toLowerCase() && row.root.name === 'Fighting Style Options',
    )!.adoption
    character = applyWarriorResult(
      character,
      setOptionalClassAdoptionCommand(
        character,
        character.provenance,
        catalogs,
        adoption,
        true,
        getOptionalClassFamilyKeys(character, adoption),
        fixture.context,
      ),
    )
  }
  const cls = fixture.data.classes.find((row) => row.name === name && row.source === source)!
  const choice = getCharacterClassChoices(
    cls,
    undefined,
    createOptionalClassFeatureActivity(character, catalogs),
    catalogs,
  ).find((row) => row.label === 'Fighting Style')!
  if (!choice) throw Error('Actual Fighting Style declaration is missing')
  character = applyWarriorResult(
    character,
    applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      [
        {
          entityType: source === 'PHB' ? 'optionalFeature' : 'feat',
          name: name === 'Paladin' ? 'Blessed Warrior' : 'Druidic Warrior',
          source: source === 'PHB' ? 'TCE' : 'XPHB',
        },
      ],
      {
        classes: fixture.data.classes,
        catalogs,
        feats: fixture.data.feats,
        spellContext: fixture.context,
      },
    ),
  )
  return { character, entry, choice }
}
