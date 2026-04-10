import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ACCENT_THEMES,
  type AccentTheme,
  APPEARANCE_THEMES,
  type AppearanceTheme,
} from '@/lib/themeManager';
import { useAppPreferencesStore } from '@/store/appPreferencesStore';

const APPEARANCE_LABELS: Record<AppearanceTheme, string> = {
  light: 'Light',
  dark: 'Dark',
};

const ACCENT_LABELS: Record<AccentTheme, string> = {
  blue: 'Blue',
  violet: 'Violet',
  green: 'Green',
  orange: 'Orange',
};

export function AppPreferencesPanel() {
  const themeAccent = useAppPreferencesStore((state) => state.themeAccent);
  const themeAppearance = useAppPreferencesStore(
    (state) => state.themeAppearance,
  );
  const setThemeAccent = useAppPreferencesStore(
    (state) => state.setThemeAccent,
  );
  const setThemeAppearance = useAppPreferencesStore(
    (state) => state.setThemeAppearance,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>App Preferences</CardTitle>
          <p className="text-sm text-muted-foreground">
            Changes here save automatically and do not affect character unsaved
            state.
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">
                  Choose the base application appearance.
                </p>
              </div>

              <RadioGroup
                value={themeAppearance}
                onValueChange={(value) =>
                  setThemeAppearance(value as AppearanceTheme)
                }
                className="grid gap-3 sm:grid-cols-2"
              >
                {APPEARANCE_THEMES.map((theme) => {
                  const id = `appearance-${theme}`;
                  return (
                    <Label
                      key={theme}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3"
                    >
                      <RadioGroupItem id={id} value={theme} />
                      <span>{APPEARANCE_LABELS[theme]}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Accent</h3>
                <p className="text-sm text-muted-foreground">
                  Apply a persistent accent color across the interface.
                </p>
              </div>

              <RadioGroup
                value={themeAccent}
                onValueChange={(value) => setThemeAccent(value as AccentTheme)}
                className="grid gap-3 sm:grid-cols-2"
              >
                {ACCENT_THEMES.map((accent) => {
                  const id = `accent-${accent}`;
                  return (
                    <Label
                      key={accent}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3"
                    >
                      <RadioGroupItem id={id} value={accent} />
                      <span>{ACCENT_LABELS[accent]}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
