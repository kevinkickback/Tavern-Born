import { Moon, Sun } from '@phosphor-icons/react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Section } from '@/components/workspace'
import {
  ACCENT_THEMES,
  type AccentTheme,
  APPEARANCE_THEMES,
  type AppearanceTheme,
} from '@/lib/themeManager'
import { cn } from '@/lib/utils'
import { UI_SCALE_OPTIONS, type UiScale, useAppPreferencesStore } from '@/store/appPreferencesStore'

const SCALE_LABELS: Record<UiScale, string> = {
  80: 'XS',
  90: 'S',
  100: 'M',
  110: 'L',
  120: 'XL',
}

const ACCENT_CONFIG: Record<
  AccentTheme,
  { label: string; dot: string; ring: string; swatch: string }
> = {
  blue: { label: 'Arcane', dot: 'bg-blue-500', ring: 'ring-blue-500', swatch: 'bg-blue-500' },
  violet: {
    label: 'Eldritch',
    dot: 'bg-violet-500',
    ring: 'ring-violet-500',
    swatch: 'bg-violet-500',
  },
  green: { label: 'Grove', dot: 'bg-green-600', ring: 'ring-green-600', swatch: 'bg-green-600' },
  rose: { label: 'Crimson', dot: 'bg-rose-700', ring: 'ring-rose-700', swatch: 'bg-rose-700' },
}

export function AppearancePanel() {
  const themeAccent = useAppPreferencesStore((state) => state.themeAccent)
  const themeAppearance = useAppPreferencesStore((state) => state.themeAppearance)
  const setThemeAccent = useAppPreferencesStore((state) => state.setThemeAccent)
  const setThemeAppearance = useAppPreferencesStore((state) => state.setThemeAppearance)
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const setUiScale = useAppPreferencesStore((state) => state.setUiScale)

  const scaleIndex = UI_SCALE_OPTIONS.indexOf(uiScale as UiScale)

  function handleScaleChange(values: number[]) {
    const idx = Math.round(values[0])
    const clamped = Math.max(0, Math.min(UI_SCALE_OPTIONS.length - 1, idx))
    setUiScale(UI_SCALE_OPTIONS[clamped])
  }

  return (
    <div>
      <Section
        title="Appearance"
        description="Choose your color scheme and accent."
        className="pt-0"
      >
        <div className="flex flex-wrap gap-6">
          {/* Theme Mode */}
          <div className="space-y-3 shrink-0">
            <p className="text-sm font-medium">Theme Mode</p>
            <RadioGroup
              value={themeAppearance}
              onValueChange={(v) => setThemeAppearance(v as AppearanceTheme)}
              className="flex gap-2"
            >
              {APPEARANCE_THEMES.map((theme) => {
                const isSelected = themeAppearance === theme
                const isDark = theme === 'dark'
                return (
                  <Label
                    key={theme}
                    onClick={() => setThemeAppearance(theme)}
                    className={cn(
                      'relative w-24 cursor-pointer overflow-hidden rounded-lg border transition-colors',
                      isSelected
                        ? 'border-accent shadow-md'
                        : 'border-border hover:border-muted-foreground/40',
                    )}
                  >
                    <RadioGroupItem value={theme} className="sr-only" />
                    {/* Mini UI preview */}
                    <div
                      className={cn(
                        'flex h-10 flex-col gap-1 p-1.5',
                        isDark ? 'bg-zinc-900' : 'bg-gray-100',
                      )}
                    >
                      <div
                        className={cn(
                          'h-2 w-3/4 rounded-full',
                          isDark ? 'bg-zinc-700' : 'bg-gray-300',
                        )}
                      />
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
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
                    )}
                    <div
                      className={cn(
                        'flex h-7 items-center gap-1.5 px-2 text-xs font-medium',
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
          </div>

          <div className="w-px self-stretch bg-border shrink-0" />

          {/* Accent Color */}
          <div className="space-y-3 min-w-0">
            <p className="text-sm font-medium">Accent Color</p>
            <RadioGroup
              value={themeAccent}
              onValueChange={(v) => setThemeAccent(v as AccentTheme)}
              className="flex flex-wrap gap-2"
            >
              {ACCENT_THEMES.map((accent) => {
                const { label } = ACCENT_CONFIG[accent]
                const isSelected = themeAccent === accent
                let stripeClass = ''
                if (accent === 'blue') stripeClass = 'bg-blue-500'
                else if (accent === 'violet') stripeClass = 'bg-violet-500'
                else if (accent === 'green') stripeClass = 'bg-green-600'
                else if (accent === 'rose') stripeClass = 'bg-rose-700'
                return (
                  <Label
                    key={accent}
                    onClick={() => setThemeAccent(accent)}
                    className={cn(
                      'relative w-24 cursor-pointer overflow-hidden rounded-lg border transition-colors',
                      isSelected
                        ? 'border-accent shadow-md'
                        : 'border-border hover:border-muted-foreground/40',
                    )}
                  >
                    <RadioGroupItem value={accent} className="sr-only" />
                    {/* Mini accent preview with left stripe */}
                    <div className="flex h-10">
                      <div className={cn('h-full w-3', stripeClass)} />
                      <div className="h-full flex-1 bg-muted" />
                    </div>
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
                    )}
                    <div
                      className={cn(
                        'flex h-7 items-center gap-1.5 px-2 text-xs font-medium',
                        isSelected ? 'text-accent-foreground' : 'text-foreground',
                      )}
                    >
                      {label}
                    </div>
                  </Label>
                )
              })}
            </RadioGroup>
          </div>
        </div>
      </Section>

      <Section
        title="Interface Scale"
        description="Adjust the overall size of the interface. Changes take effect immediately."
      >
        <div className="space-y-4">
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
                  s === uiScale ? 'text-primary font-semibold' : '',
                )}
              >
                {s}%
              </span>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}
