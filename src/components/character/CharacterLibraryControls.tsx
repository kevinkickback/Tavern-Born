import type { Icon } from '@phosphor-icons/react'
import { BookOpen, ListBullets, SquaresFour, Users, WarningCircle } from '@phosphor-icons/react'
import { useId } from 'react'
import { SidebarSectionHeading } from '@/components/layout/SidebarSectionHeading'
import { getSidebarRowClassName } from '@/components/layout/sidebarRowStyles'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

const libraryFilters = [
  { id: 'all', label: 'All', icon: Users },
  { id: '2014', label: '2014', icon: BookOpen },
  { id: '2024', label: '2024', icon: BookOpen },
  { id: 'attention', label: 'Needs Attention', icon: WarningCircle },
] as const

export type LibraryFilter = (typeof libraryFilters)[number]['id']
export type LibrarySort = 'recent' | 'name-asc' | 'name-desc' | 'level-desc' | 'level-asc'
export type LibraryGroup = 'none' | 'class' | 'alignment' | 'player'

interface CharacterLibraryControlsProps {
  counts: Record<LibraryFilter, number | null>
  filter: LibraryFilter
  onFilterChange: (filter: LibraryFilter) => void
  sort: LibrarySort
  onSortChange: (sort: LibrarySort) => void
  group: LibraryGroup
  onGroupChange: (group: LibraryGroup) => void
}

interface LibraryFilterOptionProps {
  label: string
  icon: Icon
  selected: boolean
  onClick: () => void
  count: number | null
}

function LibraryFilterOption({
  label,
  icon: Icon,
  selected,
  onClick,
  count,
}: LibraryFilterOptionProps) {
  return (
    <li>
      <button
        type="button"
        aria-label={count === null ? `${label}, checking characters` : `${label} ${count}`}
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
          getSidebarRowClassName(selected),
          'w-full text-left focus-visible:outline-2 focus-visible:outline-primary',
        )}
      >
        {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />}
        <Icon
          className="size-4 shrink-0"
          weight={selected ? 'fill' : 'regular'}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count ?? '…'}</span>
      </button>
    </li>
  )
}

export function CharacterLibraryControls({
  counts,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  group,
  onGroupChange,
}: CharacterLibraryControlsProps) {
  const viewId = useId()
  const filterId = useId()
  const sortId = useId()
  const groupId = useId()
  const viewMode = useAppPreferencesStore((state) => state.characterViewMode)
  const setViewMode = useAppPreferencesStore((state) => state.setCharacterViewMode)

  return (
    <>
      <section aria-labelledby={viewId}>
        <SidebarSectionHeading id={viewId}>View</SidebarSectionHeading>
        <div className="mx-2 grid grid-cols-2 gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
          <Button
            variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 shadow-none"
            aria-label="Grid view"
            aria-pressed={viewMode === 'gallery'}
            onClick={() => setViewMode('gallery')}
          >
            <SquaresFour aria-hidden="true" /> Grid
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 shadow-none"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
          >
            <ListBullets aria-hidden="true" /> List
          </Button>
        </div>
      </section>
      <section aria-labelledby={filterId} className="mt-5">
        <SidebarSectionHeading id={filterId}>Filter</SidebarSectionHeading>
        <ul className="space-y-0.5">
          {libraryFilters.map(({ id, label, icon }) => (
            <LibraryFilterOption
              key={id}
              label={label}
              icon={icon}
              selected={filter === id}
              onClick={() => onFilterChange(id)}
              count={counts[id]}
            />
          ))}
        </ul>
      </section>
      <section aria-labelledby={sortId} className="mt-5">
        <SidebarSectionHeading id={sortId}>Sort</SidebarSectionHeading>
        <Select value={sort} onValueChange={(value) => onSortChange(value as LibrarySort)}>
          <SelectTrigger
            aria-labelledby={sortId}
            className="w-full bg-workspace-pane px-2 shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently Modified</SelectItem>
            <SelectItem value="name-asc">Name (A–Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z–A)</SelectItem>
            <SelectItem value="level-desc">Level (High–Low)</SelectItem>
            <SelectItem value="level-asc">Level (Low–High)</SelectItem>
          </SelectContent>
        </Select>
      </section>
      <section aria-labelledby={groupId} className="mt-5">
        <SidebarSectionHeading id={groupId}>Group</SidebarSectionHeading>
        <Select value={group} onValueChange={(value) => onGroupChange(value as LibraryGroup)}>
          <SelectTrigger
            aria-labelledby={groupId}
            className="w-full bg-workspace-pane px-2 shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="class">Class</SelectItem>
            <SelectItem value="alignment">Alignment</SelectItem>
            <SelectItem value="player">Player</SelectItem>
          </SelectContent>
        </Select>
      </section>
    </>
  )
}
