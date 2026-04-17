import {
  Brain,
  IdentificationCard,
  Scroll,
  Sparkle,
  Star,
  TextAa,
  Users,
} from '@phosphor-icons/react'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { RichTextArea } from '@/components/editor/RichTextArea'
import { Card } from '@/components/ui/card'
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

const LIFESTYLES = [
  'Wretched',
  'Squalid',
  'Poor',
  'Modest',
  'Comfortable',
  'Wealthy',
  'Aristocratic',
]

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

export function CharacteristicsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  )
  const gameData = useGameDataStore((state) => state.gameData)

  // Identity
  const [charName, setCharName] = useState(activeCharacter?.name || '')
  const [playerName, setPlayerName] = useState(activeCharacter?.details?.playerName || '')
  const [gender, setGender] = useState(activeCharacter?.details?.gender || '')
  const [faith, setFaith] = useState(activeCharacter?.details?.faith || '')
  const [alignment, setAlignment] = useState(activeCharacter?.details?.alignment || '')
  const [xp, setXp] = useState(activeCharacter?.experiencePoints ?? 0)
  const [lifestyle, setLifestyle] = useState(activeCharacter?.details?.lifestyle || '')

  // Physical traits
  const [age, setAge] = useState(activeCharacter?.details?.age?.toString() || '')
  const [height, setHeight] = useState(activeCharacter?.details?.height || '')
  const [weight, setWeight] = useState(activeCharacter?.details?.weight || '')
  const [eyes, setEyes] = useState(activeCharacter?.details?.eyes || '')
  const [hair, setHair] = useState(activeCharacter?.details?.hair || '')
  const [skin, setSkin] = useState(activeCharacter?.details?.skin || '')

  // Personality
  const [personalityTraits, setPersonalityTraits] = useState(
    activeCharacter?.details?.personalityTraits || '',
  )
  const [ideals, setIdeals] = useState(activeCharacter?.details?.ideals || '')
  const [bonds, setBonds] = useState(activeCharacter?.details?.bonds || '')
  const [flaws, setFlaws] = useState(activeCharacter?.details?.flaws || '')
  const [goals, setGoals] = useState(activeCharacter?.details?.goals || '')
  const [fears, setFears] = useState(activeCharacter?.details?.fears || '')

  // Story
  const [backstory, setBackstory] = useState(activeCharacter?.details?.backstory || '')
  const [appearance, setAppearance] = useState(activeCharacter?.details?.appearance || '')
  const [alliesAndOrganizations, setAlliesAndOrganizations] = useState(
    activeCharacter?.details?.alliesAndOrganizations || '',
  )

  // IDs
  const charNameId = useId()
  const playerNameId = useId()
  const genderId = useId()
  const deityId = useId()
  const deityListId = useId()
  const alignmentId = useId()
  const xpId = useId()
  const lifestyleId = useId()
  const ageId = useId()
  const heightId = useId()
  const weightId = useId()
  const eyesId = useId()
  const hairId = useId()
  const skinId = useId()
  const personalityTraitsId = useId()
  const idealsId = useId()
  const bondsId = useId()
  const flawsId = useId()
  const goalsId = useId()
  const fearsId = useId()
  const backstoryId = useId()
  const appearanceId = useId()
  const alliesId = useId()

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
      const d = activeCharacter.details
      setPlayerName(d.playerName || '')
      setGender(d.gender || '')
      setFaith(d.faith || '')
      setAlignment(d.alignment || '')
      setLifestyle(d.lifestyle || '')
      setAge(d.age?.toString() || '')
      setHeight(d.height || '')
      setWeight(d.weight || '')
      setEyes(d.eyes || '')
      setHair(d.hair || '')
      setSkin(d.skin || '')
      setPersonalityTraits(d.personalityTraits || '')
      setIdeals(d.ideals || '')
      setBonds(d.bonds || '')
      setFlaws(d.flaws || '')
      setGoals(d.goals || '')
      setFears(d.fears || '')
      setBackstory(d.backstory || '')
      setAppearance(d.appearance || '')
      setAlliesAndOrganizations(d.alliesAndOrganizations || '')
    }
  }, [activeCharacter])

  if (!activeCharacter) {
    return <NoCharCard icon={<Sparkle weight="duotone" />} noun="edit characteristics" />
  }

  return (
    <div>
      {/* Page header */}
      <div className="px-6 py-5 page-header-band mb-6 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Sparkle className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Characteristics</h1>
              <p className="text-sm text-muted-foreground">Identity, personality, and story</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        {/* Top input tiles */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Character Name tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <TextAa className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Character Name
                </p>
                <Input
                  id={charNameId}
                  value={charName}
                  onChange={(e) => {
                    setCharName(e.target.value)
                    updateCharacter(activeCharacter.id, { name: e.target.value })
                  }}
                  placeholder="Character name"
                  className="h-7 text-sm font-semibold border-0 bg-transparent p-0 pl-2 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          {/* Player Name tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <TextAa className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Player Name
                </p>
                <Input
                  id={playerNameId}
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value)
                    updateActiveCharacterDetails({ playerName: e.target.value })
                  }}
                  placeholder="Player name"
                  className="h-7 text-sm font-semibold border-0 bg-transparent p-0 pl-2 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          {/* XP tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Star className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Experience Points
                </p>
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
                  className="h-7 text-sm font-semibold border-0 bg-transparent p-0 pl-2 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="max-w-7xl mx-auto w-full space-y-4">
          {/* ── Identity ── */}
          <Card className="w-full overflow-hidden">
            <div className="h-10 bg-gradient-to-r from-indigo-500/20 via-indigo-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
              <IdentificationCard className="h-4 w-4 text-indigo-400" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Identity
              </span>
            </div>
            <div className="p-4 space-y-4">
              {/* Dropdowns + deity */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Field id={genderId} label="Gender">
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
                </Field>

                <Field id={alignmentId} label="Alignment">
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
                </Field>

                <Field id={lifestyleId} label="Lifestyle">
                  <Select
                    value={lifestyle}
                    onValueChange={(value) => {
                      setLifestyle(value)
                      updateActiveCharacterDetails({ lifestyle: value })
                    }}
                  >
                    <SelectTrigger id={lifestyleId}>
                      <SelectValue placeholder="Select lifestyle" />
                    </SelectTrigger>
                    <SelectContent>
                      {LIFESTYLES.map((ls) => (
                        <SelectItem key={ls} value={ls.toLowerCase()}>
                          {ls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field id={deityId} label="Deity">
                  <Input
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
                </Field>
              </div>

              {/* Physical traits */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                <Field id={ageId} label="Age">
                  <Input
                    id={ageId}
                    type="number"
                    min={0}
                    value={age}
                    onChange={(e) => {
                      setAge(e.target.value)
                      updateActiveCharacterDetails({
                        age: e.target.value ? Number.parseInt(e.target.value, 10) : undefined,
                      })
                    }}
                    placeholder="25"
                  />
                </Field>
                <Field id={heightId} label="Height">
                  <Input
                    id={heightId}
                    value={height}
                    onChange={(e) => {
                      setHeight(e.target.value)
                      updateActiveCharacterDetails({ height: e.target.value })
                    }}
                    placeholder={`5'10"`}
                  />
                </Field>
                <Field id={weightId} label="Weight">
                  <Input
                    id={weightId}
                    value={weight}
                    onChange={(e) => {
                      setWeight(e.target.value)
                      updateActiveCharacterDetails({ weight: e.target.value })
                    }}
                    placeholder="180 lbs"
                  />
                </Field>
                <Field id={eyesId} label="Eyes">
                  <Input
                    id={eyesId}
                    value={eyes}
                    onChange={(e) => {
                      setEyes(e.target.value)
                      updateActiveCharacterDetails({ eyes: e.target.value })
                    }}
                    placeholder="Blue"
                  />
                </Field>
                <Field id={hairId} label="Hair">
                  <Input
                    id={hairId}
                    value={hair}
                    onChange={(e) => {
                      setHair(e.target.value)
                      updateActiveCharacterDetails({ hair: e.target.value })
                    }}
                    placeholder="Black"
                  />
                </Field>
                <Field id={skinId} label="Skin">
                  <Input
                    id={skinId}
                    value={skin}
                    onChange={(e) => {
                      setSkin(e.target.value)
                      updateActiveCharacterDetails({ skin: e.target.value })
                    }}
                    placeholder="Tan"
                  />
                </Field>
              </div>
              <RichTextArea
                id={appearanceId}
                label="Appearance"
                value={appearance}
                onChange={(value) => {
                  setAppearance(value)
                  updateActiveCharacterDetails({ appearance: value })
                }}
                placeholder="Add details not captured above — unique scars, tattoos, distinctive features, build, posture, or anything else that defines how your character looks."
                rows={4}
              />
            </div>
          </Card>

          {/* ── Personality ── */}
          <Card className="w-full overflow-hidden">
            <div className="h-10 bg-gradient-to-r from-violet-500/20 via-violet-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
              <Brain className="h-4 w-4 text-violet-400" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Personality
              </span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <RichTextArea
                  id={personalityTraitsId}
                  label="Personality Traits"
                  value={personalityTraits}
                  onChange={(value) => {
                    setPersonalityTraits(value)
                    updateActiveCharacterDetails({ personalityTraits: value })
                  }}
                  placeholder="Describe your character's personality traits."
                  rows={5}
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
                  rows={5}
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
                  rows={5}
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
                  rows={5}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                <RichTextArea
                  id={goalsId}
                  label="Goals"
                  value={goals}
                  onChange={(value) => {
                    setGoals(value)
                    updateActiveCharacterDetails({ goals: value })
                  }}
                  placeholder="What does your character strive toward?"
                  rows={4}
                />
                <RichTextArea
                  id={fearsId}
                  label="Fears"
                  value={fears}
                  onChange={(value) => {
                    setFears(value)
                    updateActiveCharacterDetails({ fears: value })
                  }}
                  placeholder="What does your character dread?"
                  rows={4}
                />
              </div>
            </div>
          </Card>

          {/* ── Story ── */}
          <Card className="w-full overflow-hidden">
            <div className="h-10 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
              <Scroll className="h-4 w-4 text-amber-400" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Story
              </span>
            </div>
            <div className="p-4 space-y-4">
              <RichTextArea
                id={backstoryId}
                label="Backstory"
                value={backstory}
                onChange={(value) => {
                  setBackstory(value)
                  updateActiveCharacterDetails({ backstory: value })
                }}
                placeholder="Your character's history, background, and how they came to be where they are."
                rows={10}
              />
            </div>
          </Card>

          {/* ── Connections ── */}
          <Card className="w-full overflow-hidden">
            <div className="h-10 bg-gradient-to-r from-teal-500/20 via-teal-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
              <Users className="h-4 w-4 text-teal-400" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Connections
              </span>
            </div>
            <div className="p-4">
              <RichTextArea
                id={alliesId}
                label="Allies & Organizations"
                value={alliesAndOrganizations}
                onChange={(value) => {
                  setAlliesAndOrganizations(value)
                  updateActiveCharacterDetails({ alliesAndOrganizations: value })
                }}
                placeholder="Describe your character's allies, factions, and organizational ties."
                rows={8}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
