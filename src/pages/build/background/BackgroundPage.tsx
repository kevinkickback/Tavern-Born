import { CaretLeft, CaretRight, Scroll } from '@phosphor-icons/react';
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
import { useProvenance } from '@/hooks/character/useProvenance';
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData';
import { matchesGameDataEntry } from '@/lib/characterUtils';
import { cn } from '@/lib/utils';
import { NoCharCard } from '@/pages/_shared';
import { BuildBackgroundDetailsPanel } from '@/pages/build/background/components/DetailsPanel';
import {
  getBackgroundEquipmentPackages,
  getBackgroundLanguageNames,
  getBackgroundSkillNames,
  getBackgroundToolNames,
} from '@/pages/build/background/model/data';
import { useCharacterStore } from '@/store/characterStore';
import type { Background5e } from '@/types/5etools';

export function BuildBackgroundPage() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const { backgrounds } = useFilteredGameData();
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [bgSearch, setBgSearch] = useState('');
  const { applyBackgroundSelection } = useProvenance();
  const selectedBackgroundRef = useRef<HTMLDivElement | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousSearchRef = useRef('');

  const filteredBackgrounds = useMemo(() => {
    const q = bgSearch.trim().toLowerCase();
    if (!q) return backgrounds;
    return backgrounds.filter((b) => b.name.toLowerCase().includes(q));
  }, [backgrounds, bgSearch]);

  useEffect(() => {
    // Only scroll on initial mount or when search changes, not on selection change
    const isSearchChanged = previousSearchRef.current !== bgSearch;
    const shouldScroll = isInitialLoadRef.current || isSearchChanged;

    if (shouldScroll && selectedBackgroundRef.current) {
      selectedBackgroundRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'start',
        inline: 'nearest',
      });
    }

    isInitialLoadRef.current = false;
    previousSearchRef.current = bgSearch;
  }, [bgSearch]);

  if (!character) {
    return (
      <NoCharCard
        icon={<Scroll weight="duotone" />}
        noun="choose a background"
      />
    );
  }

  const selectedBg = backgrounds.find((b) =>
    matchesGameDataEntry(character.background, character.backgroundSource, b),
  ) as Background5e | undefined;
  const selectedBackgroundKey = selectedBg
    ? `${selectedBg.name}|${selectedBg.source ?? ''}`
    : null;

  const handleBackground = (name: string, bgSource?: string) => {
    const bg = backgrounds.find((b) =>
      matchesGameDataEntry(name, bgSource, b),
    ) as Background5e | undefined;
    if (!bg) return;
    applyBackgroundSelection(bg);
    updateCharacter(character.id, {
      background: name,
      backgroundSource: bgSource ?? undefined,
    });
    if (detailCollapsed) setDetailCollapsed(false);
  };

  const skills = getBackgroundSkillNames(selectedBg);
  const langs = getBackgroundLanguageNames(selectedBg);
  const tools = getBackgroundToolNames(selectedBg);
  const equipmentPackages = getBackgroundEquipmentPackages(selectedBg);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Scroll className="h-6 w-6 text-accent" weight="duotone" />
            Background
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
              {' '}
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
              </button>{' '}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col gap-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Backgrounds ({filteredBackgrounds.length}
                    {bgSearch ? ` of ${backgrounds.length}` : ''})
                  </span>
                  <Input
                    placeholder="Search backgrounds…"
                    value={bgSearch}
                    onChange={(e) => setBgSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 space-y-1 pr-8">
                    {filteredBackgrounds.map((bg) => {
                      const bgKey = `${bg.name}|${bg.source ?? ''}`;
                      const isSelected = selectedBackgroundKey === bgKey;
                      const hasEquip = (bg.startingEquipment ?? []).some(
                        (b) =>
                          typeof b === 'object' &&
                          Boolean((b as { A?: unknown }).A),
                      );
                      return (
                        <div
                          key={bgKey}
                          ref={isSelected ? selectedBackgroundRef : null}
                          className={cn(
                            'w-full p-3 rounded-lg border transition-colors hover:border-accent flex items-center justify-between gap-2',
                            isSelected
                              ? 'border-accent bg-accent/10'
                              : 'border-border bg-card',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleBackground(bg.name, bg.source ?? undefined)
                            }
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
                              {bg.name}
                            </span>
                          </button>
                          {/* Right side: equipment dropdown when selected + has options, badge otherwise */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSelected &&
                            hasEquip &&
                            equipmentPackages.length > 1 ? (
                              <Select defaultValue="A">
                                <SelectTrigger className="h-7 text-xs min-w-[110px] max-w-[160px]">
                                  <SelectValue placeholder="Equipment…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {equipmentPackages.map((pkg) => (
                                    <SelectItem
                                      key={pkg.label}
                                      value={pkg.label}
                                      className="text-xs"
                                    >
                                      {pkg.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                {bg.source}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>{' '}
              <BuildBackgroundDetailsPanel
                detailCollapsed={detailCollapsed}
                selectedBackground={selectedBg}
                skillNames={skills}
                languageNames={langs}
                toolNames={tools}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
