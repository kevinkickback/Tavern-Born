import { Funnel, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export type ActiveFilters = Record<string, Set<string>>

const MODAL_ROW_ESTIMATE = 148
const MODAL_LIST_INITIAL_RECT = { width: 800, height: 600 }
const estimateModalRowSize = () => MODAL_ROW_ESTIMATE

export interface FilterOption {
  value: string
  label: string
}

export interface FilterSection {
  key: string
  label: string
  type: 'checkboxes' | 'switches'
  options: FilterOption[]
  columns?: 1 | 2
  disabledValues?: Set<string>
}

export interface CategoryLimit<T> {
  key: string
  label: string
  max: number
  test: (item: T) => boolean
}

export interface SelectionModalProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  items: T[]
  getItemId: (item: T) => string
  renderCard: (item: T, isSelected: boolean, canSelect: boolean) => ReactNode
  matchItem: (item: T, search: string, activeFilters: ActiveFilters) => boolean
  filterSections?: FilterSection[]
  categories?: CategoryLimit<T>[]
  canSelect?: (item: T, selectedIds: Set<string>, allItems: T[]) => boolean
  swapOnLimit?: boolean
  initialSelectedIds?: string[]
  initialFilters?: ActiveFilters
  onConfirm: (selectedIds: string[], selectedItems: T[]) => void
}

function buildInitialFilters(sections: FilterSection[]): ActiveFilters {
  return Object.fromEntries(sections.map((s) => [s.key, new Set<string>()]))
}

function defaultCanSelect<T>(
  item: T,
  selectedIds: Set<string>,
  allItems: T[],
  getItemId: (item: T) => string,
  categories: CategoryLimit<T>[],
): boolean {
  for (const cat of categories) {
    if (cat.max === Number.POSITIVE_INFINITY || !cat.test(item)) continue
    const count = allItems.filter((i) => cat.test(i) && selectedIds.has(getItemId(i))).length
    if (count >= cat.max) return false
  }
  return true
}

function SelectionModalInner<T>({
  title,
  items,
  getItemId,
  renderCard,
  matchItem,
  filterSections = [],
  categories = [],
  canSelect,
  swapOnLimit = false,
  initialSelectedIds = [],
  initialFilters,
  onConfirm,
  onClose,
}: Omit<SelectionModalProps<T>, 'open' | 'onOpenChange'> & {
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(filterSections.length > 0)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => {
    const base = buildInitialFilters(filterSections)
    if (!initialFilters) return base
    return { ...base, ...initialFilters }
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelectedIds))
  const scrollParentRef = useRef<HTMLDivElement>(null)

  const resetScroll = useCallback(() => {
    if (scrollParentRef.current) scrollParentRef.current.scrollTop = 0
  }, [])

  const filteredItems = useMemo(
    () => items.filter((item) => matchItem(item, search, activeFilters)),
    [items, search, activeFilters, matchItem],
  )

  const getVirtualItemKey = useCallback(
    (index: number) => getItemId(filteredItems[index]),
    [filteredItems, getItemId],
  )
  const getScrollElement = useCallback(() => scrollParentRef.current, [])
  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    estimateSize: estimateModalRowSize,
    getItemKey: getVirtualItemKey,
    getScrollElement,
    initialRect: MODAL_LIST_INITIAL_RECT,
    overscan: 4,
  })

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(getItemId(item))),
    [items, selectedIds, getItemId],
  )

  const categoryCounts = useMemo(
    () =>
      categories.map((cat) => ({
        ...cat,
        selected: selectedItems.filter((i) => cat.test(i)).length,
      })),
    [categories, selectedItems],
  )

  const checkCanSelect = useCallback(
    (item: T): boolean => {
      if (canSelect) return canSelect(item, selectedIds, items)
      return defaultCanSelect(item, selectedIds, items, getItemId, categories)
    },
    [canSelect, selectedIds, items, getItemId, categories],
  )

  const toggleItem = useCallback(
    (item: T) => {
      const id = getItemId(item)
      const alreadySelected = selectedIds.has(id)
      if (!alreadySelected && !checkCanSelect(item)) {
        if (swapOnLimit) {
          setSelectedIds((prev) => {
            const next = new Set(prev)
            for (const sid of next) {
              next.delete(sid)
              break
            }
            next.add(id)
            return next
          })
          return
        }
        toast.warning('Selection limit reached for this category.')
        return
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [getItemId, selectedIds, checkCanSelect, swapOnLimit],
  )

  const handleCheckbox = useCallback(
    (sectionKey: string, optionValue: string, checked: boolean) => {
      resetScroll()
      setActiveFilters((prev) => {
        const next = { ...prev, [sectionKey]: new Set(prev[sectionKey]) }
        if (checked) next[sectionKey].add(optionValue)
        else next[sectionKey].delete(optionValue)
        return next
      })
    },
    [resetScroll],
  )

  const handleSwitch = useCallback(
    (sectionKey: string, optionValue: string, enabled: boolean) => {
      resetScroll()
      setActiveFilters((prev) => {
        const next = { ...prev, [sectionKey]: new Set(prev[sectionKey]) }
        if (enabled) next[sectionKey].add(optionValue)
        else next[sectionKey].delete(optionValue)
        return next
      })
    },
    [resetScroll],
  )

  const clearSearch = () => {
    setSearch('')
    resetScroll()
  }

  const handleConfirm = () => {
    onConfirm([...selectedIds], selectedItems)
    onClose()
  }

  const allAccordionKeys = filterSections.map((s) => s.key)

  const sidebar = (
    <Accordion type="multiple" defaultValue={allAccordionKeys} className="w-full">
      {filterSections.map((section) => (
        <AccordionItem
          key={section.key}
          value={section.key}
          className="border-b border-border/50 last:border-b-0"
        >
          <AccordionTrigger className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:no-underline hover:text-foreground">
            {section.label}
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-3 pt-0">
            {section.type === 'checkboxes' && (
              <div
                className={cn(
                  'grid gap-y-2 gap-x-1',
                  section.columns === 1 ? 'grid-cols-1' : 'grid-cols-2',
                )}
              >
                {section.options.map((opt) => {
                  const checked = activeFilters[section.key]?.has(opt.value) ?? false
                  const disabled = section.disabledValues?.has(opt.value) ?? false
                  const filterId = `sm-filter-${section.key}-${opt.value}`
                  return (
                    <div
                      key={opt.value}
                      className={cn(
                        'flex items-center gap-1.5',
                        disabled && 'opacity-35 cursor-not-allowed',
                      )}
                    >
                      <Checkbox
                        id={filterId}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(c) => handleCheckbox(section.key, opt.value, !!c)}
                        className="h-4 w-4 rounded-sm"
                      />
                      <Label
                        htmlFor={filterId}
                        className={cn(
                          'text-sm font-normal leading-none',
                          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                        )}
                      >
                        {opt.label}
                      </Label>
                    </div>
                  )
                })}
              </div>
            )}
            {section.type === 'switches' && (
              <div className="space-y-2">
                {section.options.map((opt) => {
                  const enabled = activeFilters[section.key]?.has(opt.value) ?? false
                  const switchId = `sm-switch-${section.key}-${opt.value}`
                  return (
                    <div key={opt.value} className="flex items-center gap-2">
                      <Switch
                        id={switchId}
                        checked={enabled}
                        onCheckedChange={(c) => handleSwitch(section.key, opt.value, c)}
                      />
                      <Label htmlFor={switchId} className="text-sm font-normal cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                  )
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )

  const statusText =
    selectedItems.length === 0
      ? 'No selections'
      : selectedItems
          .slice(0, 5)
          .map((i) => {
            if (typeof i === 'object' && i !== null && 'name' in i) {
              const maybeName = (i as { name?: unknown }).name
              if (typeof maybeName === 'string') return maybeName
            }
            return getItemId(i)
          })
          .join(', ') + (selectedItems.length > 5 ? `, +${selectedItems.length - 5} more` : '')

  return (
    <>
      <DialogHeader className="flex-shrink-0 gap-3 border-b border-border bg-surface-raised px-5 py-4 pr-12">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <DialogTitle className="truncate text-lg leading-tight">{title}</DialogTitle>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {filteredItems.length.toLocaleString()} results
          </span>
        </div>
        <DialogDescription className="sr-only">
          Browse and select items. Use the search and filters to narrow results.
        </DialogDescription>
        <div className="flex items-center gap-2">
          {filterSections.length > 0 && (
            <Button
              type="button"
              variant={sidebarOpen ? 'secondary' : 'outline'}
              size="sm"
              className="size-9 shrink-0 p-0"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Hide filters' : 'Show filters'}
              aria-expanded={sidebarOpen}
            >
              <Funnel className="size-4" weight={sidebarOpen ? 'fill' : 'regular'} />
            </Button>
          )}
          <div className="relative flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={`Search ${title.toLowerCase()}`}
              placeholder="Search available options"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetScroll()
              }}
              className="h-9 bg-workspace-pane pl-9 pr-16 text-sm shadow-none"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden bg-workspace-detail">
        {filterSections.length > 0 && (
          <div
            className="flex-shrink-0 overflow-y-auto border-r border-border bg-workspace-pane transition-[width,opacity] duration-200 ease-out"
            style={{
              width: sidebarOpen ? '15rem' : 0,
              opacity: sidebarOpen ? 1 : 0,
              pointerEvents: sidebarOpen ? undefined : 'none',
            }}
          >
            {sidebar}
          </div>
        )}
        <div ref={scrollParentRef} className="min-w-0 flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">
              No results match your filters.
            </p>
          ) : (
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
              data-selection-list-size={filteredItems.length}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = filteredItems[virtualRow.index]
                const id = getItemId(item)
                const isSelected = selectedIds.has(id)
                const canSel = isSelected || checkCanSelect(item) || swapOnLimit
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 w-full px-3 py-1"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleItem(item)}
                      disabled={!isSelected && !canSel}
                      className={cn(
                        'w-full text-left rounded-md border bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected
                          ? 'border-primary/60 bg-primary/10'
                          : canSel
                            ? 'cursor-pointer border-border-subtle hover:border-border-strong hover:bg-surface-hover'
                            : 'cursor-not-allowed border-border-subtle opacity-40',
                      )}
                    >
                      {renderCard(item, isSelected, canSel)}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-border bg-surface-raised px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Selected</span>
            {categoryCounts.length > 0 ? (
              categoryCounts.map((cat) => {
                const full = cat.max !== Number.POSITIVE_INFINITY && cat.selected >= cat.max
                return (
                  <Badge
                    key={cat.key}
                    variant={full ? 'default' : 'secondary'}
                    className={cn('h-6 px-2 text-xs tabular-nums', full && 'bg-primary')}
                  >
                    {cat.selected}/{cat.max === Number.POSITIVE_INFINITY ? '∞' : cat.max}{' '}
                    {cat.label}
                  </Badge>
                )
              })
            ) : (
              <Badge variant="secondary" className="h-6 px-2 text-xs tabular-nums">
                {selectedIds.size}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate leading-none mt-1">{statusText}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </div>
      </div>
    </>
  )
}

export function SelectionModal<T>(props: SelectionModalProps<T>) {
  const { open, onOpenChange, ...rest } = props

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,56rem)] w-full flex-col gap-0 overflow-hidden border-border bg-workspace-detail p-0 sm:max-w-5xl">
        <SelectionModalInner key={String(open)} {...rest} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
