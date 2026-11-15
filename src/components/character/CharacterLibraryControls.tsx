import { BookOpen, ListBullets, SquaresFour, Users, WarningCircle } from '@phosphor-icons/react'
import { useId } from 'react'
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

const sectionHeading = 'mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground'

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

export function CharacterLibraryControls({
  counts,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  group,
  onGroupChange,
}: CharacterLibraryControlsProps) {
  const viewsId = useId()
  const filtersId = useId()
  const sortId = useId()
  const groupId = useId()
  const viewMode = useAppPreferencesStore((state) => state.characterViewMode)
  const setViewMode = useAppPreferencesStore((state) => state.setCharacterViewMode)

  return (
    <>
      <section aria-labelledby={viewsId} className="px-2">
        <h2 id={viewsId} className={sectionHeading}>
          Views
        </h2>
        <div className="grid grid-cols-2 gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
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
      <section aria-labelledby={filtersId} className="mt-4">
        <h2 id={filtersId} className={cn(sectionHeading, 'px-2')}>
          Filters
        </h2>
        <ul className="space-y-0.5">
          {libraryFilters.map(({ id, label, icon: Icon }) => {
            const selected = id === filter
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-label={
                    counts[id] === null ? `${label}, checking characters` : `${label} ${counts[id]}`
                  }
                  aria-pressed={selected}
                  onClick={() => onFilterChange(id)}
                  className={cn(
                    'relative flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                    selected
                      ? 'bg-secondary font-medium text-primary'
                      : 'text-[color:var(--navigation-foreground)] hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  {selected && (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
                  )}
                  <Icon
                    className="size-4 shrink-0"
                    weight={selected ? 'fill' : 'regular'}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {counts[id] ?? '…'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      <section aria-labelledby={sortId} className="mt-4 px-2">
        <h2 id={sortId} className={sectionHeading}>
          Sort
        </h2>
        <Select value={sort} onValueChange={(value) => onSortChange(value as LibrarySort)}>
          <SelectTrigger
            aria-labelledby={sortId}
            size="sm"
            className="w-full bg-workspace-pane text-xs shadow-none"
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
      <section aria-labelledby={groupId} className="mt-4 px-2">
        <h2 id={groupId} className={sectionHeading}>
          Group
        </h2>
        <Select value={group} onValueChange={(value) => onGroupChange(value as LibraryGroup)}>
          <SelectTrigger
            aria-labelledby={groupId}
            size="sm"
            className="w-full bg-workspace-pane text-xs shadow-none"
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
