import { useId } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ABILITY_ABBREV_TO_TITLE, ABILITY_FULL_TO_ABBREV } from '@/lib/calculations/abilityNames'
import type { SheetContentGroup } from '@/lib/pdf/sheetContent'
import {
  type CharacterSheetEdition,
  DEFAULT_SHEET_PRESENTATION_OPTIONS,
  type SheetContentChoices,
  type SheetPresentationOptions,
} from '@/lib/pdf/types'
import type { AbilityName } from '@/types/character'

function SheetOption<T extends string>({
  label,
  value,
  choices,
  onChange,
  description,
}: {
  label: string
  value: T
  choices: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  description?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger
          id={id}
          aria-describedby={description ? `${id}-description` : undefined}
          className="w-56"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map(([key, name]) => (
            <SelectItem key={key} value={key}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && (
        <p id={`${id}-description`} className="w-full text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
}

export function SheetContentDialog({
  open,
  onOpenChange,
  groups,
  choices,
  onChange,
  focusGroup,
  text,
  onTextChange,
  supportsImages,
  spellLayoutEdition,
  spellcastingAbilities,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: SheetContentGroup[]
  choices: SheetContentChoices
  onChange: (choices: SheetContentChoices) => void
  focusGroup?: string
  text: SheetPresentationOptions
  onTextChange: (text: SheetPresentationOptions) => void
  supportsImages: boolean
  spellLayoutEdition?: CharacterSheetEdition
  spellcastingAbilities: readonly AbilityName[]
}) {
  const overflow = text.overflow ?? DEFAULT_SHEET_PRESENTATION_OPTIONS.overflow
  const separateSpellPages = spellLayoutEdition === '2014'
  const ability = text.combinedSpellcastingAbility
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          if (!focusGroup) return
          const target = document.getElementById(`sheet-content-${focusGroup}`)
          if (target) {
            event.preventDefault()
            target.focus()
            target.scrollIntoView({ block: 'nearest' })
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Customize PDF</DialogTitle>
          <DialogDescription>Choose sheet content and layout.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-2">
          <div className="space-y-4 border-b pb-4">
            <SheetOption
              label="Rules descriptions"
              description="Show rules for features, feats, and items, or keep names and combat numbers."
              value={text.descriptions ?? 'full'}
              choices={[
                ['full', 'Include descriptions'],
                ['names', 'Names only'],
              ]}
              onChange={(descriptions) => onTextChange({ ...text, descriptions })}
            />
            <SheetOption
              label="Long text & extra entries"
              description={
                overflow === 'notes'
                  ? 'Keep overflow in Notes when that page is enabled.'
                  : 'Shorten text to fit and leave most overflow out.'
              }
              value={overflow}
              choices={[
                ['ellipsis', 'Shorten with ellipsis'],
                ['notes', 'Continue in notes'],
              ]}
              onChange={(next) => onTextChange({ ...text, overflow: next })}
            />
            {supportsImages && (
              <SheetOption
                label="Images"
                description="Portrait and organization emblem."
                value={text.images ?? 'color'}
                choices={[
                  ['color', 'Color images'],
                  ['grayscale', 'Greyscale images'],
                  ['none', 'No images'],
                ]}
                onChange={(images) => onTextChange({ ...text, images })}
              />
            )}
            {spellLayoutEdition && (
              <SheetOption
                label="Spell layout"
                description={
                  separateSpellPages
                    ? 'Combined puts every caster’s spells on one page.'
                    : 'Combined includes unprepared spells.'
                }
                value={text.spellLayout ?? DEFAULT_SHEET_PRESENTATION_OPTIONS.spellLayout}
                choices={[
                  [
                    'standard',
                    separateSpellPages ? 'Individual spell pages' : 'Standard spell list',
                  ],
                  ['combined', separateSpellPages ? 'Combined spell page' : 'Combined spell list'],
                ]}
                onChange={(spellLayout) => onTextChange({ ...text, spellLayout })}
              />
            )}
            {text.spellLayout === 'combined' && spellcastingAbilities.length > 1 && (
              <SheetOption<AbilityName | 'automatic'>
                label="Spellcasting ability"
                description="Sets the combined sheet’s spell save DC and attack bonus."
                value={ability && spellcastingAbilities.includes(ability) ? ability : 'automatic'}
                choices={[
                  ['automatic', 'Automatic'],
                  ...spellcastingAbilities.map(
                    (name) =>
                      [name, ABILITY_ABBREV_TO_TITLE[ABILITY_FULL_TO_ABBREV[name]]] as const,
                  ),
                ]}
                onChange={(value) =>
                  onTextChange({
                    ...text,
                    combinedSpellcastingAbility: value === 'automatic' ? undefined : value,
                  })
                }
              />
            )}
          </div>
          <Accordion
            key={`${open}:${focusGroup ?? ''}`}
            type="single"
            collapsible
            defaultValue={focusGroup}
          >
            {groups.map((group) => (
              <AccordionItem key={group.id} value={group.id}>
                <AccordionTrigger id={`sheet-content-${group.id}`} className="items-center px-1">
                  <span>{group.label}</span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {group.selected.length} / {group.entries.length}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <section aria-label={group.label}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {group.selected.length} selected
                        {group.capacity < group.entries.length ? ` · ${group.capacity} slots` : ''}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={group.automatic}
                        aria-label={`Automatic ${group.label.toLowerCase()}`}
                        onClick={() => {
                          const next = { ...choices }
                          delete next[group.id]
                          onChange(next)
                        }}
                      >
                        {group.automatic ? 'Automatic' : 'Use automatic'}
                      </Button>
                    </div>
                    <div className="max-h-60 divide-y overflow-y-auto rounded-md border">
                      {group.entries.map((entry) => {
                        const selected = group.selected.includes(entry.id)
                        return (
                          <label
                            key={entry.id}
                            htmlFor={`sheet-choice-${group.id}-${entry.id}`}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                          >
                            <Checkbox
                              id={`sheet-choice-${group.id}-${entry.id}`}
                              checked={selected}
                              disabled={!selected && group.selected.length >= group.capacity}
                              onCheckedChange={(checked) =>
                                onChange({
                                  ...choices,
                                  [group.id]: checked
                                    ? [...group.selected, entry.id]
                                    : group.selected.filter((id) => id !== entry.id),
                                })
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block">{entry.name}</span>
                              {entry.detail && (
                                <span className="block text-xs text-muted-foreground">
                                  {entry.detail}
                                </span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </section>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {groups.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              No attacks, spells, or other selectable entries yet.
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
