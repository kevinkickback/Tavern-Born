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

  const entryList = asArray(selectedEntry.data.entries)

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
          entryList.map((entry) => (
            <div
              key={`${selectedEntry.name}|${selectedEntry.source}|${typeof entry === 'string' ? entry : JSON.stringify(entry)}`}
              className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
              dangerouslySetInnerHTML={{
                __html: renderEntry(entry),
              }}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No description available for this entry.
          </p>
        )}
      </div>
    </div>
  )
}
