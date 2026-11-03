import { toast } from 'sonner'
import { GenericEquipmentSelect } from '@/components/character/GenericEquipmentSelect'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type BackgroundStartingPackage,
  formatEquipmentOptionEntries,
  type ResolvedEquipmentBlock,
} from '@/lib/5etools/startingEquipment'
import type { StartingEquipmentItemChoices, StartingItemReference } from '@/types/character'

interface StartingEquipmentBlocksProps {
  blocks: readonly ResolvedEquipmentBlock[]
  choices: readonly string[]
  itemChoices: Readonly<StartingEquipmentItemChoices>
  label: string
  onBlockChange: (block: number, option: string) => void
  onItemChange: (block: number, option: string, key: string, items: StartingItemReference[]) => void
  needsApplication?: boolean
  onApply?: () => void
}

export function StartingEquipmentBlocks({
  blocks,
  choices,
  itemChoices,
  label,
  onBlockChange,
  onItemChange,
  needsApplication,
  onApply,
}: StartingEquipmentBlocksProps) {
  const contents = (block: number, option: string, pkg: BackgroundStartingPackage) => (
    <>
      <ul className="space-y-1 text-xs text-foreground">
        {pkg.items.map((item) => (
          <li key={JSON.stringify([item.name, item.source ?? null])} className="flex gap-2">
            <span aria-hidden="true" className="text-muted-foreground">
              •
            </span>
            <span>
              {item.quantity > 1 ? `${item.quantity}× ` : ''}
              {item.name}
              {item.source ? ` (${item.source})` : ''}
            </span>
          </li>
        ))}
        {formatEquipmentOptionEntries({ ...pkg, items: [], genericChoices: [] }).map((entry) => (
          <li key={`currency:${entry}`} className="flex gap-2">
            <span aria-hidden="true" className="text-muted-foreground">
              •
            </span>
            <span>{entry}</span>
          </li>
        ))}
      </ul>
      {pkg.genericChoices?.map((choice) => (
        <GenericEquipmentSelect
          key={choice.key}
          choice={choice}
          value={itemChoices[choice.key] ?? []}
          ariaLabel={`${label} choice ${block + 1} specific items`}
          onChange={(items) => onItemChange(block, option, choice.key, items)}
        />
      ))}
    </>
  )
  return (
    <div className="space-y-4">
      {needsApplication && onApply && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            try {
              onApply()
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : 'The package could not be applied.',
              )
            }
          }}
        >
          Apply current package
        </Button>
      )}
      {blocks.map((block) => {
        if (block.isFixed)
          return (
            <div key={block.index} className="space-y-1">
              {contents(block.index, '_', block.options._)}
            </div>
          )
        const selected = choices[block.index]?.toLowerCase()
        const current =
          selected && block.choiceKeys.includes(selected) ? selected : block.choiceKeys[0]
        return (
          <Tabs
            key={block.index}
            value={current}
            activationMode="manual"
            onValueChange={(value) => {
              try {
                onBlockChange(block.index, value)
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : 'The package could not be applied.',
                )
              }
            }}
          >
            <TabsList
              aria-label={`${label} choice ${block.index + 1}`}
              className="max-w-full overflow-x-auto"
            >
              {block.choiceKeys.map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  Package {key.toUpperCase()}
                </TabsTrigger>
              ))}
            </TabsList>
            {block.choiceKeys.map((key) => (
              <TabsContent key={key} value={key} className="space-y-2 pt-1">
                {contents(block.index, key, block.options[key])}
              </TabsContent>
            ))}
          </Tabs>
        )
      })}
    </div>
  )
}
