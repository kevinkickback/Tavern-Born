import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import type { NativeRacialSpellOwner } from '@/lib/calculations/nativeRacialSpells'
import { getSpellProfileDisplayLabel } from '@/lib/calculations/raceDisplay'
import { parseSpellReference } from '@/lib/calculations/spellIdentity'
import type { SpellProfile } from '@/types/character'

interface Props {
  profiles: SpellProfile[]
  owners: NativeRacialSpellOwner[] | null
  onSetSuite: (profileId: string, suiteId: string | undefined) => void
  onEditChoice: (profileId: string, choiceId: string) => void
  onClearChoice: (profileId: string, choiceId: string, selected: string[]) => void
  onSetAbility: (profileId: string, ability: string) => void
}

/** Setup controls exist independently of granted rows, including empty native suites. */
export function NativeRacialSpellControls({
  profiles,
  owners,
  onSetSuite,
  onEditChoice,
  onClearChoice,
  onSetAbility,
}: Props) {
  return (
    <div className="mb-4 space-y-3">
      {profiles.map((profile) => {
        const state = profile.racial
        if (!state) return null
        const label = getSpellProfileDisplayLabel(profile)
        const live = owners?.find((owner) => owner.id === profile.id)
        const hasAbilityChoice = !!state.suite && !!profile.castingAbilityOptions?.length
        if (live && state.mode === 'mandatory' && !profile.choices?.length && !hasAbilityChoice)
          return null
        return (
          <section
            key={profile.id}
            aria-label={`${label} spell setup`}
            className="rounded-lg border border-border p-3"
          >
            <h3 className="mb-2 font-semibold text-sm">{label} spells</h3>
            {state.mode === 'alternative' ? (
              <div className="flex items-center gap-2">
                <Select
                  value={state.suite?.id ?? ''}
                  disabled={!live}
                  onValueChange={(value) => onSetSuite(profile.id, value)}
                >
                  <SelectTrigger aria-label={`${label} spell suite`} className="flex-1">
                    <SelectValue placeholder="Choose spell suite" />
                  </SelectTrigger>
                  <SelectContent>
                    {!live && state.suite ? (
                      <SelectItem value={state.suite.id}>
                        {state.suite.name ?? 'Selected spell suite'}
                      </SelectItem>
                    ) : null}
                    {live?.suites.map((suite, index) => (
                      <SelectItem key={suite.id} value={suite.id}>
                        {suite.block.name ??
                          (suite.block.grants.length
                            ? suite.block.grants
                                .map((grant) => parseSpellReference(grant.spellName).name)
                                .join(', ')
                            : `Spell suite ${index + 1}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!state.suite}
                  aria-label={`Clear ${label} spell suite`}
                  onClick={() => onSetSuite(profile.id, undefined)}
                >
                  Clear
                </Button>
              </div>
            ) : null}
            {hasAbilityChoice ? (
              <Select
                value={profile.castingAbility ?? ''}
                disabled={!live}
                onValueChange={(value) => onSetAbility(profile.id, value)}
              >
                <SelectTrigger aria-label={`${label} casting ability`}>
                  <SelectValue placeholder="Choose casting ability" />
                </SelectTrigger>
                <SelectContent>
                  {profile.castingAbilityOptions?.map((ability) => (
                    <SelectItem key={ability} value={ability}>
                      {normalizeAbilityName(ability) ?? ability}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {!live ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Restore the race and lineage sources to select new spells. Existing choices can
                still be cleared.
              </p>
            ) : null}
            {profile.choices?.map((choice, index) => (
              <div
                key={choice.id}
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    Choice {index + 1} · {choice.selected.length}/{choice.count}{' '}
                    {choice.isCantrip ? 'cantrips' : 'spells'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {choice.selected
                      .map((reference) => parseSpellReference(reference).name)
                      .join(', ') || 'None selected'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!live}
                  aria-label={`Edit ${label} spell choice ${index + 1}`}
                  onClick={() => onEditChoice(profile.id, choice.id)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!choice.selected.length}
                  aria-label={`Clear ${label} spell choice ${index + 1}`}
                  onClick={() => onClearChoice(profile.id, choice.id, [])}
                >
                  Clear
                </Button>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
