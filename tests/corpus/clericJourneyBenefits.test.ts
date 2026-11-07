// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { getClericArcanaSpellRule } from '@/lib/5etools/clericArcanaSpells'
import {
  clericDomainCantrips,
  getClericDomainCantripSource,
} from '@/lib/5etools/clericDomainCantripSources'
import { composeGameDataLayers, findLayerDependencyIssues } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { getIncludedDomainSpellReprints } from '@/lib/5etools/legacyClericDomainSpells'
import { buildGameDataLookups, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClassDocument, parseClasses } from '@/lib/5etools/parsers/classes'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getClassStaticFeatureSummaries } from '@/lib/pdf/classStaticFeatureSummaries'
import { projectClassLevelFeatures } from '@/pages/build/class/model/pageUtils'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature, DataSourceConfig } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const readLayer = (config: DataSourceConfig, directory: string, classOnly = false) =>
  new FiveEToolsDataLoader(config, {
    type: config.type,
    readJson: async (file) =>
      classOnly && file === 'class/index.json'
        ? { Cleric: 'class-cleric.json' }
        : JSON.parse(await readFile(resolve(directory, file), 'utf8')),
  }).loadAllData()

const reopen = (character: Character) =>
  characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
const apply = (
  character: Character,
  change: { characterPatch: Partial<Character>; provenanceUpdate: Character['provenance'] },
) => reopen({ ...character, ...change.characterPatch, provenance: change.provenanceUpdate })

const stacks = existsSync('data/class/class-cleric.json')
  ? ['bundled', 'partial', 'configured']
  : ['bundled']

test.skipIf(stacks.length === 1)(
  'Cleric sheets follow a moved source gain and malformed subclass schedules withhold grants',
  async () => {
    const document = JSON.parse(await readFile('data/class/class-cleric.json', 'utf8'))
    const classRoot = document.class.find(
      (row: { name: string; source: string }) => row.name === 'Cleric' && row.source === 'XPHB',
    )
    const feature = document.classFeature.find(
      (row: { name: string; source: string }) =>
        row.name === 'Sear Undead' && row.source === 'XPHB',
    )
    classRoot.classFeatures = classRoot.classFeatures.map((row: unknown) =>
      row === 'Sear Undead|Cleric|XPHB|5' ? 'Sear Undead|Cleric|XPHB|6' : row,
    )
    feature.level = 6
    const current = parseClassDocument(document)
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes: current.classes as Class5e[],
      classFeatures: current.classFeatures as ClassFeature[],
    })
    const names = (levels: number) =>
      getClassStaticFeatureSummaries(
        makeCharacterFixture({
          originSystem: '2024',
          allowedSources: ['XPHB'],
          classProgression: [{ name: 'Cleric', source: 'XPHB', levels }],
        }),
        catalogs,
        false,
      ).map((row) => row.compactText)
    expect(names(5)).not.toContain('Sear Undead')
    expect(names(6)).toContain('Sear Undead')

    const root = document.subclass.find(
      (row: { name: string; source: string }) =>
        row.name === 'Arcana Domain' && row.source === 'AU',
    )
    const entry = {
      name: 'Cleric',
      source: 'XPHB',
      levels: 17,
      subclass: 'Arcana Domain',
      subclassSource: 'AU',
    }
    const classGain = classRoot.classFeatures.find(
      (row: { classFeature?: string }) => row.classFeature === 'Cleric Subclass|Cleric|XPHB|3',
    )
    classGain.classFeature = 'Cleric Subclass|Cleric|XPHB|4'
    document.classFeature.find(
      (row: { name: string; source: string }) =>
        row.name === 'Cleric Subclass' && row.source === 'XPHB',
    ).level = 4
    root.subclassFeatures[0] = root.subclassFeatures[0].replace('|3|AU', '|4|AU')
    root.additionalSpells[0].known = { 4: root.additionalSpells[0].known[3] }
    for (const row of document.subclassFeature) {
      if (row.subclassShortName !== 'Arcana' || row.subclassSource !== 'AU' || row.level !== 3)
        continue
      row.level = 4
      for (const node of row.entries ?? []) {
        if (node?.type === 'refSubclassFeature' && typeof node.subclassFeature === 'string')
          node.subclassFeature = node.subclassFeature.replace('|3|AU', '|4|AU')
      }
    }
    const scagRoot = document.subclass.find(
      (row: { name: string; source: string; classSource: string }) =>
        row.name === 'Arcana Domain' && row.source === 'SCAG' && row.classSource === 'XPHB',
    )
    scagRoot.subclassFeatures[0] = scagRoot.subclassFeatures[0].replace(/\|3(?=\||$)/, '|4')
    document.subclassFeature.find(
      (row: { name: string; source: string; classSource: string }) =>
        row.name === 'Arcana Domain' && row.source === 'SCAG' && row.classSource === 'XPHB',
    ).level = 4
    const owner = (parseClasses(document) as Class5e[]).find(
      (row) => row.name === 'Cleric' && row.source === 'XPHB',
    )!
    const movedDomain = owner.subclasses?.find(
      (row) => row.name === 'Arcana Domain' && row.source === 'AU',
    )
    const cantripRule = clericDomainCantrips.find((row) => row.source === 'au')!
    if (!movedDomain) throw new Error('Missing moved Arcana Domain')
    expect(getClericDomainCantripSource(owner, movedDomain, cantripRule)).toMatchObject({ gain: 4 })
    const inherited = owner.subclasses?.find(
      (row) => row.name === 'Arcana Domain' && row.source === 'SCAG',
    )
    const inheritedRule = clericDomainCantrips.find(
      (row) => row.source === 'scag' && row.printing === 'xphb',
    )!
    if (!inherited) throw new Error('Missing moved inherited Arcana Domain')
    expect(getClericDomainCantripSource(owner, inherited, inheritedRule)).toMatchObject({ gain: 4 })
    const inheritedEntry = { ...entry, subclassSource: 'SCAG', levels: 4 }
    expect(getEarnedSubclassSpellGrants(owner, inheritedEntry, 3)).toEqual([])
    expect(
      getEarnedSubclassSpellGrants(owner, inheritedEntry)?.map((grant) => grant.level),
    ).toEqual([4, 4, 4, 4])
    root.additionalSpells[0].prepared['4evil'] = ['wish|xphb']
    const malformedGain = (parseClasses(document) as Class5e[]).find(
      (row) => row.name === 'Cleric' && row.source === 'XPHB',
    )
    const spells = getEarnedSubclassSpellGrants(malformedGain, entry) ?? []
    expect(spells.some((row) => getSpellReferenceKey(row.spellName) === 'wish|xphb')).toBe(false)
    expect(spells).not.toEqual([])
    root.additionalSpells[0].unsupported = true
    const unsupported = (parseClasses(document) as Class5e[]).find(
      (row) => row.name === 'Cleric' && row.source === 'XPHB',
    )
    const unsupportedDomain = unsupported?.subclasses?.find(
      (row) => row.name === 'Arcana Domain' && row.source === 'AU',
    )
    if (!unsupported || !unsupportedDomain) throw new Error('Missing test Arcana source')
    expect(
      getClericDomainCantripSource(unsupported, unsupportedDomain, cantripRule),
    ).toBeUndefined()
    for (const malformed of [{ foo: true }, [null]]) {
      root.additionalSpells = malformed
      const owner = (parseClasses(document) as Class5e[]).find(
        (row) => row.name === 'Cleric' && row.source === 'XPHB',
      )
      expect(getEarnedSubclassSpellGrants(owner, entry)).toEqual([])
    }
  },
  20_000,
)

test.each(
  stacks,
)('Cleric earned domain choices and prepared spells follow the current %s catalog', async (stack) => {
  const bundled = await readLayer(
    {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.1',
      isValid: true,
    },
    'resources/srd/core/data',
  )
  const additional =
    stack === 'bundled'
      ? undefined
      : await readLayer(
          {
            type: 'local',
            path: 'data',
            isValid: true,
            ...(stack === 'partial' && { availableResources: ['class/index.json'] }),
          },
          'data',
          stack === 'partial',
        )
  const data = composeGameDataLayers(additional ? [bundled, additional] : [bundled])
  if (stack === 'partial' && additional) {
    expect(additional.spells).toHaveLength(0)
    expect(
      findLayerDependencyIssues(data, additional).filter((issue) => issue.required !== false),
    ).toEqual([])
  }
  const raw = buildGameDataLookups(data)
  if (stack !== 'configured') {
    const proofs = getIncludedDomainSpellReprints(raw.spellsByKey)
    expect([...proofs.values()].filter((rank) => rank !== undefined)).toHaveLength(91)
    expect(proofs.get('fire shield|xphb')).toBe(4)
    expect(proofs.has('searing smite|xphb')).toBe(false)
  }
  useGameDataStore.setState({ gameData: { ...data, lookups: raw } })
  const allowedSources = data.sources
    .filter((row) => row.hasCharacterOptions !== false)
    .map((row) => row.abbreviation)
  if (stack === 'partial' && !allowedSources.includes('PSA')) allowedSources.push('PSA')
  for (const originSystem of ['2014', '2024'] as const) {
    const source = originSystem === '2014' ? 'PHB' : 'XPHB'
    const profileId = `class:Cleric|${source}`
    const hook = renderHook(() => useCharacterGameDataParams({ originSystem, allowedSources }))
    const current = hook.result.current
    hook.unmount()
    const catalogs = buildClassChoiceFeatureCatalogs(current)
    const classes = current.classes
    const cls = classes.find((row) => row.name === 'Cleric' && row.source === source)!
    const primary = {
      ...buildGameDataLookups(current),
      classChoiceClasses: classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const actor = (subclass: string, subclassSource: string, levels: number) =>
      makeCharacterFixture({
        originSystem,
        allowedSources,
        classProgression: [{ name: 'Cleric', source, subclass, subclassSource, levels }],
      })
    const calculate = (character: Character) =>
      createCharacterCalculationContext(character, primary, raw)
    const profile = (character: Character) =>
      calculate(character).character.spells.spellProfiles.find((row) => row.id === profileId)!
    const life = actor('Life Domain', source, 6)
    expect(getClassStaticFeatureSummaries(life, catalogs, false)).toContainEqual(
      expect.objectContaining({ compactText: 'Blessed Healer' }),
    )
    if (source === 'PHB') {
      expect(
        getClassStaticFeatureSummaries(actor('Life Domain', 'PHB', 1), catalogs, false).map(
          (row) => row.compactText,
        ),
      ).not.toContain('Channel Divinity: Turn Undead')
      for (const levels of [2, 6, 18]) {
        const rules = getClassStaticFeatureSummaries(
          actor('Life Domain', 'PHB', levels),
          catalogs,
          false,
        )
        expect(rules.filter((row) => row.compactText === 'Channel Divinity')).toHaveLength(1)
        expect(rules).toContainEqual(
          expect.objectContaining({
            compactText: 'Channel Divinity: Turn Undead',
            text: expect.stringContaining('censuring the undead'),
          }),
        )
      }
    }
    if (source === 'XPHB') {
      const levelOne = getClassStaticFeatureSummaries(
        actor('Life Domain', 'XPHB', 1),
        catalogs,
        false,
      )
      expect(levelOne.map((row) => row.compactText)).not.toContain('Divine Spark')
      expect(
        getClassStaticFeatureSummaries(actor('Life Domain', 'XPHB', 2), catalogs, false),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            compactText: 'Divine Spark',
            text: expect.stringContaining('Constitution saving throw'),
          }),
          expect.objectContaining({
            compactText: 'Turn Undead',
            text: expect.stringContaining('Incapacitated'),
          }),
        ]),
      )
    }
    if (stack === 'partial' && source === 'XPHB') {
      expect(profile(actor('Nature Domain', 'PHB', 20)).alwaysPreparedSpells).toHaveLength(9)
      const zeal = actor('Zeal Domain (PSA)', 'PSA', 20)
      const prepared = profile(zeal).alwaysPreparedSpells?.map((ref) => getSpellReferenceKey(ref))
      expect(prepared).toHaveLength(7)
      expect(prepared).toContain('fire shield|xphb')
      expect(prepared).not.toContain('searing smite|xphb')
    }
    if (stack !== 'configured') continue
    expect(
      getClassStaticFeatureSummaries(actor('Knowledge Domain (PSA)', 'PSA', 3), catalogs, false),
    ).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('proficiency bonus is doubled') }),
    )
    if (source === 'PHB') {
      const death = actor('Death Domain', 'DMG', 1)
      const slot = getManagedClassSpellSlots(death.classProgression[0], death, catalogs).find(
        (row) => row[1] === 'feature-cantrip',
      )!
      const context = calculate(death).classChoices.spellContext!
      const target = { name: 'Chill Touch', source: 'PHB' }
      const request = {
        slot,
        target,
        expected: null,
        expectedEmptyRevision: 0,
        policy: 'default',
      } as const
      const lifeEntry = {
        ...death.classProgression[0],
        subclass: 'Life Domain',
        subclassSource: 'PHB',
      }
      const switched = apply(
        death,
        applyClassProgressionUpdate(death, death.provenance, [lifeEntry]),
      )
      const switchedBack = apply(
        switched,
        applyClassProgressionUpdate(switched, switched.provenance, death.classProgression),
      )
      expect(switchedBack.managedClassSpellRevision).toBeGreaterThan(0)
      expect(() =>
        setManagedClassSpellChoiceCommand(switchedBack, switchedBack.provenance, request, context),
      ).toThrow()
      expect(getManagedClassSpellPool(death, slot, context).defaultReferences).toContain(
        'chill touch|phb',
      )
      const duplicate = current.spells.find(
        (row) => getSpellReferenceKey(row.name, row.source) === 'chill touch|phb',
      )!
      const ambiguous = {
        ...context,
        spellsByKey: buildSpellLookup([...current.spells, structuredClone(duplicate)]),
      }
      const pool = getManagedClassSpellPool(death, slot, ambiguous)
      expect(pool.defaultReferences).not.toContain('chill touch|phb')
      expect(pool.defaultReferences).toContain('spare the dying|phb')
      expect(() =>
        setManagedClassSpellChoiceCommand(death, death.provenance, request, ambiguous),
      ).toThrow(RangeError)
    }
    const arcana = actor('Arcana Domain', source === 'PHB' ? 'SCAG' : 'AU', 17)
    const slots = getManagedClassSpellSlots(arcana.classProgression[0], arcana, catalogs).filter(
      (slot) => slot[0][0] === 'subclass' && slot[1] === 'class-known',
    )
    expect(slots.map((slot) => slot[3])).toEqual([17, 17, 17, 17])
    let saved = arcana
    for (const [ordinal, slot] of slots.entries()) {
      const context = calculate(saved).classChoices.spellContext
      const pool = getManagedClassSpellPool(saved, slot, context)
      expect(pool.allowedLevels).toEqual([6 + ordinal])
      const spell = pool.spells[0]
      expect(spell.level).toBe(6 + ordinal)
      saved = apply(
        saved,
        setManagedClassSpellChoiceCommand(
          saved,
          saved.provenance,
          {
            slot,
            expected: null,
            expectedEmptyRevision: saved.managedClassSpellRevision ?? 0,
            policy: 'default',
            target: { name: spell.name, source: spell.source },
          },
          context,
        ),
      )
      expect(
        profile(saved).alwaysPreparedSpells?.map((ref) => getSpellReferenceKey(ref)),
      ).toContain(getSpellReferenceKey(spell.name, spell.source))
    }
    const revisedDocument = JSON.parse(await readFile('data/class/class-cleric.json', 'utf8'))
    const sourceArcana = revisedDocument.subclass.find(
      (row: { name: string; classSource: string; source: string }) =>
        row.name === 'Arcana Domain' &&
        row.classSource === source &&
        row.source === arcana.classProgression[0].subclassSource,
    )
    const prepared = sourceArcana.additionalSpells[0].prepared
    prepared['17'] = [...prepared['17']].reverse()
    const withSourceUpdate = () => {
      const parsed = (parseClasses(revisedDocument) as Class5e[]).find(
        (row) => row.name === 'Cleric' && row.source === source,
      )
      const updated = parsed?.subclasses?.find(
        (row) => row.name === 'Arcana Domain' && row.source === sourceArcana.source,
      )
      if (!updated) throw new Error('Missing updated Arcana source')
      const currentClasses = classes.map((row) =>
        row === cls
          ? {
              ...row,
              subclasses: row.subclasses?.map((domain) =>
                domain.name === updated.name && domain.source === updated.source ? updated : domain,
              ),
            }
          : row,
      )
      return { ...catalogs, classes: currentClasses }
    }
    const sourceSlots = (rules: typeof catalogs) =>
      getManagedClassSpellSlots(arcana.classProgression[0], arcana, rules).filter(
        getClericArcanaSpellRule,
      )
    const reordered = withSourceUpdate()
    expect(sourceSlots(reordered)).toEqual([...slots].reverse())
    const rankSix = prepared['17'].find((row: { choose?: string }) =>
      row.choose?.startsWith('level=6|'),
    )
    const originalFilter = rankSix.choose
    rankSix.choose = 'level=6|class=Wizard;Cleric'
    const widened = withSourceUpdate()
    expect(sourceSlots(widened)).toEqual([...slots].reverse())
    const widenedState = createCharacterCalculationContext(
      saved,
      {
        ...primary,
        classChoiceClasses: widened.classes,
        classChoiceFeatureCatalogs: widened,
      },
      raw,
    )
    expect(
      widenedState.managedClassSpellStatuses.find((row) => row.choice.slot[2] === slots[0][2])
        ?.active,
    ).toBe(true)
    rankSix.choose = originalFilter
    const beforeMastery = { ...arcana.classProgression[0], levels: 16 }
    const backedDown = apply(
      arcana,
      applyClassProgressionUpdate(arcana, arcana.provenance, [beforeMastery]),
    )
    const restoredLevel = apply(
      backedDown,
      applyClassProgressionUpdate(backedDown, backedDown.provenance, arcana.classProgression),
    )
    expect(restoredLevel.managedClassSpellRevision).toBeGreaterThan(
      arcana.managedClassSpellRevision ?? 0,
    )
    const cantripSlots = (rules: typeof catalogs) =>
      getManagedClassSpellSlots(arcana.classProgression[0], arcana, rules).filter(
        (row) => row[1] === 'feature-cantrip',
      )
    const originalCantripSlots = cantripSlots(catalogs)
    expect(originalCantripSlots).toHaveLength(2)
    const known = sourceArcana.additionalSpells[0].known[source === 'PHB' ? '1' : '3']
    const cantripChoice = (Array.isArray(known) ? known : known._)[0]
    cantripChoice.count = 3
    const changedCantripCatalogs = withSourceUpdate()
    const changedCantripSlots = cantripSlots(changedCantripCatalogs)
    expect(changedCantripSlots.slice(0, 2)).toEqual(originalCantripSlots)
    expect(changedCantripSlots[2][4]).toBe(2)
    const cantripContext = createCharacterCalculationContext(
      arcana,
      {
        ...primary,
        classChoiceClasses: changedCantripCatalogs.classes,
        classChoiceFeatureCatalogs: changedCantripCatalogs,
      },
      raw,
    ).classChoices.spellContext
    const cantripPool = getManagedClassSpellPool(arcana, changedCantripSlots[2], cantripContext)
    const cantrip = cantripPool.spells[0]
    expect(cantrip.level).toBe(0)
    const changedCantrip = apply(
      arcana,
      setManagedClassSpellChoiceCommand(
        arcana,
        arcana.provenance,
        {
          slot: changedCantripSlots[2],
          expected: null,
          expectedEmptyRevision: 0,
          policy: 'default',
          target: { name: cantrip.name, source: cantrip.source },
        },
        cantripContext,
      ),
    )
    expect(
      calculate(changedCantrip).managedClassSpellStatuses.find((row) => row.choice.slot[4] === 2)
        ?.active,
    ).toBe(false)
    prepared['17'].push({ choose: 'level=5|class=Wizard', count: 2 })
    const expanded = withSourceUpdate()
    const additionalSlots = sourceSlots(expanded).filter(
      (slot) => getClericArcanaSpellRule(slot)?.rank === 5,
    )
    expect(additionalSlots.map((slot) => slot[4])).toEqual([0, 1])
    expect(sourceSlots(expanded)).toEqual(expect.arrayContaining(slots))
    const expandedContext = createCharacterCalculationContext(
      saved,
      {
        ...primary,
        classChoiceClasses: expanded.classes,
        classChoiceFeatureCatalogs: expanded,
      },
      raw,
    ).classChoices.spellContext
    const firstNew = additionalSlots[0]
    const newPool = getManagedClassSpellPool(saved, firstNew, expandedContext)
    expect(newPool.allowedLevels).toEqual([5])
    const newSpell = newPool.spells[0]
    const added = apply(
      saved,
      setManagedClassSpellChoiceCommand(
        saved,
        saved.provenance,
        {
          slot: firstNew,
          expected: null,
          expectedEmptyRevision: saved.managedClassSpellRevision ?? 0,
          target: { name: newSpell.name, source: newSpell.source },
          policy: 'default',
        },
        expandedContext,
      ),
    )
    expect(
      calculate(added).managedClassSpellStatuses.find((row) => row.choice.slot[2] === firstNew[2])
        ?.active,
    ).toBe(false)
    prepared['17'].push({ choose: 'level=5|class=Druid' })
    expect(sourceSlots(withSourceUpdate())).toEqual([])
    if (source !== 'XPHB') continue
    for (const [domain, source, disabled, lastFeature] of [
      ['Arcana Domain', 'SCAG', 'AU', 'Arcane Mastery'],
      ['Knowledge Domain', 'PHB', 'FRHoF', 'Visions of the Past'],
      ['Grave Domain', 'XGE', 'RHW', 'Keeper of Souls'],
    ] as const) {
      const allowed = allowedSources.filter(
        (entry) => entry.toUpperCase() !== disabled.toUpperCase(),
      )
      const hook = renderHook(() =>
        useCharacterGameDataParams({ originSystem, allowedSources: allowed }),
      )
      const fallback = hook.result.current
      hook.unmount()
      const rules = buildClassChoiceFeatureCatalogs(fallback)
      const character = { ...actor(domain, source, 17), allowedSources: allowed }
      const current = createCharacterCalculationContext(
        character,
        {
          ...buildGameDataLookups(fallback),
          classChoiceClasses: fallback.classes,
          classChoiceFeatureCatalogs: rules,
        },
        raw,
      )
      const spells = current.character.spells.spellProfiles.find((row) => row.id === profileId)!
      expect(spells.alwaysPreparedSpells ?? [], `${domain} (${source})`).toHaveLength(10)
      expect(
        getClassStaticFeatureSummaries(character, rules, false).map((row) => row.compactText),
      ).toContain(lastFeature)
      if (source === 'XGE')
        expect(spells.cantrips.map((ref) => getSpellReferenceKey(ref))).toContain(
          'spare the dying|xphb',
        )
      if (source === 'SCAG') {
        const choices = getManagedClassSpellSlots(character.classProgression[0], character, rules)
        expect(choices.filter((row) => row[1] === 'feature-cantrip')).toHaveLength(2)
        expect(choices.flatMap((row) => getClericArcanaSpellRule(row)?.rank ?? [])).toEqual([
          6, 7, 8, 9,
        ])
      }
    }
    const studentChoice = (owner: Class5e, data: typeof catalogs) =>
      getCharacterClassChoices(
        owner,
        getSelectedSubclassData(owner, arcana.classProgression[0]),
        createOptionalClassFeatureActivity(arcana, data),
        data,
      ).find((row) => row.label === 'Student of Arcana skills')
    expect(studentChoice(cls, catalogs)).toBeDefined()
    const expandedCantripOwner = changedCantripCatalogs.classes.find(
      (row) => row.name === 'Cleric' && row.source === 'XPHB',
    )!
    expect(studentChoice(expandedCantripOwner, changedCantripCatalogs)).toBeDefined()
    const document = JSON.parse(await readFile('data/class/class-cleric.json', 'utf8'))
    const revised = document.class.find(
      (row: { name: string; source: string }) => row.name === 'Cleric' && row.source === 'XPHB',
    )
    revised.startingProficiencies.skills[0].choose.from[2] = 'survival'
    const parsed = (parseClasses(document) as Class5e[]).find(
      (row) => row.name === 'Cleric' && row.source === 'XPHB',
    )!
    const modified = { ...cls, startingProficiencies: parsed.startingProficiencies }
    const studentCatalogs = {
      ...catalogs,
      classes: classes.map((row) => (row === cls ? modified : row)),
    }
    const currentStudentChoice = studentChoice(modified, studentCatalogs)!
    const student = actor('Arcana Domain', 'AU', 3)
    const options = resolveClassChoiceOptions(
      currentStudentChoice,
      createClassChoiceCatalogs(studentCatalogs),
      [],
      3,
      student,
    )
      .filter(isClassChoiceOptionEligible)
      .map((row) => row.reference.name.toLowerCase())
    expect(options).toContain('arcana')
    expect(options).toContain('survival')
    expect(options).not.toContain('medicine')
    const updatedStudent = apply(
      student,
      applyClassChoiceSelectionWithGrantsCommand(
        student,
        student.provenance,
        currentStudentChoice,
        [getProficiencyOption('skills', 'Survival')],
        { classes: studentCatalogs.classes, catalogs: studentCatalogs },
      ),
    )
    const updatedStudentCalculation = createCharacterCalculationContext(
      updatedStudent,
      {
        ...primary,
        classChoiceClasses: studentCatalogs.classes,
        classChoiceFeatureCatalogs: studentCatalogs,
      },
      raw,
    )
    expect(updatedStudentCalculation.character.proficiencies.skills).toContain('survival')
    expect(calculate(updatedStudent).character.proficiencies.skills).not.toContain('survival')
    expect(studentChoice(cls, catalogs)).toBeDefined()
    const nature = (level: number) => actor('Nature Domain', 'PHB', level)
    const barkskin = raw.spellsByKey['Barkskin|PHB']
    for (const reprintedAs of [undefined, ['Wrong Spell|XPHB']]) {
      const modifiedRaw = {
        ...raw,
        spellsByKey: { ...raw.spellsByKey, 'Barkskin|PHB': { ...barkskin, reprintedAs } },
      }
      const prepared = createCharacterCalculationContext(nature(3), primary, modifiedRaw)
        .character.spells.spellProfiles.find((row) => row.id === profileId)
        ?.alwaysPreparedSpells?.map((ref) => getSpellReferenceKey(ref))
      expect(prepared).not.toContain('barkskin|xphb')
      expect(prepared).toContain('spike growth|xphb')
    }
    expect(profile(nature(2)).alwaysPreparedSpells ?? []).toEqual([])
    expect(
      profile(nature(3))
        .alwaysPreparedSpells?.map((ref) => getSpellReferenceKey(ref))
        .sort(),
    ).toEqual([
      'animal friendship|xphb',
      'barkskin|xphb',
      'speak with animals|xphb',
      'spike growth|xphb',
    ])
    const psa = actor('Knowledge Domain (PSA)', 'PSA', 6)
    const domain = getSelectedSubclassData(cls, psa.classProgression[0])
    expect(projectClassLevelFeatures(new Map(), cls, domain, domain, [], 6).get(6)).toContainEqual(
      expect.objectContaining({
        name: 'Channel Divinity: Read Thoughts',
        entries: expect.any(Array),
      }),
    )
    const knowledge = (level: number) => actor('Knowledge Domain', 'FRHoF', level)
    expect(calculate(knowledge(5)).character.proficiencies.savingThrows).not.toContain(
      'intelligence',
    )
    expect(reopen(calculate(knowledge(6)).character).proficiencies.savingThrows).toContain(
      'intelligence',
    )
    const independent = knowledge(6)
    independent.proficiencies.savingThrows = ['intelligence', 'wisdom', 'charisma']
    const choice = getCharacterClassChoices(
      cls,
      getSelectedSubclassData(cls, independent.classProgression[0]),
      createOptionalClassFeatureActivity(independent, catalogs),
      catalogs,
    ).find((row) => row.proficiencyDomain === 'savingThrows')!
    expect(choice.level).toBe(6)
    const answered = apply(
      independent,
      setHistoricalProficiencySetupCommand(
        independent,
        independent.provenance,
        choice,
        true,
        catalogs,
      ),
    )
    expect(
      resolveClassChoiceOptions(choice, createClassChoiceCatalogs(catalogs), [], 6, answered)
        .filter(isClassChoiceOptionEligible)
        .map(({ reference }) => reference.name),
    ).toEqual(['Constitution', 'Dexterity', 'Strength'])
    const chosen = apply(
      answered,
      applyClassChoiceSelectionWithGrantsCommand(
        answered,
        answered.provenance,
        choice,
        [getProficiencyOption('savingThrows', 'Dexterity')],
        { classes, catalogs },
      ),
    )
    expect(chosen.provenance.proficiencies.savingThrows.dexterity).toMatchObject([
      { sourceName: 'Knowledge Domain', sourceRef: 'FRHoF', grantType: 'choice' },
    ])
  }
}, 30_000)
