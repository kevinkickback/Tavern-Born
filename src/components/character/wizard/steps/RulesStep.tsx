import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Sparkle, BookOpen, Warning } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { StepProps } from '../types'

interface RulesStepProps extends StepProps {
  gameData: any
}

export function RulesStep({ data, onChange, gameData }: RulesStepProps) {
  const sources = gameData?.sources || []
  
  const sourcesByGroup = sources.reduce((acc: any, source: any) => {
    if (!acc[source.group]) {
      acc[source.group] = []
    }
    acc[source.group].push(source)
    return acc
  }, {})
  
  const groupLabels: Record<string, string> = {
    'core': 'Core Rulebooks',
    'supplement': 'Supplements',
    'setting': 'Setting Books',
    'adventure': 'Adventure Books',
    'playtest': 'Playtest & Unofficial',
    'other': 'Other Sources',
  }
  
  const groupOrder = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']
  
  const toggleSource = (sourceAbbr: string) => {
    const currentSources = data.allowedSources || []
    if (currentSources.includes(sourceAbbr)) {
      onChange({ allowedSources: currentSources.filter((s: string) => s !== sourceAbbr) })
    } else {
      onChange({ allowedSources: [...currentSources, sourceAbbr] })
    }
  }
  
  const selectAllSources = () => {
    onChange({ allowedSources: sources.map((s: any) => s.abbreviation) })
  }
  
  const selectRecommendedSources = () => {
    const recommended = sources
      .filter((s: any) => s.group === 'core' || ['PHB', 'XPHB'].includes(s.abbreviation))
      .map((s: any) => s.abbreviation)
    onChange({ allowedSources: recommended })
  }
  
  const selectNoneSources = () => {
    onChange({ allowedSources: [] })
  }
  
  const selectGroupSources = (group: string) => {
    const currentSources = data.allowedSources || []
    const groupSources = sourcesByGroup[group]?.map((s: any) => s.abbreviation) || []
    const allSelected = groupSources.every((abbr: string) => currentSources.includes(abbr))
    
    if (allSelected) {
      onChange({ allowedSources: currentSources.filter((s: string) => !groupSources.includes(s)) })
    } else {
      const newSources = [...new Set([...currentSources, ...groupSources])]
      onChange({ allowedSources: newSources })
    }
  }
  
  const isGroupSelected = (group: string) => {
    const currentSources = data.allowedSources || []
    const groupSources = sourcesByGroup[group]?.map((s: any) => s.abbreviation) || []
    return groupSources.length > 0 && groupSources.every((abbr: string) => currentSources.includes(abbr))
  }
  
  const isPhbRequired = () => {
    const phbSources = sources.filter((s: any) => 
      s.abbreviation === 'PHB' || s.abbreviation === 'XPHB'
    )
    return !phbSources.some((s: any) => data.allowedSources?.includes(s.abbreviation))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkle className="h-5 w-5 text-accent" weight="fill" />
            <h3 className="font-semibold text-lg">Ability Score Generation</h3>
          </div>
          
          <div className="space-y-2">
            <button
              onClick={() => onChange({ abilityScoreMethod: 'point-buy' })}
              className={cn(
                'w-full px-4 py-3 rounded-lg border-2 text-left transition-all',
                data.abilityScoreMethod === 'point-buy'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <div className="font-semibold">Point Buy</div>
            </button>

            <button
              onClick={() => onChange({ abilityScoreMethod: 'standard-array' })}
              className={cn(
                'w-full px-4 py-3 rounded-lg border-2 text-left transition-all',
                data.abilityScoreMethod === 'standard-array'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <div className="font-semibold">Standard Array</div>
            </button>

            <button
              onClick={() => onChange({ abilityScoreMethod: 'custom' })}
              className={cn(
                'w-full px-4 py-3 rounded-lg border-2 text-left transition-all',
                data.abilityScoreMethod === 'custom'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <div className="font-semibold">Custom</div>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkle className="h-5 w-5 text-accent" weight="fill" />
            <h3 className="font-semibold text-lg">Variant Rules</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="optional-class-features" className="text-sm cursor-pointer">
                Optional Class Features
              </Label>
              <Switch
                id="optional-class-features"
                checked={data.variantRules?.optionalClassFeatures || false}
                onCheckedChange={(checked) => 
                  onChange({ 
                    variantRules: { 
                      ...data.variantRules, 
                      optionalClassFeatures: checked 
                    } 
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <Label htmlFor="average-hit-points" className="text-sm cursor-pointer">
                Average Hit Points
              </Label>
              <Switch
                id="average-hit-points"
                checked={data.variantRules?.averageHitPoints || false}
                onCheckedChange={(checked) => 
                  onChange({ 
                    variantRules: { 
                      ...data.variantRules, 
                      averageHitPoints: checked 
                    } 
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" weight="fill" />
            <h4 className="font-semibold text-lg">Allowed Sources</h4>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={selectAllSources}
              className="text-accent hover:underline font-medium"
            >
              Select All
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={selectRecommendedSources}
              className="text-accent hover:underline font-medium"
            >
              Recommended
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={selectNoneSources}
              className="text-accent hover:underline font-medium"
            >
              None
            </button>
          </div>
        </div>

        {sources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-border rounded-lg">
            No sources available. Please load game data in Settings first.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[280px] overflow-y-auto pr-2 space-y-4">
              {groupOrder.map(group => {
                const groupSources = sourcesByGroup[group]
                if (!groupSources || groupSources.length === 0) return null
                
                return (
                  <div key={group} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        {groupLabels[group]}
                      </h5>
                      <button
                        onClick={() => selectGroupSources(group)}
                        className="text-xs text-accent hover:underline font-medium"
                      >
                        {isGroupSelected(group) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {groupSources.map((source: any) => (
                        <button
                          key={source.abbreviation}
                          onClick={() => toggleSource(source.abbreviation)}
                          className={cn(
                            'px-3 py-2.5 rounded-md border text-left transition-all text-sm flex items-start gap-2',
                            data.allowedSources?.includes(source.abbreviation)
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <BookOpen className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{source.name}</div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {source.abbreviation}
                              {source.year && ` (${source.year})`}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {isPhbRequired() && (
              <div className="text-xs text-muted-foreground flex items-start gap-1.5 mt-2 bg-muted/30 p-3 rounded-md">
                <Warning className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>At least one Player's Handbook (2014 or 2024) should be selected for a complete character creation experience.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
