import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sparkle } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useState, useEffect } from 'react'
import { RichTextArea } from '@/components/character/RichTextArea'
import { FormattingGuide } from '@/components/character/FormattingGuide'
import { toast } from 'sonner'

export function CharacteristicsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)

  const [alignment, setAlignment] = useState(activeCharacter?.details?.alignment || '')
  const [faith, setFaith] = useState(activeCharacter?.details?.faith || '')
  const [lifestyle, setLifestyle] = useState(activeCharacter?.details?.lifestyle || '')
  const [personalityTraits, setPersonalityTraits] = useState(activeCharacter?.details?.personalityTraits || '')
  const [ideals, setIdeals] = useState(activeCharacter?.details?.ideals || '')
  const [bonds, setBonds] = useState(activeCharacter?.details?.bonds || '')
  const [flaws, setFlaws] = useState(activeCharacter?.details?.flaws || '')
  const [goals, setGoals] = useState(activeCharacter?.details?.goals || '')
  const [fears, setFears] = useState(activeCharacter?.details?.fears || '')

  useEffect(() => {
    if (activeCharacter?.details) {
      setAlignment(activeCharacter.details.alignment || '')
      setFaith(activeCharacter.details.faith || '')
      setLifestyle(activeCharacter.details.lifestyle || '')
      setPersonalityTraits(activeCharacter.details.personalityTraits || '')
      setIdeals(activeCharacter.details.ideals || '')
      setBonds(activeCharacter.details.bonds || '')
      setFlaws(activeCharacter.details.flaws || '')
      setGoals(activeCharacter.details.goals || '')
      setFears(activeCharacter.details.fears || '')
    }
  }, [activeCharacter])

  const alignments = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'
  ]

  const handleSave = () => {
    if (!activeCharacter) {
      toast.error('No active character')
      return
    }

    updateCharacter(activeCharacter.id, {
      details: {
        ...activeCharacter.details,
        alignment,
        faith,
        lifestyle,
        personalityTraits,
        ideals,
        bonds,
        flaws,
        goals,
        fears,
      }
    })

    toast.success('Characteristics saved successfully')
  }

  const handleReset = () => {
    if (activeCharacter?.details) {
      setAlignment(activeCharacter.details.alignment || '')
      setFaith(activeCharacter.details.faith || '')
      setLifestyle(activeCharacter.details.lifestyle || '')
      setPersonalityTraits(activeCharacter.details.personalityTraits || '')
      setIdeals(activeCharacter.details.ideals || '')
      setBonds(activeCharacter.details.bonds || '')
      setFlaws(activeCharacter.details.flaws || '')
      setGoals(activeCharacter.details.goals || '')
      setFears(activeCharacter.details.fears || '')
      toast.info('Changes reset')
    }
  }

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Sparkle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to edit their characteristics.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">Characteristics</h1>
        <p className="text-muted-foreground">
          Define your character's personality and beliefs
        </p>
      </div>

      <FormattingGuide />

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="alignment" className="mb-2 block flex items-center gap-2">
              <Sparkle className="h-4 w-4" weight="fill" />
              Alignment
            </Label>
            <Select value={alignment} onValueChange={setAlignment}>
              <SelectTrigger id="alignment">
                <SelectValue placeholder="Select alignment" />
              </SelectTrigger>
              <SelectContent>
                {alignments.map((align) => (
                  <SelectItem key={align} value={align.toLowerCase().replace(' ', '-')}>
                    {align}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="faith" className="mb-2 block">
              Faith / Deity
            </Label>
            <Input
              id="faith"
              value={faith}
              onChange={(e) => setFaith(e.target.value)}
              placeholder="e.g., {@deity Bahamut}, {@deity Pelor}, None"
            />
          </div>

          <div>
            <Label htmlFor="lifestyle" className="mb-2 block">
              Lifestyle
            </Label>
            <Select value={lifestyle} onValueChange={setLifestyle}>
              <SelectTrigger id="lifestyle">
                <SelectValue placeholder="Select lifestyle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wretched">Wretched</SelectItem>
                <SelectItem value="squalid">Squalid</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
                <SelectItem value="modest">Modest</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="wealthy">Wealthy</SelectItem>
                <SelectItem value="aristocratic">Aristocratic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="personality-traits"
            label="Personality Traits"
            value={personalityTraits}
            onChange={setPersonalityTraits}
            placeholder="Describe your character's personality traits... Use {@b bold} or {@i italic} for emphasis."
            rows={4}
          />

          <RichTextArea
            id="ideals"
            label="Ideals"
            value={ideals}
            onChange={setIdeals}
            placeholder="What does your character believe in? (e.g., Justice, Freedom, {@b Honor})"
            rows={3}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="bonds"
            label="Bonds"
            value={bonds}
            onChange={setBonds}
            placeholder="What ties bind your character to the world?"
            rows={4}
          />

          <RichTextArea
            id="flaws"
            label="Flaws"
            value={flaws}
            onChange={setFlaws}
            placeholder="What weaknesses does your character have?"
            rows={3}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="goals"
            label="Goals & Motivations"
            value={goals}
            onChange={setGoals}
            placeholder="What drives your character forward?"
            rows={4}
          />

          <RichTextArea
            id="fears"
            label="Fears & Phobias"
            value={fears}
            onChange={setFears}
            placeholder="What does your character fear? (e.g., {@creature dragons}, {@condition darkness})"
            rows={3}
          />
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave}>Save Characteristics</Button>
      </div>
    </div>
  )
}
