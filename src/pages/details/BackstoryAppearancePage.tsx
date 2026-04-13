import { BookOpen, Users } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { RichTextArea } from '@/components/editor/RichTextArea'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCharacterStore } from '@/store/characterStore'
import { NoCharCard } from '../_shared'

export function BackstoryAppearancePage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  )

  const [age, setAge] = useState(activeCharacter?.details?.age?.toString() || '')
  const [height, setHeight] = useState(activeCharacter?.details?.height || '')
  const [weight, setWeight] = useState(activeCharacter?.details?.weight || '')
  const [eyes, setEyes] = useState(activeCharacter?.details?.eyes || '')
  const [hair, setHair] = useState(activeCharacter?.details?.hair || '')
  const [skin, setSkin] = useState(activeCharacter?.details?.skin || '')
  const [appearance, setAppearance] = useState(activeCharacter?.details?.appearance || '')
  const [backstory, setBackstory] = useState(activeCharacter?.details?.backstory || '')
  const [alliesAndOrganizations, setAlliesAndOrganizations] = useState(
    activeCharacter?.details?.alliesAndOrganizations || '',
  )

  const ageId = useId()
  const heightId = useId()
  const weightId = useId()
  const eyesId = useId()
  const hairId = useId()
  const skinId = useId()
  const appearanceId = useId()
  const backstoryId = useId()
  const alliesId = useId()

  useEffect(() => {
    if (activeCharacter?.details) {
      setAge(activeCharacter.details.age?.toString() || '')
      setHeight(activeCharacter.details.height || '')
      setWeight(activeCharacter.details.weight || '')
      setEyes(activeCharacter.details.eyes || '')
      setHair(activeCharacter.details.hair || '')
      setSkin(activeCharacter.details.skin || '')
      setAppearance(activeCharacter.details.appearance || '')
      setBackstory(activeCharacter.details.backstory || '')
      setAlliesAndOrganizations(activeCharacter.details.alliesAndOrganizations || '')
    }
  }, [activeCharacter])

  if (!activeCharacter) {
    return <NoCharCard icon={<BookOpen weight="duotone" />} noun="edit backstory and appearance" />
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <h1 className="font-display text-4xl font-bold flex items-center gap-3">
        <BookOpen className="h-8 w-8 text-primary" weight="duotone" />
        Backstory &amp; Appearance
      </h1>

      {/* Physical Traits */}
      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
            Physical Traits
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 max-w-4xl">
            <div>
              <Label htmlFor={ageId} className="mb-2 block text-sm">
                Age
              </Label>
              <Input
                id={ageId}
                type="number"
                value={age}
                onChange={(e) => {
                  const value = e.target.value
                  setAge(value)
                  updateActiveCharacterDetails({
                    age: value ? Number.parseInt(value, 10) : undefined,
                  })
                }}
                placeholder="25"
              />
            </div>

            <div>
              <Label htmlFor={heightId} className="mb-2 block text-sm">
                Height
              </Label>
              <Input
                id={heightId}
                value={height}
                onChange={(e) => {
                  const value = e.target.value
                  setHeight(value)
                  updateActiveCharacterDetails({ height: value })
                }}
                placeholder={`5'10"`}
              />
            </div>

            <div>
              <Label htmlFor={weightId} className="mb-2 block text-sm">
                Weight
              </Label>
              <Input
                id={weightId}
                value={weight}
                onChange={(e) => {
                  const value = e.target.value
                  setWeight(value)
                  updateActiveCharacterDetails({ weight: value })
                }}
                placeholder="180 lbs"
              />
            </div>

            <div>
              <Label htmlFor={eyesId} className="mb-2 block text-sm">
                Eyes
              </Label>
              <Input
                id={eyesId}
                value={eyes}
                onChange={(e) => {
                  const value = e.target.value
                  setEyes(value)
                  updateActiveCharacterDetails({ eyes: value })
                }}
                placeholder="Blue"
              />
            </div>

            <div>
              <Label htmlFor={hairId} className="mb-2 block text-sm">
                Hair
              </Label>
              <Input
                id={hairId}
                value={hair}
                onChange={(e) => {
                  const value = e.target.value
                  setHair(value)
                  updateActiveCharacterDetails({ hair: value })
                }}
                placeholder="Black"
              />
            </div>

            <div>
              <Label htmlFor={skinId} className="mb-2 block text-sm">
                Skin
              </Label>
              <Input
                id={skinId}
                value={skin}
                onChange={(e) => {
                  const value = e.target.value
                  setSkin(value)
                  updateActiveCharacterDetails({ skin: value })
                }}
                placeholder="Tan"
              />
            </div>
          </div>

          <RichTextArea
            id={appearanceId}
            label="Character Appearance"
            value={appearance}
            onChange={(value) => {
              setAppearance(value)
              updateActiveCharacterDetails({ appearance: value })
            }}
            placeholder="Describe your character's overall appearance."
            rows={8}
          />
        </CardContent>
      </Card>

      {/* Backstory */}
      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
            Backstory
          </h3>
          <RichTextArea
            id={backstoryId}
            label="Character Backstory"
            value={backstory}
            onChange={(value) => {
              setBackstory(value)
              updateActiveCharacterDetails({ backstory: value })
            }}
            placeholder="Write your character's backstory."
            rows={14}
          />
        </CardContent>
      </Card>

      {/* Allies & Organizations */}
      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-5">
            <Users className="h-3.5 w-3.5" weight="duotone" />
            Allies &amp; Organizations
          </h3>
          <RichTextArea
            id={alliesId}
            label="Allies & Organizations"
            value={alliesAndOrganizations}
            onChange={(value) => {
              setAlliesAndOrganizations(value)
              updateActiveCharacterDetails({ alliesAndOrganizations: value })
            }}
            placeholder="Describe your character's allies, factions, and organizational ties."
            rows={10}
          />
        </CardContent>
      </Card>
    </div>
  )
}
