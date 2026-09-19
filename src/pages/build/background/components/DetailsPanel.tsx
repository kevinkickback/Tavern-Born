import { Brain, Translate, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceDetailContent } from '@/components/workspace'
import {
  formatEquipmentOptionEntries,
  type ResolvedEquipmentBlock,
} from '@/lib/5etools/startingEquipment'
import { cn } from '@/lib/utils'
import {
  getBackgroundEntries,
  getBackgroundNarrativeEntries,
} from '@/pages/build/background/model/data'
import type { Background5e } from '@/types/5etools'

interface BuildBackgroundDetailsPanelProps {
  selectedBackground?: Background5e
  skillNames: string[]
  languageNames: string[]
  toolNames: string[]
  equipmentBlocks: ResolvedEquipmentBlock[]
  bgEquipmentChoices: string[]
}

function EquipmentSection({
  equipmentBlocks,
  bgEquipmentChoices,
}: {
  equipmentBlocks: ResolvedEquipmentBlock[]
  bgEquipmentChoices: string[]
}) {
  const allItems: string[] = []
  for (const block of equipmentBlocks) {
    if (block.isFixed) {
      const pkg = block.options._
      if (pkg) allItems.push(...formatEquipmentOptionEntries(pkg))
    } else {
      const choiceKey = (
        bgEquipmentChoices[block.index] ??
        block.choiceKeys[0] ??
        'a'
      ).toLowerCase()
      const pkg = block.options[choiceKey]
      if (pkg) allItems.push(...formatEquipmentOptionEntries(pkg))
    }
  }
  if (allItems.length === 0) return null

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Starting Equipment
      </h4>
      <div className="border-y border-border">
        {allItems.map((item, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stable positional list
            key={i}
            className={cn(
              'flex items-center gap-3 px-4 py-2',
              i < allItems.length - 1 && 'border-b border-border/50',
            )}
          >
            <span className="text-xs text-muted-foreground shrink-0">•</span>
            <span className="text-xs">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-16 items-center gap-3 px-3 py-2.5', className)}>
      <div className="shrink-0 text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold" title={value}>
          {value}
        </p>
      </div>
    </div>
  )
}

function BackgroundDetails2024({
  background,
  skillNames,
  toolNames,
  equipmentBlocks,
  bgEquipmentChoices,
}: {
  background: Background5e
  skillNames: string[]
  toolNames: string[]
  equipmentBlocks: ResolvedEquipmentBlock[]
  bgEquipmentChoices: string[]
}) {
  const narrativeEntries = getBackgroundNarrativeEntries(background)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 border-y border-border">
        <StatTile
          icon={<Brain className="size-4" weight="fill" />}
          label="Skills"
          value={skillNames.length > 0 ? skillNames.join(' · ') : '—'}
          className="border-r border-border"
        />
        <StatTile
          icon={<Wrench className="size-4" weight="fill" />}
          label="Tool Proficiency"
          value={toolNames.length > 0 ? toolNames.join(', ') : '—'}
        />
      </div>

      <EquipmentSection equipmentBlocks={equipmentBlocks} bgEquipmentChoices={bgEquipmentChoices} />

      {narrativeEntries.length > 0 && (
        <div className="mx-auto w-full max-w-[72ch]">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Background
          </h4>
          <div className="border-t border-border">
            {narrativeEntries.map((entry, index) => (
              <div
                key={typeof entry === 'string' ? `${index}:${entry}` : index}
                className="border-b border-border py-3"
              >
                <GameContent
                  entry={entry}
                  className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BackgroundDetails2014({
  background,
  skillNames,
  languageNames,
  toolNames,
  equipmentBlocks,
  bgEquipmentChoices,
}: {
  background: Background5e
  skillNames: string[]
  languageNames: string[]
  toolNames: string[]
  equipmentBlocks: ResolvedEquipmentBlock[]
  bgEquipmentChoices: string[]
}) {
  const namedSections = getBackgroundEntries(background).filter((s) => !!s.name)

  return (
    <div className="space-y-5">
      <div className="border-y border-border">
        <div className="flex min-h-16 items-center gap-3 px-3 py-2.5">
          <Brain className="size-4 shrink-0 text-primary" weight="fill" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Skill Proficiencies
            </p>
            {skillNames.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {skillNames.map((name) => (
                  <Badge key={name} variant="secondary" className="capitalize text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-y border-border">
        <div className="min-h-16 border-r border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Translate className="size-4 shrink-0 text-primary" weight="fill" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Languages
            </p>
          </div>
          {languageNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {languageNames.map((name) => (
                <Badge key={name} variant="secondary" className="capitalize text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        <div className="min-h-16 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Wrench className="size-4 shrink-0 text-primary" weight="fill" />
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Tools
            </p>
          </div>
          {toolNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {toolNames.map((name) => (
                <Badge key={name} variant="secondary" className="capitalize text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </div>

      <EquipmentSection equipmentBlocks={equipmentBlocks} bgEquipmentChoices={bgEquipmentChoices} />

      {namedSections.length > 0 && (
        <div className="mx-auto w-full max-w-[72ch]">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Features
          </h4>
          <div className="border-t border-border">
            {namedSections.map((section, i) => (
              <div key={section.name ?? i} className="border-b border-border py-3">
                {section.name && <div className="font-semibold text-sm mb-1.5">{section.name}</div>}
                {section.entries.map((entry, idx) => (
                  <GameContent
                    key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
                    entry={entry}
                    className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_table]:text-xs [&_table]:w-full [&_th]:font-semibold [&_th]:text-left [&_td]:py-0.5"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function BuildBackgroundDetailsPanel({
  selectedBackground,
  skillNames,
  languageNames,
  toolNames,
  equipmentBlocks,
  bgEquipmentChoices,
}: BuildBackgroundDetailsPanelProps) {
  return (
    <ScrollArea className="flex-1 overflow-hidden">
      <WorkspaceDetailContent>
        {selectedBackground ? (
          selectedBackground.edition === 'one' ? (
            <BackgroundDetails2024
              background={selectedBackground}
              skillNames={skillNames}
              toolNames={toolNames}
              equipmentBlocks={equipmentBlocks}
              bgEquipmentChoices={bgEquipmentChoices}
            />
          ) : (
            <BackgroundDetails2014
              background={selectedBackground}
              skillNames={skillNames}
              languageNames={languageNames}
              toolNames={toolNames}
              equipmentBlocks={equipmentBlocks}
              bgEquipmentChoices={bgEquipmentChoices}
            />
          )
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Select a background to view details
          </div>
        )}
      </WorkspaceDetailContent>
    </ScrollArea>
  )
}
