import { Image } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { getReadinessFocus } from '@/lib/navigation/readinessFocus'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'

interface PortraitPageProps {
  readinessFocus?: string | null
}

export function PortraitPage({ readinessFocus }: PortraitPageProps = {}) {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacter = useCharacterStore((state) => state.updateActiveCharacter)
  const { ref: portraitRef, highlighted: portraitHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(readinessFocus === 'portrait:missing')

  if (!activeCharacter) {
    return <NoCharCard icon={<Image weight="duotone" />} noun="manage their portrait" />
  }

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="overflow-hidden">
        <div
          ref={portraitRef}
          className={cn('h-full rounded-lg', portraitHighlighted && 'animate-route-focus')}
        >
          <PortraitPicker
            portrait={activeCharacter.portrait ?? null}
            transform={activeCharacter.portraitTransform ?? DEFAULT_PORTRAIT_TRANSFORM}
            name={activeCharacter.name}
            level={getTotalCharacterLevel(activeCharacter)}
            race={activeCharacter.race}
            characterClass={getCharacterClassEntries(activeCharacter)[0]?.name ?? ''}
            lastModified={activeCharacter.lastModified}
            onPortraitChange={(p) => updateActiveCharacter({ portrait: p ?? undefined })}
            onTransformChange={(t) => updateActiveCharacter({ portraitTransform: t })}
          />
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}

export function RoutedPortraitPage() {
  const [searchParams] = useSearchParams()
  return <PortraitPage readinessFocus={getReadinessFocus(searchParams)} />
}
