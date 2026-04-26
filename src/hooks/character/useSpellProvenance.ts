import { useCallback } from 'react'
import { addGrant, applyClassSpellGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

interface UseSpellProvenanceParams {
  character: Character | null
  ledger: ProvenanceLedger
  patch: (newLedger: ProvenanceLedger) => void
}

export function useSpellProvenance({ character, ledger, patch }: UseSpellProvenanceParams) {
  const applySpellSelection = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spellName: string,
      grantedAtLevel?: number,
    ) => {
      if (!character) return
      const newLedger = applyClassSpellGrant(ledger, className, classSource, spellName, 'choice', {
        ...(grantedAtLevel ? { spellGrantedAtLevel: grantedAtLevel } : {}),
        spellAttributionMode: grantedAtLevel ? 'exact' : undefined,
      })
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const applyBatchSpellSelections = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spells: Array<{ name: string; grantedAtLevel?: number }>,
    ) => {
      if (!character || spells.length === 0) return
      let accumulated = ledger
      for (const spell of spells) {
        accumulated = applyClassSpellGrant(
          accumulated,
          className,
          classSource,
          spell.name,
          'choice',
          {
            ...(spell.grantedAtLevel ? { spellGrantedAtLevel: spell.grantedAtLevel } : {}),
            spellAttributionMode: spell.grantedAtLevel ? 'exact' : undefined,
          },
        )
      }
      patch(accumulated)
    },
    [character, ledger, patch],
  )

  const applyInferredClassSpellSelection = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spellName: string,
      grantedAtLevel: number,
    ) => {
      if (!character) return
      const newLedger = applyClassSpellGrant(ledger, className, classSource, spellName, 'choice', {
        spellGrantedAtLevel: grantedAtLevel,
        spellAttributionMode: 'inferred-lowest-eligible',
      })
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const applyManualSpellGrant = useCallback(
    (spellName: string) => {
      if (!character) return
      const tag = makeSourceTag('manual', 'User Choice', 'choice')
      patch(addGrant(ledger, 'spells', spellName, tag))
    },
    [character, ledger, patch],
  )

  const removeSpellProvenance = useCallback(
    (spellName: string) => {
      if (!character) return
      const normKey = normalizeKey(spellName)
      const newSpells = { ...ledger.spells }
      delete newSpells[normKey]
      patch({ ...ledger, spells: newSpells })
    },
    [character, ledger, patch],
  )

  /** Atomically remove old spell provenance and add replacement in one update. */
  const swapSpellProvenance = useCallback(
    (
      className: string,
      classSource: string | undefined,
      removedName: string,
      addedName: string,
    ) => {
      if (!character) return
      const removedKey = normalizeKey(removedName)
      const removedTags = ledger.spells[removedKey] ?? []
      const sourceRef = classSource ?? ''
      const removedClassTags = removedTags.filter(
        (tag) =>
          tag.sourceType === 'class' &&
          tag.sourceName === className &&
          (tag.sourceRef ?? '') === sourceRef,
      )
      const inheritedGrantedAtLevel = removedClassTags.find(
        (tag) => !!tag.spellGrantedAtLevel,
      )?.spellGrantedAtLevel

      // Remove only the swapped class grant; keep unrelated grants for this spell.
      const retainedTags = removedTags.filter(
        (tag) =>
          !(
            tag.sourceType === 'class' &&
            tag.sourceName === className &&
            (tag.sourceRef ?? '') === sourceRef
          ),
      )

      const updatedSpells = { ...ledger.spells }
      if (retainedTags.length > 0) {
        updatedSpells[removedKey] = retainedTags
      } else {
        delete updatedSpells[removedKey]
      }

      const withRemoval = { ...ledger, spells: updatedSpells }
      // Add replacement spell, inheriting the original pick's level attribution.
      const withAdd = applyClassSpellGrant(
        withRemoval,
        className,
        classSource,
        addedName,
        'choice',
        inheritedGrantedAtLevel ? { spellGrantedAtLevel: inheritedGrantedAtLevel } : {},
      )
      patch(withAdd)
    },
    [character, ledger, patch],
  )

  return {
    applySpellSelection,
    applyBatchSpellSelections,
    applyInferredClassSpellSelection,
    applyManualSpellGrant,
    removeSpellProvenance,
    swapSpellProvenance,
  }
}
