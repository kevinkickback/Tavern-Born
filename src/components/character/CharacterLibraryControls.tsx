import { BookOpen, Users, WarningCircle } from '@phosphor-icons/react'
import { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const libraryViews = [
  { id: 'all', label: 'All', icon: Users },
  { id: '2014', label: '2014', icon: BookOpen },
  { id: '2024', label: '2024', icon: BookOpen },
  { id: 'attention', label: 'Needs Attention', icon: WarningCircle },
] as const

export type LibraryView = (typeof libraryViews)[number]['id']
export type LibrarySort = 'recent' | 'name-asc' | 'name-desc' | 'level-desc' | 'level-asc'
export type LibraryGroup = 'none' | 'class' | 'alignment' | 'player'

interface CharacterLibraryControlsProps {
  counts: Record<LibraryView, number | null>
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  sort: LibrarySort
  onSortChange: (sort: LibrarySort) => void
  group: LibraryGroup
  onGroupChange: (group: LibraryGroup) => void
}

export function CharacterLibraryControls({
  counts,
  view,
  onViewChange,
  sort,
  onSortChange,
  group,
  onGroupChange,
}: CharacterLibraryControlsProps) {
  const viewsId = useId()
  const sortId = useId()
  const groupId = useId()

  return (
    <>
      <section aria-labelledby={viewsId}>
        <h2
          id={viewsId}
          className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Library Views
        </h2>
        <ul className="space-y-0.5">
          {libraryViews.map(({ id, label, icon: Icon }) => {
            const selected = id === view
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-label={
                    counts[id] === null ? `${label}, checking characters` : `${label} ${counts[id]}`
                  }
                  aria-pressed={selected}
                  onClick={() => onViewChange(id)}
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
      <section className="mt-5 space-y-3 border-t border-border px-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sort &amp; Group
        </h2>
        <div className="space-y-1">
          <label htmlFor={sortId} className="text-xs text-muted-foreground">
            Sort by
          </label>
          <Select value={sort} onValueChange={(value) => onSortChange(value as LibrarySort)}>
            <SelectTrigger
              id={sortId}
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
        </div>
        <div className="space-y-1">
          <label htmlFor={groupId} className="text-xs text-muted-foreground">
            Group by
          </label>
          <Select value={group} onValueChange={(value) => onGroupChange(value as LibraryGroup)}>
            <SelectTrigger
              id={groupId}
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
        </div>
      </section>
    </>
  )
}
