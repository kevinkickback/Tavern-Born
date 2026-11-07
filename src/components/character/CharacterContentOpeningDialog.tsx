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
  const { pending, retrying, retryMessage, canRetry, cancel, retry, openLimited } = opening
  if (!pending) return null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Additional content unavailable</DialogTitle>
          <DialogDescription>
            {pending.name || 'This character'} uses rules missing from the current game data. You
            can open the character and keep the saved choices. Editing choices that need those rules
            requires their original source.
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label="Unavailable saved rules"
          className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm"
        >
          {pending.missing.map(({ name, source }) => (
            <li key={JSON.stringify([name, source])}>
              {name}
              {source && ' (' + source + ')'}
            </li>
          ))}
        </ul>
        {retryMessage && (
          <p role="status" className="text-sm text-muted-foreground">
            {retryMessage}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          {canRetry ? (
            <Button variant="outline" disabled={retrying} onClick={() => void retry()}>
              {retrying ? 'Retrying source…' : 'Retry source'}
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link to="/settings?section=data" onClick={cancel}>
                Game Data settings
              </Link>
            </Button>
          )}
          <Button onClick={openLimited} disabled={retrying}>
            Open with limited access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
