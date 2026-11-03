import { readFileSync } from 'node:fs'
import { favoredEnemyOption } from '@/lib/5etools/favoredEnemyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { Character, FavoredEnemySetup } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNaturalExplorerFixture, type RangerDocument } from './naturalExplorerFixtures'

export function makeFavoredEnemyFixture(
  level = 14,
  change?: (d: RangerDocument) => void,
  file = 'resources/srd/core/data/class/class-ranger.json',
) {
  const f = makeNaturalExplorerFixture(level, change, file)
  f.data.languages = JSON.parse(
    readFileSync('resources/srd/core/data/languages.json', 'utf8'),
  ).language
  f.data.lookups = buildGameDataLookups(f.data)
  const choices = f.classData.normalizedRules!.choices.filter((c) => c.label === 'Favored Enemy')
  const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(f.data))
  return { ...f, choices, catalogs }
}
export function selectFavoredEnemy(
  f: ReturnType<typeof makeFavoredEnemyFixture>,
  gain = 1,
  names = ['beast'],
  setup: FavoredEnemySetup = { mode: 'type', language: { kind: 'spoken', name: 'common' } },
  character: Character = f.character,
): Character {
  const choice = f.choices.find((c) => c.level === gain)!
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    choice,
    names.map((n) => favoredEnemyOption(n, setup.mode)),
    { classes: f.data.classes, catalogs: f.catalogs },
    setup,
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
