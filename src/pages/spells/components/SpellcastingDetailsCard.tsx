import { MagicWand } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatModifier, normalizeAbilityName } from '@/lib/calculations/abilityScores'

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
}

interface PactSlotLike {
  level: number
  max: number
  available: number
}

interface SpellcastingDetailsCardProps {
  isSpellcaster: boolean
  spellcastingDetails: SpellcastingDetailLike[]
  racialProfiles?: RacialProfileLike[]
  proficiencyBonus?: number
  abilityModifiers?: Record<string, number>
  onSetRacialCastingAbility?: (profileId: string, ability: string) => void
  hasMultipleSpellcastingClasses: boolean
  hasWarlockClass: boolean
  sharedSlots: SharedSlotLike[]
  pactSlots: PactSlotLike[]
}

export function SpellcastingDetailsCard({
  isSpellcaster,
  spellcastingDetails,
  racialProfiles = [],
  proficiencyBonus = 0,
  abilityModifiers = {},
  onSetRacialCastingAbility,
  hasMultipleSpellcastingClasses,
  hasWarlockClass,
  sharedSlots,
  pactSlots,
}: SpellcastingDetailsCardProps) {
  const hasAnySpellcasting = isSpellcaster || racialProfiles.length > 0

  return (
    <Card className="w-full overflow-hidden">
      <div className="h-10 bg-gradient-to-r from-violet-500/20 via-violet-500/10 to-transparent border-b border-border/40 flex items-center px-4">
        <div className="flex items-center gap-2">
          <MagicWand className="h-4 w-4 text-violet-400" weight="duotone" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Spellcasting Details
          </span>
        </div>
      </div>
      <CardContent className="p-4 space-y-4">
        {!hasAnySpellcasting ? (
          <p className="text-sm text-muted-foreground">
            This character has no spellcasting classes yet.
          </p>
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {spellcastingDetails.map((detail) => (
                <div
                  key={detail.profileId}
                  className="border border-border rounded-xl overflow-hidden shadow-sm"
                >
                  <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40 bg-card">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600/60 flex items-center justify-center shrink-0 shadow-sm">
                      <MagicWand className="h-5 w-5 text-white" weight="bold" />
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
              ))}

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
                    className="border border-border rounded-xl overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border/40 bg-card">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600/60 flex items-center justify-center shrink-0 shadow-sm">
                        <MagicWand className="h-5 w-5 text-white" weight="bold" />
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
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue placeholder="Choose..." />
                          </SelectTrigger>
                          <SelectContent>
                            {profile.castingAbilityOptions?.map((opt) => (
                              <SelectItem key={opt} value={opt} className="text-xs uppercase">
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
                        <div
                          key={`shared-${slot.level}`}
                          className="flex flex-col items-center rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2 min-w-[52px] text-center"
                        >
                          <span className="font-bold text-lg leading-none tabular-nums">
                            {slot.max}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-1">
                            Lvl {slot.level}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {hasWarlockClass ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Pact Magic Slots
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {pactSlots.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No pact slots</span>
                      ) : (
                        pactSlots.map((slot) => (
                          <div
                            key={`pact-${slot.level}`}
                            className="flex flex-col items-center rounded-lg border border-warning/50 bg-warning/10 px-3.5 py-2 min-w-[52px] text-center"
                          >
                            <span className="font-bold text-lg leading-none tabular-nums">
                              {slot.max}
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-1">
                              Lvl {slot.level}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
