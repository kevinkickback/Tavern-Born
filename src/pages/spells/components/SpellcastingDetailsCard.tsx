import { MagicWand } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatModifier } from '@/lib/calculations/abilityScores'

interface SpellcastingDetailLike {
  profileId: string
  className: string
  classLevel: number
  casterProgression: string
  spellcastingAbility?: string | null
  spellSaveDC: number | null
  spellAttackBonus: number | null
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
  hasMultipleSpellcastingClasses: boolean
  hasWarlockClass: boolean
  sharedSlots: SharedSlotLike[]
  pactSlots: PactSlotLike[]
}

export function SpellcastingDetailsCard({
  isSpellcaster,
  spellcastingDetails,
  hasMultipleSpellcastingClasses,
  hasWarlockClass,
  sharedSlots,
  pactSlots,
}: SpellcastingDetailsCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-display text-xl flex items-center gap-2">
          <MagicWand className="h-5 w-5 text-accent" weight="duotone" />
          Spellcasting Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSpellcaster ? (
          <p className="text-sm text-muted-foreground">
            This character has no spellcasting classes yet.
          </p>
        ) : (
          <>
            <div className="grid gap-3 max-w-3xl xl:grid-cols-2">
              {spellcastingDetails.map((detail) => (
                <div key={detail.profileId} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{detail.className}</p>
                      <p className="text-xs text-muted-foreground">
                        Level {detail.classLevel} {detail.casterProgression}
                      </p>
                    </div>
                    {detail.spellcastingAbility ? (
                      <Badge variant="secondary" className="text-xs uppercase">
                        {detail.spellcastingAbility}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="rounded border border-border px-2 py-1.5">
                      <div className="text-muted-foreground">Spell Save DC</div>
                      <div className="font-semibold text-sm">{detail.spellSaveDC ?? '-'}</div>
                    </div>
                    <div className="rounded border border-border px-2 py-1.5">
                      <div className="text-muted-foreground">Spell Attack</div>
                      <div className="font-semibold text-sm">
                        {detail.spellAttackBonus !== null
                          ? formatModifier(detail.spellAttackBonus)
                          : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {hasMultipleSpellcastingClasses ? 'Shared Spell Slots' : 'Spell Slots'}
              </p>
              <div className="flex flex-wrap gap-2">
                {sharedSlots.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No shared slots</span>
                ) : (
                  sharedSlots.map((slot) => (
                    <div
                      key={`shared-${slot.level}`}
                      className="border rounded-lg px-3 py-1.5 text-center min-w-[64px] border-accent/40 bg-accent/5"
                    >
                      <div className="text-sm font-bold">{slot.max}</div>
                      <div className="text-[10px] text-muted-foreground">Level {slot.level}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {hasWarlockClass ? (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Pact Magic Slots
                </p>
                <div className="flex flex-wrap gap-2">
                  {pactSlots.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No pact slots</span>
                  ) : (
                    pactSlots.map((slot) => (
                      <div
                        key={`pact-${slot.level}`}
                        className="border rounded-lg px-3 py-1.5 text-center min-w-[64px] border-warning/40 bg-warning/10"
                      >
                        <div className="text-sm font-bold">
                          {slot.available}/{slot.max}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Level {slot.level}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
