import { Barbell, Brain, Star, Translate, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceDetailContent, WorkspacePaneHeader } from '@/components/workspace'
import {
  formatEquipmentOptionEntries,
  type ResolvedEquipmentBlock,
} from '@/lib/5etools/startingEquipment'
import { ABILITY_ABBREVIATIONS, type BackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { getBackgroundEntries } from '@/pages/build/background/model/data'
import type { Background5e } from '@/types/5etools'
import type { AbilityName } from '@/types/character'

interface BuildBackgroundDetailsPanelProps {
  selectedBackground?: Background5e
  skillNames: string[]
  languageNames: string[]
  toolNames: string[]
  equipmentBlocks: ResolvedEquipmentBlock[]
  bgEquipmentChoices: string[]
  fixedBgFeats: string[]
  chosenOriginFeat: string | null
  bgAsiData: BackgroundAbilityData
  bgBlockIndex: number
  bgChoices: string[]
}

function formatAsiDisplay(
  bgAsiData: BackgroundAbilityData,
  bgBlockIndex: number,
  bgChoices: string[],
): string {
  const block = bgAsiData.blocks[bgBlockIndex] ?? bgAsiData.blocks[0]
  if (!block) return '—'
  const allChosen = block.weights.every((_, i) => !!bgChoices[i])
  if (allChosen) {
    return block.weights
      .map((w, i) => {
        const a = bgChoices[i] as AbilityName | undefined
        const abbr = a ? (ABILITY_ABBREVIATIONS[a] ?? a) : '?'
        return `+${w} ${abbr}`
      })
      .join(', ')
  }
  const weightsStr = block.weights.map((w) => `+${w}`).join('/')
  const fromStr = block.from.map((a) => ABILITY_ABBREVIATIONS[a] ?? a).join(', ')
  return `${weightsStr} from ${fromStr}`
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
  fixedBgFeats,
  chosenOriginFeat,
  bgAsiData,
  bgBlockIndex,
  bgChoices,
  equipmentBlocks,
  bgEquipmentChoices,
}: {
  background: Background5e
  skillNames: string[]
  toolNames: string[]
  fixedBgFeats: string[]
  chosenOriginFeat: string | null
  bgAsiData: BackgroundAbilityData
  bgBlockIndex: number
  bgChoices: string[]
  equipmentBlocks: ResolvedEquipmentBlock[]
  bgEquipmentChoices: string[]
}) {
  const asiDisplay = formatAsiDisplay(bgAsiData, bgBlockIndex, bgChoices)
  const featDisplay = fixedBgFeats[0] ?? chosenOriginFeat ?? 'Not chosen'

  const narrativeEntries = ((background.entries as unknown[]) ?? []).filter((e) => {
    const entry = e as { type?: string }
    return typeof e === 'object' && entry.type === 'entries'
  }) as { name?: string; entries: unknown[] }[]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 border-y border-border">
        <StatTile
          icon={<Brain className="size-4" weight="fill" />}
          label="Skills"
          value={skillNames.length > 0 ? skillNames.join(' · ') : '—'}
          className="border-b border-r border-border"
        />
        <StatTile
          icon={<Wrench className="size-4" weight="fill" />}
          label="Tool Proficiency"
          value={toolNames.length > 0 ? toolNames.join(', ') : '—'}
          className="border-b border-border"
        />
        <StatTile
          icon={<Barbell className="size-4" weight="fill" />}
          label="Ability Scores"
          value={asiDisplay}
          className="border-r border-border"
        />
        <StatTile
          icon={<Star className="size-4" weight="fill" />}
          label="Origin Feat"
          value={featDisplay}
        />
      </div>

      <EquipmentSection equipmentBlocks={equipmentBlocks} bgEquipmentChoices={bgEquipmentChoices} />

      {narrativeEntries.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Features
          </h4>
          <div className="border-t border-border">
            {narrativeEntries.map((section, i) => (
              <div key={section.name ?? i} className="border-b border-border py-3">
                {section.name && <div className="font-semibold text-sm mb-1.5">{section.name}</div>}
                {section.entries.map((entry, idx) => (
                  <div
                    key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
                    className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                    dangerouslySetInnerHTML={{ __html: renderEntry(entry) }}
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
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Features
          </h4>
          <div className="border-t border-border">
            {namedSections.map((section, i) => (
              <div key={section.name ?? i} className="border-b border-border py-3">
                {section.name && <div className="font-semibold text-sm mb-1.5">{section.name}</div>}
                {section.entries.map((entry, idx) => (
                  <div
                    key={typeof entry === 'string' ? `${idx}:${entry}` : idx}
                    className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_table]:text-xs [&_table]:w-full [&_th]:font-semibold [&_th]:text-left [&_td]:py-0.5"
                    dangerouslySetInnerHTML={{ __html: renderEntry(entry) }}
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
  fixedBgFeats,
  chosenOriginFeat,
  bgAsiData,
  bgBlockIndex,
  bgChoices,
}: BuildBackgroundDetailsPanelProps) {
  return (
    <>
      <WorkspacePaneHeader title="Background details" className="pr-20">
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {selectedBackground ? (
            <>
              <span className="truncate text-sm font-semibold leading-tight">
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
      </WorkspacePaneHeader>
      <ScrollArea className="flex-1 overflow-hidden">
        <WorkspaceDetailContent>
          {selectedBackground ? (
            selectedBackground.edition === 'one' ? (
              <BackgroundDetails2024
                background={selectedBackground}
                skillNames={skillNames}
                toolNames={toolNames}
                fixedBgFeats={fixedBgFeats}
                chosenOriginFeat={chosenOriginFeat}
                bgAsiData={bgAsiData}
                bgBlockIndex={bgBlockIndex}
                bgChoices={bgChoices}
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
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Select a background to view details
            </div>
          )}
        </WorkspaceDetailContent>
      </ScrollArea>
    </>
  )
}
