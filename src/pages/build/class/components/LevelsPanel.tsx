import { Check, Sword } from '@phosphor-icons/react'
import { useState } from 'react'
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
import {
  buildClassSpellSelectionsByLevel,
  ensureSpellProfiles,
} from '@/lib/calculations/spellProfiles'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import { cn } from '@/lib/utils'
import type { Class5e, Feat5e, Spell5e, Subclass5e } from '@/types/5etools'
import type {
  AsiChoice,
  Character,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
  Feat,
} from '@/types/character'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { computeLevelDisplayData } from '../model/levelsUtils'
import { BuildClassAsiSection } from './AsiSection'
import { BuildClassChoicesSection } from './ClassChoicesSection'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'
import { BuildClassEquipmentSection } from './EquipmentSection'
import { BuildClassPassiveFeatureList } from './PassiveFeatureList'
import { BuildClassSpellSection } from './SpellSection'
import { BuildClassSubclassSection } from './SubclassSection'

interface BuildClassLevelsPanelProps {
  classProgression: CharacterClassEntry[]
  selectedClassTab: string
  onSelectClassTab: (className: string) => void
  character: Character
  levelsToShow: number[]
  subclassLevel: number
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
  spellByName: Map<string, Spell5e>
  appliedAsiChoicesForClass: AsiChoice[]
  classAsiFeats: Feat[]
  asiModeByLevel: Record<string, 'asi' | 'feat'>
  usedASI: number
  totalASIAcrossClasses: number
  classChoices: NormalizedCharacterChoice[]
  classChoiceDiagnostics: ClassChoiceDiagnostic[]
  classChoiceSelectionById: ReadonlyMap<string, CharacterClassChoiceSelection>
  selectedClassChoiceViewsById: ReadonlyMap<string, ClassChoiceOptionView[]>
  onOpenClassPicker: () => void
  onOpenSubclassPicker: () => void
  onOpenSpellPicker: (level: number) => void
  onOpenSpellSwap: (level: number) => void
  onOpenFeatPicker: (level: number) => void
  onOpenAsiPicker: (level: number) => void
  onOpenClassChoice: (choice: NormalizedCharacterChoice) => void
  onBlockChoiceChange: (blockIndex: number, choice: string) => void
  onItemChoiceChange?: (blockIndex: number, choice: string, key: string, itemRef: string) => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
  onAsiReset: (level: number) => void
  onSetAsiModeByLevel: (levelKey: string, mode: 'asi' | 'feat') => void
  onClearFeatSelectionsForAsi: (level: number) => void
  getOrdinalForm: (n: number) => string
}

export function BuildClassLevelsPanel({
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
  spellByName,
  appliedAsiChoicesForClass,
  classAsiFeats,
  asiModeByLevel,
  usedASI,
  totalASIAcrossClasses,
  classChoices,
  classChoiceDiagnostics,
  classChoiceSelectionById,
  selectedClassChoiceViewsById,
  onOpenClassPicker,
  onOpenSubclassPicker,
  onOpenSpellPicker,
  onOpenSpellSwap,
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
}: BuildClassLevelsPanelProps) {
  const [openSections, setOpenSections] = useState<string[]>([])

  const spellSelectionsByLevel = buildClassSpellSelectionsByLevel({
    character,
    className: viewingClass,
    classSource: viewingClassSource,
  })

  const classProfileId = `class:${viewingClass}|${viewingClassSource ?? ''}`
  const classProfile = ensureSpellProfiles(character).find((p) => p.id === classProfileId)
  const hasExistingKnown = (classProfile?.spellsKnown?.length ?? 0) > 0
  const swapsByLevel = classProfile?.spellSwaps ?? {}

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <WorkspacePaneHeader
        title={classProgression.length > 1 ? 'Current class' : 'Class progression'}
        className={detailCollapsed ? 'pr-20' : undefined}
      >
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end">
          {classProgression.length > 1 ? (
            <Select
              value={
                selectedClassTab ||
                (classProgression[0]
                  ? `${classProgression[0].name}|${classProgression[0].source ?? ''}`
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
                    key={`${entry.name}|${entry.source ?? ''}`}
                    value={`${entry.name}|${entry.source ?? ''}`}
                    className="text-xs"
                  >
                    {entry.name} · Level {entry.levels}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="truncate text-sm font-semibold tabular-nums">
              {viewingClass ? `${viewingClass} · Level ${viewingClassLevel}` : 'No class selected'}
            </span>
          )}
        </div>
      </WorkspacePaneHeader>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {!character.class ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
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
            <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
              {(classProgression.length <= 1 || classProgression[0]?.name === viewingClass) && (
                <AccordionItem value="starting-equipment">
                  <AccordionTrigger className="text-sm px-1 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Starting Equipment</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-1 pb-2 px-1">
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

              {(classChoices.length > 0 || classChoiceDiagnostics.length > 0) && (
                <AccordionItem value="required-class-choices">
                  <AccordionTrigger className="px-1 text-sm hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Required Choices</span>
                      <Badge variant="secondary" className="h-5 px-1.5 font-mono text-xs">
                        {classChoices.length + classChoiceDiagnostics.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <BuildClassChoicesSection
                      choices={classChoices}
                      diagnostics={classChoiceDiagnostics}
                      classLevel={viewingClassLevel}
                      selectionByChoiceId={classChoiceSelectionById}
                      selectedViewsByChoiceId={selectedClassChoiceViewsById}
                      detailCollapsed={detailCollapsed}
                      onChoose={onOpenClassChoice}
                      onSelectFeature={onSelectFeature}
                      onExpandDetails={onExpandDetails}
                    />
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

                const asiChoiceComplete =
                  !isASILevel ||
                  appliedAsiChoicesForClass.some((choice) => choice.level === lv) ||
                  classAsiFeats.some((feat) => feat.classLevel === lv)
                const subclassChoiceComplete = !isSubclassLevel || !!viewingSubclass
                const selectedSpellCount = spellSelectionsByLevel.get(lv)?.length ?? 0
                const spellChoiceComplete =
                  !spellGain || selectedSpellCount >= spellGain.cantrips + spellGain.spells
                const allChoicesComplete =
                  choiceCount > 0 &&
                  asiChoiceComplete &&
                  subclassChoiceComplete &&
                  spellChoiceComplete

                return (
                  <AccordionItem key={lv} value={`level-${lv}`}>
                    <AccordionTrigger className="text-sm px-1 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Level {lv} Features</span>
                        {totalCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-xs font-mono h-5 px-1.5 pointer-events-none"
                          >
                            {totalCount}
                          </Badge>
                        )}
                        {choiceCount > 0 && (
                          <Badge
                            className={cn(
                              'h-5 gap-1 px-1.5 text-xs pointer-events-none border',
                              allChoicesComplete
                                ? 'border-success/40 bg-success/15 text-success hover:bg-success/15'
                                : 'border-warning/40 bg-warning/20 text-warning-foreground hover:bg-warning/20 dark:border-warning/30 dark:text-warning',
                            )}
                          >
                            {allChoicesComplete ? (
                              <Check className="h-3 w-3" weight="bold" />
                            ) : null}
                            {choiceCount} {choiceCount === 1 ? 'choice' : 'choices'}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1.5 pt-1 pb-2 px-1">
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
                          />
                        )}

                        {spellGain && (
                          <BuildClassSpellSection
                            level={lv}
                            spellGain={spellGain}
                            chosenNames={spellSelectionsByLevel.get(lv) ?? []}
                            spellByName={spellByName}
                            detailCollapsed={detailCollapsed}
                            hasExistingKnown={hasExistingKnown}
                            swapDoneAtLevel={!!swapsByLevel[lv]}
                            onOpenSpellPicker={onOpenSpellPicker}
                            onOpenSpellSwap={onOpenSpellSwap}
                            onSelectFeature={onSelectFeature}
                            onExpandDetails={onExpandDetails}
                            getOrdinalForm={getOrdinalForm}
                          />
                        )}

                        <BuildClassPassiveFeatureList
                          passiveFeatures={passiveFeatures}
                          selectedFeature={selectedFeature}
                          viewingSubclassData={viewingSubclassData}
                          detailCollapsed={detailCollapsed}
                          onSelectFeature={onSelectFeature}
                          onExpandDetails={onExpandDetails}
                        />
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
