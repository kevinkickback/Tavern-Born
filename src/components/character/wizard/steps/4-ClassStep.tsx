import { cn } from '@/lib/utils';
import type { Class5e } from '@/types/5etools';
import type { StepProps } from '../types';

interface ClassStepProps extends StepProps {
  classes: Class5e[];
}

export function ClassStep({ data, onChange, classes }: ClassStepProps) {
  const filteredClasses =
    data.allowedSources && data.allowedSources.length > 0
      ? classes.filter((cls) => data.allowedSources.includes(cls.source))
      : classes;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Choose Your Class</h3>
          {data.allowedSources && data.allowedSources.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredClasses.length} available
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Select your character's class, which defines their abilities and role.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 pb-1">
          {filteredClasses.length === 0 ? (
            <div className="col-span-2 text-center py-8 text-muted-foreground">
              {data.allowedSources && data.allowedSources.length > 0
                ? 'No classes available from selected sources. Try selecting more source books in the Rules step.'
                : 'No classes available. Please load game data in Settings.'}
            </div>
          ) : (
            filteredClasses.map((cls) => (
              <button
                type="button"
                key={`${cls.name}|${cls.source ?? ''}`}
                onClick={() =>
                  onChange({ class: cls.name, classSource: cls.source || '' })
                }
                className={cn(
                  'p-4 rounded-lg border-2 text-left transition-colors',
                  (
                    data.classSource
                      ? data.class === cls.name &&
                        data.classSource === (cls.source ?? '')
                      : data.class === cls.name
                  )
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/60 hover:bg-accent/5',
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="font-semibold font-display">{cls.name}</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {cls.source}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Hit Die: d{cls.hd?.faces || 6}
                  {cls.spellcastingAbility && ` • Spellcaster`}
                </div>
              </button>
            ))
          )}{' '}
        </div>{' '}
      </div>
    </div>
  );
}
