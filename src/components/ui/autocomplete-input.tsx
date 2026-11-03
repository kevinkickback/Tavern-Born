import * as Popover from '@radix-ui/react-popover'
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down'
import { type ComponentProps, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from './input'

type Option = { value: string; label?: string }
const keyOf = (option: Option) => JSON.stringify([option.value, option.label])

/** Editable combobox with a portalled, viewport-bounded suggestion list. */
export function AutocompleteInput({
  options,
  value,
  onValueChange,
  suggestionsLabel,
  onFocus,
  onClick,
  onKeyDown,
  className,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Input>, 'onChange' | 'value' | 'defaultValue' | 'list'> & {
  options: readonly Option[]
  value: string
  onValueChange: (value: string) => void
  suggestionsLabel: string
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(true)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const query = value.trim().toLocaleLowerCase()
  const visible = options.filter(
    (option) =>
      showAll || `${option.value} ${option.label ?? ''}`.toLocaleLowerCase().includes(query),
  )
  const activeIndex = visible.findIndex((option) => keyOf(option) === activeKey)
  const optionId = (index: number) => `${listId}-${index}`
  const expanded = open && !disabled
  useEffect(() => {
    if (expanded && activeIndex >= 0)
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, activeIndex, listId])
  const choose = (option: Option) => {
    onValueChange(option.value)
    setOpen(false)
    setActiveKey(null)
  }
  return (
    <Popover.Root open={expanded} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div ref={anchorRef} className="relative">
          <Input
            {...props}
            ref={inputRef}
            value={value}
            disabled={disabled}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            autoComplete="off"
            className={cn('pr-9', className)}
            onFocus={(event) => {
              setShowAll(true)
              setOpen(true)
              setActiveKey(null)
              onFocus?.(event)
            }}
            onClick={(event) => {
              setOpen(true)
              onClick?.(event)
            }}
            onChange={(event) => {
              onValueChange(event.target.value)
              setShowAll(false)
              setActiveKey(null)
              setOpen(true)
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event)
              if (event.defaultPrevented || event.nativeEvent.isComposing) return
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setOpen(true)
                if (!visible.length) return
                const next =
                  event.key === 'ArrowDown'
                    ? (activeIndex + 1) % visible.length
                    : (activeIndex <= 0 ? visible.length : activeIndex) - 1
                setActiveKey(keyOf(visible[next]))
              } else if (event.key === 'Enter' && expanded && activeIndex >= 0) {
                event.preventDefault()
                choose(visible[activeIndex])
              } else if (event.key === 'Escape' && expanded) {
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
              } else if (event.key === 'Tab') setOpen(false)
            }}
          />
          <Popover.Trigger asChild>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Show ${suggestionsLabel.toLowerCase()}`}
              aria-haspopup="listbox"
              aria-controls={expanded ? listId : undefined}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground disabled:opacity-50"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setShowAll(true)
                setActiveKey(null)
              }}
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </Popover.Trigger>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          id={listId}
          role="listbox"
          aria-label={suggestionsLabel}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[60] max-h-[min(15rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && anchorRef.current?.contains(event.target))
              event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            setOpen(false)
          }}
        >
          {visible.length ? (
            visible.map((option, index) => (
              <button
                type="button"
                id={optionId(index)}
                key={keyOf(option)}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                className={cn(
                  'block w-full cursor-default rounded-sm px-2 py-1.5 text-left text-sm',
                  index === activeIndex && 'bg-accent text-accent-foreground',
                )}
                onPointerMove={() => setActiveKey(keyOf(option))}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label ?? option.value}
              </button>
            ))
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground" role="status">
              No suggestions found
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
