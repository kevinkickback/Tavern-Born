import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Users } from '@phosphor-icons/react'
import { TraitTooltip } from '../../TraitTooltip'
import { StepProps } from '../types'

interface RaceStepProps extends StepProps {
  races: any[]
}

export function RaceStep({ data, onChange, races }: RaceStepProps) {
  const filteredRaces = data.allowedSources && data.allowedSources.length > 0
    ? races.filter(race => data.allowedSources.includes(race.source))
    : races

  const selectedRace = filteredRaces.find(r => r.name === data.race)
  
  const subraces = selectedRace?.subraces || []
  const selectedSubrace = subraces.find((sr: any) => sr.name === data.subrace)
  
  const displayRace = selectedSubrace || selectedRace

  const getAbilityScoreIncreases = () => {
    if (!displayRace?.ability) return []
    
    const increases: string[] = []
    for (const abilityObj of displayRace.ability) {
      for (const [key, value] of Object.entries(abilityObj)) {
        if (key !== 'choose' && typeof value === 'number') {
          increases.push(`${key.toUpperCase()} +${value}`)
        }
      }
      if (abilityObj.choose) {
        const { from, count, amount = 1 } = abilityObj.choose
        increases.push(`Choose ${count} from ${from.map((a: string) => a.toUpperCase()).join(', ')} +${amount}`)
      }
    }
    return increases
  }

  const getSize = () => {
    if (!displayRace?.size) return []
    return displayRace.size
  }

  const getSpeed = () => {
    if (!displayRace?.speed) return null
    if (typeof displayRace.speed === 'number') return `${displayRace.speed} ft.`
    if (displayRace.speed.walk) return `${displayRace.speed.walk} ft.`
    return null
  }

  const getLanguages = () => {
    if (!displayRace?.languageProficiencies) return ''
    
    const languages: string[] = []
    for (const langProf of displayRace.languageProficiencies) {
      for (const [key, value] of Object.entries(langProf)) {
        if (key !== 'choose' && key !== 'anyStandard' && value === true) {
          const formattedLang = key.charAt(0).toUpperCase() + key.slice(1)
          languages.push(formattedLang)
        }
      }
      if (langProf.choose) {
        const { from, count } = langProf.choose
        const formattedLanguages = from.map((lang: string) => 
          lang.charAt(0).toUpperCase() + lang.slice(1)
        ).join(', ')
        languages.push(`Choose ${count} from ${formattedLanguages}`)
      }
      if (langProf.anyStandard) {
        languages.push(`Choose ${langProf.anyStandard} standard`)
      }
    }
    return languages.join(', ')
  }

  const getTraits = () => {
    if (!displayRace) return []
    
    const traits: { name: string; entries: any[] }[] = []
    
    if (displayRace.entries) {
      for (const entry of displayRace.entries) {
        if (typeof entry === 'object' && entry.name && entry.type === 'entries') {
          const skipNames = ['Age', 'Alignment', 'Size', 'Speed', 'Languages', 'Names', 'Dragonborn Names', 'Drow Names', 'Dwarf Names', 'Elf Names', 'Halfling Names', 'Human Names']
          if (!skipNames.includes(entry.name) && !entry.name.includes('Names')) {
            traits.push({
              name: entry.name,
              entries: entry.entries || []
            })
          }
        }
      }
    }
    
    if (displayRace.darkvision && !traits.some(t => t.name === 'Darkvision')) {
      traits.push({
        name: 'Darkvision',
        entries: [`You have superior vision in dark and dim conditions. You can see in dim light within ${displayRace.darkvision} feet of you as if it were bright light, and in darkness as if it were dim light.`]
      })
    }
    
    if (displayRace.traitTags) {
      for (const tag of displayRace.traitTags) {
        if (tag === 'Tool Proficiency' && !traits.some(t => t.name.includes('Tool'))) {
          traits.push({
            name: 'Tool Proficiency',
            entries: ['You have proficiency with certain tools.']
          })
        }
      }
    }
    
    return traits
  }

  const abilityScoreIncreases = getAbilityScoreIncreases()
  const size = getSize()
  const speed = getSpeed()
  const languages = getLanguages()
  const traits = getTraits()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-6 w-6 text-accent" weight="fill" />
        <h3 className="font-display text-2xl font-semibold">Race Selection</h3>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <Label htmlFor="race-select" className="text-sm font-semibold mb-2 block">
            Race
          </Label>
          <Select 
            value={data.race || ''} 
            onValueChange={(value) => onChange({ race: value, subrace: '' })}
          >
            <SelectTrigger id="race-select" className="h-11">
              <SelectValue placeholder="Select a Race" />
            </SelectTrigger>
            <SelectContent>
              {filteredRaces.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No races available
                </div>
              ) : (
                filteredRaces.map((race) => (
                  <SelectItem key={race.name} value={race.name}>
                    {race.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="subrace-select" className="text-sm font-semibold mb-2 block">
            Subrace
          </Label>
          <Select 
            value={data.subrace || ''} 
            onValueChange={(value) => onChange({ subrace: value })}
            disabled={subraces.length === 0}
          >
            <SelectTrigger id="subrace-select" className="h-11">
              <SelectValue placeholder={subraces.length === 0 ? 'No Subraces' : 'Select a Subrace'} />
            </SelectTrigger>
            <SelectContent>
              {subraces.map((subrace: any) => (
                <SelectItem key={subrace.name} value={subrace.name}>
                  {subrace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border border-accent/30 rounded-lg p-4 bg-card/50">
          <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
            Ability Score Increases
          </h4>
          {abilityScoreIncreases.length === 0 ? (
            <p className="text-muted-foreground text-sm">-</p>
          ) : (
            <ul className="space-y-1">
              {abilityScoreIncreases.map((asi, idx) => (
                <li key={idx} className="text-sm font-mono">{asi}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-accent/30 rounded-lg p-4 bg-card/50">
          <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
            Size
          </h4>
          {size.length === 0 ? (
            <p className="text-muted-foreground text-sm">-</p>
          ) : (
            <p className="text-sm font-mono">{size.join(', ')}</p>
          )}
        </div>

        <div className="border border-accent/30 rounded-lg p-4 bg-card/50">
          <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
            Speed
          </h4>
          {!speed ? (
            <p className="text-muted-foreground text-sm">-</p>
          ) : (
            <p className="text-sm font-mono">{speed}</p>
          )}
        </div>
      </div>

      <div className="border border-accent/30 rounded-lg p-4 bg-card/50">
        <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
          Languages
        </h4>
        {!languages ? (
          <p className="text-muted-foreground text-sm">-</p>
        ) : (
          <p className="text-sm">{languages}</p>
        )}
      </div>

      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <h4 className="text-sm font-bold uppercase tracking-wider mb-3">
          Traits
        </h4>
        {traits.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No traits available
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {traits.map((trait, idx) => (
              <TraitTooltip key={idx} name={trait.name} entries={trait.entries}>
                <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent/10 hover:border-accent transition-colors cursor-help text-sm font-medium">
                  {trait.name}
                </span>
              </TraitTooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
