import { type ReactNode, useState } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  CharacterEditingContext,
  type createCharacterEditingDraft,
  useEditingCharacter,
} from '@/store/characterEditingContext'
import type { Background5e, Class5e } from '@/types/5etools'
import { CreatorChoiceDetails, type CreatorChoiceReviewProps } from './CreatorChoiceDetails'
import { CreatorChoices } from './CreatorChoices'
import { CreatorClassChoices } from './CreatorClassChoices'
import { CreatorStartingEquipment } from './CreatorStartingEquipment'
import { getCreatorChoiceGroups } from './creatorChoiceGroups'

export interface CreatorOriginChoiceProps extends CreatorChoiceReviewProps {
  originDraftStore?: ReturnType<typeof createCharacterEditingDraft>
}

type OriginChoiceDetailsContent = CreatorChoiceReviewProps & {
  description: ReactNode
  abilityChoices?: ReactNode
  abilitiesPending?: boolean
} & ({ kind: 'Class'; entity?: Class5e } | { kind: 'Background'; entity?: Background5e })
type OriginChoiceDetailsProps = OriginChoiceDetailsContent & CreatorOriginChoiceProps

export function CreatorOriginChoiceDetails(props: OriginChoiceDetailsProps) {
  const { originDraftStore, ...details } = props
  if (!originDraftStore) return <CreatorChoiceDetails {...details} />
  return (
    <CharacterEditingContext.Provider value={originDraftStore}>
      <OriginChoiceDetails {...details} />
    </CharacterEditingContext.Provider>
  )
}

function OriginChoiceDetails({
  abilityChoices,
  abilitiesPending,
  ...details
}: OriginChoiceDetailsContent) {
  const character = useEditingCharacter()
  const calculation = useCharacterCalculationContext(character)
  const rules = useFilteredGameData()
  const [features, setFeatures] = useState({ available: false, pending: false })
  const [equipment, setEquipment] = useState({ available: false, pending: false })
  if (!character || !calculation) return <CreatorChoiceDetails {...details} />
  const scope = details.kind === 'Class' ? 'class' : 'background'
  const groups = getCreatorChoiceGroups(character, rules, scope, calculation.character)
  return (
    <CreatorChoiceDetails
      {...details}
      keepChoicesMounted
      hasChoices={
        !!(
          abilityChoices ||
          groups.choices.length ||
          groups.fixedFeatOwners.length ||
          features.available ||
          equipment.available
        )
      }
      pending={abilitiesPending || groups.hasPending || features.pending || equipment.pending}
      choices={
        <section aria-label={`${details.kind} choices`} className="min-w-0 space-y-2">
          {abilityChoices}
          <CreatorChoices scope={scope} groups={groups} />
          {details.kind === 'Class' && (
            <CreatorClassChoices
              character={character}
              context={calculation}
              classes={rules.classes}
              onStatusChange={(available, pending) =>
                setFeatures((old) =>
                  old.available === available && old.pending === pending
                    ? old
                    : { available, pending },
                )
              }
            />
          )}
          <CreatorStartingEquipment
            character={character}
            rules={details.kind === 'Class' ? details.entity : undefined}
            background={details.kind === 'Background' ? details.entity : undefined}
            onStatusChange={(available, pending) =>
              setEquipment((old) =>
                old.available === available && old.pending === pending
                  ? old
                  : { available, pending },
              )
            }
          />
        </section>
      }
    />
  )
}
