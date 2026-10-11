import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { deriveRulesTextActions } from '@/lib/calculations/actions'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import {
  createCharacterSheetViewModel,
  generateFilledCharacterSheetPdf,
} from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { isHintDismissed, resetAllHints } from '@/lib/storage/hints'
import { CharacterSheetPage } from '@/pages/CharacterSheetPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature, Creature5e, Feat5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/components/PdfCanvasPreview', () => ({
  PdfCanvasPreview: () => <div>PDF preview</div>,
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: ({ enabled }: { enabled: boolean }) =>
    enabled ? { reference: document.body, gap: 12, placement: 'bottom' } : null,
}))

vi.mock('@/lib/pdf/characterSheetPdf', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pdf/characterSheetPdf')>()
  return {
    ...original,
    createCharacterSheetViewModel: vi.fn(original.createCharacterSheetViewModel),
    generateFilledCharacterSheetPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
  }
})

vi.mock('@/lib/pdf/exportPreflight', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/pdf/exportPreflight')>()
  return { ...original, getPdfExportPreflight: vi.fn(original.getPdfExportPreflight) }
})

describe('CharacterSheetPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <CharacterSheetPage templateId="2014" />
      </MemoryRouter>,
    )
  }

  function equipLongsword() {
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'blade',
          name: 'Longsword',
          source: 'PHB',
          type: 'M',
          dmg1: '1d8',
          dmgType: 'S',
          quantity: 1,
          equipped: true,
          weight: 3,
        },
      ],
    })
    useCharacterStore.setState({ activeCharacter: character })
  }

  beforeEach(() => {
    useGameDataStore.setState({ gameData: null })
    const hintStorage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => hintStorage.get(key) ?? null,
      setItem: (key: string, value: string) => hintStorage.set(key, value),
      removeItem: (key: string) => hintStorage.delete(key),
      key: (index: number) => [...hintStorage.keys()][index] ?? null,
      get length() {
        return hintStorage.size
      },
    })
    const character = makeCharacterFixture()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  test('labels outstanding sheet choices as items to review', () => {
    const character = makeCharacterFixture({ name: '' })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage()
    expect(screen.getByText(/^\d+ to review$/)).toBeTruthy()
  })

  test('uses the flat workspace layout with full-width export controls', () => {
    const { container } = renderPage()

    const workspacePage = container.querySelector('[data-slot="workspace-page"]')
    const workspaceBody = container.querySelector('[data-slot="workspace-body"]')
    const header = screen.getByRole('banner')

    expect(workspacePage?.firstElementChild).toBe(header)
    expect(header.nextElementSibling).toBe(workspaceBody)
    expect(workspacePage?.className).not.toContain('p-3')
    expect(workspaceBody?.className).not.toContain('rounded-lg')
    expect(workspaceBody?.className).not.toContain('border-border')
    expect(workspaceBody?.className).not.toContain('bg-workspace-pane')
    expect(workspaceBody?.className).not.toContain('bg-workspace-detail')
    expect(container.querySelector('[data-slot="workspace-toolbar"]')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Character sheet controls' })).toBeTruthy()
    expect(screen.queryByText('2014 Character Sheet')).toBeNull()
    expect(screen.getByText('MorePurpleMoreBetter (2014)')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'PDF attribution' }).getAttribute('href')).toBe(
      '/settings?section=about#character-sheet-pdf-2014-custom',
    )
    expect((screen.getByRole('button', { name: 'Regenerate' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy()
    expect(within(header).queryByRole('button', { name: 'Zoom in' })).toBeNull()
    expect(
      within(screen.getByRole('contentinfo')).getByRole('button', { name: 'Zoom in' }),
    ).toBeTruthy()
    expect(screen.queryByText('Not generated')).toBeNull()
  })

  test('limits feat and creature export lookups to the character sources', () => {
    const character = useCharacterStore.getState().activeCharacter!
    useCharacterStore.setState({ activeCharacter: { ...character, allowedSources: ['PHB', 'MM'] } })
    const feats = [
      { name: 'Alert', source: 'PHB' },
      { name: 'Alert', source: 'XPHB' },
    ] as Feat5e[]
    const creatures = [
      { name: 'Wolf', source: 'MM' },
      { name: 'Wolf', source: 'TCE' },
    ] as Creature5e[]
    const gameData = makeGameDataFixture({ feats, creatures })
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })

    renderPage()
    const lookups = vi.mocked(createCharacterSheetViewModel).mock.lastCall?.[1]
    expect(Object.keys(lookups?.featsByKey ?? {})).toEqual(['Alert|PHB'])
    expect(Object.keys(lookups?.creaturesByKey ?? {})).toEqual(['Wolf|MM'])
  })

  const sharedFeature: ClassFeature = {
    name: 'Shared',
    source: 'PHB',
    className: 'Wizard',
    classSource: 'PHB',
    level: 1,
    entries: ['As a bonus action, use the catalog maneuver.'],
  }

  function installFeatureCatalog(kind: 'class' | 'optional', ambiguous = false) {
    const character = makeCharacterFixture({
      classProgression:
        kind === 'class' && !ambiguous ? [{ name: 'Wizard', source: 'PHB', levels: 1 }] : [],
      features: [
        {
          id: 'saved-shared',
          name: kind === 'optional' || ambiguous ? 'Shared' : 'shared',
          source: kind === 'optional' || ambiguous ? 'PHB' : 'phb',
          description: 'As a reaction, use the saved maneuver.',
        },
      ],
    })
    const gameData = makeGameDataFixture({
      classes: [
        makeClassFixture({
          classFeatureRefs: [
            {
              ref: 'Shared|Wizard||1',
              name: 'Shared',
              source: 'PHB',
              className: 'Wizard',
              classSource: 'PHB',
              level: 1,
              feature: sharedFeature,
            },
          ],
        }),
      ],
      classFeatures:
        kind === 'optional'
          ? []
          : ambiguous
            ? [sharedFeature, { ...sharedFeature, className: 'Bard' }]
            : [sharedFeature],
      optionalfeatures: [{ ...sharedFeature, entries: ['As an action, use optional rules.'] }],
    })
    gameData.lookups = buildGameDataLookups(gameData)
    useCharacterStore.setState({ activeCharacter: character })
    useGameDataStore.setState({ gameData })
    return { character, gameData }
  }

  function exportedSavedActions(id = 'feature:saved-shared') {
    return vi
      .mocked(createCharacterSheetViewModel)
      .mock.results.slice(-1)[0]
      ?.value.actions.filter((action: { id: string }) => action.id === id)
  }

  test('Actions and PDF resolve a chosen subclass target across the complete available catalog', () => {
    const classes = parseClasses({
      class: [
        { name: 'Wizard', source: 'PHB', classFeatures: ['Training|Wizard||3'] },
        { name: 'Bard', source: 'PHB', classFeatures: [] },
      ],
      classFeature: [
        {
          name: 'Training',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 3,
          entries: [
            {
              type: 'options',
              count: 1,
              entries: [{ type: 'refSubclassFeature', subclassFeature: 'Beacon|Bard||School||3' }],
            },
          ],
        },
      ],
      subclass: [
        {
          name: 'First School',
          shortName: 'School',
          source: 'PHB',
          className: 'Bard',
          classSource: 'PHB',
          subclassFeatures: ['Beacon|Bard||School||3'],
        },
      ],
      subclassFeature: [
        {
          name: 'Beacon',
          source: 'PHB',
          className: 'Bard',
          classSource: 'PHB',
          subclassShortName: 'School',
          subclassSource: 'PHB',
          level: 3,
          entries: ['As an action, light a beacon.'],
        },
      ],
    }) as Class5e[]
    const wizard = classes.find((entry) => entry.name === 'Wizard')!
    const bard = classes.find((entry) => entry.name === 'Bard')!
    const choice = wizard.normalizedRules!.choices[0]
    const draft = createEmptyCharacter({
      name: 'Current cross-parent choice',
      allowedSources: ['PHB'],
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
    })
    const transition = applyClassChoiceSelectionWithGrantsCommand(
      draft,
      draft.provenance!,
      choice,
      choice.options,
    )
    const character = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...draft,
          ...transition.characterPatch,
          provenance: transition.provenanceUpdate,
        }),
      ),
    )
    const install = (available: Class5e[]) => {
      const gameData = makeGameDataFixture({ classes: available })
      gameData.lookups = buildGameDataLookups(gameData)
      act(() => {
        useGameDataStore.setState({ gameData })
        useCharacterStore.setState({ activeCharacter: character })
      })
      return {
        ...gameData.lookups,
        classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs({
          classes: DataFilter.filterClasses(available, { sources: character.allowedSources }),
          classFeatures: [],
        }),
      }
    }
    const complete = install(classes)
    const { result } = renderHook(() => useCharacterActions(character))
    const initial = result.current
    expect(initial).toMatchObject([
      {
        kind: 'action',
        source: { kind: 'class', name: 'Beacon' },
        description: 'As an action, light a beacon.',
      },
    ])
    expect(createCharacterSheetViewModel(character, complete).actions).toEqual(initial)
    expect(
      deriveRulesTextActions(character, undefined, {
        classes: [wizard],
        classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs({
          classes: [],
          classFeatures: [],
        }),
      }),
    ).toEqual([])
    const competingWizard = {
      ...structuredClone(wizard),
      subclasses: [
        { ...structuredClone(bard.subclasses![0]), name: 'Second School', className: 'Wizard' },
      ],
    }
    for (const available of [[competingWizard, bard], [bard, competingWizard], [wizard]]) {
      const lookups = install(available)
      expect(result.current).toEqual([])
      expect(createCharacterSheetViewModel(character, lookups).actions).toEqual([])
    }
    const restored = install(classes)
    expect(result.current).toEqual(initial)
    expect(createCharacterSheetViewModel(character, restored).actions).toEqual(initial)
    const unavailableCompetitor = {
      ...structuredClone(competingWizard),
      subclasses: competingWizard.subclasses.map((subclass) => ({ ...subclass, source: 'TCE' })),
    }
    const filtered = install([unavailableCompetitor, bard])
    expect(result.current).toEqual(initial)
    expect(createCharacterSheetViewModel(character, filtered).actions).toEqual(initial)
    renderPage()
    expect(
      vi.mocked(createCharacterSheetViewModel).mock.results.slice(-1)[0]?.value.actions,
    ).toEqual(initial)
    const explicitEmpty = {
      ...complete,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs({
        classes: [],
        classFeatures: [],
      }),
    }
    expect(createCharacterSheetViewModel(character, explicitEmpty).actions).toEqual([])
  })

  test('Actions and PDF honor current reprint suppression across source casing', () => {
    const variantRules = {
      optionalClassFeatures: false,
      averageHitPoints: false,
      anyRaceSubclasses: false,
      ignoreEquipRestrictions: false,
    }
    const old = {
      name: 'Signal',
      source: 'phb',
      className: 'Bard',
      classSource: 'PHB',
      level: 1,
      entries: ['As an action, use the old signal.'],
      reprintedAs: ['Signal|Bard|TCE|1|TCE'],
    }
    const newer = {
      ...old,
      source: 'TCE',
      entries: ['As a reaction, use the newer signal.'],
      reprintedAs: [],
    }
    const root = {
      name: 'Training',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'PHB',
      level: 1,
      entries: [
        {
          type: 'options',
          count: 1,
          entries: [{ type: 'refClassFeature', classFeature: 'Signal|Bard||1' }],
        },
      ],
    }
    const classes = parseClasses({
      class: [{ name: 'Wizard', source: 'PHB', classFeatures: ['Training|Wizard||1'] }],
      classFeature: [root, old, newer],
    }) as Class5e[]
    const draft = createEmptyCharacter({
      name: 'Current reprint choice',
      allowedSources: ['PHB', 'TCE'],
      variantRules,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    const choice = classes[0].normalizedRules!.choices[0]
    const granted = applyClassChoiceSelectionWithGrantsCommand(
      draft,
      draft.provenance!,
      choice,
      choice.options,
    )
    let character = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...draft,
          ...granted.characterPatch,
          provenance: granted.provenanceUpdate,
        }),
      ),
    )
    const originalSelection = structuredClone(character.classChoiceSelections)
    const data = makeGameDataFixture({ classes, classFeatures: [root, old, newer] })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    useCharacterStore.setState({ activeCharacter: character })
    const hook = renderHook(() => ({
      actions: useCharacterActions(character),
      filtered: useFilteredGameData(),
    }))
    renderPage()
    const original = hook.result.current.actions
    expect(original).toHaveLength(1)
    const observe = (preferNewerPrintings: boolean, allowedSources = ['PHB', 'TCE']) => {
      act(() => {
        character = {
          ...character,
          allowedSources,
          variantRules: { ...variantRules, preferNewerPrintings },
        }
        useCharacterStore.setState({ activeCharacter: character })
      })
      hook.rerender()
      expect(
        vi.mocked(createCharacterSheetViewModel).mock.results.slice(-1)[0]?.value.actions,
      ).toEqual(hook.result.current.actions)
      expect(character.classChoiceSelections).toEqual(originalSelection)
      return hook.result.current.actions
    }
    expect(observe(true)).toEqual([])
    expect(
      hook.result.current.filtered.classFeatures.filter((feature) => feature.name === 'Signal'),
    ).toEqual([newer])
    expect(observe(false)).toEqual(original)
    expect(observe(true, ['PHB'])).toEqual(original)
    expect(observe(true)).toEqual([])
    expect(observe(false)).toEqual(original)
  })

  test.each([
    'TCE',
    '',
  ])('Actions and PDF suppress a disabled qualified target with source %j while retaining standalone text', (source) => {
    const signal: ClassFeature = {
      name: 'Signal',
      source,
      className: 'Bard',
      classSource: source ? 'PHB' : 'TCE',
      level: 1,
      entries: ['As a bonus action, send the exact signal.'],
    }
    const classes = parseClasses({
      class: [{ name: 'Wizard', source: 'PHB', classFeatures: ['Training|Wizard||1'] }],
      classFeature: [
        {
          name: 'Training',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          entries: [
            {
              type: 'options',
              count: 1,
              entries: [
                {
                  type: 'refClassFeature',
                  classFeature: `Signal|Bard|${signal.classSource}|1|${source}`,
                },
              ],
            },
          ],
        },
        signal,
      ],
    }) as Class5e[]
    const draft = createEmptyCharacter({
      name: 'Current filtered target',
      allowedSources: ['PHB', 'TCE'],
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
      features: [
        { id: 'saved-signal', name: 'Signal', source: 'TCE', description: 'Saved signal.' },
      ],
    })
    const choice = classes[0].normalizedRules!.choices[0]
    const transition = applyClassChoiceSelectionWithGrantsCommand(
      draft,
      draft.provenance!,
      choice,
      choice.options,
    )
    let character = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...draft,
          ...transition.characterPatch,
          provenance: transition.provenanceUpdate,
        }),
      ),
    )
    const originalSelection = structuredClone(character.classChoiceSelections)
    const install = (allowedSources: string[], targets: ClassFeature[] = [signal]) => {
      character = { ...character, allowedSources }
      const gameData = makeGameDataFixture({ classes, classFeatures: targets })
      gameData.lookups = buildGameDataLookups(gameData)
      act(() => {
        useGameDataStore.setState({ gameData })
        useCharacterStore.setState({ activeCharacter: character })
      })
    }
    install(['PHB', 'TCE'])
    const hook = renderHook(() => useCharacterActions(character))
    renderPage()
    const original = hook.result.current
    expect(original).toHaveLength(2)
    const chosen = original.find((action) => action.id !== 'feature:saved-signal')!
    expect(chosen.description).toContain('exact signal')
    const rawData = makeGameDataFixture({ classes, classFeatures: [signal] })
    rawData.lookups = buildGameDataLookups(rawData)
    expect(
      createCharacterSheetViewModel(character, rawData.lookups).actions.some(
        (action) => action.id === chosen.id,
      ),
    ).toBe(false)
    const empty = buildClassChoiceFeatureCatalogs({ classes, classFeatures: [] })
    expect(
      createCharacterSheetViewModel(character, {
        ...rawData.lookups,
        classChoiceFeatureCatalogs: empty,
      }).actions.some((action) => action.id === chosen.id),
    ).toBe(false)
    const observe = () => {
      hook.rerender()
      const exported = vi.mocked(createCharacterSheetViewModel).mock.results.slice(-1)[0]
        ?.value.actions
      expect(exported).toEqual(hook.result.current)
      expect(character.classChoiceSelections).toEqual(originalSelection)
      return hook.result.current
    }
    const competing = { ...signal, source: 'PHB', entries: ['As an action, use another printing.'] }
    for (const targets of [
      [signal, competing],
      [competing, signal],
    ]) {
      install(['PHB'], targets)
      expect(observe()).toEqual(original.filter((action) => action.id === 'feature:saved-signal'))
      install(['PHB', 'TCE'], targets)
      expect(observe()).toEqual(original)
    }
    install(['PHB', 'TCE'], [competing])
    expect(observe().some((action) => action.id === chosen.id)).toBe(false)
    install(['PHB', 'TCE'])
    expect(observe()).toEqual(original)
  })

  test.each([
    'class',
    'optional',
  ] as const)('exports the same uniquely resolved %s feature action as Actions', (kind) => {
    const { character } = installFeatureCatalog(kind)
    const { result } = renderHook(() => useCharacterActions(character))
    const expected = kind === 'class' ? 'bonus-action' : 'action'
    const id = 'feature:saved-shared'
    const actions = result.current.filter((action) => action.id === id)
    expect(actions).toHaveLength(1)
    expect(actions[0]?.kind).toBe(expected)
    expect(actions[0]?.description).toContain(
      kind === 'class' ? 'catalog maneuver' : 'optional rules',
    )
    if (kind === 'class') {
      expect(
        result.current.filter((action) => action.name.toLowerCase() === 'shared'),
      ).toHaveLength(2)
    }

    renderPage()
    expect(exportedSavedActions(id)).toEqual(actions)
  })

  test('preserves ambiguous saved class rules in both Actions and PDF without optional fallback', () => {
    const { character } = installFeatureCatalog('class', true)
    const { result } = renderHook(() => useCharacterActions(character))
    const actions = result.current.filter((action) => action.id === 'feature:saved-shared')
    expect(actions).toHaveLength(1)
    expect(actions[0]?.kind).toBe('reaction')
    expect(actions[0]?.description).toContain('saved maneuver')

    renderPage()
    expect(exportedSavedActions()).toEqual(actions)
  })

  test.each([
    'class',
    'optional',
  ] as const)('refreshes exported actions when only the %s feature lookup changes', (kind) => {
    const { character, gameData } = installFeatureCatalog(kind)
    const { result } = renderHook(() => useCharacterActions(character))
    renderPage()
    const id = 'feature:saved-shared'
    expect(result.current.find((action) => action.id === id)?.kind).toBe(
      kind === 'class' ? 'bonus-action' : 'action',
    )
    const key = kind === 'class' ? 'classFeaturesByKey' : 'optionalFeaturesByKey'
    const lookup = gameData.lookups![key]
    const updatedLookup = Object.fromEntries(
      Object.entries(lookup).map(([identity, feature]) => [
        identity,
        { ...(feature as ClassFeature), entries: ['As a reaction, use refreshed catalog rules.'] },
      ]),
    )
    act(() => {
      useGameDataStore.setState({
        gameData: { ...gameData, lookups: { ...gameData.lookups!, [key]: updatedLookup } },
      })
    })

    const actions = result.current.filter((action) => action.id === id)
    expect(actions).toHaveLength(1)
    expect(actions[0]?.kind).toBe('reaction')
    expect(actions[0]?.description).toContain('refreshed catalog rules')
    expect(exportedSavedActions(id)).toEqual(actions)
  })

  test('runs an export preflight before downloading a sheet', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))

    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('Before you download')).toBeTruthy()
    const summary = screen.getByText(/Character choices to review/)
    expect(summary.closest('details')?.open).toBe(false)
    await user.click(summary)
    expect(summary.closest('details')?.open).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Go Back' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('dismisses the Optional Pages hint when the menu is opened and remembers it across visits', async () => {
    const user = userEvent.setup()
    const first = renderPage()
    expect(screen.getByRole('button', { name: 'Dismiss PDF options hint' })).toBeTruthy()
    screen.getByRole('button', { name: 'Optional Pages' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('button', { name: 'Dismiss PDF options hint' })).toBeNull()
    expect(isHintDismissed('character-sheet-options-v2')).toBe(true)
    await user.keyboard('{Escape}')
    first.unmount()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Dismiss PDF options hint' })).toBeNull()
    act(() => resetAllHints())
    expect(screen.getByRole('button', { name: 'Dismiss PDF options hint' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Dismiss PDF options hint' }))
    expect(isHintDismissed('character-sheet-options-v2')).toBe(true)
  })

  test.each([false, true])('downloads directly with fit-only warnings: %s', async (hasFitIssue) => {
    const result = {
      issues: hasFitIssue
        ? [
            {
              id: 'capacity:equipment',
              category: 'truncation' as const,
              severity: 'warning' as const,
              title: 'Equipment left out of this PDF',
              detail: 'Extra equipment exceeds the sheet.',
            },
          ]
        : [],
      warningCount: hasFitIssue ? 1 : 0,
      blockingCount: 0,
    }
    vi.mocked(getPdfExportPreflight).mockReturnValueOnce(result).mockReturnValueOnce(result)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })

  test('changing optional pages invalidates the preview and passes choices to export', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Optional Pages' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Companion page' }).getAttribute('data-state'),
    ).toBe('unchecked')
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Notes page' }).getAttribute('data-state'),
    ).toBe('checked')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Optional Pages' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Notes page' }))
    expect(screen.getByRole('menu', { name: 'Optional Pages' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Optional Pages' }))
    expect(screen.queryByText('PDF preview')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    expect(vi.mocked(generateFilledCharacterSheetPdf).mock.calls.slice(-1)[0]?.[3]?.pages).toEqual({
      notes: false,
    })
  })

  test('keeps readiness warnings but excludes fitting warnings from download confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(generateFilledCharacterSheetPdf).mockImplementationOnce(
      (_vm, _bytes, _id, options) => {
        options?.onTextTruncated?.('Text_89')
        return Promise.resolve(new Uint8Array([1, 2, 3]))
      },
    )
    render(
      <MemoryRouter>
        <CharacterSheetPage templateId="2024-official" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Optional Pages' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText(/Character choices to review/)).toBeTruthy()
    expect(screen.queryByText('Content that may not fit')).toBeNull()
    expect(screen.queryByText('Backstory was shortened on this sheet')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Go Back' }))
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(screen.queryByText('Backstory was shortened on this sheet')).toBeNull()
  })

  test('does not enable notes for spell overflow when spell pages are excluded', async () => {
    const user = userEvent.setup()
    const character = makeCharacterFixture()
    character.spells.spellProfiles[1].spellsKnown = ['Shield|PHB']
    useCharacterStore.setState({ activeCharacter: character })
    localStorage.setItem(
      'tb:sheet-export-preferences:v1',
      JSON.stringify({
        [`${character.id}:2014-official`]: {
          pages: { spells: false },
          content: { spells: [] },
          text: { overflow: 'notes' },
        },
      }),
    )
    render(
      <MemoryRouter>
        <CharacterSheetPage templateId="2014-official" />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Optional Pages' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Notes page' }).getAttribute('data-state'),
    ).toBe('unchecked')
  })

  test('changing content choices invalidates the preview without changing equipment', async () => {
    const user = userEvent.setup()
    equipLongsword()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    expect(screen.queryByRole('checkbox', { name: /Longsword/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    await user.click(
      within(screen.getByRole('region', { name: 'Attacks' })).getByRole('checkbox', {
        name: /Longsword/,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('PDF preview')).toBeNull()
    expect(useCharacterStore.getState().activeCharacter?.equipment[0].equipped).toBe(true)
  })

  test('remembers content choices across visits and restores automatic attacks', async () => {
    const user = userEvent.setup()
    equipLongsword()
    const first = renderPage()
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    await user.click(
      within(screen.getByRole('region', { name: 'Attacks' })).getByRole('checkbox', {
        name: /Longsword/,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Done' }))
    first.unmount()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    expect(
      within(screen.getByRole('region', { name: 'Attacks' }))
        .getByRole('checkbox', { name: /Longsword/ })
        .getAttribute('aria-checked'),
    ).toBe('false')
    await user.click(screen.getByRole('button', { name: /^Inventory/ }))
    expect(screen.queryByRole('region', { name: 'Attacks' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Inventory' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^Attacks/ }))
    await user.click(screen.getByRole('button', { name: 'Automatic attacks' }))
    expect(
      within(screen.getByRole('region', { name: 'Attacks' }))
        .getByRole('checkbox', { name: /Longsword/ })
        .getAttribute('aria-checked'),
    ).toBe('true')
  }, 15_000)

  test('remembers description settings and invalidates the preview without changing the character', async () => {
    const user = userEvent.setup()
    const before = useCharacterStore.getState().activeCharacter
    const first = renderPage()
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    screen.getByRole('combobox', { name: 'Rules descriptions' }).focus()
    await user.keyboard('{Enter}{End}{Enter}')
    expect(screen.getByRole('combobox', { name: 'Long text & extra entries' }).textContent).toBe(
      'Shorten with ellipsis',
    )
    screen.getByRole('combobox', { name: 'Long text & extra entries' }).focus()
    await user.keyboard('{Enter}{End}{Enter}')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('PDF preview')).toBeNull()
    first.unmount()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Customize PDF' }))
    expect(screen.getByRole('combobox', { name: 'Rules descriptions' }).textContent).toBe(
      'Names only',
    )
    expect(screen.getByRole('combobox', { name: 'Long text & extra entries' }).textContent).toBe(
      'Continue in notes',
    )
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Generate Preview' }))
    await waitFor(() => expect(screen.getByText('PDF preview')).toBeTruthy())
    expect(vi.mocked(generateFilledCharacterSheetPdf).mock.calls.slice(-1)[0]?.[3]?.text).toEqual({
      descriptions: 'names',
      overflow: 'notes',
    })
    expect(useCharacterStore.getState().activeCharacter).toBe(before)
  })
})
