import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import type { Item5e } from '@/types/5etools'
import { itemTextTypes } from './itemEntryFixtures'

export const lute: Item5e = { name: 'Lute', source: 'PHB', type: 'INS', weight: 2, value: 3500 }
export const primaryInstrumentTypes = itemTextTypes.map((type) =>
  type.abbreviation === 'INS'
    ? { ...type, source: 'PHB', name: 'Instrument', entries: ['Standard instrument rules.'] }
    : { ...type, source: 'PHB' },
)
export const instrumentRules = {
  name: 'Instrument',
  source: 'XGE',
  appliesTo: 'INS|PHB',
  entries: [
    'Instrument category guidance.',
    { type: 'table', colLabels: ['Activity', 'DC'], rows: [['Identify a tune', '10']] },
  ],
}

export async function loadItemTypeText(
  items: Item5e[] = [lute],
  support: unknown = [instrumentRules],
  primary: unknown = itemTextTypes,
) {
  const payloads: Record<string, unknown> = {
    'items.json': { item: items },
    'items-base.json': {
      baseitem: [],
      itemType: primary,
      itemTypeAdditionalEntries: support,
    },
  }
  const failures: string[] = []
  const data = await new FiveEToolsDataLoader(
    { type: 'local', path: '/fixture', isValid: true, availableResources: Object.keys(payloads) },
    { type: 'local', readJson: async (file) => structuredClone(payloads[file]) },
  ).loadAllData({
    deferCopyResolutionErrors: true,
    onResourceFailure: (file) => {
      failures.push(file)
    },
  })
  if (failures.length) throw Error(`Unexpected resource failure: ${failures.join(',')}`)
  return data
}
