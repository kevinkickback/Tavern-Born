import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { InfoTile } from '@/pages/_shared'
import { hasProfInArray } from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'
import type { Character } from '@/types/character'

interface BuildProficienciesDetailsPanelProps {
  focused: ProfFocus | null
  detailCollapsed: boolean
  character: Character
  skillDescriptions: Record<string, unknown[]>
}

export function BuildProficienciesDetailsPanel({
  focused,
  detailCollapsed,
  character,
  skillDescriptions,
}: BuildProficienciesDetailsPanelProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
        detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-[40%] min-w-[280px]',
      )}
    >
      <div className="p-4 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Details
        </span>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {!focused ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm text-center">
              Click any proficiency to view details
            </div>
          ) : focused.type === 'skill' ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                <p className="text-sm text-muted-foreground capitalize">{focused.ability} check</p>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <InfoTile title="Modifier">
                  <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                </InfoTile>
                <InfoTile title="Proficient">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      focused.proficient ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {focused.proficient ? 'Yes' : 'No'}
                  </span>
                </InfoTile>
                <InfoTile title="Expertise">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      focused.expertise ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {focused.expertise ? 'Yes' : 'No'}
                  </span>
                </InfoTile>
              </div>
              {skillDescriptions[focused.name.toLowerCase()]?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">
                    Description
                  </h4>
                  {skillDescriptions[focused.name.toLowerCase()].map((e) => (
                    <div
                      key={typeof e === 'string' ? e : JSON.stringify(e)}
                      className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1"
                      dangerouslySetInnerHTML={{
                        __html: renderEntry(e),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : focused.type === 'save' ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-display font-bold capitalize">
                  {focused.ability} Save
                </h2>
                <p className="text-sm text-muted-foreground">Saving Throw</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <InfoTile title="Modifier">
                  <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                </InfoTile>
                <InfoTile title="Proficient">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      focused.proficient ? 'text-accent' : 'text-muted-foreground',
                    )}
                  >
                    {focused.proficient ? 'Yes' : 'No'}
                  </span>
                </InfoTile>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                <p className="text-sm text-muted-foreground">{focused.category} Proficiency</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Badge variant="secondary" className="capitalize">
                  {focused.category}
                </Badge>
                {!hasProfInArray(
                  character.proficiencies[
                    focused.category.toLowerCase() as 'armor' | 'weapons' | 'tools' | 'languages'
                  ] ?? [],
                  focused.name,
                ) && (
                  <p className="text-xs text-muted-foreground italic">Not currently selected.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
