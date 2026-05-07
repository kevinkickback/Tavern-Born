import { Barbell, Brain, Star, Translate, Wrench } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  detailCollapsed: boolean
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
      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 border-l-2 border-accent pl-2">
        Starting Equipment
      </h4>
      <div className="rounded-xl border border-border shadow-sm overflow-hidden">
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

function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="border border-border shadow-sm rounded-xl">
      <div className="flex items-center justify-between p-3.5">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 shadow-md flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="text-right min-w-0 ml-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className="text-xs font-bold mt-0.5 truncate" title={value}>
            {value}
          </p>
        </div>
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
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<Brain className="h-5 w-5 text-white" weight="fill" />}
          label="Skills"
          value={skillNames.length > 0 ? skillNames.join(' · ') : '—'}
        />
        <StatTile
          icon={<Wrench className="h-5 w-5 text-white" weight="fill" />}
          label="Tool Proficiency"
          value={toolNames.length > 0 ? toolNames.join(', ') : '—'}
        />
        <StatTile
          icon={<Barbell className="h-5 w-5 text-white" weight="fill" />}
          label="Ability Scores"
          value={asiDisplay}
        />
        <StatTile
          icon={<Star className="h-5 w-5 text-white" weight="fill" />}
          label="Origin Feat"
          value={featDisplay}
        />
      </div>

      <EquipmentSection equipmentBlocks={equipmentBlocks} bgEquipmentChoices={bgEquipmentChoices} />

      {narrativeEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 border-l-2 border-accent pl-2">
            Features
          </h4>
          <div className="space-y-3">
            {narrativeEntries.map((section, i) => (
              <div
                key={section.name ?? i}
                className="border border-border/60 shadow-sm rounded-lg p-3"
              >
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
      {/* Skills — full-width tile with badge list */}
      <div className="border border-border shadow-sm rounded-xl">
        <div className="p-3.5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 shadow-md flex items-center justify-center flex-shrink-0">
            <Brain className="h-5 w-5 text-white" weight="fill" />
          </div>
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

      {/* Languages + Tools — 2-col */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border shadow-sm rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-primary/60 shadow flex items-center justify-center flex-shrink-0">
              <Translate className="h-4 w-4 text-white" weight="fill" />
            </div>
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

        <div className="border border-border shadow-sm rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-primary/60 shadow flex items-center justify-center flex-shrink-0">
              <Wrench className="h-4 w-4 text-white" weight="fill" />
            </div>
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
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 border-l-2 border-accent pl-2">
            Features
          </h4>
          <div className="space-y-3">
            {namedSections.map((section, i) => (
              <div
                key={section.name ?? i}
                className="border border-border/60 shadow-sm rounded-lg p-3"
              >
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
  detailCollapsed,
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
        </div>
      </ScrollArea>
    </div>
  )
}
