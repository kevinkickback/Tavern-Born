import { Backpack } from '@phosphor-icons/react'
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
  const contents = (block: number, option: string, pkg: BackgroundStartingPackage) => {
    const currency = formatEquipmentOptionEntries({ ...pkg, items: [], genericChoices: [] })
    return (
      <div className="space-y-2.5">
        {pkg.fixedIssues?.map((issue) => (
          <p key={issue} className="text-xs text-muted-foreground">
            {issue}
          </p>
        ))}
        {pkg.genericChoices?.map((choice) => (
          <GenericEquipmentSelect
            key={choice.key}
            choice={choice}
            value={itemChoices[choice.key] ?? []}
            ariaLabel={`${label} choice ${block + 1} specific items`}
            onChange={(items) => onItemChange(block, option, choice.key, items)}
          />
        ))}
        {(pkg.items.length > 0 || currency.length > 0) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
            {pkg.items.map((item) => (
              <li
                key={JSON.stringify([item.name, item.source ?? null])}
                className="inline-flex max-w-full flex-wrap items-baseline gap-x-1"
              >
                <span className="font-medium break-words">
                  {item.quantity > 1 ? `${item.quantity}× ` : ''}
                  {item.name}
                </span>
                {item.source && <span className="text-muted-foreground">({item.source})</span>}
              </li>
            ))}
            {currency.map((entry) => (
              <li key={`currency:${entry}`} className="font-medium">
                {entry}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  const decisions = blocks.filter(
    (block) => !block.isFixed || block.options._.genericChoices?.length,
  )
  const included = blocks.filter(
    (block) => block.isFixed && !block.options._.genericChoices?.length,
  )
  return (
    <div className="space-y-2">
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
      {decisions.map((block) => {
        if (block.isFixed)
          return (
            <fieldset
              key={block.index}
              aria-label={`${label} choice ${block.index + 1} configuration`}
              className="min-w-0 space-y-2.5 overflow-hidden rounded-lg border border-teal-500/25 bg-teal-500/5 px-3 py-2.5"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Backpack
                  className="h-4 w-4 shrink-0 text-teal-600/80 dark:text-teal-400/70"
                  weight="duotone"
                />
                <span>Choice {block.index + 1}</span>
              </div>
              <div>{contents(block.index, '_', block.options._)}</div>
            </fieldset>
          )
        const selected = choices[block.index]?.toLowerCase()
        const current =
          selected && block.choiceKeys.includes(selected) ? selected : block.choiceKeys[0]
        return (
          <fieldset
            key={block.index}
            aria-label={`${label} choice ${block.index + 1} configuration`}
            className="min-w-0 overflow-hidden rounded-lg border border-teal-500/25 bg-teal-500/5 px-3 py-2.5"
          >
            <Tabs
              value={current}
              activationMode="manual"
              className="gap-2.5"
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Backpack
                    className="h-4 w-4 shrink-0 text-teal-600/80 dark:text-teal-400/70"
                    weight="duotone"
                  />
                  <span>Choice {block.index + 1}</span>
                </div>
                <TabsList
                  aria-label={`${label} choice ${block.index + 1}`}
                  className="h-7 max-w-full overflow-x-auto border-teal-600/25 bg-teal-950/10 dark:border-teal-400/20 dark:bg-teal-950/35"
                >
                  {block.choiceKeys.map((key) => (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="text-xs text-teal-900/65 hover:text-teal-950 focus-visible:border-teal-500/50 focus-visible:ring-teal-500/35 data-[state=active]:border-teal-600/35 data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-950 dark:text-teal-100/60 dark:hover:text-teal-50 dark:data-[state=active]:border-teal-400/35 dark:data-[state=active]:text-teal-50"
                    >
                      Package {key.toUpperCase()}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {block.choiceKeys.map((key) => (
                <TabsContent key={key} value={key} className="m-0">
                  {contents(block.index, key, block.options[key])}
                </TabsContent>
              ))}
            </Tabs>
          </fieldset>
        )
      })}
      {included.length > 0 && (
        <section aria-label={`${label} included equipment`} className="space-y-1.5 pt-2">
          <h4 className="text-xs font-medium text-muted-foreground">Included equipment</h4>
          {included.map((block) => (
            <div key={block.index}>{contents(block.index, '_', block.options._)}</div>
          ))}
        </section>
      )}
    </div>
  )
}
