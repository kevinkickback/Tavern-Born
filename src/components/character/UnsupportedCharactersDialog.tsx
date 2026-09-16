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
          <AlertDialogTitle>Older character{plural} could not be loaded</AlertDialogTitle>
          <AlertDialogDescription>
            {count} character{plural} created by an older beta version cannot be opened in this
            version and {count === 1 ? 'was' : 'were'} removed from your library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          If you may return to an older version of Tavern Born, export the original character
          {plural} now. These backup files cannot be imported into this version.
        </p>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onExport}>
            <DownloadSimple /> Export Backup{plural}
          </Button>
          <AlertDialogAction onClick={onAcknowledge}>I Understand</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
