import { ArrowCounterClockwise, Moon, Palette, Sun } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { resetAllHints } from '@/lib/storage/hints'
import {
  ACCENT_THEMES,
  type AccentTheme,
  APPEARANCE_THEMES,
  type AppearanceTheme,
} from '@/lib/themeManager'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

const APPEARANCE_LABELS: Record<AppearanceTheme, string> = {
  light: 'Light',
  dark: 'Dark',
}

const APPEARANCE_ICONS: Record<AppearanceTheme, React.ReactNode> = {
  light: <Sun weight="duotone" className="h-5 w-5" />,
  dark: <Moon weight="duotone" className="h-5 w-5" />,
}

const ACCENT_LABELS: Record<AccentTheme, string> = {
  blue: 'Blue',
  violet: 'Violet',
  green: 'Green',
  tomato: 'Rose',
}

const ACCENT_DOT_COLORS: Record<AccentTheme, string> = {
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  green: 'bg-green-600',
  tomato: 'bg-pink-500',
}

export function AppPreferencesPanel() {
  const themeAccent = useAppPreferencesStore((state) => state.themeAccent)
  const themeAppearance = useAppPreferencesStore((state) => state.themeAppearance)
  const setThemeAccent = useAppPreferencesStore((state) => state.setThemeAccent)
  const setThemeAppearance = useAppPreferencesStore((state) => state.setThemeAppearance)

  function handleResetHints() {
    resetAllHints()
    toast.success('One-time hints have been reset.')
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Palette className="h-5 w-5 text-primary" weight="duotone" />
          <div>
            <CardTitle>App Preferences</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Changes here save automatically and do not affect character unsaved state.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Appearance */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose the base application appearance.
            </p>
          </div>
          <RadioGroup
            value={themeAppearance}
            onValueChange={(value) => setThemeAppearance(value as AppearanceTheme)}
            className="grid grid-cols-2 gap-3"
          >
            {APPEARANCE_THEMES.map((theme) => {
              const isSelected = themeAppearance === theme
              return (
                <Label
                  key={theme}
                  onClick={() => setThemeAppearance(theme)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors',
                    isSelected ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <RadioGroupItem value={theme} className="sr-only" />
                  <span
                    className={cn(
                      'shrink-0',
                      isSelected ? 'text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {APPEARANCE_ICONS[theme]}
                  </span>
                  <span
                    className={cn('font-medium text-sm', isSelected && 'text-accent-foreground')}
                  >
                    {APPEARANCE_LABELS[theme]}
                  </span>
                </Label>
              )
            })}
          </RadioGroup>
        </div>

        <Separator />

        {/* Accent Color */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Accent Color</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apply a persistent accent color across the interface.
            </p>
          </div>
          <RadioGroup
            value={themeAccent}
            onValueChange={(value) => setThemeAccent(value as AccentTheme)}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {ACCENT_THEMES.map((accent) => {
              const isSelected = themeAccent === accent
              return (
                <Label
                  key={accent}
                  onClick={() => setThemeAccent(accent)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 transition-colors',
                    isSelected ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <RadioGroupItem value={accent} className="sr-only" />
                  <span
                    className={cn('h-3.5 w-3.5 shrink-0 rounded-full', ACCENT_DOT_COLORS[accent])}
                  />
                  <span
                    className={cn('text-sm font-medium', isSelected && 'text-accent-foreground')}
                  >
                    {ACCENT_LABELS[accent]}
                  </span>
                </Label>
              )
            })}
          </RadioGroup>
        </div>

        <Separator />

        {/* One-Time Hints */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">One-Time Hints</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reset tips and guidance banners you've already dismissed.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleResetHints} className="shrink-0">
            <ArrowCounterClockwise weight="bold" />
            Reset Hints
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
