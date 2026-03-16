import { cn } from '@/lib/utils'
import { StepProps } from '../types'

interface BackgroundStepProps extends StepProps {
  backgrounds: any[]
}

function getFirstStringEntry(entries: any[]): string {
  for (const entry of entries) {
    if (typeof entry === 'string') return entry
    if (entry && typeof entry === 'object') {
      const nested = entry.entries ?? entry.items
      if (Array.isArray(nested)) {
        const found = getFirstStringEntry(nested)
        if (found) return found
      }
    }
  }
  return ''
}

export function BackgroundStep({ data, onChange, backgrounds }: BackgroundStepProps) {
  const filteredBackgrounds = data.allowedSources && data.allowedSources.length > 0
    ? backgrounds.filter(bg => data.allowedSources.includes(bg.source))
    : backgrounds

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl font-semibold mb-2">Choose Your Background</h3>
        <p className="text-muted-foreground mb-6">
          Select your character's background, which provides proficiencies and roleplay hooks.
        </p>
        {data.allowedSources && data.allowedSources.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {filteredBackgrounds.length} backgrounds from selected sources
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
        {filteredBackgrounds.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-muted-foreground">
            {data.allowedSources && data.allowedSources.length > 0
              ? 'No backgrounds available from selected sources. Try selecting more source books in the Rules step.'
              : 'No backgrounds available. Please load game data in Settings.'}
          </div>
        ) : (
          filteredBackgrounds.map((bg) => (
            <button
              key={`${bg.name}|${bg.source ?? ''}`}
              onClick={() => onChange({ background: bg.name, backgroundSource: bg.source || '' })}
              className={cn(
                'p-4 rounded-lg border-2 text-left transition-all hover:scale-[1.02]',
                (data.backgroundSource
                  ? (data.background === bg.name && data.backgroundSource === (bg.source ?? ''))
                  : data.background === bg.name)
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50'
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
        )}
      </div>
    </div>
  )
}
