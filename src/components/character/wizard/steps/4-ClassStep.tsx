import { cn } from '@/lib/utils'
import { StepProps } from '../types'

interface ClassStepProps extends StepProps {
  classes: any[]
}

export function ClassStep({ data, onChange, classes }: ClassStepProps) {
  const filteredClasses = data.allowedSources && data.allowedSources.length > 0
    ? classes.filter(cls => data.allowedSources.includes(cls.source))
    : classes

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl font-semibold mb-2">Choose Your Class</h3>
        <p className="text-muted-foreground mb-6">
          Select your character's class, which defines their abilities and role.
        </p>
        {data.allowedSources && data.allowedSources.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {filteredClasses.length} classes from selected sources
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
        {filteredClasses.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-muted-foreground">
            {data.allowedSources && data.allowedSources.length > 0
              ? 'No classes available from selected sources. Try selecting more source books in the Rules step.'
              : 'No classes available. Please load game data in Settings.'}
          </div>
        ) : (
          filteredClasses.map((cls) => (
            <button
              key={`${cls.name}|${cls.source ?? ''}`}
              onClick={() => onChange({ class: cls.name, classSource: cls.source || '' })}
              className={cn(
                'p-4 rounded-lg border-2 text-left transition-all hover:scale-[1.02]',
                (data.classSource
                  ? (data.class === cls.name && data.classSource === (cls.source ?? ''))
                  : data.class === cls.name)
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="font-semibold font-display">{cls.name}</div>
                <div className="text-xs font-mono text-muted-foreground">{cls.source}</div>
              </div>
              <div className="text-sm text-muted-foreground">
                Hit Die: d{cls.hd?.faces || 6}
                {cls.spellcastingAbility && ` • Spellcaster`}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
