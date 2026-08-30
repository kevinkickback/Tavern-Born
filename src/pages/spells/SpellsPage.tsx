import { MagicWand, X } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  WorkspaceBody,
  WorkspaceDetailContent,
  WorkspacePage,
  WorkspacePaneHeader,
} from '@/components/workspace'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
import {
  SPECIAL_SPELL_PROFILE_ID,
  toClassProfileId,
} from '@/lib/calculations/spellProfiles.constants'
import { getCharacterClassEntries, getTotalLevel } from '@/lib/characterUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { SourceRow } from '@/lib/provenance/types'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { SpellcastingDetailsCard } from '@/pages/spells/components/SpellcastingDetailsCard'
import { SpellNameTooltip } from '@/pages/spells/components/SpellNameTooltip'
import {
  type PreparedCasterSpellItem,
  type SpellListItem,
  SpellProfileManager,
} from '@/pages/spells/components/SpellProfileManager'
import {
  buildNameMap,
  getEntityKey,
  type RecursiveLookup,
  type TooltipEntityLike,
} from '@/pages/spells/components/spellTooltipUtils'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Class5e, Spell5e } from '@/types/5etools'
import { NoCharCard } from '../_shared'

const SPELLS_PREPARE_SELECTOR = '[data-spell-prepare-toggle="true"]'
const SPELLS_HINT_WIDTH = 300

export function SpellsPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const { getSourcesRowsBySection } = useProvenanceLedger()
  const {
    spells,
    items,
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
  } = useFilteredGameData()
  const ledger = character?.provenance ?? emptyProvenance()
  const {
    spellProfiles,
    spellcastingDetails,
    sharedSlots,
    pactSlots,
    isSpellcaster,
    spellcastingDetailByProfileId,
  } = useSpellSlots()
  const {
    removeSpellFromProfile,
    setProfileSpells,
    togglePrepared,
    selectRacialSpell,
    removeRacialSpell,
    setRacialCastingAbility,
  } = useSpellProfileMutations(spellProfiles, spellcastingDetailByProfileId)

  const [racialChoiceModalOpen, setRacialChoiceModalOpen] = useState(false)
  const [bonusSpellModalOpen, setBonusSpellModalOpen] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [activeRacialChoice, setActiveRacialChoice] = useState<{
    profileId: string
    choiceId: string
    count: number
    isCantrip: boolean
    filter?: { level: number; classes: string[] }
    pool?: string[]
    selected: string[]
  } | null>(null)

  const allSpells = spells as Spell5e[]
  const spellByName = useMemo(() => {
    const map = new Map<string, Spell5e>()
    for (const spell of allSpells) {
      map.set(getEntityKey(spell.name, spell.source), spell)
      const withoutSource = getEntityKey(spell.name)
      if (!map.has(withoutSource)) {
        map.set(withoutSource, spell)
      }
    }
    return map
  }, [allSpells])

  const recursiveLookup = useMemo<RecursiveLookup>(
    () => ({
      spells: spellByName,
      items: buildNameMap(items as TooltipEntityLike[]),
      feats: buildNameMap(feats as TooltipEntityLike[]),
      races: buildNameMap(races as TooltipEntityLike[]),
      classes: buildNameMap(classes as TooltipEntityLike[]),
      backgrounds: buildNameMap(backgrounds as TooltipEntityLike[]),
      optionalfeatures: buildNameMap(optionalfeatures as TooltipEntityLike[]),
      actions: buildNameMap(actions as TooltipEntityLike[]),
      conditions: buildNameMap(conditions as TooltipEntityLike[]),
      deities: buildNameMap(deities as TooltipEntityLike[]),
      skills: buildNameMap(skills as TooltipEntityLike[]),
      senses: buildNameMap(senses as TooltipEntityLike[]),
      variantrules: buildNameMap(variantrules as TooltipEntityLike[]),
      languages: buildNameMap(languages as TooltipEntityLike[]),
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
      optionalfeatures,
      races,
      spellByName,
    ],
  )

  const detailsByProfileId = useMemo(
    () => new Map(spellcastingDetails.map((detail) => [detail.profileId, detail] as const)),
    [spellcastingDetails],
  )

  const subclassSpellSources = useMemo(() => {
    const sourceMap = new Map<string, string>()
    const rows: SourceRow[] = []
    if (!character) return { sourceMap, rows }

    const classesById = new Map(
      (classes as Class5e[]).map((classData) => [
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
        rows.push({
          itemName: grant.spellName,
          category: 'Spells',
          attribution,
          sourceTypes: ['subclass'],
          isPending: false,
        })
      }
    }

    return { sourceMap, rows }
  }, [character, classes])

  const preparedCasterItemsByProfile = useMemo(() => {
    const map = new Map<string, PreparedCasterSpellItem[]>()
    for (const detail of spellcastingDetails) {
      if (!detail.isTruePreparedCaster || detail.maxSpellLevel < 1) continue
      const profile = spellProfiles.find((p) => p.id === detail.profileId)
      if (!profile || profile.type !== 'class') continue

      const preparedSet = new Set((profile.preparedSpells ?? []).map(normalizeKey))
      const fixedSet = new Set((profile.fixedSpells ?? []).map(normalizeKey))
      const alwaysPreparedSet = new Set((profile.alwaysPreparedSpells ?? []).map(normalizeKey))

      const available = allSpells.filter(
        (spell) =>
          spell.level > 0 &&
          spell.level <= detail.maxSpellLevel &&
          (isSpellOnClassList(spell, profile.className, profile.classSource) ||
            fixedSet.has(normalizeKey(spell.name))),
      )
      available.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      map.set(
        detail.profileId,
        available.map((spell) => {
          const spellKey = normalizeKey(spell.name)
          const alwaysPrepared = profile.alwaysPrepared || alwaysPreparedSet.has(spellKey)
          return {
            spell,
            item: {
              profileId: profile.id,
              profileLabel: profile.label,
              className: profile.className,
              classSource: profile.classSource,
              name: spell.name,
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
  }, [allSpells, spellcastingDetails, spellProfiles])

  const spellListItems = useMemo(() => {
    const items: SpellListItem[] = []

    for (const profile of spellProfiles) {
      const detail = detailsByProfileId.get(profile.id)
      const fixedSet = new Set((profile.fixedSpells ?? []).map(normalizeKey))
      const alwaysPreparedSet = new Set((profile.alwaysPreparedSpells ?? []).map(normalizeKey))

      for (const name of profile.cantrips) {
        const spell = spellByName.get(getEntityKey(name))
        const spellKey = normalizeKey(name)
        const alwaysPrepared = !!profile.alwaysPrepared || alwaysPreparedSet.has(spellKey)
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 0,
          kind: 'cantrip',
          prepared: alwaysPrepared,
          isFixed: fixedSet.has(spellKey),
        })
      }

      for (const name of profile.spellsKnown) {
        const spell = spellByName.get(getEntityKey(name))
        const spellKey = normalizeKey(name)
        const alwaysPrepared = !!profile.alwaysPrepared || alwaysPreparedSet.has(spellKey)
        const prepared =
          alwaysPrepared || profile.preparedSpells.some((item) => normalizeKey(item) === spellKey)
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 1,
          kind: 'spell',
          prepared,
          isFixed: fixedSet.has(spellKey),
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
  }, [detailsByProfileId, spellByName, spellProfiles])

  const groupedItems = useMemo(() => {
    const map = new Map<string, SpellListItem[]>()
    for (const item of spellListItems) {
      if (!map.has(item.profileId)) map.set(item.profileId, [])
      map.get(item.profileId)?.push(item)
    }
    return map
  }, [spellListItems])

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
    return rows.filter((row) => {
      const key = `${normalizeKey(row.itemName)}|${row.attribution}|${row.category}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [getSourcesRowsBySection, subclassSpellSources])

  const hasWarlockClass = useMemo(
    () => spellcastingDetails.some((detail) => detail.className.toLowerCase() === 'warlock'),
    [spellcastingDetails],
  )

  const hasMultipleSpellcastingClasses = spellcastingDetails.length > 1

  const hasTruePreparedCaster = spellcastingDetails.some((d) => d.isTruePreparedCaster)
  const [showPreparedHint, setShowPreparedHint] = useState(
    () => !isHintDismissed('spells-prepared-caster'),
  )
  const hintPosition = useAnchoredHintPosition({
    enabled: showPreparedHint && hasTruePreparedCaster,
    selector: SPELLS_PREPARE_SELECTOR,
    width: SPELLS_HINT_WIDTH,
  })

  const handleDismissPreparedHint = () => {
    setShowPreparedHint(false)
    setHintDismissed('spells-prepared-caster', true)
  }

  const racialProfiles = useMemo(
    () => spellProfiles.filter((p) => p.type === 'racial'),
    [spellProfiles],
  )

  const proficiencyBonus = useMemo(
    () => getProficiencyBonus(getTotalLevel({ classes: character?.classProgression ?? [] })),
    [character],
  )

  const abilityModifiers = useMemo(() => {
    const scores = character?.abilityScores
    if (!scores) return {} as Record<string, number>
    return Object.fromEntries(
      Object.entries(scores).map(([key, val]) => [key, getAbilityModifier(val as number)]),
    ) as Record<string, number>
  }, [character])

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

    const initialSelectedNames = activeRacialChoice.selected ?? []

    const otherProfileSpells = new Set<string>()
    for (const profile of spellProfiles) {
      if (profile.id === activeRacialChoice.profileId) continue
      for (const name of profile.cantrips) otherProfileSpells.add(name)
      for (const name of profile.spellsKnown) otherProfileSpells.add(name)
    }
    const lockedNames = otherProfileSpells.size > 0 ? otherProfileSpells : undefined

    if (activeRacialChoice.pool) {
      const poolAllowedLevels = activeRacialChoice.isCantrip ? new Set(['0']) : undefined
      return {
        title: `Choose ${activeRacialChoice.count} ${activeRacialChoice.isCantrip ? 'Cantrip' : 'Spell'}${activeRacialChoice.count > 1 ? 's' : ''}`,
        initialSelectedNames,
        allowedLevels: poolAllowedLevels,
        lockedNames,
        className: undefined as string | undefined,
        classSource: undefined as string | undefined,
        classListOverrides: new Set(activeRacialChoice.pool),
        initialFilters: poolAllowedLevels
          ? { level: poolAllowedLevels, school: new Set<string>(), type: new Set<string>() }
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
    }

    if (activeRacialChoice.filter) {
      const { level, classes } = activeRacialChoice.filter
      const filterAllowedLevels = new Set([String(level)])
      return {
        title: `Choose ${activeRacialChoice.count} ${level === 0 ? 'Cantrip' : 'Spell'}${activeRacialChoice.count > 1 ? 's' : ''} from ${classes.join(', ')} list`,
        initialSelectedNames,
        allowedLevels: filterAllowedLevels,
        lockedNames,
        className: classes[0],
        classSource: undefined as string | undefined,
        classListOverrides: undefined as Set<string> | undefined,
        initialFilters: {
          level: filterAllowedLevels,
          school: new Set<string>(),
          type: new Set<string>(),
        },
        categories: [
          {
            key: 'selection',
            label: level === 0 ? 'cantrips' : 'spells',
            max: activeRacialChoice.count,
            test: () => true,
          },
        ],
      }
    }

    return {
      title: `Choose ${activeRacialChoice.count} ${activeRacialChoice.isCantrip ? 'Cantrip' : 'Spell'}${activeRacialChoice.count > 1 ? 's' : ''}`,
      initialSelectedNames,
      allowedLevels: activeRacialChoice.isCantrip ? new Set(['0']) : undefined,
      lockedNames,
      className: undefined as string | undefined,
      classSource: undefined as string | undefined,
      classListOverrides: undefined as Set<string> | undefined,
      initialFilters: activeRacialChoice.isCantrip
        ? { level: new Set(['0']), school: new Set<string>(), type: new Set<string>() }
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
  }, [activeRacialChoice, spellProfiles])

  const handleConfirmRacialChoice = useCallback(
    (names: string[]) => {
      if (!activeRacialChoice) return

      const previousSelected = new Set(activeRacialChoice.selected)
      const nextSelected = new Set(names)

      for (const name of names) {
        if (!previousSelected.has(name)) {
          selectRacialSpell(activeRacialChoice.profileId, activeRacialChoice.choiceId, name)
        }
      }

      for (const name of activeRacialChoice.selected) {
        if (!nextSelected.has(name)) {
          removeRacialSpell(activeRacialChoice.profileId, activeRacialChoice.choiceId, name)
        }
      }

      setRacialChoiceModalOpen(false)
      setActiveRacialChoice(null)
    },
    [activeRacialChoice, selectRacialSpell, removeRacialSpell],
  )

  if (!character) {
    return <NoCharCard icon={<MagicWand weight="duotone" />} noun="manage spells" />
  }

  const handleRemoveSpell = (item: SpellListItem) => {
    const profile = spellProfiles.find((p) => p.id === item.profileId)
    if (profile?.type === 'racial' && profile.choices) {
      const choice = profile.choices.find((c) => c.selected.includes(item.name))
      if (choice) {
        removeRacialSpell(item.profileId, choice.id, item.name)
        return
      }
    }
    removeSpellFromProfile(item.profileId, item.name, item.kind)
  }

  const handleOpenRacialChoiceModal = (profileId: string, choiceId: string) => {
    const profile = spellProfiles.find((p) => p.id === profileId)
    if (!profile?.choices) return
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
      const spell = spellByName.get(getEntityKey(name))
      if (spell?.level === 0) {
        newCantrips.push(name)
      } else {
        newSpells.push(name)
      }
    }

    const mergedCantrips = [...new Set([...bonusProfile.cantrips, ...newCantrips])]
    const mergedSpells = [...new Set([...bonusProfile.spellsKnown, ...newSpells])]
    setProfileSpells(SPECIAL_SPELL_PROFILE_ID, mergedCantrips, mergedSpells)

    setBonusSpellModalOpen(false)
  }

  return (
    <WorkspacePage className="p-3">
      {showPreparedHint && hintPosition ? (
        <div
          className="pointer-events-none fixed z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300"
          style={{ top: hintPosition.top, left: hintPosition.left }}
        >
          <div className="pointer-events-auto animate-hint-bounce relative w-[300px] rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20">
            <div
              className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-accent/50 bg-accent"
              style={{ left: hintPosition.arrowLeft - 7 }}
            />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white"
              onClick={handleDismissPreparedHint}
              aria-label="Dismiss hint"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="leading-snug text-accent-foreground/95 pr-8">
              Toggle this circle to mark a spell prepared — as a prepared caster you can freely swap
              prepared spells between rests.
            </p>
          </div>
        </div>
      ) : null}

      <WorkspaceBody className="flex overflow-hidden rounded-lg border border-border bg-background">
        <SplitPane
          className="my-0 h-full"
          leftClassName="bg-background"
          rightClassName="border-l-2 border-border bg-sidebar/50"
          leftCollapsed={listCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setListCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader title="Spells" count={`${spellListItems.length} assigned`} />
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="mx-auto w-full max-w-6xl p-4">
                  <SpellProfileManager
                    spellProfiles={spellProfiles}
                    detailsByProfileId={detailsByProfileId}
                    groupedItems={groupedItems}
                    selectionSourceByProfileAndSpell={selectionSourceByProfileAndSpell}
                    preparedCasterItemsByProfile={preparedCasterItemsByProfile}
                    getSpellByName={(spellName) => spellByName.get(getEntityKey(spellName))}
                    onTogglePrepared={togglePrepared}
                    onRemoveSpell={handleRemoveSpell}
                    onAddSpell={(profileId) => {
                      if (profileId !== SPECIAL_SPELL_PROFILE_ID) return
                      setBonusSpellModalOpen(true)
                    }}
                    onOpenRacialChoice={handleOpenRacialChoiceModal}
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
                    racialProfiles={racialProfiles}
                    proficiencyBonus={proficiencyBonus}
                    abilityModifiers={abilityModifiers}
                    onSetRacialCastingAbility={setRacialCastingAbility}
                    hasMultipleSpellcastingClasses={hasMultipleSpellcastingClasses}
                    hasWarlockClass={hasWarlockClass}
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
        onOpenChange={(open) => {
          setRacialChoiceModalOpen(open)
          if (!open) setActiveRacialChoice(null)
        }}
        title={racialChoiceModalConfig?.title}
        spells={allSpells}
        lockedNames={racialChoiceModalConfig?.lockedNames}
        characterSpellNames={characterSpellNames}
        categories={racialChoiceModalConfig?.categories}
        initialSelectedNames={racialChoiceModalConfig?.initialSelectedNames}
        initialFilters={racialChoiceModalConfig?.initialFilters}
        allowedLevels={racialChoiceModalConfig?.allowedLevels}
        className={racialChoiceModalConfig?.className}
        classSource={racialChoiceModalConfig?.classSource}
        classListOverrides={racialChoiceModalConfig?.classListOverrides}
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
