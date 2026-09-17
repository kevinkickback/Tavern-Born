import type { Icon } from '@phosphor-icons/react'

interface CharacteristicsSectionHeaderProps {
  icon: Icon
  iconClassName: string
  title: string
}

export function CharacteristicsSectionHeader({
  icon: SectionIcon,
  iconClassName,
  title,
}: CharacteristicsSectionHeaderProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface-raised px-4">
      <SectionIcon className={`size-4 ${iconClassName}`} weight="duotone" />
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  )
}
