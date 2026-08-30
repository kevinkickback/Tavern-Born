import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  ArrowCounterClockwise,
  Brain,
  Check,
  GlobeHemisphereWest,
  LockSimple,
  Plus,
  Shield,
  ShieldCheck,
  Sword,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { normalizeKey } from '@/lib/provenance'
import type { ChoiceRecord, ProficiencyProvenance } from '@/lib/provenance/types'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import {
  formatWeaponCategoryLabel,
  hasProfInArray,
  hasUnresolvedChoiceForKind,
  normalizeGenericToolKind,
  type ToolChoiceSlot,
} from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'

const EXPERTISE_HINT_SELECTOR = '[data-expertise-hint="true"]'
const EXPERTISE_HINT_WIDTH = 280

export type ProficiencyTabValue =
  | 'skills'
  | 'saving-throws'
  | 'armor'
  | 'weapons'
  | 'tools'
  | 'languages'

type ChoiceCounts = Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number>

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

interface SkillRow {
  name: string
  ability: string
  proficient: boolean
  expertise: boolean
  modifierString: string
}

type SkillSort = 'ability' | 'alpha' | 'proficient'
type SkillGroup = { label: string | null; skills: SkillRow[] }

type WeaponSort = 'alpha' | 'category' | 'melee-ranged' | 'proficient'
type ToolSort = 'alpha' | 'type' | 'proficient'
type LangSort = 'alpha' | 'type' | 'proficient'
type ProficiencyRowState = 'chosen' | 'granted' | 'available' | 'unavailable'

interface SavingThrowRow {
  ability: string
  proficient: boolean
  modifierString: string
}

interface BuildProficienciesTabsPanelProps {
  skills: SkillRow[]
  savingThrows: SavingThrowRow[]
  availableArmor: string[]
  availableWeapons: string[]
  availableLanguages: string[]
  currentProficiencies: {
    armor: string[]
    weapons: string[]
    tools: string[]
    languages: string[]
  }
  ledger: {
    choices: ChoiceRecord[]
    proficiencies: ProficiencyProvenance
  }
  choiceCounts: Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number>
  dropdownToolSlots: ToolChoiceSlot[]
  artisanToolSlots: ToolChoiceSlot[]
  /** Pre-computed list of tool names to render as selectable pills. */
  visibleToolCandidates: string[]
  /** Map from normalised artisan tool name to the choiceId of the first slot that accepts it. */
  artisanChoiceByNorm: Map<string, string>
  onFocusChange: (focus: ProfFocus) => void
  onExpandDetails: () => void
  onResolveChoiceSelection: (
    domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons',
    itemName: string,
    adding: boolean,
    choiceId?: string,
  ) => void
  onToggleExpertise: (skillName: string) => void
  /** Total expertise slots from class features (Rogue, Bard, etc.). */
  availableExpertiseSlots: number
  /** Number of skills currently marked with expertise. */
  usedExpertiseSlots: number
  /** Unspent expertise slots — shown as a separate badge on the Skills card. */
  expertiseChoiceCount: number
  activeTab?: ProficiencyTabValue
  onActiveTabChange?: (value: ProficiencyTabValue) => void
  defaultTab?: ProficiencyTabValue
  /** Map from lowercased language name to its type ('standard'/'exotic'/'rare'/'secret'). */
  languageTypes: Map<string, string>
  /** Map from lowercased tool name to its generic kind ("artisan's tools"/'musical instrument'/'gaming set'). */
  toolTypeMap: Map<string, string>
  /** Map from lowercased weapon name to its category ('simple'/'martial') and ranged flag. */
  weaponInfoMap: Map<string, { category?: string; ranged?: boolean }>
  /** Retained for callers that coordinate the current inspector item. */
  focused?: ProfFocus | null
}

function formatProfLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /(^|[\s/-])([a-z])/g,
      (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`,
    )
}

function ProficiencyStatus({ state }: { state: ProficiencyRowState }) {
  const label =
    state === 'chosen'
      ? 'Chosen'
      : state === 'granted'
        ? 'Granted'
        : state === 'available'
          ? 'Available'
          : 'Unavailable'
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11px] font-semibold',
        state === 'chosen' && 'border-primary/50 bg-primary/10 text-primary',
        state === 'granted' && 'border-success/40 bg-success/10 text-success',
        state === 'available' && 'border-primary/50 bg-primary/10 text-primary',
        state === 'unavailable' && 'border-border bg-muted/20 text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function ProficiencyStateIcon({
  state,
  fallback,
  actionable = false,
}: {
  state: ProficiencyRowState
  fallback: ReactNode
  actionable?: boolean
}) {
  if (state === 'chosen') {
    return (
      <span className="relative size-3.5 shrink-0" aria-hidden="true">
        <Check className="size-3.5 group-hover:hidden group-focus-visible:hidden" />
        <ArrowCounterClockwise className="hidden size-3.5 group-hover:block group-focus-visible:block" />
      </span>
    )
  }
  if (state === 'granted') return <LockSimple className="size-3.5 shrink-0" aria-hidden="true" />
  if (state === 'available' && actionable) {
    return <Plus className="size-3.5 shrink-0" aria-hidden="true" />
  }
  return fallback
}

const SAVE_ABBREVIATIONS: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
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
  const [langSort, setLangSort] = useState<LangSort>('alpha')

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

  const choiceSelectedClass = 'bg-primary/10 text-foreground hover:bg-primary/15'
  const fixedSelectedClass = 'bg-success/10 text-foreground hover:bg-success/15'

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

  const weaponGroups: Array<{ label: string | null; items: string[] }> = (() => {
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

  const toolGroups: Array<{ label: string | null; items: string[] }> = (() => {
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

  const langGroups: Array<{ label: string | null; items: string[] }> = (() => {
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
      {showExpertiseHint && expertiseHintPos ? (
        <div
          className="pointer-events-none fixed z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300"
          style={{ top: expertiseHintPos.top, left: expertiseHintPos.left }}
        >
          <div className="pointer-events-auto animate-hint-bounce relative w-[280px] rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20">
            <div
              className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-accent/50 bg-accent"
              style={{ left: expertiseHintPos.arrowLeft - 7 }}
            />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white"
              onClick={handleDismissExpertiseHint}
              aria-label="Dismiss hint"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="leading-snug text-accent-foreground/95 pr-8">
              Click the two dots on a proficient skill to toggle expertise — doubling your
              proficiency bonus for that skill.
            </p>
          </div>
        </div>
      ) : null}
      <Tabs
        value={currentActiveTab}
        onValueChange={(value) => handleActiveTabChange(value as ProficiencyTabValue)}
      >
        <TabsContent value="skills">
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <Select value={skillSort} onValueChange={(v) => setSkillSort(v as SkillSort)}>
                <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alpha" className="text-xs">
                    Alphabetical
                  </SelectItem>
                  <SelectItem value="ability" className="text-xs">
                    By type
                  </SelectItem>
                  <SelectItem value="proficient" className="text-xs">
                    Proficient first
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {skillGroups.map(({ label, skills: groupSkills }) => (
              <div key={label ?? 'all'}>
                {label && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-background 2xl:grid-cols-2">
                  {groupSkills.map((skill) => {
                    const normName = skill.name
                    const sourceTags = ledger.proficiencies.skills[normName] ?? []
                    const hasLedgerGrant = sourceTags.length > 0
                    const isSelected = skill.proficient || hasLedgerGrant
                    const isChoiceSelected = ledger.choices.some(
                      (choice) =>
                        choice.domain === 'skills' &&
                        choice.selected.some((selected) => normalizeKey(selected) === normName),
                    )
                    const canSelect =
                      !isSelected &&
                      ledger.choices.some(
                        (choice) =>
                          choice.domain === 'skills' &&
                          choice.selected.length < choice.chooseCount &&
                          (choice.optionPool.length === 0 ||
                            choice.optionPool.some(
                              (poolEntry) => normalizeKey(poolEntry) === normName,
                            )),
                      )
                    const canDeselect = isChoiceSelected
                    const canAddExpertise =
                      isSelected && !skill.expertise && usedExpertiseSlots < availableExpertiseSlots
                    const canRemoveExpertise = isSelected && skill.expertise
                    const canToggleExpertise = canAddExpertise || canRemoveExpertise
                    const rowState: ProficiencyRowState = isChoiceSelected
                      ? 'chosen'
                      : isSelected
                        ? 'granted'
                        : canSelect
                          ? 'available'
                          : 'unavailable'
                    const focusSkill = () => {
                      onFocusChange({
                        type: 'skill',
                        name: skill.name,
                        ability: skill.ability,
                        proficient: isSelected,
                        expertise: skill.expertise,
                        modifierString: skill.modifierString,
                      })
                      onExpandDetails()
                    }

                    return (
                      <fieldset
                        key={skill.name}
                        onMouseEnter={focusSkill}
                        onFocusCapture={focusSkill}
                        aria-label={`${formatProfLabel(skill.name)} proficiency`}
                        className={cn(
                          'inline-flex min-h-11 min-w-0 items-stretch overflow-hidden bg-background text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-within:z-10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-inset',
                          isChoiceSelected
                            ? choiceSelectedClass
                            : isSelected
                              ? fixedSelectedClass
                              : canSelect
                                ? 'bg-background text-foreground hover:bg-primary/5'
                                : 'bg-background text-foreground hover:bg-primary/5',
                        )}
                      >
                        <button
                          type="button"
                          tabIndex={canToggleExpertise ? 0 : -1}
                          data-expertise-hint={canToggleExpertise ? 'true' : undefined}
                          title={
                            canRemoveExpertise
                              ? `Remove expertise: ${formatProfLabel(skill.name)}`
                              : canAddExpertise
                                ? `Add expertise: ${formatProfLabel(skill.name)}`
                                : undefined
                          }
                          onClick={() => {
                            if (canToggleExpertise) onToggleExpertise(skill.name)
                          }}
                          className={cn(
                            'px-2 self-stretch flex flex-col items-center justify-center gap-1 border-r border-current/20 shrink-0 focus-visible:outline-none',
                            canToggleExpertise
                              ? 'cursor-pointer hover:opacity-70'
                              : 'cursor-default',
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full transition-colors pointer-events-none',
                              isSelected ? 'bg-current' : 'bg-current/20',
                            )}
                          />
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full transition-colors pointer-events-none',
                              skill.expertise ? 'bg-current' : 'bg-current/20',
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (canDeselect) onResolveChoiceSelection('skills', skill.name, false)
                            else if (canSelect) onResolveChoiceSelection('skills', skill.name, true)
                          }}
                          title={
                            canDeselect
                              ? `Remove choice: ${formatProfLabel(skill.name)}`
                              : isSelected
                                ? `${formatProfLabel(skill.name)} is granted and cannot be removed`
                                : canSelect
                                  ? `Choose ${formatProfLabel(skill.name)}`
                                  : undefined
                          }
                          className={cn(
                            'group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none',
                            canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                          )}
                        >
                          <ProficiencyStateIcon
                            state={rowState}
                            actionable={canSelect || canDeselect}
                            fallback={<Brain className="size-3.5 shrink-0" aria-hidden="true" />}
                          />
                          <span className="truncate">{formatProfLabel(skill.name)}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <span className="text-xs font-normal text-muted-foreground">
                              {skill.ability.toUpperCase()}
                            </span>
                            <ProficiencyStatus state={rowState} />
                          </span>
                        </button>
                      </fieldset>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="saving-throws">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-background sm:grid-cols-2 2xl:grid-cols-3">
            {savingThrows.map((save) => {
              const normAbility = normalizeKey(save.ability)
              const abbr = SAVE_ABBREVIATIONS[normAbility]
              const sourceTags = [
                ...(ledger.proficiencies.savingThrows[normAbility] ?? []),
                ...(abbr ? (ledger.proficiencies.savingThrows[abbr] ?? []) : []),
              ]
              const hasLedgerGrant = sourceTags.length > 0
              const isSelected = save.proficient || hasLedgerGrant
              const rowState: ProficiencyRowState = isSelected ? 'granted' : 'unavailable'
              const focusSave = () => {
                onFocusChange({
                  type: 'save',
                  ability: save.ability,
                  proficient: isSelected,
                  modifierString: save.modifierString,
                })
                onExpandDetails()
              }

              return (
                <button
                  key={save.ability}
                  type="button"
                  onMouseEnter={focusSave}
                  onFocus={focusSave}
                  className={cn(
                    'group inline-flex min-h-11 min-w-0 cursor-default items-center gap-2 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                    isSelected
                      ? fixedSelectedClass
                      : 'bg-background text-foreground hover:bg-primary/5',
                  )}
                >
                  <ProficiencyStateIcon
                    state={rowState}
                    fallback={<ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />}
                  />
                  <span>{formatProfLabel(save.ability)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="text-xs font-normal text-muted-foreground">
                      {save.modifierString}
                    </span>
                    <ProficiencyStatus state={rowState} />
                  </span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="armor">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-background sm:grid-cols-2">
            {availableArmor.map((armorKey) => {
              const normArmor = normalizeKey(armorKey)
              const sourceTags = ledger.proficiencies.armor[normArmor] ?? []
              const hasLedgerGrant = sourceTags.length > 0
              const isSelected =
                hasProfInArray(currentProficiencies.armor, armorKey) || hasLedgerGrant
              const isChoiceSelected = ledger.choices.some(
                (choice) =>
                  choice.domain === 'armor' &&
                  choice.selected.some((selected) => normalizeKey(selected) === normArmor),
              )
              const canSelect =
                !isSelected &&
                ledger.choices.some(
                  (choice) =>
                    choice.domain === 'armor' &&
                    choice.selected.length < choice.chooseCount &&
                    (choice.optionPool.length === 0 ||
                      choice.optionPool.some((poolEntry) => normalizeKey(poolEntry) === normArmor)),
                )
              const canDeselect = isChoiceSelected
              const rowState: ProficiencyRowState = isChoiceSelected
                ? 'chosen'
                : isSelected
                  ? 'granted'
                  : canSelect
                    ? 'available'
                    : 'unavailable'
              const focusArmor = () => {
                onFocusChange({
                  type: 'item',
                  category: 'armor',
                  name: armorKey,
                  isProficient: isSelected,
                })
                onExpandDetails()
              }
              return (
                <button
                  key={armorKey}
                  type="button"
                  onClick={() => {
                    if (canDeselect) onResolveChoiceSelection('armor', armorKey, false)
                    else if (canSelect) onResolveChoiceSelection('armor', armorKey, true)
                  }}
                  onMouseEnter={focusArmor}
                  onFocus={focusArmor}
                  title={
                    canDeselect
                      ? `Remove choice: ${formatProfLabel(armorKey)}`
                      : isSelected
                        ? `${formatProfLabel(armorKey)} is granted and cannot be removed`
                        : canSelect
                          ? `Choose ${formatProfLabel(armorKey)}`
                          : undefined
                  }
                  className={cn(
                    'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                    canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                    isChoiceSelected
                      ? choiceSelectedClass
                      : isSelected
                        ? fixedSelectedClass
                        : canSelect
                          ? 'bg-background text-foreground hover:bg-primary/5'
                          : 'bg-background text-foreground hover:bg-primary/5',
                  )}
                >
                  <ProficiencyStateIcon
                    state={rowState}
                    actionable={canSelect || canDeselect}
                    fallback={<Shield className="size-3.5 shrink-0" aria-hidden="true" />}
                  />
                  <span>{formatProfLabel(armorKey)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <ProficiencyStatus state={rowState} />
                  </span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="weapons">
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <Select value={weaponSort} onValueChange={(v) => setWeaponSort(v as WeaponSort)}>
                <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alpha" className="text-xs">
                    Alphabetical
                  </SelectItem>
                  <SelectItem value="category" className="text-xs">
                    By category
                  </SelectItem>
                  <SelectItem value="melee-ranged" className="text-xs">
                    By type
                  </SelectItem>
                  <SelectItem value="proficient" className="text-xs">
                    Proficient first
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {weaponGroups.map(({ label, items: groupWeapons }) => (
              <div key={label ?? 'all'}>
                {label && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-background 2xl:grid-cols-2">
                  {groupWeapons.map((weaponKey) => {
                    const normWeapon = normalizeKey(weaponKey)
                    const sourceTags = ledger.proficiencies.weapons[normWeapon] ?? []
                    const hasLedgerGrant = sourceTags.length > 0
                    const isSelected =
                      hasProfInArray(currentProficiencies.weapons, weaponKey) || hasLedgerGrant
                    const isChoiceSelected = ledger.choices.some(
                      (choice) =>
                        choice.domain === 'weapons' &&
                        choice.selected.some((selected) => normalizeKey(selected) === normWeapon),
                    )
                    const canSelect =
                      !isSelected &&
                      ledger.choices.some(
                        (choice) =>
                          choice.domain === 'weapons' &&
                          choice.selected.length < choice.chooseCount &&
                          (choice.optionPool.length === 0 ||
                            choice.optionPool.some(
                              (poolEntry) => normalizeKey(poolEntry) === normWeapon,
                            )),
                      )
                    const canDeselect = isChoiceSelected
                    const rowState: ProficiencyRowState = isChoiceSelected
                      ? 'chosen'
                      : isSelected
                        ? 'granted'
                        : canSelect
                          ? 'available'
                          : 'unavailable'
                    const focusWeapon = () => {
                      onFocusChange({
                        type: 'item',
                        category: 'weapons',
                        name: weaponKey,
                        isProficient: isSelected,
                      })
                      onExpandDetails()
                    }
                    return (
                      <button
                        key={weaponKey}
                        type="button"
                        onClick={() => {
                          if (canDeselect) onResolveChoiceSelection('weapons', weaponKey, false)
                          else if (canSelect) onResolveChoiceSelection('weapons', weaponKey, true)
                        }}
                        onMouseEnter={focusWeapon}
                        onFocus={focusWeapon}
                        title={
                          canDeselect
                            ? `Remove choice: ${formatProfLabel(weaponKey)}`
                            : isSelected
                              ? `${formatProfLabel(weaponKey)} is granted and cannot be removed`
                              : canSelect
                                ? `Choose ${formatProfLabel(weaponKey)}`
                                : undefined
                        }
                        className={cn(
                          'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                          canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                          isChoiceSelected
                            ? choiceSelectedClass
                            : isSelected
                              ? fixedSelectedClass
                              : canSelect
                                ? 'bg-background text-foreground hover:bg-primary/5'
                                : 'bg-background text-foreground hover:bg-primary/5',
                        )}
                      >
                        <ProficiencyStateIcon
                          state={rowState}
                          actionable={canSelect || canDeselect}
                          fallback={<Sword className="size-3.5 shrink-0" aria-hidden="true" />}
                        />
                        <span>
                          {formatWeaponCategoryLabel(weaponKey) ?? formatProfLabel(weaponKey)}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          <ProficiencyStatus state={rowState} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tools">
          <div className="space-y-4">
            {dropdownToolSlots.length > 0 && (
              <div className="w-full space-y-2">
                {dropdownToolSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="w-full max-w-lg border-l-2 border-primary/50 bg-secondary/20 px-3 py-2.5"
                  >
                    <p className="mb-2 text-sm text-muted-foreground">
                      {slot.sourceName}: choose {formatProfLabel(slot.label)}
                    </p>
                    <Select
                      onValueChange={(value) => {
                        onResolveChoiceSelection('tools', value, true, slot.choiceId)
                        onFocusChange({
                          type: 'item',
                          category: 'tools',
                          name: value,
                          isProficient: true,
                        })
                        onExpandDetails()
                      }}
                      disabled={slot.options.length === 0}
                    >
                      <SelectTrigger className="h-9 cursor-pointer border-dashed">
                        <SelectValue placeholder={`${formatProfLabel(slot.label)} (choose type)`} />
                      </SelectTrigger>
                      <SelectContent>
                        {slot.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {formatProfLabel(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <Select value={toolSort} onValueChange={(v) => setToolSort(v as ToolSort)}>
                <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alpha" className="text-xs">
                    Alphabetical
                  </SelectItem>
                  <SelectItem value="type" className="text-xs">
                    By type
                  </SelectItem>
                  <SelectItem value="proficient" className="text-xs">
                    Proficient first
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visibleToolCandidates.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tools available in game data</p>
            ) : (
              toolGroups.map(({ label, items: groupTools }) => (
                <div key={label ?? 'all'}>
                  {label && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {label}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-background 2xl:grid-cols-2">
                    {groupTools.map((toolName) => {
                      const normTool = normalizeKey(toolName)
                      const genericKind = normalizeGenericToolKind(toolName)
                      const isGenericKind = Boolean(genericKind)
                      const hasOptionalChoiceForKind = genericKind
                        ? hasUnresolvedChoiceForKind(ledger.choices, genericKind)
                        : false
                      const sourceTags = ledger.proficiencies.tools[normTool] ?? []
                      const hasLedgerGrant = sourceTags.length > 0
                      const isSelected =
                        hasProfInArray(currentProficiencies.tools, toolName) || hasLedgerGrant
                      const isChoiceSelected = ledger.choices.some(
                        (choice) =>
                          choice.domain === 'tools' &&
                          choice.selected.some((selected) => normalizeKey(selected) === normTool),
                      )
                      const artisanChoiceId = artisanChoiceByNorm.get(normTool)
                      const canSelect =
                        !isSelected &&
                        (ledger.choices.some(
                          (choice) =>
                            choice.domain === 'tools' &&
                            choice.selected.length < choice.chooseCount &&
                            (choice.optionPool.length === 0 ||
                              choice.optionPool.some(
                                (poolEntry) => normalizeKey(poolEntry) === normTool,
                              )),
                        ) ||
                          artisanToolSlots.some((slot) =>
                            slot.options.some((opt) => normalizeKey(opt) === normTool),
                          ))
                      const canDeselect = isChoiceSelected
                      const rowState: ProficiencyRowState = isChoiceSelected
                        ? 'chosen'
                        : isSelected
                          ? 'granted'
                          : canSelect || (isGenericKind && hasOptionalChoiceForKind)
                            ? 'available'
                            : 'unavailable'
                      const focusTool = () => {
                        onFocusChange({
                          type: 'item',
                          category: 'tools',
                          name: toolName,
                          isProficient: isSelected,
                        })
                        onExpandDetails()
                      }

                      return (
                        <button
                          key={toolName}
                          type="button"
                          onClick={() => {
                            if (isGenericKind) return
                            if (canDeselect) onResolveChoiceSelection('tools', toolName, false)
                            else if (canSelect)
                              onResolveChoiceSelection('tools', toolName, true, artisanChoiceId)
                          }}
                          onMouseEnter={focusTool}
                          onFocus={focusTool}
                          title={
                            canDeselect
                              ? `Remove choice: ${formatProfLabel(toolName)}`
                              : isSelected
                                ? `${formatProfLabel(toolName)} is granted and cannot be removed`
                                : canSelect
                                  ? `Choose ${formatProfLabel(toolName)}`
                                  : undefined
                          }
                          className={cn(
                            'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                            !isGenericKind && (canSelect || canDeselect)
                              ? 'cursor-pointer'
                              : 'cursor-default',
                            isGenericKind
                              ? hasOptionalChoiceForKind
                                ? 'bg-primary/5 text-foreground hover:bg-primary/10'
                                : 'bg-background text-foreground hover:bg-primary/5'
                              : isChoiceSelected
                                ? choiceSelectedClass
                                : isSelected
                                  ? fixedSelectedClass
                                  : canSelect
                                    ? 'bg-background text-foreground hover:bg-primary/5'
                                    : 'bg-background text-foreground hover:bg-primary/5',
                          )}
                        >
                          <ProficiencyStateIcon
                            state={rowState}
                            actionable={!isGenericKind && (canSelect || canDeselect)}
                            fallback={<Wrench className="size-3.5 shrink-0" aria-hidden="true" />}
                          />
                          <span className="truncate">{formatProfLabel(toolName)}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <ProficiencyStatus state={rowState} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="languages">
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <Select value={langSort} onValueChange={(v) => setLangSort(v as LangSort)}>
                <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alpha" className="text-xs">
                    Alphabetical
                  </SelectItem>
                  <SelectItem value="type" className="text-xs">
                    By type
                  </SelectItem>
                  <SelectItem value="proficient" className="text-xs">
                    Proficient first
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {availableLanguages.length === 0 ? (
              <p className="text-muted-foreground text-sm">No languages available in game data</p>
            ) : (
              langGroups.map(({ label, items: groupLangs }) => (
                <div key={label ?? 'all'}>
                  {label && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {label}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-background 2xl:grid-cols-2">
                    {groupLangs.map((languageName) => {
                      const normLang = normalizeKey(languageName)
                      const sourceTags = ledger.proficiencies.languages[normLang] ?? []
                      const hasLedgerGrant = sourceTags.length > 0
                      const isSelected =
                        hasProfInArray(currentProficiencies.languages, languageName) ||
                        hasLedgerGrant
                      const isChoiceSelected = ledger.choices.some(
                        (choice) =>
                          choice.domain === 'languages' &&
                          choice.selected.some((selected) => normalizeKey(selected) === normLang),
                      )
                      const canSelect =
                        !isSelected &&
                        ledger.choices.some(
                          (choice) =>
                            choice.domain === 'languages' &&
                            choice.selected.length < choice.chooseCount &&
                            (choice.optionPool.length === 0 ||
                              choice.optionPool.some(
                                (poolEntry) => normalizeKey(poolEntry) === normLang,
                              )),
                        )
                      const canDeselect = isChoiceSelected
                      const rowState: ProficiencyRowState = isChoiceSelected
                        ? 'chosen'
                        : isSelected
                          ? 'granted'
                          : canSelect
                            ? 'available'
                            : 'unavailable'
                      const focusLanguage = () => {
                        onFocusChange({
                          type: 'item',
                          category: 'languages',
                          name: languageName,
                          isProficient: isSelected,
                        })
                        onExpandDetails()
                      }

                      return (
                        <button
                          key={languageName}
                          type="button"
                          onClick={() => {
                            if (canDeselect)
                              onResolveChoiceSelection('languages', languageName, false)
                            else if (canSelect)
                              onResolveChoiceSelection('languages', languageName, true)
                          }}
                          onMouseEnter={focusLanguage}
                          onFocus={focusLanguage}
                          title={
                            canDeselect
                              ? `Remove choice: ${formatProfLabel(languageName)}`
                              : isSelected
                                ? `${formatProfLabel(languageName)} is granted and cannot be removed`
                                : canSelect
                                  ? `Choose ${formatProfLabel(languageName)}`
                                  : undefined
                          }
                          className={cn(
                            'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                            canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                            isChoiceSelected
                              ? choiceSelectedClass
                              : isSelected
                                ? fixedSelectedClass
                                : canSelect
                                  ? 'bg-background text-foreground hover:bg-primary/5'
                                  : 'bg-background text-foreground hover:bg-primary/5',
                          )}
                        >
                          <ProficiencyStateIcon
                            state={rowState}
                            actionable={canSelect || canDeselect}
                            fallback={
                              <GlobeHemisphereWest
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                            }
                          />
                          <span className="truncate">{formatProfLabel(languageName)}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <ProficiencyStatus state={rowState} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
