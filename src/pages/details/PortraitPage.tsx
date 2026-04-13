import { Image } from '@phosphor-icons/react'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { Card } from '@/components/ui/card'
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
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <Card className="p-4 sm:p-6 w-full">
        <PortraitPicker
          portrait={activeCharacter.portrait ?? null}
          transform={activeCharacter.portraitTransform ?? DEFAULT_PORTRAIT_TRANSFORM}
          name={activeCharacter.name}
          level={activeCharacter.level}
          race={activeCharacter.race}
          characterClass={activeCharacter.class}
          lastModified={activeCharacter.lastModified}
          onPortraitChange={(p) => updateActiveCharacter({ portrait: p ?? undefined })}
          onTransformChange={(t) => updateActiveCharacter({ portraitTransform: t })}
        />
      </Card>
    </div>
  )
}
