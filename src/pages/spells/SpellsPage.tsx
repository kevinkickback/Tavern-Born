import {
  BookOpen,
  Check,
  MagicWand,
  Plus,
  PushPin,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProvenance } from '@/hooks/character/useProvenance';
import { useSpellSlots } from '@/hooks/character/useSpellSlots';
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData';
import { formatModifier } from '@/lib/calculations/abilityScores';
import {
  getKnownSpellNames,
  getProfileKnownNames,
} from '@/lib/calculations/spellProfiles';
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils';
import { renderEntry } from '@/lib/renderer';
import { cn } from '@/lib/utils';
import { useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';
import type { Spell5e } from '@/types/5etools';
import { NoCharCard } from '../_shared';

interface SpellListItem {
  profileId: string;
  profileLabel: string;
  className?: string;
  classSource?: string;
  alwaysPrepared?: boolean;
  isPreparedCaster?: boolean;
  name: string;
  level: number;
  kind: 'cantrip' | 'spell';
  prepared: boolean;
}

interface TooltipEntityLike {
  name?: string;
  source?: string;
  page?: number;
  entries?: unknown[];
}

interface RecursiveReference {
  kind: string;
  name: string;
  source?: string;
}

interface RecursiveTooltipData {
  title: string;
  subtitle?: string;
  html?: string;
}

interface RecursiveHintState extends RecursiveTooltipData {
  x: number;
  y: number;
}

interface RecursiveLookup {
  spells: Map<string, Spell5e>;
  items: Map<string, TooltipEntityLike>;
  feats: Map<string, TooltipEntityLike>;
  races: Map<string, TooltipEntityLike>;
  classes: Map<string, TooltipEntityLike>;
  backgrounds: Map<string, TooltipEntityLike>;
  optionalfeatures: Map<string, TooltipEntityLike>;
  actions: Map<string, TooltipEntityLike>;
  conditions: Map<string, TooltipEntityLike>;
  deities: Map<string, TooltipEntityLike>;
  skills: Map<string, TooltipEntityLike>;
  senses: Map<string, TooltipEntityLike>;
  variantrules: Map<string, TooltipEntityLike>;
  languages: Map<string, TooltipEntityLike>;
}

function getEntityKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`.toLowerCase();
}

function buildNameMap<T extends TooltipEntityLike>(
  items: T[] = [],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const name = item?.name?.trim();
    if (!name) continue;

    const source = item.source?.trim();
    const withSource = getEntityKey(name, source);
    if (!map.has(withSource)) {
      map.set(withSource, item);
    }

    const withoutSource = getEntityKey(name);
    if (!map.has(withoutSource)) {
      map.set(withoutSource, item);
    }
  }
  return map;
}

function parseRecursiveReference(
  rawTitle: string,
  fallbackName: string,
  hoverType?: string,
  hoverName?: string,
  hoverSource?: string,
): RecursiveReference {
  if (hoverName?.trim()) {
    return {
      kind: hoverType?.trim().toLowerCase() || 'note',
      name: hoverName.trim(),
      source: hoverSource?.trim() || undefined,
    };
  }

  const match = /^([^:]+):\s*(.+)$/.exec(rawTitle);
  if (!match) {
    return {
      kind: 'note',
      name: fallbackName.trim() || rawTitle.trim(),
    };
  }

  return {
    kind: match[1].trim().toLowerCase(),
    name: match[2].trim(),
  };
}

function normalizeKind(kind: string): string {
  const normalized = kind.trim().toLowerCase();
  const aliases: Record<string, string> = {
    condition: 'conditions',
    status: 'conditions',
    action: 'actions',
    deity: 'deities',
    skill: 'skills',
    sense: 'senses',
    variantrule: 'variantrules',
    language: 'languages',
    item: 'items',
    feat: 'feats',
    race: 'races',
    class: 'classes',
    background: 'backgrounds',
    optionalfeature: 'optionalfeatures',
    optfeature: 'optionalfeatures',
  };
  return aliases[normalized] ?? normalized;
}

function getPreviewHtml(entries: unknown[] | undefined): string | undefined {
  if (!entries?.length) return undefined;
  return entries
    .slice(0, 2)
    .map((entry) => getEntryWithHoverTitles(entry))
    .join('');
}

function getRecursiveTooltipData(
  reference: RecursiveReference,
  lookup: RecursiveLookup,
  rawTitle: string,
): RecursiveTooltipData {
  const simpleFallback: RecursiveTooltipData = {
    title: reference.name,
    subtitle: rawTitle,
  };

  if (!reference.name) return simpleFallback;

  if (normalizeKind(reference.kind) === 'spell') {
    const spell =
      lookup.spells.get(getEntityKey(reference.name, reference.source)) ??
      lookup.spells.get(getEntityKey(reference.name));
    if (!spell) return simpleFallback;
    return {
      title: spell.name,
      subtitle: `${formatSpellLevel(spell.level)} ${getSchoolName(spell.school)}${spell.source ? ` • ${spell.source}` : ''}`,
      html: getPreviewHtml(spell.entries),
    };
  }

  const mapByKind: Record<string, Map<string, TooltipEntityLike> | undefined> =
  {
    items: lookup.items,
    feats: lookup.feats,
    races: lookup.races,
    classes: lookup.classes,
    backgrounds: lookup.backgrounds,
    optionalfeatures: lookup.optionalfeatures,
    actions: lookup.actions,
    conditions: lookup.conditions,
    deities: lookup.deities,
    skills: lookup.skills,
    senses: lookup.senses,
    variantrules: lookup.variantrules,
    languages: lookup.languages,
  };

  const normalizedKind = normalizeKind(reference.kind);
  const entityMap = mapByKind[normalizedKind];
  const entity =
    entityMap?.get(getEntityKey(reference.name, reference.source)) ??
    entityMap?.get(getEntityKey(reference.name));
  if (!entity) return simpleFallback;

  return {
    title: entity.name ?? reference.name,
    subtitle: `${normalizedKind.charAt(0).toUpperCase()}${normalizedKind.slice(1)}${entity.source ? ` • ${entity.source}` : ''}${entity.page ? ` p. ${entity.page}` : ''}`,
    html: getPreviewHtml(entity.entries),
  };
}

function getEntryWithHoverTitles(entry: unknown): string {
  const html = renderEntry(entry) ?? '';
  return html
    .replace(
      /\stitle="([^"]+)"((?:\sdata-hover-type="[^"]*")?)(?:\sdata-hover-name="([^"]*)")?((?:\sdata-hover-source="[^"]*")?)/g,
      (_match, title, maybeType = '', hoverName = '', maybeSource = '') =>
        ` title="${title}" data-recursive-title="${title}"${maybeType}${hoverName ? ` data-hover-name="${hoverName}"` : ''}${maybeSource}`,
    )
    .replace(
      /\scursor-help/g,
      ' cursor-help underline decoration-dotted underline-offset-2',
    );
}

function getRecursiveHintPosition(
  target: HTMLElement,
  hasBody: boolean,
): {
  x: number;
  y: number;
} {
  // Get viewport-relative coordinates of the hovered element
  const rect = target.getBoundingClientRect();

  // Find the TooltipContent container (nearest positioned ancestor)
  let container = target.offsetParent as HTMLElement | null;
  while (container && !container.classList.contains('[&_p]:my-0.5')) {
    container = container.offsetParent as HTMLElement | null;
  }

  // If we can't find the container, look for any data-* attributes or class patterns
  if (!container) {
    container = target.closest('[role="tooltip"]') as HTMLElement | null;
  }
  if (!container) {
    container = target.closest('div[class*="shadow-xl"]') as HTMLElement | null;
  }

  // Get the container's viewport-relative position
  const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

  // Convert element coordinates to be relative to container
  const elementRelX = rect.left - containerRect.left;
  const elementRelY = rect.top - containerRect.top;

  const tooltipWidthEstimate = 300;
  const tooltipHeightEstimate = hasBody ? 220 : 88;
  const gap = 8;

  // Position to the right of the hovered text, or left if no space
  const containerWidth = containerRect.right - containerRect.left;
  const rightCandidate = rect.right - containerRect.left + gap;
  const leftCandidate = elementRelX - tooltipWidthEstimate - gap;

  let x = rightCandidate;
  if (rightCandidate + tooltipWidthEstimate > containerWidth && leftCandidate >= 0) {
    x = leftCandidate;
  } else if (rightCandidate + tooltipWidthEstimate > containerWidth) {
    x = Math.max(0, containerWidth - tooltipWidthEstimate - 4);
  }

  // Position below or above the hovered text
  const centeredY = elementRelY + rect.height / 2 - tooltipHeightEstimate / 2;
  const preferredDown = rect.bottom - containerRect.top + gap;
  const preferredUp = elementRelY - tooltipHeightEstimate - gap;
  const containerHeight = containerRect.bottom - containerRect.top;

  const y = Math.max(
    0,
    Math.min(
      centeredY,
      preferredDown + tooltipHeightEstimate <= containerHeight
        ? preferredDown
        : preferredUp,
    ),
  );

  return { x, y };
}

export function SpellsPage() {
  const gameData = useGameDataStore((state) => state.gameData);
  const character = useCharacterStore((s) => s.activeCharacter);
  const {
    spells,
    items,
    feats,
    races,
    classes,
    backgrounds,
    optionalfeatures,
  } = useFilteredGameData();
  const { applyManualSpellGrant, removeSpellProvenance } = useProvenance();
  const {
    spellProfiles,
    spellcastingDetails,
    sharedSlots,
    pactSlots,
    isSpellcaster,
    setProfileSpells,
    removeSpellFromProfile,
    togglePrepared,
  } = useSpellSlots();

  const [spellModalOpen, setSpellModalOpen] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string>('');

  const allSpells = spells as Spell5e[];
  const spellByName = useMemo(() => {
    const map = new Map<string, Spell5e>();
    for (const spell of allSpells) {
      map.set(getEntityKey(spell.name, spell.source), spell);
      const withoutSource = getEntityKey(spell.name);
      if (!map.has(withoutSource)) {
        map.set(withoutSource, spell);
      }
    }
    return map;
  }, [allSpells]);

  const recursiveLookup = useMemo<RecursiveLookup>(
    () => ({
      spells: spellByName,
      items: buildNameMap(items as TooltipEntityLike[]),
      feats: buildNameMap(feats as TooltipEntityLike[]),
      races: buildNameMap(races as TooltipEntityLike[]),
      classes: buildNameMap(classes as TooltipEntityLike[]),
      backgrounds: buildNameMap(backgrounds as TooltipEntityLike[]),
      optionalfeatures: buildNameMap(optionalfeatures as TooltipEntityLike[]),
      actions: buildNameMap((gameData?.actions as TooltipEntityLike[]) ?? []),
      conditions: buildNameMap(
        (gameData?.conditions as TooltipEntityLike[]) ?? [],
      ),
      deities: buildNameMap((gameData?.deities as TooltipEntityLike[]) ?? []),
      skills: buildNameMap((gameData?.skills as TooltipEntityLike[]) ?? []),
      senses: buildNameMap((gameData?.senses as TooltipEntityLike[]) ?? []),
      variantrules: buildNameMap(
        (gameData?.variantrules as TooltipEntityLike[]) ?? [],
      ),
      languages: buildNameMap(
        (gameData?.languages as TooltipEntityLike[]) ?? [],
      ),
    }),
    [
      backgrounds,
      classes,
      feats,
      gameData?.actions,
      gameData?.conditions,
      gameData?.deities,
      gameData?.languages,
      gameData?.senses,
      gameData?.skills,
      gameData?.variantrules,
      items,
      optionalfeatures,
      races,
      spellByName,
    ],
  );

  const activeProfile =
    spellProfiles.find((profile) => profile.id === activeProfileId) ??
    spellProfiles[0] ??
    null;

  const detailsByProfileId = useMemo(
    () =>
      new Map(
        spellcastingDetails.map(
          (detail) => [detail.profileId, detail] as const,
        ),
      ),
    [spellcastingDetails],
  );

  const spellListItems = useMemo(() => {
    const items: SpellListItem[] = [];

    for (const profile of spellProfiles) {
      const detail = detailsByProfileId.get(profile.id);

      for (const name of profile.cantrips) {
        const spell = spellByName.get(getEntityKey(name));
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared: profile.alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 0,
          kind: 'cantrip',
          prepared: !!profile.alwaysPrepared,
        });
      }

      for (const name of profile.spellsKnown) {
        const spell = spellByName.get(getEntityKey(name));
        const prepared = profile.alwaysPrepared
          ? true
          : profile.preparedSpells.includes(name);
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          className: profile.className,
          classSource: profile.classSource,
          alwaysPrepared: profile.alwaysPrepared,
          isPreparedCaster: detail?.isPreparedCaster,
          name,
          level: spell?.level ?? 1,
          kind: 'spell',
          prepared,
        });
      }
    }

    return items.sort((a, b) => {
      const aSpecial = a.profileId.startsWith('special:');
      const bSpecial = b.profileId.startsWith('special:');
      if (aSpecial !== bSpecial) return aSpecial ? 1 : -1;
      if (a.profileLabel !== b.profileLabel) {
        return a.profileLabel.localeCompare(b.profileLabel);
      }
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });
  }, [detailsByProfileId, spellByName, spellProfiles]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, SpellListItem[]>();
    for (const item of spellListItems) {
      if (!map.has(item.profileId)) map.set(item.profileId, []);
      map.get(item.profileId)?.push(item);
    }
    return map;
  }, [spellListItems]);

  const selectionSourceByProfileAndSpell = useMemo(() => {
    const map = new Map<string, string>();
    const byClassKey = new Map(
      spellProfiles
        .filter((profile) => profile.type === 'class')
        .map((profile) => [
          `${profile.className ?? ''}|${profile.classSource ?? ''}`,
          profile.id,
        ]),
    );
    const spellsByLevel = character?.spellsByLevel ?? {};

    for (const [key, names] of Object.entries(spellsByLevel)) {
      const [classKey, levelText] = key.split(':');
      if (!classKey || !levelText) continue;
      const profileId = byClassKey.get(classKey);
      if (!profileId) continue;

      const [className] = classKey.split('|');
      const level = Number.parseInt(levelText, 10);
      if (!Number.isFinite(level)) continue;

      for (const spellName of names ?? []) {
        const mapKey = `${profileId}|${spellName}`;
        if (map.has(mapKey)) continue;
        map.set(mapKey, `Source: Level ${level} ${className} progression`);
      }
    }

    return map;
  }, [character?.spellsByLevel, spellProfiles]);

  const modalConfig = useMemo(() => {
    if (!activeProfile) return null;
    const detail = detailsByProfileId.get(activeProfile.id);
    const ownedNames = getProfileKnownNames(activeProfile);
    const initialSelectedNames = [...ownedNames];
    const lockedNames = new Set(
      [...getKnownSpellNames(spellProfiles)].filter(
        (name) => !ownedNames.has(name),
      ),
    );

    const allowedLevels = new Set<string>();
    const categories: {
      key: string;
      label: string;
      max: number;
      test: (spell: Spell5e) => boolean;
    }[] = [];

    if (activeProfile.type === 'special') {
      allowedLevels.add('0');
      for (let level = 1; level <= 9; level++) {
        allowedLevels.add(String(level));
      }

      const initialFilters = {
        level: new Set(allowedLevels),
        school: new Set<string>(),
        type: new Set<string>(),
      };

      return {
        title: `Add Spells (${activeProfile.label})`,
        className: undefined,
        classSource: undefined,
        allowedLevels,
        initialFilters,
        categories: [
          {
            key: 'cantrips',
            label: 'cantrips',
            max: Number.POSITIVE_INFINITY,
            test: (spell: Spell5e) => spell.level === 0,
          },
          {
            key: 'spells',
            label: 'spells',
            max: Number.POSITIVE_INFINITY,
            test: (spell: Spell5e) => spell.level > 0,
          },
        ],
        initialSelectedNames,
        lockedNames,
      };
    }

    const cantripLimit = detail?.cantripLimit ?? null;
    const knownSpellLimit = detail?.knownSpellLimit ?? null;

    if (cantripLimit !== null) {
      allowedLevels.add('0');
      categories.push({
        key: 'cantrips',
        label: 'cantrips',
        max: cantripLimit,
        test: (spell: Spell5e) => spell.level === 0,
      });
    }

    const maxSpellLevel = detail?.maxSpellLevel ?? 0;
    for (let level = 1; level <= maxSpellLevel; level++) {
      allowedLevels.add(String(level));
    }

    if (knownSpellLimit !== null) {
      categories.push({
        key: 'spells',
        label: 'spells',
        max: knownSpellLimit,
        test: (spell: Spell5e) => spell.level > 0,
      });
    } else if (maxSpellLevel > 0) {
      categories.push({
        key: 'spells',
        label: 'spells',
        max: Number.POSITIVE_INFINITY,
        test: (spell: Spell5e) => spell.level > 0,
      });
    }

    const initialFilters = {
      level: new Set(allowedLevels),
      school: new Set<string>(),
      type: new Set<string>(),
    };

    return {
      title: `Add Spells (${activeProfile.label})`,
      className: activeProfile.className,
      classSource: activeProfile.classSource,
      allowedLevels,
      initialFilters,
      categories,
      initialSelectedNames,
      lockedNames,
    };
  }, [activeProfile, detailsByProfileId, spellProfiles]);

  const hasWarlockClass = useMemo(
    () =>
      spellcastingDetails.some(
        (detail) => detail.className.toLowerCase() === 'warlock',
      ),
    [spellcastingDetails],
  );

  const hasMultipleSpellcastingClasses = spellcastingDetails.length > 1;

  if (!character) {
    return (
      <NoCharCard icon={<MagicWand weight="duotone" />} noun="manage spells" />
    );
  }

  const handleRemoveSpell = (item: SpellListItem) => {
    removeSpellFromProfile(item.profileId, item.name, item.kind);

    const existsElsewhere = spellProfiles.some((profile) => {
      if (profile.id === item.profileId) return false;
      return (
        profile.cantrips.includes(item.name) ||
        profile.spellsKnown.includes(item.name)
      );
    });

    if (!existsElsewhere) {
      removeSpellProvenance(item.name);
    }
  };

  const activeProfileKnownCount = activeProfile
    ? activeProfile.cantrips.length + activeProfile.spellsKnown.length
    : 0;

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <MagicWand className="h-6 w-6 text-accent" weight="duotone" />
          Spells
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-[320px]">
            <span className="text-xs text-muted-foreground min-w-[56px] shrink-0">
              Add to:
            </span>
            <Select
              value={activeProfileId || activeProfile?.id || ''}
              onValueChange={setActiveProfileId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose profile" />
              </SelectTrigger>
              <SelectContent>
                {spellProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => {
              if (!activeProfileId && spellProfiles[0]) {
                setActiveProfileId(spellProfiles[0].id);
              }
              setSpellModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Spells
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="w-full flex flex-col">
          <CardHeader>
            <CardTitle className="font-display text-xl flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" weight="duotone" />
              Spell List
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {groupedItems.size === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No spells assigned yet.
              </p>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={spellProfiles
                  .map((profile) => profile.id)
                  .filter(
                    (profileId) =>
                      (groupedItems.get(profileId)?.length ?? 0) > 0,
                  )}
                className="space-y-3 max-h-[620px] overflow-y-auto pr-1"
              >
                {spellProfiles.map((profile) => {
                  const items = groupedItems.get(profile.id) ?? [];
                  if (items.length === 0) return null;
                  const detail = detailsByProfileId.get(profile.id);

                  const preparedCount = items.filter(
                    (item) => item.prepared,
                  ).length;
                  const preparedTotal = items.length;
                  const levels = [
                    ...new Set(items.map((item) => item.level)),
                  ].sort((a, b) => a - b);

                  return (
                    <AccordionItem
                      key={profile.id}
                      value={profile.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <AccordionTrigger className="px-3 py-2 bg-muted/30 hover:no-underline">
                        <div className="flex items-center gap-2 text-left w-full min-w-0">
                          <span className="font-medium text-sm">
                            {profile.label}
                          </span>
                          {profile.alwaysPrepared ? (
                            <Badge variant="secondary" className="text-xs">
                              Always Prepared
                            </Badge>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2 pr-1">
                            {detail?.isPreparedCaster ? (
                              <Badge variant="outline" className="text-xs">
                                Prepared: {preparedCount}/{preparedTotal}
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="text-xs">
                              Total: {items.length}
                            </Badge>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-px bg-border/60">
                          {levels.map((level) => {
                            const levelItems = items.filter(
                              (item) => item.level === level,
                            );
                            return (
                              <div
                                key={`${profile.id}|level|${level}`}
                                className="bg-card"
                              >
                                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/15 border-b border-border/60">
                                  {level === 0
                                    ? 'Cantrips'
                                    : `${formatSpellLevel(level)}s`}
                                </div>
                                <div className="divide-y divide-border/60">
                                  {levelItems.map((item) => {
                                    const canPrepare =
                                      item.kind === 'spell' &&
                                      !item.alwaysPrepared &&
                                      !!item.isPreparedCaster;
                                    const spell = spellByName.get(getEntityKey(item.name));

                                    return (
                                      <div
                                        key={`${item.profileId}|${item.kind}|${item.name}`}
                                        className="px-3 py-2 flex items-center justify-between gap-3"
                                      >
                                        <div className="min-w-0">
                                          <SpellNameTooltip
                                            name={item.name}
                                            spell={spell}
                                            recursiveLookup={recursiveLookup}
                                            sourceContext={selectionSourceByProfileAndSpell.get(
                                              `${item.profileId}|${item.name}`,
                                            )}
                                          />
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {item.alwaysPrepared ? (
                                            <Badge className="text-xs bg-accent text-accent-foreground">
                                              <Check className="h-3 w-3 mr-1" />
                                              Prepared
                                            </Badge>
                                          ) : canPrepare ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                togglePrepared(
                                                  item.profileId,
                                                  item.name,
                                                )
                                              }
                                              className={cn(
                                                'h-4 w-4 rounded-full border-2 transition-colors',
                                                item.prepared
                                                  ? 'bg-accent border-accent'
                                                  : 'border-muted-foreground',
                                              )}
                                              title={
                                                item.prepared
                                                  ? 'Prepared'
                                                  : 'Not prepared'
                                              }
                                            />
                                          ) : null}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                            onClick={() =>
                                              handleRemoveSpell(item)
                                            }
                                          >
                                            <Trash className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="font-display text-xl flex items-center gap-2">
              <MagicWand className="h-5 w-5 text-accent" weight="duotone" />
              Spellcasting Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isSpellcaster ? (
              <p className="text-sm text-muted-foreground">
                This character has no spellcasting classes yet.
              </p>
            ) : (
              <>
                <div className="grid gap-3 max-w-3xl xl:grid-cols-2">
                  {spellcastingDetails.map((detail) => (
                    <div
                      key={detail.profileId}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">
                            {detail.className}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Level {detail.classLevel} {detail.casterProgression}
                          </p>
                        </div>
                        {detail.spellcastingAbility ? (
                          <Badge
                            variant="secondary"
                            className="text-xs uppercase"
                          >
                            {detail.spellcastingAbility}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="rounded border border-border px-2 py-1.5">
                          <div className="text-muted-foreground">
                            Spell Save DC
                          </div>
                          <div className="font-semibold text-sm">
                            {detail.spellSaveDC ?? '-'}
                          </div>
                        </div>
                        <div className="rounded border border-border px-2 py-1.5">
                          <div className="text-muted-foreground">
                            Spell Attack
                          </div>
                          <div className="font-semibold text-sm">
                            {detail.spellAttackBonus !== null
                              ? formatModifier(detail.spellAttackBonus)
                              : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {hasMultipleSpellcastingClasses
                      ? 'Shared Spell Slots'
                      : 'Spell Slots'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sharedSlots.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No shared slots
                      </span>
                    ) : (
                      sharedSlots.map((slot) => (
                        <div
                          key={`shared-${slot.level}`}
                          className="border rounded-lg px-3 py-1.5 text-center min-w-[64px] border-accent/40 bg-accent/5"
                        >
                          <div className="text-sm font-bold">{slot.max}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Level {slot.level}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {hasWarlockClass ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Pact Magic Slots
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {pactSlots.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No pact slots
                        </span>
                      ) : (
                        pactSlots.map((slot) => (
                          <div
                            key={`pact-${slot.level}`}
                            className="border rounded-lg px-3 py-1.5 text-center min-w-[64px] border-warning/40 bg-warning/10"
                          >
                            <div className="text-sm font-bold">
                              {slot.available}/{slot.max}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Level {slot.level}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {activeProfile && modalConfig ? (
        <SpellSelectionModal
          open={spellModalOpen}
          onOpenChange={setSpellModalOpen}
          title={modalConfig.title}
          spells={allSpells}
          initialSelectedNames={modalConfig.initialSelectedNames}
          lockedNames={modalConfig.lockedNames}
          className={modalConfig.className}
          classSource={modalConfig.classSource}
          allowedLevels={modalConfig.allowedLevels}
          initialFilters={modalConfig.initialFilters}
          categories={
            modalConfig.categories && modalConfig.categories.length > 0
              ? modalConfig.categories
              : undefined
          }
          onConfirm={(names) => {
            const previousKnownNames = getProfileKnownNames(activeProfile);
            const otherKnownNames = new Set(
              spellProfiles
                .filter((profile) => profile.id !== activeProfile.id)
                .flatMap((profile) => [
                  ...profile.cantrips,
                  ...profile.spellsKnown,
                ]),
            );
            const nextCantrips = names.filter(
              (spellName) => spellByName.get(getEntityKey(spellName))?.level === 0,
            );
            const nextSpellsKnown = names.filter(
              (spellName) => spellByName.get(getEntityKey(spellName))?.level !== 0,
            );

            setProfileSpells(activeProfile.id, nextCantrips, nextSpellsKnown);

            for (const spellName of names) {
              if (previousKnownNames.has(spellName)) continue;
              applyManualSpellGrant(spellName);
            }

            for (const spellName of previousKnownNames) {
              if (names.includes(spellName) || otherKnownNames.has(spellName)) {
                continue;
              }
              removeSpellProvenance(spellName);
            }
          }}
        />
      ) : null}

      {activeProfile ? (
        <p className="text-xs text-muted-foreground">
          Adding to {activeProfile.label} ({activeProfileKnownCount} known
          total)
        </p>
      ) : null}
    </div>
  );
}

function SpellNameTooltip({
  name,
  spell,
  recursiveLookup,
  sourceContext,
}: {
  name: string;
  spell?: Spell5e;
  recursiveLookup: RecursiveLookup;
  sourceContext?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [recursiveHint, setRecursiveHint] = useState<RecursiveHintState | null>(
    null,
  );

  const renderedEntries = useMemo(() => {
    if (!spell) return [];
    return [...(spell.entries ?? []), ...(spell.entriesHigherLevel ?? [])].map(
      (entry) => getEntryWithHoverTitles(entry),
    );
  }, [spell]);

  const handleRecursiveHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const withTitle = target.closest(
      '[data-recursive-title]',
    ) as HTMLElement | null;
    if (!withTitle) {
      setRecursiveHint(null);
      return;
    }

    const text = withTitle.getAttribute('data-recursive-title');
    if (!text) {
      setRecursiveHint(null);
      return;
    }

    const hoverType = withTitle.getAttribute('data-hover-type') ?? undefined;
    const hoverName = withTitle.getAttribute('data-hover-name') ?? undefined;
    const hoverSource =
      withTitle.getAttribute('data-hover-source') ?? undefined;
    const fallbackName = withTitle.textContent?.trim() ?? '';
    const reference = parseRecursiveReference(
      text,
      fallbackName,
      hoverType,
      hoverName,
      hoverSource,
    );
    const resolved = getRecursiveTooltipData(reference, recursiveLookup, text);
    const { x, y } = getRecursiveHintPosition(withTitle, !!resolved.html);

    setRecursiveHint({
      ...resolved,
      x,
      y,
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (pinned && !nextOpen) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setRecursiveHint(null);
    }
  };

  return (
    <Tooltip open={pinned || open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <span className="text-sm truncate cursor-help border-b border-dotted border-muted-foreground/60 hover:border-accent">
          {name}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        onMouseMove={handleRecursiveHover}
        onMouseLeave={() => setRecursiveHint(null)}
        className="w-[320px] max-w-[calc(100vw-2rem)] p-0 !bg-card !text-card-foreground border border-border shadow-xl"
      >
        {spell ? (
          <>
            <div className="px-3 py-2 border-b border-border relative">
              <div className="pr-16">
                <div className="font-semibold text-xl leading-tight">
                  {spell.name}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {formatSpellLevel(spell.level)} {getSchoolName(spell.school)}
                </div>
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPinned((value) => !value);
                    setOpen(true);
                  }}
                  className={cn(
                    'h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 flex items-center justify-center',
                    pinned
                      ? 'text-accent border-accent/60'
                      : 'text-muted-foreground',
                  )}
                  title={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
                >
                  <PushPin
                    className="h-3.5 w-3.5"
                    weight={pinned ? 'fill' : 'regular'}
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPinned(false);
                    setOpen(false);
                    setRecursiveHint(null);
                  }}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 text-muted-foreground flex items-center justify-center"
                  title="Close tooltip"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-3 py-2">
              <div className="rounded border border-border bg-muted/15 p-2 text-sm space-y-1">
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">
                    Casting Time:
                  </span>
                  <span>{formatCastingTime(spell.time)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Range:</span>
                  <span>{formatRange(spell.range)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">
                    Components:
                  </span>
                  <span>{formatComponents(spell.components)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Duration:</span>
                  <span>{formatDuration(spell.duration)}</span>
                </div>
              </div>
            </div>

            <div className="px-3 pb-3 text-sm leading-relaxed space-y-1.5 max-h-[220px] overflow-y-auto">
              {renderedEntries.map((html, idx) => (
                <div
                  // renderEntry returns safe HTML from structured 5etools content.
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: html }}
                  key={`${spell.name}|entry|${idx}`}
                  className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
                />
              ))}
            </div>

            <div className="px-3 py-1.5 border-t border-border text-right italic text-xs text-muted-foreground">
              {spell.source}
              {spell.page ? ` p. ${spell.page}` : ''}
            </div>

            {sourceContext ? (
              <div className="px-3 py-1.5 text-xs bg-accent/10 text-accent border-t border-accent/30">
                {sourceContext}
              </div>
            ) : null}

            {recursiveHint ? (
              <div
                className="absolute z-[90] pointer-events-none rounded border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg w-[300px]"
                style={{
                  left: `${recursiveHint.x}px`,
                  top: `${recursiveHint.y}px`,
                }}
              >
                <div className="font-semibold text-sm leading-tight">
                  {recursiveHint.title}
                </div>
                {recursiveHint.subtitle ? (
                  <div className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                    {recursiveHint.subtitle}
                  </div>
                ) : null}
                {recursiveHint.html ? (
                  <div
                    // renderEntry returns safe HTML from structured 5etools content.
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: recursiveHint.html }}
                    className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
                  />
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            Details unavailable.
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
