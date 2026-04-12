import { Sparkle } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { RichTextArea } from '@/components/editor/RichTextArea'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { NoCharCard } from '../_shared'

const ALIGNMENTS = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
]

export function CharacteristicsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  )
  const gameData = useGameDataStore((state) => state.gameData)

  const [charName, setCharName] = useState(activeCharacter?.name || '')
  const [playerName, setPlayerName] = useState(activeCharacter?.details?.playerName || '')
  const [gender, setGender] = useState(activeCharacter?.details?.gender || '')
  const [faith, setFaith] = useState(activeCharacter?.details?.faith || '')
  const [alignment, setAlignment] = useState(activeCharacter?.details?.alignment || '')
  const [xp, setXp] = useState(activeCharacter?.experiencePoints ?? 0)
  const [personalityTraits, setPersonalityTraits] = useState(
    activeCharacter?.details?.personalityTraits || '',
  )
  const [ideals, setIdeals] = useState(activeCharacter?.details?.ideals || '')
  const [bonds, setBonds] = useState(activeCharacter?.details?.bonds || '')
  const [flaws, setFlaws] = useState(activeCharacter?.details?.flaws || '')

  const charNameId = useId()
  const playerNameId = useId()
  const genderId = useId()
  const deityId = useId()
  const deityListId = useId()
  const alignmentId = useId()
  const xpId = useId()
  const personalityTraitsId = useId()
  const idealsId = useId()
  const bondsId = useId()
  const flawsId = useId()

  const deityInputRef = useRef<HTMLInputElement>(null)

  const deityNames = useMemo(() => {
    if (!gameData?.deities) return []
    const names = new Set<string>()
    for (const d of gameData.deities) {
      const name = (d as { name?: string }).name
      if (name) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [gameData?.deities])

  useEffect(() => {
    setCharName(activeCharacter?.name || '')
    setXp(activeCharacter?.experiencePoints ?? 0)
    if (activeCharacter?.details) {
      setPlayerName(activeCharacter.details.playerName || '')
      setGender(activeCharacter.details.gender || '')
      setFaith(activeCharacter.details.faith || '')
      setAlignment(activeCharacter.details.alignment || '')
      setPersonalityTraits(activeCharacter.details.personalityTraits || '')
      setIdeals(activeCharacter.details.ideals || '')
      setBonds(activeCharacter.details.bonds || '')
      setFlaws(activeCharacter.details.flaws || '')
    }
  }, [activeCharacter])

  if (!activeCharacter) {
    return <NoCharCard icon={<Sparkle weight="duotone" />} noun="edit characteristics" />
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <h1 className="font-display text-4xl font-bold flex items-center gap-3">
        <Sparkle className="h-8 w-8 text-accent" weight="duotone" />
        Characteristics
      </h1>

      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
            Identity
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            <div className="space-y-1.5">
              <Label htmlFor={charNameId}>Character Name</Label>
              <Input
                id={charNameId}
                value={charName}
                onChange={(e) => {
                  setCharName(e.target.value)
                  updateCharacter(activeCharacter.id, { name: e.target.value })
                }}
                placeholder="Character name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={playerNameId}>Player Name</Label>
              <Input
                id={playerNameId}
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value)
                  updateActiveCharacterDetails({ playerName: e.target.value })
                }}
                placeholder="Player name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={genderId}>Gender</Label>
              <Select
                value={gender}
                onValueChange={(value) => {
                  setGender(value)
                  updateActiveCharacterDetails({ gender: value })
                }}
              >
                <SelectTrigger id={genderId}>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Non-binary">Non-binary</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={deityId}>Deity</Label>
              <Input
                ref={deityInputRef}
                id={deityId}
                list={deityListId}
                value={faith}
                onChange={(e) => {
                  setFaith(e.target.value)
                  updateActiveCharacterDetails({ faith: e.target.value })
                }}
                placeholder="Enter or select deity"
              />
              <datalist id={deityListId}>
                {deityNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={xpId}>Experience Points</Label>
              <Input
                id={xpId}
                type="number"
                min={0}
                step={1}
                value={xp || ''}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    setXp(0)
                    updateCharacter(activeCharacter.id, { experiencePoints: 0 })
                    return
                  }
                  const parsed = Number.parseInt(raw, 10)
                  if (Number.isNaN(parsed)) return
                  const val = Math.max(0, parsed)
                  setXp(val)
                  updateCharacter(activeCharacter.id, { experiencePoints: val })
                }}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={alignmentId}>Alignment</Label>
              <Select
                value={alignment}
                onValueChange={(value) => {
                  setAlignment(value)
                  updateActiveCharacterDetails({ alignment: value })
                }}
              >
                <SelectTrigger id={alignmentId}>
                  <SelectValue placeholder="Select alignment" />
                </SelectTrigger>
                <SelectContent>
                  {ALIGNMENTS.map((align) => (
                    <SelectItem key={align} value={align.toLowerCase().replace(' ', '-')}>
                      {align}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
            Personality
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <RichTextArea
              id={personalityTraitsId}
              label="Personality Traits"
              value={personalityTraits}
              onChange={(value) => {
                setPersonalityTraits(value)
                updateActiveCharacterDetails({ personalityTraits: value })
              }}
              placeholder="Describe your character's personality traits."
              rows={6}
            />

            <RichTextArea
              id={idealsId}
              label="Ideals"
              value={ideals}
              onChange={(value) => {
                setIdeals(value)
                updateActiveCharacterDetails({ ideals: value })
              }}
              placeholder="What does your character believe in?"
              rows={6}
            />

            <RichTextArea
              id={bondsId}
              label="Bonds"
              value={bonds}
              onChange={(value) => {
                setBonds(value)
                updateActiveCharacterDetails({ bonds: value })
              }}
              placeholder="What ties bind your character to the world?"
              rows={6}
            />

            <RichTextArea
              id={flawsId}
              label="Flaws"
              value={flaws}
              onChange={(value) => {
                setFlaws(value)
                updateActiveCharacterDetails({ flaws: value })
              }}
              placeholder="What weaknesses does your character have?"
              rows={6}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
