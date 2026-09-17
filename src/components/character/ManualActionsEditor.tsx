import { Plus, Sword, Trash } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import {
  removeManualActionCommand,
  upsertManualActionCommand,
} from '@/lib/character/commands/actionCommands'
import { useCharacterStore } from '@/store/characterStore'
import type { CharacterAction } from '@/types/actions'

type ActionKind = CharacterAction['kind']
type Behavior = 'none' | 'attack' | 'save'
type Rest = 'none' | 'short' | 'long'

const ACTION_KINDS: ReadonlyArray<{ value: ActionKind; label: string }> = [
  { value: 'action', label: 'Action' },
  { value: 'bonus-action', label: 'Bonus action' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'passive', label: 'Passive' },
  { value: 'special', label: 'Special' },
  { value: 'attack', label: 'Attack' },
]

function titleCase(value: string): string {
  return value.replace(/^\p{L}/u, (letter) => letter.toUpperCase())
}

function optionalInteger(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

export function ManualActionsForm({ showHeader = true }: { showHeader?: boolean }) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ActionKind>('action')
  const [behavior, setBehavior] = useState<Behavior>('none')
  const [attackBonus, setAttackBonus] = useState('')
  const [saveAbility, setSaveAbility] = useState<AbilityName>('dexterity')
  const [saveDc, setSaveDc] = useState('')
  const [range, setRange] = useState('')
  const [damageDice, setDamageDice] = useState('')
  const [damageBonus, setDamageBonus] = useState('')
  const [damageType, setDamageType] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [resourceAmount, setResourceAmount] = useState('1')
  const [rest, setRest] = useState<Rest>('none')
  const [rechargeNote, setRechargeNote] = useState('')
  const [description, setDescription] = useState('')
  const nameId = useId()
  const attackBonusId = useId()
  const saveDcId = useId()
  const rangeId = useId()
  const damageDiceId = useId()
  const damageBonusId = useId()
  const damageTypeId = useId()
  const resourceIdId = useId()
  const resourceAmountId = useId()
  const rechargeNoteId = useId()
  const descriptionId = useId()

  if (!character) return null
  const update = (patch: Parameters<typeof updateCharacter>[1]) =>
    updateCharacter(character.id, patch)

  const resetForm = () => {
    setName('')
    setBehavior('none')
    setAttackBonus('')
    setSaveDc('')
    setRange('')
    setDamageDice('')
    setDamageBonus('')
    setDamageType('')
    setResourceId('')
    setResourceAmount('1')
    setRest('none')
    setRechargeNote('')
    setDescription('')
  }

  const addAction = () => {
    const normalizedName = name.trim()
    const parsedAttackBonus = optionalInteger(attackBonus)
    const parsedSaveDc = optionalInteger(saveDc)
    const parsedDamageBonus = optionalInteger(damageBonus) ?? 0
    const parsedResourceAmount = optionalInteger(resourceAmount)
    if (!normalizedName) {
      toast.error('Give this action a name.')
      return
    }
    if (behavior === 'attack' && parsedAttackBonus === undefined) {
      toast.error('Enter a whole-number attack bonus.')
      return
    }
    if (behavior === 'save' && (parsedSaveDc === undefined || parsedSaveDc < 0)) {
      toast.error('Enter a non-negative whole-number save DC.')
      return
    }
    if (damageBonus.trim() && optionalInteger(damageBonus) === undefined) {
      toast.error('Damage bonus must be a whole number.')
      return
    }
    if (resourceId.trim() && (!parsedResourceAmount || parsedResourceAmount < 1)) {
      toast.error('Resource cost must be a positive whole number.')
      return
    }

    const hasDamage = !!damageDice.trim() || !!damageType.trim() || parsedDamageBonus !== 0
    const action: CharacterAction = {
      id: crypto.randomUUID(),
      name: normalizedName,
      kind,
      description: description.trim(),
      source: { kind: 'manual', name: normalizedName },
      active: true,
      attackBonus: behavior === 'attack' ? parsedAttackBonus : undefined,
      save:
        behavior === 'save' && parsedSaveDc !== undefined
          ? { ability: saveAbility, dc: parsedSaveDc }
          : undefined,
      range: range.trim() || undefined,
      damage: hasDamage
        ? [
            {
              dice: damageDice.trim() || undefined,
              bonus: parsedDamageBonus,
              damageType: damageType.trim() || undefined,
            },
          ]
        : undefined,
      resourceCost:
        resourceId.trim() && parsedResourceAmount
          ? { resourceId: resourceId.trim(), amount: parsedResourceAmount }
          : undefined,
      recharge:
        rest !== 'none' || rechargeNote.trim()
          ? { rest: rest === 'none' ? undefined : rest, note: rechargeNote.trim() || undefined }
          : undefined,
    }
    update(upsertManualActionCommand(character, action))
    resetForm()
    toast.success('Manual action added.')
  }

  return (
    <div className="space-y-5">
      {showHeader && (
        <header>
          <h2 className="flex items-center gap-2 font-semibold">
            <Sword className="size-5 text-primary" />
            Manual Actions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Record a table ruling or action that cannot be derived safely from source data.
          </p>
        </header>
      )}

      <section className="grid gap-3 border-y border-border py-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Timing</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as ActionKind)}>
            <SelectTrigger className="w-full" aria-label="Action timing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_KINDS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Attack or save</Label>
          <Select value={behavior} onValueChange={(value) => setBehavior(value as Behavior)}>
            <SelectTrigger className="w-full" aria-label="Attack or save behavior">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Neither</SelectItem>
              <SelectItem value="attack">Attack roll</SelectItem>
              <SelectItem value="save">Saving throw</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {behavior === 'attack' && (
          <div className="space-y-1.5">
            <Label htmlFor={attackBonusId}>Attack bonus</Label>
            <Input
              id={attackBonusId}
              type="number"
              value={attackBonus}
              onChange={(event) => setAttackBonus(event.target.value)}
            />
          </div>
        )}
        {behavior === 'save' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Save ability</Label>
              <Select
                value={saveAbility}
                onValueChange={(value) => setSaveAbility(value as AbilityName)}
              >
                <SelectTrigger className="w-full" aria-label="Save ability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABILITY_NAMES.map((ability) => (
                    <SelectItem key={ability} value={ability}>
                      {titleCase(ability)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={saveDcId}>Save DC</Label>
              <Input
                id={saveDcId}
                type="number"
                min={0}
                value={saveDc}
                onChange={(event) => setSaveDc(event.target.value)}
              />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={rangeId}>Range (optional)</Label>
          <Input id={rangeId} value={range} onChange={(event) => setRange(event.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor={damageDiceId}>Damage dice</Label>
            <Input
              id={damageDiceId}
              value={damageDice}
              onChange={(event) => setDamageDice(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={damageBonusId}>Damage bonus</Label>
            <Input
              id={damageBonusId}
              type="number"
              value={damageBonus}
              onChange={(event) => setDamageBonus(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={damageTypeId}>Damage type</Label>
            <Input
              id={damageTypeId}
              value={damageType}
              onChange={(event) => setDamageType(event.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={resourceIdId}>Resource ID</Label>
            <Input
              id={resourceIdId}
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={resourceAmountId}>Cost</Label>
            <Input
              id={resourceAmountId}
              type="number"
              min={1}
              value={resourceAmount}
              onChange={(event) => setResourceAmount(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Recovers on</Label>
          <Select value={rest} onValueChange={(value) => setRest(value as Rest)}>
            <SelectTrigger className="w-full" aria-label="Recovery rest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No automatic rest</SelectItem>
              <SelectItem value="short">Short rest</SelectItem>
              <SelectItem value="long">Long rest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={rechargeNoteId}>Recharge note (optional)</Label>
          <Input
            id={rechargeNoteId}
            value={rechargeNote}
            onChange={(event) => setRechargeNote(event.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={descriptionId}>Description</Label>
          <Textarea
            id={descriptionId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <Button type="button" className="sm:col-span-2" onClick={addAction}>
          <Plus /> Add action
        </Button>
      </section>
    </div>
  )
}

export function ManualActionsList() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  if (!character) return null

  const update = (patch: Parameters<typeof updateCharacter>[1]) =>
    updateCharacter(character.id, patch)
  const manualActions = character.manualActions ?? []

  return (
    <Accordion type="single" collapsible defaultValue="manual-actions">
      <AccordionItem
        value="manual-actions"
        className="overflow-hidden rounded-lg border border-border bg-workspace-pane"
      >
        <AccordionTrigger className="rounded-none px-4 py-3 hover:bg-surface-raised/70 hover:no-underline data-[state=open]:bg-surface-raised/50">
          <span className="font-semibold">Manual actions</span>
          <Badge variant="outline" className="ml-auto">
            {manualActions.length}
          </Badge>
        </AccordionTrigger>
        <AccordionContent className="border-t border-border p-0">
          {manualActions.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              No manual actions have been added.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {manualActions.map((action) => (
                <div key={action.id} className="flex items-center gap-3 px-4 py-3">
                  <Switch
                    checked={action.active}
                    aria-label={`${action.active ? 'Disable' : 'Enable'} ${action.name}`}
                    onCheckedChange={(active) =>
                      update(upsertManualActionCommand(character, { ...action, active }))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{action.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACTION_KINDS.find((option) => option.value === action.kind)?.label}
                      {action.range ? ` · ${action.range}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${action.name}`}
                    onClick={() => update(removeManualActionCommand(character, action.id))}
                  >
                    <Trash />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export function ManualActionsEditor() {
  return (
    <div className="space-y-5">
      <ManualActionsForm />
      <ManualActionsList />
    </div>
  )
}
