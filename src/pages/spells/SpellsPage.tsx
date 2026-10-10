import { MagicWand } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AnchoredHint,
  WorkspaceBody,
  WorkspaceDetailContent,
  WorkspacePage,
  WorkspacePaneHeader,
} from '@/components/workspace'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'
import {
  getNativeExpandedSpellReferences,
  getNativeRacialSpellOwners,
} from '@/lib/calculations/nativeRacialSpells'
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
  parseSpellReference,
  resolveSpellReferenceFromMap,
} from '@/lib/calculations/spellIdentity'
import { isFixedProfileSpell } from '@/lib/calculations/spellOwnership'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
import {
  SPECIAL_SPELL_PROFILE_ID,
  toClassProfileId,
} from '@/lib/calculations/spellProfiles.constants'
import { formatSpellDisplayName } from '@/lib/calculations/spellUtils'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  findFocusedProvenanceChoice,
  getReadinessFocus,
  isSpellProfileReadinessFocus,
} from '@/lib/navigation/readinessFocus'
import type { SourceRow } from '@/lib/provenance/types'
import { buildRecursiveLookup, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { SpellcastingDetailsCard } from '@/pages/spells/components/SpellcastingDetailsCard'
import { SpellNameTooltip } from '@/pages/spells/components/SpellNameTooltip'
import {
  type PreparedCasterSpellItem,
  type SpellListItem,
  SpellProfileManager,
} from '@/pages/spells/components/SpellProfileManager'
import { useCharacterStore } from '@/store/characterStore'
import type { Spell5e } from '@/types/5etools'
import { NoCharCard } from '../_shared'
import { NativeRacialSpellControls } from './components/NativeRacialSpellControls'

const SPELLS_PREPARE_SELECTOR = '[data-spell-prepare-toggle="true"]'
const SPELLS_HINT_WIDTH = 300

type ClassSpellView = `class:${string}`
type SpellView = 'all' | 'racial' | 'bonus' | ClassSpellView

export function SpellsPage() {
  const [searchParams] = useSearchParams()
  const character = useCharacterStore((s) => s.activeCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const {
    spells,
    items,
    itemsBase,
    feats,
    races,
    classes,
    backgrounds,
    optionalfeatures,
    actions,
    conditions,
    deities,
    skills,
    senses,
    variantrules,
    languages,
    classFeatures,
    trapHazards,
    rewards,
  } = useFilteredGameData()
  const {
    spellProfiles,
    spellProvenance: ledger,
    spellcastingDetails,
    racialSpellcastingDetails,
    sharedSlots,
    pactSlots,
    isSpellcaster,
    spellcastingDetailByProfileId,
  } = useSpellSlots()
  const { getSourcesRowsBySection } = useProvenanceRows({ ledger })
  const {
    removeSpellFromProfile,
    setProfileSpells,
    togglePrepared,
    setRacialSpellChoice,
    setRacialSpellSuite,
    setRacialCastingAbility,
  } = useSpellProfileMutations(spellProfiles, spellcastingDetailByProfileId)

  const [racialChoiceModalOpen, setRacialChoiceModalOpen] = useState(false)
  const [bonusSpellModalOpen, setBonusSpellModalOpen] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [selectedSpellView, setSelectedSpellView] = useState<SpellView>('all')
  const [activeRacialChoice, setActiveRacialChoice] = useState<{
    profileId: string
    choiceId: string
    count: number
    isCantrip: boolean
    filter?: { level: number; classes: string[] }
    pool?: string[]
    selected: string[]
  } | null>(null)
  const readinessFocus = getReadinessFocus(searchParams)
  const focusedChoice = findFocusedProvenanceChoice(readinessFocus, ledger.choices)
  const focusedProfile = spellProfiles.find(
    (profile) =>
      isSpellProfileReadinessFocus(
        readinessFocus,
        profile.id,
        profile.choices?.map((choice) => choice.id),
      ) || profile.choices?.some((choice) => choice.id === focusedChoice?.id),
  )

  useEffect(() => {
    if (!focusedProfile) return
    if (focusedProfile.type === 'class') setSelectedSpellView(focusedProfile.id as ClassSpellView)
    else if (focusedProfile.type === 'racial') setSelectedSpellView('racial')
    else setSelectedSpellView('bonus')
  }, [focusedProfile])

  const allSpells = spells as Spell5e[]
  const recursiveLookup = useMemo<RecursiveLookup>(
    () =>
      buildRecursiveLookup({
        spells: allSpells,
        items,
        itemsBase,
        feats,
        races,
        classes,
        backgrounds,
        optionalfeatures,
        actions,
        conditions,
        deities,
        skills,
        senses,
        variantrules,
        languages,
        classFeatures,
        trapHazards,
        rewards,
      }),
    [
      backgrounds,
      classes,
      feats,
      actions,
      conditions,
      deities,
      languages,
      senses,
      skills,
      variantrules,
      items,
      itemsBase,
      optionalfeatures,
      races,
      classFeatures,
      trapHazards,
      rewards,
      allSpells,
    ],
  )
  const spellByName = recursiveLookup.spells

  const detailsByProfileId = useMemo(
    () => new Map(spellcastingDetails.map((detail) => [detail.profileId, detail] as const)),
    [spellcastingDetails],
  )

  const subclassSpellSources = useMemo(() => {
    const sourceMap = new Map<string, string>()
    const rows: SourceRow[] = []
    if (!character) return { sourceMap, rows }

    const classesById = new Map(
      (calculationContext?.classes ?? []).map((classData) => [
        toClassProfileId(classData.name, classData.source),
        classData,
      ]),
    )

    for (const entry of getCharacterClassEntries(character)) {
      if (!entry.subclass) continue
      const profileId = toClassProfileId(entry.name, entry.source)
      const subclassData = getSelectedSubclassData(classesById.get(profileId), entry)
      const grants = parseSubclassSpells(subclassData?.additionalSpells, entry.levels).filter(
        (grant) => grant.mode !== 'expanded',
      )

      for (const grant of grants) {
        const attribution = `Subclass: ${entry.subclass}`
        sourceMap.set(`${profileId}|${grant.spellName}`, attribution)
        const spell = resolveSpellReferenceFromMap(grant.spellName, spellByName)
        rows.push({
          itemName: formatSpellDisplayName(grant.spellName, spell?.name),
          itemSource: parseSpellReference(grant.spellName).source,
          category: 'Spells',
          attribution,
          sourceTypes: ['subclass'],
          isPending: false,
        })
      }
    }

    return { sourceMap, rows }
  }, [character, calculationContext?.classes, spellByName])

  const expandedSpellKeys = useMemo(
    () =>
      new Set(
        character
          ? [
              ...getNativeExpandedSpellReferences(character, calculationContext?.raceResolution),
            ].map((reference) => getSpellReferenceKey(reference))
          : [],
      ),
    [character, calculationContext],
  )

  const preparedCasterItemsByProfile = useMemo(() => {
    const map = new Map<string, PreparedCasterSpellItem[]>()
    for (const detail of spellcastingDetails) {
      if (!detail.isTruePreparedCaster || detail.maxSpellLevel < 1) continue
      const profile = spellProfiles.find((p) => p.id === detail.profileId)
      if (!profile || profile.type !== 'class') continue

      const preparedSet = new Set((profile.preparedSpells ?? []).map(getSpellNameKey))
      const fixedSet = new Set((profile.fixedSpells ?? []).map(getSpellNameKey))
      const alwaysPreparedSet = new Set((profile.alwaysPreparedSpells ?? []).map(getSpellNameKey))

      const available = allSpells.filter(
        (spell) =>
          spell.level > 0 &&
          spell.level <= detail.maxSpellLevel &&
          (isSpellOnClassList(spell, profile.className, profile.classSource) ||
            fixedSet.has(getSpellNameKey(spell.name)) ||
            expandedSpellKeys.has(getSpellReferenceKey(spell.name, spell.source))),
      )
      available.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      map.set(
        detail.profileId,
        available.map((spell) => {
          const spellKey = getSpellNameKey(spell.name)
          const alwaysPrepared = profile.alwaysPrepared || alwaysPreparedSet.has(spellKey)
          return {
            spell,
            item: {
              profileId: profile.id,
              profileLabel: profile.label,
              className: profile.className,
              classSource: profile.classSource,
              name: formatSpellReference(spell.name, spell.source),
              level: spell.level,
              kind: 'spell',
              prepared: alwaysPrepared || preparedSet.has(spellKey),
              alwaysPrepared,
              isFixed: fixedSet.has(spellKey),
              isPreparedCaster: true,
            },
          }
        }),
      )
    }
    return map
  }, [allSpells, spellcastingDetails, spellProfiles, expandedSpellKeys])

  const spellListItems = useMemo(() => {
    const items: SpellListItem[] = []

    for (const profile of spellProfiles) {
      const detail = detailsByProfileId.get(profile.id)
      const alwaysPreparedSet = new Set((profile.alwaysPreparedSpells ?? []).map(getSpellNameKey))

      for (const name of profile.cantrips) {
        const spell = resolveSpellReferenceFromMap(name, spellByName)
        const spellKey = getSpellNameKey(name)
        const alwaysPrepared = !!profile.alwaysPrepared || alwaysPreparedSet.has(spellKey)
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          removable: profile.type !== 'racial',
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 0,
          kind: 'cantrip',
          prepared: alwaysPrepared,
          isFixed: isFixedProfileSpell(profile, ledger, name),
        })
      }

      for (const name of profile.spellsKnown) {
        const spell = resolveSpellReferenceFromMap(name, spellByName)
        const spellKey = getSpellNameKey(name)
        const alwaysPrepared = !!profile.alwaysPrepared || alwaysPreparedSet.has(spellKey)
        const prepared =
          alwaysPrepared ||
          profile.preparedSpells.some((item) => getSpellNameKey(item) === spellKey)
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          removable: profile.type !== 'racial',
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 1,
          kind: 'spell',
          prepared,
          isFixed: isFixedProfileSpell(profile, ledger, name),
        })
      }
    }

    return items.sort((a, b) => {
      const aSpecial = a.profileId.startsWith('special:')
      const bSpecial = b.profileId.startsWith('special:')
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1
      if (a.profileLabel !== b.profileLabel) {
        return a.profileLabel.localeCompare(b.profileLabel)
      }
      if (a.level !== b.level) return a.level - b.level
      return a.name.localeCompare(b.name)
    })
  }, [detailsByProfileId, ledger, spellByName, spellProfiles])

  const groupedItems = useMemo(() => {
    const map = new Map<string, SpellListItem[]>()
    for (const item of spellListItems) {
      if (!map.has(item.profileId)) map.set(item.profileId, [])
      map.get(item.profileId)?.push(item)
    }
    return map
  }, [spellListItems])

  const classSpellProfiles = useMemo(
    () => spellProfiles.filter((profile) => profile.type === 'class'),
    [spellProfiles],
  )

  const spellCountsByView = useMemo(() => {
    const counts: Record<string, number> = { all: 0, racial: 0, bonus: 0 }

    for (const profile of spellProfiles) {
      const profileItems = groupedItems.get(profile.id) ?? []
      const detail = detailsByProfileId.get(profile.id)
      const count = detail?.isTruePreparedCaster
        ? profileItems.filter((item) => item.kind === 'cantrip').length +
          (preparedCasterItemsByProfile.get(profile.id)?.length ?? 0)
        : profileItems.length
      const view =
        profile.id === SPECIAL_SPELL_PROFILE_ID
          ? 'bonus'
          : profile.type === 'racial'
            ? 'racial'
            : profile.id

      counts[view] = (counts[view] ?? 0) + count
      counts.all += count
    }

    return counts
  }, [detailsByProfileId, groupedItems, preparedCasterItemsByProfile, spellProfiles])

  const spellView =
    selectedSpellView.startsWith('class:') &&
    !classSpellProfiles.some((profile) => profile.id === selectedSpellView)
      ? 'all'
      : selectedSpellView

  const spellViewTabs = useMemo(
    () => [
      { value: 'all' as const, label: 'All' },
      ...classSpellProfiles.map((profile) => ({
        value: profile.id as ClassSpellView,
        label: profile.className ?? profile.label,
      })),
      { value: 'racial' as const, label: 'Racial' },
      { value: 'bonus' as const, label: 'Bonus' },
    ],
    [classSpellProfiles],
  )

  const visibleSpellProfiles = useMemo(
    () =>
      spellProfiles.filter((profile) => {
        if (spellView === 'all') return true
        if (spellView === 'bonus') return profile.id === SPECIAL_SPELL_PROFILE_ID
        if (spellView === 'racial') return profile.type === 'racial'
        return profile.id === spellView
      }),
    [spellProfiles, spellView],
  )

  const selectionSourceByProfileAndSpell = useMemo(() => {
    const map = buildSpellSelectionSourceMap({ spellProfiles, ledger })
    for (const [key, attribution] of subclassSpellSources.sourceMap) {
      map.set(key, attribution)
    }
    return map
  }, [spellProfiles, ledger, subclassSpellSources])

  const spellSourceRows = useMemo(() => {
    const rows = [...getSourcesRowsBySection('spells'), ...subclassSpellSources.rows]
    const seen = new Set<string>()
    return rows.flatMap((row) => {
      const key = `${getSpellReferenceKey(row.itemName, row.itemSource)}|${row.attribution}|${row.category}`
      if (seen.has(key)) return []
      seen.add(key)
      const spell = resolveSpellReferenceFromMap(
        formatSpellReference(row.itemName, row.itemSource),
        spellByName,
      )
      return [{ ...row, itemName: formatSpellDisplayName(row.itemName, spell?.name) }]
    })
  }, [getSourcesRowsBySection, spellByName, subclassSpellSources])

  const hasMultipleSpellcastingClasses = spellcastingDetails.length > 1

  const hasTruePreparedCaster = spellcastingDetails.some((d) => d.isTruePreparedCaster)
  const [showPreparedHint, setShowPreparedHint] = useState(
    () => !isHintDismissed('spells-prepared-caster'),
  )
  const hintPosition = useAnchoredHintPosition({
    enabled: showPreparedHint && hasTruePreparedCaster,
    selector: SPELLS_PREPARE_SELECTOR,
  })

  const handleDismissPreparedHint = () => {
    setShowPreparedHint(false)
    setHintDismissed('spells-prepared-caster', true)
  }

  const racialProfiles = useMemo(
    () => spellProfiles.filter((p) => p.type === 'racial'),
    [spellProfiles],
  )

  const racialOwners = useMemo(
    () =>
      character ? getNativeRacialSpellOwners(character, calculationContext?.raceResolution) : [],
    [character, calculationContext],
  )

  const characterSpellNames = useMemo(() => {
    const names = new Set<string>()
    for (const profile of spellProfiles) {
      for (const name of profile.cantrips) names.add(name)
      for (const name of profile.spellsKnown) names.add(name)
    }
    return names
  }, [spellProfiles])

  const racialChoiceModalConfig = useMemo(() => {
    if (!activeRacialChoice) return null
    const filter = activeRacialChoice.filter
    const allowedSpellReferences = activeRacialChoice.pool
      ? new Set(activeRacialChoice.pool)
      : new Set(
          allSpells
            .filter(
              (spell) =>
                !filter ||
                (spell.level === filter.level &&
                  (!filter.classes.length ||
                    filter.classes.some((name) => isSpellOnClassList(spell, name)))),
            )
            .map((spell) => formatSpellReference(spell.name, spell.source)),
        )
    const allowedLevels = filter
      ? new Set([String(filter.level)])
      : activeRacialChoice.isCantrip
        ? new Set(['0'])
        : undefined
    return {
      title:
        'Choose ' +
        activeRacialChoice.count +
        (activeRacialChoice.isCantrip ? ' cantrips' : ' spells'),
      allowedSpellReferences,
      initialSelectedNames: activeRacialChoice.selected,
      allowedLevels,
      lockedNames: undefined,
      className: undefined,
      classSource: undefined,
      classListOverrides: allowedSpellReferences,
      initialFilters: allowedLevels
        ? { level: allowedLevels, school: new Set<string>(), type: new Set<string>() }
        : undefined,
      categories: [
        {
          key: 'selection',
          label: activeRacialChoice.isCantrip ? 'cantrips' : 'spells',
          max: activeRacialChoice.count,
          test: () => true,
        },
      ],
    }
  }, [activeRacialChoice, allSpells])

  const handleConfirmRacialChoice = useCallback(
    (names: string[]) => {
      if (!activeRacialChoice) return

      setRacialSpellChoice(activeRacialChoice.profileId, activeRacialChoice.choiceId, names)

      setRacialChoiceModalOpen(false)
      setActiveRacialChoice(null)
    },
    [activeRacialChoice, setRacialSpellChoice],
  )

  if (!character) {
    return <NoCharCard icon={<MagicWand weight="duotone" />} noun="manage spells" />
  }

  const handleRemoveSpell = (item: SpellListItem) => {
    const profile = spellProfiles.find((p) => p.id === item.profileId)
    if (profile?.type === 'racial') return
    removeSpellFromProfile(item.profileId, item.name, item.kind)
  }

  const handleOpenRacialChoiceModal = (profileId: string, choiceId: string) => {
    const profile = spellProfiles.find((p) => p.id === profileId)
    if (!profile?.choices || !racialOwners?.some((owner) => owner.id === profileId)) return
    const choice = profile.choices.find((c) => c.id === choiceId)
    if (!choice) return

    setActiveRacialChoice({
      profileId: profile.id,
      choiceId: choice.id,
      count: choice.count,
      isCantrip: choice.isCantrip,
      filter: choice.filter,
      pool: choice.pool,
      selected: choice.selected,
    })
    setRacialChoiceModalOpen(true)
  }

  const handleConfirmBonusSpells = (names: string[]) => {
    const bonusProfile = spellProfiles.find((profile) => profile.id === SPECIAL_SPELL_PROFILE_ID)
    if (!bonusProfile) {
      setBonusSpellModalOpen(false)
      return
    }

    const newCantrips: string[] = []
    const newSpells: string[] = []
    for (const name of names) {
      const spell = resolveSpellReferenceFromMap(name, spellByName)
      if (spell?.level === 0) {
        newCantrips.push(name)
      } else {
        newSpells.push(name)
      }
    }

    setProfileSpells(
      SPECIAL_SPELL_PROFILE_ID,
      [...bonusProfile.cantrips, ...newCantrips],
      [...bonusProfile.spellsKnown, ...newSpells],
    )

    setBonusSpellModalOpen(false)
  }

  return (
    <WorkspacePage className="p-3">
      <AnchoredHint
        position={showPreparedHint ? hintPosition : null}
        width={SPELLS_HINT_WIDTH}
        onDismiss={handleDismissPreparedHint}
        dismissOnReferenceAction
      >
        Toggle this circle to mark a spell prepared — as a prepared caster you can freely swap
        prepared spells between rests.
      </AnchoredHint>

      <WorkspaceBody className="flex overflow-hidden">
        <SplitPane
          className={cn(
            'my-0 h-full overflow-visible',
            !listCollapsed && !detailCollapsed && 'gap-3',
          )}
          leftClassName={cn(
            'rounded-lg bg-workspace-pane',
            listCollapsed ? 'border-0' : 'border border-border',
          )}
          rightClassName={cn(
            'rounded-lg bg-workspace-detail',
            detailCollapsed ? 'border-0' : 'border border-border',
          )}
          leftCollapsed={listCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setListCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          compactLeftLabel="Spells"
          compactRightLabel="Spellcasting"
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader ariaLabel="Spell view">
                <div className="h-full min-w-0 flex-1 overflow-x-auto">
                  <div
                    className="inline-flex h-full min-w-max items-stretch gap-5"
                    role="tablist"
                    aria-label="Spell view"
                  >
                    {spellViewTabs.map(({ value, label }) => {
                      const active = spellView === value
                      return (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setSelectedSpellView(value)}
                          className={cn(
                            'relative flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                            active
                              ? 'border-primary text-foreground'
                              : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                          )}
                        >
                          <span>{label}</span>
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold leading-none text-primary">
                            {spellCountsByView[value]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="mx-auto w-full max-w-6xl p-4">
                  {(spellView === 'all' || spellView === 'racial') && racialProfiles.length > 0 ? (
                    <NativeRacialSpellControls
                      profiles={racialProfiles}
                      owners={racialOwners}
                      onSetSuite={setRacialSpellSuite}
                      onEditChoice={handleOpenRacialChoiceModal}
                      onClearChoice={setRacialSpellChoice}
                    />
                  ) : null}
                  <SpellProfileManager
                    spellProfiles={visibleSpellProfiles}
                    focusProfileId={focusedProfile?.id}
                    detailsByProfileId={detailsByProfileId}
                    groupedItems={groupedItems}
                    selectionSourceByProfileAndSpell={selectionSourceByProfileAndSpell}
                    preparedCasterItemsByProfile={preparedCasterItemsByProfile}
                    getSpellByName={(spellName) =>
                      resolveSpellReferenceFromMap(spellName, spellByName)
                    }
                    onTogglePrepared={togglePrepared}
                    onRemoveSpell={handleRemoveSpell}
                    onAddSpell={(profileId) => {
                      if (profileId !== SPECIAL_SPELL_PROFILE_ID) return
                      setBonusSpellModalOpen(true)
                    }}
                    renderSpellName={({ item, spell, sourceContext }) => (
                      <SpellNameTooltip
                        name={item.name}
                        spell={spell}
                        recursiveLookup={recursiveLookup}
                        sourceContext={sourceContext}
                      />
                    )}
                  />
                </div>
              </ScrollArea>
              <div className="border-t border-border px-4 pb-4">
                <SourcesAccordion sectionId="spells" title="Sources" rows={spellSourceRows} />
              </div>
            </>
          }
          right={
            <>
              <WorkspacePaneHeader title="Spellcasting details" className="pr-20" />
              <ScrollArea className="flex-1 overflow-hidden">
                <WorkspaceDetailContent>
                  <SpellcastingDetailsCard
                    isSpellcaster={isSpellcaster}
                    spellcastingDetails={spellcastingDetails}
                    racialProfiles={racialProfiles.filter((profile) => profile.racial?.suite)}
                    racialSpellcastingDetails={racialSpellcastingDetails}
                    onSetRacialCastingAbility={setRacialCastingAbility}
                    hasMultipleSpellcastingClasses={hasMultipleSpellcastingClasses}
                    sharedSlots={sharedSlots}
                    pactSlots={pactSlots}
                  />
                </WorkspaceDetailContent>
              </ScrollArea>
            </>
          }
        />
      </WorkspaceBody>

      <SpellSelectionModal
        open={racialChoiceModalOpen && !!racialChoiceModalConfig}
        selectionMode="racial-choice"
        onOpenChange={(open) => {
          setRacialChoiceModalOpen(open)
          if (!open) setActiveRacialChoice(null)
        }}
        title={racialChoiceModalConfig?.title}
        spells={allSpells}
        lockedNames={racialChoiceModalConfig?.lockedNames}
        categories={racialChoiceModalConfig?.categories}
        initialSelectedNames={racialChoiceModalConfig?.initialSelectedNames}
        initialFilters={racialChoiceModalConfig?.initialFilters}
        allowedLevels={racialChoiceModalConfig?.allowedLevels}
        className={racialChoiceModalConfig?.className}
        classSource={racialChoiceModalConfig?.classSource}
        classListOverrides={racialChoiceModalConfig?.classListOverrides}
        allowedSpellReferences={racialChoiceModalConfig?.allowedSpellReferences}
        onConfirm={handleConfirmRacialChoice}
      />

      <SpellSelectionModal
        open={bonusSpellModalOpen}
        onOpenChange={setBonusSpellModalOpen}
        title="Add Bonus Spells"
        spells={allSpells}
        characterSpellNames={characterSpellNames}
        onConfirm={handleConfirmBonusSpells}
      />
    </WorkspacePage>
  )
}
