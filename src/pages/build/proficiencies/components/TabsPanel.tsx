import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  Brain,
  GlobeHemisphereWest,
  Shield,
  ShieldCheck,
  Sword,
  Wrench,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { AnchoredHint } from '@/components/workspace'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { normalizeKey } from '@/lib/provenance'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { hasProfInArray, type ToolChoiceSlot } from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'
import { ArmorPanel } from './tabs/ArmorPanel'
import { LanguagesPanel } from './tabs/LanguagesPanel'
import { SavingThrowsPanel } from './tabs/SavingThrowsPanel'
import { SkillsPanel } from './tabs/SkillsPanel'
import { ToolsPanel } from './tabs/ToolsPanel'
import type {
  ChoiceCounts,
  CurrentProficiencies,
  ItemGroup,
  LanguageSort,
  ProficiencyLedger,
  ResolveChoiceSelection,
  SavingThrowRow,
  SkillGroup,
  SkillRow,
  SkillSort,
  ToolSort,
  WeaponSort,
} from './tabs/types'
import { WeaponsPanel } from './tabs/WeaponsPanel'

const EXPERTISE_HINT_SELECTOR = '[data-expertise-hint="true"]'
const EXPERTISE_HINT_WIDTH = 280

export type ProficiencyTabValue =
  | 'skills'
  | 'saving-throws'
  | 'armor'
  | 'weapons'
  | 'tools'
  | 'languages'

interface CategoryConfig {
  value: ProficiencyTabValue
  label: string
  icon: PhosphorIcon
  choiceKey?: keyof ChoiceCounts
}

const CATEGORIES: CategoryConfig[] = [
  {
    value: 'skills',
    label: 'Skills',
    icon: Brain,
    choiceKey: 'skills',
  },
  {
    value: 'saving-throws',
    label: 'Saves',
    icon: ShieldCheck,
  },
  {
    value: 'armor',
    label: 'Armor',
    icon: Shield,
    choiceKey: 'armor',
  },
  {
    value: 'weapons',
    label: 'Weapons',
    icon: Sword,
    choiceKey: 'weapons',
  },
  {
    value: 'tools',
    label: 'Tools',
    icon: Wrench,
    choiceKey: 'tools',
  },
  {
    value: 'languages',
    label: 'Languages',
    icon: GlobeHemisphereWest,
    choiceKey: 'languages',
  },
]

interface BuildProficienciesCategorySwitcherProps {
  activeTab: ProficiencyTabValue
  choiceCounts: ChoiceCounts
  expertiseChoiceCount: number
  onActiveTabChange: (value: ProficiencyTabValue) => void
}

export function BuildProficienciesCategorySwitcher({
  activeTab,
  choiceCounts,
  expertiseChoiceCount,
  onActiveTabChange,
}: BuildProficienciesCategorySwitcherProps) {
  return (
    <div className="h-full min-w-0 flex-1 overflow-x-auto">
      <div
        className="inline-flex h-full min-w-max items-stretch gap-5"
        role="tablist"
        aria-label="Proficiency category"
      >
        {CATEGORIES.map(({ value, label, icon: Icon, choiceKey }) => {
          const count = choiceKey ? (choiceCounts[choiceKey] ?? 0) : 0
          const isActive = activeTab === value
          const showExpertiseBadge = value === 'skills' && expertiseChoiceCount > 0
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onActiveTabChange(value)}
              className={cn(
                'relative flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <Icon
                className={cn('size-4 shrink-0', isActive && 'text-primary')}
                weight={isActive ? 'fill' : 'regular'}
              />
              <span>{label}</span>
              {count > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold leading-none text-primary">
                  {count}
                </span>
              )}
              {showExpertiseBadge && (
                <span
                  title={`${expertiseChoiceCount} expertise slot${expertiseChoiceCount !== 1 ? 's' : ''} remaining`}
                  className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold leading-none text-amber-500"
                >
                  {expertiseChoiceCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface BuildProficienciesTabsPanelProps {
  skills: SkillRow[]
  savingThrows: SavingThrowRow[]
  availableArmor: string[]
  availableWeapons: string[]
  availableLanguages: string[]
  currentProficiencies: CurrentProficiencies
  ledger: ProficiencyLedger
  dropdownToolSlots: ToolChoiceSlot[]
  artisanToolSlots: ToolChoiceSlot[]
  /** Pre-computed list of tool names to render as selectable pills. */
  visibleToolCandidates: string[]
  /** Map from normalised artisan tool name to the choiceId of the first slot that accepts it. */
  artisanChoiceByNorm: Map<string, string>
  onFocusChange: (focus: ProfFocus) => void
  onExpandDetails: () => void
  onResolveChoiceSelection: ResolveChoiceSelection
  onToggleExpertise: (skillName: string) => void
  /** Total expertise slots from class features (Rogue, Bard, etc.). */
  availableExpertiseSlots: number
  /** Number of skills currently marked with expertise. */
  usedExpertiseSlots: number
  activeTab?: ProficiencyTabValue
  onActiveTabChange?: (value: ProficiencyTabValue) => void
  defaultTab?: ProficiencyTabValue
  /** Map from lowercased language name to its type ('standard'/'exotic'/'rare'/'secret'). */
  languageTypes: Map<string, string>
  /** Map from lowercased tool name to its generic kind ("artisan's tools"/'musical instrument'/'gaming set'). */
  toolTypeMap: Map<string, string>
  /** Map from lowercased weapon name to its category ('simple'/'martial') and ranged flag. */
  weaponInfoMap: Map<string, { category?: string; ranged?: boolean }>
}

const SKILL_ABILITY_ORDER = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]

export function BuildProficienciesTabsPanel({
  skills,
  savingThrows,
  availableArmor,
  availableWeapons,
  availableLanguages,
  currentProficiencies,
  ledger,
  dropdownToolSlots,
  artisanToolSlots,
  visibleToolCandidates,
  artisanChoiceByNorm,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
  onToggleExpertise,
  availableExpertiseSlots,
  usedExpertiseSlots,
  activeTab,
  onActiveTabChange,
  defaultTab,
  languageTypes,
  toolTypeMap,
  weaponInfoMap,
}: BuildProficienciesTabsPanelProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<ProficiencyTabValue>(
    defaultTab ?? 'skills',
  )
  const currentActiveTab = activeTab ?? internalActiveTab
  const handleActiveTabChange = (value: ProficiencyTabValue) => {
    setInternalActiveTab(value)
    onActiveTabChange?.(value)
  }
  const [skillSort, setSkillSort] = useState<SkillSort>('alpha')
  const [weaponSort, setWeaponSort] = useState<WeaponSort>('alpha')
  const [toolSort, setToolSort] = useState<ToolSort>('alpha')
  const [langSort, setLangSort] = useState<LanguageSort>('alpha')

  const [showExpertiseHint, setShowExpertiseHint] = useState(
    () => availableExpertiseSlots > 0 && !isHintDismissed('skills-expertise'),
  )
  const expertiseHintPos = useAnchoredHintPosition({
    enabled: showExpertiseHint && availableExpertiseSlots > 0,
    selector: EXPERTISE_HINT_SELECTOR,
    width: EXPERTISE_HINT_WIDTH,
  })

  const handleDismissExpertiseHint = () => {
    setShowExpertiseHint(false)
    setHintDismissed('skills-expertise', true)
  }

  const skillGroups: SkillGroup[] = (() => {
    if (skillSort === 'alpha') {
      return [{ label: null, skills: [...skills].sort((a, b) => a.name.localeCompare(b.name)) }]
    }
    if (skillSort === 'proficient') {
      const isProf = (s: SkillRow) =>
        s.proficient || (ledger.proficiencies.skills[s.name] ?? []).length > 0
      const proficient = skills.filter(isProf).sort((a, b) => a.name.localeCompare(b.name))
      const notProficient = skills
        .filter((s) => !isProf(s))
        .sort((a, b) => a.name.localeCompare(b.name))
      return [
        ...(proficient.length > 0 ? [{ label: 'Proficient', skills: proficient }] : []),
        ...(notProficient.length > 0 ? [{ label: 'Not Proficient', skills: notProficient }] : []),
      ]
    }
    return SKILL_ABILITY_ORDER.flatMap((ability) => {
      const group = skills.filter((s) => s.ability === ability)
      return group.length > 0 ? [{ label: ability, skills: group }] : []
    })
  })()

  const weaponGroups: ItemGroup[] = (() => {
    if (weaponSort === 'proficient') {
      const isProf = (w: string) =>
        hasProfInArray(currentProficiencies.weapons, w) ||
        (ledger.proficiencies.weapons[normalizeKey(w)] ?? []).length > 0
      const prof = availableWeapons.filter(isProf)
      const notProf = availableWeapons.filter((w) => !isProf(w))
      return [
        ...(prof.length > 0 ? [{ label: 'Proficient', items: prof }] : []),
        ...(notProf.length > 0 ? [{ label: 'Not Proficient', items: notProf }] : []),
      ]
    }
    if (weaponSort === 'category') {
      const buckets: Record<string, string[]> = { simple: [], martial: [], other: [] }
      for (const w of availableWeapons) {
        const lower = w.toLowerCase()
        let cat: string
        if (lower.includes('simple')) cat = 'simple'
        else if (lower.includes('martial')) cat = 'martial'
        else cat = weaponInfoMap.get(lower)?.category?.toLowerCase() ?? 'other'
        buckets[cat in buckets ? cat : 'other'].push(w)
      }
      return [
        ...(buckets.simple.length > 0 ? [{ label: 'Simple Weapons', items: buckets.simple }] : []),
        ...(buckets.martial.length > 0
          ? [{ label: 'Martial Weapons', items: buckets.martial }]
          : []),
        ...(buckets.other.length > 0 ? [{ label: 'Other', items: buckets.other }] : []),
      ]
    }
    if (weaponSort === 'melee-ranged') {
      const buckets: Record<string, string[]> = { melee: [], ranged: [], other: [] }
      for (const w of availableWeapons) {
        const lower = w.toLowerCase()
        let type: string
        if (lower.includes('ranged')) type = 'ranged'
        else if (lower.includes('melee')) type = 'melee'
        else {
          const info = weaponInfoMap.get(lower)
          if (info?.ranged === true) type = 'ranged'
          else if (info?.ranged === false) type = 'melee'
          else type = 'other'
        }
        buckets[type].push(w)
      }
      return [
        ...(buckets.melee.length > 0 ? [{ label: 'Melee', items: buckets.melee }] : []),
        ...(buckets.ranged.length > 0 ? [{ label: 'Ranged', items: buckets.ranged }] : []),
        ...(buckets.other.length > 0 ? [{ label: 'Other', items: buckets.other }] : []),
      ]
    }
    return [{ label: null as null, items: availableWeapons }]
  })()

  const toolGroups: ItemGroup[] = (() => {
    if (toolSort === 'proficient') {
      const isProf = (t: string) =>
        hasProfInArray(currentProficiencies.tools, t) ||
        (ledger.proficiencies.tools[normalizeKey(t)] ?? []).length > 0
      const prof = visibleToolCandidates.filter(isProf)
      const notProf = visibleToolCandidates.filter((t) => !isProf(t))
      return [
        ...(prof.length > 0 ? [{ label: 'Proficient', items: prof }] : []),
        ...(notProf.length > 0 ? [{ label: 'Not Proficient', items: notProf }] : []),
      ]
    }
    if (toolSort === 'type') {
      const buckets: Record<string, string[]> = {
        "artisan's tools": [],
        'musical instrument': [],
        'gaming set': [],
        other: [],
      }
      for (const t of visibleToolCandidates) {
        const kind = toolTypeMap.get(t.toLowerCase())
        const key = kind && kind in buckets ? kind : 'other'
        buckets[key].push(t)
      }
      return [
        ...(buckets["artisan's tools"].length > 0
          ? [{ label: "Artisan's Tools", items: buckets["artisan's tools"] }]
          : []),
        ...(buckets['musical instrument'].length > 0
          ? [{ label: 'Musical Instruments', items: buckets['musical instrument'] }]
          : []),
        ...(buckets['gaming set'].length > 0
          ? [{ label: 'Gaming Sets', items: buckets['gaming set'] }]
          : []),
        ...(buckets.other.length > 0 ? [{ label: 'Other Tools', items: buckets.other }] : []),
      ]
    }
    return [{ label: null as null, items: visibleToolCandidates }]
  })()

  const langGroups: ItemGroup[] = (() => {
    if (langSort === 'proficient') {
      const isProf = (l: string) =>
        hasProfInArray(currentProficiencies.languages, l) ||
        (ledger.proficiencies.languages[normalizeKey(l)] ?? []).length > 0
      const prof = availableLanguages.filter(isProf)
      const notProf = availableLanguages.filter((l) => !isProf(l))
      return [
        ...(prof.length > 0 ? [{ label: 'Proficient', items: prof }] : []),
        ...(notProf.length > 0 ? [{ label: 'Not Proficient', items: notProf }] : []),
      ]
    }
    if (langSort === 'type') {
      const TYPE_ORDER = ['standard', 'exotic', 'rare', 'secret']
      const buckets: Record<string, string[]> = {
        standard: [],
        exotic: [],
        rare: [],
        secret: [],
        unknown: [],
      }
      for (const l of availableLanguages) {
        const type = languageTypes.get(l.toLowerCase()) ?? 'unknown'
        const key = type in buckets ? type : 'unknown'
        buckets[key].push(l)
      }
      return [
        ...TYPE_ORDER.filter((t) => buckets[t].length > 0).map((t) => ({
          label: t.charAt(0).toUpperCase() + t.slice(1),
          items: buckets[t],
        })),
        ...(buckets.unknown.length > 0 ? [{ label: 'Other', items: buckets.unknown }] : []),
      ]
    }
    return [{ label: null as null, items: availableLanguages }]
  })()

  return (
    <>
      <AnchoredHint
        position={showExpertiseHint ? expertiseHintPos : null}
        width={EXPERTISE_HINT_WIDTH}
        onDismiss={handleDismissExpertiseHint}
      >
        Click the two dots on a proficient skill to toggle expertise — doubling your proficiency
        bonus for that skill.
      </AnchoredHint>
      <Tabs
        value={currentActiveTab}
        onValueChange={(value) => handleActiveTabChange(value as ProficiencyTabValue)}
      >
        <TabsContent value="skills">
          <SkillsPanel
            groups={skillGroups}
            ledger={ledger}
            sort={skillSort}
            onSortChange={setSkillSort}
            onFocusChange={onFocusChange}
            onExpandDetails={onExpandDetails}
            onResolveChoiceSelection={onResolveChoiceSelection}
            onToggleExpertise={onToggleExpertise}
            availableExpertiseSlots={availableExpertiseSlots}
            usedExpertiseSlots={usedExpertiseSlots}
          />
        </TabsContent>

        <TabsContent value="saving-throws">
          <SavingThrowsPanel
            savingThrows={savingThrows}
            ledger={ledger}
            onFocusChange={onFocusChange}
            onExpandDetails={onExpandDetails}
          />
        </TabsContent>

        <TabsContent value="armor">
          <ArmorPanel
            availableArmor={availableArmor}
            currentArmor={currentProficiencies.armor}
            ledger={ledger}
            onFocusChange={onFocusChange}
            onExpandDetails={onExpandDetails}
            onResolveChoiceSelection={onResolveChoiceSelection}
          />
        </TabsContent>

        <TabsContent value="weapons">
          <WeaponsPanel
            groups={weaponGroups}
            currentWeapons={currentProficiencies.weapons}
            ledger={ledger}
            sort={weaponSort}
            onSortChange={setWeaponSort}
            onFocusChange={onFocusChange}
            onExpandDetails={onExpandDetails}
            onResolveChoiceSelection={onResolveChoiceSelection}
          />
        </TabsContent>

        <TabsContent value="tools">
          <ToolsPanel
            groups={toolGroups}
            visibleToolCandidates={visibleToolCandidates}
            currentTools={currentProficiencies.tools}
            ledger={ledger}
            sort={toolSort}
            onSortChange={setToolSort}
            dropdownToolSlots={dropdownToolSlots}
            artisanToolSlots={artisanToolSlots}
            artisanChoiceByNorm={artisanChoiceByNorm}
            onFocusChange={onFocusChange}
            onExpandDetails={onExpandDetails}
            onResolveChoiceSelection={onResolveChoiceSelection}
          />
        </TabsContent>

        <TabsContent value="languages">
          <LanguagesPanel
            groups={langGroups}
            availableLanguages={availableLanguages}
            currentLanguages={currentProficiencies.languages}
            ledger={ledger}
            sort={langSort}
            onSortChange={setLangSort}
            onFocusChange={onFocusChange}
            onExpandDetails={onExpandDetails}
            onResolveChoiceSelection={onResolveChoiceSelection}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
