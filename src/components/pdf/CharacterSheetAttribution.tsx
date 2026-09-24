import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getCharacterSheetAttributionAnchor } from '@/lib/pdf/characterSheetTemplates'
import type { CharacterSheetTemplate } from '@/lib/pdf/types'

export function CharacterSheetAttribution({
  template,
  children,
}: {
  template: CharacterSheetTemplate
  children?: ReactNode
}) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-4 py-2 text-xs">
      {children}
      <Link
        to={`/settings?section=about#${getCharacterSheetAttributionAnchor(template.id)}`}
        className="ml-auto text-primary underline underline-offset-2"
      >
        PDF attribution
      </Link>
    </footer>
  )
}
