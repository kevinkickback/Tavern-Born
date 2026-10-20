import { readFileSync } from 'node:fs'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { applyClassGrants } from '@/lib/provenance/applyClassGrants'
import type { ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ClassProficiencyDomain } from '@/types/classRules'
import { makeNaturalExplorerFixture, type RangerDocument } from './naturalExplorerFixtures'

/** Exact TCE source snapshot; also challenged against the configured raw document when available. */
export const cannySource = JSON.parse(
  readFileSync('tests/fixtures/cannySource.json', 'utf8'),
) as ClassFeature

export function makeCannyFixture(level = 1, change?: (document: RangerDocument) => void) {
  const f = makeNaturalExplorerFixture(level, (document) => {
    document.classFeature.push(structuredClone(cannySource))
    const ranger = document.class.find(
      (entry) => entry.name === 'Ranger' && entry.source === 'PHB',
    )!
    ;(ranger.classFeatures as string[]).push('Deft Explorer|Ranger||1|TCE')
    change?.(document)
  })
  f.data.skills = JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill
  f.data.languages = JSON.parse(
    readFileSync('resources/srd/core/data/languages.json', 'utf8'),
  ).language
  f.data.lookups = buildGameDataLookups(f.data)
  const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(f.data))
  let character: Character = {
    ...f.character,
    variantRules: { ...f.character.variantRules, optionalClassFeatures: true },
    optionalClassFeatureAdoptions: [
      {
        owner: ['class', 'ranger', 'phb'],
        target: 'class-feature|deft explorer|ranger|phb|1|tce',
        earnedLevel: 1,
      },
    ],
    proficiencies: { ...f.character.proficiencies, skills: [], expertise: [], languages: [] },
    provenance: applyClassGrants(
      {
        name: f.classData.name,
        source: f.classData.source,
        startingProficiencies: f.classData.startingProficiencies,
        proficiency: f.classData.proficiency,
      },
      undefined,
      f.character.provenance!,
    ),
  }
  for (const name of ['survival', 'perception', 'nature']) {
    const result = resolveProficiencyChoiceCommand(
      character,
      character.provenance!,
      'skills',
      name,
      true,
    )
    character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  return {
    ...f,
    catalogs,
    character,
    choices: getCharacterClassChoices(
      f.classData,
      undefined,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ).filter((choice) => choice.kind === 'proficiency'),
  }
}

export function selectCanny(
  f: ReturnType<typeof makeCannyFixture>,
  domain: ClassProficiencyDomain,
  names: string[],
  character = f.character,
) {
  const choice = f.choices.find((row) => row.proficiencyDomain === domain)!
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance!,
    choice,
    names.map((name) => getProficiencyOption(domain, name)),
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
