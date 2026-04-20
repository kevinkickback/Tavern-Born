import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { resetAllHints } from '@/lib/storage/hints'

export function GeneralPanel() {
  function handleResetHints() {
    resetAllHints()
    toast.success('One-time hints have been reset.')
  }

  return (
    <div className="space-y-6">
      {/* Hints */}
      <Card className="w-full">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <ArrowCounterClockwise className="h-4 w-4 text-primary" weight="duotone" />
            <CardTitle className="text-base">One-Time Hints</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Contextual tips and guidance shown once throughout the app.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Reset dismissed hints</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                All banners and tips you've closed will reappear.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleResetHints} className="shrink-0">
              <ArrowCounterClockwise weight="bold" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
