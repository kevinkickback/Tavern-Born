import type { Race5e } from '@/types/5etools'
import type { Character, CharacterMovement, MovementMode } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getCharacterEffectResolutionContext, getCharacterEffects } from './characterEffects'
import { resolveNumericEffect } from './effects'

const MOVEMENT_MODES: readonly MovementMode[] = ['walk', 'climb', 'swim', 'fly', 'burrow']

export interface EffectiveMovement {
  speeds: Readonly<Record<string, number>>
  hover: boolean
  other: Readonly<Record<string, number | boolean>>
  unresolvedInheritedModes: readonly MovementMode[]
  source: CharacterMovement['source']
}

function isMovementMode(value: string): value is MovementMode {
  return (MOVEMENT_MODES as readonly string[]).includes(value)
}

function normalizeDistance(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
}

/** Converts a resolved race/subrace speed shape into Tavern-Born's persisted movement contract. */
export function normalizeRaceMovement(race: Race5e, subrace?: Race5e): CharacterMovement {
  const owner = subrace?.speed !== undefined ? subrace : race
  const rawSpeed = owner.speed
  const speeds: Partial<Record<MovementMode, number>> = {}
  const other: Record<string, number | boolean> = {}
  const unresolvedInheritedModes: MovementMode[] = []
  let hover = false

  if (typeof rawSpeed === 'number') {
    const walk = normalizeDistance(rawSpeed)
    if (walk !== undefined) speeds.walk = walk
  } else if (rawSpeed && typeof rawSpeed === 'object') {
    const raw = rawSpeed as Record<string, unknown>
    const walk = normalizeDistance(raw.walk)
    if (walk !== undefined) speeds.walk = walk

    for (const [rawMode, rawValue] of Object.entries(raw)) {
      const mode = rawMode.toLowerCase()
      if (mode === 'walk') continue
      if (mode === 'hover' || mode === 'canhover') {
        hover ||= rawValue === true
        continue
      }

      if (isMovementMode(mode)) {
        const distance = normalizeDistance(rawValue)
        if (distance !== undefined) {
          speeds[mode] = distance
        } else if (rawValue === true) {
          if (walk !== undefined) speeds[mode] = walk
          else unresolvedInheritedModes.push(mode)
        }
        continue
      }

      const distance = normalizeDistance(rawValue)
      if (distance !== undefined) other[rawMode] = distance
      else if (typeof rawValue === 'boolean') other[rawMode] = rawValue
    }
  }

  return {
    speeds,
    ...(hover ? { hover: true } : {}),
    ...(Object.keys(other).length > 0 ? { other } : {}),
    ...(unresolvedInheritedModes.length > 0 ? { unresolvedInheritedModes } : {}),
    source: {
      kind: 'race',
      name: owner.name,
      source: owner.source || undefined,
    },
  }
}

/** Reads structured movement, falling back to the legacy walking-speed mirror when necessary. */
export function getBaseCharacterMovement(
  character: Pick<Character, 'movement' | 'speed'>,
): CharacterMovement {
  if (character.movement) return character.movement
  const legacyWalk = normalizeDistance(character.speed)
  return {
    speeds: legacyWalk === undefined ? {} : { walk: legacyWalk },
    source: { kind: 'legacy', name: 'Legacy walking speed' },
  }
}

/** Applies labeled adjustments and then exact overrides to the character's base movement. */
export function getEffectiveCharacterMovement(
  character: Pick<Character, 'speed'> &
    Partial<
      Pick<
        Character,
        | 'effectFlags'
        | 'equipment'
        | 'manualEffects'
        | 'movement'
        | 'movementAdjustments'
        | 'movementHoverOverride'
        | 'movementOverrides'
        | 'suppressedEffectIds'
      >
    >,
  sourceEffects: readonly CharacterEffect[] = [],
): EffectiveMovement {
  const base = getBaseCharacterMovement(character)
  const speeds: Record<string, number> = { ...base.speeds }
  for (const [mode, value] of Object.entries(base.other ?? {})) {
    if (typeof value === 'number') speeds[mode] = value
  }

  const effects = getCharacterEffects(character, 1, sourceEffects)
  const modes = new Set([
    ...Object.keys(speeds),
    ...effects.flatMap((effect) =>
      effect.target.kind === 'speed' && effect.target.mode
        ? [effect.target.mode.trim().toLowerCase()]
        : [],
    ),
  ])
  const context = getCharacterEffectResolutionContext(character)
  for (const mode of modes) {
    if (!mode) continue
    speeds[mode] = Math.max(
      0,
      Math.trunc(
        resolveNumericEffect(speeds[mode] ?? 0, { kind: 'speed', mode }, effects, context).value,
      ),
    )
  }

  return {
    speeds,
    hover: character.movementHoverOverride ?? base.hover ?? false,
    other: Object.fromEntries(
      Object.entries(base.other ?? {}).filter(([, value]) => typeof value === 'boolean'),
    ),
    unresolvedInheritedModes: base.unresolvedInheritedModes ?? [],
    source: base.source,
  }
}

export function getWalkingSpeed(movement: EffectiveMovement): number {
  return movement.speeds.walk ?? 0
}

function formatMode(mode: string, value: number): string {
  return `${mode} ${value} ft.`
}

/** Formats every known and preserved movement mode for Builder and text exports. */
export function formatEffectiveMovement(movement: EffectiveMovement): string {
  const parts: string[] = []
  for (const mode of MOVEMENT_MODES) {
    const value = movement.speeds[mode]
    if (value === undefined) continue
    const label = formatMode(mode, value)
    parts.push(mode === 'fly' && movement.hover ? `${label} (hover)` : label)
  }
  for (const [mode, value] of Object.entries(movement.speeds).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (isMovementMode(mode)) continue
    parts.push(formatMode(mode, value))
  }
  for (const [mode, value] of Object.entries(movement.other).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (value === true) parts.push(`${mode} (special)`)
  }
  for (const mode of movement.unresolvedInheritedModes) {
    parts.push(`${mode} (inherits an unresolved walking speed)`)
  }
  return parts.join(', ') || '—'
}

export function getAdditionalMovementSummary(movement: EffectiveMovement): string {
  const withoutWalk: EffectiveMovement = {
    ...movement,
    speeds: Object.fromEntries(Object.entries(movement.speeds).filter(([mode]) => mode !== 'walk')),
  }
  return formatEffectiveMovement(withoutWalk)
}
