import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Eye } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useState, useEffect } from 'react'
import { RichTextArea } from '@/components/editor/RichTextArea'

export function AppearancePage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacterDetails = useCharacterStore((state) => state.updateActiveCharacterDetails)

  const [age, setAge] = useState(activeCharacter?.details?.age?.toString() || '')
  const [height, setHeight] = useState(activeCharacter?.details?.height || '')
  const [weight, setWeight] = useState(activeCharacter?.details?.weight || '')
  const [eyes, setEyes] = useState(activeCharacter?.details?.eyes || '')
  const [hair, setHair] = useState(activeCharacter?.details?.hair || '')
  const [skin, setSkin] = useState(activeCharacter?.details?.skin || '')
  const [distinguishingMarks, setDistinguishingMarks] = useState(activeCharacter?.details?.distinguishingMarks || '')
  const [physicalDescription, setPhysicalDescription] = useState(activeCharacter?.details?.physicalDescription || '')
  const [clothingStyle, setClothingStyle] = useState(activeCharacter?.details?.clothingStyle || '')
  const [mannerisms, setMannerisms] = useState(activeCharacter?.details?.mannerisms || '')

  useEffect(() => {
    if (activeCharacter?.details) {
      setAge(activeCharacter.details.age?.toString() || '')
      setHeight(activeCharacter.details.height || '')
      setWeight(activeCharacter.details.weight || '')
      setEyes(activeCharacter.details.eyes || '')
      setHair(activeCharacter.details.hair || '')
      setSkin(activeCharacter.details.skin || '')
      setDistinguishingMarks(activeCharacter.details.distinguishingMarks || '')
      setPhysicalDescription(activeCharacter.details.physicalDescription || '')
      setClothingStyle(activeCharacter.details.clothingStyle || '')
      setMannerisms(activeCharacter.details.mannerisms || '')
    }
  }, [activeCharacter])

  const updateDraftDetails = (updates: Record<string, unknown>) => {
    updateActiveCharacterDetails(updates)
  }

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to edit their appearance.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">Appearance</h1>
        <p className="text-muted-foreground">
          Describe how your character looks and presents themselves
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="age" className="mb-2 block">
                Age
              </Label>
              <Input
                id="age"
                type="number"
                value={age}
                onChange={(e) => {
                  const value = e.target.value
                  setAge(value)
                  updateDraftDetails({ age: value ? parseInt(value) : undefined })
                }}
                placeholder="25"
              />
            </div>

            <div>
              <Label htmlFor="height" className="mb-2 block">
                Height
              </Label>
              <Input
                id="height"
                value={height}
                onChange={(e) => {
                  const value = e.target.value
                  setHeight(value)
                  updateDraftDetails({ height: value })
                }}
                placeholder="5'10&quot;"
              />
            </div>

            <div>
              <Label htmlFor="weight" className="mb-2 block">
                Weight
              </Label>
              <Input
                id="weight"
                value={weight}
                onChange={(e) => {
                  const value = e.target.value
                  setWeight(value)
                  updateDraftDetails({ weight: value })
                }}
                placeholder="180 lbs"
              />
            </div>

            <div>
              <Label htmlFor="size" className="mb-2 block">
                Size
              </Label>
              <Input
                id="size"
                placeholder="Medium"
                disabled
              />
            </div>
          </div>

          <div>
            <Label htmlFor="eyes" className="mb-2 block flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Eye Color
            </Label>
            <Input
              id="eyes"
              value={eyes}
              onChange={(e) => {
                const value = e.target.value
                setEyes(value)
                updateDraftDetails({ eyes: value })
              }}
              placeholder="e.g., Blue, Green, Amber"
            />
          </div>

          <div>
            <Label htmlFor="hair" className="mb-2 block">
              Hair
            </Label>
            <Input
              id="hair"
              value={hair}
              onChange={(e) => {
                const value = e.target.value
                setHair(value)
                updateDraftDetails({ hair: value })
              }}
              placeholder="e.g., Long black hair, Bald, Red beard"
            />
          </div>

          <div>
            <Label htmlFor="skin" className="mb-2 block">
              Skin / Complexion
            </Label>
            <Input
              id="skin"
              value={skin}
              onChange={(e) => {
                const value = e.target.value
                setSkin(value)
                updateDraftDetails({ skin: value })
              }}
              placeholder="e.g., Tan, Pale, Dark green scales"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="distinguishing-marks"
            label="Distinguishing Marks"
            value={distinguishingMarks}
            onChange={(value) => {
              setDistinguishingMarks(value)
              updateDraftDetails({ distinguishingMarks: value })
            }}
            placeholder="Scars, tattoos, birthmarks, or other notable features..."
            rows={4}
          />

          <RichTextArea
            id="physical-description"
            label="Physical Description"
            value={physicalDescription}
            onChange={(value) => {
              setPhysicalDescription(value)
              updateDraftDetails({ physicalDescription: value })
            }}
            placeholder="Describe your character's overall appearance and build..."
            rows={5}
          />
        </Card>

        <Card className="p-6 space-y-4 md:col-span-2">
          <RichTextArea
            id="clothing-style"
            label="Clothing & Style"
            value={clothingStyle}
            onChange={(value) => {
              setClothingStyle(value)
              updateDraftDetails({ clothingStyle: value })
            }}
            placeholder="Describe what your character typically wears and their sense of style."
            rows={3}
          />

          <RichTextArea
            id="mannerisms"
            label="Mannerisms & Body Language"
            value={mannerisms}
            onChange={(value) => {
              setMannerisms(value)
              updateDraftDetails({ mannerisms: value })
            }}
            placeholder="How does your character move, speak, or carry themselves?"
            rows={3}
          />
        </Card>
      </div>
    </div>
  )
}
