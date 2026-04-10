export interface SourcePreset {
  id: '2014-recommended' | '2024-recommended' | 'expanded';
  label: string;
  description: string;
  abbreviations: string[];
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: '2014-recommended',
    label: '2014 Recommended',
    description:
      "Player's Handbook 2014 plus compatible expanded player options.",
    abbreviations: ['PHB', 'XGE', 'TCE', 'MPMM', 'ERLW', 'EGW', 'MOT', 'VRGR'],
  },
  {
    id: '2024-recommended',
    label: '2024 Recommended',
    description:
      "Player's Handbook 2024 plus compatible expanded player options.",
    abbreviations: ['XPHB', 'XGE', 'TCE', 'MPMM', 'ERLW', 'EGW', 'MOT', 'VRGR'],
  },
  {
    id: 'expanded',
    label: 'Expanded',
    description:
      'Recommended sources plus setting-focused books with narrower use cases.',
    abbreviations: [
      'PHB',
      'XPHB',
      'XGE',
      'TCE',
      'MPMM',
      'ERLW',
      'EGW',
      'MOT',
      'VRGR',
      'GGR',
      'SCC',
    ],
  },
];

export const LARGE_SOURCE_WARNING_THRESHOLD = 15;
