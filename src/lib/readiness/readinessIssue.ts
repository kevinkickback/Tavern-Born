import { getEntityLookupKey } from '@/lib/5etools/lookups'
import type { CharacterClassEntry } from '@/types/character'
import type {
  CharacterReadinessIssue,
  CharacterReadinessSection,
  CharacterReadinessSeverity,
} from './types'

const SECTION_TARGETS: Record<CharacterReadinessSection, string> = {
  identity: '/',
  rules: '/rules',
  race: '/build/race',
  class: '/build/class',
  background: '/build/background',
  'ability-scores': '/build/ability-scores',
  proficiencies: '/build/proficiencies',
  feats: '/feats',
  spells: '/spells',
  equipment: '/equipment',
  portrait: '/details/portrait',
  sources: '/sources',
}

export function readinessIssue(
  id: string,
  severity: CharacterReadinessSeverity,
  section: CharacterReadinessSection,
  title: string,
  explanation: string,
): CharacterReadinessIssue {
  return { id, severity, section, title, explanation, navigationTarget: SECTION_TARGETS[section] }
}

export function readinessClassKey(entry: Pick<CharacterClassEntry, 'name' | 'source'>): string {
  return getEntityLookupKey(entry.name, entry.source)
}
