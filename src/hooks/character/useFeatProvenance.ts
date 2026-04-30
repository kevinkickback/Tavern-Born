import { useCallback } from 'react'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import {
  addAbilityBonus,
  addGrant,
  applyFeatGrant,
  applyOptionalFeatureGrant,
  makeSourceTag,
  removeGrantsBySource,
  resolveChoice,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ChoiceDomain, ProvenanceLedger } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'

interface UseFeatProvenanceParams {
  character: Character | null
  ledger: ProvenanceLedger
  patch: (newLedger: ProvenanceLedger) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
}

export function useFeatProvenance({
  character,
  ledger,
  patch,
  updateCharacter,
}: UseFeatProvenanceParams) {
  const applyFeatSelection = useCallback(
    (featName: string, featSource: string | undefined) => {
      if (!character) return
      const newLedger = applyFeatGrant(ledger, featName, featSource, true)
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const removeFeatProvenance = useCallback(
    (featName: string) => {
      if (!character) return
      const normKey = normalizeKey(featName)
      const newFeats = { ...ledger.feats }
      delete newFeats[normKey]
      patch({ ...ledger, feats: newFeats })
    },
    [character, ledger, patch],
  )

  const replaceFeatSelections = useCallback(
    (selectedFeats: Array<{ name: string; source?: string }>) => {
      if (!character) return
      const oldNames = new Set((character.feats ?? []).map((feat) => feat.name))
      const newNames = new Set(selectedFeats.map((feat) => feat.name))

      // Feats being removed that had option grants configured
      const removedWithOptions = (character.feats ?? []).filter(
        (f) => !newNames.has(f.name) && f.options != null,
      )

      let newLedger = { ...ledger, feats: { ...ledger.feats } }
      for (const name of oldNames) {
        if (!newNames.has(name)) {
          const normKey = normalizeKey(name)
          delete newLedger.feats[normKey]
        }
      }
      for (const feat of selectedFeats) {
        if (!oldNames.has(feat.name)) {
          newLedger = applyFeatGrant(newLedger, feat.name, feat.source, true)
        }
      }

      // Retract option grants for each removed feat atomically in this same update
      let nextSpellProfiles = character.spells.spellProfiles
      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }
      let newAbilityScores = { ...character.abilityScores }

      for (const removedFeat of removedWithOptions) {
        const opts = removedFeat.options as NonNullable<typeof removedFeat.options>

        // Retract spell grants from special profile
        const spellNames = new Set((opts.spells ?? []).map((key) => key.split('|')[0]))
        if (spellNames.size > 0) {
          nextSpellProfiles = nextSpellProfiles.map((p) => {
            if (p.id !== SPECIAL_SPELL_PROFILE_ID) return p
            return {
              ...p,
              cantrips: p.cantrips.filter((s) => !spellNames.has(s)),
              spellsKnown: p.spellsKnown.filter((s) => !spellNames.has(s)),
            }
          })
        }

        // Retract skill proficiencies
        for (const skillName of opts.skills ?? []) {
          const normKey = normalizeKey(skillName)
          newProficiencies = {
            ...newProficiencies,
            skills: newProficiencies.skills.filter((s) => normalizeKey(s) !== normKey),
          }
          const existing = newSkills[normKey]
          newSkills[normKey] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
        }

        // Retract language and tool proficiencies
        for (const lang of opts.languages ?? []) {
          newProficiencies = {
            ...newProficiencies,
            languages: newProficiencies.languages.filter((l) => l !== lang),
          }
        }
        for (const tool of opts.tools ?? []) {
          newProficiencies = {
            ...newProficiencies,
            tools: newProficiencies.tools.filter((t) => t !== tool),
          }
        }

        // Retract ability score bonus
        if (opts.abilityScore) {
          const abilityName = normalizeAbilityName(opts.abilityScore)
          if (abilityName) {
            newAbilityScores = {
              ...newAbilityScores,
              [abilityName]: Math.max(1, (newAbilityScores[abilityName] ?? 10) - 1),
            }
          }
        }

        // Retract expertise
        if (opts.expertiseSkill) {
          const normKey = normalizeKey(opts.expertiseSkill)
          const existing = newSkills[normKey]
          newSkills[normKey] = {
            proficient: existing?.proficient ?? false,
            expertise: false,
            bonus: existing?.bonus ?? 0,
          }
        }

        // Remove all provenance records attributed to this feat's option grants
        newLedger = removeGrantsBySource(newLedger, 'feat', removedFeat.name)
      }

      updateCharacter(character.id, {
        feats: selectedFeats.map((feat) => {
          const existing = (character.feats ?? []).find((f) => f.name === feat.name)
          return {
            id: existing?.id ?? `${feat.name}-${feat.source ?? ''}`,
            name: feat.name,
            source: feat.source ?? '',
            description: existing?.description ?? '',
            options: existing?.options,
          }
        }),
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  const applyOptionalFeatureSelection = useCallback(
    (
      featureName: string,
      featureSource: string | undefined,
      grantingSourceName: string,
      grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
    ) => {
      if (!character) return
      const newLedger = applyOptionalFeatureGrant(
        ledger,
        featureName,
        featureSource,
        grantingSourceName,
        grantingSourceType,
      )
      patch(newLedger)
    },
    [character, ledger, patch],
  )

  const resolveFeatChoiceSelection = useCallback(
    (choiceId: string, feat: { name: string; source?: string }) => {
      if (!character) return
      const choice = ledger.choices.find((c) => c.id === choiceId && c.domain === 'feats')
      if (!choice) return

      let newLedger = ledger

      // If already resolved, remove previous selections from feats map before replacing
      if (choice.selected.length > 0) {
        for (const prevName of choice.selected) {
          const normKey = normalizeKey(prevName)
          const tags = newLedger.feats[normKey] ?? []
          const filtered = tags.filter(
            (t) => !(t.grantType === 'choice' && t.sourceName === choice.sourceTag.sourceName),
          )
          const newFeats =
            filtered.length > 0
              ? { ...newLedger.feats, [normKey]: filtered }
              : Object.fromEntries(Object.entries(newLedger.feats).filter(([k]) => k !== normKey))
          newLedger = { ...newLedger, feats: newFeats }
        }
        newLedger = resolveChoice(newLedger, choiceId, [feat.name])
      } else if (choice.selected.length < choice.chooseCount) {
        newLedger = resolveChoice(newLedger, choiceId, [...choice.selected, feat.name])
      } else {
        return
      }

      const tag = makeSourceTag(
        choice.sourceTag.sourceType,
        choice.sourceTag.sourceName,
        'choice',
        choice.sourceTag.sourceRef,
      )
      newLedger = addGrant(newLedger, 'feats', feat.name, tag)

      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, ledger, updateCharacter],
  )

  const removeFeatChoiceSelection = useCallback(
    (choiceId: string, featName: string) => {
      if (!character) return
      const normKey = normalizeKey(featName)
      const choice = ledger.choices.find((c) => c.id === choiceId && c.domain === 'feats')
      if (!choice) return

      const newSelected = choice.selected.filter((s) => normalizeKey(s) !== normKey)
      let newLedger = resolveChoice(ledger, choiceId, newSelected)

      const tags = newLedger.feats[normKey] ?? []
      const filtered = tags.filter(
        (t) => !(t.grantType === 'choice' && t.sourceName === choice.sourceTag.sourceName),
      )
      const newFeats =
        filtered.length > 0
          ? { ...newLedger.feats, [normKey]: filtered }
          : Object.fromEntries(Object.entries(newLedger.feats).filter(([k]) => k !== normKey))
      newLedger = { ...newLedger, feats: newFeats }

      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, ledger, updateCharacter],
  )

  const resolveChoiceSelection = useCallback(
    (
      domain: Extract<ChoiceDomain, 'skills' | 'languages' | 'tools' | 'armor' | 'weapons'>,
      itemName: string,
      adding: boolean,
      choiceId?: string,
    ) => {
      if (!character) return
      const normKey = normalizeKey(itemName)

      if (adding) {
        const matchingChoice = choiceId
          ? ledger.choices.find(
              (choice) =>
                choice.id === choiceId &&
                choice.domain === domain &&
                choice.selected.length < choice.chooseCount,
            )
          : (() => {
              const candidates = ledger.choices.filter(
                (choice) =>
                  choice.domain === domain &&
                  choice.selected.length < choice.chooseCount &&
                  (choice.optionPool.length === 0 ||
                    choice.optionPool.some((poolEntry) => normalizeKey(poolEntry) === normKey)),
              )
              return (
                candidates.find((c) => c.optionPool.length > 0) ?? candidates[0]
              )
            })()
        if (!matchingChoice) return

        const newSelected = [...matchingChoice.selected, itemName]
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected)
        const tag = makeSourceTag(
          matchingChoice.sourceTag.sourceType,
          matchingChoice.sourceTag.sourceName,
          'choice',
          matchingChoice.sourceTag.sourceRef,
        )
        newLedger = addGrant(newLedger, domain, itemName, tag)

        if (domain === 'skills') {
          const nextSkillProficiencies = [
            ...new Set([...(character.proficiencies.skills ?? []), normalizeKey(itemName)]),
          ]
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              skills: nextSkillProficiencies,
            },
            skills: {
              ...(character.skills ?? {}),
              [normKey]: {
                ...(character.skills?.[normKey] ?? {
                  bonus: 0,
                  expertise: false,
                }),
                proficient: true,
              },
            },
          })
        } else {
          const profDomain = domain as 'armor' | 'weapons' | 'tools' | 'languages'
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              [profDomain]: [...new Set([...character.proficiencies[profDomain], itemName])],
            },
          })
        }
      } else {
        const matchingChoice = choiceId
          ? ledger.choices.find(
              (choice) =>
                choice.id === choiceId &&
                choice.domain === domain &&
                choice.selected.some((selected) => normalizeKey(selected) === normKey),
            )
          : ledger.choices.find(
              (choice) =>
                choice.domain === domain &&
                choice.selected.some((selected) => normalizeKey(selected) === normKey),
            )
        if (!matchingChoice) return

        const newSelected = matchingChoice.selected.filter(
          (selected) => normalizeKey(selected) !== normKey,
        )
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected)

        const map = newLedger.proficiencies[
          domain as keyof typeof newLedger.proficiencies
        ] as Record<string, import('@/lib/provenance/types').SourceTag[]>
        if (map) {
          const tags = map[normKey] ?? []
          const filtered = tags.filter(
            (tag) =>
              !(
                tag.grantType === 'choice' && tag.sourceName === matchingChoice.sourceTag.sourceName
              ),
          )
          const newMap =
            filtered.length > 0
              ? { ...map, [normKey]: filtered }
              : Object.fromEntries(Object.entries(map).filter(([key]) => key !== normKey))
          newLedger = {
            ...newLedger,
            proficiencies: { ...newLedger.proficiencies, [domain]: newMap },
          }
        }

        if (domain === 'skills') {
          const nextSkillProficiencies = (character.proficiencies.skills ?? []).filter(
            (proficiency) => normalizeKey(proficiency) !== normKey,
          )
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              skills: nextSkillProficiencies,
            },
            skills: {
              ...(character.skills ?? {}),
              [normKey]: {
                ...(character.skills?.[normKey] ?? {}),
                proficient: false,
                expertise: false,
              },
            },
          })
        } else {
          const profDomain = domain as 'armor' | 'weapons' | 'tools' | 'languages'
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              [profDomain]: character.proficiencies[profDomain].filter(
                (proficiency) => normalizeKey(proficiency) !== normKey,
              ),
            },
          })
        }
      }
    },
    [character, ledger, updateCharacter],
  )

  /**
   * Commit a feat together with its follow-up option selections.
   * Writes the feat (with `options` field), applies spell/proficiency/ability grants,
   * and removes any pending `featOptions` choice record for this feat.
   */
  const commitFeatWithOptions = useCallback(
    (
      feat: { name: string; source?: string },
      selections: FeatOptionSelections,
      allSpells?: Spell5e[],
    ) => {
      if (!character) return

      const featTag = makeSourceTag('feat', feat.name, 'choice', feat.source)
      let newLedger = ledger

      // ── Spell grants ────────────────────────────────────────────────────────
      const existingSpecial = character.spells.spellProfiles.find(
        (p) => p.id === SPECIAL_SPELL_PROFILE_ID,
      )
      const nextCantrips = [...(existingSpecial?.cantrips ?? [])]
      const nextSpellsKnown = [...(existingSpecial?.spellsKnown ?? [])]

      for (const compositeKey of selections.spells ?? []) {
        const spellName = compositeKey.split('|')[0]
        newLedger = addGrant(newLedger, 'spells', spellName, featTag)
        const spellData = allSpells?.find(
          (s) => `${s.name}|${s.source ?? ''}` === compositeKey || s.name === spellName,
        )
        if (spellData?.level === 0) {
          if (!nextCantrips.includes(spellName)) nextCantrips.push(spellName)
        } else {
          if (!nextSpellsKnown.includes(spellName)) nextSpellsKnown.push(spellName)
        }
      }

      const nextSpellProfiles = existingSpecial
        ? character.spells.spellProfiles.map((p) =>
            p.id === SPECIAL_SPELL_PROFILE_ID
              ? { ...p, cantrips: nextCantrips, spellsKnown: nextSpellsKnown }
              : p,
          )
        : [
            ...character.spells.spellProfiles,
            {
              id: SPECIAL_SPELL_PROFILE_ID,
              type: 'special' as const,
              label: 'Special',
              cantrips: nextCantrips,
              spellsKnown: nextSpellsKnown,
              preparedSpells: [],
              alwaysPrepared: true,
            },
          ]

      // ── Proficiency grants ──────────────────────────────────────────────────
      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }

      for (const skillName of selections.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newLedger = addGrant(newLedger, 'skills', skillName, featTag)
        if (!newProficiencies.skills.includes(normKey)) {
          newProficiencies = { ...newProficiencies, skills: [...newProficiencies.skills, normKey] }
        }
        newSkills[normKey] = {
          proficient: true,
          expertise: newSkills[normKey]?.expertise ?? false,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }

      for (const lang of selections.languages ?? []) {
        newLedger = addGrant(newLedger, 'languages', lang, featTag)
        if (!newProficiencies.languages.includes(lang)) {
          newProficiencies = {
            ...newProficiencies,
            languages: [...newProficiencies.languages, lang],
          }
        }
      }

      for (const tool of selections.tools ?? []) {
        newLedger = addGrant(newLedger, 'tools', tool, featTag)
        if (!newProficiencies.tools.includes(tool)) {
          newProficiencies = { ...newProficiencies, tools: [...newProficiencies.tools, tool] }
        }
      }

      // ── Ability score grant ─────────────────────────────────────────────────
      let newAbilityScores = { ...character.abilityScores }
      if (selections.abilityScore) {
        const abilityName = normalizeAbilityName(selections.abilityScore)
        if (abilityName) {
          newLedger = addAbilityBonus(newLedger, {
            ability: abilityName,
            value: 1,
            sourceTag: featTag,
          })
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: (newAbilityScores[abilityName] ?? 10) + 1,
          }
        }
      }

      // ── Optional feature grant ──────────────────────────────────────────────
      if (selections.optionalFeature) {
        newLedger = addGrant(newLedger, 'features', selections.optionalFeature, featTag)
      }

      // ── Expertise grant ─────────────────────────────────────────────────────
      if (selections.expertiseSkill) {
        const normKey = normalizeKey(selections.expertiseSkill)
        newSkills[normKey] = {
          proficient: newSkills[normKey]?.proficient ?? true,
          expertise: true,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }

      // ── Remove pending featOptions choice record ─────────────────────────────
      newLedger = {
        ...newLedger,
        choices: newLedger.choices.filter(
          (c) => !(c.domain === 'featOptions' && c.sourceTag.sourceName === feat.name),
        ),
      }

      // ── Write feat with options ──────────────────────────────────────────────
      const nextFeats = (character.feats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: selections } : f,
      )
      const nextSpecialFeats = (character.specialFeats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: selections } : f,
      )

      updateCharacter(character.id, {
        feats: nextFeats,
        specialFeats: nextSpecialFeats,
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  /**
   * Retract all grants made by a feat's option selections.
   * Call before removing a feat that has `options` set.
   */
  const retractFeatOptionGrants = useCallback(
    (feat: { name: string }, featOptions: FeatOptionSelections) => {
      if (!character) return

      // Remove all provenance records attributed to this feat
      const newLedger = removeGrantsBySource(ledger, 'feat', feat.name)

      // Remove feat-granted spells from special profile
      const spellNames = new Set((featOptions.spells ?? []).map((key) => key.split('|')[0]))
      const nextSpellProfiles = character.spells.spellProfiles.map((p) => {
        if (p.id !== SPECIAL_SPELL_PROFILE_ID) return p
        return {
          ...p,
          cantrips: p.cantrips.filter((s) => !spellNames.has(s)),
          spellsKnown: p.spellsKnown.filter((s) => !spellNames.has(s)),
        }
      })

      // Retract skill proficiencies
      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }

      for (const skillName of featOptions.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newProficiencies = {
          ...newProficiencies,
          skills: newProficiencies.skills.filter((s) => normalizeKey(s) !== normKey),
        }
        const existing = newSkills[normKey]
        newSkills[normKey] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
      }

      for (const lang of featOptions.languages ?? []) {
        newProficiencies = {
          ...newProficiencies,
          languages: newProficiencies.languages.filter((l) => l !== lang),
        }
      }

      for (const tool of featOptions.tools ?? []) {
        newProficiencies = {
          ...newProficiencies,
          tools: newProficiencies.tools.filter((t) => t !== tool),
        }
      }

      // Retract ability score bonus
      let newAbilityScores = { ...character.abilityScores }
      if (featOptions.abilityScore) {
        const abilityName = normalizeAbilityName(featOptions.abilityScore)
        if (abilityName) {
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: Math.max(1, (newAbilityScores[abilityName] ?? 10) - 1),
          }
        }
      }

      // Retract expertise
      if (featOptions.expertiseSkill) {
        const normKey = normalizeKey(featOptions.expertiseSkill)
        const existing = newSkills[normKey]
        newSkills[normKey] = {
          proficient: existing?.proficient ?? false,
          expertise: false,
          bonus: existing?.bonus ?? 0,
        }
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  /**
   * Atomically retract old feat option grants and apply new ones.
   * Use when the user re-opens FeatOptionsModal to edit an already-configured feat.
   */
  const editFeatWithOptions = useCallback(
    (
      feat: { name: string; source?: string },
      oldOptions: FeatOptionSelections,
      newSelections: FeatOptionSelections,
      allSpells?: Spell5e[],
    ) => {
      if (!character) return

      // ── Step 1: Retract old grants ──────────────────────────────────────────
      let newLedger = removeGrantsBySource(ledger, 'feat', feat.name)

      const oldSpellNames = new Set((oldOptions.spells ?? []).map((key) => key.split('|')[0]))
      let nextSpellProfiles = character.spells.spellProfiles.map((p) => {
        if (p.id !== SPECIAL_SPELL_PROFILE_ID) return p
        return {
          ...p,
          cantrips: p.cantrips.filter((s) => !oldSpellNames.has(s)),
          spellsKnown: p.spellsKnown.filter((s) => !oldSpellNames.has(s)),
        }
      })

      let newProficiencies = { ...character.proficiencies }
      const newSkills = { ...(character.skills ?? {}) }

      for (const skillName of oldOptions.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newProficiencies = {
          ...newProficiencies,
          skills: newProficiencies.skills.filter((s) => normalizeKey(s) !== normKey),
        }
        const existing = newSkills[normKey]
        newSkills[normKey] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
      }
      for (const lang of oldOptions.languages ?? []) {
        newProficiencies = {
          ...newProficiencies,
          languages: newProficiencies.languages.filter((l) => l !== lang),
        }
      }
      for (const tool of oldOptions.tools ?? []) {
        newProficiencies = {
          ...newProficiencies,
          tools: newProficiencies.tools.filter((t) => t !== tool),
        }
      }

      let newAbilityScores = { ...character.abilityScores }
      if (oldOptions.abilityScore) {
        const abilityName = normalizeAbilityName(oldOptions.abilityScore)
        if (abilityName) {
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: Math.max(1, (newAbilityScores[abilityName] ?? 10) - 1),
          }
        }
      }
      if (oldOptions.expertiseSkill) {
        const normKey = normalizeKey(oldOptions.expertiseSkill)
        const existing = newSkills[normKey]
        newSkills[normKey] = {
          proficient: existing?.proficient ?? false,
          expertise: false,
          bonus: existing?.bonus ?? 0,
        }
      }

      // ── Step 2: Apply new grants ────────────────────────────────────────────
      const featTag = makeSourceTag('feat', feat.name, 'choice', feat.source)

      const existingSpecial = nextSpellProfiles.find((p) => p.id === SPECIAL_SPELL_PROFILE_ID)
      const nextCantrips = [...(existingSpecial?.cantrips ?? [])]
      const nextSpellsKnown = [...(existingSpecial?.spellsKnown ?? [])]

      for (const compositeKey of newSelections.spells ?? []) {
        const spellName = compositeKey.split('|')[0]
        newLedger = addGrant(newLedger, 'spells', spellName, featTag)
        const spellData = allSpells?.find(
          (s) => `${s.name}|${s.source ?? ''}` === compositeKey || s.name === spellName,
        )
        if (spellData?.level === 0) {
          if (!nextCantrips.includes(spellName)) nextCantrips.push(spellName)
        } else {
          if (!nextSpellsKnown.includes(spellName)) nextSpellsKnown.push(spellName)
        }
      }

      nextSpellProfiles = existingSpecial
        ? nextSpellProfiles.map((p) =>
            p.id === SPECIAL_SPELL_PROFILE_ID
              ? { ...p, cantrips: nextCantrips, spellsKnown: nextSpellsKnown }
              : p,
          )
        : [
            ...nextSpellProfiles,
            {
              id: SPECIAL_SPELL_PROFILE_ID,
              type: 'special' as const,
              label: 'Special',
              cantrips: nextCantrips,
              spellsKnown: nextSpellsKnown,
              preparedSpells: [],
              alwaysPrepared: true,
            },
          ]

      for (const skillName of newSelections.skills ?? []) {
        const normKey = normalizeKey(skillName)
        newLedger = addGrant(newLedger, 'skills', skillName, featTag)
        if (!newProficiencies.skills.includes(normKey)) {
          newProficiencies = { ...newProficiencies, skills: [...newProficiencies.skills, normKey] }
        }
        newSkills[normKey] = {
          proficient: true,
          expertise: newSkills[normKey]?.expertise ?? false,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }
      for (const lang of newSelections.languages ?? []) {
        newLedger = addGrant(newLedger, 'languages', lang, featTag)
        if (!newProficiencies.languages.includes(lang)) {
          newProficiencies = {
            ...newProficiencies,
            languages: [...newProficiencies.languages, lang],
          }
        }
      }
      for (const tool of newSelections.tools ?? []) {
        newLedger = addGrant(newLedger, 'tools', tool, featTag)
        if (!newProficiencies.tools.includes(tool)) {
          newProficiencies = { ...newProficiencies, tools: [...newProficiencies.tools, tool] }
        }
      }

      if (newSelections.abilityScore) {
        const abilityName = normalizeAbilityName(newSelections.abilityScore)
        if (abilityName) {
          newLedger = addAbilityBonus(newLedger, {
            ability: abilityName,
            value: 1,
            sourceTag: featTag,
          })
          newAbilityScores = {
            ...newAbilityScores,
            [abilityName]: (newAbilityScores[abilityName] ?? 10) + 1,
          }
        }
      }
      if (newSelections.optionalFeature) {
        newLedger = addGrant(newLedger, 'features', newSelections.optionalFeature, featTag)
      }
      if (newSelections.expertiseSkill) {
        const normKey = normalizeKey(newSelections.expertiseSkill)
        newSkills[normKey] = {
          proficient: newSkills[normKey]?.proficient ?? true,
          expertise: true,
          bonus: newSkills[normKey]?.bonus ?? 0,
        }
      }

      // Remove any stale pending choice record
      newLedger = {
        ...newLedger,
        choices: newLedger.choices.filter(
          (c) => !(c.domain === 'featOptions' && c.sourceTag.sourceName === feat.name),
        ),
      }

      const nextFeats = (character.feats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: newSelections } : f,
      )
      const nextSpecialFeats = (character.specialFeats ?? []).map((f) =>
        f.name === feat.name ? { ...f, options: newSelections } : f,
      )

      updateCharacter(character.id, {
        feats: nextFeats,
        specialFeats: nextSpecialFeats,
        provenance: newLedger,
        spells: { ...character.spells, spellProfiles: nextSpellProfiles },
        proficiencies: newProficiencies,
        skills: newSkills,
        abilityScores: newAbilityScores,
      })
    },
    [character, ledger, updateCharacter],
  )

  return {
    applyFeatSelection,
    removeFeatProvenance,
    replaceFeatSelections,
    applyOptionalFeatureSelection,
    resolveFeatChoiceSelection,
    removeFeatChoiceSelection,
    resolveChoiceSelection,
    commitFeatWithOptions,
    retractFeatOptionGrants,
    editFeatWithOptions,
  }
}
