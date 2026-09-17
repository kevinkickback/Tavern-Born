import { Brain, IdentificationCard, Scroll, Users } from '@phosphor-icons/react'
import { WorkspacePaneHeader } from '@/components/workspace'
import { cn } from '@/lib/utils'
import type { CharacteristicsSection } from './model'

const SECTIONS = [
  ['identity', 'Identity', IdentificationCard],
  ['personality', 'Personality', Brain],
  ['story', 'Story', Scroll],
  ['connections', 'Connections', Users],
] as const

interface CharacteristicsTabsProps {
  activeSection: CharacteristicsSection
  onChange: (section: CharacteristicsSection) => void
}

export function CharacteristicsTabs({ activeSection, onChange }: CharacteristicsTabsProps) {
  return (
    <WorkspacePaneHeader ariaLabel="Characteristic sections" className="overflow-x-auto">
      <div className="flex h-full min-w-max items-stretch gap-5" role="tablist">
        {SECTIONS.map(([value, label, Icon]) => {
          const selected = activeSection === value
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(value)}
              className={cn(
                'relative flex cursor-pointer items-center gap-2 border-b-2 px-0.5 text-sm font-semibold transition-colors',
                selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <Icon className="size-4" weight={selected ? 'fill' : 'regular'} />
              {label}
            </button>
          )
        })}
      </div>
    </WorkspacePaneHeader>
  )
}
