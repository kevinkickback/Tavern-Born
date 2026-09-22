import { DiceFive, SlidersHorizontal, Sparkle, Sword, Warning } from '@phosphor-icons/react'
import { type ReactNode, useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { getAbilityScoreMethodOptions } from '@/lib/calculations/abilityScoreMethods'
import { getVariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import type { VariantRules } from '@/types/character'

type BooleanRuleKey = Exclude<keyof VariantRules, 'abilityScoreMethod'>
type RulesPanel = 'ruleset' | 'character-options'

const RULES_PANELS = [
  { value: 'ruleset', label: 'Ruleset', icon: Sparkle },
  { value: 'character-options', label: 'Character Options', icon: Sword },
] as const

function getActivePanel(panel: string | null): RulesPanel {
  if (panel === 'advancement' || panel === 'character-options') return 'character-options'
  return 'ruleset'
}

interface RuleRowProps {
  label: string
  description: string
  checked: boolean
  available?: boolean
  unavailableDescription?: string
  onCheckedChange: (checked: boolean) => void
}

function RuleRow({
  label,
  description,
  checked,
  available = true,
  unavailableDescription,
  onCheckedChange,
}: RuleRowProps) {
  const id = useId()
  const unavailable = !available
  return (
    <div className="flex items-start justify-between gap-5 border-b border-border-subtle py-3 last:border-b-0">
      <div className="min-w-0">
        <Label
          htmlFor={id}
          className={cn(
            'cursor-pointer text-sm font-medium',
            unavailable && !checked && 'cursor-not-allowed text-muted-foreground',
          )}
        >
          {label}
        </Label>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
        {unavailable && unavailableDescription && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {checked ? 'Currently inactive. ' : ''}
            {unavailableDescription}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={unavailable && !checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

function RulesSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      data-slot="rules-section"
      className="rounded-lg border border-border bg-workspace-pane"
    >
      <div className="flex items-start gap-3 border-b border-border bg-surface-raised/45 px-4 py-3">
        <div className="mt-0.5 text-primary">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-4">{children}</div>
    </section>
  )
}

export function RulesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdPrefix = useId()
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const activePanel = getActivePanel(searchParams.get('section'))
  const { classes, classFeatures, optionalfeatures } = useFilteredGameData()
  const contentAvailability = getVariantRuleContentAvailability({
    classes,
    classFeatures,
    optionalFeatures: optionalfeatures,
  })

  const setActivePanel = (panel: RulesPanel) => {
    setSearchParams(panel === 'ruleset' ? {} : { section: panel }, { replace: true })
  }

  if (!character) {
    return <NoCharCard icon={<SlidersHorizontal weight="duotone" />} noun="manage rules" />
  }

  const rules = character.variantRules ?? {}
  const abilityMethod = rules.abilityScoreMethod ?? 'standard-array'
  const abilityMethods = getAbilityScoreMethodOptions(character.originSystem)
  const hasOptionalFeatureSelections =
    Object.values(character.provenance?.features ?? {}).some((tags) =>
      tags.some((tag) => tag.sourceType === 'optionalFeature'),
    ) ||
    (character.classChoiceSelections ?? []).some(
      (selection) => selection.inactive || selection.kind === 'optional-feature',
    )

  const updateRules = (updates: Partial<VariantRules>) => {
    updateCharacter(character.id, { variantRules: { ...rules, ...updates } })
  }

  const updateBooleanRule = (key: BooleanRuleKey, checked: boolean) => {
    const selectedSubclass = character.classProgression.find((entry) => entry.subclass)?.subclass
    if (!checked && key === 'optionalClassFeatures' && hasOptionalFeatureSelections) {
      toast.warning('Existing optional class feature selections are saved.', {
        description:
          'Replacement choices become dormant while this rule is off and are restored when it is enabled again.',
      })
    }
    if (
      !checked &&
      key === 'anyRaceSubclasses' &&
      ['bladesinger', 'battlerager'].includes(selectedSubclass?.toLowerCase() ?? '')
    ) {
      toast.warning(`Your existing ${selectedSubclass} subclass will be kept.`, {
        description: 'This rule will apply the next time you choose a subclass.',
      })
    }
    if (key === 'optionalClassFeatures') {
      const result = reconcileOptionalClassFeatureChoicesCommand(
        character,
        character.provenance,
        classes,
        checked,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
        variantRules: { ...rules, [key]: checked },
      })
      return
    }
    updateRules({ [key]: checked })
  }

  const rulesetLabel =
    character.originSystem === '2024' ? '5.5e Revised (2024)' : '5e Legacy (2014)'

  return (
    <WorkspacePage>
      <WorkspacePaneHeader ariaLabel="Rules category">
        <div className="h-full min-w-0 flex-1 overflow-x-auto">
          <div
            className="inline-flex h-full min-w-max items-stretch gap-5"
            role="tablist"
            aria-label="Rules category"
          >
            {RULES_PANELS.map(({ value, label, icon: Icon }) => {
              const active = activePanel === value
              return (
                <button
                  key={value}
                  id={`${tabIdPrefix}-tab-${value}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${tabIdPrefix}-panel-${value}`}
                  onClick={() => setActivePanel(value)}
                  className={cn(
                    'relative flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  <Icon
                    className={cn('size-4 shrink-0', active && 'text-primary')}
                    weight={active ? 'fill' : 'regular'}
                  />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </WorkspacePaneHeader>
      <WorkspaceBody>
        <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-5">
          <Alert className="border-warning/35 bg-warning/10 text-foreground [&>svg]:text-warning">
            <Warning />
            <AlertDescription>
              Changing a rule does not remove choices already made. Review the affected Builder page
              when changing a rule your character has already used.
            </AlertDescription>
          </Alert>

          <div
            id={`${tabIdPrefix}-panel-${activePanel}`}
            role="tabpanel"
            aria-labelledby={`${tabIdPrefix}-tab-${activePanel}`}
          >
            {activePanel === 'ruleset' && (
              <RulesSection
                icon={<Sparkle className="size-5" weight="fill" />}
                title="Ruleset"
                description="The rules foundation selected when this character was created."
              >
                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium">{rulesetLabel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Switching rulesets requires rebuilding origin and progression choices, so it
                      cannot be changed here.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-accent bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    Fixed
                  </span>
                </div>
              </RulesSection>
            )}

            {activePanel === 'character-options' && (
              <div className="space-y-5">
                <RulesSection
                  icon={<DiceFive className="size-5" weight="fill" />}
                  title="Creation & Advancement"
                  description="Choose how ability scores and level-up options are handled."
                >
                  <div className="py-4">
                    <p className="text-sm font-medium">Ability Score Method</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Changing the method does not replace your existing scores.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {abilityMethods.map((method) => {
                        const selected = abilityMethod === method.value
                        return (
                          <Button
                            key={method.value}
                            type="button"
                            variant="outline"
                            aria-pressed={selected}
                            onClick={() => updateRules({ abilityScoreMethod: method.value })}
                            className={cn(
                              'h-auto min-h-16 flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left',
                              selected && 'border-primary bg-surface-selected text-foreground',
                            )}
                          >
                            <span className="font-semibold">{method.label}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {method.description}
                            </span>
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                  <RuleRow
                    label="Average Hit Points"
                    description="Use the fixed average automatically when leveling up. When disabled, each level asks you to roll or enter the hit-die result. Existing level-up HP is unchanged."
                    checked={rules.averageHitPoints !== false}
                    onCheckedChange={(checked) => updateBooleanRule('averageHitPoints', checked)}
                  />
                </RulesSection>

                <RulesSection
                  icon={<Sword className="size-5" weight="fill" />}
                  title="Option Restrictions"
                  description="Adjust restrictions applied while choosing character options."
                >
                  <RuleRow
                    label="Optional Class Features"
                    description="Show optional and replacement class features, including options introduced in Tasha's Cauldron of Everything."
                    checked={rules.optionalClassFeatures ?? false}
                    available={contentAvailability.optionalClassFeatures}
                    unavailableDescription="No optional or replacement class features are available from your selected content."
                    onCheckedChange={(checked) =>
                      updateBooleanRule('optionalClassFeatures', checked)
                    }
                  />
                  <RuleRow
                    label="Any-Race Subclasses"
                    description="Allow any character to choose a subclass even when its source limits that subclass to a particular race."
                    checked={rules.anyRaceSubclasses ?? false}
                    available={contentAvailability.anyRaceSubclasses}
                    unavailableDescription="No race-restricted subclasses are available from your selected content."
                    onCheckedChange={(checked) => updateBooleanRule('anyRaceSubclasses', checked)}
                  />
                  <RuleRow
                    label="Ignore Equipment Restrictions"
                    description="Allow equipment to be used even when its normal proficiency or usage requirements are not met."
                    checked={rules.ignoreEquipRestrictions ?? false}
                    onCheckedChange={(checked) =>
                      updateBooleanRule('ignoreEquipRestrictions', checked)
                    }
                  />
                </RulesSection>
              </div>
            )}
          </div>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
