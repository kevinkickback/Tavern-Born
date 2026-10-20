import { CaretRight, Check } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import {
  getClassChoiceDeclaration,
  getClassChoiceFeatureTarget,
} from '@/lib/character/classChoiceIdentity'
import type { ClassFeatureDetailOrigin } from '@/lib/character/classFeatureActivityView'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import type { OptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  getOptionalClassAdoptionKey,
  optionalClassOwner,
} from '@/lib/character/optionalClassFeatureIdentity'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type {
  Character,
  OptionalClassFeatureAdoption,
  OptionalClassFeatureOwner,
} from '@/types/character'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassFeatureDisplay } from './DetailsPanel'

type OptionalRow = OptionalClassFeatureActivity['states'][number]
interface OptionalClassFeaturesProps {
  character: Character
  className: string
  classSource?: string
  level: number
  activity: OptionalClassFeatureActivity
  renderContent?: (rows: readonly OptionalRow[]) => ReactNode
  onSelectFeature: (feature: {
    name: string
    source?: string
    entries: unknown[]
    origin: ClassFeatureDetailOrigin
  }) => void
}

/** Presentation grouping only; the shared activity/commands still own all entitlement. */
export function getVisibleOptionalClassFeatures({
  character,
  className,
  classSource,
  level,
  activity,
}: Omit<
  Pick<
    OptionalClassFeaturesProps,
    'character' | 'className' | 'classSource' | 'level' | 'activity'
  >,
  'level'
> & { level?: number }) {
  if (!character.variantRules?.optionalClassFeatures || !classSource) return []
  const owner = optionalClassOwner({ name: className, source: classSource })
  const entry = character.classProgression.find(
    (row) =>
      row.name.trim().toLowerCase() === owner[1] && row.source?.trim().toLowerCase() === owner[2],
  )
  const subOwner =
    entry?.subclass && entry.subclassSource
      ? optionalClassOwner({
          name: className,
          source: classSource,
          subclassName: entry.subclass,
          subclassSource: entry.subclassSource,
        })
      : undefined
  return activity.states.filter(
    (row) =>
      (JSON.stringify(row.root.owner) === JSON.stringify(owner) ||
        (subOwner && JSON.stringify(row.root.owner) === JSON.stringify(subOwner))) &&
      (level === undefined || row.root.level === level) &&
      (row.offered || row.state !== 'unselected'),
  )
}

export function belongsToOptionalClassFeatures(
  feature: ClassFeatureDisplay,
  rows: readonly OptionalRow[],
) {
  const origin = feature.origin
  return origin?.kind === 'declared' && ownsTarget(origin.owner, origin.target, rows)
}

function ownsTarget(
  owner: OptionalClassFeatureOwner,
  target: string | undefined,
  rows: readonly OptionalRow[],
) {
  return (
    !!target &&
    rows.some(
      ({ root }) =>
        JSON.stringify(owner) === JSON.stringify(root.owner) &&
        [root.target, ...root.children, ...root.replaces.map((row) => row.target)].includes(target),
    )
  )
}

export function getClassChoicePresentationTarget(choice: NormalizedCharacterChoice) {
  return (
    decodeClassProficiencyChoiceId(choice.id)?.target ??
    decodeNaturalExplorerChoiceId(choice.id)?.grant ??
    getClassChoiceDeclaration(choice)?.target
  )
}

export function optionalClassFeaturesOwnChoice(
  choice: NormalizedCharacterChoice,
  rows: readonly OptionalRow[],
) {
  return ownsTarget(
    optionalClassOwner(choice.owner),
    getClassChoicePresentationTarget(choice),
    rows,
  )
}

export function optionalClassFeaturesOwnDiagnostic(
  diagnostic: ClassChoiceDiagnostic,
  rows: readonly OptionalRow[],
) {
  const target =
    diagnostic.requiredChoice && getClassChoiceFeatureTarget(diagnostic.requiredChoice.target)
  return ownsTarget(
    optionalClassOwner({
      name: diagnostic.className,
      source: diagnostic.classSource,
      subclassName: diagnostic.subclassName,
      subclassSource: diagnostic.subclassSource,
    }),
    target,
    rows,
  )
}

export function OptionalClassFeatures(props: OptionalClassFeaturesProps) {
  const { character, activity, renderContent, onSelectFeature } = props
  const catalogs = activity.catalogs
  const rows = getVisibleOptionalClassFeatures(props)
  if (!rows.length) return null
  const groups = new Map<string, OptionalRow[]>()
  for (const row of rows) {
    const key = JSON.stringify([row.root.owner, row.root.family ?? row.root.target, row.root.level])
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  const change = (request: OptionalClassFeatureAdoption, adopt: boolean) => {
    const latest = useCharacterStore.getState().activeCharacter
    if (!latest || latest.id !== character.id) return
    try {
      const result = setOptionalClassAdoptionCommand(
        latest,
        latest.provenance,
        catalogs,
        request,
        adopt,
        getOptionalClassFamilyKeys(character, request),
      )
      if (Object.keys(result.characterPatch).length)
        useCharacterStore.getState().updateCharacter(latest.id, {
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'The optional feature could not be changed.',
      )
    }
  }
  const selectedContent = (group: readonly OptionalRow[]) => (
    <>
      {group.map(({ root, state, adoption }) => (
        <div key={getOptionalClassAdoptionKey(adoption)}>
          {state === 'unavailable' && (
            <p className="text-xs text-warning">
              Source unavailable. Restore the source or{' '}
              {root.original ? 'use the standard feature' : 'clear this feature'}.
            </p>
          )}
        </div>
      ))}
      {renderContent?.(group)}
    </>
  )
  return (
    <section aria-label="Optional class features" className="space-y-4">
      {[...groups].map(([key, group]) => {
        const original = group[0].root.original
        if (!original) {
          const row = group[0],
            selected = row.state !== 'unselected'
          return (
            <div
              key={key}
              className="space-y-2 border-b border-border/60 pb-4 last:border-b-0 last:pb-0"
            >
              <div
                className={cn(
                  'flex items-stretch rounded-lg border text-sm font-medium transition-colors',
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50 hover:bg-accent/5',
                )}
              >
                <div className="flex shrink-0 items-center pl-3">
                  <input
                    type="checkbox"
                    aria-label={row.root.name}
                    checked={selected}
                    disabled={!selected && !row.offered}
                    onChange={(event) => change(row.adoption, event.target.checked)}
                    className="size-4 accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  disabled={!row.current}
                  onClick={() => {
                    if (row.current)
                      onSelectFeature({
                        name: row.current.name,
                        source: row.current.source,
                        entries: row.current.entries ?? [],
                        origin: {
                          kind: 'declared',
                          owner: row.root.owner,
                          target: row.root.target,
                          earnedLevel: row.root.level,
                        },
                      })
                  }}
                  className="group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-r-lg p-3 text-left transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-50"
                >
                  <span>{row.root.name}</span>
                  <CaretRight className="size-3 shrink-0 text-muted-foreground group-hover:text-accent" />
                </button>
              </div>
              {selected && selectedContent(group)}
            </div>
          )
        }
        const selected = group.find((row) => row.state !== 'unselected')
        const value = selected ? getOptionalClassAdoptionKey(selected.adoption) : 'standard'
        return (
          <Tabs
            key={key}
            value={value}
            activationMode="manual"
            onValueChange={(next) => {
              if (next === 'standard') {
                if (selected) change(selected.adoption, false)
              } else {
                const row = group.find((row) => getOptionalClassAdoptionKey(row.adoption) === next)
                if (row) change(row.adoption, true)
              }
            }}
            className="gap-3 border-b border-border/60 pb-4 last:border-b-0 last:pb-0"
          >
            <TabsList
              aria-label={`${original.name} replacement`}
              className="h-auto w-full flex-wrap items-stretch"
            >
              <TabsTrigger
                value="standard"
                className="h-auto min-w-0 basis-0 whitespace-normal px-2 py-2 text-xs"
              >
                <span className="inline-flex items-center gap-1">
                  {!selected && <Check className="size-3" weight="bold" />}
                  {original.name}
                </span>
              </TabsTrigger>
              {group.map((row) => (
                <TabsTrigger
                  key={getOptionalClassAdoptionKey(row.adoption)}
                  value={getOptionalClassAdoptionKey(row.adoption)}
                  disabled={row.state === 'unselected' && !row.offered}
                  className="h-auto min-w-0 basis-0 whitespace-normal px-2 py-2 text-xs"
                >
                  <span className="inline-flex items-center gap-1">
                    {row === selected && <Check className="size-3" weight="bold" />}
                    {row.root.name}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="standard" className="space-y-2">
              {renderContent?.(group)}
            </TabsContent>
            {group.map((row) => (
              <TabsContent
                key={getOptionalClassAdoptionKey(row.adoption)}
                value={getOptionalClassAdoptionKey(row.adoption)}
                className="space-y-2"
              >
                {selectedContent(group)}
              </TabsContent>
            ))}
          </Tabs>
        )
      })}
    </section>
  )
}
