import { getBundledFileUrl } from './assetUrls'

const CLASS_ICON_PATHS: Record<string, string> = {
  artificer: 'assets/images/ui/icons/artificer.svg',
  barbarian: 'assets/images/ui/icons/barbarian.svg',
  bard: 'assets/images/ui/icons/bard.svg',
  cleric: 'assets/images/ui/icons/cleric.svg',
  druid: 'assets/images/ui/icons/druid.svg',
  fighter: 'assets/images/ui/icons/fighter.svg',
  monk: 'assets/images/ui/icons/monk.svg',
  paladin: 'assets/images/ui/icons/paladin.svg',
  ranger: 'assets/images/ui/icons/ranger.svg',
  rogue: 'assets/images/ui/icons/rogue.svg',
  sorcerer: 'assets/images/ui/icons/sorcerer.svg',
  warlock: 'assets/images/ui/icons/warlock.svg',
  wizard: 'assets/images/ui/icons/wizard.svg',
}

export const CLASS_ICON_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CLASS_ICON_PATHS).map(([className, path]) => [className, getBundledFileUrl(path)]),
)

export function getClassIconUrl(className: string, baseUrl?: string): string | null {
  const path = CLASS_ICON_PATHS[className.toLowerCase().trim()]
  return path ? getBundledFileUrl(path, baseUrl) : null
}
