import { DownloadSimple } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface UnsupportedCharactersDialogProps {
  count: number
  onExport: () => void
  onAcknowledge: () => void
}

export function UnsupportedCharactersDialog({
  count,
  onExport,
  onAcknowledge,
}: UnsupportedCharactersDialogProps) {
  const plural = count === 1 ? '' : 's'

  return (
    <AlertDialog open={count > 0}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Character compatibility issue</AlertDialogTitle>
          <AlertDialogDescription>
            Tavern Born found {count} character{plural} saved by an older version of the app. This
            version can't open {count === 1 ? 'it' : 'them'}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          Download the original file{plural} before continuing if you want to keep{' '}
          {count === 1 ? 'it' : 'them'}. {count === 1 ? 'It' : 'They'} can only be opened with a
          compatible older version of Tavern Born.
        </p>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onExport}>
            <DownloadSimple /> Download Backup{plural}
          </Button>
          <AlertDialogAction onClick={onAcknowledge}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
