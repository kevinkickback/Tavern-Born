import { memo, useMemo } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import {
  buildSpellNameKeySet,
  dedupeSpellNames,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import { isSpellOnClassList, isSpellOnSubclassList } from '@/lib/calculations/spellProfiles'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
  isRitualSpell,
  SPELL_SCHOOL_NAMES,
} from '@/lib/calculations/spellUtils'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'

export interface SpellSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  spells: Spell5e[]
  lockedNames?: Set<string>
  characterSpellNames?: Set<string>
  categories?: CategoryLimit<Spell5e>[]
  initialSelectedNames?: string[]
  initialFilters?: ActiveFilters
  allowedLevels?: Set<string>
  className?: string
  classSource?: string
  subclassName?: string
  subclassSource?: string
  classListOverrides?: Set<string>
  onConfirm: (names: string[]) => void
}

const EMPTY_SPELL_NAMES = new Set<string>()

function getSpellSelectionId(spell: Pick<Spell5e, 'name' | 'source'>): string {
  return getSpellReferenceKey(spell.name, spell.source)
}

export function resolveInitialSpellSelectionIds(
  spells: readonly Pick<Spell5e, 'name' | 'source'>[],
  references: readonly string[],
): string[] {
  const idsByReference = new Map(
    spells.map((spell) => [
      getSpellReferenceKey(spell.name, spell.source),
      getSpellSelectionId(spell),
    ]),
  )
  const idsByName = new Map<string, string>()
  for (const spell of spells) {
    const nameKey = getSpellNameKey(spell.name)
    if (!idsByName.has(nameKey)) idsByName.set(nameKey, getSpellSelectionId(spell))
  }
  return references.map(
    (reference) =>
      idsByReference.get(getSpellReferenceKey(reference)) ??
      idsByName.get(getSpellNameKey(reference)) ??
      reference,
  )
}

function buildSpellLevelOptions(
  spells: readonly Pick<Spell5e, 'level'>[],
  allowedLevels?: ReadonlySet<string>,
): Array<{ value: string; label: string }> {
  const levels = new Set<number>()
  for (const spell of spells) {
    if (Number.isInteger(spell.level) && spell.level >= 0) levels.add(spell.level)
  }
  for (const rawLevel of allowedLevels ?? []) {
    const level = Number(rawLevel)
    if (Number.isInteger(level) && level >= 0) levels.add(level)
  }
  return [...levels]
    .sort((left, right) => left - right)
    .map((level) => ({
      value: String(level),
      label: level === 0 ? 'Cantrip' : `Level ${level}`,
    }))
}

function buildLevelFilter(
  spells: readonly Pick<Spell5e, 'level'>[],
  allowedLevels: Set<string> | undefined,
): FilterSection {
  const levelOptions = buildSpellLevelOptions(spells, allowedLevels)
  const disabledValues = allowedLevels
    ? new Set(levelOptions.map((o) => o.value).filter((v) => !allowedLevels.has(v)))
    : undefined
  return {
    key: 'level',
    label: 'Level',
    type: 'checkboxes',
    columns: 2,
    options: levelOptions,
    ...(disabledValues ? { disabledValues } : {}),
  }
}

const SCHOOL_FILTER: FilterSection = {
  key: 'school',
  label: 'School',
  type: 'checkboxes',
  columns: 2,
  options: Object.entries(SPELL_SCHOOL_NAMES).map(([abbr, name]) => ({
    value: abbr,
    label: name,
  })),
}

const TYPE_FILTER: FilterSection = {
  key: 'type',
  label: 'Type',
  type: 'switches',
  columns: 1,
  options: [
    { value: 'ritual', label: 'Ritual only' },
    { value: 'concentration', label: 'Concentration only' },
    { value: 'no-verbal', label: 'No verbal component' },
    { value: 'no-somatic', label: 'No somatic component' },
    { value: 'no-material', label: 'No material component' },
  ],
}

function buildVisibilityFilter(
  hasCharSpells: boolean,
  hasClassName: boolean,
): FilterSection | null {
  const options = [
    ...(hasCharSpells ? [{ value: 'hide-known', label: 'Hide already-known spells' }] : []),
    ...(hasClassName ? [{ value: 'ignore-class-list', label: 'Ignore class restrictions' }] : []),
  ]
  if (options.length === 0) return null
  return { key: 'visibility', label: 'Visibility', type: 'switches', columns: 1, options }
}

function matchSpell(
  spell: Spell5e,
  search: string,
  activeFilters: ActiveFilters,
  className: string | undefined,
  classSource: string | undefined,
  subclassName: string | undefined,
  subclassSource: string | undefined,
  classListOverrides: Set<string> | undefined,
  enforceClassList: boolean,
  strictLevels: boolean,
  characterSpellKeys?: ReadonlySet<string>,
): boolean {
  if (
    characterSpellKeys?.has(getSpellNameKey(spell.name)) &&
    activeFilters.visibility?.has('hide-known')
  ) {
    return false
  }

  if (
    enforceClassList &&
    className &&
    !isSpellOnClassList(spell, className, classSource) &&
    !isSpellOnSubclassList(spell, className, classSource, subclassName, subclassSource) &&
    !classListOverrides?.has(getSpellNameKey(spell.name))
  ) {
    return false
  }

  if (search && !spell.name.toLowerCase().includes(search.toLowerCase())) return false

  const levelSet = activeFilters.level
  if (strictLevels) {
    if (!levelSet || levelSet.size === 0 || !levelSet.has(String(spell.level))) return false
  } else {
    if (levelSet && levelSet.size > 0 && !levelSet.has(String(spell.level))) return false
  }

  const schoolSet = activeFilters.school
  if (schoolSet && schoolSet.size > 0 && !schoolSet.has(spell.school)) return false

  const typeSet = activeFilters.type
  if (typeSet?.has('ritual') && !isRitualSpell(spell)) return false
  if (typeSet?.has('concentration') && !spell.duration.some((d) => d.concentration)) return false
  if (typeSet?.has('no-verbal') && spell.components?.v) return false
  if (typeSet?.has('no-somatic') && spell.components?.s) return false
  if (typeSet?.has('no-material') && !!spell.components?.m) return false

  return true
}

interface SpellCardProps {
  spell: Spell5e
  isSelected: boolean
  isLocked: boolean
  isCharacterKnown: boolean
}

const SpellCard = memo(function SpellCard({
  spell,
  isSelected,
  isLocked,
  isCharacterKnown,
}: SpellCardProps) {
  const isRitual = isRitualSpell(spell)
  const isConcentration = spell.duration.some((d) => d.concentration)
  const firstEntry = spell.entries?.[0]

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <span className="font-semibold text-base leading-tight">{spell.name}</span>
          <span className="text-sm text-muted-foreground ml-2 leading-tight">
            {formatSpellLevel(spell.level)} · {getSchoolName(spell.school)}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap flex-shrink-0">
          {isRitual && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-info/60 text-info">
              R
            </Badge>
          )}
          {isConcentration && (
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 h-5 border-warning/60 text-warning"
            >
              C
            </Badge>
          )}
          {isSelected && (
            <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">✓</Badge>
          )}
          {!isSelected && isCharacterKnown && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
              Already Known
            </Badge>
          )}
          {!isSelected && !isCharacterKnown && isLocked && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
              Added Elsewhere
            </Badge>
          )}
        </div>
      </div>
      <div
        className={cn('grid grid-cols-4 gap-px text-xs mb-2 rounded-md overflow-hidden bg-border')}
      >
        {(
          [
            ['Cast', formatCastingTime(spell.time)],
            ['Range', formatRange(spell.range)],
            ['Duration', formatDuration(spell.duration)],
            ['Components', formatComponents(spell.components)],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="text-center bg-muted/60 px-1 py-1.5">
            <div className="text-muted-foreground font-medium leading-none mb-0.5">{label}</div>
            <div className="text-foreground leading-snug truncate" title={value}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {firstEntry != null && (
        <GameContent
          entry={firstEntry}
          className="text-sm text-muted-foreground line-clamp-3 leading-snug"
        />
      )}
    </div>
  )
})

export function SpellSelectionModal({
  open,
  onOpenChange,
  title = 'Add Spells',
  spells,
  lockedNames = EMPTY_SPELL_NAMES,
  characterSpellNames,
  categories,
  initialSelectedNames = [],
  initialFilters,
  allowedLevels,
  className,
  classSource,
  subclassName,
  subclassSource,
  classListOverrides,
  onConfirm,
}: SpellSelectionModalProps) {
  const lockedSpellKeys = useMemo(() => buildSpellNameKeySet(lockedNames), [lockedNames])
  const characterSpellKeys = useMemo(
    () => buildSpellNameKeySet(characterSpellNames ?? EMPTY_SPELL_NAMES),
    [characterSpellNames],
  )
  const classListOverrideKeys = useMemo(
    () => (classListOverrides ? buildSpellNameKeySet(classListOverrides) : undefined),
    [classListOverrides],
  )
  const initialSelectedIds = useMemo(
    () => resolveInitialSpellSelectionIds(spells, initialSelectedNames),
    [initialSelectedNames, spells],
  )

  const hasCharSpells = !!(characterSpellNames && characterSpellNames.size > 0)
  const hasClassName = !!className
  const visibilityFilter = buildVisibilityFilter(hasCharSpells, hasClassName)
  const filterSections = useMemo(
    () => [
      buildLevelFilter(spells, allowedLevels),
      SCHOOL_FILTER,
      TYPE_FILTER,
      ...(visibilityFilter ? [visibilityFilter] : []),
    ],
    [allowedLevels, spells, visibilityFilter],
  )

  const effectiveInitialFilters = hasCharSpells
    ? { ...initialFilters, visibility: new Set(['hide-known']) }
    : initialFilters

  const canSelect = (spell: Spell5e, selectedIds: Set<string>, allItems: Spell5e[]) => {
    const id = getSpellSelectionId(spell)
    if (selectedIds.has(id)) return true
    const spellNameKey = getSpellNameKey(spell.name)
    if (characterSpellKeys.has(spellNameKey)) return false
    if (lockedSpellKeys.has(spellNameKey)) return false
    if (
      allItems.some(
        (item) =>
          selectedIds.has(getSpellSelectionId(item)) && getSpellNameKey(item.name) === spellNameKey,
      )
    ) {
      return false
    }

    for (const category of categories ?? []) {
      if (category.max === Number.POSITIVE_INFINITY || !category.test(spell)) {
        continue
      }

      const count = allItems.filter(
        (item) => category.test(item) && selectedIds.has(getSpellSelectionId(item)),
      ).length
      if (count >= category.max) {
        return false
      }
    }

    return true
  }

  return (
    <SelectionModal<Spell5e>
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      items={spells}
      getItemId={getSpellSelectionId}
      renderCard={(spell, isSelected) => (
        <SpellCard
          spell={spell}
          isSelected={isSelected}
          isLocked={!isSelected && lockedSpellKeys.has(getSpellNameKey(spell.name))}
          isCharacterKnown={!isSelected && characterSpellKeys.has(getSpellNameKey(spell.name))}
        />
      )}
      canSelect={canSelect}
      matchItem={(spell, search, activeFilters) =>
        matchSpell(
          spell,
          search,
          activeFilters,
          className,
          classSource,
          subclassName,
          subclassSource,
          classListOverrideKeys,
          !activeFilters.visibility?.has('ignore-class-list'),
          !!allowedLevels,
          characterSpellKeys,
        )
      }
      filterSections={filterSections}
      categories={categories}
      initialSelectedIds={initialSelectedIds}
      initialFilters={effectiveInitialFilters}
      onConfirm={(_ids, selectedItems) =>
        onConfirm(dedupeSpellNames(selectedItems.map((s) => s.name)))
      }
    />
  )
}
