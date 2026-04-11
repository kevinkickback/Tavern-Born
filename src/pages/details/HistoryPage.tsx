import { BookOpen } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { RichTextArea } from '@/components/editor/RichTextArea'
import { Card } from '@/components/ui/card'
import { useCharacterStore } from '@/store/characterStore'

export function HistoryPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  )

  const [origin, setOrigin] = useState(activeCharacter?.details?.origin || '')
  const [family, setFamily] = useState(activeCharacter?.details?.family || '')
  const [definingMoment, setDefiningMoment] = useState(
    activeCharacter?.details?.definingMoment || '',
  )
  const [lifeEvents, setLifeEvents] = useState(activeCharacter?.details?.lifeEvents || '')
  const [backstory, setBackstory] = useState(activeCharacter?.details?.backstory || '')
  const originId = useId()
  const familyId = useId()
  const definingMomentId = useId()
  const lifeEventsId = useId()
  const backstoryId = useId()

  useEffect(() => {
    if (activeCharacter?.details) {
      setOrigin(activeCharacter.details.origin || '')
      setFamily(activeCharacter.details.family || '')
      setDefiningMoment(activeCharacter.details.definingMoment || '')
      setLifeEvents(activeCharacter.details.lifeEvents || '')
      setBackstory(activeCharacter.details.backstory || '')
    }
  }, [activeCharacter])

  const updateDraftDetails = (updates: Record<string, unknown>) => {
    updateActiveCharacterDetails(updates)
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
        <p className="text-muted-foreground">Tell your character's story and backstory</p>
      </div>

      <div className="grid gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="h-5 w-5" weight="fill" />
            <span className="text-lg font-semibold">Origin & Early Life</span>
          </div>
          <RichTextArea
            id={originId}
            value={origin}
            onChange={(value) => {
              setOrigin(value)
              updateDraftDetails({ origin: value })
            }}
            placeholder="Where was your character born? What was their childhood like?&#10;&#10;Describe key memories, people, and places that shaped them."
            rows={6}
            helpText="Describe your character's birthplace, childhood, and formative years."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={familyId}
            label="Family & Heritage"
            value={family}
            onChange={(value) => {
              setFamily(value)
              updateDraftDetails({ family: value })
            }}
            placeholder="Who are your character's family members? What is their family history?&#10;&#10;Example: My father was a renowned soldier who served in the royal guard."
            rows={5}
            helpText="Detail your character's family members, relationships, and ancestral heritage."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={definingMomentId}
            label="Defining Moment"
            value={definingMoment}
            onChange={(value) => {
              setDefiningMoment(value)
              updateDraftDetails({ definingMoment: value })
            }}
            placeholder="What pivotal event shaped your character into who they are today?&#10;&#10;This moment changed everything..."
            rows={5}
            helpText="The crucial event or turning point that set your character on their current path."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={lifeEventsId}
            label="Major Life Events"
            value={lifeEvents}
            onChange={(value) => {
              setLifeEvents(value)
              updateDraftDetails({ lifeEvents: value })
            }}
            placeholder="Chronicle significant events in your character's life...&#10;&#10;Age 15: Apprenticed to a master scholar&#10;Age 20: Survived a deadly encounter in the Underdark"
            rows={6}
            helpText="A timeline or list of important events in your character's life."
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={backstoryId}
            label="Full Backstory"
            value={backstory}
            onChange={(value) => {
              setBackstory(value)
              updateDraftDetails({ backstory: value })
            }}
            placeholder="Write your character's complete backstory. This can be as detailed as you like...&#10;&#10;Use double line breaks to create paragraphs and keep events in a clear timeline."
            rows={10}
            helpText="Your character's full narrative. Be as creative and detailed as you want!"
          />
        </Card>
      </div>
    </div>
  )
}
