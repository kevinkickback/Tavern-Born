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
import { getBardLoreSpellRule } from '@/lib/5etools/bardSpellSources'
import { getClassicSorcererReplacementRule } from '@/lib/5etools/classicSorcererBonusSpells'
import { getClericArcanaSpellRule } from '@/lib/5etools/clericArcanaSpells'
import { getSavantSpellbookGain } from '@/lib/5etools/savantSpellbookRules'
import { isSelectedInvocationRitualSlot } from '@/lib/5etools/selectedFeatureSpellIdentity'
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
  projectManagedClassSpellState,
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
  const bonusSpellId = useId()
  const [finish] = useState(() => onFinish)
  const [draft, setDraft] = useState(() => {
    const rows = getManagedClassSpellSlots(entry, character, context?.catalogs, {
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
      })
    return {
      rows,
      specialtySlots: rows
        .map((row) => row.slot)
        .filter((slot) => slot[1] === 'class-spellbook-specialty'),
      bookEdits: [] as ManagedClassSpellRequest[],
    }
  })
  const { rows, specialtySlots, bookEdits } = draft
  const [replacementOrdinal, setReplacementOrdinal] = useState(
    () => rows.find((row) => row.slot[1] === 'subclass-spell-replacement' && row.old)?.slot[4],
  )
  const replacementOptions = rows.flatMap((row) => {
    const rule = getClassicSorcererReplacementRule(row.slot)
    if (!rule) return []
    const prior = statuses
      .filter(
        ({ choice, active }) =>
          active &&
          choice.slot[1] === 'subclass-spell-replacement' &&
          choice.slot[2] === row.slot[2] &&
          choice.slot[3] < row.slot[3] &&
          choice.slot[4] === row.slot[4],
      )
      .sort((a, b) => b.choice.slot[3] - a.choice.slot[3])[0]
    const original = Object.values(context?.spellsByKey ?? {}).find(
      (spell) => getSpellReferenceKey(spell.name, spell.source) === rule.original,
    )
    const label =
      prior?.choice.target.name ?? original?.name ?? parseSpellReference(rule.original).name
    return [{ ordinal: row.slot[4], name: label, feature: rule.name }]
  })
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)
  const getRequest = (row: (typeof rows)[number]): ManagedClassSpellRequest => ({
    slot: row.slot,
    expected: row.old ?? null,
    expectedEmptyRevision: opening.managedClassSpellRevision ?? 0,
    target: row.target,
    policy: row.policy,
    ...(row.slot[1] === 'class-spellbook' ? { prepare: row.prepare } : {}),
  })
  const bookPreview = useMemo(() => {
    if (!bookEdits.length) return
    try {
      // Preview eligible learned entries independently of draft daily preparation.
      const preview = setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        bookEdits,
        context,
      )
      const draft = {
        ...character,
        ...preview.characterPatch,
        provenance: preview.provenanceUpdate,
      }
      return { draft, statuses: projectManagedClassSpellState(draft, context).statuses }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Invalid draft spellbook choices.' }
    }
  }, [character, context, bookEdits])
  const specialtyPools = useMemo(
    () =>
      new Map(
        specialtySlots.map((slot) => [
          managedClassSpellId(slot),
          getManagedClassSpellPool(
            bookPreview?.draft ?? character,
            slot,
            context,
            bookPreview?.statuses ?? statuses,
          ),
        ]),
      ),
    [bookPreview, character, context, specialtySlots, statuses],
  )
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
  const selected = pickerIndex === null ? undefined : rows[pickerIndex]
  const isBookSpecialty = selected?.slot[1] === 'class-spellbook-specialty'
  const isBonusReplacement = selected?.slot[1] === 'subclass-spell-replacement'
  const savantGain = selected ? getSavantSpellbookGain(selected.slot) : undefined
  const selectedArcana = selected ? getClericArcanaSpellRule(selected.slot) : undefined
  const allowClassListBypass =
    !isBookSpecialty &&
    !isBonusReplacement &&
    !savantGain &&
    selected?.slot[1] !== 'feature-cantrip' &&
    selected?.slot[1] !== 'feature-prepared' &&
    !selectedArcana &&
    !(selected && getBardLoreSpellRule(selected.slot))
  const pickerKind =
    selected && isSelectedInvocationRitualSlot(selected.slot)
      ? 'ritual spell'
      : (selected &&
          (isBookSpecialty ||
            isBonusReplacement ||
            savantGain ||
            selected.slot[1] === 'feature-prepared') &&
          getManagedClassSpellFeatureLabel(selected.slot)) ||
        (selected?.slot[1] === 'class-cantrip' || selected?.slot[1] === 'feature-cantrip'
          ? 'cantrip'
          : 'spell')
  const pool = useMemo(
    () =>
      selected &&
      (isBookSpecialty
        ? specialtyPools.get(managedClassSpellId(selected.slot))
        : getManagedClassSpellPool(character, selected.slot, context)),
    [character, selected, context, isBookSpecialty, specialtyPools],
  )
  const savantHint =
    savantGain && pool?.schools
      ? `Add one ${pool.schools.map(getSchoolName).join(' or ')} spell of up to ${getOrdinalForm(savantGain.tier)} level from the Wizard spell list to your spellbook.`
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
      index !== pickerIndex &&
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
  ) =>
    setDraft((current) => {
      const before = current.rows[index]
      const after = { ...before, ...patch }
      const nextRows = current.rows.map((row, at) => (at === index ? after : row))
      if (
        !specialtySlots.length ||
        after.slot[1] !== 'class-spellbook' ||
        (targetKey(before.target) === targetKey(after.target) && before.policy === after.policy)
      ) {
        return { ...current, rows: nextRows }
      }
      // Only learned-spell changes invalidate the preview, not specialty picks or preparation.
      const nextBookEdits = nextRows
        .filter(
          (row) =>
            row.slot[1] === 'class-spellbook' &&
            (targetKey(row.target) !== targetKey(row.old?.target) ||
              (row.target && row.policy !== (row.old?.policy ?? 'default'))),
        )
        .map((row) => ({ ...getRequest(row), prepare: false }))
      return { ...current, rows: nextRows, bookEdits: nextBookEdits }
    })
  const openPicker = (index: number) => {
    if (rows[index].slot[1] === 'class-spellbook-specialty' && bookPreview?.error) {
      toast.error('Review the draft spellbook choices first.', {
        description: bookPreview.error,
      })
      return
    }
    setPickerIndex(index)
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
      <Dialog open={pickerIndex === null} onOpenChange={onOpenChange}>
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
            {replacementOptions.length > 0 && (
              <div className="space-y-1 rounded-lg border p-3">
                <label className="block text-sm font-medium" htmlFor={bonusSpellId}>
                  {replacementOptions[0].feature} replacement
                </label>
                <select
                  id={bonusSpellId}
                  className="w-full rounded border bg-background p-2 text-sm"
                  value={replacementOrdinal ?? ''}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    const ordinal = value === '' ? undefined : Number(value)
                    setReplacementOrdinal(ordinal)
                    setDraft((current) => ({
                      ...current,
                      rows: current.rows.map((row) =>
                        row.slot[1] === 'subclass-spell-replacement' && row.slot[4] !== ordinal
                          ? { ...row, target: undefined }
                          : row,
                      ),
                    }))
                  }}
                >
                  <option value="">Keep current bonus spells</option>
                  {replacementOptions.map(({ ordinal, name }) => (
                    <option key={ordinal} value={ordinal}>
                      Replace {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {rows.map((row, index) => {
              const replacement = row.slot[1] === 'subclass-spell-replacement'
              if (replacement && row.slot[4] !== replacementOrdinal) return null
              const isSpecialty = row.slot[1] === 'class-spellbook-specialty'
              const specialtyPreview = isSpecialty ? bookPreview : undefined
              const slotId = managedClassSpellId(row.slot)
              const status = (specialtyPreview?.statuses ?? statuses).find(
                (item) => managedClassSpellId(item.choice.slot) === slotId,
              )
              const draftTarget = targetKey(row.target)
              const matchesSavedStatus =
                status &&
                row.old &&
                draftTarget &&
                status.choice.revision === row.old.revision &&
                targetKey(status.choice.target) === draftTarget &&
                status.choice.policy === row.policy
              const unavailable = matchesSavedStatus && !status?.active
              const lostInDraft =
                specialtyPreview?.draft &&
                unavailable &&
                statuses.some(
                  (item) => item.active && managedClassSpellId(item.choice.slot) === slotId,
                )
              const missingFromDraftBook =
                isSpecialty &&
                draftTarget &&
                (specialtyPreview?.error ||
                  ((!matchesSavedStatus || lostInDraft) &&
                    !specialtyPools.get(slotId)?.defaultReferences.has(draftTarget)))
              const chosen = !!row.target && !unavailable && !missingFromDraftBook
              const featureLabel = getManagedClassSpellFeatureLabel(row.slot)
              const arcana = getClericArcanaSpellRule(row.slot)
              const kind = isSelectedInvocationRitualSlot(row.slot)
                ? 'Ritual Spell'
                : row.slot[1] === 'class-arcanum'
                  ? 'Mystic Arcanum'
                  : row.slot[1] === 'class-cantrip' || row.slot[1] === 'feature-cantrip'
                    ? 'Cantrip'
                    : (featureLabel ?? 'Spell')
              const position = replacement
                ? ''
                : arcana
                  ? `Level ${arcana.rank}, choice ${row.slot[4] + 1}`
                  : row.slot[4] + 1
              return (
                <fieldset
                  key={managedClassSpellId(row.slot)}
                  className={cn('rounded-lg border p-3', chosen && 'border-success/60')}
                  aria-label={`${kind} ${position}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {featureNames.get(row.slot[2]) ?? featureLabel ?? kind} {position}
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
                      {missingFromDraftBook ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Restore this spell in the draft spellbook or change this choice.
                        </p>
                      ) : (
                        unavailable && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {status?.reason} The choice is saved until you change or clear it.
                          </p>
                        )
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
      {pickerIndex !== null && selected && pool && (
        <SpellSelectionModal
          open
          onOpenChange={(open) => {
            if (!open) setPickerIndex(null)
          }}
          title={
            isBonusReplacement
              ? 'Choose a replacement spell'
              : selectedArcana
                ? `Choose level ${selectedArcana.rank} spell ${selected.slot[4] + 1}`
                : `Choose ${pickerKind} ${selected.slot[4] + 1}`
          }
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
            update(pickerIndex, {
              target: reference?.source
                ? { name: reference.name, source: reference.source }
                : undefined,
              policy: allowClassListBypass ? policy : 'default',
            })
            setPickerIndex(null)
          }}
        />
      )}
    </>
  )
}
