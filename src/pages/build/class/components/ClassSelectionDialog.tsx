import { Sword } from '@phosphor-icons/react'
import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { casterProgressionToFull } from '@/lib/calculations/spellSlots'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'

export interface ClassSelectionDialogProps {
  open: boolean
  classes: Class5e[]
  search: string
  selectedClassName?: string
  selectedClassSource?: string
  onOpenChange: (open: boolean) => void
  onSearchChange: (value: string) => void
  onClassSelect: (className: string, classSource?: string) => void
}

export function ClassSelectionDialog({
  open,
  classes,
  search,
  selectedClassName,
  selectedClassSource,
  onOpenChange,
  onSearchChange,
  onClassSelect,
}: ClassSelectionDialogProps) {
  const filteredClasses = useMemo(
    () => classes.filter((cls) => !search || cls.name.toLowerCase().includes(search.toLowerCase())),
    [classes, search],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-2xl flex flex-col gap-4 max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Choose a Class</DialogTitle>
          <DialogDescription>Select your character's class</DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search classes..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-9"
        />

        <ScrollArea className="flex-1 max-h-[55vh]">
          <div className="grid grid-cols-2 gap-2 pr-3">
            {filteredClasses.map((cls) => {
              const isSelected = selectedClassSource
                ? selectedClassName === cls.name && selectedClassSource === (cls.source ?? '')
                : selectedClassName === cls.name

              return (
                <button
                  key={`${cls.name}|${cls.source ?? ''}`}
                  type="button"
                  onClick={() => onClassSelect(cls.name, cls.source ?? undefined)}
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01]',
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50',
                  )}
                >
                  <div className="font-semibold font-display text-sm flex items-center gap-1.5">
                    <Sword className="h-3.5 w-3.5 text-accent" weight="duotone" />
                    {cls.name}
                  </div>

                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <span>d{cls.hd?.faces ?? 8}</span>
                    {cls.spellcastingAbility && (
                      <>
                        <span>-</span>
                        <span>
                          {cls.casterProgression
                            ? casterProgressionToFull(cls.casterProgression)
                            : 'Spellcaster'}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}

            {filteredClasses.length === 0 && (
              <p className="col-span-2 text-sm text-muted-foreground text-center py-4">
                No classes found
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
