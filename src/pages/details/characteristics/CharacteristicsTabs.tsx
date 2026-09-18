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
  idPrefix: string
  onChange: (section: CharacteristicsSection) => void
}

export function CharacteristicsTabs({
  activeSection,
  idPrefix,
  onChange,
}: CharacteristicsTabsProps) {
  const focusSection = (section: CharacteristicsSection) => {
    onChange(section)
    document.getElementById(`${idPrefix}-tab-${section}`)?.focus()
  }

  return (
    <WorkspacePaneHeader ariaLabel="Characteristic sections" className="overflow-x-auto">
      <div className="flex h-full min-w-max items-stretch gap-5" role="tablist">
        {SECTIONS.map(([value, label, Icon], index) => {
          const selected = activeSection === value
          return (
            <button
              key={value}
              id={`${idPrefix}-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(value)}
              onKeyDown={(event) => {
                let nextIndex = index
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % SECTIONS.length
                else if (event.key === 'ArrowLeft') {
                  nextIndex = (index - 1 + SECTIONS.length) % SECTIONS.length
                } else if (event.key === 'Home') nextIndex = 0
                else if (event.key === 'End') nextIndex = SECTIONS.length - 1
                else return

                event.preventDefault()
                focusSection(SECTIONS[nextIndex][0])
              }}
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
