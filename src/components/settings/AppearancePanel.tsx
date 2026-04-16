import { Moon, Sun } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  ACCENT_THEMES,
  type AccentTheme,
  APPEARANCE_THEMES,
  type AppearanceTheme,
} from '@/lib/themeManager'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

const ACCENT_CONFIG: Record<AccentTheme, { label: string; dot: string; ring: string }> = {
  blue: { label: 'Blue', dot: 'bg-blue-500', ring: 'ring-blue-500' },
  violet: { label: 'Violet', dot: 'bg-violet-500', ring: 'ring-violet-500' },
  green: { label: 'Green', dot: 'bg-green-600', ring: 'ring-green-600' },
  rose: { label: 'Rose', dot: 'bg-pink-500', ring: 'ring-pink-500' },
}

export function AppearancePanel() {
  const themeAccent = useAppPreferencesStore((state) => state.themeAccent)
  const themeAppearance = useAppPreferencesStore((state) => state.themeAppearance)
  const setThemeAccent = useAppPreferencesStore((state) => state.setThemeAccent)
  const setThemeAppearance = useAppPreferencesStore((state) => state.setThemeAppearance)

  return (
    <div className="space-y-6">
      {/* Theme Mode */}
      <Card className="w-full">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base">Theme Mode</CardTitle>
          <p className="text-sm text-muted-foreground">Choose your preferred color scheme.</p>
        </CardHeader>
        <CardContent className="pt-6">
          <RadioGroup
            value={themeAppearance}
            onValueChange={(v) => setThemeAppearance(v as AppearanceTheme)}
            className="grid grid-cols-2 gap-4 max-w-md"
          >
            {APPEARANCE_THEMES.map((theme) => {
              const isSelected = themeAppearance === theme
              const isDark = theme === 'dark'
              return (
                <Label
                  key={theme}
                  onClick={() => setThemeAppearance(theme)}
                  className={cn(
                    'relative cursor-pointer rounded-xl border-2 overflow-hidden transition-all',
                    isSelected
                      ? 'border-accent shadow-md'
                      : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  <RadioGroupItem value={theme} className="sr-only" />
                  {/* Mini UI preview */}
                  <div
                    className={cn(
                      'h-16 p-2 flex flex-col gap-1',
                      isDark ? 'bg-zinc-900' : 'bg-gray-100',
                    )}
                  >
                    {/* Fake header bar */}
                    <div
                      className={cn(
                        'h-2 w-3/4 rounded-full',
                        isDark ? 'bg-zinc-700' : 'bg-gray-300',
                      )}
                    />
                    {/* Fake content rows */}
                    <div
                      className={cn(
                        'h-1.5 w-full rounded-full',
                        isDark ? 'bg-zinc-800' : 'bg-gray-200',
                      )}
                    />
                    <div
                      className={cn(
                        'h-1.5 w-5/6 rounded-full',
                        isDark ? 'bg-zinc-800' : 'bg-gray-200',
                      )}
                    />
                    <div
                      className={cn(
                        'h-1.5 w-4/6 rounded-full',
                        isDark ? 'bg-zinc-800' : 'bg-gray-200',
                      )}
                    />
                  </div>
                  {/* Selected dot — top-right corner */}
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
                  )}
                  {/* Label row */}
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium',
                      isSelected ? 'text-accent-foreground' : 'text-foreground',
                    )}
                  >
                    {isDark ? (
                      <Moon weight="duotone" className="h-3.5 w-3.5" />
                    ) : (
                      <Sun weight="duotone" className="h-3.5 w-3.5" />
                    )}
                    {isDark ? 'Dark' : 'Light'}
                  </div>
                </Label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Accent Color */}
      <Card className="w-full">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base">Accent Color</CardTitle>
          <p className="text-sm text-muted-foreground">
            Applied across buttons, highlights, and interactive elements.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <RadioGroup
            value={themeAccent}
            onValueChange={(v) => setThemeAccent(v as AccentTheme)}
            className="flex flex-wrap gap-3"
          >
            {ACCENT_THEMES.map((accent) => {
              const { label, dot, ring } = ACCENT_CONFIG[accent]
              const isSelected = themeAccent === accent
              return (
                <Label
                  key={accent}
                  onClick={() => setThemeAccent(accent)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border-2 px-4 py-2.5 transition-all',
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  <RadioGroupItem value={accent} className="sr-only" />
                  <span
                    className={cn(
                      'h-4 w-4 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all',
                      dot,
                      isSelected ? ring : 'ring-transparent',
                    )}
                  />
                  <span
                    className={cn('text-sm font-medium', isSelected && 'text-accent-foreground')}
                  >
                    {label}
                  </span>
                </Label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  )
}
