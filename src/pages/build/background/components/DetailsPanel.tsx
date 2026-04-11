import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { InfoTile } from '@/pages/_shared'
import { getBackgroundEntries } from '@/pages/build/background/model/data'
import type { Background5e } from '@/types/5etools'

interface BuildBackgroundDetailsPanelProps {
  detailCollapsed: boolean
  selectedBackground?: Background5e
  skillNames: string[]
  languageNames: string[]
  toolNames: string[]
}

export function BuildBackgroundDetailsPanel({
  detailCollapsed,
  selectedBackground,
  skillNames,
  languageNames,
  toolNames,
}: BuildBackgroundDetailsPanelProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
        detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-1/2 min-w-[320px]',
      )}
    >
      <div className="p-4 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Details
        </span>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {selectedBackground ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-display font-bold">{selectedBackground.name}</h2>
                <Badge variant="outline" className="mt-2">
                  {selectedBackground.source}
                </Badge>
              </div>
              <Separator />
              <div className="grid grid-cols-1 gap-3">
                <InfoTile title="Skill Proficiencies">
                  {skillNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {skillNames.map((skillName) => (
                        <Badge key={skillName} variant="secondary" className="capitalize text-xs">
                          {skillName}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">-</span>
                  )}
                </InfoTile>
                <div className="grid grid-cols-2 gap-3">
                  <InfoTile title="Languages">
                    {languageNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {languageNames.map((languageName) => (
                          <Badge
                            key={languageName}
                            variant="secondary"
                            className="capitalize text-xs"
                          >
                            {languageName}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </InfoTile>
                  <InfoTile title="Tool Proficiencies">
                    {toolNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {toolNames.map((toolName) => (
                          <Badge key={toolName} variant="secondary" className="capitalize text-xs">
                            {toolName}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </InfoTile>
                </div>
              </div>
              {getBackgroundEntries(selectedBackground).map((section) => (
                <div key={section.name ?? JSON.stringify(section.entries)}>
                  {section.name && (
                    <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2 mt-3">
                      {section.name}
                    </h4>
                  )}
                  {section.entries.map((entry) => (
                    <div
                      key={typeof entry === 'string' ? entry : JSON.stringify(entry)}
                      className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                      dangerouslySetInnerHTML={{
                        __html: renderEntry(entry),
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Select a background to view details
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
