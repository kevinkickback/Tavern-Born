import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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

function getXphbFeatNames(background: Background5e): string[] {
  const feats = background.feats as Record<string, boolean>[] | undefined
  if (!feats) return []
  return feats.flatMap((block) =>
    Object.keys(block)
      .filter((k) => block[k])
      .map((k) => {
        const name = k.split('|')[0] ?? k
        // Capitalise each word
        return name
          .split(/[;\s]+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      }),
  )
}

function BackgroundDetails2024({
  background,
  skillNames,
  toolNames,
}: {
  background: Background5e
  skillNames: string[]
  toolNames: string[]
}) {
  const featNames = getXphbFeatNames(background)
  // XPHB backgrounds only have the summary `type: list` entry — skip it here
  // since we surface the data via InfoTiles. Only include named `type: entries` sections.
  const narrativeEntries = ((background.entries as unknown[]) ?? []).filter((e) => {
    const entry = e as { type?: string }
    return typeof e === 'object' && entry.type === 'entries'
  }) as { name?: string; entries: unknown[] }[]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <InfoTile title="Skill Proficiencies">
          {skillNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {skillNames.map((name) => (
                <Badge key={name} variant="secondary" className="capitalize text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </InfoTile>
        <div className="grid grid-cols-2 gap-3">
          <InfoTile title="Tool Proficiency">
            {toolNames.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {toolNames.map((name) => (
                  <Badge key={name} variant="secondary" className="capitalize text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </InfoTile>
          <InfoTile title="Origin Feat">
            {featNames.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {featNames.map((name) => (
                  <Badge key={name} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </InfoTile>
        </div>
      </div>
      {narrativeEntries.map((section) => (
        <div key={section.name ?? JSON.stringify(section.entries)}>
          {section.name && (
            <h4 className="text-xs font-bold text-accent-foreground uppercase tracking-wider mb-2 mt-3">
              {section.name}
            </h4>
          )}
          {section.entries.map((entry) => (
            <div
              key={typeof entry === 'string' ? entry : JSON.stringify(entry)}
              className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
              dangerouslySetInnerHTML={{ __html: renderEntry(entry) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function BackgroundDetails2014({
  background,
  skillNames,
  languageNames,
  toolNames,
}: {
  background: Background5e
  skillNames: string[]
  languageNames: string[]
  toolNames: string[]
}) {
  const entries = getBackgroundEntries(background)
  return (
    <div className="space-y-4">
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
                  <Badge key={languageName} variant="secondary" className="capitalize text-xs">
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
      {entries.map((section) => (
        <div key={section.name ?? JSON.stringify(section.entries)}>
          {section.name && (
            <h4 className="text-xs font-bold text-accent-foreground uppercase tracking-wider mb-2 mt-3">
              {section.name}
            </h4>
          )}
          {section.entries.map((entry) => (
            <div
              key={typeof entry === 'string' ? entry : JSON.stringify(entry)}
              className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
              dangerouslySetInnerHTML={{ __html: renderEntry(entry) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
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
      <div className="bg-gradient-to-r from-accent/10 to-transparent border-b border-border px-4 py-3 flex flex-col gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Details
        </span>
        <div className="flex items-center gap-2 min-h-8">
          {selectedBackground ? (
            <>
              <span className="text-sm font-bold font-display leading-tight">
                {selectedBackground.name}
              </span>
              <Badge variant="outline" className="text-xs shrink-0">
                {selectedBackground.source}
              </Badge>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select a background…</span>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {selectedBackground ? (
            selectedBackground.edition === 'one' ? (
              <BackgroundDetails2024
                background={selectedBackground}
                skillNames={skillNames}
                toolNames={toolNames}
              />
            ) : (
              <BackgroundDetails2014
                background={selectedBackground}
                skillNames={skillNames}
                languageNames={languageNames}
                toolNames={toolNames}
              />
            )
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
