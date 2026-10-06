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
  isPending?: boolean
}

export function UnsupportedCharactersDialog({
  count,
  onExport,
  onAcknowledge,
  isPending = false,
}: UnsupportedCharactersDialogProps) {
  const plural = count === 1 ? '' : 's'
  const compatibilityDescription = `Tavern Born found ${count} character${plural} that ${count === 1 ? 'is incompatible with the current version or contains invalid data' : 'are incompatible with the current version or contain invalid data'}. ${count === 1 ? 'It has' : 'They have'} been removed from the character list.`
  const backupDescription = `Download the original file${plural} before continuing if you want to keep ${count === 1 ? 'a backup' : 'backups'} for recovery or use with a compatible older version of Tavern Born.`

  return (
    <AlertDialog open={count > 0}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Character compatibility issue</AlertDialogTitle>
          <AlertDialogDescription>{compatibilityDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">{backupDescription}</p>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onExport}>
            <DownloadSimple /> Download Backup{plural}
          </Button>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              onAcknowledge()
            }}
          >
            {isPending ? 'Continuing…' : 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
