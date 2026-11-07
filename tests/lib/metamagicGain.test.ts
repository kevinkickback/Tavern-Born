import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import {
  buildClassChoiceFeatureCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionCommand,
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelectionGrants,
} from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeBundledClassCastingLayer } from '../fixtures/classCastingFixtures'

describe.each(['2014', '2024'] as const)('Sorcerer %s Metamagic gain edits', (edition) => {
  test('assigns a later pick even with earlier holes and rejects duplicate, early, and stale edits', () => {
    const source = edition === '2014' ? 'PHB' : 'XPHB'
    const layer = makeBundledClassCastingLayer('class/class-sorcerer.json')
    const optionalFeatures = parseOptionalFeatures(
      JSON.parse(readFileSync('resources/srd/core/data/optionalfeatures.json', 'utf8')),
    )
    layer.optionalfeatures = optionalFeatures
    const cls = layer.classes.find((row) => row.source === source)!
    const entry = { name: 'Sorcerer', source, levels: 17 }
    const character = makeCharacterFixture({
      originSystem: edition,
      allowedSources: [source],
      classProgression: [entry],
    })
    const catalogs = buildClassChoiceFeatureCatalogs(layer)
    const authority = { classes: [cls], catalogs }
    const choice = getCharacterClassChoices(
      cls,
      undefined,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ).find((row) => row.label === 'Metamagic')!
    const careful = { entityType: 'optionalFeature' as const, name: 'Careful Spell', source }
    const distant = { entityType: 'optionalFeature' as const, name: 'Distant Spell', source }

    const first = applyClassChoiceSelectionCommand(
      character,
      choice,
      [careful],
      authority,
      undefined,
      '',
      17,
    )
    const after17 = characterPersistenceSchema.parse({ ...character, ...first })
    const saved = after17.classChoiceSelections![0]
    const handle = getOptionalPoolSelectionHandle(saved)
    expect(saved.selected).toEqual([{ ...careful, slotLevel: 17 }])

    const at10 = applyClassChoiceSelectionCommand(
      after17,
      choice,
      [distant],
      authority,
      undefined,
      handle,
      10,
    )
    expect(at10.classChoiceSelections?.[0].selected).toEqual([
      { ...careful, slotLevel: 17 },
      { ...distant, slotLevel: 10 },
    ])
    const reopened = characterPersistenceSchema.parse({ ...after17, ...at10 })
    const latestHandle = getOptionalPoolSelectionHandle(reopened.classChoiceSelections![0])
    const grants = reconcileClassChoiceSelectionGrants(
      reopened,
      reopened.provenance,
      reopened.classChoiceSelections!,
      catalogs,
    )
    const withGrants = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...reopened,
          features: grants.features,
          provenance: grants.provenanceUpdate,
        }),
      ),
    )
    const missingCatalogs = buildClassChoiceFeatureCatalogs({
      ...layer,
      optionalfeatures: optionalFeatures.filter(
        (option) =>
          typeof option !== 'object' ||
          option === null ||
          !('name' in option) ||
          !('source' in option) ||
          option.name !== careful.name ||
          option.source !== source,
      ),
    })
    expect(withGrants.provenance.features['careful spell']).toHaveLength(1)
    const clearedOtherGain = applyClassChoiceSelectionWithGrantsCommand(
      withGrants,
      withGrants.provenance,
      choice,
      [],
      { classes: [cls], catalogs: missingCatalogs },
      undefined,
      latestHandle,
      10,
    )
    const afterClear = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...withGrants,
          ...clearedOtherGain.characterPatch,
          provenance: clearedOtherGain.provenanceUpdate,
        }),
      ),
    )
    expect(afterClear.features.map((feature) => feature.name)).toEqual([careful.name])
    expect(afterClear.provenance.features['careful spell']).toEqual(
      withGrants.provenance.features['careful spell'],
    )
    expect(afterClear.provenance.features['distant spell']).toBeUndefined()
    const variant = reconcileOptionalClassFeatureChoicesCommand(
      withGrants,
      withGrants.provenance,
      { availableClasses: [cls], allClasses: [cls], classChoiceFeatureCatalogs: missingCatalogs },
      true,
    )
    expect(variant.characterPatch.features?.map((feature) => feature.name)).toContain(careful.name)
    expect(variant.provenanceUpdate.features['careful spell']).toEqual(
      withGrants.provenance.features['careful spell'],
    )
    expect(() =>
      applyClassChoiceSelectionCommand(reopened, choice, [], authority, undefined, handle, 17),
    ).toThrow(/saved choices changed/i)
    expect(() =>
      applyClassChoiceSelectionCommand(
        reopened,
        choice,
        [careful],
        authority,
        undefined,
        latestHandle,
        10,
      ),
    ).toThrow(/before picking it again/i)
    expect(() =>
      applyClassChoiceSelectionCommand(character, choice, [careful], authority, undefined, '', 14),
    ).toThrow(/enough earned slots/i)
    const invalid = characterPersistenceSchema.parse({
      ...after17,
      classChoiceSelections: [{ ...saved, selected: [{ ...careful, slotLevel: 14 }] }],
    })
    expect(getEffectiveClassChoiceFeatureRoutes(invalid, catalogs).contributions).toEqual([])
    const invalidHandle = getOptionalPoolSelectionHandle(invalid.classChoiceSelections![0])
    expect(() =>
      applyClassChoiceSelectionCommand(
        invalid,
        choice,
        [distant],
        authority,
        undefined,
        invalidHandle,
        10,
      ),
    ).toThrow(/invalid or overfilled slots/i)
    const repaired = applyClassChoiceSelectionCommand(
      invalid,
      choice,
      [],
      authority,
      undefined,
      invalidHandle,
      choice.level,
    )
    const repairedSave = characterPersistenceSchema.parse({ ...invalid, ...repaired })
    expect(repairedSave.classChoiceSelections?.flatMap((row) => row.selected) ?? []).toEqual([])

    const cleared = applyClassChoiceSelectionCommand(
      reopened,
      choice,
      [],
      authority,
      undefined,
      latestHandle,
      17,
    )
    expect(cleared.classChoiceSelections?.[0].selected).toEqual([{ ...distant, slotLevel: 10 }])
  })
})
