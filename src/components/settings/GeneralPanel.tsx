import { ArrowCounterClockwise, TextT } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { resetAllHints } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { UI_SCALE_OPTIONS, type UiScale, useAppPreferencesStore } from '@/store/appPreferencesStore'

const SCALE_LABELS: Record<UiScale, string> = {
  80: 'XS',
  90: 'S',
  100: 'M',
  110: 'L',
  120: 'XL',
}

export function GeneralPanel() {
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const setUiScale = useAppPreferencesStore((state) => state.setUiScale)

  const scaleIndex = UI_SCALE_OPTIONS.indexOf(uiScale as UiScale)

  function handleScaleChange(values: number[]) {
    const idx = Math.round(values[0])
    const clamped = Math.max(0, Math.min(UI_SCALE_OPTIONS.length - 1, idx))
    setUiScale(UI_SCALE_OPTIONS[clamped])
  }

  function handleResetHints() {
    resetAllHints()
    toast.success('One-time hints have been reset.')
  }

  return (
    <div className="space-y-6">
      {/* UI Scale */}
      <Card className="w-full">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <TextT className="h-4 w-4 text-primary" weight="duotone" />
            <CardTitle className="text-base">Interface Scale</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Adjust the overall size of the interface. Changes take effect immediately.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-muted-foreground">Size</span>
            <span className="text-sm font-semibold tabular-nums">
              {uiScale}% — {SCALE_LABELS[uiScale as UiScale]}
            </span>
          </div>
          <Slider
            min={0}
            max={UI_SCALE_OPTIONS.length - 1}
            step={1}
            value={[scaleIndex]}
            onValueChange={handleScaleChange}
            className="max-w-sm"
          />
          <div className="flex justify-between max-w-sm text-xs text-muted-foreground">
            {UI_SCALE_OPTIONS.map((s) => (
              <span
                key={s}
                className={cn(
                  'transition-colors',
                  s === uiScale ? 'text-accent font-semibold' : '',
                )}
              >
                {s}%
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

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
