import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getEarnedDirectClassFeature } from './earnedClassFeatureSource'
import { getFeatureSourceDigest } from './featureSourceAudit'

const rules = [
  [
    'sorcerer',
    'Innate Sorcery',
    'Innate Sorcery',
    'long',
    [[1, 2]],
    'f9c6c56dcd823b39d25ac80ce8fd6a87b5fb8d4d74e5ad1ea17fd7ef2b5f12ca',
  ],
  [
    'wizard',
    'Arcane Recovery',
    'Arcane Recovery',
    'long',
    [[1, 1]],
    '34b9591e6c0451b2150d0867d683a9026f4c153b7aa6b1557126c6ef4bd2e5fa',
  ],
  [
    'paladin',
    'Lay on Hands',
    'Lay on Hands (HP)',
    'long',
    [[1, 5]],
    '7ff3dc12ff4f851bccd4c927fc82cafaac445dd1b285fddaa3f950f055607464',
  ],
  [
    'fighter',
    'Action Surge',
    'Action Surge',
    'short',
    [
      [2, 1],
      [17, 1],
    ],
    'a97eaae96178105fdf999445c013166e0dae501cb7198a84233935bd32cf7521',
  ],
  [
    'fighter',
    'Indomitable',
    'Indomitable',
    'long',
    [
      [9, 1],
      [13, 1],
      [17, 1],
    ],
    'c766e3de29518015d7b40ae8e0f5ea592cb8dbfc87aac425d9f8a61005bfee0d',
  ],
  [
    'monk',
    'Uncanny Metabolism',
    'Uncanny Metabolism',
    'long',
    [[2, 1]],
    'da3ce00c7a655af45fc5425dc9db544ece2b7f870dea66f06a49490af550db76',
  ],
] as const

export function getInheritedClassResources(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: Parameters<typeof getEarnedDirectClassFeature>[2],
): ClassResourceDef[] {
  return rules.flatMap(([template, name, label, restType, gains, digest]) => {
    if (norm(entry.name) === template && norm(entry.source) === 'xphb') return []
    const earned = gains.filter(([level]) =>
      getEarnedDirectClassFeature(
        character,
        entry,
        catalogs,
        `class-feature|${norm(name)}|${template}|xphb|${level}|xphb`,
        (row) =>
          Array.isArray(row.entries) && getFeatureSourceDigest(row.entries, false) === digest,
      ),
    )
    if (!earned.length || earned[0][0] !== gains[0][0]) return []
    const maxPerLevel = Array.from({ length: 20 }, (_, index) =>
      earned.reduce(
        (max, [level, amount]) =>
          max + (index + 1 >= level ? amount * (name === 'Lay on Hands' ? index + 1 : 1) : 0),
        0,
      ),
    )
    return [
      {
        id: `class-feature-resource:${JSON.stringify([norm(entry.name), norm(entry.source), template, norm(name)])}`,
        inheritedFeature: true,
        label,
        maxPerLevel,
        restType,
      },
    ]
  })
}
