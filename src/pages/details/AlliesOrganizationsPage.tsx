import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Trash, Users } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import { RichTextArea } from '@/components/character/RichTextArea'
import { FormattingGuide } from '@/components/character/FormattingGuide'
import { toast } from 'sonner'
import type { Ally } from '@/types/character'

export function AlliesOrganizationsPage() {
  const { activeCharacter, updateCharacter } = useCharacterStore()
  
  const [faction, setFaction] = useState(activeCharacter?.details?.faction || '')
  const [rank, setRank] = useState(activeCharacter?.details?.rank || '')
  const [factionNotes, setFactionNotes] = useState(activeCharacter?.details?.factionNotes || '')
  const [patron, setPatron] = useState(activeCharacter?.details?.patron || '')
  const [patronDetails, setPatronDetails] = useState(activeCharacter?.details?.patronDetails || '')
  const [nemesis, setNemesis] = useState(activeCharacter?.details?.nemesis || '')
  const [allies, setAllies] = useState<Ally[]>(activeCharacter?.details?.allies || [])

  useEffect(() => {
    if (activeCharacter?.details) {
      setFaction(activeCharacter.details.faction || '')
      setRank(activeCharacter.details.rank || '')
      setFactionNotes(activeCharacter.details.factionNotes || '')
      setPatron(activeCharacter.details.patron || '')
      setPatronDetails(activeCharacter.details.patronDetails || '')
      setNemesis(activeCharacter.details.nemesis || '')
      setAllies(activeCharacter.details.allies || [])
    }
  }, [activeCharacter])

  const addAlly = () => {
    setAllies([
      ...allies,
      {
        id: Date.now().toString(),
        name: '',
        relationship: '',
        description: '',
      },
    ])
  }

  const removeAlly = (id: string) => {
    setAllies(allies.filter((ally) => ally.id !== id))
  }

  const updateAlly = (id: string, field: keyof Ally, value: string) => {
    setAllies(allies.map(ally => 
      ally.id === id ? { ...ally, [field]: value } : ally
    ))
  }

  const handleSave = () => {
    if (!activeCharacter) {
      toast.error('No active character')
      return
    }

    updateCharacter(activeCharacter.id, {
      details: {
        ...activeCharacter.details,
        faction,
        rank,
        factionNotes,
        patron,
        patronDetails,
        nemesis,
        allies,
      }
    })
    
    toast.success('Allies & Organizations saved successfully')
  }

  const handleReset = () => {
    if (activeCharacter?.details) {
      setFaction(activeCharacter.details.faction || '')
      setRank(activeCharacter.details.rank || '')
      setFactionNotes(activeCharacter.details.factionNotes || '')
      setPatron(activeCharacter.details.patron || '')
      setPatronDetails(activeCharacter.details.patronDetails || '')
      setNemesis(activeCharacter.details.nemesis || '')
      setAllies(activeCharacter.details.allies || [])
      toast.info('Changes reset')
    }
  }

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their allies and organizations.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">Allies & Organizations</h1>
        <p className="text-muted-foreground">
          Track your character's relationships, allies, and organizational affiliations
        </p>
      </div>

      <FormattingGuide />

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="faction" className="mb-2 block flex items-center gap-2">
              <Users className="h-4 w-4" />
              Primary Faction / Organization
            </Label>
            <Input
              id="faction"
              value={faction}
              onChange={(e) => setFaction(e.target.value)}
              placeholder="e.g., Harpers, Zhentarim, None"
            />
          </div>

          <div>
            <Label htmlFor="rank" className="mb-2 block">
              Rank / Title
            </Label>
            <Input
              id="rank"
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              placeholder="e.g., Initiate, Member, Agent"
            />
          </div>

          <RichTextArea
            id="faction-notes"
            label="Faction Notes"
            value={factionNotes}
            onChange={setFactionNotes}
            placeholder="Details about your standing and activities within the organization..."
            rows={4}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="patron" className="mb-2 block">
              Patron / Mentor
            </Label>
            <Input
              id="patron"
              value={patron}
              onChange={(e) => setPatron(e.target.value)}
              placeholder="Who guides or sponsors your character?"
            />
          </div>

          <RichTextArea
            id="patron-details"
            label="Patron Details"
            value={patronDetails}
            onChange={setPatronDetails}
            placeholder="Describe your relationship with your patron..."
            rows={4}
          />

          <div>
            <Label htmlFor="nemesis" className="mb-2 block">
              Nemesis / Rival
            </Label>
            <Input
              id="nemesis"
              value={nemesis}
              onChange={(e) => setNemesis(e.target.value)}
              placeholder="Who opposes your character?"
            />
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Label className="text-lg font-semibold">Allies & Contacts</Label>
          <Button onClick={addAlly} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Ally
          </Button>
        </div>

        {allies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No allies or contacts added yet</p>
            <Button onClick={addAlly} size="sm" variant="outline" className="mt-3">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Ally
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {allies.map((ally) => (
              <Card key={ally.id} className="p-4 space-y-3 bg-muted/30">
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`ally-name-${ally.id}`} className="text-sm mb-1 block">
                        Name
                      </Label>
                      <Input
                        id={`ally-name-${ally.id}`}
                        placeholder="Ally name"
                        value={ally.name}
                        onChange={(e) => updateAlly(ally.id, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`ally-relationship-${ally.id}`} className="text-sm mb-1 block">
                        Relationship
                      </Label>
                      <Input
                        id={`ally-relationship-${ally.id}`}
                        placeholder="e.g., Friend, Contact, Guild Member"
                        value={ally.relationship}
                        onChange={(e) => updateAlly(ally.id, 'relationship', e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAlly(ally.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
                <RichTextArea
                  id={`ally-description-${ally.id}`}
                  label="Description"
                  value={ally.description}
                  onChange={(value) => updateAlly(ally.id, 'description', value)}
                  placeholder="Describe this ally and your relationship..."
                  rows={2}
                />
              </Card>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave}>Save Allies & Organizations</Button>
      </div>
    </div>
  )
}
