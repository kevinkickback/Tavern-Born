/** Maps lowercase class names to their SVG icon URL in public/assets. */
export const CLASS_ICON_MAP: Record<string, string> = {
  artificer: '/assets/images/ui/icons/artificer.svg',
  barbarian: '/assets/images/ui/icons/barbarian.svg',
  bard: '/assets/images/ui/icons/bard.svg',
  cleric: '/assets/images/ui/icons/cleric.svg',
  druid: '/assets/images/ui/icons/druid.svg',
  fighter: '/assets/images/ui/icons/fighter.svg',
  monk: '/assets/images/ui/icons/monk.svg',
  paladin: '/assets/images/ui/icons/paladin.svg',
  ranger: '/assets/images/ui/icons/ranger.svg',
  rogue: '/assets/images/ui/icons/rogue.svg',
  sorcerer: '/assets/images/ui/icons/sorcerer.svg',
  warlock: '/assets/images/ui/icons/warlock.svg',
  wizard: '/assets/images/ui/icons/wizard.svg',
}

/**
 * Returns the SVG icon URL for a class name, or null for homebrew/unknown classes.
 * @param className - The class name (case-insensitive).
 */
export function getClassIconUrl(className: string): string | null {
  return CLASS_ICON_MAP[className.toLowerCase().trim()] ?? null
}
