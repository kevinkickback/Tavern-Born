import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { cleanup, renderHook } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { loadGameDataSourceStack } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { withoutSheetDescriptions } from '@/lib/pdf/characterSheetViewModel'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

describe.runIf(existsSync('data/class/class-cleric.json'))(
  'actual configured PSA source dependencies',
  () => {
    let data: GameData
    beforeAll(async () => {
      const failures: string[] = []
      vi.stubGlobal('electronAPI', {
        readBundledJson: async (file: string) =>
          JSON.parse(readFileSync(resolve('resources/srd/data', file), 'utf8')),
        readLocalJson: async (file: string) => JSON.parse(readFileSync(file, 'utf8')),
      })
      data = await loadGameDataSourceStack(
        {
          base: {
            type: 'bundled',
            path: 'srd/core',
            packId: 'tavern-born-srd-core',
            packVersion: 'test',
            isValid: true,
          },
          additional: { type: 'local', path: resolve('data'), isValid: true },
        },
        { onResourceFailure: (file) => failures.push(file) },
      )
      expect(failures).toEqual([])
      useGameDataStore.setState({ gameData: data })
    }, 30000)
    afterAll(() => {
      cleanup()
      vi.unstubAllGlobals()
    })
    function view(allowedSources = ['PSA']) {
      const { result } = renderHook(() =>
        useCharacterGameDataParams({ originSystem: '2024', allowedSources }),
      )
      const current = result.current
      const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(current))
      const cls = current.classes.find((c) => c.name === 'Cleric' && c.source === 'XPHB')!
      const subclass = cls.subclasses?.find(
        (s) => s.name === 'Knowledge Domain (PSA)' && s.source === 'PSA',
      )
      return { data: current, catalogs, cls, subclass }
    }
    const actor = () =>
      createEmptyCharacter({
        name: 'Actual PSA Knowledge',
        originSystem: '2024',
        allowedSources: ['PSA'],
        classProgression: [
          {
            name: 'Cleric',
            source: 'XPHB',
            subclass: 'Knowledge Domain (PSA)',
            subclassSource: 'PSA',
            levels: 3,
          },
        ],
      })
    const materialize = (
      character: Character,
      result: ReturnType<typeof applyClassChoiceSelectionWithGrantsCommand>,
    ) =>
      characterPersistenceSchema.parse({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    function configure() {
      const f = view(),
        choices = getCharacterClassChoices(
          f.cls,
          f.subclass,
          createOptionalClassFeatureActivity(actor(), f.catalogs),
          f.catalogs,
        ).filter((c) => c.kind === 'proficiency')
      expect(choices.map((c) => [c.proficiencyDomain, c.maximumSelections, c.level])).toEqual([
        ['expertise', 2, 3],
        ['languages', 2, 3],
      ])
      let character = actor()
      character.proficiencies.skills = ['arcana']
      character.proficiencies.languages = ['elvish']
      character.provenance = addGrant(
        addGrant(
          character.provenance,
          'skills',
          'arcana',
          makeSourceTag('manual', 'User Choice', 'choice'),
        ),
        'languages',
        'elvish',
        makeSourceTag('manual', 'User Choice', 'choice'),
      )
      for (const choice of choices) {
        const domain = choice.proficiencyDomain
        if (domain !== 'expertise' && domain !== 'languages')
          throw new Error('Unexpected PSA Knowledge proficiency choice.')
        const targets = domain === 'expertise' ? ['Arcana', 'Nature'] : ['Draconic', 'Dwarvish']
        character = materialize(
          character,
          applyClassChoiceSelectionWithGrantsCommand(
            character,
            character.provenance,
            choice,
            targets.map((name) => getProficiencyOption(domain, name)),
            { classes: f.data.classes, catalogs: f.catalogs },
          ),
        )
      }
      return { ...f, character, choices }
    }

    test('shared commands save/reopen, source suspension/restoration, Clear and owner removal preserve independent grants', () => {
      const f = configure(),
        saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(f.character)))
      expect(saved.proficiencies.expertise).toEqual(['arcana', 'nature'])
      const off = view([]),
        suspended = refreshClassProficiencyState(
          { ...saved, allowedSources: [] },
          off.data.classes,
          off.catalogs,
        )
      expect(suspended.proficiencies.skills).toEqual(['arcana'])
      expect(suspended.proficiencies.expertise).toEqual([])
      expect(suspended.proficiencies.languages).toEqual(['elvish'])
      expect(suspended.classChoiceSelections).toEqual(saved.classChoiceSelections)
      const restored = refreshClassProficiencyState(
        { ...suspended, allowedSources: ['PSA'] },
        f.data.classes,
        f.catalogs,
      )
      expect(restored.proficiencies).toEqual(saved.proficiencies)
      const lookups = {
        ...buildGameDataLookups(f.data),
        classChoiceClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      }
      expect(
        validateClassChoices(
          saved,
          createCharacterCalculationContext(saved, lookups),
          f.catalogs,
        ).filter((i) => /Blessings of Knowledge/.test(i.title)),
      ).toEqual([])
      let cleared = saved
      for (const choice of f.choices)
        cleared = materialize(
          cleared,
          retainSavedFeatureOptionsCommand(cleared, cleared.provenance, choice.id, [], {
            classes: f.data.classes,
            catalogs: f.catalogs,
          }),
        )
      expect(cleared.proficiencies.skills).toEqual(['arcana'])
      expect(cleared.proficiencies.expertise).toEqual([])
      expect(cleared.proficiencies.languages).toEqual(['elvish'])
      const removed = materialize(saved, applyClassProgressionUpdate(saved, saved.provenance, []))
      expect(removed.proficiencies.skills).toEqual(['arcana'])
      expect(removed.proficiencies.expertise).toEqual([])
      expect(removed.proficiencies.languages).toEqual(['elvish'])
    })

    test('actual later PHB dependencies remain in Class and sheet Actions; actual PDF retains paired skill values', async () => {
      const f = configure(),
        current = {
          ...f.character,
          classProgression: f.character.classProgression.map((c) => ({ ...c, levels: 17 })),
        }
      const names = deriveRulesTextActions(current, undefined, {
        classes: f.data.classes,
        availableClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      }).map((a) => a.name)
      expect(names).toContain('Channel Divinity: Knowledge of the Ages')
      expect(names).toContain('Channel Divinity: Read Thoughts')
      const lookups = {
        ...buildGameDataLookups(f.data),
        classChoiceClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      }
      const vm = createCurrentCharacterSheetViewModel(current, lookups)
      const passive = f.subclass!.subclassFeatureRefs!.find(
        (r) => r.name === 'Visions of the Past',
      )!
      expect(passive.ref).toBe('Visions of the Past|Cleric||Knowledge||17')
      expect(JSON.stringify(passive.feature?.entries)).toContain('meditation')
      for (const model of [vm, withoutSheetDescriptions(vm)]) {
        expect(model.actions.map((action) => action.name)).toContain(
          'Channel Divinity: Knowledge of the Ages',
        )
        expect(model.actions.map((action) => action.name)).toContain(
          'Channel Divinity: Read Thoughts',
        )
      }
      expect(vm.languagesSummary).toContain('elvish')
      const pdf = await PDFDocument.load(await generateTestCharacterSheet(vm, '2024-official'))
      expect(pdf.getForm().getTextField('Text_32').getText()).toBe(
        `+${vm.skillByName.get('arcana')!.modifier}`,
      )
    }, 30000)

    test('genuine reprint suppresses its older owner without suppressing the retained PSA dependency', () => {
      const f = view(['PSA', 'FRHoF'])
      expect(
        f.cls.subclasses!.some((s) => s.name === 'Knowledge Domain' && s.source === 'PHB'),
      ).toBe(false)
      expect(
        f.cls.subclasses!.some((s) => s.name === 'Knowledge Domain' && s.source === 'FRHoF'),
      ).toBe(true)
      expect(
        getCharacterClassChoices(
          f.cls,
          f.subclass,
          createOptionalClassFeatureActivity(
            { ...actor(), allowedSources: ['PSA', 'FRHoF'] },
            f.catalogs,
          ),
          f.catalogs,
        ).filter((c) => c.kind === 'proficiency'),
      ).toHaveLength(2)
    })
  },
)
