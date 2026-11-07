import type { Subclass5e } from '@/types/5etools'

const classic = new Set([
  'subclass-feature|channel divinity: knowledge of the ages|cleric|phb|knowledge|phb|2|phb',
  'subclass-feature|potent spellcasting|cleric|phb|knowledge|phb|8|phb',
  'subclass-feature|blessed strikes|cleric|phb|knowledge|phb|8|tce',
])
const common = new Set([
  'subclass-feature|channel divinity: read thoughts|cleric|phb|knowledge|phb|6|phb',
  'subclass-feature|visions of the past|cleric|phb|knowledge|phb|17|phb',
])
const revisedFirstGain =
  'subclass-feature|channel divinity: knowledge of the ages|cleric|xphb|knowledge|phb|3|phb'

function getPrinting(subclass: Subclass5e) {
  if (
    subclass.className !== 'Cleric' ||
    subclass.name !== 'Knowledge Domain (PSA)' ||
    subclass.shortName !== 'Knowledge (PSA)' ||
    subclass.source !== 'PSA' ||
    subclass.sourceIdentityConflict
  )
    return undefined
  return subclass.classSource
}

export function isPsaKnowledgeDependency(subclass: Subclass5e, target: string | undefined) {
  if (!target) return false
  const printing = getPrinting(subclass)
  if (printing === 'PHB') return common.has(target) || classic.has(target)
  return printing === 'XPHB' && (common.has(target) || target === revisedFirstGain)
}

export function getPsaKnowledgeIntroDependency(subclass: Subclass5e, target: string | undefined) {
  const printing = getPrinting(subclass)
  if (printing !== 'PHB' && printing !== 'XPHB') return undefined
  const level = printing === 'PHB' ? 1 : 3
  if (
    target !==
    `subclass-feature|knowledge domain (psa)|cleric|${printing.toLowerCase()}|knowledge (psa)|psa|${level}|psa`
  )
    return undefined
  return 'subclass-feature|knowledge domain|cleric|phb|knowledge|phb|1|phb'
}
