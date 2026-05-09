import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  Brain,
  Check,
  GlobeHemisphereWest,
  Shield,
  ShieldCheck,
  Sword,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { normalizeKey } from '@/lib/provenance'
import type { ChoiceRecord, ProficiencyProvenance } from '@/lib/provenance/types'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import {
  hasProfInArray,
  hasUnresolvedChoiceForKind,
  normalizeGenericToolKind,
  type ToolChoiceSlot,
} from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'

const EXPERTISE_HINT_SELECTOR = '[data-expertise-hint="true"]'
const EXPERTISE_HINT_WIDTH = 280

interface HintPosition {
  top: number
  left: number
  arrowLeft: number
}

type TabValue = 'skills' | 'saving-throws' | 'armor' | 'weapons' | 'tools' | 'languages'

type ChoiceCounts = Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number>

interface CategoryConfig {
  value: TabValue
  label: string
  icon: PhosphorIcon
  gradient: string
  iconColor: string
  choiceKey?: keyof ChoiceCounts
}

const CATEGORIES: CategoryConfig[] = [
  {
    value: 'skills',
    label: 'Skills',
    icon: Brain,
    gradient: 'from-violet-500/50 to-violet-500/10',
    iconColor: 'text-violet-400',
    choiceKey: 'skills',
  },
  {
    value: 'saving-throws',
    label: 'Saves',
    icon: ShieldCheck,
    gradient: 'from-blue-500/50 to-blue-500/10',
    iconColor: 'text-blue-400',
  },
  {
    value: 'armor',
    label: 'Armor',
    icon: Shield,
    gradient: 'from-slate-500/50 to-slate-500/10',
    iconColor: 'text-slate-400',
    choiceKey: 'armor',
  },
  {
    value: 'weapons',
    label: 'Weapons',
    icon: Sword,
    gradient: 'from-red-500/50 to-red-500/10',
    iconColor: 'text-red-400',
    choiceKey: 'weapons',
  },
  {
    value: 'tools',
    label: 'Tools',
    icon: Wrench,
    gradient: 'from-amber-500/50 to-amber-500/10',
    iconColor: 'text-amber-400',
    choiceKey: 'tools',
  },
  {
    value: 'languages',
    label: 'Languages',
    icon: GlobeHemisphereWest,
    gradient: 'from-emerald-500/50 to-emerald-500/10',
    iconColor: 'text-emerald-400',
    choiceKey: 'languages',
  },
]

interface SkillRow {
  name: string
  ability: string
  proficient: boolean
  expertise: boolean
  modifierString: string
}

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
  focused: ProfFocus | null
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
  defaultTab?: 'skills' | 'saving-throws' | 'armor' | 'weapons' | 'tools' | 'languages'
}

function formatProfLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /(^|[\s/-])([a-z])/g,
      (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`,
    )
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
  choiceCounts,
  dropdownToolSlots,
  artisanToolSlots,
  visibleToolCandidates,
  artisanChoiceByNorm,
  focused,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
  onToggleExpertise,
  availableExpertiseSlots,
  usedExpertiseSlots,
  expertiseChoiceCount,
  defaultTab,
}: BuildProficienciesTabsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabValue>(defaultTab ?? 'skills')

  const [showExpertiseHint, setShowExpertiseHint] = useState(
    () => availableExpertiseSlots > 0 && !isHintDismissed('skills-expertise'),
  )
  const [expertiseHintPos, setExpertiseHintPos] = useState<HintPosition | null>(null)

  const handleDismissExpertiseHint = () => {
    setShowExpertiseHint(false)
    setHintDismissed('skills-expertise', true)
  }

  useEffect(() => {
    if (!showExpertiseHint || availableExpertiseSlots === 0) {
      setExpertiseHintPos(null)
      return
    }

    const update = () => {
      const btn = document.querySelector<HTMLElement>(EXPERTISE_HINT_SELECTOR)
      if (!btn) {
        setExpertiseHintPos(null)
        return
      }
      const rect = btn.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const maxLeft = Math.max(16, window.innerWidth - EXPERTISE_HINT_WIDTH - 16)
      const left = Math.min(Math.max(centerX - EXPERTISE_HINT_WIDTH / 2, 16), maxLeft)
      const arrowLeft = Math.min(Math.max(centerX - left, 18), EXPERTISE_HINT_WIDTH - 18)
      setExpertiseHintPos({ top: rect.bottom + 12, left, arrowLeft })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [showExpertiseHint, availableExpertiseSlots])

  const choiceSelectedClass =
    'border-2 border-accent border-dashed bg-accent/15 text-accent-foreground hover:bg-accent/25'
  const fixedSelectedClass =
    'border-accent/60 bg-accent/80 text-accent-foreground hover:bg-accent/70'

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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        {/* MTD-style category icon cards */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
          {CATEGORIES.map(({ value, label, icon: Icon, gradient, iconColor, choiceKey }) => {
            const count = choiceKey ? (choiceCounts[choiceKey] ?? 0) : 0
            const isActive = activeTab === value
            const showExpertiseBadge = value === 'skills' && expertiseChoiceCount > 0
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value)}
                className={cn(
                  'relative flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all duration-200',
                  isActive
                    ? 'border-accent bg-card shadow-sm ring-1 ring-accent/20'
                    : 'border-border bg-muted/20 hover:border-accent/40 hover:bg-card/60',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br shrink-0',
                    gradient,
                  )}
                >
                  <Icon className={cn('h-4.5 w-4.5', iconColor)} weight="bold" />
                </div>
                <span
                  className={cn(
                    'text-[11px] font-semibold leading-tight text-center',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                    {count}
                  </span>
                )}
                {showExpertiseBadge && (
                  <span
                    title={`${expertiseChoiceCount} expertise slot${expertiseChoiceCount !== 1 ? 's' : ''} remaining`}
                    className={cn(
                      'absolute -right-1.5 h-4 min-w-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none',
                      count > 0 ? 'top-2.5' : '-top-1.5',
                    )}
                  >
                    {expertiseChoiceCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <TabsContent value="skills">
          <div className="space-y-4">
            {SKILL_ABILITY_ORDER.map((ability) => {
              const group = skills.filter((s) => s.ability === ability)
              if (group.length === 0) return null
              return (
                <div key={ability}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {ability}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.map((skill) => {
                      const normName = skill.name
                      const hasLedgerGrant =
                        (ledger.proficiencies.skills[normName] ?? []).length > 0
                      const isSelected = skill.proficient || hasLedgerGrant
                      const isFixed = (ledger.proficiencies.skills[normName] ?? []).some(
                        (tag) => tag.grantType === 'fixed',
                      )
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
                      const canDeselect = isChoiceSelected && !isFixed
                      const isFocused = focused?.type === 'skill' && focused.name === skill.name
                      const canAddExpertise =
                        isSelected &&
                        !skill.expertise &&
                        usedExpertiseSlots < availableExpertiseSlots
                      const canRemoveExpertise = isSelected && skill.expertise
                      const canToggleExpertise = canAddExpertise || canRemoveExpertise

                      return (
                        <div
                          key={skill.name}
                          className={cn(
                            'inline-flex items-stretch rounded-lg border text-sm transition-all font-medium overflow-hidden focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
                            isChoiceSelected
                              ? choiceSelectedClass
                              : isSelected
                                ? fixedSelectedClass
                                : canSelect
                                  ? 'border-border bg-card text-foreground hover:border-accent'
                                  : 'border-border bg-card text-muted-foreground opacity-50',
                            isFocused && 'ring-2 ring-accent/70 ring-offset-2',
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
                            onMouseEnter={() => {
                              onFocusChange({
                                type: 'skill',
                                name: skill.name,
                                ability: skill.ability,
                                proficient: isSelected,
                                expertise: skill.expertise,
                                modifierString: skill.modifierString,
                              })
                              onExpandDetails()
                            }}
                            onClick={() => {
                              if (canDeselect) onResolveChoiceSelection('skills', skill.name, false)
                              else if (canSelect)
                                onResolveChoiceSelection('skills', skill.name, true)
                            }}
                            className="px-3 py-2 focus-visible:outline-none"
                          >
                            {formatProfLabel(skill.name)}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="saving-throws">
          <div className="flex flex-wrap gap-2">
            {savingThrows.map((save) => {
              const normAbility = normalizeKey(save.ability)
              const abbr = SAVE_ABBREVIATIONS[normAbility]
              const hasLedgerGrant =
                (ledger.proficiencies.savingThrows[normAbility] ?? []).length > 0 ||
                (abbr ? (ledger.proficiencies.savingThrows[abbr] ?? []).length > 0 : false)
              const isSelected = save.proficient || hasLedgerGrant
              const isFocused = focused?.type === 'save' && focused.ability === save.ability

              return (
                <button
                  key={save.ability}
                  type="button"
                  onMouseEnter={() => {
                    onFocusChange({
                      type: 'save',
                      ability: save.ability,
                      proficient: isSelected,
                      modifierString: save.modifierString,
                    })
                    onExpandDetails()
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                    isSelected
                      ? 'border-accent bg-accent text-accent-foreground hover:bg-accent/80'
                      : 'border-border bg-card text-muted-foreground opacity-50',
                    isFocused && 'ring-2 ring-accent ring-offset-2',
                  )}
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  <span>{formatProfLabel(save.ability)}</span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="armor">
          <div className="flex flex-wrap gap-2">
            {availableArmor.map((armorKey) => {
              const normArmor = normalizeKey(armorKey)
              const hasLedgerGrant = (ledger.proficiencies.armor[normArmor] ?? []).length > 0
              const isSelected =
                hasProfInArray(currentProficiencies.armor, armorKey) || hasLedgerGrant
              const isFixed = (ledger.proficiencies.armor[normArmor] ?? []).some(
                (tag) => tag.grantType === 'fixed',
              )
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
              const canDeselect = isChoiceSelected && !isFixed
              return (
                <button
                  key={armorKey}
                  type="button"
                  onClick={() => {
                    if (canDeselect) onResolveChoiceSelection('armor', armorKey, false)
                    else if (canSelect) onResolveChoiceSelection('armor', armorKey, true)
                  }}
                  onMouseEnter={() => {
                    onFocusChange({
                      type: 'item',
                      category: 'armor',
                      name: armorKey,
                      isProficient: isSelected,
                    })
                    onExpandDetails()
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                    isChoiceSelected
                      ? choiceSelectedClass
                      : isSelected
                        ? fixedSelectedClass
                        : canSelect
                          ? 'border-border bg-card text-foreground hover:border-accent'
                          : 'border-border bg-card text-muted-foreground opacity-50',
                    focused?.type === 'item' &&
                      focused.name === armorKey &&
                      'ring-2 ring-accent ring-offset-2',
                  )}
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  <span>{formatProfLabel(armorKey)}</span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="weapons">
          <div className="flex flex-wrap gap-2">
            {availableWeapons.map((weaponKey) => {
              const normWeapon = normalizeKey(weaponKey)
              const hasLedgerGrant = (ledger.proficiencies.weapons[normWeapon] ?? []).length > 0
              const isSelected =
                hasProfInArray(currentProficiencies.weapons, weaponKey) || hasLedgerGrant
              const isFixed = (ledger.proficiencies.weapons[normWeapon] ?? []).some(
                (tag) => tag.grantType === 'fixed',
              )
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
              const canDeselect = isChoiceSelected && !isFixed
              return (
                <button
                  key={weaponKey}
                  type="button"
                  onClick={() => {
                    if (canDeselect) onResolveChoiceSelection('weapons', weaponKey, false)
                    else if (canSelect) onResolveChoiceSelection('weapons', weaponKey, true)
                  }}
                  onMouseEnter={() => {
                    onFocusChange({
                      type: 'item',
                      category: 'weapons',
                      name: weaponKey,
                      isProficient: isSelected,
                    })
                    onExpandDetails()
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                    isChoiceSelected
                      ? choiceSelectedClass
                      : isSelected
                        ? fixedSelectedClass
                        : canSelect
                          ? 'border-border bg-card text-foreground hover:border-accent'
                          : 'border-border bg-card text-muted-foreground opacity-50',
                    focused?.type === 'item' &&
                      focused.name === weaponKey &&
                      'ring-2 ring-accent ring-offset-2',
                  )}
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Sword className="h-3.5 w-3.5" />
                  )}
                  <span>{formatProfLabel(weaponKey)}</span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="tools">
          <div className="flex flex-wrap gap-2">
            {dropdownToolSlots.length > 0 && (
              <div className="w-full space-y-2 mb-1">
                {dropdownToolSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="w-full max-w-lg rounded-lg border border-border bg-card p-2.5"
                  >
                    <p className="text-xs text-muted-foreground mb-2">
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
                      <SelectTrigger className="h-9 border-dashed">
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
            {visibleToolCandidates.length > 0 ? (
              visibleToolCandidates.map((toolName) => {
                const normTool = normalizeKey(toolName)
                const genericKind = normalizeGenericToolKind(toolName)
                const isGenericKind = Boolean(genericKind)
                const hasOptionalChoiceForKind = genericKind
                  ? hasUnresolvedChoiceForKind(ledger.choices, genericKind)
                  : false
                const hasLedgerGrant = (ledger.proficiencies.tools[normTool] ?? []).length > 0
                const isSelected =
                  hasProfInArray(currentProficiencies.tools, toolName) || hasLedgerGrant
                const isFixed = (ledger.proficiencies.tools[normTool] ?? []).some(
                  (tag) => tag.grantType === 'fixed',
                )
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
                    // Artisan expansion: tool appears in an unfilled artisan slot
                    artisanToolSlots.some((slot) =>
                      slot.options.some((opt) => normalizeKey(opt) === normTool),
                    ))
                const canDeselect = isChoiceSelected && !isFixed

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
                    onMouseEnter={() => {
                      onFocusChange({
                        type: 'item',
                        category: 'tools',
                        name: toolName,
                        isProficient: isSelected,
                      })
                      onExpandDetails()
                    }}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                      isGenericKind
                        ? hasOptionalChoiceForKind
                          ? 'border-border border-dashed bg-card text-foreground/80 cursor-default'
                          : 'border-border border-dashed bg-card text-muted-foreground opacity-50 cursor-default'
                        : isChoiceSelected
                          ? choiceSelectedClass
                          : isSelected
                            ? fixedSelectedClass
                            : canSelect
                              ? 'border-border bg-card text-foreground hover:border-accent'
                              : 'border-border bg-card text-muted-foreground opacity-50',
                      focused?.type === 'item' &&
                        focused.name === toolName &&
                        'ring-2 ring-accent/70 ring-offset-2',
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" />
                    )}
                    {formatProfLabel(toolName)}
                  </button>
                )
              })
            ) : (
              <p className="text-muted-foreground text-sm">No tools available in game data</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="languages">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {availableLanguages.length > 0 ? (
                availableLanguages.map((languageName) => {
                  const normLang = normalizeKey(languageName)
                  const hasLedgerGrant = (ledger.proficiencies.languages[normLang] ?? []).length > 0
                  const isSelected =
                    hasProfInArray(currentProficiencies.languages, languageName) || hasLedgerGrant
                  const isFixed = (ledger.proficiencies.languages[normLang] ?? []).some(
                    (tag) => tag.grantType === 'fixed',
                  )
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
                  const canDeselect = isChoiceSelected && !isFixed

                  return (
                    <button
                      key={languageName}
                      type="button"
                      onClick={() => {
                        if (canDeselect) onResolveChoiceSelection('languages', languageName, false)
                        else if (canSelect)
                          onResolveChoiceSelection('languages', languageName, true)
                      }}
                      onMouseEnter={() => {
                        onFocusChange({
                          type: 'item',
                          category: 'languages',
                          name: languageName,
                          isProficient: isSelected,
                        })
                        onExpandDetails()
                      }}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                        isChoiceSelected
                          ? choiceSelectedClass
                          : isSelected
                            ? fixedSelectedClass
                            : canSelect
                              ? 'border-border bg-card text-foreground hover:border-accent'
                              : 'border-border bg-card text-muted-foreground opacity-50',
                        focused?.type === 'item' &&
                          focused.name === languageName &&
                          'ring-2 ring-accent/70 ring-offset-2',
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <GlobeHemisphereWest className="h-3.5 w-3.5" />
                      )}
                      {formatProfLabel(languageName)}
                    </button>
                  )
                })
              ) : (
                <p className="text-muted-foreground text-sm">No languages available in game data</p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
