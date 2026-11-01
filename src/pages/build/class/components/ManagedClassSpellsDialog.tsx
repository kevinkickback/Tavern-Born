import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  formatSpellReference,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { getSchoolName } from '@/lib/calculations/spellUtils'
import type { ManagedClassSpellRequest } from '@/lib/character/commands/managedClassSpellCommands'
import { managedClassSpellId } from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  type ManagedClassSpellContext,
  type ManagedClassSpellStatus,
} from '@/lib/character/managedClassSpells'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassSpellSelectionPolicy, ManagedClassSpellChoice } from '@/types/classCasting'

interface Props {
  character: Character
  entry: CharacterClassEntry
  level: number
  context?: ManagedClassSpellContext
  statuses: readonly ManagedClassSpellStatus[]
  onOpenChange: (open: boolean) => void
  onFinish: (requests: readonly ManagedClassSpellRequest[]) => void
}

export function ManagedClassSpellsDialog({
  character,
  entry,
  level,
  context,
  statuses,
  onOpenChange,
  onFinish,
}: Props) {
  // The opening snapshot owns expected lifetimes and the captured source adapter until Finish or Cancel.
  const [opening] = useState(() => character)
  const prepareId = useId()
  const [finish] = useState(() => onFinish)
  const [rows, setRows] = useState(() =>
    getManagedClassSpellSlots(entry)
      .filter((slot) => slot[3] === level)
      .map((slot) => {
        const old = character.managedClassSpellChoices?.find(
          (choice) => managedClassSpellId(choice.slot) === managedClassSpellId(slot),
        )
        return {
          slot,
          old,
          target: old?.target,
          policy: old?.policy ?? ('default' as ClassSpellSelectionPolicy),
          prepare: old?.prepare === true,
        }
      }),
  )
  const [picker, setPicker] = useState<number | null>(null)
  const selected = picker === null ? undefined : rows[picker]
  const pool = useMemo(
    () => selected && getManagedClassSpellPool(character, selected.slot, context),
    [character, selected, context],
  )
  const scoped = new Set(rows.map((row) => managedClassSpellId(row.slot)))
  const peers = new Set([
    ...(opening.managedClassSpellChoices ?? [])
      .filter(
        (choice) =>
          !scoped.has(managedClassSpellId(choice.slot)) &&
          choice.slot[0][1] === rows[0]?.slot[0][1] &&
          choice.slot[0][2] === rows[0]?.slot[0][2],
      )
      .map((choice) => choice.target.name),
    ...rows.flatMap((row, index) => (index !== picker && row.target ? [row.target.name] : [])),
  ])
  const update = (
    index: number,
    patch: {
      target?: ManagedClassSpellChoice['target']
      policy?: ClassSpellSelectionPolicy
      prepare?: boolean
    },
  ) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  const confirm = () => {
    try {
      finish(
        rows.map((row) => ({
          slot: row.slot,
          expected: row.old ?? null,
          expectedEmptyRevision: opening.managedClassSpellRevision ?? 0,
          target: row.target,
          policy: row.policy,
          ...(row.slot[1] === 'class-spellbook' ? { prepare: row.prepare } : {}),
        })),
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The spell choices could not be saved.')
    }
  }
  const allowedLevels = new Set(
    selected?.slot[1] === 'class-cantrip'
      ? ['0']
      : Array.from({ length: pool?.maxSpellLevel ?? 0 }, (_, index) => String(index + 1)),
  )
  return (
    <>
      <Dialog open={picker === null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {entry.name} spells at level {level}
            </DialogTitle>
            <DialogDescription>
              Choose each spell. Save these changes together with Finish.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {rows.map((row, index) => {
              const status = statuses.find(
                (item) => managedClassSpellId(item.choice.slot) === managedClassSpellId(row.slot),
              )
              const unchangedTarget =
                row.old &&
                row.target &&
                getSpellReferenceKey(row.old.target.name, row.old.target.source) ===
                  getSpellReferenceKey(row.target.name, row.target.source)
              const kind = row.slot[1] === 'class-cantrip' ? 'Cantrip' : 'Spell'
              return (
                <fieldset
                  key={managedClassSpellId(row.slot)}
                  className="rounded-lg border p-3"
                  aria-label={`${kind} ${row.slot[4] + 1}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {kind} {row.slot[4] + 1}
                      </p>
                      <p className="font-medium">
                        {row.target ? `${row.target.name} (${row.target.source})` : 'Not chosen'}
                      </p>
                      {unchangedTarget && status && !status.active && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {status.reason} The choice is saved until you change or clear it.
                        </p>
                      )}
                      {row.policy === 'ignore-class-list' && (
                        <p className="text-xs text-muted-foreground">
                          Class list restriction ignored
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPicker(index)}>
                        {row.target ? 'Change' : 'Choose'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!row.target}
                        onClick={() => update(index, { target: undefined, prepare: false })}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  {row.slot[1] === 'class-spellbook' && (
                    <label
                      htmlFor={`${prepareId}-${managedClassSpellId(row.slot)}`}
                      className="mt-3 flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={`${prepareId}-${managedClassSpellId(row.slot)}`}
                        checked={row.prepare}
                        disabled={!row.target}
                        onCheckedChange={(value) => update(index, { prepare: value === true })}
                      />
                      Prepare this spell
                    </label>
                  )}
                </fieldset>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={confirm}>Finish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {selected && pool && (
        <SpellSelectionModal
          open
          onOpenChange={(open) => {
            if (!open) setPicker(null)
          }}
          title={`Choose ${selected.slot[1] === 'class-cantrip' ? 'cantrip' : 'spell'} ${selected.slot[4] + 1}`}
          spells={pool.spells}
          className={entry.name}
          classSource={entry.source}
          classListReferences={pool.defaultReferences}
          allowedSpellReferences={
            new Set(pool.spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)))
          }
          allowedLevels={allowedLevels}
          initialFilters={{
            level: allowedLevels,
            visibility: new Set(
              selected.policy === 'ignore-class-list' ? ['ignore-class-list'] : [],
            ),
          }}
          initialSelectedNames={
            selected.target
              ? [formatSpellReference(selected.target.name, selected.target.source)]
              : []
          }
          characterSpellNames={peers}
          categories={[{ key: 'spell', label: 'spell', max: 1, test: () => true }]}
          selectionHint={
            pool.reason ??
            (pool.schools && !pool.privileged && selected.slot[1] !== 'class-cantrip'
              ? `Allowed schools: ${pool.schools.map(getSchoolName).join(', ')}.`
              : pool.privileged
                ? 'This choice allows any school.'
                : 'Choose one spell.')
          }
          onConfirm={(references, policy) => {
            const reference = references[0] ? parseSpellReference(references[0]) : undefined
            update(picker ?? 0, {
              target: reference?.source
                ? { name: reference.name, source: reference.source }
                : undefined,
              policy,
            })
            setPicker(null)
          }}
        />
      )}
    </>
  )
}
