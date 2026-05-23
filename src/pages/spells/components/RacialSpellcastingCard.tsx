import { Star } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatModifier } from '@/lib/calculations/abilityScores'

interface RacialProfileLike {
  id: string
  raceName?: string
  label: string
  castingAbility?: string
  castingAbilityOptions?: string[]
}

interface RacialSpellcastingCardProps {
  racialProfiles: RacialProfileLike[]
  proficiencyBonus: number
  abilityModifiers: Record<string, number>
  onSetCastingAbility: (profileId: string, ability: string) => void
}

export function RacialSpellcastingCard({
  racialProfiles,
  proficiencyBonus,
  abilityModifiers,
  onSetCastingAbility,
}: RacialSpellcastingCardProps) {
  if (racialProfiles.length === 0) return null

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-display text-xl flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" weight="duotone" />
          Racial Spellcasting
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 max-w-4xl xl:grid-cols-2">
          {racialProfiles.map((profile) => {
            const hasMultipleAbilityOptions = (profile.castingAbilityOptions?.length ?? 0) > 1
            const ability = profile.castingAbility
            const abilityMod = ability ? (abilityModifiers[ability] ?? 0) : null
            const spellSaveDC = abilityMod !== null ? 8 + proficiencyBonus + abilityMod : null
            const spellAttackBonus = abilityMod !== null ? proficiencyBonus + abilityMod : null

            return (
              <div key={profile.id} className="rounded-lg border border-border/80 bg-muted/15 p-4">
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
                      onValueChange={(value) => onSetCastingAbility(profile.id, value)}
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
      </CardContent>
    </Card>
  )
}
