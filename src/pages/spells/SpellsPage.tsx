import { MagicWand } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
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
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Spell5e } from '@/types/5etools'
import { NoCharCard } from '../_shared'

export function SpellsPage() {
  const gameData = useGameDataStore((state) => state.gameData)
  const character = useCharacterStore((s) => s.activeCharacter)
  const { spells, items, feats, races, classes, backgrounds, optionalfeatures } =
    useFilteredGameData()
  const { ledger, applyManualSpellGrant, removeSpellProvenance } = useProvenance()
  const {
    spellProfiles,
    spellcastingDetails,
    sharedSlots,
    pactSlots,
    isSpellcaster,
    removeSpellFromProfile,
    setProfileSpells,
    togglePrepared,
    selectRacialSpell,
    removeRacialSpell,
    setRacialCastingAbility,
  } = useSpellSlots()

  const [_racialChoiceModalOpen, setRacialChoiceModalOpen] = useState(false)
  const [bonusSpellModalOpen, setBonusSpellModalOpen] = useState(false)
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
      actions: buildNameMap((gameData?.actions as TooltipEntityLike[]) ?? []),
      conditions: buildNameMap((gameData?.conditions as TooltipEntityLike[]) ?? []),
      deities: buildNameMap((gameData?.deities as TooltipEntityLike[]) ?? []),
      skills: buildNameMap((gameData?.skills as TooltipEntityLike[]) ?? []),
      senses: buildNameMap((gameData?.senses as TooltipEntityLike[]) ?? []),
      variantrules: buildNameMap((gameData?.variantrules as TooltipEntityLike[]) ?? []),
      languages: buildNameMap((gameData?.languages as TooltipEntityLike[]) ?? []),
    }),
    [
      backgrounds,
      classes,
      feats,
      gameData?.actions,
      gameData?.conditions,
      gameData?.deities,
      gameData?.languages,
      gameData?.senses,
      gameData?.skills,
      gameData?.variantrules,
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

  /** For true prepared casters (Cleric/Druid/Paladin), pre-compute all castable class spells and list items grouped by profile. */
  const preparedCasterItemsByProfile = useMemo(() => {
    const map = new Map<string, PreparedCasterSpellItem[]>()
    for (const detail of spellcastingDetails) {
      if (!detail.isTruePreparedCaster || detail.maxSpellLevel < 1) continue
      const profile = spellProfiles.find((p) => p.id === detail.profileId)
      if (!profile || profile.type !== 'class') continue

      const preparedSet = new Set(profile.preparedSpells ?? [])

      const available = allSpells.filter(
        (spell) =>
          spell.level > 0 &&
          spell.level <= detail.maxSpellLevel &&
          isSpellOnClassList(spell, profile.className, profile.classSource),
      )
      available.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      map.set(
        detail.profileId,
        available.map((spell) => ({
          spell,
          item: {
            profileId: profile.id,
            profileLabel: profile.label,
            className: profile.className,
            classSource: profile.classSource,
            name: spell.name,
            level: spell.level,
            kind: 'spell',
            prepared: preparedSet.has(spell.name),
            isPreparedCaster: true,
          },
        })),
      )
    }
    return map
  }, [allSpells, spellcastingDetails, spellProfiles])

  const spellListItems = useMemo(() => {
    const items: SpellListItem[] = []

    for (const profile of spellProfiles) {
      const detail = detailsByProfileId.get(profile.id)
      const fixedSet =
        profile.type === 'racial' && profile.fixedSpells ? new Set(profile.fixedSpells) : undefined

      for (const name of profile.cantrips) {
        const spell = spellByName.get(getEntityKey(name))
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared: profile.alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 0,
          kind: 'cantrip',
          prepared: !!profile.alwaysPrepared,
          isFixed: fixedSet?.has(name),
        })
      }

      for (const name of profile.spellsKnown) {
        const spell = spellByName.get(getEntityKey(name))
        const prepared = profile.alwaysPrepared ? true : profile.preparedSpells.includes(name)
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared: profile.alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 1,
          kind: 'spell',
          prepared,
          isFixed: fixedSet?.has(name),
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

  const selectionSourceByProfileAndSpell = useMemo(
    () => buildSpellSelectionSourceMap({ spellProfiles, ledger }),
    [spellProfiles, ledger],
  )

  const hasWarlockClass = useMemo(
    () => spellcastingDetails.some((detail) => detail.className.toLowerCase() === 'warlock'),
    [spellcastingDetails],
  )

  const hasMultipleSpellcastingClasses = spellcastingDetails.length > 1

  const characterSpellNames = useMemo(() => {
    const names = new Set<string>()
    for (const profile of spellProfiles) {
      for (const name of profile.cantrips) names.add(name)
      for (const name of profile.spellsKnown) names.add(name)
    }
    return names
  }, [spellProfiles])

  const _racialChoiceModalConfig = useMemo(() => {
    if (!activeRacialChoice) return null

    const initialSelectedNames = activeRacialChoice.selected ?? []

    // Collect spells from all other profiles so they appear locked
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
        categories: undefined,
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
        categories: undefined,
      }
    }

    return null
  }, [activeRacialChoice, spellProfiles])

  const _handleConfirmRacialChoice = useCallback(
    (names: string[]) => {
      if (!activeRacialChoice) return

      const previousSelected = new Set(activeRacialChoice.selected)
      const nextSelected = new Set(names)

      for (const name of names) {
        if (!previousSelected.has(name)) {
          selectRacialSpell(activeRacialChoice.profileId, activeRacialChoice.choiceId, name)
          applyManualSpellGrant(name)
        }
      }

      for (const name of activeRacialChoice.selected) {
        if (!nextSelected.has(name)) {
          removeRacialSpell(activeRacialChoice.profileId, activeRacialChoice.choiceId, name)
          const existsElsewhere = spellProfiles.some((profile) => {
            if (profile.id === activeRacialChoice.profileId) return false
            return profile.cantrips.includes(name) || profile.spellsKnown.includes(name)
          })
          if (!existsElsewhere) {
            removeSpellProvenance(name)
          }
        }
      }

      setRacialChoiceModalOpen(false)
      setActiveRacialChoice(null)
    },
    [
      activeRacialChoice,
      selectRacialSpell,
      removeRacialSpell,
      applyManualSpellGrant,
      removeSpellProvenance,
      spellProfiles,
    ],
  )

  if (!character) {
    return <NoCharCard icon={<MagicWand weight="duotone" />} noun="manage spells" />
  }

  const handleRemoveSpell = (item: SpellListItem) => {
    removeSpellFromProfile(item.profileId, item.name, item.kind)

    const existsElsewhere = spellProfiles.some((profile) => {
      if (profile.id === item.profileId) return false
      return profile.cantrips.includes(item.name) || profile.spellsKnown.includes(item.name)
    })

    if (!existsElsewhere) {
      removeSpellProvenance(item.name)
    }
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

    const nextCantrips = new Set(bonusProfile.cantrips)
    const nextSpellsKnown = new Set(bonusProfile.spellsKnown)

    for (const name of names) {
      const spell = spellByName.get(getEntityKey(name))
      if (spell?.level === 0) {
        nextCantrips.add(name)
      } else {
        nextSpellsKnown.add(name)
      }
      applyManualSpellGrant(name)
    }

    setProfileSpells(SPECIAL_SPELL_PROFILE_ID, [...nextCantrips], [...nextSpellsKnown])

    setBonusSpellModalOpen(false)
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="space-y-6">
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
          onSetRacialCastingAbility={setRacialCastingAbility}
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

        <SpellSelectionModal
          open={bonusSpellModalOpen}
          onOpenChange={setBonusSpellModalOpen}
          title="Add Bonus Spells"
          spells={allSpells}
          characterSpellNames={characterSpellNames}
          onConfirm={handleConfirmBonusSpells}
        />

        <SpellcastingDetailsCard
          isSpellcaster={isSpellcaster}
          spellcastingDetails={spellcastingDetails}
          hasMultipleSpellcastingClasses={hasMultipleSpellcastingClasses}
          hasWarlockClass={hasWarlockClass}
          sharedSlots={sharedSlots}
          pactSlots={pactSlots}
        />
      </div>
    </div>
  )
}
