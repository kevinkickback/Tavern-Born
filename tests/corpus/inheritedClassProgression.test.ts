// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  getClassSpellProfilePolicy,
  replacementSpellcastingAddress,
} from '@/lib/5etools/classCastingRules'
import { getCurrentClassCastingProducer } from '@/lib/5etools/classCastingSource'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
  getSubclassFeatureReferenceLevel,
} from '@/lib/5etools/classFeatureIdentity'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import {
  getClassResourceRecoveryAtLevel,
  normalizeClassRules,
} from '@/lib/5etools/classRuleNormalization'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getEarnedSubclassFeatureSource } from '@/lib/5etools/ownedSubclassFeature'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { getRevisedInvocationPoolId } from '@/lib/5etools/warlockInvocationCantripSource'
import { getWeaponInscriptionSetup } from '@/lib/5etools/weaponInscribedSpells'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import { deriveFighterPassiveEffects } from '@/lib/calculations/fighterPassiveEffects'
import { getWalkingSpeed } from '@/lib/calculations/movement'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import {
  createGameDataAvailabilityIndex,
  getUnavailableCharacterContent,
} from '@/lib/character/additionalContentAvailability'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceCandidates,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  isClassChoiceOptionEligibleInDraft,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import {
  addMulticlass,
  applyClassSelectionCommand,
  applyLevelDown,
  applyLevelUp,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import {
  applyManualProficiencyCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { commitFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import {
  setManagedClassSpellChoiceCommand,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { setWeaponInscription } from '@/lib/character/commands/weaponInscriptionCommands'
import { getDirectClassPreparedSpellGrants } from '@/lib/character/directClassPreparedSpells'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import {
  getEpicBoonSlots,
  projectEpicBoonSlots,
  replaceEpicBoonSelection,
} from '@/lib/character/epicBoonSlots'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { getRevisedClassFeatSlot } from '@/lib/character/revisedClassFeatSlot'
import { getSelectedFeatureCantripSlots } from '@/lib/character/selectedFeatureSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getClassStaticFeatureSummaries } from '@/lib/pdf/classStaticFeatureSummaries'
import type { SheetExportReport } from '@/lib/pdf/types'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import {
  getDisplayedClassFeatures,
  projectClassLevelFeatures,
} from '@/pages/build/class/model/pageUtils'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const sources = ['XPHB', 'WoW']
const available = [
  'class/class-deathknight.json',
  'class/class-demonhunter.json',
  'class/class-warlock.json',
  'class/class-cleric.json',
  'generated/gendata-spell-source-lookup.json',
].every((path) => existsSync(`data/${path}`))
const reopen = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )

describe.runIf(available)('configured inherited class progression', () => {
  let data: GameData
  let lookups: ReturnType<typeof buildGameDataLookups>
  let catalogs: ReturnType<typeof buildClassChoiceFeatureCatalogs>

  const loadWithCopy = (
    parent: 'Cleric' | 'Druid',
    actor = 'Lightkeeper',
    source = 'EXAMPLE',
    conflictingFeatureText?: 'nested' | 'inline',
  ) =>
    new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true },
      {
        type: 'local',
        readJson: async (file) => {
          const document = JSON.parse(await readFile(`data/${file}`, 'utf8'))
          if (actor === 'Priest' && file === 'class/class-priest.json') {
            document.class = document.class.filter(
              (row: { source: string }) => row.source !== source,
            )
          }
          if (file === `class/class-${parent.toLowerCase()}.json`) {
            document._meta.internalCopies.push('class')
            document.class.push({
              name: actor,
              source,
              _copy: { name: parent, source: 'XPHB' },
            })
            if (parent === 'Cleric' && actor === 'Lightkeeper') {
              const original = document.class.find(
                (row: { source: string }) => row.source === 'XPHB',
              )
              const root = document.classFeature.find(
                (row: { source: string; name: string }) =>
                  row.source === 'XPHB' && row.name === 'Spellcasting',
              )
              document.class.push({
                name: 'Wardkeeper',
                source,
                _copy: { name: parent, source: 'XPHB' },
                classFeatures: original.classFeatures.map((ref: unknown) =>
                  ref === 'Spellcasting|Cleric|XPHB|1'
                    ? `Spellcasting|Wardkeeper|${source}|1`
                    : ref,
                ),
              })
              document.classFeature.push({
                ...root,
                className: 'Wardkeeper',
                classSource: source,
                source,
              })
            }
          }
          if (source === 'EXAMPLE' && file === 'generated/gendata-spell-source-lookup.json') {
            for (const name of ['sacred flame', 'cure wounds']) {
              document.xphb[name].class.EXAMPLE = { Lightkeeper: true, Wardkeeper: true }
            }
            document.xphb['eldritch blast'].class.EXAMPLE = { Hexbinder: true }
          }
          if (actor === 'Lightkeeper' && file === 'class/class-fighter.json') {
            document._meta.internalCopies ??= []
            if (!document._meta.internalCopies.includes('class'))
              document._meta.internalCopies.push('class')
            document.class.push(
              {
                name: 'Tactician',
                source,
                _copy: { name: 'Fighter', source: 'XPHB' },
              },
              {
                name: 'Tactician',
                source: 'OTHER',
                _copy: { name: 'Fighter', source: 'XPHB' },
              },
            )
          }
          if (actor === 'Lightkeeper' && file === 'class/class-warlock.json') {
            document.class.push({
              name: 'Hexbinder',
              source,
              _copy: { name: 'Warlock', source: 'XPHB' },
            })
          }
          if (actor === 'Lightkeeper' && file === 'class/class-deathknight.json') {
            const template = document.class.find(
              (row: { name: string }) => row.name === 'Death Knight',
            )
            document.class.push({ ...structuredClone(template), name: 'Wardblade', source })
          }
          if (conflictingFeatureText && file === 'class/class-druid.json') {
            const terrain = document.subclassFeature.find(
              (row: { name: string; source: string }) =>
                row.name === 'Circle of the Land Spells' && row.source === 'XPHB',
            )
            terrain.entries[0] = terrain.entries[0].replace('land: arid, polar', 'land: polar')
          }
          if (conflictingFeatureText && file === 'class/class-barbarian.json') {
            const echo = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Echo of the Elements',
            )
            echo.entries[0] = echo.entries[0].replace(
              'Wind Wall|XPHB}.',
              'Wind Wall|XPHB} by also expending a spell slot.',
            )
          }
          if (conflictingFeatureText && file === 'class/class-deathknight.json') {
            const oath = document.subclass.find(
              (row: { name: string }) => row.name === 'Oath of the Ebon Blade',
            )
            const frost = oath.additionalSpells.find(
              (row: { name: string }) => row.name === 'Frost',
            )
            const blood = oath.additionalSpells.find(
              (row: { name: string }) => row.name === 'Blood',
            )
            oath.name = 'Oath of the Ebon Blade #2'
            frost.name = 'Frost #2'
            frost.prepared['3'][1] += '#c'
            blood.prepared['3'][1] = 'chains of ice|wow'
            const spellTable = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Oath of the Ebon Blade Spells',
            ).entries[1]
            spellTable.colLabels[3] = 'Spells (Frost #2)'
            spellTable.rows[0][2] = '{@spell Chains of Ice|WoW}'
            const forging = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Runeforging',
            )
            forging.entries[2].name = 'Frost #2'
            const smite = document.classFeature.find(
              (row: { name: string }) => row.name === 'Runic Smite',
            )
            smite.entries[1] = smite.entries[1].replace(
              'Long Rest|XPHB',
              conflictingFeatureText === 'inline' ? 'Long Rest|XPHB|Short Rest' : 'Long Rest|WoW',
            )
            const steed = document.classFeature.find(
              (row: { name: string; className: string }) =>
                row.name === 'Faithful Steed' && row.className === 'Death Knight',
            )
            if (conflictingFeatureText === 'inline') {
              steed.entries[2] = steed.entries[2].replace(
                'can be Undead.',
                'can be Undead; you can cast the spell without a slot only while you have the Undead creature type.',
              )
            } else {
              steed.entries[3].entries.push(
                'You can only cast Find Steed in this way while you have the Undead creature type.',
              )
            }
          }
          return document
        },
      },
    ).loadAllData()
  beforeAll(async () => {
    data = composeGameDataLayers([await loadWithCopy('Cleric')])
    lookups = buildGameDataLookups(data)
    catalogs = buildClassChoiceFeatureCatalogs(data)
  }, 45_000)

  const classRow = (name: string, source = 'WoW') =>
    data.classes.find((row) => row.name === name && row.source === source)!
  const spellContext = (character: Character) => ({
    catalogs,
    spellsByKey: lookups.spellsByKey,
    abilityScores: character.abilityScores,
  })
  const calculation = (character: Character) =>
    createCharacterCalculationContext(character, {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    })
  const start = (name: string, source = 'WoW') => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['XPHB', source],
      classProgression: [],
      initialClass: undefined,
    })
    return reopen(
      character,
      applyClassSelectionCommand(
        character,
        character.provenance,
        classRow(name, source),
        undefined,
        lookups.itemLookup,
        { classChoiceFeatureCatalogs: catalogs },
      ),
    )
  }
  const levelUp = (character: Character, hitDie: number) => {
    const [entry] = character.classProgression
    return reopen(
      character,
      applyLevelUp(
        character,
        character.provenance,
        [{ ...entry, levels: entry.levels + 1 }],
        {
          className: entry.name,
          classSource: entry.source,
          classLevel: entry.levels + 1,
          hitDie,
          dieResult: hitDie / 2 + 1,
          method: 'average',
        },
        calculation(character),
      ),
    )
  }

  const reachLevel = (character: Character, level: number) => {
    const [entry] = character.classProgression
    const die = classRow(entry.name, entry.source).hd!.faces
    while (character.classProgression[0].levels < level) character = levelUp(character, die)
    return character
  }
  const chooseSubclass = (character: Character, name: string) =>
    reopen(
      character,
      selectSubclass(character, character.provenance, name, 'WoW', undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
  const fixedSpells = (character: Character) =>
    calculation(character)
      .character.spells.spellProfiles.flatMap((profile) => profile.fixedSpells ?? [])
      .map((reference) => reference.toLowerCase())

  const classChoices = (character: Character) => {
    const [entry] = character.classProgression
    const cls = classRow(entry.name, entry.source)
    return getCharacterClassChoices(
      cls,
      cls.subclasses?.find(
        (row) => row.name === entry.subclass && row.source === entry.subclassSource,
      ),
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    )
  }
  const classChoice = (character: Character, label: string) =>
    classChoices(character).find((row) => row.label === label)!
  const selectOptions = (
    character: Character,
    label: string,
    ...options: Parameters<typeof applyClassChoiceSelectionWithGrantsCommand>[3]
  ) => {
    const choice = classChoice(character, label)
    const saved = character.classChoiceSelections?.find((row) => row.choiceId === choice.id)
    return reopen(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        options,
        {
          classes: data.classes,
          catalogs,
          spellContext: calculation(character).classChoices.spellContext,
        },
        undefined,
        label === 'Eldritch Invocations'
          ? saved
            ? getOptionalPoolSelectionHandle(saved)
            : ''
          : undefined,
      ),
    )
  }
  const spellPicks = (character: Character, slots: ManagedClassSpellSlot[], names: string[]) =>
    reopen(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        slots.map((slot, index) => ({
          slot,
          expected: null,
          expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
          target: { name: names[index], source: 'XPHB' },
          policy: 'default',
        })),
        calculation(character).classChoices.spellContext,
      ),
    )
  const followupSheet = (character: Character) => {
    const primary = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    return createCharacterSheetViewModel(character, primary, primary)
  }

  test('WoW Rogue learns Cant and can save a separate language under its copied owner', () => {
    const rogue = start('Rogue')
    const native = start('Rogue', 'XPHB')
    const label = "Thieves' Cant languages"
    const choice = classChoice(rogue, label)
    expect(choice.owner).toMatchObject({ name: 'Rogue', source: 'WoW', featureSource: 'XPHB' })
    expect(choice.id).not.toBe(classChoice(native, label).id)
    expect(calculation(rogue).character.proficiencies.languages).toContain("thieves' cant")
    expect(
      validateClassChoices(rogue, calculation(rogue), createClassChoiceCatalogs(catalogs)),
    ).toContainEqual(
      expect.objectContaining({ id: `class-choice:${choice.id}`, severity: 'blocking' }),
    )
    const saved = selectOptions(rogue, label, getProficiencyOption('languages', 'Elvish'))
    expect(calculation(saved).character.proficiencies.languages).toEqual(
      expect.arrayContaining(["thieves' cant", 'elvish']),
    )
    const withdrawn = calculation({ ...saved, allowedSources: ['XPHB'] }).character
    expect(withdrawn.proficiencies.languages).not.toContain("thieves' cant")
    expect(withdrawn.proficiencies.languages).not.toContain('elvish')
    expect(
      calculation({ ...withdrawn, allowedSources: rogue.allowedSources }).character.proficiencies
        .languages,
    ).toEqual(expect.arrayContaining(["thieves' cant", 'elvish']))
    const withManual = reopen(
      saved,
      applyManualProficiencyCommand(saved, saved.provenance, 'languages', 'elvish', true),
    )
    const cleared = calculation(selectOptions(withManual, label)).character
    expect(cleared.proficiencies.languages).toEqual(
      expect.arrayContaining(["thieves' cant", 'elvish']),
    )
    expect(cleared.provenance.proficiencies.languages.elvish).toMatchObject([
      { sourceType: 'manual' },
    ])
  })

  test('WoW Champion can save a distinct seventh-level style and retain the first on rollback', () => {
    const style = (name: string) => ({ entityType: 'feat' as const, name, source: 'XPHB' })
    const first = selectOptions(start('Warrior'), 'Fighting Style', style('Archery'))
    const champion = chooseSubclass(reachLevel(first, 7), 'Champion')
    const choice = classChoices(champion).find(
      (row) => row.label === 'Fighting Style' && row.level === 7,
    )!
    const calculated = calculation(champion)
    const authority = {
      classes: data.classes,
      catalogs,
      feats: data.feats,
      spellContext: calculated.classChoices.spellContext,
      prerequisites: calculated.classChoices.prerequisites,
    }
    const options = resolveClassChoiceOptions(
      choice,
      { ...createClassChoiceCatalogs(catalogs), feats: data.feats },
      [],
      7,
      calculated.character,
    )
    const snapshot = buildPrerequisiteSnapshot({
      character: champion,
      classProgression: champion.classProgression,
      classLookup: lookups.classesByKey,
      effectiveAbilityScores: calculated.abilityScores.total,
      effectiveSpellProfiles: calculated.character.spells.spellProfiles,
      classChoiceFeatureCatalogs: catalogs,
      classChoicePrerequisites: calculated.classChoices.prerequisites,
    })
    const context = { className: 'Warrior', classSource: 'WoW' }
    expect(options.find((option) => option.reference.name === 'Archery')).toBeUndefined()
    expect(
      checkAllPrerequisites(
        options.find((option) => option.reference.name === 'Defense')!,
        snapshot,
        context,
      ).met,
    ).toBe(true)
    expect(
      resolveClassChoiceOptions(
        choice,
        { ...createClassChoiceCatalogs(catalogs), feats: data.feats },
        [],
        7,
        { ...calculated.character, allowedSources: ['XPHB'] },
      ).filter(isClassChoiceOptionEligible),
    ).toEqual([])
    const pick = (name: string) =>
      applyClassChoiceSelectionWithGrantsCommand(
        champion,
        champion.provenance,
        choice,
        [style(name)],
        authority,
      )
    expect(() => pick('Archery')).toThrow()
    const saved = reopen(champion, pick('Defense'))
    const chosen = (character: Character) =>
      character.classChoiceSelections
        ?.filter((row) => row.label === 'Fighting Style')
        .flatMap((row) => row.selected.map((option) => option.name))
    expect(chosen(saved)).toEqual(['Archery', 'Defense'])
    const rolledBack = reopen(saved, applyLevelDown(saved, saved.provenance, calculation(saved)))
    expect(chosen(rolledBack)).toEqual(['Archery'])
  })

  test('Mystic Brews grants training and uses the Monk pool when Performance was already known', () => {
    const monk = start('Monk')
    const advance = (actor: Character) =>
      chooseSubclass(reachLevel(actor, 3), 'Warrior of Mystic Brews')
    const firstTraining = calculation(advance(monk)).character.proficiencies
    expect(firstTraining.skills).toContain('performance')
    expect(firstTraining.tools).toContain("brewer's supplies")

    const entertainer = data.backgrounds.find(
      (row) => row.name === 'Entertainer' && row.source === 'XPHB',
    )!
    const trained = advance(
      reopen(
        monk,
        applyBackgroundSelectionCommand(monk, monk.provenance, entertainer, [], lookups.itemLookup),
      ),
    )
    const choice = classChoices(trained).find(
      (row) =>
        row.owner.featureName === 'Bonus Proficiencies' && row.proficiencyDomain === 'skills',
    )!
    const answered = reopen(
      trained,
      setHistoricalProficiencySetupCommand(trained, trained.provenance, choice, true, catalogs),
    )
    const pool = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      3,
      answered,
    )
      .filter(isClassChoiceOptionEligible)
      .map((row) => row.reference.name.toLowerCase())
    expect(pool.sort()).toEqual(['athletics', 'history', 'insight', 'religion', 'stealth'])
    const saved = selectOptions(answered, choice.label, getProficiencyOption('skills', 'History'))
    const projected = calculation(saved).character
    expect(projected.proficiencies.skills).toEqual(
      expect.arrayContaining(['history', 'performance']),
    )
    expect(projected.provenance.proficiencies.skills.performance).toMatchObject([
      { sourceType: 'background', sourceName: 'Entertainer' },
    ])
    expect(projected.proficiencies.tools).toContain("brewer's supplies")
    const withdrawn = calculation({ ...saved, allowedSources: ['XPHB'] }).character
    expect(withdrawn.proficiencies.skills).toContain('performance')
    expect(withdrawn.proficiencies.skills).not.toContain('history')
    expect(withdrawn.proficiencies.tools).not.toContain("brewer's supplies")
    const withTool = reopen(
      monk,
      applyManualProficiencyCommand(monk, monk.provenance, 'tools', "brewer's supplies", true),
    )
    const independentTool = calculation(advance(withTool)).character
    expect(independentTool.proficiencies.tools).toContain("brewer's supplies")
    expect(independentTool.provenance.proficiencies.tools["brewer's supplies"]).toMatchObject([
      { sourceType: 'manual' },
    ])
  })

  test('Evoker gains the printed Draconic Resilience and owns its Elemental Affinity choice', () => {
    const actor = chooseSubclass(reachLevel(start('Evoker'), 3), 'Draconic Sorcery')
    const earnedEffects = (character: Character) =>
      calculation(character).effects.sourceDeclarations
    const resilience = (character: Character) =>
      earnedEffects(character).filter((effect) => effect.label === 'Draconic Resilience')
    expect(resilience(actor)).toContainEqual(
      expect.objectContaining({
        target: { kind: 'hit-point-maximum' },
        operation: { kind: 'add', value: 3 },
      }),
    )
    const fifth = reachLevel(actor, 5)
    const sixth = reachLevel(fifth, 6)
    expect(resilience(sixth)).toContainEqual(
      expect.objectContaining({
        target: { kind: 'hit-point-maximum' },
        operation: { kind: 'add', value: 6 },
      }),
    )
    const choice = classChoice(sixth, 'Elemental Affinity')
    expect(choice.owner).toMatchObject({ name: 'Evoker', source: 'WoW', featureSource: 'XPHB' })
    const options = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      6,
      sixth,
    ).filter(isClassChoiceOptionEligible)
    expect(options.map((option) => option.reference.name)).toEqual([
      'Acid',
      'Cold',
      'Fire',
      'Lightning',
      'Poison',
    ])
    const fire = options.find((option) => option.reference.name === 'Fire')!.reference
    expect(classChoices(fifth).some((row) => row.id === choice.id)).toBe(false)
    const selected = selectOptions(sixth, choice.label, fire)
    const resistances = (character: Character) =>
      earnedEffects(character).filter((effect) => effect.label === 'Elemental Affinity')
    expect(resistances(selected)).toContainEqual(
      expect.objectContaining({
        target: { kind: 'damage-resistance', damageType: 'fire' },
      }),
    )
    const withdrawn = { ...selected, allowedSources: ['XPHB'] }
    expect(resilience(withdrawn)).toEqual([])
    expect(resistances(withdrawn)).toEqual([])
    expect(
      resistances(
        reopen(withdrawn, {
          characterPatch: { allowedSources: sources },
          provenanceUpdate: withdrawn.provenance,
        }),
      ),
    ).toEqual(resistances(selected))
    const rolledBack = reopen(
      selected,
      applyLevelDown(selected, selected.provenance, calculation(selected)),
    )
    expect(resistances(rolledBack)).toEqual([])
  })

  test('copied subclass roots retain their certified fixed grants and required proficiency choices', () => {
    const trained = (cls: string, subclass: string) =>
      chooseSubclass(reachLevel(start(cls), 3), subclass)
    const assassin = trained('Rogue', 'Assassin')
    expect(calculation(assassin).character.proficiencies.tools).toEqual(
      expect.arrayContaining(['disguise kit', "poisoner's kit"]),
    )
    const mercy = calculation(trained('Monk', 'Warrior of Mercy')).character.proficiencies
    expect(mercy.skills).toEqual(expect.arrayContaining(['insight', 'medicine']))
    expect(mercy.tools).toContain('herbalism kit')
    const warrior = trained('Warrior', 'Battle Master')
    const skills = classChoice(warrior, 'Student of War skills')
    const tools = classChoice(warrior, 'Student of War tools')
    expect(skills.owner).toMatchObject({ name: 'Warrior', source: 'WoW', featureSource: 'XPHB' })
    const options = resolveClassChoiceOptions(
      skills,
      createClassChoiceCatalogs(catalogs),
      [],
      3,
      warrior,
    )
      .filter(isClassChoiceOptionEligible)
      .map((row) => row.reference.name.toLowerCase())
    expect(options.sort()).toEqual([
      'acrobatics',
      'animal handling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'persuasion',
      'survival',
    ])
    const withHistory = selectOptions(
      warrior,
      skills.label,
      getProficiencyOption('skills', 'History'),
    )
    const saved = selectOptions(
      withHistory,
      tools.label,
      getProficiencyOption('tools', "Brewer's Supplies"),
    )
    const current = calculation(saved).character
    expect(current.proficiencies.skills).toContain('history')
    expect(current.proficiencies.tools).toContain("brewer's supplies")
    const withdrawn = calculation({ ...saved, allowedSources: ['XPHB'] }).character
    expect(withdrawn.proficiencies.skills).not.toContain('history')
    expect(withdrawn.proficiencies.tools).not.toContain("brewer's supplies")
  })

  test.each([
    ['Druid', 'Circle of the Stars', 6, 'Cosmic Omen', 3],
    ['Priest', 'War Domain', 3, 'War Priest', 3],
    ['Rogue', 'Soulknife', 20, 'Psionic Energy Dice', 12],
    ['Rogue', 'Soulknife', 13, 'Psychic Veil', 1],
    ['Rogue', 'Soulknife', 17, 'Rend Mind', 1],
  ] as const)(
    '%s derives the earned %s counter at level %i',
    (name, subclass, level, label, maximum) => {
      const actor = {
        ...chooseSubclass(reachLevel(start(name), 3), subclass),
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 16,
          charisma: 16,
        },
      }
      const current = reachLevel(actor, level)
      const resources = (character: Character) =>
        getCharacterClassResources(character, () => classRow(name), {
          catalogs,
          charismaModifier: 3,
          abilityModifiers: calculation(character).abilityScores.modifiers,
          unlimitedWildShape: false,
        })
      expect(resources(current).find((row) => row.label === label)?.max).toBe(maximum)
      expect(
        resources({ ...current, allowedSources: ['XPHB'] }).some((row) => row.label === label),
      ).toBe(false)
    },
    12_000,
  )

  test.each([
    [
      'Warrior',
      'Champion',
      'Remarkable Athlete',
      { kind: 'conditional-note', note: 'Advantage on Initiative rolls.' },
    ],
    ['Rogue', 'Swashbuckler', 'Rakish Audacity', { kind: 'add', value: 3 }],
  ] as const)('%s derives %s initiative rules from the selected subclass', (name, subclass, label, operation) => {
    const selected = chooseSubclass(reachLevel(start(name), 3), subclass)
    const actor = { ...selected, abilityScores: { ...selected.abilityScores, charisma: 16 } }
    const effects = (character: Character) => calculation(character).effects.sourceDeclarations
    expect(effects(actor)).toContainEqual(
      expect.objectContaining({
        label,
        target: { kind: 'initiative' },
        operation,
      }),
    )
    expect(effects({ ...actor, allowedSources: ['XPHB'] }).some((row) => row.label === label)).toBe(
      false,
    )
  })

  test('a later feature from another printing preserves an earned passive', () => {
    const warrior = classRow('Warrior')
    const champion = warrior.subclasses!.find((row) => row.shortName === 'Champion')!
    const battleMaster = classRow('Fighter', 'XPHB').subclasses!.find(
      (row) => row.shortName === 'Battle Master' && row.source === 'XPHB',
    )!
    const added = battleMaster.subclassFeatureRefs!.find((row) => row.name === 'Know Your Enemy')!
    const classes = data.classes.map((row) =>
      row === warrior
        ? {
            ...row,
            subclasses: row.subclasses!.map((subclass) =>
              subclass === champion
                ? {
                    ...subclass,
                    subclassFeatures: [
                      ...(subclass.subclassFeatures ?? []).filter((ref) => typeof ref === 'string'),
                      added.ref,
                    ],
                    subclassFeatureRefs: [...(subclass.subclassFeatureRefs ?? []), added],
                  }
                : subclass,
            ),
          }
        : row,
    )
    const mixedCatalogs = buildClassChoiceFeatureCatalogs({ ...data, classes })
    const selected = chooseSubclass(reachLevel(start('Warrior'), 3), 'Champion')
    const later = reachLevel(selected, 7)
    const [entry] = later.classProgression
    expect(
      getEarnedSubclassFeatureSource(later, entry, mixedCatalogs)?.features.map(
        ({ feature }) => feature.name,
      ),
    ).toContain('Know Your Enemy')
    const effects = deriveFighterPassiveEffects(selected, mixedCatalogs)
    expect(effects.map((row) => row.label)).toEqual(['Remarkable Athlete', 'Remarkable Athlete'])
    expect(deriveFighterPassiveEffects(later, mixedCatalogs)).toEqual(effects)
    expect(
      getCharacterClassResources(
        later,
        () => classes.find((row) => row.name === 'Warrior' && row.source === 'WoW'),
        {
          catalogs: mixedCatalogs,
          charismaModifier: 0,
          unlimitedWildShape: false,
        },
      ).some((row) => row.label === 'Know Your Enemy'),
    ).toBe(true)
  })

  test.each([
    ['Monk', 'Warrior of Mystic Brews', 6, 'Mystic Brew', 'pint of the beverage'],
    ['Priest', 'Shadow Domain', 17, 'Vampiric Embrace', 'regains that many Hit Points'],
    ['Death Knight', 'Oath of the Ebon Blade', 20, 'Aspect of the Horsemen', 'Runic Mastery'],
    ['Evoker', 'Draconic Sorcery', 18, 'Dragon Companion', 'without a Material component'],
    ['Demon Hunter', 'Demon Hunter', 3, 'Soul Fragments', 'a whirlwind of soul energy'],
  ] as const)(
    '%s exports the earned %s rule at level %i',
    async (name, subclass, level, feature, phrase) => {
      const actor = chooseSubclass(reachLevel(start(name), 3), subclass)
      const earned = reachLevel(actor, level)
      const summaries = (character: Character) =>
        getClassStaticFeatureSummaries(character, catalogs, false).filter(
          (summary) => summary.compactText === feature,
        )
      expect(
        summaries({
          ...earned,
          classProgression: [{ ...earned.classProgression[0], levels: level - 1 }],
        }),
      ).toHaveLength(0)
      const current = summaries(earned)
      expect(current).toMatchObject([
        { text: expect.stringContaining(phrase), compactText: feature },
      ])
      if (feature === 'Mystic Brew')
        expect(current[0].text).toContain("extend the benefits' duration to 8 hours")
      expect(summaries({ ...earned, allowedSources: ['XPHB'] })).toHaveLength(0)
      const view = followupSheet(earned)
      for (const template of ['2024-official', '2024-custom'] as const) {
        let report: SheetExportReport | undefined
        const pdf = await PDFDocument.load(
          await generateTestCharacterSheet(view, template, {
            text: { descriptions: 'full', overflow: 'notes' },
            onReport: (result) => {
              report = result
            },
          }),
        )
        const fields = pdf
          .getForm()
          .getFields()
          .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        const preserved = report?.preserved.map(({ title, text }) => `${title} ${text}`) ?? []
        const output = [...fields, ...preserved].join(' ').replace(/\s+/g, ' ')
        expect(output).toContain(feature)
        expect(output).toContain(phrase)
        if (feature === 'Mystic Brew')
          expect(output).toContain("extend the benefits' duration to 8 hours")
        expect(report?.omitted.some(({ text }) => text.includes(phrase))).toBe(false)
      }
    },
    20_000,
  )

  test('an action in the custom sheet Notes prints its exact subclass rules once', async () => {
    const knight = reachLevel(
      chooseSubclass(reachLevel(start('Death Knight'), 3), 'Oath of the Ebon Blade'),
      20,
    )
    const pdf = await PDFDocument.load(
      await generateTestCharacterSheet(followupSheet(knight), '2014-custom', {
        text: { descriptions: 'full', overflow: 'notes' },
      }),
    )
    const bodies = pdf
      .getForm()
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(bodies.split('restore your use of it by expending a level 5 spell slot')).toHaveLength(2)
  }, 20_000)

  test.each([
    ['Druidic Warrior', 'XPHB', ['Guidance', 'Starry Wisp']],
    ['Void Warrior', 'WoW', ['Chill Touch', 'Mind Sliver']],
  ] as const)('explicit Fighting Style %s owns two exact class cantrips', (name, source, spells) => {
    const second = reachLevel(start('Demon Hunter'), 2)
    const selected = selectOptions(second, 'Fighting Style', { entityType: 'feat', name, source })
    const mirror = selected.classFeatChoices?.find(
      (row) => row.progressionName === 'Fighting Style',
    )
    if (!mirror) throw new Error('Expected the selected class feat owner.')
    expect(mirror.feats).toMatchObject([{ name, source, classSpellSetup: true }])
    expect(() =>
      commitFeatOptionsCommand(
        selected,
        selected.provenance,
        { name, source, classFeatChoiceId: mirror.id },
        { spells: [spells[0]] },
      ),
    ).toThrow(/Class spell choices/)
    const slots = getManagedClassSpellSlots(
      selected.classProgression[0],
      selected,
      catalogs,
    ).filter((row) => row[1] === 'feature-cantrip')
    expect(slots).toHaveLength(2)
    const picked = spellPicks(selected, slots, [...spells])
    expect(
      calculation(picked).managedClassSpellStatuses.map((row) => [
        row.choice.target.name,
        row.active,
      ]),
    ).toEqual(spells.map((spell) => [spell, true]))
    const cleared = selectOptions(picked, 'Fighting Style', {
      entityType: 'feat',
      name: 'Defense',
      source: 'XPHB',
    })
    expect(cleared.managedClassSpellChoices).toEqual([])
  })

  test.each([
    'WoW',
    'XPHB',
  ])('%s Warlock derives Chain and owns both Tome spell pools', (source) => {
    const actor = { ...start('Warlock', source), allowedSources: ['XPHB', 'WoW'] }
    const option = (name: string, printing = 'XPHB') => ({
      entityType: 'optionalFeature' as const,
      name,
      source: printing,
    })
    const chain = option('Pact of the Chain')
    const legion = option('Pact of the Legion', 'WoW')
    const tome = option('Pact of the Tome')
    const second = reachLevel(actor, 2)
    const combined = selectOptions(second, 'Eldritch Invocations', chain, legion)
    expect(
      calculation(combined).fixedClassSpellStatuses.filter(
        (row) => row.active && row.reference === 'Find Familiar|XPHB',
      ),
    ).toHaveLength(2)
    expect(
      followupSheet(combined).actions.filter(
        (row) => row.name === 'Find Familiar' && row.kind === 'action',
      ),
    ).toHaveLength(1)
    const justLegion = selectOptions(combined, 'Eldritch Invocations', legion)
    expect(
      calculation(justLegion)
        .fixedClassSpellStatuses.filter((row) => row.active)
        .map((row) => row.featureName),
    ).toContain(legion.name)
    const selected = selectOptions(actor, 'Eldritch Invocations', tome)
    const slots = getManagedClassSpellSlots(
      selected.classProgression[0],
      selected,
      catalogs,
    ).filter((row) => row[1] === 'feature-cantrip' || row[1] === 'feature-prepared')
    expect(slots.map((row) => row[1])).toEqual([
      'feature-cantrip',
      'feature-cantrip',
      'feature-cantrip',
      'feature-prepared',
      'feature-prepared',
    ])
    expect(() => spellPicks(selected, [slots[3]], ['Magic Missile'])).toThrow(/eligible spell/)
    const normal = getManagedClassSpellSlots(selected.classProgression[0], selected, catalogs).find(
      (row) => row[1] === 'class-cantrip',
    )!
    expect(() =>
      spellPicks(selected, [normal, slots[0]], ['Eldritch Blast', 'Eldritch Blast']),
    ).toThrow(/already have prepared/)
    const withChain = selectOptions(second, 'Eldritch Invocations', tome, chain)
    expect(() => spellPicks(withChain, [slots[3]], ['Find Familiar'])).toThrow(
      /already have prepared/,
    )
    const bookBlast = spellPicks(
      selectOptions(second, 'Eldritch Invocations', tome),
      [slots[0]],
      ['Eldritch Blast'],
    )
    const agonizing = {
      ...option('Agonizing Blast'),
      invocationCantrip: { name: 'Eldritch Blast', source: 'XPHB' },
    }
    expect(() => selectOptions(bookBlast, 'Eldritch Invocations', agonizing)).toThrow(
      /current eligible known Warlock cantrip/,
    )
    const targeting = selectOptions(bookBlast, 'Eldritch Invocations', tome, agonizing)
    expect(
      calculation(targeting).character.features.some((row) => row.name === agonizing.name),
    ).toBe(true)
    const withoutBook = selectOptions(targeting, 'Eldritch Invocations', agonizing)
    expect(
      calculation(withoutBook).character.features.some((row) => row.name === agonizing.name),
    ).toBe(false)
    if (source === 'WoW') {
      const bard = classRow('Bard', 'XPHB')
      const multiclass = reopen(
        selected,
        addMulticlass(selected, selected.provenance, bard.name, bard, bard.source),
      )
      const bardSlot = getManagedClassSpellSlots(
        multiclass.classProgression[1],
        multiclass,
        catalogs,
      ).find((row) => row[1] === 'class-known')!
      const bardPrepared = spellPicks(multiclass, [bardSlot], ['Detect Magic'])
      expect(() => spellPicks(bardPrepared, [slots[3]], ['Detect Magic'])).toThrow(
        /already have prepared/,
      )
    }
    const learned = spellPicks(selected, [normal], ['Eldritch Blast'])
    const filled = spellPicks(learned, slots, [
      'Guidance',
      'Shocking Grasp',
      'Druidcraft',
      'Detect Magic',
      'Comprehend Languages',
    ])
    const context = calculation(filled)
    expect(context.managedClassSpellStatuses.filter((row) => row.active)).toHaveLength(6)
    expect(
      context.character.spells.spellProfiles.find((row) => row.classSource === source)
        ?.alwaysPreparedSpells,
    ).toEqual(expect.arrayContaining(['Detect Magic|XPHB', 'Comprehend Languages|XPHB']))
    expect(
      followupSheet(filled).spellRows.filter((row) => row.castingNote?.includes(tome.name)),
    ).toHaveLength(5)
    const cleared = selectOptions(filled, 'Eldritch Invocations')
    expect(
      calculation(cleared).managedClassSpellStatuses.map((row) => row.choice.target.name),
    ).toEqual(['Eldritch Blast'])
  })

  test('standalone feature uses use effective abilities and earned recovery', () => {
    const ability = (character: Character) => ({
      ...character,
      abilityScores: { ...character.abilityScores, wisdom: 16, charisma: 16 },
    })
    const knight = ability(start('Death Knight'))
    const coil = followupSheet(knight).classResourceRows.find((row) => row.label === 'Death Coil')!
    expect(coil).toMatchObject({
      max: 4,
      recovery: 'Restores all dice on a long rest',
      usageText: 'Up to 3 d8s per use',
    })
    const saved = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...knight,
          classResources: { [coil.id]: 1 },
        }),
      ),
    )
    expect(followupSheet(saved).classResourceRows.find((row) => row.id === coil.id)?.used).toBe(3)
    const shadow = chooseSubclass(ability(reachLevel(start('Priest'), 3)), 'Shadow Domain')
    expect(followupSheet(shadow).classResourceRows.map((row) => row.label)).not.toContain(
      'Dispersion',
    )
    const sixth = followupSheet(reachLevel(shadow, 6))
    expect(sixth.classResourceRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Devouring Plague',
          max: 3,
          recovery: 'Restores all uses on a long rest',
        }),
        expect.objectContaining({
          label: 'Dispersion',
          max: 1,
          recovery: 'Restores all uses on a short or long rest',
        }),
      ]),
    )
  })

  test.each([
    ['Warrior', 'WoW'],
    ['Fighter', 'XPHB'],
  ])('%s derives the exact printed counter with alternate recovery', (name, source) => {
    const actor = reachLevel(start(name, source), 6)
    const selected = reopen(
      actor,
      selectSubclass(actor, actor.provenance, 'Battle Master', source, undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
    const counter = (character: Character) =>
      followupSheet(character).classResourceRows.find((row) => row.label === 'Know Your Enemy')
    expect(counter(selected)).toBeUndefined()
    expect(counter(reachLevel(selected, 7))).toMatchObject({
      max: 1,
      recovery: 'Restores all uses on a long rest',
      usageText:
        'You can also restore a use of the feature by expending one Superiority Die (no action required).',
    })
  })

  test.runIf(existsSync('data/book/book-wow.json'))(
    'companion family, specialization and mastery keep independent identities',
    () => {
      const hunter = chooseSubclass(reachLevel(start('Hunter'), 6), 'Beast Master')
      const pool = classChoice(hunter, 'Primal Companion')
      const choices = resolveClassChoiceOptions(
        pool,
        createClassChoiceCatalogs(catalogs),
        [],
        6,
        hunter,
      )
      const option = (name: string) => choices.find((row) => row.reference.name === name)!.reference
      expect(choices.filter((row) => row.reference.name === 'Serpent')).toHaveLength(2)
      expect(() =>
        selectOptions(hunter, 'Primal Companion', {
          entityType: 'creature',
          name: 'Beast of the Land',
          source: 'XPHB',
        }),
      ).toThrow(/pet family/)
      expect(() => selectOptions(hunter, 'Primal Companion', option('Blood Beast'))).toThrow(
        /companion source/,
      )
      const cat = selectOptions(hunter, 'Primal Companion', option('Cat'))
      const mastery = classChoice(cat, 'Weapon Mastery')
      const options = resolveClassChoiceOptions(
        mastery,
        createClassChoiceCatalogs(catalogs),
        [],
        6,
        cat,
      )
      const pet = options.find((row) => row.reference.name === 'Cat')!.reference
      const ordinary = options.find(
        (row) => row.reference.entityType === 'item' && row.availability === 'eligible',
      )!.reference
      const assigned = selectOptions(cat, 'Weapon Mastery', ordinary, pet)
      const unavailableCats = (gameData: GameData) =>
        [
          ...getUnavailableCharacterContent(assigned, createGameDataAvailabilityIndex(gameData)),
        ].filter((row) => row.name === 'Cat')
      expect(unavailableCats(data)).toEqual([])
      expect(unavailableCats({ ...data, companionFamilySources: [] })).toHaveLength(2)
      const companion = followupSheet(assigned).companions[0]
      expect(companion).toMatchObject({ name: 'Cat', creature: { name: 'Beast of the Land' } })
      expect(
        companion.creature?.trait?.some((row) => row.name === 'Pet Specialization: Ferocity'),
      ).toBe(true)
      expect(JSON.stringify(companion.creature?.action)).toContain('Mastery: Graze.')
      const routes = getEffectiveClassChoiceFeatureRoutes(assigned, catalogs)
      expect(routes.masteredWeapons.get(mastery.id)?.size).toBe(1)
      expect(routes.masteredCompanionFamilies.get(mastery.id)?.size).toBe(1)
      const switched = chooseSubclass(assigned, 'Hunter')
      expect(
        switched.classChoiceSelections?.find((row) => row.choiceId === mastery.id)?.selected,
      ).toMatchObject([{ name: ordinary.name, source: ordinary.source }])
      const savedCompanion = assigned.classChoiceSelections?.find((row) => row.choiceId === pool.id)
      if (!savedCompanion) throw new Error('Expected the saved companion.')
      const offline = reopen(
        assigned,
        retainSavedFeatureOptionsCommand(
          assigned,
          assigned.provenance,
          pool.id,
          [],
          undefined,
          getOptionalPoolSelectionHandle(savedCompanion),
        ),
      )
      expect(
        offline.classChoiceSelections?.find((row) => row.choiceId === mastery.id)?.selected,
      ).toMatchObject([{ name: ordinary.name, source: ordinary.source }])
      const bear = selectOptions(assigned, 'Primal Companion', option('Bear'))
      expect(
        bear.classChoiceSelections?.find((row) => row.choiceId === mastery.id)?.selected,
      ).toMatchObject([{ name: ordinary.name, source: ordinary.source }])
      expect(followupSheet(bear).companions[0]).toMatchObject({
        name: 'Bear',
        creature: { name: 'Beast of the Land' },
      })
      expect(JSON.stringify(followupSheet(bear).companions[0].creature?.trait)).toContain(
        'Pet Specialization: Tenacity',
      )
    },
  )

  test.each([
    ['Evoker', 'WoW'],
    ['Sorcerer', 'XPHB'],
  ])(
    '%s tracks Dragon Companion independently of preparation',
    (name, source) => {
      const actor = reachLevel(start(name, source), 3)
      const selected = reopen(
        actor,
        selectSubclass(actor, actor.provenance, 'Draconic Sorcery', source, undefined, {
          classChoiceFeatureCatalogs: catalogs,
        }),
      )
      const before = reachLevel(selected, 17)
      const earned = reachLevel(before, 18)
      const counter = (character: Character) =>
        followupSheet(character).classResourceRows.find(
          (row) => row.label === 'Summon Dragon (slot-free)',
        )
      expect(fixedSpells(before)).toContain('summon dragon|xphb')
      expect(counter(before)).toBeUndefined()
      expect(counter(earned)).toMatchObject({
        max: 1,
        recovery: 'Restores all uses on a long rest',
      })
      const id = counter(earned)!.id
      const spent = characterPersistenceSchema.parse({
        ...earned,
        classResources: { ...earned.classResources, [id]: 0 },
      })
      expect(counter(spent)?.used).toBe(1)
      const rolledBack = reopen(spent, applyLevelDown(spent, spent.provenance, calculation(spent)))
      expect(counter(rolledBack)).toBeUndefined()
      expect(fixedSpells(rolledBack)).toContain('summon dragon|xphb')
      if (source === 'WoW') expect(counter({ ...spent, allowedSources: ['XPHB'] })).toBeUndefined()
    },
    15_000,
  )

  test('shared resource casts and their counter follow earned subclass gains and survive reopen', async () => {
    const lookup = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const view = (character: Character) => createCharacterSheetViewModel(character, lookup, lookup)
    const paid = (character: Character) =>
      calculation(character).fixedClassSpellStatuses.filter((row) => row.active && row.castOnly)
    const resource = (character: Character) =>
      view(character).classResourceRows.find((row) => row.label === 'Soul Fragments')
    const initial = start('Demon Hunter')
    const weak = { ...initial, abilityScores: { ...initial.abilityScores, wisdom: 8 } }
    const second = reachLevel(weak, 2)
    expect(resource(second)).toBeUndefined()
    const third = chooseSubclass(reachLevel(second, 3), 'Demon Hunter')
    expect(paid(third).map((row) => row.reference)).toEqual(['feather fall|xphb', 'jump|xphb'])
    expect(resource(third)).toMatchObject({ max: 1, used: 0, restType: 'long' })
    expect(view(third).spellRows.find((row) => row.name === 'Feather Fall')).toMatchObject({
      castingTime: expect.stringMatching(/reaction/i),
      castingNote: expect.stringContaining('Spend 1 soul fragment'),
    })
    const wrongPrinting = Object.fromEntries(
      Object.entries(lookups.spellsByKey).filter(
        ([, spell]) => spell.name !== 'Feather Fall' || spell.source !== 'XPHB',
      ),
    )
    const missingSpell = projectManagedClassSpellState(third, {
      ...spellContext(third),
      spellsByKey: wrongPrinting,
    }).fixedClassSpellStatuses
    expect(missingSpell.find((row) => row.reference === 'feather fall|xphb')?.active).toBe(false)
    expect(missingSpell.find((row) => row.reference === 'jump|xphb')?.active).toBe(true)
    expect(paid(third).some((row) => row.reference === 'feather fall|xphb')).toBe(true)

    const tenth = reachLevel(third, 10)
    expect(paid(tenth).map((row) => row.reference)).toEqual(['feather fall|xphb', 'jump|xphb'])
    const eleventh = reachLevel(tenth, 11)
    const cls = classRow('Demon Hunter')
    const choice = getClassChoiceCandidates(cls, cls.subclasses![0], catalogs).find(
      (row) => row.label === 'Specialization',
    )!
    const options = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      11,
      eleventh,
    )
    expect(options.filter((row) => row.availability === 'eligible')).toHaveLength(3)
    for (const option of options.filter((row) => row.availability === 'eligible')) {
      const specialized = reopen(
        eleventh,
        applyClassChoiceSelectionWithGrantsCommand(
          eleventh,
          eleventh.provenance,
          choice,
          [option.reference],
          {
            classes: data.classes,
            catalogs,
            spellContext: spellContext(eleventh),
          },
        ),
      )
      expect(paid(specialized)).toEqual(paid(eleventh))
    }
    const sheet = view(eleventh)
    expect(sheet.spellRows.find((row) => row.name === 'Throw Glaive')).toMatchObject({
      prepared: true,
      castingTime: 'Action',
      castingNote: expect.stringContaining('Spend 1 soul fragment to cast as a Bonus Action'),
    })
    expect(sheet.spellRows.find((row) => row.name === 'Counterspell')).toMatchObject({
      castingNote: expect.stringContaining(
        'Spend 2 soul fragments to cast in response to the spell’s normal trigger',
      ),
    })
    const wrongTiming = Object.fromEntries(
      Object.entries(lookups.spellsByKey).map(([key, spell]) => [
        key,
        spell.name === 'Counterspell' && spell.source === 'XPHB'
          ? { ...spell, time: [{ number: 1, unit: 'action' }] }
          : spell,
      ]),
    )
    const mistimed = projectManagedClassSpellState(eleventh, {
      ...spellContext(eleventh),
      spellsByKey: wrongTiming,
    }).fixedClassSpellStatuses
    expect(mistimed.find((row) => row.reference === 'counterspell|xphb')?.active).toBe(false)
    expect(mistimed.find((row) => row.reference === 'throw glaive|wow')?.active).toBe(true)
    const missingColumn = {
      ...data,
      classes: data.classes.map((row) =>
        row === cls
          ? {
              ...row,
              subclasses: row.subclasses?.map((subclass) => ({
                ...subclass,
                additionalSpells: subclass.additionalSpells?.filter(
                  (block) => block.name !== 'Havoc',
                ),
              })),
            }
          : row,
      ),
    }
    const incompleteLookup = {
      ...lookups,
      classChoiceClasses: missingColumn.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(missingColumn),
    }
    const incompleteSheet = createCharacterSheetViewModel(
      eleventh,
      incompleteLookup,
      incompleteLookup,
    )
    expect(incompleteSheet.spellRows.filter((row) => row.castOnly)).toEqual([])
    expect(
      incompleteSheet.classResourceRows.find((row) => row.label === 'Soul Fragments'),
    ).toMatchObject({ max: 1 })
    expect(
      sheet.actions
        .filter((row) => row.name === 'Throw Glaive')
        .map((row) => row.kind)
        .sort(),
    ).toEqual(['action', 'bonus-action'])
    const thirteenth = reachLevel(eleventh, 13)
    expect(resource(thirteenth)).toMatchObject({ max: 2 })
    const wrongProgression = JSON.parse(
      JSON.stringify(cls)
        .replace(/your Ranger spell save DC/g, 'your Wizard spell save DC')
        .replace(/reach Ranger levels/g, 'reach Wizard levels'),
    ) as typeof cls
    const wrongClasses = data.classes.map((row) => (row === cls ? wrongProgression : row))
    const unrelatedLookup = {
      ...lookups,
      classChoiceClasses: wrongClasses,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs({
        ...data,
        classes: wrongClasses,
      }),
    }
    const unrelated = createCharacterSheetViewModel(thirteenth, unrelatedLookup, unrelatedLookup)
    expect(unrelated.classResourceRows.some((row) => row.label === 'Soul Fragments')).toBe(false)
    expect(unrelated.spellRows.find((row) => row.name === 'Throw Glaive')).toMatchObject({
      prepared: true,
    })
    expect(resource(thirteenth)?.usageText).not.toContain('Initiative')
    expect(resource(reachLevel(thirteenth, 15))?.usageText).toContain('Initiative with none')
    const veteran = reachLevel(thirteenth, 17)
    const { id } = resource(third)!
    expect(resource(veteran)).toMatchObject({ id, max: 3 })
    const stored: Character = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...veteran,
          abilityScores: { ...veteran.abilityScores, wisdom: 18 },
          classResources: { [id]: 2 },
        }),
      ),
    )
    expect(resource(stored)).toMatchObject({ id, max: 6, used: 4 })
    const filtered = { ...stored, allowedSources: ['XPHB'] }
    expect(resource(filtered)).toBeUndefined()
    expect(paid(filtered)).toEqual([])
    expect(resource({ ...filtered, allowedSources: sources })).toEqual(resource(stored))
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(view(stored), '2024-official', {
        text: { descriptions: 'full', overflow: 'notes' },
      }),
    )
    const text = doc
      .getForm()
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(text).toMatch(/Soul Fragments\s*[—-]\s*2\/6 available/)
    expect(text).toContain('Spend 1 soul fragment to cast as a Bonus Action')
  }, 60_000)

  test.each([
    'inline-only',
    'blank',
  ] as const)('a renamed authored pool keeps independent paid casts and withholds a %s fixed export group', async (caseName) => {
    const source = await new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true },
      {
        type: 'local',
        readJson: async (file) => {
          let text = await readFile(`data/${file}`, 'utf8')
          if (file !== 'class/class-demonhunter.json') return JSON.parse(text)
          text = text
            .replace(/Soul Fragment/g, 'Spirit Shard')
            .replace(/soul fragment/g, 'spirit shard')
            .replace('minimum of one fragment', 'minimum of one shard')
          const document = JSON.parse(text)
          const index = document.subclassFeature.findIndex(
            (row: { name: string }) => row.name === 'Disrupt',
          )
          if (caseName === 'inline-only') {
            const [disrupt] = document.subclassFeature.splice(index, 1)
            const knowledge = document.subclassFeature.find(
              (row: { name: string }) => row.name === 'Illidari Knowledge',
            )
            knowledge.entries[1].entries[0].feature = disrupt
          } else document.subclassFeature[index].entries = ['  ']
          return document
        },
      },
    ).loadAllData()
    const current = composeGameDataLayers([source])
    const lookup = {
      ...buildGameDataLookups(current),
      classChoiceClasses: current.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
    }
    const character = chooseSubclass(reachLevel(start('Demon Hunter'), 11), 'Demon Hunter')
    const view = createCharacterSheetViewModel(character, lookup, lookup)
    const completeRules = followupSheet(character).declaredClassFeatureSummaries
    expect(completeRules?.find((row) => row.compactText === 'Illidari Knowledge')?.text).toMatch(
      /Disrupt.*Warglaive Mastery/,
    )
    expect(
      view.declaredClassFeatureSummaries?.some((row) => row.compactText === 'Illidari Knowledge'),
    ).toBe(false)
    expect(view.classFeaturesSummary2014).toContain('Regaining Spirit Shards')
    expect(view.classResourceRows.find((row) => row.label === 'Spirit Shards')).toBeDefined()
    expect(view.spellRows.find((row) => row.name === 'Feather Fall')?.castingNote).toContain(
      'Spend 1 spirit shard',
    )
    expect(view.spellRows.some((row) => row.name === 'Counterspell')).toBe(false)
    expect(view.spellRows.find((row) => row.name === 'Throw Glaive')).toMatchObject({
      prepared: true,
      castingNote: expect.stringContaining('Spend 1 spirit shard'),
    })
  }, 60_000)

  test('earned base spells are always prepared and keep their own slot-free use through save and export', async () => {
    const initial = start('Death Knight')
    const profileId = 'class:Death Knight|WoW'
    const prepared = (character: Character) =>
      calculation(character)
        .character.spells.spellProfiles.find((row) => row.id === profileId)
        ?.alwaysPreparedSpells?.map((reference) => reference.toLowerCase()) ?? []
    expect(prepared(initial)).toEqual([])
    const second = reachLevel(initial, 2)
    expect(prepared(second)).toEqual(['rune strike|wow'])
    expect(prepared(reachLevel(second, 4))).toEqual(['rune strike|wow'])
    const fifth = reachLevel(second, 5)
    expect(prepared(fifth)).toEqual(['rune strike|wow', 'find steed|xphb'])
    expect(calculation(fifth).fixedClassSpellStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: ['class', 'death knight', 'wow'],
          featureName: 'Runic Smite',
          active: true,
          prepared: true,
          castingNote: expect.stringContaining('once without expending a spell slot'),
        }),
        expect.objectContaining({
          owner: ['class', 'death knight', 'wow'],
          featureName: 'Faithful Steed',
          active: true,
          prepared: true,
          castingNote: expect.stringContaining('finish a Long Rest'),
        }),
      ]),
    )
    const ordinaryPrepare = (
      character: Character,
      reference: string,
      current = spellContext(character),
    ) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId,
        reference,
        true,
        current,
      )
    expect(() => ordinaryPrepare(fifth, 'Find Steed|XPHB')).toThrow('already always prepared')
    const withoutSteed = {
      ...spellContext(fifth),
      catalogs: {
        ...catalogs,
        classFeatures: catalogs.classFeatures.filter(
          (row) => row.name !== 'Faithful Steed' || row.className !== 'Death Knight',
        ),
      },
    }
    const stored = reopen(fifth, ordinaryPrepare(fifth, 'Find Steed|XPHB', withoutSteed))
    expect(prepared(stored)).toContain('find steed|xphb')
    const withdrawn = projectManagedClassSpellState(stored, withoutSteed)
    expect(
      withdrawn.character.spells.spellProfiles.find((row) => row.id === profileId),
    ).toMatchObject({ preparedSpells: ['Find Steed|XPHB'] })
    expect(
      withdrawn.fixedClassSpellStatuses.some((row) => row.featureName === 'Faithful Steed'),
    ).toBe(false)
    expect(
      prepared(reopen(fifth, applyLevelDown(fifth, fifth.provenance, calculation(fifth)))),
    ).toEqual(['rune strike|wow'])
    expect(prepared({ ...fifth, allowedSources: ['XPHB'] })).toEqual([])
    expect(prepared(fifth)).toContain('find steed|xphb')

    const restored = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const vm = createCharacterSheetViewModel(stored, restored, restored)
    expect(vm.spellRows.find((row) => row.name === 'Rune Strike')).toMatchObject({
      level: '1',
      prepared: true,
      castingNote: expect.stringContaining('Long Rest'),
    })
    expect(vm.spellRows.find((row) => row.name === 'Find Steed')).toMatchObject({
      level: '2',
      prepared: true,
      castingNote: expect.stringContaining('Long Rest'),
    })
    expect(vm.actions.some((action) => action.name === 'Rune Strike')).toBe(true)
    for (const template of ['2024-official', '2014-custom'] as const) {
      const doc = await PDFDocument.load(
        await generateTestCharacterSheet(vm, template, {
          text: { descriptions: 'full', overflow: 'notes' },
        }),
      )
      const text = doc
        .getForm()
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
      expect(text, template).toContain(
        'Runic Smite (Death Knight · WoW) — Cast this spell once without expending a spell slot.',
      )
      expect(text, template).toContain(
        'Faithful Steed (Death Knight · WoW) — Cast this spell once without expending a spell slot.',
      )
    }
  }, 60_000)

  test('the daily schedule uses the actual selected owner under a different source', () => {
    const actor = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['EXAMPLE', 'WoW', 'XPHB'],
      classProgression: [{ name: 'Wardblade', source: 'EXAMPLE', levels: 5 }],
    })
    const status = calculation(actor).fixedClassSpellStatuses
    expect(status).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: ['class', 'wardblade', 'example'],
          reference: 'rune strike|wow',
          active: true,
        }),
        expect.objectContaining({
          owner: ['class', 'wardblade', 'example'],
          reference: 'find steed|xphb',
          active: true,
        }),
      ]),
    )
    const mixed = {
      ...actor,
      classProgression: [
        ...actor.classProgression,
        { name: 'Death Knight', source: 'WoW', levels: 5 },
      ],
    }
    const rules = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const sheet = createCharacterSheetViewModel(mixed, rules, rules)
    const notes = [
      sheet.spellRows.find((row) => row.name === 'Find Steed')?.castingNote,
      sheet.actions.find((row) => row.name === 'Find Steed')?.description,
    ]
    for (const note of notes) {
      expect(note).toContain('Faithful Steed (Wardblade · EXAMPLE)')
      expect(note).toContain('Faithful Steed (Death Knight · WoW)')
    }
  })

  test('mislabelled rest and conditional spell text withhold slot-free preparation', async () => {
    const conflicting = composeGameDataLayers([
      await loadWithCopy('Cleric', 'Lightkeeper', 'EXAMPLE', 'inline'),
    ])
    const actor = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [{ name: 'Death Knight', source: 'WoW', levels: 5 }],
    })
    expect(
      getDirectClassPreparedSpellGrants(
        actor,
        conflicting.classes,
        buildClassChoiceFeatureCatalogs(conflicting),
      ),
    ).toEqual([])
  }, 45_000)

  test('inscribed spells follow the marked inventory row and the subclass’s earned schedule', () => {
    let character: Character = chooseSubclass(
      reachLevel(start('Death Knight'), 3),
      'Oath of the Ebon Blade',
    )
    character = {
      ...character,
      equipment: [
        ...character.equipment,
        {
          id: 'sword-a',
          name: 'Longsword',
          source: 'XPHB',
          type: 'M',
          quantity: 1,
          equipped: false,
        },
        {
          id: 'sword-b',
          name: 'Longsword',
          source: 'XPHB',
          type: 'M',
          quantity: 1,
          equipped: true,
        },
        { id: 'bow', name: 'Longbow', source: 'XPHB', type: 'R', quantity: 1, equipped: true },
      ],
    }
    const setup = () =>
      getWeaponInscriptionSetup(character, character.classProgression[0], catalogs)
    const edit = (rune?: string, weaponId?: string) => {
      const draft = setup()
      const expected = draft?.saved && {
        weaponId: draft.saved.weapon.id,
        rune: draft.saved.mark.rune,
        target: draft.saved.mark.target,
      }
      const equipment = setWeaponInscription(
        character,
        character.classProgression[0],
        rune && weaponId && draft?.current
          ? { target: draft.current.target, rune, weaponId }
          : undefined,
        expected,
        catalogs,
      )
      character = characterPersistenceSchema.parse(
        JSON.parse(JSON.stringify({ ...character, equipment })),
      )
    }
    expect(setup()?.weapons.map((row) => row.id)).toEqual(
      expect.arrayContaining(['sword-a', 'sword-b']),
    )
    expect(setup()?.weapons.map((row) => row.id)).not.toContain('bow')
    expect(fixedSpells(character)).toEqual(['death grip|wow', 'rune strike|wow'])
    expect(() => edit('Frost', 'bow')).toThrow(/melee weapon/)
    edit('Frost', 'sword-a')
    expect(fixedSpells(character)).toEqual([
      'death grip|wow',
      'chains of ice|wow',
      'rune strike|wow',
    ])
    expect(setup()?.active).toBe(true)
    const marked = character
    const previousPrinting = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...marked,
          equipment: marked.equipment.map((weapon) => ({
            ...weapon,
            weaponInscriptions: weapon.weaponInscriptions?.map((mark) => ({
              ...mark,
              target: mark.target.replace('|runeforging|', '|runic power|'),
            })),
          })),
        }),
      ),
    )
    const dormant = getWeaponInscriptionSetup(
      previousPrinting,
      previousPrinting.classProgression[0],
      catalogs,
    )
    expect(dormant?.saved?.mark.target).toContain('|runic power|')
    expect(dormant?.active).toBe(false)
    expect(fixedSpells(previousPrinting)).toEqual(['death grip|wow', 'rune strike|wow'])
    const oldMark = dormant?.saved?.mark
    const currentTarget = dormant?.current?.target
    expect(
      oldMark &&
        currentTarget &&
        setWeaponInscription(
          previousPrinting,
          previousPrinting.classProgression[0],
          { target: currentTarget, weaponId: 'sword-b', rune: 'Blood' },
          { target: oldMark.target, weaponId: 'sword-a', rune: oldMark.rune },
          catalogs,
        ).flatMap((item) => item.weaponInscriptions ?? []),
    ).toEqual([expect.objectContaining({ target: currentTarget, rune: 'blood' })])
    const classLookups = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const vm = createCharacterSheetViewModel(marked, classLookups, classLookups)
    expect(vm.spellRows.find((row) => row.name === 'Chains of Ice')).toMatchObject({
      prepared: true,
    })
    expect(
      getEarnedSubclassSpellGrants(classRow('Death Knight'), marked.classProgression[0], 3, {
        character: marked,
        catalogs: { ...catalogs, items: [], itemsBase: [] },
      })?.map((row) => row.spellName),
    ).toEqual(['Death Grip|WoW'])
    expect(fixedSpells({ ...character, allowedSources: ['XPHB'] })).toEqual([])
    expect(fixedSpells(marked)).toContain('chains of ice|wow')

    edit('Frost', 'sword-b')
    expect(character.equipment.find((row) => row.id === 'sword-a')?.weaponInscriptions).toEqual([])
    expect(fixedSpells(character)).toContain('chains of ice|wow')
    character = reachLevel(character, 5)
    expect(fixedSpells(character)).toEqual(
      expect.arrayContaining(['death and decay|wow', 'frostscythe|wow']),
    )
    edit('Blood', 'sword-b')
    expect(fixedSpells(character)).not.toContain('frostscythe|wow')
    expect(fixedSpells(character)).toEqual(
      expect.arrayContaining(['vampiric blood|wow', 'spiritual weapon|xphb']),
    )

    const removed = reopen(
      character,
      removeManualEquipmentCommand(character, character.provenance, 'sword-b'),
    )
    const retainedSpells = [
      'death grip|wow',
      'death and decay|wow',
      'rune strike|wow',
      'find steed|xphb',
    ]
    expect(fixedSpells(removed)).toEqual(retainedSpells)
    expect(
      fixedSpells({
        ...removed,
        equipment: [
          ...removed.equipment,
          {
            id: 'sword-b',
            name: 'Longsword',
            source: 'XPHB',
            type: 'M',
            quantity: 1,
            equipped: false,
          },
        ],
      }),
    ).toEqual(retainedSpells)
    const rolledBack = reopen(
      marked,
      applyLevelDown(marked, marked.provenance, calculation(marked)),
    )
    expect(rolledBack.equipment.every((item) => !item.weaponInscriptions?.length)).toBe(true)
    edit()
    expect(fixedSpells(character)).toEqual(retainedSpells)
  })

  test('copied class grants follow their earned features and authored replacements', () => {
    const druid = start('Druid')
    expect(fixedSpells(druid)).toEqual(['speak with animals|xphb'])
    const withoutOriginal = data.classes.filter(
      (row) => row.name !== 'Druid' || row.source !== 'XPHB',
    )
    expect(
      getDirectClassPreparedSpellGrants(druid, withoutOriginal, {
        ...catalogs,
        classes: withoutOriginal,
      }),
    ).toEqual([
      expect.objectContaining({
        owner: ['class', 'druid', 'wow'],
        reference: 'Speak with Animals|XPHB',
      }),
    ])
    expect(fixedSpells(start('Hunter'))).toEqual(["hunter's mark|xphb"])
    const paladin = start('Paladin')
    expect(fixedSpells(paladin)).toEqual([])
    expect(fixedSpells(reachLevel(paladin, 2))).toEqual(['divine smite|xphb'])
    expect(fixedSpells(reachLevel(paladin, 5))).toEqual(['divine smite|xphb', 'find steed|xphb'])
    expect(fixedSpells({ ...paladin, allowedSources: ['XPHB'] })).toEqual([])

    const hunter = reachLevel(start('Hunter'), 6)
    expect(getWalkingSpeed(calculation(chooseSubclass(hunter, 'Hunter')).movement)).toBe(40)
    expect(getWalkingSpeed(calculation(chooseSubclass(hunter, 'Beast Master')).movement)).toBe(30)
    const monk = reachLevel(start('Monk'), 6)
    expect(getWalkingSpeed(calculation({ ...monk, equipment: [] }).movement)).toBe(45)
    const shaman = reachLevel(start('Shaman'), 5)
    expect(getWalkingSpeed(calculation({ ...shaman, equipment: [] }).movement)).toBe(40)
    for (const row of [monk, shaman]) {
      const unarmored = {
        ...row,
        equipment: [],
        abilityScores: {
          strength: 10,
          dexterity: 16,
          constitution: 16,
          intelligence: 10,
          wisdom: 16,
          charisma: 10,
        },
      }
      const context = calculation(unarmored)
      expect(
        computeEffectiveCharacterArmorClass(
          unarmored,
          context.abilityScores.total,
          context.effects.sourceDeclarations,
        ),
      ).toBe(16)
    }
  })

  test.each([
    ['Priest', 'WoW', 'Cleric', 'XPHB'],
    ['Cleric', 'XPHB', 'Priest', 'WoW'],
  ])('replacing %s keeps the other parent’s fixed subclass spell attribution', (name, source, retainedName, retainedSource) => {
    const shadowDomain = { subclass: 'Shadow Domain', subclassSource: 'WoW', levels: 3 }
    const retained = { ...shadowDomain, name: retainedName, source: retainedSource }
    const draft = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [{ ...shadowDomain, name, source }, retained],
      initialClass: { name, source },
    })
    const slot = getManagedClassSpellSlots(retained, draft, catalogs).find(
      (row) => row[1] === 'class-cantrip',
    )!
    const chosen = reopen(
      draft,
      setManagedClassSpellChoiceCommand(
        draft,
        draft.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: 'Guidance', source: 'XPHB' },
          policy: 'default',
        },
        spellContext(draft),
      ),
    )
    const before = chosen.provenance.spells['crown of madness']
    expect(before).toMatchObject([
      { sourceType: 'subclass', sourceRef: 'WoW', grantSource: 'xphb' },
    ])
    const after = reopen(
      chosen,
      applyClassSelectionCommand(
        chosen,
        chosen.provenance,
        classRow('Fighter', 'XPHB'),
        undefined,
        lookups.itemLookup,
        { classChoiceFeatureCatalogs: catalogs, spellContext: spellContext(chosen) },
      ),
    )
    expect(after.classProgression).toContainEqual(retained)
    expect(after.provenance.spells['crown of madness']).toEqual(before)
    expect(
      projectManagedClassSpellState(after, undefined).character.provenance.spells[
        'crown of madness'
      ],
    ).toBeUndefined()
  })

  test('inherited feature counters use exact owners and earned levels', () => {
    const resource = (character: Character, label: string) => {
      const [entry] = character.classProgression
      const context = calculation(character)
      return getCharacterClassResources(character, () => classRow(entry.name, entry.source), {
        catalogs,
        charismaModifier: 0,
        abilityModifiers: context.abilityScores.modifiers,
        effects: context.effects.declarations,
        effectContext: context.effects.resolutionContext,
        unlimitedWildShape: false,
      }).find((row) => row.label === label)
    }
    expect(resource(start('Evoker'), 'Innate Sorcery')).toMatchObject({ max: 2 })
    expect(resource(start('Mage'), 'Arcane Recovery')).toMatchObject({ max: 1 })
    expect(resource(reachLevel(start('Paladin'), 5), 'Lay on Hands (HP)')).toMatchObject({
      max: 25,
    })
    const warrior = reachLevel(start('Warrior'), 17)
    expect(resource(warrior, 'Action Surge')).toMatchObject({ max: 2 })
    expect(resource(chooseSubclass(warrior, 'Battle Master'), 'Superiority Dice')).toMatchObject({
      max: 6,
    })
    const tactician = start('Tactician', 'EXAMPLE')
    expect(resource(tactician, 'Action Surge')).toBeUndefined()
    const veteran = reachLevel(tactician, 2)
    const surge = resource(veteran, 'Action Surge')
    expect(surge).toMatchObject({ max: 1 })
    expect(surge?.id).not.toBe(resource(warrior, 'Action Surge')?.id)
    expect(resource({ ...veteran, allowedSources: ['XPHB'] }, 'Action Surge')).toBeUndefined()
  })

  test('prints inherited resource counts and recovery in the four shipped sheets', async () => {
    const warrior = chooseSubclass(reachLevel(start('Warrior'), 17), 'Battle Master')
    const cls = classRow('Warrior')
    const definitions = getCharacterClassResources(warrior, () => cls, {
      catalogs,
      charismaModifier: 0,
      unlimitedWildShape: false,
    })
    const spent = Object.fromEntries(
      definitions.map((row) => [row.id, row.label === 'Action Surge' ? 1 : 2]),
    )
    const current = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const view = createCharacterSheetViewModel(
      { ...warrior, classResources: spent },
      current,
      current,
    )
    expect(view.classResourceRows.find((row) => row.label === 'Superiority Dice')).toMatchObject({
      used: 4,
      max: 6,
    })
    for (const template of [
      '2014-official',
      '2014-custom',
      '2024-official',
      '2024-custom',
    ] as const) {
      const bytes = await generateTestCharacterSheet(view, template, {
        pages: { spells: false },
        text: { descriptions: 'names', overflow: 'ellipsis' },
      })
      const form = (await PDFDocument.load(bytes)).getForm()
      const text = form
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
      expect(text, template).toContain('Restores all uses on a short or long rest')
      expect(text, template).toMatch(/Restores 1 use on a short rest; all uses on a long rest/i)
      if (template === '2014-custom') {
        const index =
          view.classResourceRows.findIndex((row) => row.label === 'Superiority Dice') + 1
        expect(form.getTextField(`Limited Feature ${index}`).getText()).toBe('Superiority Dice')
        expect(form.getTextField(`Limited Feature Max Usages ${index}`).getText()).toBe('6')
        expect(form.getTextField(`Limited Feature Used ${index}`).getText()).toBe('4')
        expect(form.getDropdown(`Limited Feature Recovery ${index}`).getSelected()).toEqual(['S/L'])
      } else {
        expect(text, template).toMatch(/Action Surge\s*[—-]\s*1\/2 available/)
        expect(text, template).toMatch(/Superiority Dice\s*[—-]\s*2\/6 available/)
      }
    }
  }, 60_000)

  test('keeps same-label resource owners and carries inherited overflow onto Notes', async () => {
    const warrior = chooseSubclass(reachLevel(start('Warrior'), 17), 'Battle Master')
    const actor: Character = {
      ...warrior,
      allowedSources: ['XPHB', 'WoW', 'EXAMPLE'],
      classProgression: [
        ...warrior.classProgression,
        { name: 'Tactician', source: 'EXAMPLE', levels: 2 },
      ],
    }
    const current = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const first = createCharacterSheetViewModel(actor, current, current)
    const sameName = first.classResourceRows.filter((row) => row.label === 'Action Surge')
    expect(sameName.map((row) => row.owner?.name)).toEqual(['Warrior', 'Tactician'])
    actor.classResources = Object.fromEntries(
      sameName.map((row) => [row.id, row.owner?.name === 'Warrior' ? 1 : 0]),
    )
    const view = createCharacterSheetViewModel(actor, current, current)
    const withoutCopy = {
      ...current,
      classChoiceFeatureCatalogs: {
        ...catalogs,
        classes: data.classes.filter((row) => row.name !== 'Tactician'),
      },
    }
    expect(
      createCharacterSheetViewModel(actor, current, withoutCopy)
        .classResourceRows.filter((row) => row.label === 'Action Surge')
        .map((row) => row.owner?.name),
    ).toEqual(['Warrior'])
    expect(
      view.classResourceRows.filter((row) => row.label === 'Action Surge').map((row) => row.used),
    ).toEqual([1, 1])
    const overflowView = {
      ...view,
      classResourceRows: [
        ...Array.from({ length: 8 }, (_, index) => ({
          ...view.classResourceRows[0],
          id: `filler-${index}`,
          label: `Filler ${index}`,
          inherited: false,
        })),
        ...view.classResourceRows,
      ],
    }
    const generate = (notes?: boolean) =>
      generateTestCharacterSheet(overflowView, '2014-custom', {
        pages: { notes, spells: false },
        text: { descriptions: 'names', overflow: 'ellipsis' },
        onReport: (report) => {
          const sections = notes === false ? report.omitted : report.preserved
          expect(sections.some((section) => section.id === 'capacity:class-resources')).toBe(true)
        },
      })
    const form = (await PDFDocument.load(await generate())).getForm()
    const notes = form
      .getFields()
      .flatMap((field) =>
        field instanceof PDFTextField && /Notes\.(Left|Right)$/.test(field.getName())
          ? [field.getText() ?? '']
          : [],
      )
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(notes).toContain('Action Surge (Warrior) — 1/2 available')
    expect(notes).toContain('Action Surge (Tactician) — 0/1 available')
    await generate(false)

    const twoPrintings: Character = {
      ...start('Tactician', 'EXAMPLE'),
      allowedSources: ['XPHB', 'EXAMPLE', 'OTHER'],
      classProgression: [
        { name: 'Tactician', source: 'EXAMPLE', levels: 2 },
        { name: 'Tactician', source: 'OTHER', levels: 2 },
      ],
    }
    const counters = createCharacterSheetViewModel(twoPrintings, current, current).classResourceRows
    twoPrintings.classResources = Object.fromEntries(
      counters
        .filter((row) => row.label === 'Action Surge')
        .map((row) => [row.id, row.owner?.source === 'EXAMPLE' ? 0 : 1]),
    )
    const duplicateLabels = createCharacterSheetViewModel(twoPrintings, current, current)
    const fitted = (
      await PDFDocument.load(
        await generateTestCharacterSheet(duplicateLabels, '2014-custom', {
          pages: { spells: false },
          text: { descriptions: 'names', overflow: 'ellipsis' },
        }),
      )
    ).getForm()
    const allText = fitted
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
    expect(allText).toContain('Action Surge (Tactician · EXAMPLE) — 0/1 available')
    expect(allText).toContain('Action Surge (Tactician · OTHER) — 1/1 available')
  }, 60_000)

  test.each([
    {
      className: 'Druid',
      subclass: 'Circle of the Land',
      label: 'Terrain',
      option: 'Arid Land',
      selected: 'fire bolt|xphb',
      common: [],
    },
    {
      className: 'Evoker',
      subclass: 'Draconic Sorcery',
      label: 'Specialization',
      option: 'Devastation',
      selected: 'azure strike|wow',
      common: ['chromatic orb|xphb', "dragon's breath|xphb"],
    },
  ])('a $className named spell choice can be saved, reopened, and cleared', ({
    className,
    subclass,
    label,
    option,
    selected,
    common,
  }) => {
    let character = chooseSubclass(reachLevel(start(className), 3), subclass)
    const cls = classRow(className)
    const sc = cls.subclasses!.find((row) => row.name === subclass)!
    const choice = getClassChoiceCandidates(cls, sc, catalogs).find((row) => row.label === label)!
    const view = resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      [],
      3,
      character,
    ).find((row) => row.reference.name === option)!
    expect(view.availability).toBe('eligible')
    expect(fixedSpells(character)).toEqual(expect.arrayContaining(common))
    expect(fixedSpells(character)).not.toContain(selected)
    const authority = {
      classes: data.classes,
      catalogs,
      feats: data.feats,
      spellContext: spellContext(character),
    }
    character = reopen(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [view.reference],
        authority,
      ),
    )
    expect(character.classChoiceSelections).toEqual([
      expect.objectContaining({ choiceId: choice.id }),
    ])
    expect(fixedSpells(character)).toEqual(expect.arrayContaining([...common, selected]))
    expect(fixedSpells({ ...character, allowedSources: ['XPHB'] })).not.toContain(selected)
    character = reopen(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [],
        authority,
      ),
    )
    expect(fixedSpells(character)).toEqual(expect.arrayContaining(common))
    expect(fixedSpells(character)).not.toContain(selected)
  })

  test('Savant gains use the copied owner while restricted subclass spells stay cast-only', () => {
    const mage = chooseSubclass(reachLevel(start('Mage'), 3), 'Evoker')
    const mageSlots = getManagedClassSpellSlots(mage.classProgression[0], mage, catalogs).filter(
      (slot) => slot[3] === 3 && slot[0][0] === 'subclass',
    )
    expect(mageSlots).toHaveLength(2)
    const saved = reopen(
      mage,
      setManagedClassSpellChoicesCommand(
        mage,
        mage.provenance,
        [
          {
            slot: mageSlots[0],
            expected: null,
            expectedEmptyRevision: mage.managedClassSpellRevision ?? 0,
            target: { name: 'Scorching Ray', source: 'XPHB' },
            policy: 'default',
          },
        ],
        spellContext(mage),
      ),
    )
    expect(
      calculation(saved).character.spells.spellProfiles.flatMap((profile) => profile.spellsKnown),
    ).toContain('Scorching Ray|XPHB')

    const shaman = reachLevel(start('Shaman'), 10)
    const elements = chooseSubclass(shaman, 'Path of the Elements')
    expect(fixedSpells(elements)).toContain('elementalism|xphb')
    const casts = (character: Character) =>
      calculation(character).fixedClassSpellStatuses.filter((row) => row.active && row.castOnly)
    expect(casts(elements).map((row) => row.reference.toLowerCase())).toEqual([
      'daylight|xphb',
      'water walk|xphb',
      'wind wall|xphb',
    ])
    expect(casts(elements)[0].castingNote).toContain('Spend one use of Rage')
    expect(fixedSpells(elements)).not.toContain('daylight|xphb')
    const guardians = casts(chooseSubclass(shaman, 'Path of the Spiritual Guardian'))
    expect(guardians.map((row) => row.reference.toLowerCase())).toEqual([
      'augury|xphb',
      'clairvoyance|xphb',
    ])
    expect(guardians[0].castingNote).toContain('One shared use per Short or Long Rest')
    expect(guardians[0].castOnly).toEqual({ ignoresMaterial: true })
  })

  test('authored option and casting restrictions must agree with the structured schedule', async () => {
    const conflicting = composeGameDataLayers([
      await loadWithCopy('Cleric', 'Lightkeeper', 'EXAMPLE', 'nested'),
    ])
    const current = buildClassChoiceFeatureCatalogs(conflicting)
    const druid = conflicting.classes.find((row) => row.name === 'Druid' && row.source === 'WoW')!
    const land = druid.subclasses!.find((row) => row.name === 'Circle of the Land')
    expect(
      getClassChoiceCandidates(druid, land, current).some((row) => row.label === 'Terrain'),
    ).toBe(false)

    const shaman = chooseSubclass(reachLevel(start('Shaman'), 6), 'Path of the Elements')
    const [entry] = shaman.classProgression
    const cls = conflicting.classes.find(
      (row) => row.name === entry.name && row.source === entry.source,
    )
    const grants = getEarnedSubclassSpellGrants(cls, entry, 6, {
      character: shaman,
      catalogs: current,
    })
    expect(grants?.map((grant) => grant.spellName)).toEqual(['elementalism|xphb'])

    const knight = reachLevel(start('Death Knight'), 5)
    const deathKnight = reopen(
      knight,
      selectSubclass(knight, knight.provenance, 'Oath of the Ebon Blade #2', 'WoW', undefined, {
        classChoiceFeatureCatalogs: current,
      }),
    )
    const [owner] = deathKnight.classProgression
    expect(getDirectClassPreparedSpellGrants(deathKnight, conflicting.classes, current)).toEqual([])
    const setup = getWeaponInscriptionSetup(deathKnight, owner, current)
    expect(setup?.current?.runes).toContain('Frost #2')
    if (!setup?.current || !setup.weapons.length) throw Error('Missing an eligible melee weapon')
    const equipment = setWeaponInscription(
      deathKnight,
      owner,
      { target: setup.current.target, rune: 'Frost #2', weaponId: setup.weapons[0].id },
      undefined,
      current,
    )
    const saved = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify({ ...deathKnight, equipment })),
    )
    const sourceClass = conflicting.classes.find(
      (row) => row.name === owner.name && row.source === owner.source,
    )
    const ranks = new Map([
      ['chains of ice|wow', 1],
      ['frostscythe|wow', 2],
    ])
    const spells = getEarnedSubclassSpellGrants(sourceClass, owner, 5, {
      character: saved,
      catalogs: current,
      spells: ranks,
    })
    expect(spells?.map((spell) => spell.spellName.toLowerCase())).toEqual([
      'death grip|wow',
      'death and decay|wow',
      'frostscythe|wow',
    ])
    const blood = setWeaponInscription(
      saved,
      owner,
      { target: setup.current.target, rune: 'Blood', weaponId: setup.weapons[0].id },
      { target: setup.current.target, rune: 'frost #2', weaponId: setup.weapons[0].id },
      current,
    )
    const bloodSpells = getEarnedSubclassSpellGrants(sourceClass, owner, 5, {
      character: { ...saved, equipment: blood },
      catalogs: current,
      spells: ranks,
    })
    expect(
      bloodSpells?.find((spell) => spell.spellName.toLowerCase() === 'chains of ice|wow'),
    ).toMatchObject({ isCantrip: false })
  }, 45_000)

  test('the roster displays exact inherited class and subclass features and earns Epic Boons', () => {
    const cohort = data.classes.filter((cls) => cls.source === 'WoW')
    expect(cohort).toHaveLength(13)
    for (const cls of cohort) {
      const features = getDisplayedClassFeatures(cls, catalogs)
      expect(features.map(getClassFeatureIdentity), cls.name).toEqual(
        cls.classFeatureRefs?.filter((ref) => ref.feature).map(getClassFeatureIdentity),
      )
      const character = makeCharacterFixture({
        originSystem: '2024',
        allowedSources: sources,
        classProgression: [{ name: cls.name, source: cls.source, levels: 19 }],
      })
      expect(getEpicBoonSlots(character, catalogs, data.feats), cls.name).toEqual([
        expect.objectContaining({ current: true, state: 'empty' }),
      ])
      for (const subclass of cls.subclasses ?? []) {
        const groups = projectClassLevelFeatures(
          new Map(),
          cls,
          subclass,
          subclass,
          [],
          20,
          catalogs,
        )
        for (const ref of subclass.subclassFeatureRefs ?? []) {
          const level = getSubclassFeatureReferenceLevel(ref)
          if (!ref.feature || !level || level <= 3) continue
          expect(
            groups.get(level)?.map(getSubclassFeatureIdentity),
            `${cls.name} / ${subclass.name} / ${ref.name}`,
          ).toContain(getSubclassFeatureIdentity(ref))
        }
      }
    }
    const knight = classRow('Death Knight')
    const aura = 'class-feature|aura of protection|paladin|xphb|6|xphb'
    expect(getDisplayedClassFeatures(knight, catalogs).map(getClassFeatureIdentity)).toContain(aura)
    expect(getDisplayedClassFeatures({ ...knight, classFeatures: [] }, catalogs)).toEqual([])
    expect(
      getDisplayedClassFeatures(knight, {
        ...catalogs,
        ambiguousClassFeatureTargets: new Set([aura]),
      }).map(getClassFeatureIdentity),
    ).not.toContain(aura)
  })

  test('class tables supply earned counters when the owner still declares the matching rules', () => {
    for (const [name, label, level, max, shortRest] of [
      ['Death Knight', 'Channel Divinity', 3, 2, 1],
      ['Demon Hunter', 'Favored Enemy', 1, 2, undefined],
      ['Druid', 'Wild Shape', 2, 2, 1],
      ['Evoker', 'Sorcery Points', 5, 5, 2],
      ['Hunter', 'Favored Enemy', 1, 2, undefined],
      ['Monk', 'Focus Points', 2, 2, 'all'],
      ['Paladin', 'Channel Divinity', 3, 2, 1],
      ['Priest', 'Channel Divinity', 2, 2, 1],
      ['Shaman', 'Rages', 1, 2, 1],
      ['Warrior', 'Second Wind', 1, 2, 1],
    ] as const) {
      const cls = classRow(name)
      const resource = getClassResourceDefs(cls, level).find((row) => row.label === label)
      expect(resource?.maxPerLevel[level - 1], name).toBe(max)
      expect(getClassResourceRecoveryAtLevel(resource!, level - 1), name).toMatchObject({
        longRest: 'all',
        ...(shortRest === undefined ? {} : { shortRest }),
      })
      expect(getClassResourceRecoveryAtLevel(resource!, level - 1).shortRest, name).toBe(shortRest)
      expect(
        normalizeClassRules({ ...cls, classFeatures: [] }, cls.classFeatureRefs ?? []).resources,
      ).not.toContainEqual(expect.objectContaining({ label }))
    }
    const [configured] = getClassResourceDefs(classRow('Druid'), 2)
    const [core] = getClassResourceDefs(classRow('Druid', 'XPHB'), 2)
    expect(configured.id).not.toBe(core.id)
    const character = {
      ...levelUp(start('Druid'), 8),
      classResources: { [configured.id]: 1 },
    }
    const resources = (current: typeof catalogs) =>
      getCharacterClassResources(character, () => classRow('Druid'), {
        catalogs: current,
        charismaModifier: 0,
        unlimitedWildShape: false,
      })
    expect(resources(catalogs)).toContainEqual(
      expect.objectContaining({ id: configured.id, current: 1 }),
    )
    expect(
      resources({ ...catalogs, classes: data.classes.filter((cls) => cls.source !== 'WoW') }),
    ).not.toContainEqual(expect.objectContaining({ id: configured.id }))
    expect(resources(catalogs)).toContainEqual(
      expect.objectContaining({ id: configured.id, current: 1 }),
    )
  })

  test('inherited Epic Boon selections suspend and can clear when their class source is removed', () => {
    let character = start('Druid')
    for (let level = 2; level <= 19; level++) character = levelUp(character, 8)
    const [slot] = getEpicBoonSlots(character, catalogs, data.feats)
    const expected = 'class-feature|epic boon|druid|xphb|19|xphb'
    const context = calculation(character)
    const authority = {
      catalogs,
      feats: data.feats,
      prerequisites: {
        ...context.classChoices.prerequisites,
        progression: character.classProgression,
      },
    }
    const alert = data.feats.find((feat) => feat.name === 'Alert' && feat.source === 'XPHB')!
    for (const replacement of [
      {
        abilityChanges: { wisdom: 2 } as Record<string, 1 | 2>,
        before: context.abilityScores.total,
      },
      { feat: alert },
    ]) {
      const saved = characterPersistenceSchema.parse(
        JSON.parse(
          JSON.stringify(replaceEpicBoonSelection(character, slot, replacement, authority)),
        ),
      )
      const claim = 'feat' in replacement ? saved.feats[0] : saved.asiChoices?.[0]
      expect(claim?.epicBoonTarget).toBe(expected)
      const missing = { ...catalogs, classes: data.classes.filter((cls) => cls.source !== 'WoW') }
      const [dormant] = getEpicBoonSlots(saved, missing, data.feats)
      expect(dormant).toMatchObject({ current: false, state: 'unavailable', hasClaims: true })
      const projected = projectEpicBoonSlots(saved, [dormant])
      expect(projected.asiChoices ?? []).toHaveLength(0)
      expect(projected.feats).toHaveLength(0)
      const cleared = replaceEpicBoonSelection(saved, dormant, null)
      expect(getEpicBoonSlots(cleared, catalogs, data.feats)[0].state).toBe('empty')
      expect(getEpicBoonSlots(saved, catalogs, data.feats)[0].state).toBe('selected')
    }
  })

  test.each([
    ['Priest', 'WoW'],
    ['Lightkeeper', 'EXAMPLE'],
  ])('%s uses only its declared list and keeps spell intent across reload and source withdrawal', (name, source) => {
    let character = start(name, source)
    const [entry] = character.classProgression
    const [slot] = getManagedClassSpellSlots(entry, character, catalogs)
    expect(slot?.slice(0, 2)).toEqual([
      ['class', name.toLowerCase(), source.toLowerCase()],
      'class-cantrip',
    ])
    const select = (spell: string) =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            target: { name: spell, source: 'XPHB' },
            policy: 'default',
          },
        ],
        spellContext(character),
      )

    expect(() => select('Fire Bolt')).toThrow()
    if (source === 'EXAMPLE') expect(() => select('Guidance')).toThrow()
    character = reopen(character, select('Sacred Flame'))
    const profileId = `class:${name}|${source}`
    const prepare = (prepared: boolean, context = spellContext(character)) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId,
        'Cure Wounds|XPHB',
        prepared,
        context,
      )
    character = reopen(character, prepare(true))
    if (source === 'EXAMPLE') {
      expect(
        character.spells.spellProfiles.find((profile) => profile.id === profileId)
          ?.dailyCastingTarget,
      ).toBe('class-feature|spellcasting|cleric|xphb|1|xphb')
    }
    const current = projectManagedClassSpellState(character, spellContext(character))
    expect(current.statuses).toContainEqual(expect.objectContaining({ active: true }))
    expect(current.dailyStatuses).toContainEqual(
      expect.objectContaining({ profileId, active: true }),
    )
    const withdrawn = {
      ...spellContext(character),
      catalogs: { ...catalogs, classCastingSources: [] },
    }
    const inactive = projectManagedClassSpellState(character, withdrawn)
    expect(inactive.statuses).toContainEqual(expect.objectContaining({ active: false }))
    expect(inactive.dailyStatuses).toContainEqual(
      expect.objectContaining({ profileId, active: false }),
    )
    expect(getManagedClassSpellSlots(entry, character, withdrawn.catalogs)).toContainEqual(slot)
    const cleared = reopen(character, prepare(false, withdrawn))
    expect(
      cleared.spells.spellProfiles.find((profile) => profile.id === profileId)?.preparedSpells,
    ).not.toContain('Cure Wounds|XPHB')
  })

  test('an empty catalog-discovered cantrip slot expires when its level is lost offline', () => {
    let character = start('Lightkeeper', 'EXAMPLE')
    for (let level = 2; level <= 4; level++) character = levelUp(character, 8)
    const [entry] = character.classProgression
    const slot = getManagedClassSpellSlots(entry, character, catalogs).find(
      (slot) => slot[1] === 'class-cantrip' && slot[3] === 4,
    )
    expect(slot).toBeDefined()
    const expectedEmptyRevision = character.managedClassSpellRevision ?? 0
    character = reopen(
      character,
      applyLevelDown(
        character,
        character.provenance,
        createCharacterCalculationContext(character, {}),
      ),
    )
    expect(character.classProgression[0].levels).toBe(3)
    character = levelUp(character, 8)
    expect(character.managedClassSpellRevision).toBeGreaterThan(expectedEmptyRevision)
    expect(() =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [
          {
            slot: slot!,
            expected: null,
            expectedEmptyRevision,
            target: { name: 'Sacred Flame', source: 'XPHB' },
            policy: 'default',
          },
        ],
        spellContext(character),
      ),
    ).toThrow(/empty spell choice changed/i)
  })

  test.each([
    ['Lightkeeper', 'EXAMPLE'],
    ['Priest', 'WoW'],
  ])(
    '%s can clear dormant daily intent and prepare under a newly declared parent',
    async (name, source) => {
      let character = start(name, source)
      const profileId = `class:${name}|${source}`
      const prepare = (prepared: boolean, context = spellContext(character)) =>
        setDailyClassSpellPreparedCommand(
          character,
          character.provenance,
          profileId,
          'Cure Wounds|XPHB',
          prepared,
          context,
        )
      character = reopen(character, prepare(true))
      const replacementData = composeGameDataLayers([await loadWithCopy('Druid', name, source)])
      const replacement = {
        ...spellContext(character),
        catalogs: buildClassChoiceFeatureCatalogs(replacementData),
        spellsByKey: buildGameDataLookups(replacementData).spellsByKey,
      }
      expect(projectManagedClassSpellState(character, replacement).dailyStatuses).toContainEqual(
        expect.objectContaining({ profileId, active: false }),
      )
      character = reopen(character, prepare(false, replacement))
      expect(
        character.spells.spellProfiles.find((row) => row.id === profileId)?.dailyCastingTarget,
      ).toBeUndefined()
      character = reopen(character, prepare(true, replacement))
      expect(
        character.spells.spellProfiles.find((row) => row.id === profileId)?.dailyCastingTarget,
      ).toBe('class-feature|spellcasting|druid|xphb|1|xphb')
      expect(projectManagedClassSpellState(character, replacement).dailyStatuses).toContainEqual(
        expect.objectContaining({ profileId, active: true }),
      )
    },
    25_000,
  )

  test('Death Knight earns weapon mastery, daily preparation and Fighting Style at the source levels', () => {
    let character = start('Death Knight')
    const cls = classRow('Death Knight')
    const choices = cls.normalizedRules!.choices
    const mastery = choices.find((choice) => choice.label === 'Weapon Mastery')!
    const fightingStyle = choices.find((choice) => choice.label === 'Fighting Style')!
    const currentOptions = (choice: typeof mastery) =>
      resolveClassChoiceOptions(
        choice,
        { ...createClassChoiceCatalogs(catalogs), feats: data.feats },
        [],
        character.classProgression[0].levels,
        character,
      )
    const choose = (choice: typeof mastery, names: string[]) => {
      const options = names.map(
        (name) =>
          currentOptions(choice).find(
            (row) =>
              row.reference.name === name &&
              row.reference.source === 'XPHB' &&
              row.availability === 'eligible',
          )!.reference,
      )
      return reopen(
        character,
        applyClassChoiceSelectionWithGrantsCommand(
          character,
          character.provenance,
          choice,
          options,
          {
            classes: data.classes,
            catalogs,
            feats: data.feats,
            spellContext: spellContext(character),
          },
        ),
      )
    }
    expect(getRequiredChoiceSelectionCount(mastery, 1)).toBe(2)
    character = choose(mastery, ['Longsword', 'Javelin'])
    expect(character.classChoiceSelections?.[0]).toMatchObject({
      className: 'Death Knight',
      classSource: 'WoW',
    })
    expect(calculation(character).classCasting.slots.shared[1]?.max).toBe(2)
    const prepare = (spell: string) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        'class:Death Knight|WoW',
        spell,
        true,
        spellContext(character),
      )
    character = reopen(character, prepare('Heroism|XPHB'))
    expect(() => prepare('Consecration|WoW')).toThrow()
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses,
    ).toContainEqual(expect.objectContaining({ profileId: 'class:Death Knight|WoW', active: true }))
    character = levelUp(character, 10)
    expect(getRequiredChoiceSelectionCount(fightingStyle, 2)).toBe(1)
    const unlinked = createClassChoiceCatalogs({
      ...catalogs,
      classes: data.classes.map((row) => (row === cls ? { ...row, classFeatures: [] } : row)),
    })
    const alternative = {
      ...fightingStyle,
      options: [{ entityType: 'feat' as const, name: 'Defense', source: 'XPHB' }],
    }
    for (const choice of [mastery, fightingStyle, alternative]) {
      const result = resolveClassChoiceOptions(
        choice,
        { ...unlinked, feats: data.feats },
        [],
        2,
        character,
      )
      expect(result.some((option) => option.availability === 'eligible')).toBe(false)
    }
    const defense = currentOptions(fightingStyle).find(
      (row) => row.reference.name === 'Defense' && row.reference.source === 'XPHB',
    )
    expect(defense).toBeDefined()
    expect(defense?.prerequisite).toBeUndefined()
    character = choose(fightingStyle, ['Blessed Warrior'])
    const bonus = getSelectedFeatureCantripSlots(character, catalogs)
    expect(bonus).toHaveLength(2)
    character = reopen(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        bonus.map((slot, index) => ({
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: index ? 'Resistance' : 'Guidance', source: 'XPHB' },
          policy: 'default',
        })),
        spellContext(character),
      ),
    )
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses.map((row) => [
        row.choice.slot[0],
        row.active,
      ]),
    ).toEqual([
      [['class', 'death knight', 'wow'], true],
      [['class', 'death knight', 'wow'], true],
    ])
    expect(character.classChoiceSelections?.map((row) => row.classSource)).toEqual(['WoW', 'WoW'])
    character = levelUp(character, 10)
    const oath = cls.subclasses!.find((row) => row.name === 'Oath of the Ebon Blade')!
    character = reopen(
      character,
      selectSubclass(character, character.provenance, oath.name, oath.source, undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
    expect(
      getEarnedSubclassSpellGrants(cls, character.classProgression[0])?.map((grant) =>
        grant.spellName.toLowerCase(),
      ),
    ).toEqual(['death grip|wow'])
    character = levelUp(character, 10)
    const featRequest = { name: 'Death Knight', source: 'WoW', level: 4 }
    expect(getRevisedClassFeatSlot(character, featRequest, catalogs)).toMatchObject({
      openFeatCategories: true,
      hasSpellcastingFeature: true,
    })
    expect(
      getRevisedClassFeatSlot(character, featRequest, {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources?.filter(
          (row) => row.kind !== 'casting-copy',
        ),
      })?.hasSpellcastingFeature,
    ).toBeUndefined()
  }, 25_000)

  test.each([
    ['Warlock', 'XPHB'],
    ['Warlock', 'WoW'],
    ['Hexbinder', 'EXAMPLE'],
  ])(
    '%s %s earns its own Invocation targets, Pact and at-will spell',
    async (name, source) => {
      const actor = reachLevel(start(name, source), 5)
      const [entry] = actor.classProgression
      const poolId = getRevisedInvocationPoolId(entry)
      const cls = classRow(name, source)
      const choice = getCharacterClassChoices(
        cls,
        undefined,
        createOptionalClassFeatureActivity(actor, catalogs),
        catalogs,
      ).find((row) => row.id === poolId)!
      const slot = getManagedClassSpellSlots(entry, actor, catalogs).find(
        (row) => row[1] === 'class-cantrip',
      )!
      const eldritchBlast = { name: 'Eldritch Blast', source: 'XPHB' }
      const cantrip = (character: Character, target?: typeof eldritchBlast) =>
        reopen(
          character,
          setManagedClassSpellChoiceCommand(
            character,
            character.provenance,
            {
              slot,
              target,
              expected: character.managedClassSpellChoices?.[0] ?? null,
              expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
              ...(target && { policy: 'default' as const }),
            },
            calculation(character).classChoices.spellContext,
          ),
        )
      const learned = cantrip(actor, eldritchBlast)
      const option = (name: string) => ({
        entityType: 'optionalFeature' as const,
        name,
        source: 'XPHB',
      })
      const agonizing = option('Agonizing Blast')
      const targeted = { ...agonizing, invocationCantrip: eldritchBlast }
      const pact = option('Pact of the Blade')
      const blade = option('Thirsting Blade')
      const misty = option('Misty Visions')
      const selection = (character: Character) =>
        character.classChoiceSelections?.find((row) => row.choiceId === poolId)
      const choose = (character: Character, ...options: Array<typeof targeted | typeof blade>) =>
        reopen(
          character,
          applyClassChoiceSelectionWithGrantsCommand(
            character,
            character.provenance,
            choice,
            options,
            {
              classes: data.classes,
              catalogs,
              spellContext: calculation(character).classChoices.spellContext,
            },
            undefined,
            selection(character) ? getOptionalPoolSelectionHandle(selection(character)!) : '',
          ),
        )
      const views = resolveClassChoiceOptions(
        choice,
        createClassChoiceCatalogs(catalogs),
        [],
        5,
        learned,
        calculation(learned).classChoices.prerequisites.knownWarlockCantrips,
      )
      for (const name of ['Agonizing Blast', 'Repelling Blast', 'Eldritch Spear']) {
        expect(
          views
            .filter((view) => view.reference.name === name && view.reference.source === 'XPHB')
            .map((view) => view.reference.invocationCantrip),
        ).toEqual([eldritchBlast])
      }
      expect(() => choose(learned, agonizing)).toThrow(/current eligible known Warlock cantrip/)
      expect(() => choose(learned, blade)).toThrow(/current Pact of the Blade/)
      expect(() => choose(actor, targeted)).toThrow(/current eligible known Warlock cantrip/)
      for (const single of [pact, misty]) {
        const only = choose(actor, single)
        const details = buildRetainedCharacterDetails(
          only,
          data,
          data,
          undefined,
          calculation(only).classChoices.prerequisites,
        ).choiceDetailsById.get(poolId)
        expect(details).toMatchObject([{ availability: 'available' }])
        expect(details?.[0]?.entries.length).toBeGreaterThan(0)
      }
      const saved = choose(learned, pact, targeted, misty, blade)
      expect(
        selection(saved)?.selected.find((option) => option.name === agonizing.name),
      ).toMatchObject({ invocationCantrip: eldritchBlast, slotLevel: 2 })
      expect(() => choose(saved, targeted, misty, blade)).toThrow(/dependent Invocations/)
      const projected = calculation(saved)
      expect(projected.atWillInvocationSpellStatuses).toMatchObject([
        {
          profileId: `class:${name}|${source}`,
          reference: 'Silent Image|XPHB',
          spell: { name: 'Silent Image' },
        },
      ])
      expect(calculation(choose(saved, targeted, pact)).atWillInvocationSpellStatuses).toEqual([])
      const current = {
        ...lookups,
        classChoiceClasses: data.classes,
        classChoiceFeatureCatalogs: catalogs,
      }
      const view = (character: Character) =>
        createCharacterSheetViewModel(character, current, current)
      const sheet = view(saved)
      expect(sheet.classFeaturesSummary2014).toContain('Agonizing Blast — Eldritch Blast (XPHB)')
      expect(sheet.classFeaturesSummary2014).toContain(
        'Thirsting Blade: You gain the Extra Attack feature',
      )
      expect(sheet.spellRows).toContainEqual(
        expect.objectContaining({
          name: 'Silent Image',
          castingNote: expect.stringContaining('Misty Visions'),
        }),
      )
      const cleared = cantrip(saved)
      expect(
        selection(cleared)?.selected.find((option) => option.name === agonizing.name)
          ?.invocationCantrip,
      ).toEqual(eldritchBlast)
      expect(view(cleared).classFeaturesSummary2014).not.toContain(
        'Agonizing Blast — Eldritch Blast (XPHB)',
      )
      expect(view(cantrip(cleared, eldritchBlast)).classFeaturesSummary2014).toContain(
        'Agonizing Blast — Eldritch Blast (XPHB)',
      )
      if (source !== 'XPHB') {
        const withoutCopy = {
          ...current,
          classChoiceFeatureCatalogs: {
            ...catalogs,
            classCastingSources: catalogs.classCastingSources.filter(
              (proof) =>
                proof.kind !== 'casting-copy' ||
                proof.target !==
                  JSON.stringify(['class', name.toLowerCase(), source.toLowerCase()]),
            ),
          },
        }
        const unavailable = createCharacterCalculationContext(saved, withoutCopy, current)
        expect(unavailable.atWillInvocationSpellStatuses).toEqual([])
        expect(
          unavailable.character.features.some((feature) => feature.name === 'Thirsting Blade'),
        ).toBe(false)
      }
      if (source === 'WoW') {
        const disabled = { ...saved, allowedSources: ['XPHB'] }
        const hidden = calculation(disabled)
        expect(hidden.atWillInvocationSpellStatuses).toEqual([])
        expect(
          hidden.character.features.some((feature) =>
            [agonizing.name, pact.name, blade.name, misty.name].includes(feature.name),
          ),
        ).toBe(false)
        expect(selection(disabled)).toEqual(selection(saved))
        expect(() => choose({ ...learned, allowedSources: ['XPHB'] }, misty)).toThrow(
          /earned at-will Invocation/,
        )
        const withoutGain = reopen(
          saved,
          applyLevelDown(saved, saved.provenance, calculation(saved)),
        )
        expect(selection(withoutGain)?.selected.map((option) => option.name)).toEqual([
          pact.name,
          agonizing.name,
          misty.name,
        ])
        expect(calculation(withoutGain).atWillInvocationSpellStatuses[0]?.reference).toBe(
          'Silent Image|XPHB',
        )
        const replaced = choose(learned, pact, blade)
        const lower = reopen(
          replaced,
          applyLevelDown(replaced, replaced.provenance, calculation(replaced)),
        )
        expect(selection(lower)?.selected.some((option) => option.name === blade.name)).toBe(true)
        expect(view(lower).classFeaturesSummary2014).not.toContain(
          'Thirsting Blade: You gain the Extra Attack feature',
        )
        expect(view(reachLevel(lower, 5)).classFeaturesSummary2014).toContain(
          'Thirsting Blade: You gain the Extra Attack feature',
        )
        const legacy = characterPersistenceSchema.parse({
          ...saved,
          classChoiceSelections: saved.classChoiceSelections?.map((row) =>
            row.choiceId === poolId
              ? {
                  ...row,
                  selected: row.selected.map((option) =>
                    option.name === agonizing.name
                      ? { ...option, invocationCantrip: undefined }
                      : option,
                  ),
                }
              : row,
          ),
        })
        const repaired = choose(legacy, targeted, pact, misty, blade)
        expect(
          selection(repaired)?.selected.find((option) => option.name === agonizing.name),
        ).toMatchObject({
          slotLevel: selection(legacy)?.selected.find((option) => option.name === agonizing.name)
            ?.slotLevel,
          invocationCantrip: eldritchBlast,
        })
        const pdf = await PDFDocument.load(
          await generateTestCharacterSheet(sheet, '2024-official', {
            text: { descriptions: 'full', overflow: 'notes' },
          }),
        )
        const text = pdf
          .getForm()
          .getFields()
          .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
          .join(' ')
        expect(text).toMatch(/Misty Visions/)
        expect(text).toMatch(/Silent Image/)
      }
    },
    60_000,
  )

  test.each([
    'WoW',
    'XPHB',
  ])('%s Warlock derives fixed Invocation casts and exact prerequisites', async (source) => {
    const actor: Character = { ...start('Warlock', source), allowedSources: ['XPHB', 'WoW', 'XMM'] }
    const cls = classRow('Warlock', source)
    const poolId = getRevisedInvocationPoolId(actor.classProgression[0])
    const option = (name: string) => ({
      entityType: 'optionalFeature' as const,
      name,
      source: 'WoW',
    })
    const pact = option('Pact of the Legion')
    const funnel = option('Health Funnel')
    const call = option('Call of the Void')
    const legion = option('Legion Summoning')
    const savedPool = (character: Character) =>
      character.classChoiceSelections?.find((row) => row.choiceId === poolId)
    const choice = (character: Character) =>
      getCharacterClassChoices(
        cls,
        undefined,
        createOptionalClassFeatureActivity(character, catalogs),
        catalogs,
      ).find((row) => row.id === poolId)!
    const choose = (character: Character, ...selected: ReturnType<typeof option>[]) => {
      const saved = savedPool(character)
      return reopen(
        character,
        applyClassChoiceSelectionWithGrantsCommand(
          character,
          character.provenance,
          choice(character),
          selected,
          {
            classes: data.classes,
            catalogs,
            spellContext: calculation(character).classChoices.spellContext,
          },
          undefined,
          saved ? getOptionalPoolSelectionHandle(saved) : '',
        ),
      )
    }
    const view = (character: Character) =>
      resolveClassChoiceOptions(
        choice(character),
        createClassChoiceCatalogs(catalogs),
        savedPool(character)?.selected,
        character.classProgression[0].levels,
        character,
      )
    expect(() => choose(actor, funnel)).toThrow(/earned Invocation/)
    expect(() => choose(actor, call)).toThrow(/earned Invocation/)
    const first = choose(actor, pact)
    const castStatuses = (character: Character) =>
      calculation(character).fixedClassSpellStatuses.filter((row) =>
        [pact.name, legion.name].includes(row.featureName),
      )
    expect(castStatuses(first)).toMatchObject([
      {
        active: true,
        reference: 'Find Familiar|XPHB',
        castOnly: { castingTime: 'Magic Action' },
      },
    ])
    const second = reachLevel(first, 2)
    expect(view(second).find((row) => row.reference.name === funnel.name)).toMatchObject({
      availability: 'eligible',
    })
    const fifth = reachLevel(choose(second, pact, funnel), 5)
    const callView = view(fifth).find((row) => row.reference.name === call.name)!
    expect(callView).toMatchObject({
      availability: 'eligible',
      invocationPrerequisite: { name: pact.name },
    })
    expect(isClassChoiceOptionEligibleInDraft(callView, new Set())).toBe(false)
    expect(
      isClassChoiceOptionEligibleInDraft(callView, new Set([getClassChoiceOptionKey(pact)])),
    ).toBe(true)
    const ninth = reachLevel(fifth, 9)
    expect(() => choose(ninth, legion)).toThrow(/earned Invocation/)
    const malformedPact = { ...pact, ref: '' }
    expect(() => choose(choose(ninth), malformedPact, legion)).toThrow(/earned Invocation/)
    expect(() => choose(first, malformedPact)).toThrow(/earned Invocation/)
    const importedPact = characterPersistenceSchema.parse({
      ...first,
      classChoiceSelections: first.classChoiceSelections?.map((row) =>
        row.choiceId === poolId
          ? { ...row, selected: [{ ...row.selected[0], ref: 'wrong printing' }] }
          : row,
      ),
    })
    expect(castStatuses(importedPact)).toEqual([])
    expect(
      validateClassChoices(
        importedPact,
        calculation(importedPact),
        createClassChoiceCatalogs(catalogs),
      ),
    ).toContainEqual(expect.objectContaining({ title: 'Finish Eldritch Invocations' }))
    const combined = choose(choose(ninth), pact, funnel, call, legion)
    expect(castStatuses(combined)).toMatchObject([
      { reference: 'Find Familiar|XPHB', active: true },
      {
        reference: 'Planar Binding|XPHB',
        active: true,
        castingNote: expect.stringContaining('Long Rest'),
      },
    ])
    const afterSourceGap = reopen(
      combined,
      reconcileOptionalClassFeatureChoicesCommand(
        combined,
        combined.provenance,
        {
          allClasses: data.classes,
          availableClasses: data.classes.filter(
            (row) => row.name !== cls.name || row.source !== cls.source,
          ),
          classChoiceFeatureCatalogs: catalogs,
          spellContext: calculation(combined).classChoices.spellContext,
        },
        true,
      ),
    )
    expect(savedPool(afterSourceGap)?.inactive).toBe(true)
    expect(castStatuses(afterSourceGap)).toEqual(castStatuses(combined))
    expect(() => choose(combined, funnel, call, legion)).toThrow(/dependent Invocations/)
    expect(
      validateSpells(combined, calculation(combined), lookups.spellsByKey).filter((issue) =>
        /Legion/.test(issue.title),
      ),
    ).toEqual([])
    const profileId = `class:Warlock|${source}`
    const profile = (character: Character) =>
      calculation(character).character.spells.spellProfiles.find((row) => row.id === profileId)!
    const baseline = profile(choose(ninth))
    expect(profile(combined)).toMatchObject({
      spellsKnown: [...baseline.spellsKnown, 'Find Familiar|XPHB'],
      fixedSpells: [...(baseline.fixedSpells ?? []), 'Find Familiar|XPHB'],
    })
    expect(getSpellProfileSelectionCounts(profile(combined)).spells).toBe(0)
    const slot = getManagedClassSpellSlots(ninth.classProgression[0], ninth, catalogs).find(
      (row) => row[1] === 'class-known' && row[3] === 9,
    )!
    const withOrdinary = reopen(
      combined,
      setManagedClassSpellChoiceCommand(
        combined,
        combined.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: combined.managedClassSpellRevision ?? 0,
          target: { name: 'Planar Binding', source: 'XPHB' },
          policy: 'default',
        },
        calculation(combined).classChoices.spellContext,
      ),
    )
    const cleared = choose(withOrdinary, funnel)
    expect(castStatuses(cleared)).toEqual([])
    expect(profile(cleared).spellsKnown).toEqual([...baseline.spellsKnown, 'Planar Binding|XPHB'])
    const legacy = characterPersistenceSchema.parse({
      ...combined,
      classChoiceSelections: combined.classChoiceSelections?.map((row) =>
        row.choiceId === poolId
          ? { ...row, selected: row.selected.filter((pick) => pick.name !== pact.name) }
          : row,
      ),
    })
    expect(castStatuses(legacy)).toEqual([])
    expect(
      calculation(legacy).character.features.filter((feature) =>
        [call.name, legion.name].includes(feature.name),
      ),
    ).toEqual([])
    expect(
      validateClassChoices(legacy, calculation(legacy), createClassChoiceCatalogs(catalogs)),
    ).toContainEqual(expect.objectContaining({ title: 'Review Eldritch Invocation prerequisites' }))
    if (source === 'WoW') {
      const current = {
        ...lookups,
        classChoiceClasses: data.classes,
        classChoiceFeatureCatalogs: catalogs,
      }
      const sheet = createCharacterSheetViewModel(combined, current, current)
      expect(
        sheet.actions
          .filter((row) => row.name === 'Find Familiar')
          .map((row) => row.kind)
          .sort(),
      ).toEqual(['action', 'special'])
      expect(sheet.spellRows).toContainEqual(
        expect.objectContaining({
          name: 'Find Familiar',
          castingNote: expect.stringContaining('Magic action'),
        }),
      )
      expect(sheet.spellRows).toContainEqual(
        expect.objectContaining({
          name: 'Planar Binding',
          castOnly: true,
          castingNote: expect.stringContaining('Long Rest'),
        }),
      )
      const withoutExact = {
        ...current,
        spellsByKey: Object.fromEntries(
          Object.entries(lookups.spellsByKey).filter(
            ([, spell]) => spell.name !== 'Find Familiar' || spell.source !== 'XPHB',
          ),
        ),
      }
      expect(
        createCharacterCalculationContext(combined, withoutExact, current).fixedClassSpellStatuses,
      ).toContainEqual(expect.objectContaining({ featureName: pact.name, active: false }))
      const pdf = await PDFDocument.load(
        await generateTestCharacterSheet(sheet, '2024-official', {
          text: { descriptions: 'full', overflow: 'notes' },
        }),
      )
      const text = pdf
        .getForm()
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
      expect(text).toMatch(/Magic action/)
      expect(text).toMatch(/Planar Binding/)
    }
  }, 60_000)

  test('Warlock earns Pact Magic and Mystic Arcanum with its own list, profile and inverse', () => {
    let character: Character = start('Warlock')
    const slots = () =>
      getManagedClassSpellSlots(character.classProgression[0], character, catalogs)
    const choose = (earned: ManagedClassSpellSlot[], names: string[]) =>
      reopen(
        character,
        setManagedClassSpellChoicesCommand(
          character,
          character.provenance,
          earned.map((slot, index) => ({
            slot,
            expected: null,
            expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
            target: { name: names[index], source: 'XPHB' },
            policy: 'default',
          })),
          spellContext(character),
        ),
      )
    const first = slots()
    expect(first.map((slot) => [slot[0], slot[1]])).toEqual([
      [['class', 'warlock', 'wow'], 'class-cantrip'],
      [['class', 'warlock', 'wow'], 'class-cantrip'],
      [['class', 'warlock', 'wow'], 'class-known'],
      [['class', 'warlock', 'wow'], 'class-known'],
    ])
    expect(calculation(character).classCasting.slots.pact[1]?.max).toBe(1)
    character = choose(first, ['Eldritch Blast', 'Mage Hand', 'Hex', 'Armor of Agathys'])
    character = levelUp(character, 8)
    expect(calculation(character).classCasting.slots.pact[1]?.max).toBe(2)
    character = choose(
      slots().filter((slot) => slot[3] === 2),
      ['Witch Bolt'],
    )
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses.every(
        (row) => row.active,
      ),
    ).toBe(true)
    const lost = {
      ...spellContext(character),
      catalogs: {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources?.filter(
          (row) => row.kind !== 'casting-copy',
        ),
      },
    }
    expect(
      projectManagedClassSpellState(character, lost).statuses.every((row) => !row.active),
    ).toBe(true)
    expect(character.managedClassSpellChoices).toHaveLength(5)
    character = reopen(
      character,
      applyLevelDown(character, character.provenance, calculation(character)),
    )
    expect(character.managedClassSpellChoices).toHaveLength(4)

    const veteran = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [{ name: 'Warlock', source: 'WoW', levels: 11 }],
    })
    const arcanum = getManagedClassSpellSlots(veteran.classProgression[0]).find(
      (slot) => slot[1] === 'class-arcanum',
    )!
    const pool = getManagedClassSpellPool(veteran, arcanum, spellContext(veteran))
    expect(pool.spells.length).toBeGreaterThan(0)
    expect(new Set(pool.spells.map((spell) => spell.level))).toEqual(new Set([6]))
    expect(calculation(veteran).classCasting.slots.pact[5]?.max).toBe(3)
    character = veteran
    expect(() => choose([arcanum], ['Mass Suggestion'])).toThrow(/spell list/)
    character = choose([arcanum], ['Circle of Death'])
    expect(character.managedClassSpellChoices?.[0]).toMatchObject({
      slot: [['class', 'warlock', 'wow'], 'class-arcanum', arcanum[2], 11, 0],
      target: { name: 'Circle of Death', source: 'XPHB' },
    })
  }, 30_000)

  test('casting authority requires the current selected copy and exact retained declaration', () => {
    const cls = classRow('Warlock')
    const entry = {
      name: cls.name,
      source: cls.source,
      levels: 1,
    }
    const { owner, rule } = getClassSpellProfilePolicy(entry)
    const target = rule!.declaration.target
    const current = (source = catalogs) => getCurrentClassCastingProducer(source, owner, target, 1)
    expect(current()?.effective.source).toBe('WoW')
    for (const broken of [
      { ...cls, classFeatures: [] },
      { ...cls, classFeatureRefs: [] },
      { ...cls, spellcastingAbility: 'wis' },
      { ...cls, sourceIdentityConflict: true as const },
      {
        ...cls,
        classFeatureRefs: [
          ...cls.classFeatureRefs!,
          {
            ref: 'Pact Magic|Warlock|PHB|1',
            name: 'Pact Magic',
            className: 'Warlock',
            source: 'PHB',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
    ]) {
      const changed = {
        ...catalogs,
        classes: data.classes.map((row) => (row === cls ? broken : row)),
      }
      expect(current(changed)).toBeUndefined()
      expect(getManagedClassSpellSlots(entry, undefined, changed)).toEqual([])
    }
    expect(
      getClassSpellProfilePolicy({ name: 'Demon Hunter', source: 'WoW', levels: 1 }).rule,
    ).toBeUndefined()
    const warrior = classRow('Warrior').normalizedRules!.choices.find(
      (choice) => choice.label === 'Weapon Mastery',
    )!
    expect(getRequiredChoiceSelectionCount(warrior, 4)).toBe(4)
    expect(
      resolveClassChoiceOptions(warrior, createClassChoiceCatalogs(catalogs), [], 4).length,
    ).toBeGreaterThan(4)
  })

  test('Demon Hunter prepares its own spells with the replacement rule and keeps exact saved intent', () => {
    let character = start('Demon Hunter')
    const [entry] = character.classProgression
    const { owner, rule } = getClassSpellProfilePolicy(entry, catalogs.classCastingSources)
    const target = replacementSpellcastingAddress(
      'class-feature|spellcasting|demon hunter|wow|1|wow',
      'class-feature|spellcasting|ranger|xphb|1|xphb',
    )
    expect(rule?.declaration.target).toBe(target)
    expect(
      getCurrentClassCastingProducer(catalogs, owner, target, 1)?.declaration.feature,
    ).toMatchObject({ className: 'Demon Hunter', source: 'WoW' })
    expect(getManagedClassSpellSlots(entry, character, catalogs)).toEqual([])
    const profileId = 'class:Demon Hunter|WoW'
    const prepare = (reference: string, prepared = true, context = spellContext(character)) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        profileId,
        reference,
        prepared,
        context,
      )
    expect(calculation(character).classCasting.details).toContainEqual(
      expect.objectContaining({
        profileId,
        preparedSpellLimit: 2,
        maxSpellLevel: 1,
      }),
    )
    expect(calculation(character).classCasting.slots.shared[1]?.max).toBe(2)
    expect(() => prepare('Freezing Trap|WoW')).toThrow(/spell list/i)
    expect(() => prepare('Lesser Restoration|XPHB')).toThrow(/outside the level/i)
    character = reopen(character, prepare('Cure Wounds|XPHB'))
    character = reopen(character, prepare('Ensnaring Strike|XPHB'))
    expect(() => prepare('Fog Cloud|XPHB')).toThrow(/limit/i)
    expect(character.spells.spellProfiles.find((row) => row.id === profileId)).toMatchObject({
      dailyCastingTarget: target,
      preparedSpells: ['Cure Wounds|XPHB', 'Ensnaring Strike|XPHB'],
    })
    const blockedSources = { ...character, allowedSources: ['XPHB'] }
    expect(
      projectManagedClassSpellState(blockedSources, spellContext(blockedSources)).dailyStatuses,
    ).toHaveLength(2)
    expect(
      projectManagedClassSpellState(blockedSources, spellContext(blockedSources)).dailyStatuses,
    ).toEqual([
      expect.objectContaining({ active: false }),
      expect.objectContaining({ active: false }),
    ])
    const withdrawn = {
      ...spellContext(character),
      catalogs: { ...catalogs, classCastingSources: [] },
    }
    expect(
      projectManagedClassSpellState(character, withdrawn).dailyStatuses.every(
        ({ active }) => !active,
      ),
    ).toBe(true)
    const cleared = reopen(character, prepare('Cure Wounds|XPHB', false, withdrawn))
    expect(
      cleared.spells.spellProfiles.find((row) => row.id === profileId)?.preparedSpells,
    ).toEqual(['Ensnaring Strike|XPHB'])
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses.every(
        ({ active }) => active,
      ),
    ).toBe(true)
    for (let level = 2; level <= 5; level++) character = levelUp(character, 10)
    expect(calculation(character).classCasting.slots.shared).toMatchObject({
      1: { max: 4 },
      2: { max: 2 },
    })
    expect(calculation(character).classCasting.details).toContainEqual(
      expect.objectContaining({
        profileId,
        preparedSpellLimit: 6,
        maxSpellLevel: 2,
      }),
    )
    character = reopen(character, prepare('Lesser Restoration|XPHB'))
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses,
    ).toHaveLength(3)
  })

  test('a replacement from a separate source supports bounded numeric choices and offline clear', () => {
    let character = start('Wardkeeper', 'EXAMPLE')
    const [entry] = character.classProgression
    const target = replacementSpellcastingAddress(
      'class-feature|spellcasting|wardkeeper|example|1|example',
      'class-feature|spellcasting|cleric|xphb|1|xphb',
    )
    const slots = getManagedClassSpellSlots(entry, character, catalogs)
    expect(slots).toHaveLength(3)
    const [slot] = slots
    expect(slot).toEqual([['class', 'wardkeeper', 'example'], 'class-cantrip', target, 1, 0])
    const pick = (name: string) =>
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            policy: 'default',
            target: { name, source: 'XPHB' },
          },
        ],
        spellContext(character),
      )
    expect(() => pick('Guidance')).toThrow()
    character = reopen(character, pick('Sacred Flame'))
    const [choice] = character.managedClassSpellChoices!
    const withoutTemplate: Character = {
      ...character,
      originSystem: '2014',
      allowedSources: ['EXAMPLE'],
    }
    expect(calculation(withoutTemplate).classCasting.details).toEqual([])
    expect(
      projectManagedClassSpellState(withoutTemplate, spellContext(withoutTemplate)).statuses,
    ).toContainEqual(
      expect.objectContaining({ active: false, reason: expect.stringMatching(/casting feature/i) }),
    )
    const offline = {
      ...spellContext(character),
      catalogs: { ...catalogs, classCastingSources: [] },
    }
    expect(projectManagedClassSpellState(character, offline).statuses).toContainEqual(
      expect.objectContaining({ active: false }),
    )
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        managedClassSpellChoices: [
          { ...choice, slot: [slot[0], slot[1], target.replace('wardkeeper', 'other'), 1, 0] },
        ],
      }).success,
    ).toBe(false)
    const cleared = reopen(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        [{ slot, expected: choice }],
        offline,
      ),
    )
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses,
    ).toContainEqual(expect.objectContaining({ active: true }))
    const cls = classRow('Wardkeeper', 'EXAMPLE')
    const authored = cls.classFeatureRefs!.find((ref) => ref.name === 'Spellcasting')!.feature!
    for (const replacement of [
      { ...authored, entries: [...authored.entries!, 'You can prepare one additional spell.'] },
      { ...authored, source: '' },
    ]) {
      const changed = buildClassChoiceFeatureCatalogs({
        ...data,
        classes: data.classes.map((row) =>
          row !== cls
            ? row
            : {
                ...row,
                classFeatureRefs: row.classFeatureRefs?.map((ref) =>
                  ref.feature !== authored ? ref : { ...ref, feature: replacement },
                ),
              },
        ),
        classFeatures: data.classFeatures.map((feature) =>
          getClassFeatureIdentity(feature) === getClassFeatureIdentity(authored)
            ? replacement
            : feature,
        ),
      })
      expect(getManagedClassSpellSlots(entry, undefined, changed)).toEqual([])
    }
  })

  test('source filters cannot hide a competing casting declaration on a copied class', async () => {
    const layer = await new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true, availableResources: ['class/index.json'] },
      {
        type: 'local',
        readJson: async (file) => {
          const document = JSON.parse(await readFile(`data/${file}`, 'utf8'))
          if (file === 'class/class-warlock.json') {
            const copy = document.class.find((row: { source: string }) => row.source === 'WoW')
            const parent = document.class.find((row: { source: string }) => row.source === 'XPHB')
            copy.classFeatures = [...parent.classFeatures, 'Pact Magic|Warlock|PHB|1']
          }
          if (file === 'class/class-demonhunter.json') {
            const copy = document.class.find((row: { source: string }) => row.source === 'WoW')
            copy.classFeatures.push('Spellcasting|Ranger|PHB|2')
          }
          return document
        },
      },
    ).loadAllData()
    const loaded = composeGameDataLayers([layer])
    const filtered = buildClassChoiceFeatureCatalogs({
      ...loaded,
      classes: DataFilter.filterClasses(loaded.classes, { sources }),
    })
    const { owner, rule } = getClassSpellProfilePolicy({
      name: 'Warlock',
      source: 'WoW',
      levels: 1,
    })
    const copy = filtered.classes!.find((row) => row.name === 'Warlock' && row.source === 'WoW')
    expect(copy?.classFeatureRefs?.filter((ref) => ref.name === 'Pact Magic')).toHaveLength(1)
    expect(
      getClassSpellProfilePolicy(
        { name: 'Demon Hunter', source: 'WoW', levels: 1 },
        filtered.classCastingSources,
      ).rule,
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(filtered, owner, rule!.declaration.target, 1),
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(
        filtered,
        owner,
        'class-feature|mystic arcanum|warlock|xphb|11|xphb',
        11,
      ),
    ).toBeDefined()
  })
})
