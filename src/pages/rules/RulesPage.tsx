import { DiceFive, SlidersHorizontal, Sparkle, Sword, Warning } from '@phosphor-icons/react'
import { type ReactNode, useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import type { VariantRules } from '@/types/character'

type BooleanRuleKey = Exclude<keyof VariantRules, 'abilityScoreMethod'>
type RulesPanel = 'ruleset' | 'advancement' | 'character-options'

const RULES_PANELS = [
  { value: 'ruleset', label: 'Ruleset', icon: Sparkle },
  { value: 'advancement', label: 'Advancement', icon: DiceFive },
  { value: 'character-options', label: 'Character Options', icon: Sword },
] as const

function getActivePanel(panel: string | null): RulesPanel {
  if (panel === 'advancement' || panel === 'character-options') return panel
  return 'ruleset'
}

interface RuleRowProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function RuleRow({ label, description, checked, onCheckedChange }: RuleRowProps) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-5 border-b border-border-subtle py-3 last:border-b-0">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
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

const ABILITY_METHODS = [
  {
    value: 'point-buy' as const,
    label: 'Point Buy',
    description: 'Use the 27-point budget when editing scores.',
  },
  {
    value: 'standard-array' as const,
    label: 'Standard Array',
    description: 'Assign 15, 14, 13, 12, 10, and 8.',
  },
  {
    value: 'custom' as const,
    label: 'Custom',
    description: 'Enter scores freely, including rolled scores.',
  },
]

export function RulesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const activePanel = getActivePanel(searchParams.get('section'))

  const setActivePanel = (panel: RulesPanel) => {
    setSearchParams(panel === 'ruleset' ? {} : { section: panel }, { replace: true })
  }

  if (!character) {
    return <NoCharCard icon={<SlidersHorizontal weight="duotone" />} noun="manage rules" />
  }

  const rules = character.variantRules ?? {}
  const abilityMethod = rules.abilityScoreMethod ?? 'standard-array'
  const hasOptionalFeatureGrants = Object.values(character.provenance?.features ?? {}).some(
    (tags) => tags.some((tag) => tag.sourceType === 'optionalFeature'),
  )

  const updateRules = (updates: Partial<VariantRules>) => {
    updateCharacter(character.id, { variantRules: { ...rules, ...updates } })
  }

  const updateBooleanRule = (key: BooleanRuleKey, checked: boolean) => {
    if (!checked && key === 'optionalClassFeatures' && hasOptionalFeatureGrants) {
      toast.warning('Existing optional class feature choices will be kept.', {
        description: 'Review the Class page if you want to replace or remove them.',
      })
    }
    if (
      !checked &&
      ((key === 'bladesingerAnyRace' && character.subclass?.toLowerCase() === 'bladesinger') ||
        (key === 'battleragerAnyRace' && character.subclass?.toLowerCase() === 'battlerager'))
    ) {
      toast.warning(`Your existing ${character.subclass} subclass will be kept.`, {
        description: 'This rule will apply the next time you choose a subclass.',
      })
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
                  id={`rules-tab-${value}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`rules-panel-${value}`}
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
            id={`rules-panel-${activePanel}`}
            role="tabpanel"
            aria-labelledby={`rules-tab-${activePanel}`}
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

            {activePanel === 'advancement' && (
              <RulesSection
                icon={<DiceFive className="size-5" weight="fill" />}
                title="Advancement"
                description="Choose how ability scores and level-up options are handled."
              >
                <div className="py-4">
                  <p className="text-sm font-medium">Ability Score Method</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Changing the method does not replace your existing scores.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {ABILITY_METHODS.map((method) => {
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
                <RuleRow
                  label="Optional Class Features"
                  description="Show optional and replacement class features, including options introduced in Tasha's Cauldron of Everything."
                  checked={rules.optionalClassFeatures ?? false}
                  onCheckedChange={(checked) => updateBooleanRule('optionalClassFeatures', checked)}
                />
              </RulesSection>
            )}

            {activePanel === 'character-options' && (
              <RulesSection
                icon={<Sword className="size-5" weight="fill" />}
                title="Character Options"
                description="Adjust restrictions applied while choosing character options."
              >
                <RuleRow
                  label="Bladesinger Any Race"
                  description="Allow characters of any race to choose the Bladesinger Wizard subclass."
                  checked={rules.bladesingerAnyRace ?? false}
                  onCheckedChange={(checked) => updateBooleanRule('bladesingerAnyRace', checked)}
                />
                <RuleRow
                  label="Battlerager Any Race"
                  description="Allow characters of any race to choose the Battlerager Barbarian subclass."
                  checked={rules.battleragerAnyRace ?? false}
                  onCheckedChange={(checked) => updateBooleanRule('battleragerAnyRace', checked)}
                />
                <RuleRow
                  label="Prefer Newer Printings"
                  description="Hide older versions when newer printings of the same race, class, feat, spell, or item are available."
                  checked={rules.preferNewerPrintings ?? false}
                  onCheckedChange={(checked) => updateBooleanRule('preferNewerPrintings', checked)}
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
            )}
          </div>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
