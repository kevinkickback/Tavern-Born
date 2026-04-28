export interface SourcePreset {
  id: 'recommended' | 'expanded'
  label: string
  description: string
  abbreviations: string[]
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'Popular player options compatible with both 2014 and 2024 editions.',
    abbreviations: ['XGE', 'TCE', 'MPMM', 'ERLW', 'EGW', 'MOT', 'VRGR'],
  },
  {
    id: 'expanded',
    label: 'Expanded',
    description: 'Recommended sources plus setting-focused books with narrower use cases.',
    abbreviations: ['XGE', 'TCE', 'MPMM', 'ERLW', 'EGW', 'MOT', 'VRGR', 'GGR', 'SCC'],
  },
]

export const LARGE_SOURCE_WARNING_THRESHOLD = 15

/** Sources always included based on the character's origin system — never toggled by the user. */
export const IMPLICIT_SOURCES = new Set(['PHB', 'XPHB'])

/** Returns the implicit core sourcebook for the given origin system. */
export function getImplicitSource(originSystem: '2014' | '2024'): string {
  return originSystem === '2024' ? 'XPHB' : 'PHB'
}
