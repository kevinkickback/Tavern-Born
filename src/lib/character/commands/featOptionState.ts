import { getFixedFeatOptionKey } from '@/lib/featGrants'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character, FeatOptionSelections } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  getFeatSelectionKey,
} from './featCommandIdentity'
import { getFeatChoiceSelectedRefs } from './featCommandSupport'

/** Store one already-authorized owner's options without touching sibling benefits or markers. */
export function storeFeatOptionSelections(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  selections: FeatOptionSelections,
): CharacterCommandResult {
  const owner = getFeatOptionOwnerKey(feat)
  const same = (entry: { name: string; source?: string }) =>
    getFeatSelectionKey(entry) === getFeatSelectionKey(feat)
  return {
    characterPatch: {
      feats:
        feat.selectionKind === 'ordinary'
          ? character.feats.map((entry) =>
              same(entry) ? { ...entry, options: selections } : entry,
            )
          : character.feats,
      specialFeats:
        feat.selectionKind === 'bonus'
          ? character.specialFeats?.map((entry) =>
              same(entry) ? { ...entry, options: selections } : entry,
            )
          : character.specialFeats,
      classFeatChoices: character.classFeatChoices?.map((choice) =>
        owner === `class:${choice.id}`
          ? {
              ...choice,
              feats: choice.feats.map((entry) =>
                same(entry) ? { ...entry, options: selections } : entry,
              ),
            }
          : choice,
      ),
      fixedFeatOptions: owner?.startsWith('fixed:')
        ? {
            ...character.fixedFeatOptions,
            [getFixedFeatOptionKey(feat.name, feat.source ?? '', feat.grantVariant)]: selections,
          }
        : character.fixedFeatOptions,
    },
    provenanceUpdate: {
      ...ledger,
      choices: ledger.choices.map((choice) =>
        choice.domain === 'feats' && choice.id === feat.provenanceChoiceId
          ? {
              ...choice,
              selectedRefs: getFeatChoiceSelectedRefs(choice).map((entry) =>
                same(entry) ? { ...entry, source: feat.source, options: selections } : entry,
              ),
            }
          : choice,
      ),
    },
  }
}
