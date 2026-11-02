import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { buildClassLookup, buildGameDataLookups, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e, ClassFeature, Spell5e } from '@/types/5etools'
import { classCastingDocuments } from './classCastingFixtures'
import { makeGameDataFixture } from './gameDataFixtures'
import { makeManagedClassSpellFixtures } from './managedClassSpellFixtures'
import {
  type OptionalDeclarationDocument,
  optionalDeclarationSources,
} from './optionalClassDeclarationFixtures'

/** Complete captured Ranger declaration plus the PHB target omitted from the SRD. */
export function makePrimalAwarenessSpellFixtures(
  change?: (document: OptionalDeclarationDocument) => void,
) {
  const fixture = makeManagedClassSpellFixtures()
  const document = structuredClone(
    optionalDeclarationSources.documents.find((row) => row.file === 'class/class-ranger.json')!
      .data,
  )
  const casting = classCastingDocuments.find((row) => row.file === 'class/class-ranger.json')!.data
  // Both captures retain complete owner metadata; join raw declaring features before auditing.
  for (const feature of casting.classFeature) {
    if (
      !document.classFeature.some(
        (row) =>
          row.name === feature.name &&
          row.source === feature.source &&
          row.className === feature.className &&
          row.classSource === feature.classSource &&
          row.level === feature.level,
      )
    )
      document.classFeature.push(structuredClone(feature))
  }
  change?.(document)
  const parsed = parseClassDocument(document, 'fixture:primal-awareness')
  const beastSense = parseSpells([
    JSON.parse(readFileSync('tests/fixtures/primalAwarenessBeastSense.json', 'utf8')),
  ]) as Spell5e[]
  const spells = [...fixture.spells, ...beastSense]
  const gameData = composeGameDataLayers([
    fixture.data,
    makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      optionalClassFeatureSources: parsed.optionalClassFeatureSources,
      classCastingSources: parsed.classCastingSources,
      spells,
    }),
  ])
  gameData.lookups = buildGameDataLookups(gameData)
  const catalogs = buildClassChoiceFeatureCatalogs(gameData)
  const spellsByKey = buildSpellLookup(spells)
  return {
    gameData,
    context: { catalogs, spellsByKey },
    lookups: {
      ...fixture.lookups,
      classesByKey: buildClassLookup(gameData.classes),
      classChoiceClasses: gameData.classes,
      classChoiceFeatureCatalogs: catalogs,
      spellsByKey,
    },
  }
}
