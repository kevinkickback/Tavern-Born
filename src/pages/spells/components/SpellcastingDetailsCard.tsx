import { MagicWand } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-display text-xl flex items-center gap-2">
          <MagicWand className="h-5 w-5 text-primary" weight="duotone" />
          Spellcasting Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasAnySpellcasting ? (
          <p className="text-sm text-muted-foreground">
            This character has no spellcasting classes yet.
          </p>
        ) : (
          <>
            <div className="grid gap-4 max-w-4xl xl:grid-cols-2">
              {spellcastingDetails.map((detail) => (
                <div
                  key={detail.profileId}
                  className="rounded-lg border border-border/80 bg-muted/15 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-base leading-tight">{detail.className}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Level {detail.classLevel} {detail.casterProgression}
                      </p>
                    </div>
                    {detail.spellcastingAbility ? (
                      <Badge variant="secondary" className="text-xs uppercase">
                        {detail.spellcastingAbility}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 mt-3 text-sm">
                    <div className="rounded-md border border-border bg-card px-2.5 py-2">
                      <div className="text-muted-foreground text-xs">Spell Save DC</div>
                      <div className="font-semibold text-base leading-tight mt-0.5">
                        {detail.spellSaveDC ?? '-'}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-card px-2.5 py-2">
                      <div className="text-muted-foreground text-xs">Spell Attack</div>
                      <div className="font-semibold text-base leading-tight mt-0.5">
                        {detail.spellAttackBonus !== null
                          ? formatModifier(detail.spellAttackBonus)
                          : '-'}
                      </div>
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
                    className="rounded-lg border border-border/80 bg-muted/15 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-base leading-tight">
                          {profile.raceName ?? profile.label}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">Racial Spellcasting</p>
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
                                {opt.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : ability ? (
                        <Badge variant="secondary" className="text-xs uppercase">
                          {ability}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 mt-3 text-sm">
                      <div className="rounded-md border border-border bg-card px-2.5 py-2">
                        <div className="text-muted-foreground text-xs">Spell Save DC</div>
                        <div className="font-semibold text-base leading-tight mt-0.5">
                          {spellSaveDC ?? '-'}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-card px-2.5 py-2">
                        <div className="text-muted-foreground text-xs">Spell Attack</div>
                        <div className="font-semibold text-base leading-tight mt-0.5">
                          {spellAttackBonus !== null ? formatModifier(spellAttackBonus) : '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {isSpellcaster ? (
              <>
                <div className="rounded-lg border border-border/80 bg-muted/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {hasMultipleSpellcastingClasses ? 'Shared Spell Slots' : 'Spell Slots'}
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {sharedSlots.length === 0 ? (
                      <span className="text-sm text-muted-foreground">No shared slots</span>
                    ) : (
                      sharedSlots.map((slot) => (
                        <div
                          key={`shared-${slot.level}`}
                          className="border rounded-lg px-3.5 py-2 text-center min-w-[72px] border-accent bg-accent"
                        >
                          <div className="text-base font-bold leading-tight">{slot.max}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Level {slot.level}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {hasWarlockClass ? (
                  <div className="rounded-lg border border-border/80 bg-warning/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Pact Magic Slots
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {pactSlots.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No pact slots</span>
                      ) : (
                        pactSlots.map((slot) => (
                          <div
                            key={`pact-${slot.level}`}
                            className="border rounded-lg px-3.5 py-2 text-center min-w-[72px] border-warning/50 bg-warning/15"
                          >
                            <div className="text-base font-bold leading-tight">
                              {slot.available}/{slot.max}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Level {slot.level}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
