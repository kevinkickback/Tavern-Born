import { MagicWand, Minus, Plus } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatModifier, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import type { SpellSlotPool } from '@/lib/character/commands/spellSlotCommands'
import { getClassIconUrl } from '@/lib/classIcons'
import { cn } from '@/lib/utils'

interface SpellcastingDetailLike {
  profileId: string
  className: string
  classLevel: number
  casterProgression: string
  spellcastingAbility?: string | null
  spellSaveDC: number | null
  spellAttackBonus: number | null
}

interface RacialProfileLike {
  id: string
  raceName?: string
  label: string
  castingAbility?: string
  castingAbilityOptions?: string[]
}

interface SharedSlotLike {
  level: number
  max: number
  used: number
  available: number
}

type PactSlotLike = SharedSlotLike

interface SpellcastingDetailsCardProps {
  isSpellcaster: boolean
  spellcastingDetails: SpellcastingDetailLike[]
  racialProfiles?: RacialProfileLike[]
  proficiencyBonus?: number
  abilityModifiers?: Record<string, number>
  onSetRacialCastingAbility?: (profileId: string, ability: string) => void
  hasMultipleSpellcastingClasses: boolean
  sharedSlots: SharedSlotLike[]
  pactSlots: PactSlotLike[]
  onSpendSlot?: (pool: SpellSlotPool, level: number, max: number) => void
  onRestoreSlot?: (pool: SpellSlotPool, level: number, max: number) => void
}

interface SpellSlotUseCardProps {
  pool: SpellSlotPool
  slot: SharedSlotLike
  onSpendSlot?: SpellcastingDetailsCardProps['onSpendSlot']
  onRestoreSlot?: SpellcastingDetailsCardProps['onRestoreSlot']
}

function SpellSlotUseCard({ pool, slot, onSpendSlot, onRestoreSlot }: SpellSlotUseCardProps) {
  const poolLabel = pool === 'pact' ? 'Pact Magic' : 'shared'

  return (
    <div
      className={cn(
        'flex min-w-[76px] flex-col items-center rounded-lg border px-2 py-2 text-center',
        pool === 'pact' ? 'border-warning/50 bg-warning/10' : 'border-accent/40 bg-accent/10',
      )}
    >
      <span className="font-bold text-lg leading-none tabular-nums">
        {slot.available}/{slot.max}
      </span>
      <span className="mt-1 text-[10px] text-muted-foreground">Lvl {slot.level} available</span>
      <div className="mt-2 flex gap-1 border-t border-border/50 pt-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={slot.available === 0}
          onClick={() => onSpendSlot?.(pool, slot.level, slot.max)}
          aria-label={`Spend one level ${slot.level} ${poolLabel} spell slot`}
          title="Spend one slot"
        >
          <Minus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={slot.used === 0}
          onClick={() => onRestoreSlot?.(pool, slot.level, slot.max)}
          aria-label={`Manually restore one level ${slot.level} ${poolLabel} spell slot`}
          title="Manually restore one slot"
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

export function SpellcastingDetailsCard({
  isSpellcaster,
  spellcastingDetails,
  racialProfiles = [],
  proficiencyBonus = 0,
  abilityModifiers = {},
  onSetRacialCastingAbility,
  hasMultipleSpellcastingClasses,
  sharedSlots,
  pactSlots,
  onSpendSlot,
  onRestoreSlot,
}: SpellcastingDetailsCardProps) {
  const hasAnySpellcasting = isSpellcaster || racialProfiles.length > 0

  return (
    <div className="space-y-4">
      {!hasAnySpellcasting ? (
        <p className="text-sm text-muted-foreground">
          This character has no spellcasting classes yet.
        </p>
      ) : (
        <>
          <div className="grid gap-3">
            {spellcastingDetails.map((detail) => {
              const classIconUrl = getClassIconUrl(detail.className)
              return (
                <div
                  key={detail.profileId}
                  className="overflow-hidden rounded-lg border border-border bg-surface-raised/55"
                >
                  <div className="flex items-center gap-3 border-b border-border bg-surface-raised px-3 py-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                      {classIconUrl ? (
                        <img
                          src={classIconUrl}
                          alt={detail.className}
                          className="h-5 w-5 opacity-80"
                        />
                      ) : (
                        <MagicWand className="h-5 w-5 text-primary" weight="duotone" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm leading-tight truncate">
                        {detail.className}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Level {detail.classLevel} · {detail.casterProgression}
                      </p>
                    </div>
                    {detail.spellcastingAbility ? (
                      <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
                        {detail.spellcastingAbility}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex divide-x divide-border/40">
                    <div className="flex-1 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Save DC
                      </p>
                      <p className="font-bold text-2xl leading-tight tabular-nums mt-0.5">
                        {detail.spellSaveDC ?? '—'}
                      </p>
                    </div>
                    <div className="flex-1 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Spell Attack
                      </p>
                      <p className="font-bold text-2xl leading-tight tabular-nums mt-0.5">
                        {detail.spellAttackBonus !== null
                          ? formatModifier(detail.spellAttackBonus)
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}

            {racialProfiles.map((profile) => {
              const hasMultipleAbilityOptions = (profile.castingAbilityOptions?.length ?? 0) > 1
              const ability = profile.castingAbility
              const normalizedAbility = ability ? normalizeAbilityName(ability) : null
              const abilityMod = normalizedAbility
                ? (abilityModifiers[normalizedAbility] ?? 0)
                : null
              const spellSaveDC = abilityMod !== null ? 8 + proficiencyBonus + abilityMod : null
              const spellAttackBonus = abilityMod !== null ? proficiencyBonus + abilityMod : null

              return (
                <div
                  key={profile.id}
                  className="overflow-hidden rounded-lg border border-border bg-surface-raised/55"
                >
                  <div className="flex items-center gap-3 border-b border-border bg-surface-raised px-3 py-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                      <MagicWand className="h-5 w-5 text-primary" weight="duotone" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm leading-tight truncate">
                        {profile.raceName ?? profile.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Racial Spellcasting
                      </p>
                    </div>
                    {hasMultipleAbilityOptions ? (
                      <Select
                        value={profile.castingAbility ?? ''}
                        onValueChange={(value) => onSetRacialCastingAbility?.(profile.id, value)}
                      >
                        <SelectTrigger className="h-8 w-auto min-w-24 max-w-36 cursor-pointer text-xs">
                          <SelectValue placeholder="Choose..." />
                        </SelectTrigger>
                        <SelectContent>
                          {profile.castingAbilityOptions?.map((opt) => (
                            <SelectItem
                              key={opt}
                              value={opt}
                              className="cursor-pointer text-xs uppercase"
                            >
                              {normalizeAbilityName(opt) ?? opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : ability ? (
                      <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
                        {normalizedAbility ?? ability}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex divide-x divide-border/40">
                    <div className="flex-1 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Save DC
                      </p>
                      <p className="font-bold text-2xl leading-tight tabular-nums mt-0.5">
                        {spellSaveDC ?? '—'}
                      </p>
                    </div>
                    <div className="flex-1 px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Spell Attack
                      </p>
                      <p className="font-bold text-2xl leading-tight tabular-nums mt-0.5">
                        {spellAttackBonus !== null ? formatModifier(spellAttackBonus) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {isSpellcaster ? (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {hasMultipleSpellcastingClasses ? 'Shared Spell Slots' : 'Spell Slots'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sharedSlots.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No shared slots</span>
                  ) : (
                    sharedSlots.map((slot) => (
                      <SpellSlotUseCard
                        key={`shared-${slot.level}`}
                        pool="shared"
                        slot={slot}
                        onSpendSlot={onSpendSlot}
                        onRestoreSlot={onRestoreSlot}
                      />
                    ))
                  )}
                </div>
              </div>

              {pactSlots.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    Pact Magic Slots
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pactSlots.map((slot) => (
                      <SpellSlotUseCard
                        key={`pact-${slot.level}`}
                        pool="pact"
                        slot={slot}
                        onSpendSlot={onSpendSlot}
                        onRestoreSlot={onRestoreSlot}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
