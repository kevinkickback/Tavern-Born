import { Check, Sword } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WorkspacePaneHeader } from '@/components/workspace'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { buildClassSpellSelectionsByLevel } from '@/lib/calculations/spellProfiles'
import { getClassChoiceFeatureTarget } from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoiceOptionView,
  isClassChoiceOptionEligible,
} from '@/lib/character/classChoiceOptions'
import type { FeatureOptionSelectionState } from '@/lib/character/featureOptionSelections'
import type { ManagedClassSpellStatus } from '@/lib/character/managedClassSpells'
import type { OptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { optionalClassOwner } from '@/lib/character/optionalClassFeatureIdentity'
import {
  getSubclassConfigurations,
  hasUnavailableSubclassConfiguration,
} from '@/lib/character/subclassConfigurations'
import { getClassIconUrl } from '@/lib/classIcons'
import {
  classAsiReadinessId,
  classChoiceDiagnosticReadinessId,
  classChoiceReadinessId,
  classSubclassReadinessId,
  findFocusedProvenanceChoice,
} from '@/lib/navigation/readinessFocus'
import { readinessClassKey } from '@/lib/readiness/readinessIssue'
import { cn } from '@/lib/utils'
import type { ClassDetailsSelection } from '@/pages/build/class/model/pageUtils'
import type { Class5e, Feat5e, Spell5e, Subclass5e } from '@/types/5etools'
import type { AsiChoice, Character, CharacterClassEntry, Feat } from '@/types/character'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { computeLevelDisplayData } from '../model/levelsUtils'
import { BuildClassAsiSection } from './AsiSection'
import { BuildClassChoicesSection } from './ClassChoicesSection'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'
import { BuildClassEquipmentSection } from './EquipmentSection'
import {
  belongsToOptionalClassFeatures,
  getClassChoicePresentationTarget,
  getVisibleOptionalClassFeatures,
  OptionalClassFeatures,
  optionalClassFeaturesOwnChoice,
  optionalClassFeaturesOwnDiagnostic,
} from './OptionalClassFeatures'
import { BuildClassPassiveFeatureList } from './PassiveFeatureList'
import { BuildClassSpellSection } from './SpellSection'
import { BuildClassSubclassSection } from './SubclassSection'

interface BuildClassLevelsPanelProps {
  managedSpellStatuses?: readonly ManagedClassSpellStatus[]
  optionalClassActivity?: OptionalClassFeatureActivity
  classProgression: CharacterClassEntry[]
  selectedClassTab: string
  onSelectClassTab: (className: string) => void
  character: Character
  levelsToShow: number[]
  subclassLevel: number | undefined
  asiLevels: number[]
  spellChoicesByLevel: Map<
    number,
    {
      cantrips: number
      spells: number
      maxSpellLevel: number
      canSwap: boolean
    }
  >
  featuresByLevel: Map<number, ClassFeatureDisplay[]>
  subclassFeatureName: string | null
  selectedFeature: SelectedFeatureState | null
  viewingClassData?: Class5e
  viewingSubclass?: string
  viewingSubclassData?: Subclass5e
  detailCollapsed: boolean
  viewingClass: string
  viewingClassSource?: string
  viewingClassLevel: number
  classEquipmentBlockChoices: string[]
  classEquipmentItemChoices?: Readonly<Record<string, string>>
  feats: Feat5e[]
  spellByReference: Map<string, Spell5e>
  appliedAsiChoicesForClass: AsiChoice[]
  classAsiFeats: Feat[]
  asiModeByLevel: Record<string, 'asi' | 'feat'>
  usedASI: number
  totalASIAcrossClasses: number
  classChoices: NormalizedCharacterChoice[]
  classChoiceRecoveries?: readonly FeatureOptionSelectionState[]
  onRecoverClassChoice?: (state: FeatureOptionSelectionState) => void
  classChoiceDiagnostics: ClassChoiceDiagnostic[]
  selectedClassChoiceViewsById: ReadonlyMap<string, ClassChoiceOptionView[]>
  onOpenClassPicker: () => void
  onOpenSubclassPicker: () => void
  onOpenSpellPicker: (level: number) => void
  onOpenFeatPicker: (level: number) => void
  onOpenAsiPicker: (level: number) => void
  onOpenClassChoice: (choice: NormalizedCharacterChoice) => void
  onBlockChoiceChange: (blockIndex: number, choice: string) => void
  onItemChoiceChange?: (blockIndex: number, choice: string, key: string, itemRef: string) => void
  onSelectFeature: (feature: ClassDetailsSelection) => void
  onExpandDetails: () => void
  onAsiReset: (level: number) => void
  onSetAsiModeByLevel: (levelKey: string, mode: 'asi' | 'feat') => void
  onClearFeatSelectionsForAsi: (level: number) => void
  getOrdinalForm: (n: number) => string
  focusLevel?: number
  readinessFocus?: string | null
}

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function featureOwnsChoice(
  feature: ClassFeatureDisplay,
  choice: NormalizedCharacterChoice,
): boolean {
  if (feature.origin?.kind === 'declared') {
    if (JSON.stringify(feature.origin.owner) !== JSON.stringify(optionalClassOwner(choice.owner)))
      return false
    const target = getClassChoicePresentationTarget(choice)
    if (target && target !== feature.origin.target) return false
  }
  if (normalized(feature.name) !== normalized(choice.owner.featureName)) return false
  return (
    !feature.source ||
    !choice.owner.featureSource ||
    normalized(feature.source) === normalized(choice.owner.featureSource)
  )
}

function featureOwnsDiagnostic(
  feature: ClassFeatureDisplay,
  diagnostic: ClassChoiceDiagnostic,
): boolean {
  if (feature.origin?.kind === 'declared') {
    const target =
      diagnostic.requiredChoice && getClassChoiceFeatureTarget(diagnostic.requiredChoice.target)
    if (
      !target ||
      target !== feature.origin.target ||
      JSON.stringify(feature.origin.owner) !==
        JSON.stringify(
          optionalClassOwner({
            name: diagnostic.className,
            source: diagnostic.classSource,
            subclassName: diagnostic.subclassName,
            subclassSource: diagnostic.subclassSource,
          }),
        )
    )
      return false
  }
  return normalized(feature.name) === normalized(diagnostic.featureName)
}

export function BuildClassLevelsPanel({
  managedSpellStatuses = [],
  optionalClassActivity,
  classProgression,
  selectedClassTab,
  onSelectClassTab,
  character,
  levelsToShow,
  subclassLevel,
  asiLevels,
  spellChoicesByLevel,
  featuresByLevel,
  subclassFeatureName,
  selectedFeature,
  viewingClassData,
  viewingSubclass,
  viewingSubclassData,
  detailCollapsed,
  viewingClass,
  viewingClassSource,
  viewingClassLevel,
  classEquipmentBlockChoices,
  classEquipmentItemChoices = {},
  feats,
  spellByReference,
  appliedAsiChoicesForClass,
  classAsiFeats,
  asiModeByLevel,
  usedASI,
  totalASIAcrossClasses,
  classChoices,
  classChoiceRecoveries = [],
  onRecoverClassChoice,
  classChoiceDiagnostics,
  selectedClassChoiceViewsById,
  onOpenClassPicker,
  onOpenSubclassPicker,
  onOpenSpellPicker,
  onOpenFeatPicker,
  onOpenAsiPicker,
  onOpenClassChoice,
  onBlockChoiceChange,
  onItemChoiceChange = () => undefined,
  onSelectFeature,
  onExpandDetails,
  onAsiReset,
  onSetAsiModeByLevel,
  onClearFeatSelectionsForAsi,
  getOrdinalForm,
  focusLevel,
  readinessFocus,
}: BuildClassLevelsPanelProps) {
  const [openSections, setOpenSections] = useState<string[]>([])
  const configurations = getSubclassConfigurations(
    classChoices,
    viewingClassData,
    viewingSubclassData,
  ).filter((choice) => choice.level === subclassLevel && levelsToShow.includes(choice.level))
  const configurationIds = new Set(configurations.map((choice) => choice.id))
  const { ref: classPickerRef, highlighted: classPickerHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(readinessFocus === 'identity:class')
  const focusedClassChoice = findFocusedProvenanceChoice(
    readinessFocus,
    character.provenance.choices,
  )
  const focusedViewingClassChoice =
    focusedClassChoice?.sourceTag.sourceType === 'class' &&
    focusedClassChoice.sourceTag.sourceName === viewingClass
      ? focusedClassChoice
      : undefined
  const viewingClassKey = readinessClassKey({
    name: viewingClass,
    source: viewingClassSource ?? viewingClassData?.source ?? '',
  })
  const focusedNormalizedChoiceId = [
    ...classChoices,
    ...classChoiceRecoveries.map((state) => ({ id: state.selection.choiceId })),
  ].find((choice) => readinessFocus === classChoiceReadinessId(choice.id))?.id
  const isDiagnosticFocused = (diagnostic: ClassChoiceDiagnostic) =>
    readinessFocus ===
    classChoiceDiagnosticReadinessId(
      viewingClassKey,
      diagnostic.featureName,
      diagnostic.code,
      diagnostic.featureName === 'Natural Explorer' && diagnostic.requiredChoice?.target.ref
        ? { ref: diagnostic.requiredChoice.target.ref, level: diagnostic.level ?? 1 }
        : undefined,
    )
  const focusedEquipmentChoice =
    focusedViewingClassChoice?.domain === 'equipment' ? focusedViewingClassChoice : undefined
  const { ref: equipmentChoiceRef, highlighted: equipmentChoiceHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(!!focusedEquipmentChoice)
  const { ref: classChoiceRef, highlighted: classChoiceHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(
      focusedViewingClassChoice?.domain === 'features' ||
        focusedViewingClassChoice?.domain === 'feats',
    )

  useEffect(() => {
    if (!focusLevel) return
    const section = `level-${focusLevel}`
    setOpenSections((current) => (current.includes(section) ? current : [...current, section]))
  }, [focusLevel])

  useEffect(() => {
    if (!focusedEquipmentChoice) return
    setOpenSections((current) =>
      current.includes('starting-equipment') ? current : [...current, 'starting-equipment'],
    )
  }, [focusedEquipmentChoice])

  const spellSelectionsByLevel = buildClassSpellSelectionsByLevel({
    character,
    className: viewingClass,
    classSource: viewingClassSource,
  })

  const classIcon = getClassIconUrl(viewingClass)

  return (
    <div
      ref={classChoiceRef}
      className={cn(
        'min-w-0 flex-1 flex flex-col overflow-hidden rounded-lg',
        classChoiceHighlighted && 'animate-route-focus',
      )}
    >
      <WorkspacePaneHeader title="Current class" className={detailCollapsed ? 'pr-20' : undefined}>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end">
          {classProgression.length > 1 ? (
            <Select
              value={
                selectedClassTab ||
                (classProgression[0]
                  ? `${classProgression[0].name}|${classProgression[0].source}`
                  : '')
              }
              onValueChange={(value) => onSelectClassTab(value)}
            >
              <SelectTrigger
                aria-label="Switch class"
                className="h-8 w-full min-w-0 max-w-56 overflow-hidden bg-background text-xs [&_[data-slot=select-value]]:min-w-0"
                title={viewingClass ? `${viewingClass}, level ${viewingClassLevel}` : undefined}
              >
                <SelectValue>
                  <span className="min-w-0 truncate">{viewingClass || 'Select class'}</span>
                  {viewingClass && (
                    <Badge
                      variant="secondary"
                      className="pointer-events-none h-4 shrink-0 px-1 font-mono text-[10px]"
                    >
                      L{viewingClassLevel}
                    </Badge>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {classProgression.map((entry) => (
                  <SelectItem
                    key={`${entry.name}|${entry.source}`}
                    value={`${entry.name}|${entry.source}`}
                    className="text-xs"
                  >
                    {entry.name} · Level {entry.levels}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </WorkspacePaneHeader>

      {viewingClass && classProgression.length > 0 && (
        <section
          aria-label="Selected class"
          className="mx-4 flex min-w-0 shrink-0 items-center gap-3 border-b border-border py-4"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            {classIcon ? (
              <img src={classIcon} alt="" className="size-8" />
            ) : (
              <Sword className="size-8" weight="duotone" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
              {viewingClass}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                Level {viewingClassLevel}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {viewingClassSource}
              {viewingSubclass ? ` · ${viewingSubclass}` : ''}
            </p>
          </div>
        </section>
      )}
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {classChoiceRecoveries.length > 0 && (
            <BuildClassChoicesSection
              choices={[]}
              diagnostics={[]}
              recoverySelections={classChoiceRecoveries}
              onRecover={onRecoverClassChoice}
              classLevel={viewingClassLevel}
              selectedViewsByChoiceId={selectedClassChoiceViewsById}
              detailCollapsed={detailCollapsed}
              onChoose={onOpenClassChoice}
              onSelectFeature={onSelectFeature}
              onExpandDetails={onExpandDetails}
              focusedChoiceId={focusedNormalizedChoiceId}
              className="mb-3"
            />
          )}
          {character.classProgression.length === 0 ? (
            <div
              ref={classPickerRef}
              className={cn(
                'flex h-40 flex-col items-center justify-center gap-3 rounded-lg text-muted-foreground',
                classPickerHighlighted && 'animate-route-focus',
              )}
            >
              <Sword className="h-8 w-8 opacity-30" weight="duotone" />
              <p className="text-sm">No class selected</p>
              <Button size="sm" onClick={onOpenClassPicker}>
                Choose a Class
              </Button>
            </div>
          ) : levelsToShow.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No feature data available
            </p>
          ) : (
            <Accordion
              type="multiple"
              value={openSections}
              onValueChange={setOpenSections}
              className="space-y-2"
            >
              {(classProgression.length <= 1 || classProgression[0]?.name === viewingClass) && (
                <AccordionItem
                  value="starting-equipment"
                  className="overflow-hidden rounded-lg border border-border last:border-b data-[state=open]:border-primary/30 data-[state=open]:bg-surface-raised/40"
                >
                  <AccordionTrigger className="px-3 text-sm hover:no-underline data-[state=open]:rounded-b-none data-[state=open]:bg-surface-raised">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Starting Equipment</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div
                      ref={equipmentChoiceRef}
                      className={cn(
                        'px-3 pb-2 pt-3',
                        equipmentChoiceHighlighted && 'animate-route-focus',
                      )}
                    >
                      <BuildClassEquipmentSection
                        viewingClassData={viewingClassData}
                        blockChoices={classEquipmentBlockChoices}
                        itemChoices={classEquipmentItemChoices}
                        detailCollapsed={detailCollapsed}
                        onBlockChoiceChange={onBlockChoiceChange}
                        onItemChoiceChange={onItemChoiceChange}
                        onSelectFeature={onSelectFeature}
                        onExpandDetails={onExpandDetails}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {levelsToShow.map((lv) => {
                const {
                  isSubclassLevel,
                  isASILevel,
                  spellGain,
                  passiveFeatures,
                  choiceCount,
                  totalCount,
                } = computeLevelDisplayData({
                  level: lv,
                  subclassLevel,
                  subclassFeatureName,
                  asiLevels,
                  spellChoicesByLevel,
                  featuresByLevel,
                })
                const levelClassChoices = classChoices.filter((choice) => choice.level === lv)
                const levelDiagnostics = classChoiceDiagnostics.filter(
                  (diagnostic) => (diagnostic.level ?? 1) === lv,
                )
                const normalizedChoiceCount = levelClassChoices.length + levelDiagnostics.length
                const levelChoiceCount = choiceCount + normalizedChoiceCount

                const asiChoiceComplete =
                  !isASILevel ||
                  appliedAsiChoicesForClass.some((choice) => choice.level === lv) ||
                  classAsiFeats.some((feat) => feat.classLevel === lv)
                const subclassChoiceComplete = !isSubclassLevel || !!viewingSubclass
                const selectedSpellCount = managedSpellStatuses.filter(
                  (row) =>
                    row.active &&
                    row.choice.slot[0][1] === viewingClass.trim().toLowerCase() &&
                    row.choice.slot[0][2] === viewingClassSource?.trim().toLowerCase() &&
                    row.choice.slot[3] === lv,
                ).length
                const spellChoiceComplete =
                  !spellGain || selectedSpellCount >= spellGain.cantrips + spellGain.spells
                const normalizedPendingCount =
                  levelDiagnostics.length +
                  levelClassChoices.reduce((sum, choice) => {
                    const required = getRequiredChoiceSelectionCount(choice, viewingClassLevel)
                    const eligibleSelected = (
                      selectedClassChoiceViewsById.get(choice.id) ?? []
                    ).filter(isClassChoiceOptionEligible).length
                    return sum + Math.max(0, required - eligibleSelected)
                  }, 0)
                const pendingChoiceCount =
                  (asiChoiceComplete ? 0 : 1) +
                  (subclassChoiceComplete ? 0 : 1) +
                  (spellGain
                    ? Math.max(0, spellGain.cantrips + spellGain.spells - selectedSpellCount)
                    : 0) +
                  normalizedPendingCount
                const normalizedChoicesComplete = normalizedPendingCount === 0
                const allChoicesComplete =
                  levelChoiceCount > 0 &&
                  asiChoiceComplete &&
                  subclassChoiceComplete &&
                  spellChoiceComplete &&
                  normalizedChoicesComplete

                const optionalRows = optionalClassActivity
                  ? getVisibleOptionalClassFeatures({
                      character,
                      className: viewingClass,
                      classSource: viewingClassSource,
                      level: lv,
                      activity: optionalClassActivity,
                    })
                  : []
                const groupedChoiceIds = new Set(
                  levelClassChoices
                    .filter((choice) => optionalClassFeaturesOwnChoice(choice, optionalRows))
                    .map((choice) => choice.id),
                )
                const separateConfigurationIds = new Set(
                  configurations
                    .filter((choice) => groupedChoiceIds.has(choice.id))
                    .map((choice) => choice.id),
                )
                const ordinaryFeatures = passiveFeatures.filter(
                  (feature) => !belongsToOptionalClassFeatures(feature, optionalRows),
                )
                const matchedChoiceIds = new Set(
                  ordinaryFeatures.flatMap((feature) =>
                    levelClassChoices
                      .filter((choice) => featureOwnsChoice(feature, choice))
                      .map((choice) => choice.id),
                  ),
                )
                const matchedDiagnosticKeys = new Set(
                  ordinaryFeatures.flatMap((feature) =>
                    levelDiagnostics
                      .filter((diagnostic) => featureOwnsDiagnostic(feature, diagnostic))
                      .map(
                        (diagnostic) =>
                          `${diagnostic.featureName}|${diagnostic.level ?? ''}|${diagnostic.code}|${diagnostic.message}`,
                      ),
                  ),
                )
                const unmatchedChoices = levelClassChoices.filter(
                  (choice) =>
                    !matchedChoiceIds.has(choice.id) &&
                    !configurationIds.has(choice.id) &&
                    !groupedChoiceIds.has(choice.id),
                )
                const unmatchedDiagnostics = levelDiagnostics.filter(
                  (diagnostic) =>
                    !optionalClassFeaturesOwnDiagnostic(diagnostic, optionalRows) &&
                    !matchedDiagnosticKeys.has(
                      `${diagnostic.featureName}|${diagnostic.level ?? ''}|${diagnostic.code}|${diagnostic.message}`,
                    ),
                )

                const renderPassiveFeatures = (
                  features: ClassFeatureDisplay[],
                  choices = levelClassChoices.filter((choice) => !groupedChoiceIds.has(choice.id)),
                  diagnostics = levelDiagnostics.filter(
                    (diagnostic) => !optionalClassFeaturesOwnDiagnostic(diagnostic, optionalRows),
                  ),
                ) => (
                  <BuildClassPassiveFeatureList
                    passiveFeatures={features}
                    selectedFeature={selectedFeature}
                    viewingSubclassData={viewingSubclassData}
                    detailCollapsed={detailCollapsed}
                    onSelectFeature={onSelectFeature}
                    onExpandDetails={onExpandDetails}
                    renderFeature={(feature) => {
                      const featureChoices = choices.filter(
                        (choice) =>
                          featureOwnsChoice(feature, choice) &&
                          (!configurationIds.has(choice.id) || groupedChoiceIds.has(choice.id)),
                      )
                      if (featureChoices.length === 0) return undefined
                      const featureDiagnostics = diagnostics.filter((diagnostic) =>
                        featureOwnsDiagnostic(feature, diagnostic),
                      )
                      return (
                        <BuildClassChoicesSection
                          choices={featureChoices}
                          diagnostics={featureDiagnostics}
                          classLevel={viewingClassLevel}
                          selectedViewsByChoiceId={selectedClassChoiceViewsById}
                          detailCollapsed={detailCollapsed}
                          onChoose={onOpenClassChoice}
                          onSelectFeature={onSelectFeature}
                          onExpandDetails={onExpandDetails}
                          feature={feature}
                          focusedChoiceId={focusedNormalizedChoiceId}
                          isDiagnosticFocused={featureDiagnostics.some(isDiagnosticFocused)}
                        />
                      )
                    }}
                    renderAfterFeature={(feature) => {
                      const featureChoices = choices.filter(
                        (choice) =>
                          featureOwnsChoice(feature, choice) &&
                          (!configurationIds.has(choice.id) || groupedChoiceIds.has(choice.id)),
                      )
                      if (featureChoices.length > 0) return null
                      const featureDiagnostics = diagnostics.filter((diagnostic) =>
                        featureOwnsDiagnostic(feature, diagnostic),
                      )
                      if (featureDiagnostics.length === 0) return null
                      return (
                        <BuildClassChoicesSection
                          choices={[]}
                          diagnostics={featureDiagnostics}
                          classLevel={viewingClassLevel}
                          selectedViewsByChoiceId={selectedClassChoiceViewsById}
                          detailCollapsed={detailCollapsed}
                          onChoose={onOpenClassChoice}
                          onSelectFeature={onSelectFeature}
                          onExpandDetails={onExpandDetails}
                          feature={feature}
                          isDiagnosticFocused={featureDiagnostics.some(isDiagnosticFocused)}
                        />
                      )
                    }}
                  />
                )
                return (
                  <AccordionItem
                    key={lv}
                    value={`level-${lv}`}
                    className="overflow-hidden rounded-lg border border-border last:border-b data-[state=open]:border-primary/30 data-[state=open]:bg-surface-raised/40"
                  >
                    <AccordionTrigger
                      aria-label={`Level ${lv}, ${totalCount} ${totalCount === 1 ? 'Feature' : 'Features'}${levelChoiceCount ? `, ${allChoicesComplete ? 'All choices made' : `${pendingChoiceCount} pending ${pendingChoiceCount === 1 ? 'choice' : 'choices'}`}` : ''}`}
                      className="px-3 text-sm hover:no-underline data-[state=open]:rounded-b-none data-[state=open]:bg-surface-raised"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">Level {lv}</span>
                        {totalCount > 0 && (
                          <Badge
                            variant="outline"
                            className="pointer-events-none h-5 border-primary/30 bg-primary/10 px-1.5 font-mono text-xs text-primary"
                          >
                            {totalCount} {totalCount === 1 ? 'Feature' : 'Features'}
                          </Badge>
                        )}
                        {levelChoiceCount > 0 && (
                          <Badge
                            className={cn(
                              'h-5 gap-1 px-1.5 text-xs pointer-events-none border',
                              allChoicesComplete
                                ? 'border-success/40 bg-success/15 text-success hover:bg-success/15'
                                : 'border-warning/40 bg-warning/20 text-warning-foreground hover:bg-warning/20 dark:border-warning/30',
                            )}
                          >
                            {allChoicesComplete ? (
                              <Check className="h-3 w-3" weight="bold" />
                            ) : null}
                            {allChoicesComplete
                              ? 'All choices made'
                              : `${pendingChoiceCount} pending ${pendingChoiceCount === 1 ? 'choice' : 'choices'}`}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 px-3 pb-2 pt-3">
                        {optionalClassActivity && (
                          <OptionalClassFeatures
                            character={character}
                            className={viewingClass}
                            classSource={viewingClassSource}
                            level={lv}
                            activity={optionalClassActivity}
                            onSelectFeature={(feature) => {
                              onSelectFeature(feature)
                              if (detailCollapsed) onExpandDetails()
                            }}
                            renderContent={(rows) => {
                              const choices = levelClassChoices.filter((choice) =>
                                optionalClassFeaturesOwnChoice(choice, rows),
                              )
                              const features = passiveFeatures.filter(
                                (feature) =>
                                  belongsToOptionalClassFeatures(feature, rows) &&
                                  (!rows.some(
                                    ({ root }) =>
                                      !root.original &&
                                      feature.origin?.kind === 'declared' &&
                                      feature.origin.target === root.target &&
                                      feature.origin.earnedLevel === root.level &&
                                      JSON.stringify(feature.origin.owner) ===
                                        JSON.stringify(root.owner),
                                  ) ||
                                    choices.some((choice) => featureOwnsChoice(feature, choice))),
                              )
                              if (features.length === 0 && choices.length === 0) {
                                for (const { root, state } of rows) {
                                  if (state !== 'active' || !root.original) continue
                                  const feature = optionalClassActivity.currentOptionalFeature(
                                    root.owner,
                                    root.target,
                                  )
                                  if (feature)
                                    features.push({
                                      name: feature.name,
                                      source: feature.source,
                                      entries: feature.entries ?? [],
                                      origin: {
                                        kind: 'declared',
                                        owner: root.owner,
                                        target: root.target,
                                        earnedLevel: root.level,
                                      },
                                    })
                                }
                              }
                              const diagnostics = levelDiagnostics.filter((diagnostic) =>
                                optionalClassFeaturesOwnDiagnostic(diagnostic, rows),
                              )
                              const unmatched = choices.filter(
                                (choice) =>
                                  !features.some((feature) => featureOwnsChoice(feature, choice)),
                              )
                              const unmatchedDiagnostics = diagnostics.filter(
                                (diagnostic) =>
                                  !features.some((feature) =>
                                    featureOwnsDiagnostic(feature, diagnostic),
                                  ),
                              )
                              return (
                                <>
                                  {renderPassiveFeatures(features, choices, diagnostics)}
                                  {(unmatched.length > 0 || unmatchedDiagnostics.length > 0) && (
                                    <BuildClassChoicesSection
                                      choices={unmatched}
                                      diagnostics={unmatchedDiagnostics}
                                      classLevel={viewingClassLevel}
                                      selectedViewsByChoiceId={selectedClassChoiceViewsById}
                                      detailCollapsed={detailCollapsed}
                                      onChoose={onOpenClassChoice}
                                      onSelectFeature={onSelectFeature}
                                      onExpandDetails={onExpandDetails}
                                      focusedChoiceId={focusedNormalizedChoiceId}
                                      isDiagnosticFocused={unmatchedDiagnostics.some(
                                        isDiagnosticFocused,
                                      )}
                                    />
                                  )}
                                </>
                              )
                            }}
                          />
                        )}
                        {isSubclassLevel && (
                          <BuildClassSubclassSection
                            level={lv}
                            subclassFeatureName={subclassFeatureName}
                            featuresByLevel={featuresByLevel}
                            viewingClassData={viewingClassData}
                            viewingSubclass={viewingSubclass}
                            viewingSubclassData={viewingSubclassData}
                            selectedFeature={selectedFeature}
                            detailCollapsed={detailCollapsed}
                            onSelectFeature={onSelectFeature}
                            onExpandDetails={onExpandDetails}
                            onOpenSubclassPicker={onOpenSubclassPicker}
                            configurations={configurations}
                            separateConfigurationIds={separateConfigurationIds}
                            hasUnavailableConfiguration={hasUnavailableSubclassConfiguration(
                              classChoiceRecoveries,
                              viewingClassData,
                              viewingSubclassData,
                            )}
                            classLevel={viewingClassLevel}
                            selectedViewsByChoiceId={selectedClassChoiceViewsById}
                            onConfigure={onOpenClassChoice}
                            highlighted={
                              readinessFocus === classSubclassReadinessId(viewingClassKey) ||
                              configurations.some(
                                (choice) =>
                                  !separateConfigurationIds.has(choice.id) &&
                                  choice.id === focusedNormalizedChoiceId,
                              )
                            }
                          />
                        )}

                        {isASILevel && (
                          <BuildClassAsiSection
                            level={lv}
                            viewingClass={viewingClass}
                            viewingClassSource={viewingClassSource}
                            viewingSubclassData={viewingSubclassData}
                            featuresByLevel={featuresByLevel}
                            appliedAsiChoicesForClass={appliedAsiChoicesForClass}
                            featForLevel={classAsiFeats.find((feat) => feat.classLevel === lv)}
                            asiModeByLevel={asiModeByLevel}
                            usedASI={usedASI}
                            totalASIAcrossClasses={totalASIAcrossClasses}
                            feats={feats}
                            detailCollapsed={detailCollapsed}
                            onExpandDetails={onExpandDetails}
                            onSelectFeature={onSelectFeature}
                            onAsiReset={onAsiReset}
                            onOpenAsiPicker={onOpenAsiPicker}
                            onOpenFeatPicker={onOpenFeatPicker}
                            onSetAsiModeByLevel={onSetAsiModeByLevel}
                            onClearFeatSelectionsForAsi={onClearFeatSelectionsForAsi}
                            highlighted={
                              readinessFocus === classAsiReadinessId(viewingClassKey, lv)
                            }
                          />
                        )}

                        {spellGain && (
                          <BuildClassSpellSection
                            level={lv}
                            spellGain={spellGain}
                            chosenNames={spellSelectionsByLevel.get(lv) ?? []}
                            unavailableCount={
                              (spellSelectionsByLevel.get(lv)?.length ?? 0) - selectedSpellCount
                            }
                            spellByReference={spellByReference}
                            detailCollapsed={detailCollapsed}
                            onOpenSpellPicker={onOpenSpellPicker}
                            onSelectFeature={onSelectFeature}
                            onExpandDetails={onExpandDetails}
                            getOrdinalForm={getOrdinalForm}
                          />
                        )}

                        {renderPassiveFeatures(ordinaryFeatures)}

                        {(unmatchedChoices.length > 0 || unmatchedDiagnostics.length > 0) && (
                          <BuildClassChoicesSection
                            choices={unmatchedChoices}
                            diagnostics={unmatchedDiagnostics}
                            classLevel={viewingClassLevel}
                            selectedViewsByChoiceId={selectedClassChoiceViewsById}
                            detailCollapsed={detailCollapsed}
                            onChoose={onOpenClassChoice}
                            onSelectFeature={onSelectFeature}
                            onExpandDetails={onExpandDetails}
                            focusedChoiceId={focusedNormalizedChoiceId}
                            isDiagnosticFocused={unmatchedDiagnostics.some(isDiagnosticFocused)}
                          />
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
