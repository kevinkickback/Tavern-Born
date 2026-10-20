import type { Item5e } from '@/types/5etools'
import { assessStructuredConcreteToolProficiency } from './concreteToolClassification'
import {
  assessToolProficiencySource,
  type ToolCopySemanticCertificate,
} from './toolProficiencySource'

/** Current item classification also requires its preserved raw-source/copy evidence. */
export function assessConcreteToolProficiency(
  item: Item5e,
  certificates?: readonly ToolCopySemanticCertificate[],
) {
  const structured = assessStructuredConcreteToolProficiency(item)
  if (item.toolProficiencySourceAudit !== undefined) {
    const source = assessToolProficiencySource(item, certificates)
    return source.kind === 'eligible' ? structured : source
  }
  return structured.kind === 'eligible'
    ? assessToolProficiencySource(item, certificates)
    : structured
}

export function getConcreteToolProficiencyName(item: Item5e): string | undefined {
  const result = assessConcreteToolProficiency(item)
  return result.kind === 'eligible' ? result.name : undefined
}
