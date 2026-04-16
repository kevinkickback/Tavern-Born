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
    <div>
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Image className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Portrait</h1>
              <p className="text-sm text-muted-foreground">
                Set and customize your character's portrait
              </p>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  )
}
