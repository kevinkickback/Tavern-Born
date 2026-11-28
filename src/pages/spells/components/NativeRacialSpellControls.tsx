import { CreatorChoicePill, RaceChoiceRow } from '@/components/character/RaceChoiceRow'
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
import { capitalizeLabel } from '@/lib/displayLabels'
import type { SpellProfile } from '@/types/character'

interface Props {
  profiles: SpellProfile[]
  owners: NativeRacialSpellOwner[] | null
  layout?: 'inline'
  pending?: ReadonlyMap<string, { suite: boolean; ability: boolean; picks: ReadonlySet<string> }>
  onSetSuite: (profileId: string, suiteId: string | undefined) => void
  onEditChoice: (profileId: string, choiceId: string) => void
  onClearChoice: (profileId: string, choiceId: string, selected: string[]) => void
  onSetAbility: (profileId: string, ability: string) => void
}

/** Setup controls exist independently of granted rows, including empty native suites. */
export function NativeRacialSpellControls({
  profiles,
  owners,
  layout,
  pending,
  onSetSuite,
  onEditChoice,
  onClearChoice,
  onSetAbility,
}: Props) {
  return (
    <div className={layout === 'inline' ? undefined : 'mb-4 space-y-3'}>
      {profiles.map((profile) => {
        const state = profile.racial
        if (!state) return null
        const label = getSpellProfileDisplayLabel(profile)
        const live = owners?.find((owner) => owner.id === profile.id)
        const hasAbilityChoice = !!state.suite && !!profile.castingAbilityOptions?.length
        if (live && state.mode === 'mandatory' && !profile.choices?.length && !hasAbilityChoice)
          return null
        const progress = pending?.get(profile.id)
        const suites = live?.suites.map((suite, index) => ({
          id: suite.id,
          name:
            suite.block.name ??
            (suite.block.grants.length
              ? suite.block.grants
                  .map((grant) => parseSpellReference(grant.spellName).name)
                  .join(', ')
              : `Spell suite ${index + 1}`),
        }))
        const suiteName =
          suites?.find(({ id }) => id === state.suite?.id)?.name ??
          state.suite?.name ??
          'Selected spell suite'
        const abilityName = (ability: string) =>
          capitalizeLabel(normalizeAbilityName(ability) ?? ability)
        const suiteControls = state.mode === 'alternative' && (
          <>
            <Select
              value={state.suite?.id ?? ''}
              disabled={!live}
              onValueChange={(value) => onSetSuite(profile.id, value)}
            >
              <SelectTrigger
                aria-label={`${label} spell suite`}
                className={layout === 'inline' ? 'min-w-40 max-w-full' : 'flex-1'}
              >
                <SelectValue placeholder="Choose spell suite" />
              </SelectTrigger>
              <SelectContent>
                {!live && state.suite ? (
                  <SelectItem value={state.suite.id}>
                    {state.suite.name ?? 'Selected spell suite'}
                  </SelectItem>
                ) : null}
                {suites?.map((suite) => (
                  <SelectItem key={suite.id} value={suite.id}>
                    {suite.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {layout !== 'inline' && (
              <Button
                variant="outline"
                size="sm"
                disabled={!state.suite}
                aria-label={`Clear ${label} spell suite`}
                onClick={() => onSetSuite(profile.id, undefined)}
              >
                Clear
              </Button>
            )}
          </>
        )
        const abilityControl = hasAbilityChoice && (
          <Select
            value={profile.castingAbility ?? ''}
            disabled={!live}
            onValueChange={(value) => onSetAbility(profile.id, value)}
          >
            <SelectTrigger
              aria-label={`${label} casting ability`}
              className={layout === 'inline' ? 'min-w-40 max-w-full' : undefined}
            >
              <SelectValue placeholder="Choose casting ability" />
            </SelectTrigger>
            <SelectContent>
              {profile.castingAbilityOptions?.map((ability) => (
                <SelectItem key={ability} value={ability}>
                  {abilityName(ability)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
        const choiceRows = profile.choices?.map((choice, index) => {
          const title = choice.isCantrip ? 'Cantrips' : 'Spells'
          const repeated = profile.choices?.some(
            (other) => other.id !== choice.id && !!other.isCantrip === !!choice.isCantrip,
          )
          const choiceTitle = repeated ? `${title} · Choice ${index + 1}` : title
          const selection = choice.selected
            .map((reference) => parseSpellReference(reference).name)
            .join(', ')
          const action = layout === 'inline' && !choice.selected.length ? 'Choose' : 'Edit'
          const controls = (
            <>
              {(layout !== 'inline' || choice.selected.length < choice.count) && (
                <Button
                  variant="outline"
                  size="sm"
                  data-creator-choice-control={layout === 'inline' || undefined}
                  disabled={!live}
                  aria-label={`${action} ${label} spell choice ${index + 1}`}
                  onClick={() => onEditChoice(profile.id, choice.id)}
                >
                  {action === 'Edit' && layout === 'inline' ? 'Edit spells' : action}
                </Button>
              )}
              {layout !== 'inline' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!choice.selected.length}
                  aria-label={`Clear ${label} spell choice ${index + 1}`}
                  onClick={() => onClearChoice(profile.id, choice.id, [])}
                >
                  Clear
                </Button>
              )}
            </>
          )
          if (layout === 'inline')
            return (
              <RaceChoiceRow
                key={choice.id}
                title={choiceTitle}
                detail={`${label} · ${choice.selected.length} / ${choice.count} chosen`}
                pending={progress?.picks.has(choice.id)}
                complete={choice.selected.length >= choice.count}
              >
                {choice.selected.map((reference) => {
                  const { name, source } = parseSpellReference(reference)
                  return (
                    <CreatorChoicePill
                      key={reference}
                      description={source ? `Source ${source}` : undefined}
                      remove={{
                        label: `Remove ${name} from ${label} ${choiceTitle.toLowerCase()}`,
                        onClick: () =>
                          onClearChoice(
                            profile.id,
                            choice.id,
                            choice.selected.filter((pick) => pick !== reference),
                          ),
                      }}
                    >
                      {name}
                    </CreatorChoicePill>
                  )
                })}
                {controls}
              </RaceChoiceRow>
            )
          return (
            <div
              key={choice.id}
              className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  Choice {index + 1} · {choice.selected.length}/{choice.count} {title.toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">{selection || 'None selected'}</p>
              </div>
              {controls}
            </div>
          )
        })
        const unavailable = !live && (
          <p className="mt-2 text-xs text-muted-foreground">
            Restore the race and lineage sources to select new spells. Existing choices can still be
            cleared.
          </p>
        )
        if (layout === 'inline')
          return (
            <section key={profile.id} aria-label={`${label} spell setup`}>
              {suiteControls && (
                <RaceChoiceRow
                  title="Spell suite"
                  detail={`${label} · Choose a spell package`}
                  pending={progress?.suite}
                  complete={!!state.suite}
                >
                  {state.suite ? (
                    <CreatorChoicePill
                      remove={{
                        label: `Clear ${label} spell suite`,
                        onClick: () => onSetSuite(profile.id, undefined),
                      }}
                    >
                      {suiteName}
                    </CreatorChoicePill>
                  ) : (
                    suiteControls
                  )}
                </RaceChoiceRow>
              )}
              {abilityControl && (
                <RaceChoiceRow
                  title="Casting ability"
                  detail={`${label} · Choose the ability used for these spells`}
                  pending={progress?.ability}
                  complete={!!profile.castingAbility}
                >
                  {profile.castingAbility ? (
                    <CreatorChoicePill
                      remove={{
                        label: `Remove ${abilityName(profile.castingAbility)} as ${label} casting ability`,
                        onClick: () => onSetAbility(profile.id, ''),
                      }}
                    >
                      {abilityName(profile.castingAbility)}
                    </CreatorChoicePill>
                  ) : (
                    abilityControl
                  )}
                </RaceChoiceRow>
              )}
              {unavailable}
              {choiceRows}
            </section>
          )
        return (
          <section
            key={profile.id}
            aria-label={`${label} spell setup`}
            className="rounded-lg border border-border p-3"
          >
            <h3 className="mb-2 font-semibold text-sm">{label} spells</h3>
            {suiteControls && <div className="flex items-center gap-2">{suiteControls}</div>}
            {abilityControl}
            {unavailable}
            {choiceRows}
          </section>
        )
      })}
    </div>
  )
}
