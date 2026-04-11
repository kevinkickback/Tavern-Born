import { Sword } from '@phosphor-icons/react'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  featCategoryToFull,
  getOptFeatureTotal,
  type OptionalFeatureLike,
  optFeatureTypeToFull,
} from '@/lib/5etools/classData'
import { buildClassSpellSelectionsByLevel } from '@/lib/calculations/spellProfiles'
import type { Class5e, Feat5e, Spell5e, Subclass5e } from '@/types/5etools'
import type { AsiChoice, Character, CharacterClassEntry } from '@/types/character'
import type { ClassFeatProgression, OptionalFeatureProgression } from '../model/levelsUtils'
import { computeLevelDisplayData } from '../model/levelsUtils'
import { BuildClassAsiSection } from './AsiSection'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'
import { BuildClassPassiveFeatureList } from './PassiveFeatureList'
import { BuildClassProgressionChoiceCard } from './ProgressionChoiceCard'
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
    }
  >
  optFeatureProgressions: OptionalFeatureProgression[]
  classFeatProgressions: ClassFeatProgression[]
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
  classEquipmentChoiceOptions: Array<'A' | 'B'>
  selectedClassEquipmentChoice: 'a' | 'b' | 'A' | 'B'
  selectedNames: Set<string>
  optFeatures: OptionalFeatureLike[]
  featByCompositeId: Map<string, Feat5e>
  feats: Feat5e[]
  spellByName: Map<string, Spell5e>
  appliedAsiChoicesForClass: AsiChoice[]
  asiModeByLevel: Record<string, 'asi' | 'feat'>
  usedASI: number
  totalASIAcrossClasses: number
  onOpenClassPicker: () => void
  onOpenSubclassPicker: () => void
  onOpenSpellPicker: (level: number) => void
  onOpenFeatPicker: () => void
  onOpenAsiPicker: (level: number) => void
  onOpenOptPicker: (state: { progName: string; featureTypes: string[]; total: number }) => void
  onOpenClassFeatPicker: (state: { progName: string; categories: string[]; total: number }) => void
  onClassEquipmentChoiceChange: (choice: 'A' | 'B') => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
  onAsiReset: (level: number) => void
  onSetAsiModeByLevel: (levelKey: string, mode: 'asi' | 'feat') => void
  onClearFeatSelectionsForAsi: () => void
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
  optFeatureProgressions,
  classFeatProgressions,
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
  classEquipmentChoiceOptions,
  selectedClassEquipmentChoice,
  selectedNames,
  optFeatures,
  featByCompositeId,
  feats,
  spellByName,
  appliedAsiChoicesForClass,
  asiModeByLevel,
  usedASI,
  totalASIAcrossClasses,
  onOpenClassPicker,
  onOpenSubclassPicker,
  onOpenSpellPicker,
  onOpenFeatPicker,
  onOpenAsiPicker,
  onOpenOptPicker,
  onOpenClassFeatPicker,
  onClassEquipmentChoiceChange,
  onSelectFeature,
  onExpandDetails,
  onAsiReset,
  onSetAsiModeByLevel,
  onClearFeatSelectionsForAsi,
  getOrdinalForm,
}: BuildClassLevelsPanelProps) {
  const spellSelectionsByLevel = buildClassSpellSelectionsByLevel({
    character,
    className: viewingClass,
    classSource: viewingClassSource,
  })

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex-shrink-0">
        {classProgression.length > 1 ? (
          <Tabs
            value={selectedClassTab || classProgression[0]?.name}
            onValueChange={(value) => onSelectClassTab(value)}
          >
            <TabsList className="w-full">
              {classProgression.map((entry) => (
                <TabsTrigger
                  key={`${entry.name}|${entry.source ?? ''}`}
                  value={entry.name}
                  className="flex-1 gap-1.5 text-xs"
                >
                  {entry.name}
                  <Badge
                    variant="secondary"
                    className="font-mono h-4 px-1 text-[10px] pointer-events-none"
                  >
                    {entry.levels}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {character.class ? `${character.class} Features` : 'Class Features'}
          </span>
        )}
      </div>

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
            <Accordion type="multiple" defaultValue={[`level-${character.level}`]}>
              {levelsToShow.map((lv) => {
                const {
                  isSubclassLevel,
                  isASILevel,
                  spellGain,
                  optFeatureGainsAtLevel,
                  classFeatGainsAtLevel,
                  passiveFeatures,
                  choiceCount,
                  totalCount,
                } = computeLevelDisplayData({
                  level: lv,
                  subclassLevel,
                  subclassFeatureName,
                  asiLevels,
                  spellChoicesByLevel,
                  optFeatureProgressions,
                  classFeatProgressions,
                  featuresByLevel,
                })

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
                          <Badge className="text-xs h-5 px-1.5 pointer-events-none bg-warning/20 text-warning border border-warning/30 hover:bg-warning/20">
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

                        {classFeatGainsAtLevel.map((prog) => {
                          const totalAllowed = getOptFeatureTotal(
                            prog.progression,
                            viewingClassLevel,
                          )
                          const categorySet = new Set(prog.category)
                          const chosenStyles = (character.specialFeats ?? []).filter((sf) => {
                            const feat = featByCompositeId.get(`${sf.name}|${sf.source ?? ''}`)
                            return !!feat?.category && categorySet.has(feat.category)
                          })
                          const selectedCount = chosenStyles.length
                          const progLabel =
                            prog.name ??
                            prog.category.map((category) => featCategoryToFull(category)).join(', ')
                          const isFull = selectedCount >= totalAllowed

                          return (
                            <BuildClassProgressionChoiceCard
                              key={`${progLabel}|${prog.category.join('|')}`}
                              id={progLabel}
                              label={progLabel}
                              selectedCount={selectedCount}
                              totalAllowed={totalAllowed}
                              isFull={isFull}
                              chosenItems={chosenStyles.map((style) => {
                                const feat = featByCompositeId.get(
                                  `${style.name}|${style.source ?? ''}`,
                                )
                                return {
                                  name: style.name,
                                  source: style.source,
                                  entries: feat?.entries ?? [],
                                }
                              })}
                              detailCollapsed={detailCollapsed}
                              onChoose={() =>
                                onOpenClassFeatPicker({
                                  progName: progLabel,
                                  categories: prog.category,
                                  total: totalAllowed,
                                })
                              }
                              onSelectFeature={onSelectFeature}
                              onExpandDetails={onExpandDetails}
                            />
                          )
                        })}

                        {optFeatureGainsAtLevel.map((prog) => {
                          const totalAllowed = getOptFeatureTotal(
                            prog.progression,
                            viewingClassLevel,
                          )
                          const featuresOfType = optFeatures.filter((feature) => {
                            const featureTypes = Array.isArray(feature.featureType)
                              ? feature.featureType
                              : [feature.featureType ?? '']
                            return prog.featureType.some((type) => featureTypes.includes(type))
                          })
                          const selectedCount = featuresOfType.filter((feature) =>
                            selectedNames.has(feature.name),
                          ).length
                          const progLabel =
                            prog.name ||
                            prog.featureType.map((type) => optFeatureTypeToFull(type)).join(', ')
                          const isFull = selectedCount >= totalAllowed
                          const chosenFeatures = featuresOfType.filter((feature) =>
                            selectedNames.has(feature.name),
                          )

                          return (
                            <BuildClassProgressionChoiceCard
                              key={`${progLabel}|${prog.featureType.join('|')}`}
                              id={progLabel}
                              label={progLabel}
                              selectedCount={selectedCount}
                              totalAllowed={totalAllowed}
                              isFull={isFull}
                              chosenItems={chosenFeatures.map((feature) => ({
                                name: feature.name,
                                source: feature.source,
                                entries: feature.entries ?? [],
                              }))}
                              detailCollapsed={detailCollapsed}
                              onChoose={() =>
                                onOpenOptPicker({
                                  progName: progLabel,
                                  featureTypes: prog.featureType,
                                  total: totalAllowed,
                                })
                              }
                              onSelectFeature={onSelectFeature}
                              onExpandDetails={onExpandDetails}
                            />
                          )
                        })}

                        {isASILevel && (
                          <BuildClassAsiSection
                            level={lv}
                            viewingClass={viewingClass}
                            viewingSubclassData={viewingSubclassData}
                            featuresByLevel={featuresByLevel}
                            appliedAsiChoicesForClass={appliedAsiChoicesForClass}
                            asiModeByLevel={asiModeByLevel}
                            usedASI={usedASI}
                            totalASIAcrossClasses={totalASIAcrossClasses}
                            character={character}
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
                            onOpenSpellPicker={onOpenSpellPicker}
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
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {character.class && classEquipmentChoiceOptions.length > 1 && (
            <div className="w-[220px] flex-shrink-0">
              <Select
                value={selectedClassEquipmentChoice.toUpperCase()}
                onValueChange={(value) => onClassEquipmentChoiceChange(value as 'A' | 'B')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Starting Equipment" />
                </SelectTrigger>
                <SelectContent>
                  {classEquipmentChoiceOptions.map((choice) => (
                    <SelectItem key={choice} value={choice} className="text-xs">
                      Starting Equipment {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
