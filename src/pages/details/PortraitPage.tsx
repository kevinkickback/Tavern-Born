import { Image } from '@phosphor-icons/react'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { Card } from '@/components/ui/card'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import { useCharacterStore } from '@/store/characterStore'

export function PortraitPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacter = useCharacterStore((state) => state.updateActiveCharacter)

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Image className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their portrait.
          </p>
        </Card>
      </div>
    )
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
