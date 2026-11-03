import type { Psionic5e } from '@/types/5etools'
import { auditPsionicMultiplicity } from '../psionics'
import { PsionicDataSchema } from '../schemas'

/** Validate the external document at ingestion; actor identity helpers remain parser-free. */
export function parsePsionics(data: unknown): Psionic5e[] {
  const fields = new Set(['name', 'source', 'page', 'type', 'order', 'entries', 'focus', 'modes'])
  return auditPsionicMultiplicity(
    PsionicDataSchema.parse(data).psionic.map((row) =>
      Object.keys(row).every((key) => fields.has(key))
        ? row
        : { ...row, psionicSourceConflict: true },
    ),
  )
}
