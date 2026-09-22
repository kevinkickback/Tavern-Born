import { Link } from 'react-router-dom'
import { getCharacterSheetAttributionAnchor } from '@/lib/pdf/characterSheetTemplates'
import type { CharacterSheetTemplate } from '@/lib/pdf/types'

export function CharacterSheetAttribution({ template }: { template: CharacterSheetTemplate }) {
  return (
    <div className="border-t border-border-subtle px-6 py-3 text-right text-xs">
      <Link
        to={`/settings?section=about#${getCharacterSheetAttributionAnchor(template.id)}`}
        className="text-primary underline underline-offset-2"
      >
        PDF attribution
      </Link>
    </div>
  )
}
