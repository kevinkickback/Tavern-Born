import type { Character } from '@/types/character'

const filters = (character: Character) =>
  JSON.stringify([
    character.allowedSources,
    character.originSystem,
    character.variantRules?.preferNewerPrintings ?? false,
  ])

/** Captured filtered authority cannot authorize writes after a catalog or source-settings change. */
export function hasCurrentCharacterSourceContext(
  current: Character | null | undefined,
  captured: Character | null | undefined,
  currentData: object | null | undefined,
  capturedData: object | null | undefined,
) {
  return (
    !!current &&
    !!captured &&
    current.id === captured.id &&
    currentData === capturedData &&
    filters(current) === filters(captured)
  )
}
