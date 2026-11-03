import { useId, useState } from 'react'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import { favoredEnemyOption } from '@/lib/5etools/favoredEnemyIdentity'
import {
  getSpokenLanguageSuggestions,
  type SpokenLanguageSuggestions,
} from '@/lib/5etools/spokenLanguageSuggestions'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import type { CharacterClassChoiceSelection, FavoredEnemySetup as Setup } from '@/types/character'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'

export interface FavoredEnemySetupProps {
  selection?: CharacterClassChoiceSelection
  removalOnly: boolean
  types: ClassChoiceOptionView[]
  languages: NormalizedChoiceOptionReference[]
  knownLanguages?: readonly string[]
  suggestions?: SpokenLanguageSuggestions
  onConfirm: (selected: ClassChoiceOptionView[], setup: Setup) => void
  onClear: () => void
}
const title = (s: string) => s.replace(/^\p{L}/u, (c) => c.toUpperCase())

/** Compound campaign assertion adapter within the shared Class dialog and command workflow. */
export function FavoredEnemySetup({
  selection,
  removalOnly,
  types,
  languages,
  knownLanguages = [],
  suggestions,
  onConfirm,
  onClear,
  onClose,
}: FavoredEnemySetupProps & { onClose: () => void }) {
  const id = useId()
  const [mode, setMode] = useState<Setup['mode']>(selection?.favoredEnemy?.mode ?? 'type')
  const [names, setNames] = useState<string[]>(selection?.selected.map((o) => o.name) ?? [])
  const previousLanguage = selection?.favoredEnemy?.language
  const savedLanguage = previousLanguage?.kind === 'spoken' ? previousLanguage.name : undefined
  const known = new Set(knownLanguages.map(canonicalProficiencyName))
  const availableLanguages = languages.filter(
    (option) => !known.has(option.name) || option.name === savedLanguage,
  )
  const availableNames = new Set(availableLanguages.map((option) => option.name))
  const [language, setLanguage] = useState(
    previousLanguage?.kind === 'spoken'
      ? previousLanguage.name
      : previousLanguage?.kind === 'none'
        ? 'none'
        : 'pending',
  )
  const [showAll, setShowAll] = useState(false)
  const matchingLanguages = (nextMode: Setup['mode'], next: string[]) =>
    getSpokenLanguageSuggestions(
      suggestions,
      nextMode === 'type' ? { creatureType: next[0] } : { races: next },
    ).filter((name) => availableNames.has(name))
  const changeNames = (next: string[], nextMode = mode) => {
    setNames(next)
    if (
      nextMode === mode &&
      next.length === names.length &&
      next.every((name, i) => name.trim().toLowerCase() === names[i].trim().toLowerCase())
    )
      return
    const complete =
      nextMode === 'type'
        ? types.some((o) => o.reference.name === next[0]?.trim().toLowerCase())
        : next.length === 2 &&
          next.every((n) => n.trim()) &&
          next[0].trim().toLowerCase() !== next[1].trim().toLowerCase()
    const matches = complete ? matchingLanguages(nextMode, next) : []
    setLanguage(matches.length === 1 ? matches[0] : 'pending')
    setShowAll(false)
  }
  const nonempty = names.map((n) => n.trim()).filter(Boolean)
  const duplicate = new Set(nonempty.map((n) => n.toLowerCase())).size !== nonempty.length
  const validType = types.some((o) => o.reference.name === nonempty[0]?.toLowerCase())
  const enemiesComplete =
    !duplicate && (mode === 'type' ? nonempty.length === 1 && validType : nonempty.length === 2)
  const suggestedLanguages = enemiesComplete ? matchingLanguages(mode, names) : []
  const restricted = !showAll && suggestedLanguages.length > 0
  const visibleLanguages = availableLanguages.filter(
    (o) => !restricted || suggestedLanguages.includes(o.name) || o.name === language,
  )
  const unavailableLanguage =
    language !== 'pending' && language !== 'none' && !languages.some((o) => o.name === language)
  const alreadyKnownLanguage =
    language !== 'pending' &&
    language !== 'none' &&
    language !== savedLanguage &&
    known.has(language)
  const confirm = () =>
    onConfirm(
      nonempty.map((name) => ({
        reference: favoredEnemyOption(name, mode),
        availability: 'eligible',
        entries: [],
      })),
      {
        mode,
        ...(mode === 'humanoid-races' && enemiesComplete ? { humanoidsConfirmed: true } : {}),
        ...(enemiesComplete &&
        !unavailableLanguage &&
        !alreadyKnownLanguage &&
        language !== 'pending'
          ? {
              language:
                language === 'none'
                  ? { kind: 'none' as const }
                  : { kind: 'spoken' as const, name: language },
            }
          : {}),
      },
    )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Favored Enemy{selection ? ` — level ${selection.classLevel}` : ''}
          </DialogTitle>
          <DialogDescription>
            Choose your favored enemies and associated language.
          </DialogDescription>
        </DialogHeader>
        {removalOnly ? (
          <p className="text-sm text-muted-foreground">
            Current source rules are unavailable. Saved enemies: {nonempty.join(', ') || 'pending'}.
            Restore the exact source to edit, or clear this earned allocation.
          </p>
        ) : (
          <div className="space-y-4">
            <Tabs
              className="gap-4"
              value={mode}
              activationMode="manual"
              onValueChange={(value) => {
                const next = value as Setup['mode']
                setMode(next)
                changeNames([], next)
              }}
            >
              <TabsList aria-label="Enemy selection" className="h-auto w-full">
                <TabsTrigger value="type" className="flex-1 whitespace-normal">
                  One creature type
                </TabsTrigger>
                <TabsTrigger value="humanoid-races" className="flex-1 whitespace-normal">
                  Two humanoid races
                </TabsTrigger>
              </TabsList>
              <TabsContent value={mode}>
                {mode === 'type' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-type`}>Creature type</Label>
                    <AutocompleteInput
                      id={`${id}-type`}
                      value={names[0] ?? ''}
                      placeholder="Search creature types…"
                      suggestionsLabel="Creature type suggestions"
                      maxLength={200}
                      onValueChange={(value) => changeNames([value])}
                      options={types.map((o) => ({ value: title(o.reference.name) }))}
                    />
                    {nonempty.length > 0 && !validType && (
                      <p className="text-sm text-destructive">Choose an available creature type.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[0, 1].map((i) => (
                      <div key={i} className="space-y-1.5">
                        <Label htmlFor={`${id}-race-${i}`}>Humanoid race {i + 1}</Label>
                        <AutocompleteInput
                          id={`${id}-race-${i}`}
                          value={names[i] ?? ''}
                          placeholder="Search races or enter a campaign race…"
                          suggestionsLabel={`Humanoid race ${i + 1} suggestions`}
                          maxLength={200}
                          onValueChange={(value) => {
                            const next = [names[0] ?? '', names[1] ?? '']
                            next[i] = value
                            changeNames(next)
                          }}
                          options={(suggestions?.races ?? []).map((race) => ({
                            value: race.name,
                            label: `${race.name} (${race.source})`,
                          }))}
                        />
                      </div>
                    ))}
                    {duplicate && (
                      <p className="text-sm text-destructive">
                        Choose two distinct humanoid races.
                      </p>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-language`}>Associated language</Label>
              <Select value={language} onValueChange={setLanguage} disabled={!enemiesComplete}>
                <SelectTrigger id={`${id}-language`} aria-label="Associated language">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Decide later</SelectItem>
                  <SelectItem value="none">These enemies speak no language</SelectItem>
                  {visibleLanguages.map((o) => (
                    <SelectItem key={o.name} value={o.name}>
                      {title(o.name)}
                    </SelectItem>
                  ))}
                  {unavailableLanguage && (
                    <SelectItem value={language} disabled>
                      {title(language)} (unavailable)
                    </SelectItem>
                  )}
                  {!unavailableLanguage && alreadyKnownLanguage && (
                    <SelectItem value={language} disabled>
                      {title(language)} (already known)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {enemiesComplete && suggestedLanguages.length > 0 && (
                <div className="space-y-1">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Show suggested languages' : 'Show all languages'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!removalOnly && (
            <Button
              onClick={confirm}
              disabled={
                duplicate ||
                (mode === 'type' && nonempty.length > 0 && !validType) ||
                unavailableLanguage ||
                alreadyKnownLanguage
              }
            >
              Confirm
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
