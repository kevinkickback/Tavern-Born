import { readFileSync } from 'node:fs'
import { getCharacterSheetAssetPlan } from '@/lib/pdf/characterSheetAssets'
import {
  generateFilledCharacterSheetPdf,
  getCharacterSheetTemplate,
} from '@/lib/pdf/characterSheetPdf'
import type { CharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'

/** Full source forms exercise the low-level adapter's original external field contracts. */
export function sourceTemplateBytes(id: CharacterSheetTemplateId) {
  const template = getCharacterSheetTemplate(id)
  return readFileSync(
    template.edition === '2014'
      ? `scripts/pdf-sources/${template.id === '2014-official' ? '2014_Official_Character_Sheet.pdf' : '2014_MPMB_Character_Sheet.pdf'}`
      : `public/${template.assetPath}`,
  )
}

/** Exercise production assembly with the actual packaged modules. */
export function generateTestCharacterSheet(
  vm: CharacterSheetViewModel,
  id: CharacterSheetTemplateId,
  options: Parameters<typeof generateFilledCharacterSheetPdf>[3] = {},
) {
  const plan = getCharacterSheetAssetPlan(vm, id, options.pages)
  const supplements = Object.fromEntries(
    plan.slice(1).map((part) => [part.id, new Uint8Array(readFileSync(`public/${part.path}`))]),
  )
  return generateFilledCharacterSheetPdf(
    vm,
    new Uint8Array(readFileSync(`public/${plan[0].path}`)),
    id,
    {
      loadNotes: async () => new Uint8Array(readFileSync('public/pdf/2014/mpmb-notes.pdf')),
      ...options,
      supplements,
    },
  )
}
