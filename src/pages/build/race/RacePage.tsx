import { CaretLeft, CaretRight, PersonSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useProvenance } from '@/hooks/character/useProvenance';
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData';
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers';
import {
  ABILITY_ABBREVIATIONS,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores';
import { matchesGameDataEntry } from '@/lib/characterUtils';
import { renderEntry } from '@/lib/renderer';
import { cn } from '@/lib/utils';
import { InfoTile, NoCharCard } from '@/pages/_shared';
import { useCharacterStore } from '@/store/characterStore';
import type { Race5e } from '@/types/5etools';

function getSpeedText(race: Race5e): string {
  if (!race.speed) return '—';
  if (typeof race.speed === 'number') return `${race.speed} ft.`;
  if (typeof race.speed === 'object' && 'walk' in race.speed)
    return `${race.speed.walk ?? 30} ft.`;
  return '—';
}

function getASILines(
  race: Race5e,
  raceAsiChoices?: string[][],
  raceAsiBlockIndex: 0 | 1 = 0,
): string[] {
  const lines: string[] = [];
  const { fixed, choices } = getRaceAbilityData(
    race,
    undefined,
    raceAsiBlockIndex,
  );
  for (const fb of fixed) {
    lines.push(`${ABILITY_ABBREVIATIONS[fb.ability]} +${fb.value}`);
  }
  for (const [blockIdx, block] of choices.entries()) {
    const selections = (raceAsiChoices?.[blockIdx] ?? []).filter(Boolean);
    if (selections.length > 0) {
      for (const ab of selections) {
        const abbr =
          ABILITY_ABBREVIATIONS[ab as keyof typeof ABILITY_ABBREVIATIONS] ??
          ab.toUpperCase().slice(0, 3);
        lines.push(`${abbr} +${block.amount}`);
      }
      const remaining = block.count - selections.length;
      if (remaining > 0)
        lines.push(`Choose ${remaining} more +${block.amount}`);
    } else {
      const fromStr = block.from
        .map((a) => ABILITY_ABBREVIATIONS[a] ?? a.toUpperCase().slice(0, 3))
        .join('/');
      lines.push(`Choose ${block.count} × +${block.amount} from ${fromStr}`);
    }
  }
  return lines;
}

function getLanguages(race: Race5e): string {
  // MPMM-style lineage races: language is a free player pick
  if (!race.languageProficiencies && typeof race.lineage === 'string') {
    return 'Common, + 1 of your choice';
  }
  return extractProficiencyBlockNames(race.languageProficiencies ?? [])
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(', ');
}

function getDarkvisionText(race: Race5e): string {
  if (!race.darkvision || race.darkvision === 0) return '—';
  return `${race.darkvision} ft.`;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getDamageTraitText(values?: string[]): string {
  if (!values || values.length === 0) return '—';
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase())))
    .filter(Boolean)
    .map(toTitleCase)
    .join(', ');
}

type RaceTraitEntry = {
  type?: string;
  name?: string;
  entries?: unknown[];
};

function getRaceTraits(race: Race5e): { name: string; entries: unknown[] }[] {
  const skip = new Set([
    'Age',
    'Alignment',
    'Size',
    'Speed',
    'Languages',
    'Names',
  ]);
  return ((race.entries as unknown[]) ?? [])
    .filter((e) => {
      const entry = e as RaceTraitEntry;
      return (
        typeof e === 'object' &&
        entry.type === 'entries' &&
        typeof entry.name === 'string' &&
        !skip.has(entry.name) &&
        !entry.name.includes('Names')
      );
    })
    .map((e) => {
      const entry = e as RaceTraitEntry;
      return { name: entry.name ?? '', entries: entry.entries ?? [] };
    });
}

function mergeRaceWithSubrace(parent: Race5e, subrace: Race5e): Race5e {
  const replacesAbility =
    (subrace as Race5e & { overwrite?: { ability?: boolean } }).overwrite
      ?.ability === true;
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

function getAvailableSubraces(race?: Race5e): Race5e[] {
  return ((race?.subraces ?? []) as Race5e[]).filter((sr) => !!sr.name);
}

export function BuildRacePage() {
  const character = useCharacterStore((s) => {
    if (s.activeCharacter) return s.activeCharacter;
    if (!s.activeCharacterId) return null;
    return s.characters.find((c) => c.id === s.activeCharacterId) ?? null;
  });
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const { races } = useFilteredGameData();
  const { applyRaceSelection, applySubraceChange } = useProvenance();
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [raceSearch, setRaceSearch] = useState('');
  const selectedRaceRef = useRef<HTMLDivElement | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousSearchRef = useRef('');

  const filteredRaces = useMemo(() => {
    const q = raceSearch.trim().toLowerCase();
    if (!q) return races;
    return races.filter((r) => r.name.toLowerCase().includes(q));
  }, [races, raceSearch]);

  useEffect(() => {
    // Only scroll on initial mount or when search changes, not on selection change
    const isSearchChanged = previousSearchRef.current !== raceSearch;
    const shouldScroll = isInitialLoadRef.current || isSearchChanged;

    if (shouldScroll && selectedRaceRef.current) {
      selectedRaceRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'start',
        inline: 'nearest',
      });
    }

    isInitialLoadRef.current = false;
    previousSearchRef.current = raceSearch;
  }, [raceSearch]);

  const selectedRace = races.find((r) =>
    matchesGameDataEntry(character?.race, character?.raceSource, r),
  ) as Race5e | undefined;
  const subraces = getAvailableSubraces(selectedRace);
  const selectedSubrace = subraces.find(
    (sr) =>
      sr.name === character?.subrace &&
      (sr.source ?? '') === (character?.subraceSource ?? ''),
  );
  const displayRace =
    selectedSubrace && selectedRace
      ? mergeRaceWithSubrace(selectedRace, selectedSubrace)
      : (selectedSubrace ?? selectedRace);
  const selectedRaceKey = selectedRace
    ? `${selectedRace.name}|${selectedRace.source ?? ''}`
    : null;

  useEffect(() => {
    if (!character) return;
    if (!selectedRace) return;

    if (subraces.length === 0) {
      if (character.subrace || character.subraceSource) {
        updateCharacter(character.id, {
          subrace: undefined,
          subraceSource: undefined,
        });
        applySubraceChange(selectedRace, undefined);
      }
      return;
    }

    if (selectedSubrace) return;

    const firstSubrace = subraces[0];
    if (!firstSubrace) return;

    updateCharacter(character.id, {
      subrace: firstSubrace.name,
      subraceSource: firstSubrace.source ?? undefined,
    });
    applySubraceChange(selectedRace, firstSubrace);
  }, [
    applySubraceChange,
    character,
    selectedRace,
    selectedSubrace,
    subraces,
    updateCharacter,
  ]);

  if (!character) {
    return (
      <NoCharCard
        icon={<PersonSimple weight="duotone" />}
        noun="choose a race"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <PersonSimple className="h-6 w-6 text-accent" weight="duotone" />
            Race
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
              <button
                type="button"
                onClick={() => setDetailCollapsed((c) => !c)}
                title={
                  detailCollapsed
                    ? 'Expand details panel'
                    : 'Collapse details panel'
                }
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
              >
                {detailCollapsed ? (
                  <CaretLeft className="h-3.5 w-3.5" />
                ) : (
                  <CaretRight className="h-3.5 w-3.5" />
                )}
              </button>

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col gap-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Races ({filteredRaces.length}
                    {raceSearch ? ` of ${races.length}` : ''})
                  </span>
                  <Input
                    placeholder="Search races…"
                    value={raceSearch}
                    onChange={(e) => setRaceSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 space-y-1 pr-8">
                    {filteredRaces.map((race) => {
                      const raceKey = `${race.name}|${race.source ?? ''}`;
                      const isSelected = selectedRaceKey === raceKey;
                      const namedSubraces = getAvailableSubraces(race);
                      const hasSubraces = namedSubraces.length > 0;
                      return (
                        <div
                          key={raceKey}
                          ref={isSelected ? selectedRaceRef : null}
                          className={cn(
                            'w-full p-3 rounded-lg border transition-colors hover:border-accent flex items-center justify-between gap-2',
                            isSelected
                              ? 'border-accent bg-accent/10'
                              : 'border-border bg-card',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const firstSubrace = namedSubraces[0];
                              updateCharacter(character.id, {
                                race: race.name,
                                raceSource: race.source ?? undefined,
                                subrace: firstSubrace?.name,
                                subraceSource:
                                  firstSubrace?.source ?? undefined,
                                raceAsiChoices: [],
                                raceAsiBlockIndex: 0,
                              });
                              applyRaceSelection(race, firstSubrace, 0);
                              if (detailCollapsed) setDetailCollapsed(false);
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <div
                              className={cn(
                                'h-3.5 w-3.5 rounded-full border-2 flex-shrink-0',
                                isSelected
                                  ? 'bg-accent border-accent'
                                  : 'border-muted-foreground',
                              )}
                            />
                            <span className="font-medium text-sm truncate">
                              {race.name}
                            </span>
                          </button>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSelected && hasSubraces ? (
                              <Select
                                value={
                                  character.subrace
                                    ? `${character.subrace}|${character.subraceSource ?? ''}`
                                    : ''
                                }
                                onValueChange={(v) => {
                                  const [subraceNameOrFull, ...sourceParts] =
                                    v.split('|');
                                  const subraceSource =
                                    sourceParts.length > 0
                                      ? sourceParts.join('|')
                                      : undefined;
                                  const subraceNameFromKey = subraceNameOrFull;
                                  const sr = namedSubraces.find(
                                    (s) =>
                                      s.name === subraceNameFromKey &&
                                      (subraceSource ?? '') ===
                                        (s.source ?? ''),
                                  );
                                  updateCharacter(character.id, {
                                    subrace: subraceNameFromKey,
                                    subraceSource: subraceSource ?? undefined,
                                    raceAsiChoices: [],
                                  });
                                  applySubraceChange(race, sr);
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs min-w-[120px] max-w-[180px]">
                                  <SelectValue placeholder="Subrace…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {namedSubraces.map((sr) => (
                                    <SelectItem
                                      key={`${sr.name}|${sr.source ?? ''}`}
                                      value={`${sr.name}|${sr.source ?? ''}`}
                                      className="text-xs"
                                    >
                                      {sr.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <>
                                {hasSubraces && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs px-1.5 py-0"
                                  >
                                    {namedSubraces.length} subraces
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {race.source}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div
                className={cn(
                  'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                  detailCollapsed
                    ? 'w-0 min-w-0 opacity-0 pointer-events-none'
                    : 'w-1/2 min-w-[320px]',
                )}
              >
                <div className="p-4 border-b border-border">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Details
                  </span>
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    {displayRace ? (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-2xl font-display font-bold">
                            {displayRace.name}
                          </h2>
                          <Badge variant="outline" className="mt-2">
                            {displayRace.source}
                          </Badge>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-4 gap-3">
                          <InfoTile title="Ability Bonuses">
                            {getASILines(
                              displayRace,
                              character.raceAsiChoices,
                              (character.raceAsiBlockIndex ?? 0) as 0 | 1,
                            ).length > 0 ? (
                              getASILines(
                                displayRace,
                                character.raceAsiChoices,
                                (character.raceAsiBlockIndex ?? 0) as 0 | 1,
                              ).map((t) => (
                                <div key={t} className="text-sm font-mono">
                                  {t}
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                —
                              </span>
                            )}
                          </InfoTile>
                          <InfoTile title="Size">
                            <span className="text-sm font-mono">
                              {displayRace.size?.join(', ') ?? '—'}
                            </span>
                          </InfoTile>
                          <InfoTile title="Speed">
                            <span className="text-sm font-mono">
                              {getSpeedText(displayRace)}
                            </span>
                          </InfoTile>
                          <InfoTile title="Darkvision">
                            <span className="text-sm font-mono">
                              {getDarkvisionText(displayRace)}
                            </span>
                          </InfoTile>
                        </div>

                        <InfoTile title="Languages">
                          <span className="text-sm">
                            {getLanguages(displayRace) || '—'}
                          </span>
                        </InfoTile>

                        <div className="grid grid-cols-3 gap-3">
                          <InfoTile title="Damage Resistances">
                            <span className="text-sm">
                              {getDamageTraitText(displayRace.resist)}
                            </span>
                          </InfoTile>
                          <InfoTile title="Damage Immunities">
                            <span className="text-sm">
                              {getDamageTraitText(displayRace.immune)}
                            </span>
                          </InfoTile>
                          <InfoTile title="Condition Immunities">
                            <span className="text-sm">
                              {getDamageTraitText(displayRace.conditionImmune)}
                            </span>
                          </InfoTile>
                        </div>

                        {getRaceTraits(displayRace).length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">
                              Traits
                            </h4>
                            <div className="space-y-3">
                              {getRaceTraits(displayRace).map((trait) => (
                                <div
                                  key={`${trait.name}|${trait.entries?.length ?? 0}`}
                                >
                                  <div className="font-semibold text-sm mb-1">
                                    {trait.name}
                                  </div>
                                  <div
                                    className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                                    dangerouslySetInnerHTML={{
                                      __html: trait.entries
                                        .map((e) => renderEntry(e))
                                        .join(''),
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(displayRace.entries ?? [])
                          .filter((e) => typeof e === 'string')
                          .map((e) => (
                            <div
                              key={e as string}
                              className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1"
                              dangerouslySetInnerHTML={{
                                __html: renderEntry(e),
                              }}
                            />
                          ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                        Select a race to view details
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
