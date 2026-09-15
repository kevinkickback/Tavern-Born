import { CopySimple, Sparkle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CharacterDuplicateMode } from '@/lib/character/characterTransfer'
import type { Character } from '@/types/character'

interface DuplicateCharacterDialogProps {
  character: Character | null
  onOpenChange: (open: boolean) => void
  onDuplicate: (mode: CharacterDuplicateMode) => void
}

export function DuplicateCharacterDialog({
  character,
  onOpenChange,
  onDuplicate,
}: DuplicateCharacterDialogProps) {
  return (
    <Dialog open={!!character} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate character</DialogTitle>
          <DialogDescription>
            Choose whether the new character should keep the current session state.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto items-start justify-start gap-3 whitespace-normal p-4 text-left"
            onClick={() => onDuplicate('exact')}
          >
            <CopySimple className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">Exact copy</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Keep current HP, conditions, used resources, and spell-slot usage.
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto items-start justify-start gap-3 whitespace-normal p-4 text-left"
            onClick={() => onDuplicate('reusable-build')}
          >
            <Sparkle className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">Reusable build copy</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Keep build choices while resetting HP, conditions, resources, and slot usage.
              </span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
