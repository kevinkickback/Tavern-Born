import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import { cn } from '@/lib/utils'
import type { Background5e } from '@/types/5etools'
import type { StepProps } from '../types'

interface BackgroundStepProps extends StepProps {
  backgrounds: Background5e[]
}

function getFirstStringEntry(entries: unknown[]): string {
  for (const entry of entries) {
    if (typeof entry === 'string') return entry
    if (entry && typeof entry === 'object') {
      const nested =
        (entry as { entries?: unknown[]; items?: unknown[] }).entries ??
        (entry as { entries?: unknown[]; items?: unknown[] }).items
      if (Array.isArray(nested)) {
        const found = getFirstStringEntry(nested)
        if (found) return found
      }
    }
  }
  return ''
}

export function BackgroundStep({ data, onChange, backgrounds }: BackgroundStepProps) {
  const allowedSources = data.allowedSources ?? []
  const sourceFilteredBackgrounds =
    allowedSources.length > 0
      ? backgrounds.filter((bg) => allowedSources.includes(bg.source))
      : backgrounds
  const suppressedBackgroundKeys =
    data.variantRules?.preferNewerPrintings && allowedSources.length > 0
      ? buildSuppressedKeys(sourceFilteredBackgrounds, new Set(allowedSources))
      : undefined
  const filteredBackgrounds = sourceFilteredBackgrounds.filter(
    (bg) => !suppressedBackgroundKeys?.has(`${bg.name}|${bg.source}`),
  )

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Choose Your Background</h3>
          {allowedSources.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredBackgrounds.length} available
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Select your character's background, which provides proficiencies and roleplay hooks.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {filteredBackgrounds.length === 0 ? (
            <div className="col-span-2 text-center py-8 text-muted-foreground">
              {allowedSources.length > 0
                ? 'No backgrounds available from selected sources. Try selecting more source books in the Rules step.'
                : 'No backgrounds available. Please load game data in Settings.'}
            </div>
          ) : (
            filteredBackgrounds.map((bg) => (
              <button
                type="button"
                key={`${bg.name}|${bg.source ?? ''}`}
                onClick={() =>
                  onChange({
                    background: bg.name,
                    backgroundSource: bg.source || '',
                  })
                }
                className={cn(
                  'p-4 rounded-lg border-2 text-left transition-colors',
                  (
                    data.backgroundSource
                      ? data.background === bg.name && data.backgroundSource === (bg.source ?? '')
                      : data.background === bg.name
                  )
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/60 hover:bg-accent/5',
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="font-semibold font-display">{bg.name}</div>
                  <div className="text-xs font-mono text-muted-foreground">{bg.source}</div>
                </div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {getFirstStringEntry(bg.entries ?? []) || 'No description available'}
                </div>
              </button>
            ))
          )}{' '}
        </div>{' '}
      </div>
    </div>
  )
}
