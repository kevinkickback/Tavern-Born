import type { Feat5e } from '@/types/5etools'

// Mechanical prerequisite fields from the pinned 5etools corpus, without rules prose.
export const defensiveDuelistPrerequisite: Feat5e = {
  name: 'Defensive Duelist',
  source: 'PHB',
  prerequisite: [{ ability: [{ dex: 13 }] }],
}

export const athletePrerequisite: Feat5e = {
  name: 'Athlete',
  source: 'XPHB',
  prerequisite: [
    { level: 4, ability: [{ str: 13 }] },
    { level: 4, ability: [{ dex: 13 }] },
  ],
}

export const actorPrerequisite: Feat5e = {
  name: 'Actor',
  source: 'XPHB',
  prerequisite: [{ level: 4, ability: [{ cha: 13 }] }],
}
