import { useMemo, useRef, useState } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import { ItemCard } from '@/components/modals/ItemSelectionModal'
import { SelectionModal } from '@/components/modals/SelectionModal'
import { Button } from '@/components/ui/button'
import { useItemLookup, useItemTextContext } from '@/hooks/data/useGameData'
import { iterateItemRulesEntries } from '@/lib/5etools/itemTypeEntries'
import type { GenericEquipmentChoice } from '@/lib/5etools/startingEquipment'
import { startingItemKey } from '@/lib/5etools/startingEquipmentPolicy'
import { cn } from '@/lib/utils'
import type { StartingItemReference } from '@/types/character'

export interface GenericEquipmentSelectProps {
  choice: GenericEquipmentChoice
  value: readonly StartingItemReference[]
  onChange: (items: StartingItemReference[]) => void
  ariaLabel?: string
  triggerClassName?: string
}

export function GenericEquipmentSelect({
  choice,
  value,
  onChange,
  ariaLabel = 'Choose a specific item',
  triggerClassName,
}: GenericEquipmentSelectProps) {
  const [open, setOpen] = useState(false)
  const confirmation = useRef(onChange)
  const lookup = useItemLookup()
  const textContext = useItemTextContext()
  const items = useMemo(
    () =>
      choice.candidates.flatMap((ref) => {
        const item = lookup.get(
          `${ref.name.trim().toLowerCase()}|${ref.source?.trim().toLowerCase()}`,
        )
        return item ? [item] : []
      }),
    [choice, lookup],
  )
  const initialQuantities = Object.fromEntries(
    value.map((ref) => [
      startingItemKey(ref),
      value.filter((other) => startingItemKey(other) === startingItemKey(ref)).length,
    ]),
  )
  const unavailable = new Map(
    value
      .filter((ref) => !items.some((item) => startingItemKey(item) === startingItemKey(ref)))
      .map((ref) => [startingItemKey(ref), `${ref.name} (${ref.source})`]),
  )
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label={ariaLabel}
        className={cn(
          'mt-2 h-auto min-h-8 w-full justify-start whitespace-normal text-left text-xs',
          triggerClassName,
        )}
        onClick={() => {
          confirmation.current = onChange
          setOpen(true)
        }}
      >
        {value.length
          ? `${value.map((ref) => `${ref.name} (${ref.source})`).join(', ')} — Change`
          : `Choose ${choice.quantity} ${choice.token.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} item${choice.quantity === 1 ? '' : 's'}…`}
      </Button>
      {choice.diagnostic && (
        <p className="mt-1 text-xs text-muted-foreground">{choice.diagnostic}</p>
      )}
      <SelectionModal
        open={open}
        onOpenChange={setOpen}
        title="Starting items"
        items={items}
        getItemId={startingItemKey}
        getItemLabel={(item) => `${item.name} (${item.source})`}
        renderCard={(item, selected) => (
          <ItemCard item={item} isSelected={selected} textContext={textContext} />
        )}
        matchItem={(item, search) =>
          `${item.name} ${item.source}`.toLowerCase().includes(search.toLowerCase())
        }
        initialSelectedIds={value.map(startingItemKey)}
        quantitySelection={{ max: choice.quantity, initialQuantities }}
        unavailableSelectionLabels={unavailable}
        countUnavailableSelections
        categories={[{ key: 'starting', label: 'items', max: choice.quantity, test: () => true }]}
        swapOnLimit={choice.quantity === 1}
        selectionHint="Only items allowed by this starting choice are shown."
        getConfirmationError={(ids) =>
          [...ids].some((id) => !items.some((item) => startingItemKey(item) === id))
            ? 'Replace unavailable starting items before confirming.'
            : undefined
        }
        renderSelectionDetails={(selected) =>
          selected.map((item) => (
            <details
              key={startingItemKey(item)}
              className="mt-2 border-t border-border pt-2 text-xs"
            >
              <summary className="cursor-pointer font-medium">{item.name} rules</summary>
              <GameContent
                entry={[...iterateItemRulesEntries(item, textContext)]}
                className="mt-2 text-xs"
              />
            </details>
          ))
        }
        onConfirm={(_, selected, __, counts) =>
          confirmation.current(
            selected.flatMap((item) =>
              Array.from({ length: counts?.[startingItemKey(item)] ?? 1 }, () => ({
                name: item.name,
                source: item.source,
              })),
            ),
          )
        }
      />
    </>
  )
}
