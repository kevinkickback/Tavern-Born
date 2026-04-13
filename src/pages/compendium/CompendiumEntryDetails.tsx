import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { CompendiumEntry } from '@/lib/compendiumEntries'
import { renderEntry } from '@/lib/renderer'

interface CompendiumEntryDetailsProps {
  selectedEntry: CompendiumEntry
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const asStringArray = (value: unknown): string[] =>
  asArray(value).filter((item): item is string => typeof item === 'string')

const formatAbbrList = (items: string[]) => items.map((item) => item.toUpperCase()).join(', ')

function getSkillsChooseText(value: unknown): string {
  const choose = isRecord(value) && isRecord(value.choose) ? value.choose : null
  const from = choose ? asStringArray(choose.from) : []
  const count = choose && typeof choose.count === 'number' ? choose.count : null

  if (!from.length) return ''

  return count != null
    ? `Choose ${count} from ${from.map((s) => s.toUpperCase()).join(', ')}`
    : from.map((s) => s.toUpperCase()).join(', ')
}

function getMulticlassRequirementsText(value: unknown): string {
  if (!isRecord(value)) return ''

  const formatRequirement = (req: Record<string, unknown>): string =>
    Object.entries(req)
      .map(([ability, score]) => `${ability.toUpperCase()} ${String(score)}`)
      .join(', ')

  if (Array.isArray(value.or)) {
    const options = value.or
      .filter(isRecord)
      .map((option) => formatRequirement(option))
      .filter(Boolean)

    return options.join(' or ')
  }

  return formatRequirement(value)
}

function getClassRenderableEntries(data: Record<string, unknown>): unknown[] {
  const traits: string[] = []
  const hd = isRecord(data.hd) ? data.hd : null

  if (hd && typeof hd.faces === 'number') {
    const count = typeof hd.number === 'number' ? hd.number : 1
    traits.push(`{@b Hit Dice:} ${count}d${hd.faces}`)
  }

  const savingThrows = asStringArray(data.proficiency)
  if (savingThrows.length) {
    traits.push(`{@b Saving Throw Proficiencies:} ${formatAbbrList(savingThrows)}`)
  }

  if (typeof data.spellcastingAbility === 'string') {
    traits.push(`{@b Spellcasting Ability:} ${data.spellcastingAbility.toUpperCase()}`)
  }

  const startingProficiencies = isRecord(data.startingProficiencies)
    ? data.startingProficiencies
    : null
  if (startingProficiencies) {
    const armor = asStringArray(startingProficiencies.armor)
    const weapons = asStringArray(startingProficiencies.weapons)
    const tools = asStringArray(startingProficiencies.tools)
    const skills = getSkillsChooseText(startingProficiencies.skills)

    if (armor.length) traits.push(`{@b Armor Training:} ${armor.join(', ')}`)
    if (weapons.length) traits.push(`{@b Weapon Proficiencies:} ${weapons.join(', ')}`)
    if (tools.length) traits.push(`{@b Tool Proficiencies:} ${tools.join(', ')}`)
    if (skills) traits.push(`{@b Skill Proficiencies:} ${skills}`)
  }

  const multiclassing = isRecord(data.multiclassing) ? data.multiclassing : null
  if (multiclassing) {
    const requirements = getMulticlassRequirementsText(multiclassing.requirements)
    if (requirements) {
      traits.push(`{@b Multiclassing Prerequisites:} ${requirements}`)
    }

    const profsGained = isRecord(multiclassing.proficienciesGained)
      ? multiclassing.proficienciesGained
      : null

    if (profsGained) {
      const armor = asStringArray(profsGained.armor)
      const weapons = asStringArray(profsGained.weapons)
      const tools = asStringArray(profsGained.tools)
      const skills = getSkillsChooseText(profsGained.skills)

      if (armor.length) traits.push(`{@b Multiclass Armor Training:} ${armor.join(', ')}`)
      if (weapons.length) traits.push(`{@b Multiclass Weapon Proficiencies:} ${weapons.join(', ')}`)
      if (tools.length) traits.push(`{@b Multiclass Tool Proficiencies:} ${tools.join(', ')}`)
      if (skills) traits.push(`{@b Multiclass Skill Proficiencies:} ${skills}`)
    }
  }

  const classFluffSections = asArray(data.classFluffSections)
    .filter(isRecord)
    .map((section) => ({
      type: 'entries',
      name: String(section.name ?? ''),
      entries: asArray(section.entries),
    }))

  const fluffEntries = asArray(data.fluffEntries)

  const startingEquipment = isRecord(data.startingEquipment) ? data.startingEquipment : null
  const startingEquipmentEntries =
    startingEquipment && Array.isArray(startingEquipment.entries)
      ? startingEquipment.entries
      : startingEquipment && Array.isArray(startingEquipment.default)
        ? startingEquipment.default
        : []

  const entryList = asArray(data.entries)

  return [
    ...classFluffSections,
    ...(fluffEntries.length
      ? [
          {
            type: 'entries',
            name: 'Overview',
            entries: fluffEntries,
          },
        ]
      : []),
    ...(traits.length
      ? [
          {
            type: 'entries',
            name: 'Core Traits',
            entries: traits,
          },
        ]
      : []),
    ...(startingEquipmentEntries.length
      ? [
          {
            type: 'entries',
            name: 'Starting Equipment',
            entries: startingEquipmentEntries,
          },
        ]
      : []),
    ...entryList,
  ]
}

function getRenderableEntries(selectedEntry: CompendiumEntry): unknown[] {
  const entryList = asArray(selectedEntry.data.entries)
  if (entryList.length) return entryList

  if (selectedEntry.type === 'Class') {
    return getClassRenderableEntries(selectedEntry.data)
  }

  const fluffEntries = asArray(selectedEntry.data.fluffEntries)
  if (fluffEntries.length) return fluffEntries

  const classFluffSections = asArray(selectedEntry.data.classFluffSections)
    .filter(isRecord)
    .map((section) => ({
      type: 'entries',
      name: String(section.name ?? ''),
      entries: asArray(section.entries),
    }))

  return classFluffSections
}

export function CompendiumEntryDetails({ selectedEntry }: CompendiumEntryDetailsProps) {
  const spellLevel = typeof selectedEntry.data.level === 'number' ? selectedEntry.data.level : null
  const spellSchool = typeof selectedEntry.data.school === 'string' ? selectedEntry.data.school : ''

  const firstTime = isRecord(asArray(selectedEntry.data.time)[0])
    ? (asArray(selectedEntry.data.time)[0] as Record<string, unknown>)
    : null

  const range = isRecord(selectedEntry.data.range) ? selectedEntry.data.range : null
  const distance = isRecord(range?.distance) ? range.distance : null

  const firstDuration = isRecord(asArray(selectedEntry.data.duration)[0])
    ? (asArray(selectedEntry.data.duration)[0] as Record<string, unknown>)
    : null
  const durationInner = isRecord(firstDuration?.duration) ? firstDuration.duration : null

  const entryList = getRenderableEntries(selectedEntry)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-display font-bold mb-2">{selectedEntry.name}</h2>
        <div className="flex gap-2 mb-4">
          <Badge>{selectedEntry.type}</Badge>
          <Badge variant="outline">{selectedEntry.source}</Badge>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        {selectedEntry.type === 'Spell' && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm p-4 bg-muted/50 rounded-lg">
            <div>
              <span className="text-muted-foreground">Level: </span>
              <span className="font-medium">
                {spellLevel === 0 ? 'Cantrip' : `Level ${spellLevel ?? '?'}`}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">School: </span>
              <span className="font-medium capitalize">{spellSchool}</span>
            </div>
            {firstTime && (
              <div>
                <span className="text-muted-foreground">Casting Time: </span>
                <span className="font-medium">
                  {String(firstTime.number ?? '')} {String(firstTime.unit ?? '')}
                </span>
              </div>
            )}
            {distance && (
              <div>
                <span className="text-muted-foreground">Range: </span>
                <span className="font-medium">
                  {String(distance.amount ?? distance.type ?? '')}{' '}
                  {distance.amount != null ? String(distance.type ?? '') : ''}
                </span>
              </div>
            )}
            {firstDuration && (
              <div>
                <span className="text-muted-foreground">Duration: </span>
                <span className="font-medium capitalize">
                  {String(firstDuration.type ?? '')}
                  {durationInner
                    ? ` ${String(durationInner.amount ?? '')} ${String(durationInner.type ?? '')}`
                    : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {entryList.length > 0 ? (
          entryList.map((entry) => {
            const entryKey = typeof entry === 'string' ? entry : JSON.stringify(entry)

            return (
              <div
                key={`${selectedEntry.name}|${selectedEntry.source}|${entryKey}`}
                className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                dangerouslySetInnerHTML={{
                  __html: renderEntry(entry),
                }}
              />
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description available for this entry.
          </p>
        )}
      </div>
    </div>
  )
}
