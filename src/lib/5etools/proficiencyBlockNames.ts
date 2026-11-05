import { asObject } from './parsers/shared'

export function extractProficiencyBlockNames(
  blocks: unknown[],
  { includeAnyStandard = true } = {},
): string[] {
  const out: string[] = []
  for (const block of blocks) {
    const blockObj = asObject(block)
    for (const [key, val] of Object.entries(blockObj)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true) out.push(key)
    }
    const anyStandard = blockObj.anyStandard
    if (includeAnyStandard && typeof anyStandard === 'number')
      out.push(`any ${anyStandard} standard`)
    const chooseObj = asObject(blockObj.choose)
    if (typeof chooseObj.count === 'number') out.push(`choose ${chooseObj.count}`)
  }
  return out
}
