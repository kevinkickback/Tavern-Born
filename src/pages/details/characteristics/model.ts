import { CUSTOM_ORGANIZATION_KEY } from '@/lib/character/organizationConstants'
import type { Character } from '@/types/character'

export type CharacteristicsSection = 'identity' | 'personality' | 'story' | 'connections'

export const CUSTOM_GRADIENT_PRESETS = [
  { key: 'indigo', className: 'from-indigo-500/80 to-indigo-700/80' },
  { key: 'emerald', className: 'from-emerald-500/80 to-emerald-700/80' },
  { key: 'rose', className: 'from-rose-500/80 to-rose-700/80' },
  { key: 'amber', className: 'from-amber-500/80 to-amber-700/80' },
  { key: 'sky', className: 'from-sky-500/80 to-sky-700/80' },
  { key: 'violet', className: 'from-violet-500/80 to-violet-700/80' },
] as const

export const DEFAULT_CUSTOM_GRADIENT = CUSTOM_GRADIENT_PRESETS[0].key

export interface CharacteristicsDraft {
  playerName: string
  gender: string
  faith: string
  alignment: string
  lifestyle: string
  age: string
  height: string
  weight: string
  eyes: string
  hair: string
  skin: string
  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  goals: string
  fears: string
  backstory: string
  appearance: string
  organizationSelectionKey: string
  organizationCustomName: string
  organizationCustomDescription: string
  organizationCustomImage: string
  organizationCustomGradient: string
}

export function createCharacteristicsDraft(character?: Character | null): CharacteristicsDraft {
  const details = character?.details
  const hasOrganizationState = Boolean(
    details?.organizationSelectionKey ||
      details?.organizationCustomName ||
      details?.organizationCustomDescription ||
      details?.organizationCustomImage,
  )

  return {
    playerName: details?.playerName || '',
    gender: details?.gender || '',
    faith: details?.faith || '',
    alignment: details?.alignment || '',
    lifestyle: details?.lifestyle || '',
    age: details?.age?.toString() || '',
    height: details?.height || '',
    weight: details?.weight || '',
    eyes: details?.eyes || '',
    hair: details?.hair || '',
    skin: details?.skin || '',
    personalityTraits: details?.personalityTraits || '',
    ideals: details?.ideals || '',
    bonds: details?.bonds || '',
    flaws: details?.flaws || '',
    goals: details?.goals || '',
    fears: details?.fears || '',
    backstory: details?.backstory || '',
    appearance: details?.appearance || '',
    organizationSelectionKey: hasOrganizationState
      ? details?.organizationSelectionKey || ''
      : details?.alliesAndOrganizations
        ? CUSTOM_ORGANIZATION_KEY
        : '',
    organizationCustomName: hasOrganizationState ? details?.organizationCustomName || '' : '',
    organizationCustomDescription: hasOrganizationState
      ? details?.organizationCustomDescription || ''
      : details?.alliesAndOrganizations || '',
    organizationCustomImage: hasOrganizationState ? details?.organizationCustomImage || '' : '',
    organizationCustomGradient: hasOrganizationState
      ? details?.organizationCustomGradient || DEFAULT_CUSTOM_GRADIENT
      : DEFAULT_CUSTOM_GRADIENT,
  }
}

export function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'ORG'
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}
