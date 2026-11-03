import type { Psionic5e, PsionicMode5e } from '@/types/5etools'

function modeTitle(mode: PsionicMode5e): string {
  const parts: string[] = []
  if (mode.cost)
    parts.push(
      `${mode.cost.min === mode.cost.max ? mode.cost.min : `${mode.cost.min}-${mode.cost.max}`} psi`,
    )
  if (mode.concentration)
    parts.push(`conc., ${mode.concentration.duration} ${mode.concentration.unit}.`)
  return `${mode.name}${parts.length ? ` (${parts.join('; ')})` : ''}`
}

/**
 * Data-only adaptation of 5etools Renderer.psionic (GPL-3.0), upstream b9061583.
 * Preserve its entry grammar without enhanceMode's catalog mutation or upstream HTML.
 */
export function getPsionicEntries(psionic: Psionic5e): unknown[] {
  const entries: unknown[] = [
    `${psionic.type === 'T' ? 'Psionic talent' : `${psionic.order ?? 'Unknown order'} discipline`}.`,
    ...(psionic.entries ?? []),
  ]
  if (psionic.focus) entries.push(`{@b {@i Psychic Focus.}} ${psionic.focus}`)
  for (const mode of psionic.modes ?? []) {
    entries.push({ type: mode.type ?? 'entries', name: modeTitle(mode), entries: mode.entries })
    if (mode.submodes?.length)
      entries.push({
        type: 'list',
        style: 'list-hang-notitle',
        items: mode.submodes.map((submode) => ({
          type: 'item',
          name: modeTitle(submode),
          entries: submode.entries,
        })),
      })
  }
  return entries
}
