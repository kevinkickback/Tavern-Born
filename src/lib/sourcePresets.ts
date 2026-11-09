export interface SourcePreset {
  id: 'recommended' | 'expanded'
  label: string
  description: string
  abbreviations: string[]
}

const RECOMMENDED_SOURCES = ['XGE', 'TCE', 'MPMM', 'ERLW', 'EGW', 'MOT', 'VRGR']

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'Popular player options compatible with both 2014 and 2024 editions.',
    abbreviations: RECOMMENDED_SOURCES,
  },
  {
    id: 'expanded',
    label: 'Expanded',
    description: 'Recommended sources plus more campaign settings supported by your ruleset.',
    abbreviations: [...RECOMMENDED_SOURCES, 'GGR', 'SCC', 'EFA', 'FRHOF', 'WOW'],
  },
]

export const IMPLICIT_SOURCES = new Set(['PHB', 'XPHB'])

export function getImplicitSource(originSystem: '2014' | '2024'): string {
  return originSystem === '2024' ? 'XPHB' : 'PHB'
}
