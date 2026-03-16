import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Eye } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useState, useEffect } from 'react'
import { RichTextArea } from '@/components/character/RichTextArea'
import { FormattingGuide } from '@/components/character/FormattingGuide'
import { toast } from 'sonner'

export function AppearancePage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)

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

  const handleSave = () => {
    if (!activeCharacter) {
      toast.error('No active character')
      return
    }

    updateCharacter(activeCharacter.id, {
      details: {
        ...activeCharacter.details,
        age: age ? parseInt(age) : undefined,
        height,
        weight,
        eyes,
        hair,
        skin,
        distinguishingMarks,
        physicalDescription,
        clothingStyle,
        mannerisms,
      }
    })

    toast.success('Appearance saved successfully')
  }

  const handleReset = () => {
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
      toast.info('Changes reset')
    }
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

      <FormattingGuide />

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
                onChange={(e) => setAge(e.target.value)}
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
                onChange={(e) => setHeight(e.target.value)}
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
                onChange={(e) => setWeight(e.target.value)}
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
              onChange={(e) => setEyes(e.target.value)}
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
              onChange={(e) => setHair(e.target.value)}
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
              onChange={(e) => setSkin(e.target.value)}
              placeholder="e.g., Tan, Pale, Dark green scales"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="distinguishing-marks"
            label="Distinguishing Marks"
            value={distinguishingMarks}
            onChange={setDistinguishingMarks}
            placeholder="Scars, tattoos, birthmarks, or other notable features..."
            rows={4}
          />

          <RichTextArea
            id="physical-description"
            label="Physical Description"
            value={physicalDescription}
            onChange={setPhysicalDescription}
            placeholder="Describe your character's overall appearance and build..."
            rows={5}
          />
        </Card>

        <Card className="p-6 space-y-4 md:col-span-2">
          <RichTextArea
            id="clothing-style"
            label="Clothing & Style"
            value={clothingStyle}
            onChange={setClothingStyle}
            placeholder="Describe what your character typically wears and their sense of style... Use {@item leather armor} or {@item cloak} for equipment references."
            rows={3}
          />

          <RichTextArea
            id="mannerisms"
            label="Mannerisms & Body Language"
            value={mannerisms}
            onChange={setMannerisms}
            placeholder="How does your character move, speak, or carry themselves?"
            rows={3}
          />
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave}>Save Appearance</Button>
      </div>
    </div>
  )
}
