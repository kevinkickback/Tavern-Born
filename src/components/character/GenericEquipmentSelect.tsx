import { useMemo, useRef, useState } from 'react'
import { ItemCard } from '@/components/modals/ItemSelectionModal'
import { SelectionModal } from '@/components/modals/SelectionModal'
import { Button } from '@/components/ui/button'
import { useItemLookup, useItemTextContext } from '@/hooks/data/useGameData'
import type { GenericEquipmentChoice } from '@/lib/5etools/startingEquipment'
import { startingItemKey } from '@/lib/5etools/startingEquipmentPolicy'
import type { StartingItemReference } from '@/types/character'

// Presentation labels do not participate in eligibility or source matching.
const choiceLabels: Readonly<Record<string, string>> = {
  weaponsimple: 'Simple weapons',
  weaponsimplemelee: 'Simple melee weapons',
  weaponmartial: 'Martial weapons',
  weaponmartialmelee: 'Martial melee weapons',
  instrumentmusical: 'Musical instruments',
  toolartisan: 'Artisan’s tools',
  setgaming: 'Gaming sets',
  focusspellcastingarcane: 'Arcane focus',
  focusspellcastingholy: 'Holy symbol',
  focusspellcastingdruidic: 'Druidic focus',
}

export interface GenericEquipmentSelectProps {
  choice: GenericEquipmentChoice
  value: readonly StartingItemReference[]
  onChange: (items: StartingItemReference[]) => void
  ariaLabel?: string
}

export function GenericEquipmentSelect({
  choice,
  value,
  onChange,
  ariaLabel = 'Choose a specific item',
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
  const typeLabel =
    choiceLabels[choice.token.toLowerCase()] ?? choice.token.replace(/([a-z])([A-Z])/g, '$1 $2')
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{typeLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {value.length} / {choice.quantity} selected
          </p>
        </div>
        <Button
          type="button"
          variant={value.length ? 'outline' : 'default'}
          size="sm"
          aria-label={ariaLabel}
          className="h-7 shrink-0 text-xs"
          onClick={() => {
            confirmation.current = onChange
            setOpen(true)
          }}
        >
          {value.length ? 'Edit' : 'Choose'}
        </Button>
      </div>
      {unavailable.size > 0 && (
        <p className="text-xs text-muted-foreground">
          Unavailable: {[...unavailable.values()].join(', ')}
        </p>
      )}
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
          <ItemCard item={item} isSelected={selected} textContext={textContext} fullDescription />
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
