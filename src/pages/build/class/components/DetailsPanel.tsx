import { CaretLeft, Sword } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  formatProficiencyList,
  getSavingThrowsDisplay,
  getSpellcastingStatDisplay,
} from '@/lib/calculations/classUtils'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { InfoTile } from '@/pages/_shared'
import type { Class5e } from '@/types/5etools'

export interface ClassFeatureDisplay {
  name: string
  source?: string
  entries?: unknown[]
}

export interface SelectedFeatureState {
  name: string
  source?: string
  entries: unknown[]
  levelFeatures?: { level: number; features: ClassFeatureDisplay[] }[]
}

export interface BuildClassDetailsPanelProps {
  detailCollapsed: boolean
  selectedFeature: SelectedFeatureState | null
  viewingClassData?: Class5e
  viewingClassEntries: unknown[]
  viewingSubclass?: string
  onClearSelection: () => void
}

export function BuildClassDetailsPanel({
  detailCollapsed,
  selectedFeature,
  viewingClassData,
  viewingClassEntries,
  viewingSubclass,
  onClearSelection,
}: BuildClassDetailsPanelProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
        detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-1/2 min-w-[320px]',
      )}
    >
      <div className="p-4 border-b border-border flex-shrink-0">
        {selectedFeature ? (
          <>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-accent hover:underline flex items-center gap-1 mb-2"
            >
              <CaretLeft className="h-3 w-3" /> All features
            </button>
            <h3 className="text-lg font-display font-bold">{selectedFeature.name}</h3>
            {selectedFeature.source && (
              <span className="text-xs text-muted-foreground">
                Source: {selectedFeature.source}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Details
          </span>
        )}
      </div>

      {selectedFeature ? (
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-4 space-y-4">
            {selectedFeature.levelFeatures ? (
              <>
                {selectedFeature.entries
                  .filter((entry) => typeof entry === 'string')
                  .map((entry) => (
                    <p key={entry} className="text-sm text-muted-foreground leading-relaxed">
                      {entry}
                    </p>
                  ))}

                {selectedFeature.levelFeatures
                  .slice()
                  .sort((a, b) => a.level - b.level)
                  .map(({ level, features }) => (
                    <div key={level}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="text-xs font-mono flex-shrink-0">
                          Level {level}
                        </Badge>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="space-y-4">
                        {features.map((feature) => (
                          <div key={`${feature.name}|${feature.source ?? ''}`}>
                            <div className="text-sm font-semibold mb-1">{feature.name}</div>
                            {feature.entries?.map((entry) => (
                              <div
                                key={typeof entry === 'string' ? entry : JSON.stringify(entry)}
                                className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                                dangerouslySetInnerHTML={{
                                  __html: renderEntry(entry) ?? '',
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </>
            ) : selectedFeature.entries.length > 0 ? (
              selectedFeature.entries.map((entry) => (
                <div
                  key={typeof entry === 'string' ? entry : JSON.stringify(entry)}
                  className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                  dangerouslySetInnerHTML={{ __html: renderEntry(entry) ?? '' }}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">No description available.</p>
            )}
          </div>
        </ScrollArea>
      ) : viewingClassData ? (
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-4 space-y-4">
            <div>
              <h2 className="text-2xl font-display font-bold">{viewingClassData.name}</h2>
              <Badge variant="outline" className="mt-2">
                {viewingClassData.source}
              </Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-3">
              <InfoTile title="Hit Die">
                <span className="text-sm font-mono">d{viewingClassData.hd?.faces ?? 8}</span>
              </InfoTile>

              <InfoTile title="Subclass">
                <span className="text-sm">
                  {viewingSubclass ?? <span className="text-muted-foreground">-</span>}
                </span>
              </InfoTile>

              <InfoTile title="Spellcasting">
                <span className="text-sm">{getSpellcastingStatDisplay(viewingClassData)}</span>
              </InfoTile>
            </div>

            {(viewingClassData.startingProficiencies?.armor?.length ?? 0) > 0 && (
              <InfoTile title="Armor Proficiencies">
                <span
                  className="text-sm [&_a]:text-accent [&_a]:no-underline"
                  dangerouslySetInnerHTML={{
                    __html:
                      formatProficiencyList(viewingClassData.startingProficiencies?.armor) ?? '',
                  }}
                />
              </InfoTile>
            )}

            {(viewingClassData.startingProficiencies?.weapons?.length ?? 0) > 0 && (
              <InfoTile title="Weapon Proficiencies">
                <span
                  className="text-sm [&_a]:text-accent [&_a]:no-underline"
                  dangerouslySetInnerHTML={{
                    __html:
                      formatProficiencyList(viewingClassData.startingProficiencies?.weapons) ?? '',
                  }}
                />
              </InfoTile>
            )}

            {(viewingClassData.startingProficiencies?.tools?.length ?? 0) > 0 && (
              <InfoTile title="Tool Proficiencies">
                <span
                  className="text-sm [&_a]:text-accent [&_a]:no-underline"
                  dangerouslySetInnerHTML={{
                    __html:
                      formatProficiencyList(viewingClassData.startingProficiencies?.tools) ?? '',
                  }}
                />
              </InfoTile>
            )}

            {(viewingClassData.proficiency?.length ?? 0) > 0 && (
              <InfoTile title="Saving Throws">
                <span className="text-sm">{getSavingThrowsDisplay(viewingClassData)}</span>
              </InfoTile>
            )}

            {viewingClassEntries.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">
                  Description
                </h4>
                <div className="space-y-2">
                  {viewingClassEntries.map((entry) => (
                    <div
                      key={typeof entry === 'string' ? entry : JSON.stringify(entry)}
                      className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{
                        __html: renderEntry(entry) ?? '',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-8 text-center">
          <div>
            <Sword className="h-8 w-8 mx-auto mb-2 opacity-30" weight="duotone" />
            <p>No class selected</p>
          </div>
        </div>
      )}
    </div>
  )
}
