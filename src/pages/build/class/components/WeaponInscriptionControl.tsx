import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getWeaponInscriptionSetup } from '@/lib/5etools/weaponInscribedSpells'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { setWeaponInscription } from '@/lib/character/commands/weaponInscriptionCommands'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { useCharacterStore } from '@/store/characterStore'
import type { Character, CharacterClassEntry } from '@/types/character'

type EditState = {
  expected: Parameters<typeof setWeaponInscription>[3]
  target?: string
  rune: string
  weaponId: string
}

export function WeaponInscriptionControl({
  character,
  entry,
  catalogs,
}: {
  character: Character
  entry: CharacterClassEntry
  catalogs: ClassChoiceFeatureCatalogs
}) {
  const [edit, setEdit] = useState<EditState>()
  const setup = getWeaponInscriptionSetup(character, entry, catalogs)
  if (!setup) return null
  const { active, current, saved, weapons } = setup
  const currentRune = active
    ? current?.runes.find((rune) => norm(rune) === saved?.mark.rune)
    : undefined
  const open = () =>
    setEdit({
      target: current?.target,
      expected: saved && {
        target: saved.mark.target,
        rune: saved.mark.rune,
        weaponId: saved.weapon.id,
      },
      rune: currentRune ?? '',
      weaponId: active ? (saved?.weapon.id ?? '') : '',
    })
  const save = (clear: boolean) => {
    const state = useCharacterStore.getState()
    const latest = state.activeCharacter
    if (!edit || !latest || latest.id !== character.id) return
    if (!clear && (!edit.target || edit.target !== current?.target)) {
      toast.error('The source rules changed. Open the inscription again.')
      return
    }
    try {
      const equipment = setWeaponInscription(
        latest,
        entry,
        clear || !edit.target
          ? undefined
          : {
              target: edit.target,
              rune: edit.rune,
              weaponId: edit.weaponId,
            },
        edit.expected,
        catalogs,
      )
      state.updateActiveCharacter({ equipment })
      setEdit(undefined)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'The weapon inscription could not be saved.',
      )
    }
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold">Weapon inscription</p>
        <p className="text-xs text-muted-foreground">
          {saved
            ? active
              ? `${currentRune} on ${saved.weapon.name}`
              : `Saved inscription on ${saved.weapon.name} · unavailable`
            : 'Optional. Shared subclass spells are always prepared.'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={open}>
        {saved ? 'Edit inscription' : 'Inscribe weapon'}
      </Button>
      <Dialog
        open={!!edit}
        onOpenChange={(value) => {
          if (!value) setEdit(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Weapon inscription</DialogTitle>
            <DialogDescription>
              {current
                ? renderEntriesToText([current.clause])
                : 'Restore the source rules to use this inscription, or clear it.'}
            </DialogDescription>
          </DialogHeader>
          {edit && current && (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Rune
                <select
                  className="rounded border border-border bg-background p-2"
                  value={edit.rune}
                  onChange={(event) => setEdit({ ...edit, rune: event.target.value })}
                >
                  <option value="">Choose a rune</option>
                  {current.runes.map((rune) => (
                    <option key={rune}>{rune}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Melee weapon
                <select
                  className="rounded border border-border bg-background p-2"
                  value={edit.weaponId}
                  onChange={(event) => setEdit({ ...edit, weaponId: event.target.value })}
                >
                  <option value="">Choose a weapon</option>
                  {weapons.map((weapon, index) => {
                    const sameName = weapons.filter((other) => other.name === weapon.name)
                    return (
                      <option key={weapon.id} value={weapon.id}>
                        {weapon.name}
                        {sameName.length > 1 &&
                          ` (${weapon.source}, ${weapons.slice(0, index + 1).filter((other) => other.name === weapon.name).length})`}
                      </option>
                    )
                  })}
                </select>
              </label>
              {!weapons.length && (
                <p className="text-sm text-muted-foreground">
                  Add a melee weapon in Equipment first.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {saved && (
              <Button variant="outline" onClick={() => save(true)}>
                Clear inscription
              </Button>
            )}
            <Button variant="outline" onClick={() => setEdit(undefined)}>
              Cancel
            </Button>
            {current && (
              <Button disabled={!edit?.rune || !edit.weaponId} onClick={() => save(false)}>
                Confirm
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
