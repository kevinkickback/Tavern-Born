// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  ELEMENTAL_FURY_ID,
  ELEMENTAL_FURY_TARGET,
  IMPROVED_ELEMENTAL_FURY_TARGET,
} from '@/lib/5etools/elementalFurySource'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyLevelDown, applyLevelUp } from '@/lib/character/commands/classCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const druid = { name: 'Druid', source: 'XPHB' }
const sourceFiles = [
  ['bundled', 'resources/srd/core/data/class/class-druid.json'],
  ['configured', 'data/class/class-druid.json'],
] as const
const branches = [
  {
    name: 'Primal Strike',
    base: 'Beast form',
    upgrade: 'extra damage of your Primal Strike increases',
  },
  {
    name: 'Potent Spellcasting',
    base: 'damage you deal with any Druid cantrip',
    upgrade: 'range increases by 300 feet',
  },
] as const

function reopen(
  actor: Character,
  result: { characterPatch: Partial<Character>; provenanceUpdate: Character['provenance'] },
) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({ ...actor, ...result.characterPatch, provenance: result.provenanceUpdate }),
    ),
  )
}

for (const [source, file] of sourceFiles) {
  test.runIf(existsSync(file))(
    `${source} Elemental Fury keeps only the earned, live branch`,
    () => {
      const parsed = parseClassDocument(JSON.parse(readFileSync(file, 'utf8')), file)
      const data = makeGameDataFixture({
        classes: parsed.classes as Class5e[],
        classFeatures: parsed.classFeatures as ClassFeature[],
      })
      const catalogs = buildClassChoiceFeatureCatalogs(data)
      const cls = data.classes.find((row) => row.name === druid.name && row.source === druid.source)
      const choice = cls?.normalizedRules?.choices.find((row) => row.id === ELEMENTAL_FURY_ID)
      if (!choice) throw new Error('Missing exact Elemental Fury choice')
      const lookup = buildGameDataLookups(data)
      const calculate = (actor: Character, live: ClassChoiceFeatureCatalogs = catalogs) =>
        createCharacterCalculationContext(actor, {
          ...lookup,
          classChoiceClasses: live.classes,
          classChoiceFeatureCatalogs: live,
        })
      const choose = (
        actor: Character,
        branch: string,
        live: ClassChoiceFeatureCatalogs = catalogs,
      ) =>
        reopen(
          actor,
          applyClassChoiceSelectionWithGrantsCommand(
            actor,
            actor.provenance,
            choice,
            resolveClassChoiceOptions(
              choice,
              createClassChoiceCatalogs(live),
              [],
              actor.classProgression[0].levels,
              actor,
            )
              .filter((row) => row.reference.name === branch)
              .map((row) => row.reference),
            { classes: data.classes, catalogs: live },
          ),
        )
      const description = (actor: Character, name: string, live?: ClassChoiceFeatureCatalogs) =>
        calculate(actor, live).character.features.find(
          (row) => row.name === name && row.id.startsWith('class-choice:'),
        )?.description
      const withdraw = (target: string) => {
        const candidates = new Map(catalogs.classFeatureCandidates)
        candidates.delete(target)
        return { ...catalogs, classFeatureCandidates: candidates }
      }

      let actor = createEmptyCharacter({
        name: 'Revised Druid',
        originSystem: '2024',
        allowedSources: ['XPHB'],
        classProgression: [{ ...druid, levels: 15 }],
      })
      for (const branch of branches) {
        actor = choose(actor, branch.name)
        const opposite = branch === branches[0] ? branches[1] : branches[0]
        expect(description(actor, branch.name)).toContain(branch.base)
        expect(description(actor, branch.name)).toContain(branch.upgrade)
        expect(description(actor, branch.name)).not.toContain(opposite.upgrade)
        expect(description(actor, opposite.name)).toBeUndefined()

        const liveWithoutUpgrade = withdraw(IMPROVED_ELEMENTAL_FURY_TARGET)
        expect(description(actor, branch.name, liveWithoutUpgrade)).toContain(branch.base)
        expect(description(actor, branch.name, liveWithoutUpgrade)).not.toContain(branch.upgrade)
        const activity = createOptionalClassFeatureActivity(actor, catalogs)
        expect(
          JSON.stringify(
            activity.entries(['class', 'druid', 'xphb'], IMPROVED_ELEMENTAL_FURY_TARGET, []),
          ),
        ).toContain(branch.upgrade)
        expect(
          JSON.stringify(
            activity.entries(['class', 'druid', 'xphb'], IMPROVED_ELEMENTAL_FURY_TARGET, []),
          ),
        ).not.toContain(opposite.upgrade)

        const leaf = `class-feature|${branch.name.toLowerCase()}|druid|xphb|7|xphb`
        expect(activity.declared(['class', 'druid', 'xphb'], leaf, 7)).toBe(false)
        const defaultedCandidates = new Map(catalogs.classFeatureCandidates)
        const exactLeaf = defaultedCandidates.get(leaf)?.[0]
        if (!exactLeaf) throw new Error('Missing exact Elemental Fury branch')
        // The source data can omit a class-feature source and inherit the class source.
        const defaultedLeaf = { ...exactLeaf }
        Reflect.deleteProperty(defaultedLeaf, 'source')
        defaultedCandidates.set(leaf, [defaultedLeaf])
        expect(
          choose(actor, branch.name, { ...catalogs, classFeatureCandidates: defaultedCandidates })
            .classChoiceSelections,
        ).toEqual(actor.classChoiceSelections)
        for (const target of [leaf, ELEMENTAL_FURY_TARGET]) {
          const live = withdraw(target)
          expect(description(actor, branch.name, live)).toBeUndefined()
          expect(getFeatureOptionSelectionStates(actor, data.classes, live)).toContainEqual(
            expect.objectContaining({ projectedBranch: true, recovery: true }),
          )
          expect(() => choose(actor, branch.name, live)).toThrow(/source rules changed/)
        }
        expect(description(actor, branch.name)).toContain(branch.upgrade)

        const reduced = reopen(actor, applyLevelDown(actor, actor.provenance, calculate(actor)))
        expect(reduced.classChoiceSelections).toEqual(actor.classChoiceSelections)
        expect(description(reduced, branch.name)).toContain(branch.base)
        expect(description(reduced, branch.name)).not.toContain(branch.upgrade)
        const restored = reopen(
          reduced,
          applyLevelUp(
            reduced,
            reduced.provenance,
            actor.classProgression,
            {
              className: druid.name,
              classSource: druid.source,
              classLevel: 15,
              hitDie: 8,
              dieResult: 5,
              method: 'average',
            },
            calculate(reduced),
          ),
        )
        expect(description(restored, branch.name)).toContain(branch.upgrade)
      }
      const saved = actor.classChoiceSelections?.find((row) => row.choiceId === ELEMENTAL_FURY_ID)
      if (!saved) throw new Error('Missing saved Elemental Fury branch')
      const cleared = reopen(
        actor,
        retainSavedFeatureOptionsCommand(
          actor,
          actor.provenance,
          ELEMENTAL_FURY_ID,
          [],
          undefined,
          getOptionalPoolSelectionHandle(saved),
        ),
      )
      expect(cleared.classChoiceSelections?.some((row) => row.choiceId === ELEMENTAL_FURY_ID)).toBe(
        false,
      )
      const atSeven = choose(
        { ...cleared, classProgression: [{ ...druid, levels: 7 }] },
        branches[0].name,
      )
      const atSix = reopen(atSeven, applyLevelDown(atSeven, atSeven.provenance, calculate(atSeven)))
      expect(atSix.classChoiceSelections?.some((row) => row.choiceId === ELEMENTAL_FURY_ID)).toBe(
        false,
      )
      expect(description(atSix, branches[0].name)).toBeUndefined()
    },
  )
}
