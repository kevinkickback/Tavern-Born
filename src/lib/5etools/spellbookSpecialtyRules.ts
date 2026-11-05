import type { Class5e, ClassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import {
  type ClassFeatureSourceCatalog,
  getFeatureSourceDigest,
  hasFeatureSourceShape,
} from './featureSourceAudit'

const domain = 'class-spellbook-specialty'
const normalize = (value: string) => value.trim().toLowerCase()

// The upstream capstone declarations carry only prose. Pin the exact feature bodies
// in the bundled and configured class-wizard.json (5etools b9061583).
const features = [
  {
    source: 'phb',
    name: 'Spell Mastery',
    level: 18,
    prose: '426233ee558cee575553f8fc74d22d6b37eb81fff6b7fad55da3994893ff1e3d',
  },
  {
    source: 'phb',
    name: 'Signature Spells',
    level: 20,
    prose: 'a07d471feadc2b37ab11b0b683cf3a09f6d6c3c88b6dcfab9ac5210432d7e778',
  },
  {
    source: 'xphb',
    name: 'Spell Mastery',
    level: 18,
    prose: '02b7015cdbecdc87244a42501b43e78c8c822119f86be64edc10a222615db309',
  },
  {
    source: 'xphb',
    name: 'Signature Spells',
    level: 20,
    prose: 'ef26ce327d761d0fcece92adcc862a2399eebdb21cf919143f511d9257369e87',
  },
].flatMap((feature) => {
  const target = getClassFeatureIdentity({
    name: feature.name,
    className: 'Wizard',
    classSource: feature.source,
    level: feature.level,
    source: feature.source,
  })
  return target ? [{ ...feature, target }] : []
})
const sourceFields = new Set([
  'name',
  'className',
  'classSource',
  'level',
  'source',
  'entries',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'page',
  'header',
  'featureOptionSourceConflict',
])

export function getSpellbookSpecialtyRule(slot: ManagedClassSpellSlot) {
  if (
    !Array.isArray(slot) ||
    slot.length !== 5 ||
    slot[1] !== domain ||
    !Array.isArray(slot[0]) ||
    slot[0].length !== 3 ||
    slot[0][0] !== 'class' ||
    slot[0][1] !== 'wizard' ||
    (slot[4] !== 0 && slot[4] !== 1)
  )
    return undefined
  return features.find(
    (row) => row.source === slot[0][2] && row.target === slot[2] && row.level === slot[3],
  )
}

/** Earned addresses do not depend on source availability, so rollback also retires empty slots. */
export function getSpellbookSpecialtySlots(entry: CharacterClassEntry): ManagedClassSpellSlot[] {
  if (normalize(entry.name) !== 'wizard') return []
  return features.flatMap((row) =>
    row.source === normalize(entry.source) && row.level <= entry.levels
      ? [0, 1].map(
          (ordinal): ManagedClassSpellSlot => [
            ['class', 'wizard', row.source],
            domain,
            row.target,
            row.level,
            ordinal,
          ],
        )
      : [],
  )
}

export function isCurrentSpellbookSpecialty(
  slot: ManagedClassSpellSlot,
  cls: Class5e,
  catalogs: ClassFeatureSourceCatalog,
) {
  const rule = getSpellbookSpecialtyRule(slot)
  if (!rule) return false
  const matches = (feature: ClassFeature) =>
    !feature.featureOptionSourceConflict &&
    hasFeatureSourceShape(feature, sourceFields) &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries, false) === rule.prose
  return !!getCurrentDirectClassFeature(cls, catalogs, rule.target, matches)
}
