import {
  CURRENCY_KEYS,
  currencyCopper,
  emptyStartingCurrency,
  sameStartingReference,
  startingEquipmentLotKey,
} from '@/lib/character/startingEquipmentGrants'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'

export function getInvalidStartingEquipmentPaths(
  character: Character,
): Array<Array<string | number>> {
  const invalid: Array<Array<string | number>> = []
  const wallet = character.currency ?? emptyStartingCurrency()
  try {
    currencyCopper(wallet)
  } catch {
    invalid.push(['currency'])
  }
  if (
    character.initialClass &&
    !character.classProgression.some((entry) =>
      sameStartingReference(entry, character.initialClass),
    )
  )
    invalid.push(['initialClass'])
  const claimed = new Set<string>()
  const choiceSets = [
    character.backgroundEquipmentItemChoices,
    ...Object.values(character.classEquipmentItemChoices ?? {}),
  ]
  for (const [index, choices] of choiceSets.entries()) {
    for (const key of Object.keys(choices ?? {})) {
      const parts = /^(0|[1-9]\d*):(_|[a-z]+):(0|[1-9]\d*)$/.exec(key)
      if (
        !parts ||
        !Number.isSafeInteger(Number(parts[1])) ||
        !Number.isSafeInteger(Number(parts[3]))
      )
        invalid.push(
          index === 0 ? ['backgroundEquipmentItemChoices', key] : ['classEquipmentItemChoices'],
        )
    }
  }
  const equipment = new Map(character.equipment.map((item) => [item.id, item]))
  if (equipment.size !== character.equipment.length) invalid.push(['equipment'])
  for (const role of ['class', 'background'] as const) {
    const grant = character.startingEquipmentGrants?.[role]
    if (!grant) continue
    const path = ['startingEquipmentGrants', role]
    const selectedOwner =
      role === 'class'
        ? character.initialClass
        : character.background && character.backgroundSource
          ? { name: character.background, source: character.backgroundSource }
          : undefined
    if (grant.owner && !sameStartingReference(grant.owner, selectedOwner)) invalid.push(path)
    if (
      !grant.owner &&
      (grant.items.length > 0 ||
        CURRENCY_KEYS.some((key) => grant.remainingCurrency[key] || grant.declaredCurrency[key]))
    )
      invalid.push(path)
    try {
      if (
        currencyCopper(grant.remainingCurrency) !==
        Math.max(0, currencyCopper(grant.declaredCurrency) - grant.spentCopper)
      )
        invalid.push(path)
    } catch {
      invalid.push(path)
    }
    const keys = new Set<string>()
    grant.items.forEach((lot, index) => {
      let valid =
        lot.remainingQuantity === Math.max(0, lot.issuedQuantity - lot.consumedQuantity) &&
        !keys.has(lot.key) &&
        !claimed.has(lot.equipmentId)
      keys.add(lot.key)
      claimed.add(lot.equipmentId)
      try {
        const key = JSON.parse(lot.key) as unknown[]
        valid &&=
          Array.isArray(key) &&
          key.length === 6 &&
          Number.isSafeInteger(key[0]) &&
          Number(key[0]) >= 0 &&
          typeof key[1] === 'string' &&
          /^(?:_|[a-z]+)$/.test(key[1]) &&
          Number.isSafeInteger(key[2]) &&
          Number(key[2]) >= 0 &&
          lot.key ===
            startingEquipmentLotKey(Number(key[0]), String(key[1]), Number(key[2]), lot.reference)
        const choices =
          role === 'class' && grant.owner
            ? character.classEquipmentChoices?.[`${grant.owner.name}|${grant.owner.source}`]
            : character.backgroundEquipmentChoices
        if (key[1] !== '_' && choices?.[Number(key[0])] !== undefined)
          valid &&= key[1] === choices[Number(key[0])].toLowerCase()
      } catch {
        valid = false
      }
      const physical = equipment.get(lot.equipmentId)
      valid &&=
        !!grant.owner &&
        (character.provenance.equipment[normalizeKey(lot.reference.name)] ?? []).some(
          (tag) =>
            tag.sourceType === role &&
            tag.grantType === 'fixed' &&
            sameStartingReference(
              { name: tag.sourceName, source: tag.sourceRef ?? '' },
              grant.owner,
            ),
        )
      if (lot.remainingQuantity > 0)
        valid &&=
          !!physical &&
          physical.quantity >= lot.remainingQuantity &&
          (lot.reference.kind === 'special'
            ? physical.name === lot.reference.name && !physical.source
            : sameStartingReference(
                physical.source ? { name: physical.name, source: physical.source } : undefined,
                lot.reference,
              ))
      if (!valid) invalid.push([...path, 'items', index])
    })
  }
  for (const coin of CURRENCY_KEYS) {
    const owned =
      (character.startingEquipmentGrants?.class?.remainingCurrency[coin] ?? 0) +
      (character.startingEquipmentGrants?.background?.remainingCurrency[coin] ?? 0)
    if (!Number.isSafeInteger(owned) || owned > wallet[coin]) invalid.push(['currency', coin])
  }
  return invalid
}
