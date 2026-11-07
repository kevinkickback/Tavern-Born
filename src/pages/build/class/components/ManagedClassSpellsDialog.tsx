import { Check } from '@phosphor-icons/react'
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
import { getSavantSpellbookGain } from '@/lib/5etools/savantSpellbookRules'
import {
  formatSpellReference,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { formatSpellLevel, getOrdinalForm, getSchoolName } from '@/lib/calculations/spellUtils'
import {
  type ManagedClassSpellRequest,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import {
  getManagedClassSpellFeatureLabel,
  managedClassSpellId,
  managedClassSpellUniquenessGroup,
} from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  type ManagedClassSpellContext,
  type ManagedClassSpellStatus,
} from '@/lib/character/managedClassSpells'
import { getSelectedFeatureCantripSetups } from '@/lib/character/selectedFeatureSpells'
import { cn } from '@/lib/utils'
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

const targetKey = (target?: ManagedClassSpellChoice['target']) =>
  target && getSpellReferenceKey(target.name, target.source)

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
    getManagedClassSpellSlots(entry, character, context?.catalogs, {
      effectiveAbilityScores: context?.abilityScores,
      effectiveSpellProfiles: context?.independentSpellProfiles,
    })
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
  const [picker, setPicker] = useState<{ index: number; draftBook?: Character } | null>(null)
  const featureNames = useMemo(
    () =>
      new Map(
        getSelectedFeatureCantripSetups(character, context?.catalogs, {
          effectiveAbilityScores: context?.abilityScores,
          effectiveSpellProfiles: context?.independentSpellProfiles,
        }).map((setup) => [setup.producer, setup.name]),
      ),
    [character, context],
  )
  const selected = picker && rows[picker.index]
  const isBookSpecialty = selected?.slot[1] === 'class-spellbook-specialty'
  const savantGain = selected ? getSavantSpellbookGain(selected.slot) : undefined
  const allowClassListBypass =
    !isBookSpecialty && !savantGain && selected?.slot[1] !== 'feature-cantrip'
  const pickerKind =
    (selected &&
      (isBookSpecialty || savantGain) &&
      getManagedClassSpellFeatureLabel(selected.slot)) ||
    (selected?.slot[1] === 'class-cantrip' || selected?.slot[1] === 'feature-cantrip'
      ? 'cantrip'
      : 'spell')
  const draftBook = picker?.draftBook
  const pool = useMemo(
    () => selected && getManagedClassSpellPool(draftBook ?? character, selected.slot, context),
    [character, selected, context, draftBook],
  )
  const savantHint =
    savantGain && pool?.schools
      ? `Add an ${pool.schools.map(getSchoolName).join(' or ')} spell of up to ${getOrdinalForm(savantGain.tier)} level to your Wizard spellbook.`
      : undefined
  const scoped = new Set(rows.map((row) => managedClassSpellId(row.slot)))
  const peers = new Set([
    ...(opening.managedClassSpellChoices ?? [])
      .filter(
        (choice) =>
          !scoped.has(managedClassSpellId(choice.slot)) &&
          choice.slot[0][1] === rows[0]?.slot[0][1] &&
          choice.slot[0][2] === rows[0]?.slot[0][2] &&
          (!selected ||
            managedClassSpellUniquenessGroup(choice.slot) ===
              managedClassSpellUniquenessGroup(selected.slot)),
      )
      .map((choice) => choice.target.name),
    ...rows.flatMap((row, index) =>
      index !== picker?.index &&
      row.target &&
      (!selected ||
        managedClassSpellUniquenessGroup(row.slot) ===
          managedClassSpellUniquenessGroup(selected.slot))
        ? [row.target.name]
        : [],
    ),
  ])
  const update = (
    index: number,
    patch: {
      target?: ManagedClassSpellChoice['target']
      policy?: ClassSpellSelectionPolicy
      prepare?: boolean
    },
  ) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  const getRequest = (row: (typeof rows)[number]): ManagedClassSpellRequest => ({
    slot: row.slot,
    expected: row.old ?? null,
    expectedEmptyRevision: opening.managedClassSpellRevision ?? 0,
    target: row.target,
    policy: row.policy,
    ...(row.slot[1] === 'class-spellbook' ? { prepare: row.prepare } : {}),
  })
  const openPicker = (index: number) => {
    if (rows[index].slot[1] !== 'class-spellbook-specialty') {
      setPicker({ index })
      return
    }
    const bookEdits = rows
      .filter(
        (row) =>
          row.slot[1] === 'class-spellbook' &&
          (targetKey(row.target) !== targetKey(row.old?.target) ||
            (row.target && row.policy !== (row.old?.policy ?? 'default'))),
      )
      .map((row) => ({ ...getRequest(row), prepare: false }))
    if (!bookEdits.length) {
      setPicker({ index })
      return
    }
    try {
      // Preview eligible learned entries independently of draft daily preparation.
      const preview = setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        bookEdits,
        context,
      )
      setPicker({
        index,
        draftBook: {
          ...character,
          ...preview.characterPatch,
          provenance: preview.provenanceUpdate,
        },
      })
    } catch (error) {
      toast.error('Review the draft spellbook choices first.', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }
  const confirm = () => {
    try {
      finish(rows.map(getRequest))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The spell choices could not be saved.')
    }
  }
  const allowedLevels = new Set(
    pool?.allowedLevels?.map(String) ?? (selected?.slot[1] === 'feature-cantrip' ? ['0'] : []),
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
              const unavailable =
                status &&
                !status.active &&
                row.old &&
                row.target &&
                status.choice.revision === row.old.revision &&
                targetKey(status.choice.target) === targetKey(row.target) &&
                status.choice.policy === row.policy
              const chosen = !!row.target && !unavailable
              const featureLabel = getManagedClassSpellFeatureLabel(row.slot)
              const kind =
                row.slot[1] === 'class-arcanum'
                  ? 'Mystic Arcanum'
                  : row.slot[1] === 'class-cantrip' || row.slot[1] === 'feature-cantrip'
                    ? 'Cantrip'
                    : (featureLabel ?? 'Spell')
              return (
                <fieldset
                  key={managedClassSpellId(row.slot)}
                  className={cn('rounded-lg border p-3', chosen && 'border-success/60')}
                  aria-label={`${kind} ${row.slot[4] + 1}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {featureNames.get(row.slot[2]) ?? featureLabel ?? kind} {row.slot[4] + 1}
                      </p>
                      <p className="font-medium">
                        {row.target ? `${row.target.name} (${row.target.source})` : 'Not chosen'}
                      </p>
                      {chosen && (
                        <p className="flex items-center gap-1 text-xs font-medium text-success">
                          <Check className="size-3" weight="bold" aria-hidden />
                          Chosen
                        </p>
                      )}
                      {unavailable && (
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
                      <Button size="sm" variant="outline" onClick={() => openPicker(index)}>
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
      {picker && selected && pool && (
        <SpellSelectionModal
          open
          onOpenChange={(open) => {
            if (!open) setPicker(null)
          }}
          title={`Choose ${pickerKind} ${selected.slot[4] + 1}`}
          spells={pool.spells}
          className={entry.name}
          classSource={entry.source}
          classListReferences={pool.defaultReferences}
          allowClassListBypass={allowClassListBypass}
          allowedSpellReferences={
            new Set(pool.spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)))
          }
          allowedLevels={allowedLevels}
          initialFilters={{
            visibility: new Set(
              allowClassListBypass && selected.policy === 'ignore-class-list'
                ? ['ignore-class-list']
                : [],
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
            savantHint ??
            (isBookSpecialty
              ? `Choose a ${pool.allowedLevels?.map(formatSpellLevel).join(' or ')} spell from your Wizard spellbook.`
              : pool.schools && !pool.privileged && selected.slot[1] !== 'class-cantrip'
                ? `Allowed schools: ${pool.schools.map(getSchoolName).join(', ')}.`
                : pool.privileged
                  ? 'This choice allows any school.'
                  : 'Choose one spell.')
          }
          onConfirm={(references, policy) => {
            const reference = references[0] ? parseSpellReference(references[0]) : undefined
            update(picker.index, {
              target: reference?.source
                ? { name: reference.name, source: reference.source }
                : undefined,
              policy: allowClassListBypass ? policy : 'default',
            })
            setPicker(null)
          }}
        />
      )}
    </>
  )
}
