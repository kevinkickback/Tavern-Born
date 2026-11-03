import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { favoredEnemyOption } from '@/lib/5etools/favoredEnemyIdentity'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import type { CharacterClassChoiceSelection, FavoredEnemySetup as Setup } from '@/types/character'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'

export interface FavoredEnemySetupProps {
  selection?: CharacterClassChoiceSelection
  removalOnly: boolean
  types: ClassChoiceOptionView[]
  languages: NormalizedChoiceOptionReference[]
  onConfirm: (selected: ClassChoiceOptionView[], setup: Setup) => void
  onClear: () => void
}
const title = (s: string) => s.replace(/^\p{L}/u, (c) => c.toUpperCase())
function SetupSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  options: { name: string; value: string; disabled?: boolean }[]
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
/** Compound campaign assertion adapter within the shared Class dialog and command workflow. */
export function FavoredEnemySetup({
  selection,
  removalOnly,
  types,
  languages,
  onConfirm,
  onClear,
  onClose,
}: FavoredEnemySetupProps & { onClose: () => void }) {
  const confirmationId = useId()
  const [mode, setMode] = useState<Setup['mode']>(selection?.favoredEnemy?.mode ?? 'type')
  const [names, setNames] = useState<string[]>(selection?.selected.map((o) => o.name) ?? [])
  const [humanoidsConfirmed, setHumanoidsConfirmed] = useState(
    !!selection?.favoredEnemy?.humanoidsConfirmed,
  )
  const previousLanguage = selection?.favoredEnemy?.language
  const [language, setLanguage] = useState(
    previousLanguage?.kind === 'spoken'
      ? previousLanguage.name
      : previousLanguage?.kind === 'none'
        ? 'none'
        : 'pending',
  )
  const [languageConfirmed, setLanguageConfirmed] = useState(!!previousLanguage)
  const resetLanguage = () => {
    setLanguage('pending')
    setLanguageConfirmed(false)
  }
  const changeNames = (next: string[]) => {
    setNames(next)
    setHumanoidsConfirmed(false)
    resetLanguage()
  }
  const nonempty = names.map((n) => n.trim()).filter(Boolean)
  const duplicate = new Set(nonempty.map((n) => n.toLowerCase())).size !== nonempty.length
  const enemiesComplete =
    !duplicate &&
    (mode === 'type' ? nonempty.length === 1 : nonempty.length === 2 && humanoidsConfirmed)
  const unavailableLanguage =
    language !== 'pending' && language !== 'none' && !languages.some((o) => o.name === language)
  const confirm = () =>
    onConfirm(
      nonempty.map((name) => ({
        reference: favoredEnemyOption(name, mode),
        availability: 'eligible',
        entries: [],
      })),
      {
        mode,
        ...(mode === 'humanoid-races' && humanoidsConfirmed ? { humanoidsConfirmed: true } : {}),
        ...(enemiesComplete && languageConfirmed && language !== 'pending'
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
            Choose one creature type or two distinct humanoid races. Confirm campaign facts with
            your DM; the app cannot verify a complete enemy race or spoken-language map.
          </DialogDescription>
        </DialogHeader>
        {removalOnly ? (
          <p className="text-sm text-muted-foreground">
            Current source rules are unavailable. Saved enemies: {nonempty.join(', ') || 'pending'}.
            Restore the exact source to edit, or clear this earned allocation.
          </p>
        ) : (
          <div className="space-y-4">
            <SetupSelect
              label="Enemy selection"
              value={mode}
              onChange={(v) => {
                setMode(v as Setup['mode'])
                changeNames([])
              }}
              options={[
                { value: 'type', name: 'One creature type' },
                { value: 'humanoid-races', name: 'Two humanoid races' },
              ]}
            />
            {mode === 'type' ? (
              <SetupSelect
                label="Creature type"
                value={names[0] ?? ''}
                onChange={(v) => changeNames([v])}
                options={types.map((o) => ({
                  value: o.reference.name,
                  name: title(o.reference.name),
                }))}
              />
            ) : (
              <>
                {[0, 1].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <Label htmlFor={`enemy-race-${i}`}>Humanoid race {i + 1}</Label>
                    <Input
                      id={`enemy-race-${i}`}
                      value={names[i] ?? ''}
                      maxLength={200}
                      onChange={(e) => {
                        const next = [names[0] ?? '', names[1] ?? '']
                        next[i] = e.target.value
                        changeNames(next)
                      }}
                    />
                  </div>
                ))}
                <label
                  htmlFor={`${confirmationId}-races`}
                  className="flex items-start gap-2 text-sm"
                >
                  <Checkbox
                    id={`${confirmationId}-races`}
                    checked={humanoidsConfirmed}
                    disabled={nonempty.length !== 2 || duplicate}
                    onCheckedChange={(v) => {
                      setHumanoidsConfirmed(v === true)
                      resetLanguage()
                    }}
                  />
                  I confirm these identify two distinct humanoid races in this campaign.
                </label>
                {duplicate && (
                  <p className="text-sm text-destructive">Choose two distinct humanoid races.</p>
                )}
              </>
            )}
            <SetupSelect
              label="Associated language"
              value={language}
              onChange={(v) => {
                setLanguage(v)
                setLanguageConfirmed(false)
              }}
              options={[
                { value: 'pending', name: 'Decide later' },
                { value: 'none', name: 'These enemies speak no language' },
                ...languages.map((o) => ({ value: o.name, name: title(o.name) })),
                ...(unavailableLanguage
                  ? [{ value: language, name: `${title(language)} (unavailable)`, disabled: true }]
                  : []),
              ]}
            />
            {language !== 'pending' && (
              <label
                htmlFor={`${confirmationId}-language`}
                className="flex items-start gap-2 text-sm"
              >
                <Checkbox
                  id={`${confirmationId}-language`}
                  checked={languageConfirmed && enemiesComplete}
                  disabled={!enemiesComplete || unavailableLanguage}
                  onCheckedChange={(v) => setLanguageConfirmed(v === true)}
                />
                {language === 'none'
                  ? 'I confirm these favored enemies speak no language in this campaign.'
                  : 'I confirm this language is spoken by the chosen enemies (at least one race for a humanoid pair) and is allowed in this campaign.'}
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              An already known language can be recorded again; it grants no substitute language. If
              the desired language is unavailable, retain pending setup and restore its source.
              Changing enemies resets their language confirmation.
            </p>
            {!enemiesComplete && (
              <p className="text-sm text-muted-foreground">
                Enemy setup is incomplete. You can save partial progress.
              </p>
            )}
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
            <Button onClick={confirm} disabled={duplicate}>
              Confirm
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
