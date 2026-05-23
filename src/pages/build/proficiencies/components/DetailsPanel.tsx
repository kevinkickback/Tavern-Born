import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { DAMAGE_TYPE_LABELS } from '@/lib/5etools/constants'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { InfoTile } from '@/pages/_shared'
import { formatWeaponCategoryLabel } from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e, Language5e } from '@/types/5etools'

/**
 * Standard language type labels — display-only mapping; no structured
 * JSON source exists in 5etools for these display names.
 */
const LANGUAGE_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  exotic: 'Exotic',
  rare: 'Rare',
  secret: 'Secret',
}

const SOURCE_EDITION_LABELS: Record<string, string> = {
  classic: '2014',
  one: '2024',
}

function stripSource(value: string): string {
  return value.split('|')[0] ?? value
}

function formatItemCost(value?: number): string {
  if (value == null) return '—'
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000} gp`
  if (value >= 1000) {
    const gp = Math.floor(value / 1000)
    const rem = value % 1000
    if (rem >= 100 && rem % 100 === 0) return `${gp} gp ${rem / 100} sp`
    return `${gp} gp ${rem} cp`
  }
  if (value >= 100 && value % 100 === 0) return `${value / 100} sp`
  if (value >= 100) return `${Math.floor(value / 100)} sp ${value % 100} cp`
  return `${value} cp`
}

function formatWeight(weight?: number): string {
  if (weight == null) return '—'
  return `${weight} lb.`
}

function formatArmorType(typeCode?: string, typeByAbbr?: Record<string, string>): string {
  if (!typeCode) return '—'
  const code = typeCode.split('|')[0].toUpperCase()
  return typeByAbbr?.[code] ?? typeCode
}

function formatDamageType(code?: string): string {
  if (!code) return '—'
  return DAMAGE_TYPE_LABELS[code] ?? code
}

function formatProperties(props?: string[], propertyByAbbr?: Record<string, string>): string {
  if (!props?.length) return '—'
  return props.map((p) => propertyByAbbr?.[p] ?? p).join(', ')
}

function formatToolType(typeCode?: string, typeByAbbr?: Record<string, string>): string {
  if (!typeCode) return '—'
  const code = typeCode.split('|')[0].toUpperCase()
  return typeByAbbr?.[code] ?? typeCode
}

function formatLanguageType(type?: string): string {
  if (!type) return '—'
  return LANGUAGE_TYPE_LABELS[type] ?? type
}

function formatEdition(edition?: string): string | null {
  if (!edition) return null
  return SOURCE_EDITION_LABELS[edition] ?? null
}

function formatMasteryList(mastery?: unknown): string | null {
  if (!mastery) return null
  const arr = Array.isArray(mastery) ? mastery : [mastery]
  const names = arr
    .filter((m): m is string => typeof m === 'string')
    .map(stripSource)
    .filter(Boolean)
  return names.length > 0 ? names.join(', ') : null
}

// ── Sub-sections ─────────────────────────────────────────────────────────────

function EntriesSection({ entries }: { entries?: unknown[] }) {
  if (!entries?.length) return null
  return (
    <div>
      <h4 className="text-xs font-bold text-accent-foreground uppercase tracking-wider mb-2">
        Description
      </h4>
      <div className="space-y-1">
        {entries.map((e) => (
          <div
            key={typeof e === 'string' ? e : JSON.stringify(e)}
            className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1"
            // renderEntry sanitises HTML — using dangerouslySetInnerHTML is the
            // established pattern across this codebase (see rule 9).
            dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
          />
        ))}
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  className,
}: {
  label: string
  value: string | null | undefined
  className?: string
}) {
  if (!value || value === '—') {
    return (
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <span className={cn('text-xs text-muted-foreground/50 italic', className)}>—</span>
      </div>
    )
  }
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-sm font-medium text-right', className)}>{value}</span>
    </div>
  )
}

// ── Category detail panels ────────────────────────────────────────────────────

function ArmorDetails({ item }: { item: Item5e }) {
  const itemTypeByAbbr = useGameDataStore((s) => s.gameData?.lookups?.itemTypeByAbbr)
  const armorType = formatArmorType(item.type, itemTypeByAbbr)
  const edition = formatEdition(item.edition as string | undefined)
  const mastery = formatMasteryList(item.mastery)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{armorType}</Badge>
        {edition && <Badge variant="outline">{edition} Edition</Badge>}
        {mastery && <Badge variant="outline">Mastery: {mastery}</Badge>}
      </div>

      <div className="bg-card/60 border border-border/60 rounded-lg p-3 space-y-2">
        <DetailRow label="Armor Class" value={item.ac != null ? `${item.ac}` : null} />
        <DetailRow label="Str. Requirement" value={item.strength ? `${item.strength}` : 'None'} />
        <DetailRow label="Stealth" value={item.stealth ? 'Disadvantage' : 'Normal'} />
        <DetailRow label="Weight" value={formatWeight(item.weight)} />
        <DetailRow label="Cost" value={formatItemCost(item.value)} />
      </div>

      <EntriesSection entries={item.entries as unknown[] | undefined} />
    </div>
  )
}

function WeaponDetails({ item }: { item: Item5e }) {
  const itemPropertyByAbbr = useGameDataStore((s) => s.gameData?.lookups?.itemPropertyByAbbr)
  const weaponType = item.weaponCategory
    ? `${item.weaponCategory.charAt(0).toUpperCase()}${item.weaponCategory.slice(1)} ${
        item.type?.split('|')[0] === 'R' ? 'Ranged' : 'Melee'
      }`
    : '—'
  const edition = formatEdition(item.edition as string | undefined)
  const mastery = formatMasteryList(item.mastery)

  const primaryDmg = item.dmg1 ? `${item.dmg1} ${formatDamageType(item.dmgType)}` : null
  const versatileDmg = item.dmg2 ? `${item.dmg2} ${formatDamageType(item.dmgType)}` : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {item.weaponCategory && (
          <Badge variant="secondary" className="capitalize">
            {item.weaponCategory}
          </Badge>
        )}
        {edition && <Badge variant="outline">{edition} Edition</Badge>}
        {mastery && <Badge variant="outline">Mastery: {mastery}</Badge>}
      </div>

      <div className="bg-card/60 border border-border/60 rounded-lg p-3 space-y-2">
        <DetailRow label="Type" value={weaponType} />
        <DetailRow label="Damage" value={primaryDmg} />
        {versatileDmg && <DetailRow label="Versatile" value={versatileDmg} />}
        <DetailRow
          label="Range"
          value={item.range ?? (item.property?.includes('T') ? 'Thrown' : null)}
        />
        <DetailRow label="Properties" value={formatProperties(item.property, itemPropertyByAbbr)} />
        <DetailRow label="Weight" value={formatWeight(item.weight)} />
        <DetailRow label="Cost" value={formatItemCost(item.value)} />
      </div>

      <EntriesSection entries={item.entries as unknown[] | undefined} />
    </div>
  )
}

function ToolDetails({ item }: { item: Item5e }) {
  const itemTypeByAbbr = useGameDataStore((s) => s.gameData?.lookups?.itemTypeByAbbr)
  const toolType = formatToolType(item.type, itemTypeByAbbr)
  const edition = formatEdition(item.edition as string | undefined)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{toolType}</Badge>
        {edition && <Badge variant="outline">{edition} Edition</Badge>}
      </div>

      <div className="bg-card/60 border border-border/60 rounded-lg p-3 space-y-2">
        <DetailRow label="Category" value={toolType} />
        <DetailRow label="Weight" value={formatWeight(item.weight)} />
        <DetailRow label="Cost" value={formatItemCost(item.value)} />
      </div>

      <EntriesSection entries={item.entries as unknown[] | undefined} />
    </div>
  )
}

function LanguageDetails({ lang }: { lang: Language5e }) {
  const langType = formatLanguageType(lang.type)

  const typicalSpeakers = Array.isArray(lang.typicalSpeakers)
    ? (lang.typicalSpeakers as string[]).map(stripSource).join(', ')
    : null
  const origin = typeof lang.origin === 'string' ? lang.origin : null
  const speakers = origin ?? typicalSpeakers

  const script =
    typeof lang.script === 'string' ? (lang.script === 'none' ? 'None' : lang.script) : null

  const dialects = Array.isArray(lang.dialects) ? (lang.dialects as string[]).join(', ') : null

  const is2024 = lang.source === 'XPHB' || lang.type === 'rare'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{langType}</Badge>
        {is2024 && <Badge variant="outline">2024 Edition</Badge>}
      </div>

      <div className="bg-card/60 border border-border/60 rounded-lg p-3 space-y-2">
        <DetailRow label={is2024 ? 'Origin' : 'Typical Speakers'} value={speakers} />
        <DetailRow label="Script" value={script} />
        {dialects && <DetailRow label="Dialects" value={dialects} />}
      </div>

      <EntriesSection entries={lang.entries as unknown[] | undefined} />
    </div>
  )
}

// ── Armor / Weapon category-level display ────────────────────────────────────

const ARMOR_CATEGORY_INFO: Record<string, { label: string; acNote: string; examples: string }> = {
  'light armor': {
    label: 'Light Armor',
    acNote: 'AC = base + full DEX modifier',
    examples: 'Padded, Leather, Studded Leather',
  },
  light: {
    label: 'Light Armor',
    acNote: 'AC = base + full DEX modifier',
    examples: 'Padded, Leather, Studded Leather',
  },
  'medium armor': {
    label: 'Medium Armor',
    acNote: 'AC = base + DEX modifier (max +2)',
    examples: 'Hide, Chain Shirt, Scale Mail, Breastplate, Half Plate',
  },
  medium: {
    label: 'Medium Armor',
    acNote: 'AC = base + DEX modifier (max +2)',
    examples: 'Hide, Chain Shirt, Scale Mail, Breastplate, Half Plate',
  },
  'heavy armor': {
    label: 'Heavy Armor',
    acNote: 'AC = fixed base (no DEX modifier)',
    examples: 'Ring Mail, Chain Mail, Splint, Plate',
  },
  heavy: {
    label: 'Heavy Armor',
    acNote: 'AC = fixed base (no DEX modifier)',
    examples: 'Ring Mail, Chain Mail, Splint, Plate',
  },
  shield: {
    label: 'Shields',
    acNote: '+2 AC bonus while equipped',
    examples: 'Shield',
  },
  shields: {
    label: 'Shields',
    acNote: '+2 AC bonus while equipped',
    examples: 'Shield',
  },
}

const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  armor: 'Armor',
  weapons: 'Weapon',
  tools: 'Tool',
  languages: 'Language',
}

function ArmorCategoryDetails({ categoryKey }: { categoryKey: string }) {
  const info = ARMOR_CATEGORY_INFO[categoryKey.toLowerCase()]
  if (!info) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{info.label}</Badge>
        <Badge variant="outline">Category</Badge>
      </div>
      <div className="bg-card/60 border border-border/60 rounded-lg p-3 space-y-2">
        <DetailRow label="AC Calculation" value={info.acNote} />
        <DetailRow label="Examples" value={info.examples} />
      </div>
    </div>
  )
}

function WeaponList({ title, names }: { title: string | null; names: string[] }) {
  return (
    <div className="bg-card/60 border border-border/60 rounded-lg p-3 space-y-1.5">
      {title && (
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
      )}
      <ul className="space-y-0.5">
        {names.map((name) => (
          <li key={name} className="text-sm">
            {name}
          </li>
        ))}
      </ul>
    </div>
  )
}

function WeaponCategoryDetails({
  categoryKey,
  weaponItemsBase,
}: {
  categoryKey: string
  weaponItemsBase: Item5e[]
}) {
  const label = formatWeaponCategoryLabel(categoryKey)
  if (!label) return null

  const lowerKey = categoryKey.toLowerCase()
  const filterCategory = lowerKey.includes('simple')
    ? 'simple'
    : lowerKey.includes('martial')
      ? 'martial'
      : null
  const filterRanged = lowerKey.includes('ranged')
    ? true
    : lowerKey.includes('melee')
      ? false
      : null

  const seen = new Set<string>()
  const filtered: { name: string; ranged: boolean }[] = []
  for (const item of weaponItemsBase) {
    if (!item.name || item.weaponCategory !== filterCategory) continue
    const isRanged = item.type?.split('|')[0] === 'R'
    if (filterRanged !== null && isRanged !== filterRanged) continue
    const lower = item.name.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      filtered.push({ name: item.name, ranged: isRanged })
    }
  }
  filtered.sort((a, b) => a.name.localeCompare(b.name))

  const meleeWeapons = filtered.filter((w) => !w.ranged).map((w) => w.name)
  const rangedWeapons = filtered.filter((w) => w.ranged).map((w) => w.name)
  const showSplit = filterRanged === null && meleeWeapons.length > 0 && rangedWeapons.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{label}</Badge>
        <Badge variant="outline">Category</Badge>
        {filtered.length > 0 && <Badge variant="outline">{filtered.length} weapons</Badge>}
      </div>
      {filtered.length > 0 &&
        (showSplit ? (
          <div className="grid grid-cols-2 gap-3">
            <WeaponList title="Melee" names={meleeWeapons} />
            <WeaponList title="Ranged" names={rangedWeapons} />
          </div>
        ) : (
          <WeaponList title={null} names={filtered.map((w) => w.name)} />
        ))}
    </div>
  )
}

// ── ItemDetails dispatcher ────────────────────────────────────────────────────

function ItemDetails({
  focused,
  weaponItemsBase,
}: {
  focused: Extract<ProfFocus, { type: 'item' }>
  weaponItemsBase: Item5e[]
}) {
  const categoryLabel = CATEGORY_DISPLAY_LABELS[focused.category] ?? focused.category
  const displayName =
    focused.category === 'weapons'
      ? (formatWeaponCategoryLabel(focused.name) ?? focused.name)
      : focused.name

  let detailContent: React.ReactNode

  if (focused.category === 'languages') {
    detailContent = focused.languageData ? (
      <LanguageDetails lang={focused.languageData} />
    ) : (
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="capitalize">
          Language
        </Badge>
      </div>
    )
  } else if (focused.category === 'armor') {
    if (focused.itemData) {
      detailContent = <ArmorDetails item={focused.itemData} />
    } else if (ARMOR_CATEGORY_INFO[focused.name.toLowerCase()]) {
      detailContent = <ArmorCategoryDetails categoryKey={focused.name} />
    } else {
      detailContent = (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="capitalize">
            Armor
          </Badge>
        </div>
      )
    }
  } else if (focused.category === 'weapons') {
    if (focused.itemData) {
      detailContent = <WeaponDetails item={focused.itemData} />
    } else if (formatWeaponCategoryLabel(focused.name)) {
      detailContent = (
        <WeaponCategoryDetails categoryKey={focused.name} weaponItemsBase={weaponItemsBase} />
      )
    } else {
      detailContent = (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="capitalize">
            Weapon
          </Badge>
        </div>
      )
    }
  } else if (focused.category === 'tools') {
    detailContent = focused.itemData ? (
      <ToolDetails item={focused.itemData} />
    ) : (
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="capitalize">
          Tool
        </Badge>
      </div>
    )
  } else {
    detailContent = (
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="capitalize">
          {focused.category}
        </Badge>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-display font-bold capitalize">{displayName}</h2>
        <p className="text-sm text-muted-foreground">
          {focused.isProficient ? (
            <span className="text-accent-foreground font-medium">Proficient</span>
          ) : (
            <span className="text-muted-foreground/70 italic">Not proficient</span>
          )}{' '}
          · {categoryLabel} Proficiency
        </p>
      </div>
      <Separator />
      {detailContent}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface BuildProficienciesDetailsPanelProps {
  focused: ProfFocus | null
  skillDescriptions: Record<string, unknown[]>
  weaponItemsBase: Item5e[]
}

export function BuildProficienciesDetailsPanel({
  focused,
  skillDescriptions,
  weaponItemsBase,
}: BuildProficienciesDetailsPanelProps) {
  return (
    <>
      <div className="bg-gradient-to-r from-accent/30 via-accent/15 to-transparent border-b border-border/40 px-4 py-3 flex-shrink-0 flex flex-col gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Details
        </span>
        <div className="flex items-center gap-2 min-h-8">
          {focused ? (
            <span className="text-sm font-bold font-display leading-tight capitalize">
              {'name' in focused ? focused.name : focused.ability}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Select a proficiency…</span>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {!focused ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm text-center">
              Click any proficiency to view details
            </div>
          ) : focused.type === 'skill' ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                <p className="text-sm text-muted-foreground capitalize">{focused.ability} check</p>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-3">
                <InfoTile title="Modifier">
                  <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                </InfoTile>
                <InfoTile title="Proficient">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      focused.proficient ? 'text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {focused.proficient ? 'Yes' : 'No'}
                  </span>
                </InfoTile>
                <InfoTile title="Expertise">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      focused.expertise ? 'text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {focused.expertise ? 'Yes' : 'No'}
                  </span>
                </InfoTile>
              </div>
              {skillDescriptions[focused.name.toLowerCase()]?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-accent-foreground uppercase tracking-wider mb-2">
                    Description
                  </h4>
                  {skillDescriptions[focused.name.toLowerCase()].map((e) => (
                    <div
                      key={typeof e === 'string' ? e : JSON.stringify(e)}
                      className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1"
                      dangerouslySetInnerHTML={{
                        __html: renderEntry(e),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : focused.type === 'save' ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-display font-bold capitalize">
                  {focused.ability} Save
                </h2>
                <p className="text-sm text-muted-foreground">Saving Throw</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <InfoTile title="Modifier">
                  <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                </InfoTile>
                <InfoTile title="Proficient">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      focused.proficient ? 'text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {focused.proficient ? 'Yes' : 'No'}
                  </span>
                </InfoTile>
              </div>
            </div>
          ) : (
            <ItemDetails focused={focused} weaponItemsBase={weaponItemsBase} />
          )}
        </div>
      </ScrollArea>
    </>
  )
}
