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
  const title =
    count === 1 ? "An older character can't be opened" : "Some older characters can't be opened"
  const description = `Tavern Born found ${count} character${plural} created with an earlier beta version. This version can't open ${count === 1 ? 'it' : 'them'}, so ${count === 1 ? 'it has' : 'they have'} been removed from your character list.`
  const backupDescription = `You can download the original file${plural} before continuing. ${count === 1 ? 'It' : 'They'} can only be opened with a compatible older version of Tavern Born.`

  return (
    <AlertDialog open={count > 0}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">{backupDescription}</p>
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
