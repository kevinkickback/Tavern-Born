import { Image } from '@phosphor-icons/react'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'

export function PortraitPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacter = useCharacterStore((state) => state.updateActiveCharacter)

  if (!activeCharacter) {
    return <NoCharCard icon={<Image weight="duotone" />} noun="manage their portrait" />
  }

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="overflow-hidden">
        <PortraitPicker
          portrait={activeCharacter.portrait ?? null}
          transform={activeCharacter.portraitTransform ?? DEFAULT_PORTRAIT_TRANSFORM}
          name={activeCharacter.name}
          level={getTotalCharacterLevel(activeCharacter)}
          race={activeCharacter.race}
          characterClass={activeCharacter.class}
          lastModified={activeCharacter.lastModified}
          onPortraitChange={(p) => updateActiveCharacter({ portrait: p ?? undefined })}
          onTransformChange={(t) => updateActiveCharacter({ portraitTransform: t })}
        />
      </WorkspaceBody>
    </WorkspacePage>
  )
}
