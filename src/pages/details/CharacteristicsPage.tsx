import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { RichTextArea } from '@/components/editor/RichTextArea'

export function CharacteristicsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacterDetails = useCharacterStore((state) => state.updateActiveCharacterDetails)

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

  const updateDraftDetails = (updates: Record<string, unknown>) => {
    updateActiveCharacterDetails(updates)
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
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">Characteristics</h1>
        <p className="text-muted-foreground">
          Define your character's personality and beliefs
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="alignment" className="mb-2 block flex items-center gap-2">
              <Sparkle className="h-4 w-4" weight="fill" />
              Alignment
            </Label>
            <Select value={alignment} onValueChange={(value) => {
              setAlignment(value)
              updateDraftDetails({ alignment: value })
            }}>
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
              onChange={(e) => {
                const value = e.target.value
                setFaith(value)
                updateDraftDetails({ faith: value })
              }}
              placeholder="e.g., Bahamut, Pelor, None"
            />
          </div>

          <div>
            <Label htmlFor="lifestyle" className="mb-2 block">
              Lifestyle
            </Label>
            <Select value={lifestyle} onValueChange={(value) => {
              setLifestyle(value)
              updateDraftDetails({ lifestyle: value })
            }}>
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
            onChange={(value) => {
              setPersonalityTraits(value)
              updateDraftDetails({ personalityTraits: value })
            }}
            placeholder="Describe your character's personality traits in plain language."
            rows={4}
          />

          <RichTextArea
            id="ideals"
            label="Ideals"
            value={ideals}
            onChange={(value) => {
              setIdeals(value)
              updateDraftDetails({ ideals: value })
            }}
            placeholder="What does your character believe in? (e.g., Justice, Freedom, Honor)"
            rows={3}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="bonds"
            label="Bonds"
            value={bonds}
            onChange={(value) => {
              setBonds(value)
              updateDraftDetails({ bonds: value })
            }}
            placeholder="What ties bind your character to the world?"
            rows={4}
          />

          <RichTextArea
            id="flaws"
            label="Flaws"
            value={flaws}
            onChange={(value) => {
              setFlaws(value)
              updateDraftDetails({ flaws: value })
            }}
            placeholder="What weaknesses does your character have?"
            rows={3}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="goals"
            label="Goals & Motivations"
            value={goals}
            onChange={(value) => {
              setGoals(value)
              updateDraftDetails({ goals: value })
            }}
            placeholder="What drives your character forward?"
            rows={4}
          />

          <RichTextArea
            id="fears"
            label="Fears & Phobias"
            value={fears}
            onChange={(value) => {
              setFears(value)
              updateDraftDetails({ fears: value })
            }}
            placeholder="What does your character fear? (e.g., dragons, darkness)"
            rows={3}
          />
        </Card>
      </div>
    </div>
  )
}
