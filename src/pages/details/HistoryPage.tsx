import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BookOpen } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useState, useEffect } from 'react'
import { RichTextArea } from '@/components/editor/RichTextArea'
import { FormattingGuide } from '@/components/editor/FormattingGuide'
import { toast } from 'sonner'

export function HistoryPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)

  const [origin, setOrigin] = useState(activeCharacter?.details?.origin || '')
  const [family, setFamily] = useState(activeCharacter?.details?.family || '')
  const [definingMoment, setDefiningMoment] = useState(activeCharacter?.details?.definingMoment || '')
  const [lifeEvents, setLifeEvents] = useState(activeCharacter?.details?.lifeEvents || '')
  const [backstory, setBackstory] = useState(activeCharacter?.details?.backstory || '')

  useEffect(() => {
    if (activeCharacter?.details) {
      setOrigin(activeCharacter.details.origin || '')
      setFamily(activeCharacter.details.family || '')
      setDefiningMoment(activeCharacter.details.definingMoment || '')
      setLifeEvents(activeCharacter.details.lifeEvents || '')
      setBackstory(activeCharacter.details.backstory || '')
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
        origin,
        family,
        definingMoment,
        lifeEvents,
        backstory,
      }
    })

    toast.success('History saved successfully')
  }

  const handleReset = () => {
    if (activeCharacter?.details) {
      setOrigin(activeCharacter.details.origin || '')
      setFamily(activeCharacter.details.family || '')
      setDefiningMoment(activeCharacter.details.definingMoment || '')
      setLifeEvents(activeCharacter.details.lifeEvents || '')
      setBackstory(activeCharacter.details.backstory || '')
      toast.info('Changes reset')
    }
  }

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="fill" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to write their history.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">History</h1>
        <p className="text-muted-foreground">
          Tell your character's story and backstory
        </p>
      </div>

      <FormattingGuide />

      <div className="grid gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-5 w-5" weight="fill" />
            <span className="text-lg font-semibold">Origin & Early Life</span>
          </div>
          <RichTextArea
            id="origin"
            value={origin}
            onChange={setOrigin}
            placeholder="Where was your character born? What was their childhood like?&#10;&#10;Use {@b bold text}, {@i italic text}, and @-tags like {@race Elf} or {@background Soldier} to add rich formatting."
            rows={6}
            helpText="Describe your character's birthplace, childhood, and formative years."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="family"
            label="Family & Heritage"
            value={family}
            onChange={setFamily}
            placeholder="Who are your character's family members? What is their family history?&#10;&#10;Example: My father was a renowned {@class Fighter} who served {@deity Bahamut}."
            rows={5}
            helpText="Detail your character's family members, relationships, and ancestral heritage."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="defining-moment"
            label="Defining Moment"
            value={definingMoment}
            onChange={setDefiningMoment}
            placeholder="What pivotal event shaped your character into who they are today?&#10;&#10;This moment changed everything..."
            rows={5}
            helpText="The crucial event or turning point that set your character on their current path."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="life-events"
            label="Major Life Events"
            value={lifeEvents}
            onChange={setLifeEvents}
            placeholder="Chronicle significant events in your character's life...&#10;&#10;Age 15: Apprenticed to a master {@skill Arcana} scholar&#10;Age 20: First encountered {@creature Mind Flayers}"
            rows={6}
            helpText="A timeline or list of important events in your character's life."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id="backstory"
            label="Full Backstory"
            value={backstory}
            onChange={setBackstory}
            placeholder="Write your character's complete backstory. This can be as detailed as you like...&#10;&#10;Use double line breaks to create paragraphs. Reference {@spell spells}, {@creature creatures}, {@item items}, and more with @-tags."
            rows={10}
            helpText="Your character's full narrative. Be as creative and detailed as you want!"
          />
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave}>Save History</Button>
      </div>
    </div>
  )
}
