import { CaretLeft, Sword } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceDetailContent, WorkspacePaneHeader } from '@/components/workspace'
import {
  formatProficiencyList,
  getSavingThrowsDisplay,
  getSpellcastingStatDisplay,
} from '@/lib/calculations/classUtils'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
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
  selectedFeature: SelectedFeatureState | null
  viewingClassData?: Class5e
  viewingClassLevel: number
  viewingClassEntries: unknown[]
  viewingSubclass?: string
  onClearSelection: () => void
}

export function BuildClassDetailsPanel({
  selectedFeature,
  viewingClassData,
  viewingClassLevel,
  viewingClassEntries,
  viewingSubclass,
  onClearSelection,
}: BuildClassDetailsPanelProps) {
  return (
    <>
      <WorkspacePaneHeader
        title={selectedFeature ? 'Feature details' : 'Class details'}
        className="pr-20"
      >
        {selectedFeature && (
          <button
            type="button"
            onClick={onClearSelection}
            className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Show class overview"
            title="Show class overview"
          >
            <CaretLeft className="size-4" />
          </button>
        )}
      </WorkspacePaneHeader>

      {(selectedFeature || viewingClassData) && (
        <section className="shrink-0 border-b border-border bg-surface-raised/60 px-5 py-4">
          <div className="mx-auto w-full max-w-4xl">
            <h3 className="truncate font-display text-xl font-semibold leading-tight text-foreground">
              {selectedFeature?.name ?? viewingClassData?.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {(selectedFeature?.source ?? viewingClassData?.source) && (
                <Badge variant="outline" className="text-xs">
                  {selectedFeature?.source ?? viewingClassData?.source}
                </Badge>
              )}
              {!selectedFeature && (
                <>
                  <span className="text-xs text-muted-foreground">Level {viewingClassLevel}</span>
                  {viewingSubclass && (
                    <span className="text-xs text-muted-foreground">· {viewingSubclass}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {selectedFeature ? (
        <ScrollArea className="flex-1 overflow-hidden">
          <WorkspaceDetailContent className="space-y-4">
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
                            {feature.entries?.map((entry, idx) => (
                              <div
                                key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
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
              selectedFeature.entries.map((entry, idx) => (
                <div
                  key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
                  className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                  dangerouslySetInnerHTML={{ __html: renderEntry(entry) ?? '' }}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">No description available.</p>
            )}
          </WorkspaceDetailContent>
        </ScrollArea>
      ) : viewingClassData ? (
        <ScrollArea className="flex-1 overflow-hidden">
          <WorkspaceDetailContent className="space-y-5">
            <div className="grid grid-cols-3 border-y border-border">
              {[
                { label: 'Hit Die', value: `d${viewingClassData.hd?.faces ?? 8}` },
                { label: 'Subclass', value: viewingSubclass ?? '—' },
                { label: 'Spellcasting', value: getSpellcastingStatDisplay(viewingClassData) },
              ].map(({ label, value }, index) => (
                <div
                  key={label}
                  className={cn(
                    'flex min-h-16 flex-col justify-center px-4 py-2.5',
                    index < 2 && 'border-r border-border',
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <span className="mt-1 text-sm font-semibold tabular-nums">{value}</span>
                </div>
              ))}
            </div>

            <div className="border-y border-border">
              {[
                {
                  label: 'Armor',
                  value: formatProficiencyList(viewingClassData.startingProficiencies?.armor),
                },
                {
                  label: 'Weapons',
                  value: formatProficiencyList(viewingClassData.startingProficiencies?.weapons),
                },
                {
                  label: 'Tools',
                  value: formatProficiencyList(viewingClassData.startingProficiencies?.tools),
                },
                {
                  label: 'Saving throws',
                  value:
                    (viewingClassData.proficiency?.length ?? 0) > 0
                      ? getSavingThrowsDisplay(viewingClassData)
                      : '',
                },
              ]
                .filter(({ value }) => value)
                .map(({ label, value }, index, rows) => (
                  <div
                    key={label}
                    className={cn(
                      'grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm',
                      index < rows.length - 1 && 'border-b border-border/70',
                    )}
                  >
                    <span className="font-semibold">{label}</span>
                    <span
                      className="text-muted-foreground [&_a]:text-primary [&_a]:no-underline"
                      dangerouslySetInnerHTML={{ __html: value ?? '' }}
                    />
                  </div>
                ))}
            </div>

            {viewingClassEntries.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">
                  Description
                </h4>
                <div className="space-y-2">
                  {viewingClassEntries.map((entry, idx) => (
                    <div
                      key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
                      className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{
                        __html: renderEntry(entry) ?? '',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {(viewingClassData.classFluffSections?.length ?? 0) > 0 && (
              <div>
                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">
                  Lore
                </h4>
                <div className="space-y-4">
                  {(viewingClassData.classFluffSections ?? []).map((section, sectionIdx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: section.name is not unique; index needed to disambiguate
                    <div key={`${section.name ?? ''}|${sectionIdx}`}>
                      <h5 className="text-sm font-semibold mb-2">{section.name}</h5>
                      <div className="space-y-2">
                        {section.entries.map((entry, idx) => (
                          <div
                            key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
                            className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold"
                            dangerouslySetInnerHTML={{
                              __html: renderEntry(entry) ?? '',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(viewingClassData.classFluffImages?.length ?? 0) > 0 && (
              <section className="border-t border-border pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Class artwork
                </h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {viewingClassData.classFluffImages?.map((image) => (
                    <li
                      key={`${image.title ?? 'artwork'}|${image.href?.path ?? image.href?.url ?? ''}`}
                    >
                      {image.title ?? 'Artwork'}
                      {image.href?.path ? ` (${image.href.path})` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </WorkspaceDetailContent>
        </ScrollArea>
      ) : (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-8 text-center">
          <div>
            <Sword className="h-8 w-8 mx-auto mb-2 opacity-30" weight="duotone" />
            <p>No class selected</p>
          </div>
        </div>
      )}
    </>
  )
}
