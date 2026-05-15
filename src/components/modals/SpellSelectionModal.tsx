import { memo } from 'react'
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
  SPELL_SCHOOL_NAMES,
} from '@/lib/calculations/spellUtils'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'

export interface SpellLevelLimit {
  level: number
  max: number
}

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
  classListOverrides?: Set<string>
  onConfirm: (names: string[]) => void
}

function normalizeSpellName(value: string): string {
  return value.trim().toLowerCase()
}

const ALL_LEVEL_OPTIONS = [
  { value: '0', label: 'Cantrip' },
  ...Array.from({ length: 9 }, (_, i) => ({
    value: String(i + 1),
    label: `Level ${i + 1}`,
  })),
]

function buildLevelFilter(allowedLevels: Set<string> | undefined): FilterSection {
  const disabledValues = allowedLevels
    ? new Set(ALL_LEVEL_OPTIONS.map((o) => o.value).filter((v) => !allowedLevels.has(v)))
    : undefined
  return {
    key: 'level',
    label: 'Level',
    type: 'checkboxes',
    columns: 2,
    options: ALL_LEVEL_OPTIONS,
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

function isRitualSpell(spell: Spell5e): boolean {
  const meta = spell.meta
  if (!meta || typeof meta !== 'object') {
    return false
  }
  return !!(meta as { ritual?: unknown }).ritual
}

function matchSpell(
  spell: Spell5e,
  search: string,
  activeFilters: ActiveFilters,
  className: string | undefined,
  classSource: string | undefined,
  classListOverrides: Set<string> | undefined,
  enforceClassList: boolean,
  strictLevels: boolean,
  characterSpellNames?: Set<string>,
): boolean {
  if (characterSpellNames?.has(spell.name) && activeFilters.visibility?.has('hide-known')) {
    return false
  }

  if (
    enforceClassList &&
    className &&
    !isSpellOnClassList(spell, className, classSource) &&
    !classListOverrides?.has(normalizeSpellName(spell.name))
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
  const descHtml = renderEntryCached(firstEntry)

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
      {descHtml && (
        <div
          className="text-sm text-muted-foreground line-clamp-3 leading-snug"
          // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
          dangerouslySetInnerHTML={{ __html: descHtml }}
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
  lockedNames = new Set(),
  characterSpellNames,
  categories,
  initialSelectedNames = [],
  initialFilters,
  allowedLevels,
  className,
  classSource,
  classListOverrides,
  onConfirm,
}: SpellSelectionModalProps) {
  const getItemId = (spell: Spell5e) => `${spell.name}|${spell.source ?? ''}`

  const spellIdsByName = new Map(spells.map((spell) => [spell.name, getItemId(spell)]))
  const initialSelectedIds = initialSelectedNames.map((name) => spellIdsByName.get(name) ?? name)

  const hasCharSpells = !!(characterSpellNames && characterSpellNames.size > 0)
  const hasClassName = !!className
  const visibilityFilter = buildVisibilityFilter(hasCharSpells, hasClassName)
  const filterSections = [
    buildLevelFilter(allowedLevels),
    SCHOOL_FILTER,
    TYPE_FILTER,
    ...(visibilityFilter ? [visibilityFilter] : []),
  ]

  const effectiveInitialFilters = hasCharSpells
    ? { ...initialFilters, visibility: new Set(['hide-known']) }
    : initialFilters

  const canSelect = (spell: Spell5e, selectedIds: Set<string>, allItems: Spell5e[]) => {
    const id = getItemId(spell)
    if (selectedIds.has(id)) return true
    if (characterSpellNames?.has(spell.name)) return false
    if (lockedNames.has(spell.name)) return false

    for (const category of categories ?? []) {
      if (category.max === Number.POSITIVE_INFINITY || !category.test(spell)) {
        continue
      }

      const count = allItems.filter(
        (item) => category.test(item) && selectedIds.has(getItemId(item)),
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
      getItemId={getItemId}
      renderCard={(spell, isSelected) => (
        <SpellCard
          spell={spell}
          isSelected={isSelected}
          isLocked={!isSelected && lockedNames.has(spell.name)}
          isCharacterKnown={!isSelected && !!characterSpellNames?.has(spell.name)}
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
          classListOverrides,
          !activeFilters.visibility?.has('ignore-class-list'),
          !!allowedLevels,
          characterSpellNames,
        )
      }
      filterSections={filterSections}
      categories={categories}
      initialSelectedIds={initialSelectedIds}
      initialFilters={effectiveInitialFilters}
      onConfirm={(_ids, selectedItems) => onConfirm(selectedItems.map((s) => s.name))}
    />
  )
}
