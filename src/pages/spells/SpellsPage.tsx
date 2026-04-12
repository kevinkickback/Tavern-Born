import { MagicWand, PushPin, X } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { SpellcastingDetailsCard } from '@/pages/spells/components/SpellcastingDetailsCard'
import {
  type SpellListItem,
  SpellProfileManager,
} from '@/pages/spells/components/SpellProfileManager'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Spell5e } from '@/types/5etools'
import { NoCharCard } from '../_shared'

interface TooltipEntityLike {
  name?: string
  source?: string
  page?: number
  entries?: unknown[]
}

interface RecursiveReference {
  kind: string
  name: string
  source?: string
}

interface RecursiveTooltipData {
  title: string
  subtitle?: string
  html?: string
}

interface RecursiveHintState extends RecursiveTooltipData {
  x: number
  y: number
}

interface RecursiveLookup {
  spells: Map<string, Spell5e>
  items: Map<string, TooltipEntityLike>
  feats: Map<string, TooltipEntityLike>
  races: Map<string, TooltipEntityLike>
  classes: Map<string, TooltipEntityLike>
  backgrounds: Map<string, TooltipEntityLike>
  optionalfeatures: Map<string, TooltipEntityLike>
  actions: Map<string, TooltipEntityLike>
  conditions: Map<string, TooltipEntityLike>
  deities: Map<string, TooltipEntityLike>
  skills: Map<string, TooltipEntityLike>
  senses: Map<string, TooltipEntityLike>
  variantrules: Map<string, TooltipEntityLike>
  languages: Map<string, TooltipEntityLike>
}

function getEntityKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`.toLowerCase()
}

function buildNameMap<T extends TooltipEntityLike>(items: T[] = []): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    const name = item?.name?.trim()
    if (!name) continue

    const source = item.source?.trim()
    const withSource = getEntityKey(name, source)
    if (!map.has(withSource)) {
      map.set(withSource, item)
    }

    const withoutSource = getEntityKey(name)
    if (!map.has(withoutSource)) {
      map.set(withoutSource, item)
    }
  }
  return map
}

function parseRecursiveReference(
  rawTitle: string,
  fallbackName: string,
  hoverType?: string,
  hoverName?: string,
  hoverSource?: string,
): RecursiveReference {
  if (hoverName?.trim()) {
    return {
      kind: hoverType?.trim().toLowerCase() || 'note',
      name: hoverName.trim(),
      source: hoverSource?.trim() || undefined,
    }
  }

  const match = /^([^:]+):\s*(.+)$/.exec(rawTitle)
  if (!match) {
    return {
      kind: 'note',
      name: fallbackName.trim() || rawTitle.trim(),
    }
  }

  return {
    kind: match[1].trim().toLowerCase(),
    name: match[2].trim(),
  }
}

function normalizeKind(kind: string): string {
  const normalized = kind.trim().toLowerCase()
  const aliases: Record<string, string> = {
    condition: 'conditions',
    status: 'conditions',
    action: 'actions',
    deity: 'deities',
    skill: 'skills',
    sense: 'senses',
    variantrule: 'variantrules',
    language: 'languages',
    item: 'items',
    feat: 'feats',
    race: 'races',
    class: 'classes',
    background: 'backgrounds',
    optionalfeature: 'optionalfeatures',
    optfeature: 'optionalfeatures',
  }
  return aliases[normalized] ?? normalized
}

function getPreviewHtml(entries: unknown[] | undefined): string | undefined {
  if (!entries?.length) return undefined
  return entries
    .slice(0, 2)
    .map((entry) => getEntryWithHoverTitles(entry))
    .join('')
}

function getRecursiveTooltipData(
  reference: RecursiveReference,
  lookup: RecursiveLookup,
  rawTitle: string,
): RecursiveTooltipData {
  const simpleFallback: RecursiveTooltipData = {
    title: reference.name,
    subtitle: rawTitle,
  }

  if (!reference.name) return simpleFallback

  if (normalizeKind(reference.kind) === 'spell') {
    const spell =
      lookup.spells.get(getEntityKey(reference.name, reference.source)) ??
      lookup.spells.get(getEntityKey(reference.name))
    if (!spell) return simpleFallback
    return {
      title: spell.name,
      subtitle: `${formatSpellLevel(spell.level)} ${getSchoolName(spell.school)}${spell.source ? ` • ${spell.source}` : ''}`,
      html: getPreviewHtml(spell.entries),
    }
  }

  const mapByKind: Record<string, Map<string, TooltipEntityLike> | undefined> = {
    items: lookup.items,
    feats: lookup.feats,
    races: lookup.races,
    classes: lookup.classes,
    backgrounds: lookup.backgrounds,
    optionalfeatures: lookup.optionalfeatures,
    actions: lookup.actions,
    conditions: lookup.conditions,
    deities: lookup.deities,
    skills: lookup.skills,
    senses: lookup.senses,
    variantrules: lookup.variantrules,
    languages: lookup.languages,
  }

  const normalizedKind = normalizeKind(reference.kind)
  const entityMap = mapByKind[normalizedKind]
  const entity =
    entityMap?.get(getEntityKey(reference.name, reference.source)) ??
    entityMap?.get(getEntityKey(reference.name))
  if (!entity) return simpleFallback

  return {
    title: entity.name ?? reference.name,
    subtitle: `${normalizedKind.charAt(0).toUpperCase()}${normalizedKind.slice(1)}${entity.source ? ` • ${entity.source}` : ''}${entity.page ? ` p. ${entity.page}` : ''}`,
    html: getPreviewHtml(entity.entries),
  }
}

function getEntryWithHoverTitles(entry: unknown): string {
  const html = renderEntry(entry) ?? ''
  return html
    .replace(
      /\stitle="([^"]+)"((?:\sdata-hover-type="[^"]*")?)(?:\sdata-hover-name="([^"]*)")?((?:\sdata-hover-source="[^"]*")?)/g,
      (_match, title, maybeType = '', hoverName = '', maybeSource = '') =>
        ` title="${title}" data-recursive-title="${title}"${maybeType}${hoverName ? ` data-hover-name="${hoverName}"` : ''}${maybeSource}`,
    )
    .replace(/\scursor-help/g, ' cursor-help underline decoration-dotted underline-offset-2')
}

function getRecursiveHintPosition(
  target: HTMLElement,
  hasBody: boolean,
): {
  x: number
  y: number
} {
  // Get viewport-relative coordinates of the hovered element
  const rect = target.getBoundingClientRect()

  // Find the TooltipContent container (nearest positioned ancestor)
  let container = target.offsetParent as HTMLElement | null
  while (container && !container.classList.contains('[&_p]:my-0.5')) {
    container = container.offsetParent as HTMLElement | null
  }

  // If we can't find the container, look for any data-* attributes or class patterns
  if (!container) {
    container = target.closest('[role="tooltip"]') as HTMLElement | null
  }
  if (!container) {
    container = target.closest('div[class*="shadow-xl"]') as HTMLElement | null
  }

  // Get the container's viewport-relative position
  const containerRect = container?.getBoundingClientRect() || {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  }

  // Convert element coordinates to be relative to container
  const elementRelX = rect.left - containerRect.left
  const elementRelY = rect.top - containerRect.top

  const tooltipWidthEstimate = 300
  const tooltipHeightEstimate = hasBody ? 220 : 88
  const gap = 8

  // Position to the right of the hovered text, or left if no space
  const containerWidth = containerRect.right - containerRect.left
  const rightCandidate = rect.right - containerRect.left + gap
  const leftCandidate = elementRelX - tooltipWidthEstimate - gap

  let x = rightCandidate
  if (rightCandidate + tooltipWidthEstimate > containerWidth && leftCandidate >= 0) {
    x = leftCandidate
  } else if (rightCandidate + tooltipWidthEstimate > containerWidth) {
    x = Math.max(0, containerWidth - tooltipWidthEstimate - 4)
  }

  // Position below or above the hovered text
  const centeredY = elementRelY + rect.height / 2 - tooltipHeightEstimate / 2
  const preferredDown = rect.bottom - containerRect.top + gap
  const preferredUp = elementRelY - tooltipHeightEstimate - gap
  const containerHeight = containerRect.bottom - containerRect.top

  const y = Math.max(
    0,
    Math.min(
      centeredY,
      preferredDown + tooltipHeightEstimate <= containerHeight ? preferredDown : preferredUp,
    ),
  )

  return { x, y }
}

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
    togglePrepared,
    selectRacialSpell,
    removeRacialSpell,
    setRacialCastingAbility,
  } = useSpellSlots()

  const [racialChoiceModalOpen, setRacialChoiceModalOpen] = useState(false)
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

  /** For true prepared casters (Cleric/Druid/Paladin), pre-compute all castable class spells grouped by profile. */
  const preparedCasterSpellsByProfile = useMemo(() => {
    const map = new Map<string, Spell5e[]>()
    for (const detail of spellcastingDetails) {
      if (!detail.isTruePreparedCaster || detail.maxSpellLevel < 1) continue
      const profile = spellProfiles.find((p) => p.id === detail.profileId)
      if (!profile || profile.type !== 'class') continue

      const available = allSpells.filter(
        (spell) =>
          spell.level > 0 &&
          spell.level <= detail.maxSpellLevel &&
          isSpellOnClassList(spell, profile.className, profile.classSource),
      )
      available.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      map.set(detail.profileId, available)
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

  const selectionSourceByProfileAndSpell = useMemo(() => {
    const map = new Map<string, string>()
    for (const profile of spellProfiles) {
      for (const spellName of [...profile.cantrips, ...profile.spellsKnown]) {
        const key = `${profile.id}|${spellName}`
        const tags = ledger.spells[normalizeKey(spellName)] ?? []

        if (profile.type === 'class' && profile.className) {
          const classTag = tags.find(
            (tag) =>
              tag.sourceType === 'class' &&
              tag.sourceName === profile.className &&
              (tag.sourceRef ?? '') === (profile.classSource ?? ''),
          )
          if (!classTag) continue

          if (classTag.spellGrantedAtLevel) {
            const suffix =
              classTag.spellAttributionMode === 'inferred-lowest-eligible'
                ? 'Inferred Choice'
                : 'Choice'
            map.set(key, `${profile.className} Lv. ${classTag.spellGrantedAtLevel} ${suffix}`)
            continue
          }

          map.set(key, `${profile.className} Choice`)
          continue
        }

        if (tags.some((tag) => tag.sourceType === 'manual')) {
          map.set(key, 'User Choice')
        }
      }
    }

    return map
  }, [ledger.spells, spellProfiles])

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

  const racialChoiceModalConfig = useMemo(() => {
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

  const handleConfirmRacialChoice = useCallback(
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

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="space-y-6">
        <SpellProfileManager
          spellProfiles={spellProfiles}
          detailsByProfileId={detailsByProfileId}
          groupedItems={groupedItems}
          selectionSourceByProfileAndSpell={selectionSourceByProfileAndSpell}
          preparedCasterSpellsByProfile={preparedCasterSpellsByProfile}
          allSpells={allSpells}
          getSpellByName={(spellName) => spellByName.get(getEntityKey(spellName))}
          onTogglePrepared={togglePrepared}
          onRemoveSpell={handleRemoveSpell}
          onSetRacialCastingAbility={setRacialCastingAbility}
          onOpenRacialChoiceModal={handleOpenRacialChoiceModal}
          racialChoiceModalOpen={racialChoiceModalOpen}
          onRacialChoiceModalOpenChange={setRacialChoiceModalOpen}
          racialChoiceModalConfig={racialChoiceModalConfig}
          onConfirmRacialChoice={handleConfirmRacialChoice}
          characterSpellNames={characterSpellNames}
          renderSpellName={({ item, spell, sourceContext }) => (
            <SpellNameTooltip
              name={item.name}
              spell={spell}
              recursiveLookup={recursiveLookup}
              sourceContext={sourceContext}
            />
          )}
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

function SpellNameTooltip({
  name,
  spell,
  recursiveLookup,
  sourceContext,
}: {
  name: string
  spell?: Spell5e
  recursiveLookup: RecursiveLookup
  sourceContext?: string
}) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [recursiveHint, setRecursiveHint] = useState<RecursiveHintState | null>(null)

  const renderedEntries = useMemo(() => {
    if (!spell) return []
    const duplicateCounts = new Map<string, number>()

    return [...(spell.entries ?? []), ...(spell.entriesHigherLevel ?? [])].map((entry) => {
      const html = getEntryWithHoverTitles(entry)
      const duplicateCount = duplicateCounts.get(html) ?? 0
      duplicateCounts.set(html, duplicateCount + 1)

      return {
        html,
        key: `${spell.name}|entry|${duplicateCount}|${html.slice(0, 48)}`,
      }
    })
  }, [spell])

  const handleRecursiveHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const withTitle = target.closest('[data-recursive-title]') as HTMLElement | null
    if (!withTitle) {
      setRecursiveHint(null)
      return
    }

    const text = withTitle.getAttribute('data-recursive-title')
    if (!text) {
      setRecursiveHint(null)
      return
    }

    const hoverType = withTitle.getAttribute('data-hover-type') ?? undefined
    const hoverName = withTitle.getAttribute('data-hover-name') ?? undefined
    const hoverSource = withTitle.getAttribute('data-hover-source') ?? undefined
    const fallbackName = withTitle.textContent?.trim() ?? ''
    const reference = parseRecursiveReference(text, fallbackName, hoverType, hoverName, hoverSource)
    const resolved = getRecursiveTooltipData(reference, recursiveLookup, text)
    const { x, y } = getRecursiveHintPosition(withTitle, !!resolved.html)

    setRecursiveHint({
      ...resolved,
      x,
      y,
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (pinned && !nextOpen) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setRecursiveHint(null)
    }
  }

  return (
    <Tooltip open={pinned || open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <span className="text-sm truncate cursor-help border-b border-dotted border-muted-foreground/60 hover:border-accent">
          {name}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        onMouseMove={handleRecursiveHover}
        onMouseLeave={() => setRecursiveHint(null)}
        className="w-[320px] max-w-[calc(100vw-2rem)] p-0 !bg-card !text-card-foreground border border-border shadow-xl"
      >
        {spell ? (
          <>
            <div className="px-3 py-2 border-b border-border relative">
              <div className="pr-16">
                <div className="font-semibold text-xl leading-tight">{spell.name}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {formatSpellLevel(spell.level)} {getSchoolName(spell.school)}
                </div>
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPinned((value) => !value)
                    setOpen(true)
                  }}
                  className={cn(
                    'h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 flex items-center justify-center',
                    pinned ? 'text-accent border-accent/60' : 'text-muted-foreground',
                  )}
                  title={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
                >
                  <PushPin className="h-3.5 w-3.5" weight={pinned ? 'fill' : 'regular'} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPinned(false)
                    setOpen(false)
                    setRecursiveHint(null)
                  }}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 text-muted-foreground flex items-center justify-center"
                  title="Close tooltip"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-3 py-2">
              <div className="rounded border border-border bg-muted/15 p-2 text-sm space-y-1">
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Casting Time:</span>
                  <span>{formatCastingTime(spell.time)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Range:</span>
                  <span>{formatRange(spell.range)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Components:</span>
                  <span>{formatComponents(spell.components)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Duration:</span>
                  <span>{formatDuration(spell.duration)}</span>
                </div>
              </div>
            </div>

            <div className="px-3 pb-3 text-sm leading-relaxed space-y-1.5 max-h-[220px] overflow-y-auto">
              {renderedEntries.map((entry) => (
                <div
                  // renderEntry returns safe HTML from structured 5etools content.
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: entry.html }}
                  key={entry.key}
                  className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
                />
              ))}
            </div>

            <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="text-accent text-left">
                  {sourceContext ? `Source: ${sourceContext}` : ''}
                </div>
                <div className="italic text-right">
                  {spell.source}
                  {spell.page ? ` p. ${spell.page}` : ''}
                </div>
              </div>
            </div>

            {recursiveHint ? (
              <div
                className="absolute z-[90] pointer-events-none rounded border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg w-[300px]"
                style={{
                  left: `${recursiveHint.x}px`,
                  top: `${recursiveHint.y}px`,
                }}
              >
                <div className="font-semibold text-sm leading-tight">{recursiveHint.title}</div>
                {recursiveHint.subtitle ? (
                  <div className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                    {recursiveHint.subtitle}
                  </div>
                ) : null}
                {recursiveHint.html ? (
                  <div
                    // renderEntry returns safe HTML from structured 5etools content.
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: recursiveHint.html }}
                    className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
                  />
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">Details unavailable.</div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
