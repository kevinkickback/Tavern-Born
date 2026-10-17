import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import type { Item5e } from '@/types/5etools'
import { itemTextTypes } from './itemEntryFixtures'

export const shieldTemplate = {
  name: '+1 Shield (*)',
  type: 'GV|DMG',
  requires: [{ shield: true }],
  excludes: { net: true },
  entries: ['Reference shield rules.'],
  inherits: { source: 'DMG', bonusAc: '+1', entries: ['Gain {=bonusAc} AC.'] },
}

export function loadMagicTemplates(templates: unknown[], items: Item5e[] = [], support = {}) {
  const payloads: Record<string, unknown> = {
    'items.json': { item: items },
    'items-base.json': { baseitem: [], itemType: itemTextTypes, ...support },
    'magicvariants.json': { magicvariant: templates },
  }
  return new FiveEToolsDataLoader(
    { type: 'local', path: '/fixture', isValid: true, availableResources: Object.keys(payloads) },
    { type: 'local', readJson: async (file) => structuredClone(payloads[file]) },
  ).loadAllData()
}
