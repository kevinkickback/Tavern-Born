import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { useCharacterContentOpening } from '@/hooks/character/useCharacterContentOpening'

export function CharacterContentOpeningDialog({
  opening,
}: {
  opening: ReturnType<typeof useCharacterContentOpening>
}) {
  const { pending, cancel, openLimited, restoreFocus } = opening
  const title = useRef<HTMLHeadingElement>(null)
  const dismissed = useRef(false)
  if (!pending) return null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          dismissed.current = true
          cancel()
        }
      }}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          dismissed.current = false
          event.preventDefault()
          title.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!dismissed.current) return
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader>
          <DialogTitle ref={title} tabIndex={-1}>
            Additional content unavailable
          </DialogTitle>
          <DialogDescription>
            {pending.name || 'This character'} uses unavailable rules. Your choices stay saved.
            Restore the original source in Game Data settings and reopen to edit affected choices.
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label="Unavailable saved rules"
          className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm"
        >
          {pending.missing.map(({ name, source }) => (
            <li key={JSON.stringify([name, source])}>
              {name}
              {source && ` (${source})`}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" asChild>
            <Link to="/settings?section=data" onClick={cancel}>
              Game Data settings
            </Link>
          </Button>
          <Button onClick={openLimited}>Open with limited access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
