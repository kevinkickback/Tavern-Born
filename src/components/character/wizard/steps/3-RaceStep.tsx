import { Users } from '@phosphor-icons/react';
import { useEffect, useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildSuppressedKeys } from '@/lib/5etools/reprints';
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores';
import type { Race5e } from '@/types/5etools';
import { TraitTooltip } from '../../TraitTooltip';
import type { StepProps } from '../types';

interface RaceStepProps extends StepProps {
  races: Race5e[];
}

type RaceEntry = {
  type?: string;
  name?: string;
  entries?: unknown[];
};

type RaceWithOverwrite = Race5e & {
  overwrite?: {
    ability?: boolean;
  };
};

function mergeRaceWithSubrace(parent: Race5e, subrace: Race5e): Race5e {
  const replacesAbility =
    (subrace as RaceWithOverwrite).overwrite?.ability === true;

  return {
    ...parent,
    ...subrace,
    ability: replacesAbility
      ? (subrace.ability ?? [])
      : [...(parent.ability ?? []), ...(subrace.ability ?? [])],
    entries: [...(parent.entries ?? []), ...(subrace.entries ?? [])],
    size: subrace.size ?? parent.size,
    speed: subrace.speed ?? parent.speed,
    darkvision: subrace.darkvision ?? parent.darkvision,
    languageProficiencies:
      subrace.languageProficiencies ?? parent.languageProficiencies,
    skillProficiencies: subrace.skillProficiencies ?? parent.skillProficiencies,
    traitTags: [
      ...new Set([...(parent.traitTags ?? []), ...(subrace.traitTags ?? [])]),
    ],
    resist: [...new Set([...(parent.resist ?? []), ...(subrace.resist ?? [])])],
    immune: [...new Set([...(parent.immune ?? []), ...(subrace.immune ?? [])])],
    conditionImmune: [
      ...new Set([
        ...(parent.conditionImmune ?? []),
        ...(subrace.conditionImmune ?? []),
      ]),
    ],
  } as Race5e;
}

export function RaceStep({ data, onChange, races }: RaceStepProps) {
  const raceSelectId = useId();
  const subraceSelectId = useId();
  const allowedSources = data.allowedSources ?? [];
  const sourceFilteredRaces =
    allowedSources.length > 0
      ? races.filter((race) => allowedSources.includes(race.source))
      : races;
  const suppressedRaceKeys =
    data.variantRules?.preferNewerPrintings && allowedSources.length > 0
      ? buildSuppressedKeys(sourceFilteredRaces, new Set(allowedSources))
      : undefined;
  const filteredRaces = sourceFilteredRaces.filter(
    (race) => !suppressedRaceKeys?.has(`${race.name}|${race.source}`),
  );

  const selectedRace = data.race
    ? data.raceSource
      ? filteredRaces.find(
          (r) => r.name === data.race && (r.source ?? '') === data.raceSource,
        )
      : filteredRaces.find((r) => r.name === data.race)
    : undefined;

  const getAvailableSubraces = (race?: Race5e) =>
    (race?.subraces || []).filter((sr) => {
      if (!sr.name) return false;
      if (allowedSources.length === 0) return true;
      const src = (sr as { source?: string }).source ?? race?.source ?? '';
      if (!allowedSources.includes(src)) return false;
      return !suppressedRaceKeys?.has(`${sr.name}|${src}`);
    });

  const subraces = getAvailableSubraces(selectedRace);
  const selectedSubrace = subraces.find(
    (sr) =>
      sr.name === data.subrace &&
      (sr.source ?? '') === (data.subraceSource ?? ''),
  );

  useEffect(() => {
    if (!selectedRace) return;

    if (subraces.length === 0) {
      if (data.subrace || data.subraceSource) {
        onChange({ subrace: '', subraceSource: '' });
      }
      return;
    }

    if (selectedSubrace) return;

    const firstSubrace = subraces[0];
    if (!firstSubrace) return;

    onChange({
      subrace: firstSubrace.name,
      subraceSource: firstSubrace.source ?? '',
    });
  }, [
    data.subrace,
    data.subraceSource,
    onChange,
    selectedRace,
    selectedSubrace,
    subraces,
  ]);

  // Subraces inherit parent's size/speed/languages if they don't define them;
  // ability: replace parent when overwrite.ability is true, otherwise additive.
  const displayRace =
    selectedSubrace && selectedRace
      ? mergeRaceWithSubrace(selectedRace, selectedSubrace)
      : selectedSubrace || selectedRace;

  const getAbilityScoreIncreases = () => {
    if (
      displayRace?.lineage === true ||
      typeof displayRace?.lineage === 'string'
    ) {
      return [
        'Choose: +1/+2 (any 2 abilities)',
        'Choose: +1 (any 3 abilities)',
      ];
    }

    const { fixed, choices } = getRaceAbilityData(
      displayRace,
      undefined,
      data.raceAsiBlockIndex ?? 0,
    );
    const increases: string[] = [];
    for (const fb of fixed) {
      increases.push(`${ABILITY_ABBREVIATIONS[fb.ability]} +${fb.value}`);
    }
    for (const block of choices) {
      const isAnyAbility = block.from.length === ABILITY_NAMES.length;
      if (isAnyAbility) {
        increases.push(`Choose ${block.count}: +${block.amount} (any ability)`);
      } else {
        const fromStr = block.from
          .map((a) => ABILITY_ABBREVIATIONS[a])
          .join(', ');
        increases.push(
          `Choose ${block.count} from ${fromStr} +${block.amount}`,
        );
      }
    }
    return increases;
  };

  const getSize = () => {
    if (!displayRace?.size) return [];
    return displayRace.size;
  };

  const getSpeed = () => {
    if (!displayRace?.speed) return null;
    if (typeof displayRace.speed === 'number')
      return `${displayRace.speed} ft.`;
    if (displayRace.speed.walk) return `${displayRace.speed.walk} ft.`;
    return null;
  };

  const getLanguages = () => {
    if (!displayRace?.languageProficiencies) {
      // MPMM-style lineage races: language is a free player pick
      if (typeof displayRace?.lineage === 'string')
        return 'Common, + 1 of your choice';
      return '';
    }

    const languages: string[] = [];
    for (const langProf of displayRace.languageProficiencies) {
      for (const [key, value] of Object.entries(langProf)) {
        if (key !== 'choose' && key !== 'anyStandard' && value === true) {
          const formattedLang = key.charAt(0).toUpperCase() + key.slice(1);
          languages.push(formattedLang);
        }
      }
      if (langProf.choose) {
        const { from, count } = langProf.choose;
        const formattedLanguages = from
          .map((lang: string) => lang.charAt(0).toUpperCase() + lang.slice(1))
          .join(', ');
        languages.push(`Choose ${count} from ${formattedLanguages}`);
      }
      if (langProf.anyStandard) {
        languages.push(`Choose ${langProf.anyStandard} standard`);
      }
    }
    return languages.join(', ');
  };

  const getTraits = () => {
    if (!displayRace) return [];

    const traits: { name: string; entries: unknown[] }[] = [];

    if (displayRace.entries) {
      for (const entry of displayRace.entries) {
        const entryObj = entry as RaceEntry;
        if (
          typeof entry === 'object' &&
          entryObj.name &&
          entryObj.type === 'entries'
        ) {
          const skipNames = [
            'Age',
            'Alignment',
            'Size',
            'Speed',
            'Languages',
            'Names',
            'Dragonborn Names',
            'Drow Names',
            'Dwarf Names',
            'Elf Names',
            'Halfling Names',
            'Human Names',
          ];
          if (
            !skipNames.includes(entryObj.name) &&
            !entryObj.name.includes('Names')
          ) {
            traits.push({
              name: entryObj.name,
              entries: entryObj.entries || [],
            });
          }
        }
      }
    }

    if (
      displayRace.darkvision &&
      !traits.some((t) => t.name === 'Darkvision')
    ) {
      traits.push({
        name: 'Darkvision',
        entries: [
          `You have superior vision in dark and dim conditions. You can see in dim light within ${displayRace.darkvision} feet of you as if it were bright light, and in darkness as if it were dim light.`,
        ],
      });
    }

    if (displayRace.traitTags) {
      for (const tag of displayRace.traitTags) {
        if (
          tag === 'Tool Proficiency' &&
          !traits.some((t) => t.name.includes('Tool'))
        ) {
          traits.push({
            name: 'Tool Proficiency',
            entries: ['You have proficiency with certain tools.'],
          });
        }
      }
    }

    return traits;
  };

  const abilityScoreIncreases = getAbilityScoreIncreases();
  const size = getSize();
  const speed = getSpeed();
  const languages = getLanguages();
  const traits = getTraits();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-2 pb-2 mb-3 border-b border-border">
          <Users className="h-4 w-4 text-accent" weight="fill" />
          <h3 className="font-semibold">Race Selection</h3>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label
              htmlFor={raceSelectId}
              className="text-sm font-semibold mb-2 block"
            >
              Race
            </Label>
            <Select
              value={data.race ? `${data.race}|${data.raceSource ?? ''}` : ''}
              onValueChange={(value) => {
                const sepIdx = value.indexOf('|');
                const raceName = sepIdx >= 0 ? value.slice(0, sepIdx) : value;
                const raceSource = sepIdx >= 0 ? value.slice(sepIdx + 1) : '';
                const race = filteredRaces.find(
                  (r) => r.name === raceName && (r.source ?? '') === raceSource,
                );
                const firstSubrace = getAvailableSubraces(race)[0];
                onChange({
                  race: raceName,
                  raceSource,
                  subrace: firstSubrace?.name ?? '',
                  subraceSource: firstSubrace?.source ?? '',
                  raceAsiChoices: [],
                  raceAsiBlockIndex: 0,
                });
              }}
            >
              <SelectTrigger id={raceSelectId} className="h-11">
                <SelectValue placeholder="Select a Race" />
              </SelectTrigger>
              <SelectContent>
                {filteredRaces.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No races available
                  </div>
                ) : (
                  filteredRaces.map((race) => (
                    <SelectItem
                      key={`${race.name}|${race.source ?? ''}`}
                      value={`${race.name}|${race.source ?? ''}`}
                    >
                      {race.name}
                      {race.source ? ` (${race.source})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label
              htmlFor={subraceSelectId}
              className="text-sm font-semibold mb-2 block"
            >
              Subrace
            </Label>
            <Select
              value={
                data.subrace
                  ? `${data.subrace}|${data.subraceSource ?? ''}`
                  : ''
              }
              onValueChange={(value) => {
                const sepIdx = value.indexOf('|');
                const subraceNamePart =
                  sepIdx >= 0 ? value.slice(0, sepIdx) : value;
                const subraceSourcePart =
                  sepIdx >= 0 ? value.slice(sepIdx + 1) : '';
                onChange({
                  subrace: subraceNamePart,
                  subraceSource: subraceSourcePart,
                  raceAsiChoices: [],
                });
              }}
              disabled={subraces.length === 0}
            >
              <SelectTrigger id={subraceSelectId} className="h-11">
                <SelectValue
                  placeholder={
                    subraces.length === 0 ? 'No Subraces' : 'Select a Subrace'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subraces.map((subrace) => (
                  <SelectItem
                    key={`${subrace.name}|${subrace.source ?? ''}`}
                    value={`${subrace.name}|${subrace.source ?? ''}`}
                  >
                    {subrace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-4 bg-muted/20">
          <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
            Ability Score Increases
          </h4>
          {abilityScoreIncreases.length === 0 ? (
            <p className="text-muted-foreground text-sm">-</p>
          ) : (
            <ul className="space-y-1">
              {abilityScoreIncreases.map((asi) => (
                <li key={asi} className="text-sm font-mono">
                  {asi}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-border rounded-lg p-4 bg-muted/20">
          <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
            Size
          </h4>
          {size.length === 0 ? (
            <p className="text-muted-foreground text-sm">-</p>
          ) : (
            <p className="text-sm font-mono">{size.join(', ')}</p>
          )}
        </div>

        <div className="border border-border rounded-lg p-4 bg-muted/20">
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

      <div className="border border-border rounded-lg p-4 bg-muted/20">
        <h4 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
          Languages
        </h4>
        {!languages ? (
          <p className="text-muted-foreground text-sm">-</p>
        ) : (
          <p className="text-sm">{languages}</p>
        )}
      </div>

      <div className="border border-border rounded-lg p-4 bg-muted/20">
        <h4 className="text-sm font-bold uppercase tracking-wider mb-3">
          Traits
        </h4>
        {traits.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No traits available
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {traits.map((trait) => (
              <TraitTooltip
                key={`${trait.name}|${trait.entries?.length ?? 0}`}
                name={trait.name}
                entries={trait.entries}
              >
                <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent/10 hover:border-accent transition-colors cursor-help text-sm font-medium">
                  {trait.name}
                </span>
              </TraitTooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
