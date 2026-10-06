/** A materialized version owns all mechanics; the base retains selection identity and origin policy. */
export function getRaceSelectionParent<
  T extends {
    name: string
    source?: string
    _tavernBornFlexibleAsi?: boolean
    _tavernBornSuppressFlexibleAsi?: boolean
  },
>(race: T, subrace?: { _isVersion?: unknown }): Pick<T, 'name' | 'source'> & Partial<T> {
  if (subrace?._isVersion !== true) return race
  return {
    name: race.name,
    source: race.source,
    _tavernBornFlexibleAsi: race._tavernBornFlexibleAsi,
    _tavernBornSuppressFlexibleAsi: race._tavernBornSuppressFlexibleAsi,
  } as Pick<T, 'name' | 'source'> & Partial<T>
}
