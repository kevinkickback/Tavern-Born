import {
  Brain,
  IdentificationCard,
  Scroll,
  Sparkle,
  Star,
  TextAa,
  Upload,
  Users,
} from '@phosphor-icons/react'
import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RichTextArea } from '@/components/editor/RichTextArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { ALIGNMENTS, LIFESTYLES } from '@/lib/5etools/constants'
import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'
import {
  CUSTOM_ORGANIZATION_KEY,
  getOrganizationKey,
  resolveOrganizationImageSrc,
} from '@/lib/character/organizationConstants'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import { NoCharCard } from '../_shared'
import { CharacteristicsField as Field } from './characteristics/CharacteristicsField'
import { CharacteristicsSectionHeader } from './characteristics/CharacteristicsSectionHeader'
import { CharacteristicsTabs } from './characteristics/CharacteristicsTabs'
import {
  type CharacteristicsDraft,
  type CharacteristicsSection,
  CUSTOM_GRADIENT_PRESETS,
  createCharacteristicsDraft,
  DEFAULT_CUSTOM_GRADIENT,
} from './characteristics/model'
import { OrganizationPreview } from './characteristics/OrganizationPreview'

const EMPTY_ORGANIZATIONS: [] = []

export function CharacteristicsPage() {
  const [activeSection, setActiveSection] = useState<CharacteristicsSection>('identity')
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  )
  const gameData = useFilteredGameData()

  const [charName, setCharName] = useState(activeCharacter?.name || '')
  const [xp, setXp] = useState(activeCharacter?.experiencePoints ?? 0)
  const [draft, setDraft] = useState(() => createCharacteristicsDraft(activeCharacter))
  const {
    playerName,
    gender,
    faith,
    alignment,
    lifestyle,
    age,
    height,
    weight,
    eyes,
    hair,
    skin,
    personalityTraits,
    ideals,
    bonds,
    flaws,
    goals,
    fears,
    backstory,
    appearance,
    organizationSelectionKey,
    organizationCustomName,
    organizationCustomDescription,
    organizationCustomImage,
    organizationCustomGradient,
  } = draft
  const [failedOrganizationPreviewImagePath, setFailedOrganizationPreviewImagePath] = useState('')
  const customImageInputRef = useRef<HTMLInputElement>(null)

  const setDraftField = (field: keyof CharacteristicsDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

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
  const organizationSelectId = useId()
  const organizationCustomNameId = useId()
  const organizationCustomDescriptionId = useId()
  const characteristicsTabsId = useId()

  const organizationOptions = useMemo(() => {
    return (gameData.organizations ?? EMPTY_ORGANIZATIONS).map((organization) => ({
      key: getOrganizationKey(organization.name, organization.source),
      organization,
    }))
  }, [gameData.organizations])

  const selectedOrganization = useMemo(() => {
    return organizationOptions.find((option) => option.key === organizationSelectionKey)
      ?.organization
  }, [organizationOptions, organizationSelectionKey])

  const deityNames = useMemo(() => {
    if (!gameData.deities) return []
    const names = new Set<string>()
    for (const d of gameData.deities) {
      const name = (d as { name?: string }).name
      if (name) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [gameData.deities])

  useEffect(() => {
    setCharName(activeCharacter?.name || '')
    setXp(activeCharacter?.experiencePoints ?? 0)
    setDraft(createCharacteristicsDraft(activeCharacter))
  }, [activeCharacter])

  const handleOrganizationSelect = (value: string) => {
    setDraftField('organizationSelectionKey', value)

    if (value === CUSTOM_ORGANIZATION_KEY) {
      updateActiveCharacterDetails({
        organizationSelectionKey: value,
      })
      return
    }

    setDraft((current) => ({
      ...current,
      organizationSelectionKey: value,
      organizationCustomName: '',
      organizationCustomDescription: '',
      organizationCustomImage: '',
      organizationCustomGradient: DEFAULT_CUSTOM_GRADIENT,
    }))
    updateActiveCharacterDetails({
      organizationSelectionKey: value,
      organizationCustomName: '',
      organizationCustomDescription: '',
      organizationCustomImage: '',
      organizationCustomGradient: DEFAULT_CUSTOM_GRADIENT,
    })
  }

  const handleOrganizationImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    if (file.size > MAX_PORTRAIT_SIZE) {
      toast.error('Image size must be less than 5MB')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setDraftField('organizationCustomImage', result)
      updateActiveCharacterDetails({ organizationCustomImage: result })
      if (customImageInputRef.current) {
        customImageInputRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  const handleClearCustomImage = () => {
    setDraftField('organizationCustomImage', '')
    updateActiveCharacterDetails({ organizationCustomImage: '' })
    if (customImageInputRef.current) {
      customImageInputRef.current.value = ''
    }
  }

  const previewTitle =
    organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
      ? organizationCustomName || 'Custom Organization'
      : selectedOrganization?.name || ''

  const previewDescription =
    organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
      ? organizationCustomDescription || ''
      : selectedOrganization?.description || ''

  const previewImage = resolveOrganizationImageSrc(
    organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
      ? organizationCustomImage || ''
      : selectedOrganization?.imagePath || '',
  )

  const previewGradient =
    organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
      ? (CUSTOM_GRADIENT_PRESETS.find((p) => p.key === organizationCustomGradient)?.className ??
        CUSTOM_GRADIENT_PRESETS[0].className)
      : ''

  const showPreviewImage =
    Boolean(previewImage) && failedOrganizationPreviewImagePath !== previewImage

  if (!activeCharacter) {
    return <NoCharCard icon={<Sparkle weight="duotone" />} noun="edit characteristics" />
  }

  return (
    <WorkspacePage>
      <WorkspaceBody className="flex flex-col overflow-hidden bg-workspace-pane">
        <CharacteristicsTabs
          activeSection={activeSection}
          idPrefix={characteristicsTabsId}
          onChange={setActiveSection}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[var(--workspace-form-max-width)] p-4">
            {/* Top input tiles */}
            <div
              className={cn(
                'mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3',
                activeSection !== 'identity' && 'hidden',
              )}
            >
              {/* Character Name tile */}
              <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-selected">
                    <TextAa className="size-4 text-primary" weight="bold" />
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
                      className="h-8 border-border bg-workspace-detail px-2 text-sm font-semibold shadow-sm transition-colors hover:border-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              {/* Player Name tile */}
              <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-selected">
                    <TextAa className="size-4 text-primary" weight="bold" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Player Name
                    </p>
                    <Input
                      id={playerNameId}
                      value={playerName}
                      onChange={(e) => {
                        setDraftField('playerName', e.target.value)
                        updateActiveCharacterDetails({ playerName: e.target.value })
                      }}
                      placeholder="Player name"
                      className="h-8 border-border bg-workspace-detail px-2 text-sm font-semibold shadow-sm transition-colors hover:border-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              {/* XP tile */}
              <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-selected">
                    <Star className="size-4 text-primary" weight="bold" />
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
                      className="h-8 border-border bg-workspace-detail px-2 text-sm font-semibold shadow-sm transition-colors hover:border-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className="w-full">
              {/* ── Identity ── */}
              <section
                id={`${characteristicsTabsId}-panel-identity`}
                role="tabpanel"
                aria-labelledby={`${characteristicsTabsId}-tab-identity`}
                hidden={activeSection !== 'identity'}
                className={cn(
                  'w-full overflow-hidden rounded-md border border-border bg-workspace-detail',
                  activeSection !== 'identity' && 'hidden',
                )}
              >
                <CharacteristicsSectionHeader
                  icon={IdentificationCard}
                  iconClassName="text-indigo-600 dark:text-indigo-400"
                  title="Identity"
                />
                <div className="p-4 space-y-4">
                  {/* Dropdowns + deity */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Field id={genderId} label="Gender">
                      <Select
                        value={gender}
                        onValueChange={(value) => {
                          setDraftField('gender', value)
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
                          setDraftField('alignment', value)
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
                          setDraftField('lifestyle', value)
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
                          setDraftField('faith', e.target.value)
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
                          setDraftField('age', e.target.value)
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
                          setDraftField('height', e.target.value)
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
                          setDraftField('weight', e.target.value)
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
                          setDraftField('eyes', e.target.value)
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
                          setDraftField('hair', e.target.value)
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
                          setDraftField('skin', e.target.value)
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
                      setDraftField('appearance', value)
                      updateActiveCharacterDetails({ appearance: value })
                    }}
                    placeholder="Add details not captured above — unique scars, tattoos, distinctive features, build, posture, or anything else that defines how your character looks."
                    rows={4}
                  />
                </div>
              </section>

              {/* ── Personality ── */}
              <section
                id={`${characteristicsTabsId}-panel-personality`}
                role="tabpanel"
                aria-labelledby={`${characteristicsTabsId}-tab-personality`}
                hidden={activeSection !== 'personality'}
                className={cn(
                  'w-full overflow-hidden rounded-md border border-border bg-workspace-detail',
                  activeSection !== 'personality' && 'hidden',
                )}
              >
                <CharacteristicsSectionHeader
                  icon={Brain}
                  iconClassName="text-violet-400"
                  title="Personality"
                />
                <div className="p-4 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <RichTextArea
                      id={personalityTraitsId}
                      label="Personality Traits"
                      value={personalityTraits}
                      onChange={(value) => {
                        setDraftField('personalityTraits', value)
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
                        setDraftField('ideals', value)
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
                        setDraftField('bonds', value)
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
                        setDraftField('flaws', value)
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
                        setDraftField('goals', value)
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
                        setDraftField('fears', value)
                        updateActiveCharacterDetails({ fears: value })
                      }}
                      placeholder="What does your character dread?"
                      rows={4}
                    />
                  </div>
                </div>
              </section>

              {/* ── Story ── */}
              <section
                id={`${characteristicsTabsId}-panel-story`}
                role="tabpanel"
                aria-labelledby={`${characteristicsTabsId}-tab-story`}
                hidden={activeSection !== 'story'}
                className={cn(
                  'w-full overflow-hidden rounded-md border border-border bg-workspace-detail',
                  activeSection !== 'story' && 'hidden',
                )}
              >
                <CharacteristicsSectionHeader
                  icon={Scroll}
                  iconClassName="text-amber-400"
                  title="Story"
                />
                <div className="p-4 space-y-4">
                  <RichTextArea
                    id={backstoryId}
                    label="Backstory"
                    value={backstory}
                    onChange={(value) => {
                      setDraftField('backstory', value)
                      updateActiveCharacterDetails({ backstory: value })
                    }}
                    placeholder="Your character's history, background, and how they came to be where they are."
                    rows={10}
                  />
                </div>
              </section>

              {/* ── Connections ── */}
              <section
                id={`${characteristicsTabsId}-panel-connections`}
                role="tabpanel"
                aria-labelledby={`${characteristicsTabsId}-tab-connections`}
                hidden={activeSection !== 'connections'}
                className={cn(
                  'w-full overflow-hidden rounded-md border border-border bg-workspace-detail',
                  activeSection !== 'connections' && 'hidden',
                )}
              >
                <CharacteristicsSectionHeader
                  icon={Users}
                  iconClassName="text-teal-400"
                  title="Connections"
                />
                <div className="p-4 space-y-4">
                  {/* Dropdown — always its own row */}
                  <Field id={organizationSelectId} label="Allies & Organizations">
                    <Select
                      value={organizationSelectionKey}
                      onValueChange={handleOrganizationSelect}
                    >
                      <SelectTrigger id={organizationSelectId}>
                        <SelectValue placeholder="Select an organization or choose custom" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizationOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.organization.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_ORGANIZATION_KEY}>Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {/* Custom controls row */}
                  {organizationSelectionKey === CUSTOM_ORGANIZATION_KEY && (
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex-1 min-w-[160px]">
                        <Field id={organizationCustomNameId} label="Name">
                          <Input
                            id={organizationCustomNameId}
                            value={organizationCustomName}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftField('organizationCustomName', value)
                              updateActiveCharacterDetails({ organizationCustomName: value })
                            }}
                            placeholder="Organization name"
                          />
                        </Field>
                      </div>

                      <div className="hidden sm:block self-stretch w-px bg-border/50 mx-2" />

                      <div className="shrink-0 space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Image
                        </Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => customImageInputRef.current?.click()}
                          >
                            <Upload className="h-4 w-4 mr-1.5" />
                            Upload
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClearCustomImage}
                            disabled={!organizationCustomImage}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      <div className="hidden sm:block self-stretch w-px bg-border/50 mx-2" />

                      <div className="shrink-0 space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Background
                        </Label>
                        <div className="flex items-center gap-2">
                          {CUSTOM_GRADIENT_PRESETS.map((preset) => (
                            <button
                              key={preset.key}
                              type="button"
                              onClick={() => {
                                setDraftField('organizationCustomGradient', preset.key)
                                updateActiveCharacterDetails({
                                  organizationCustomGradient: preset.key,
                                })
                              }}
                              aria-label={`Use ${preset.key} organization background`}
                              aria-pressed={organizationCustomGradient === preset.key}
                              className={cn(
                                `size-8 shrink-0 cursor-pointer rounded-md bg-gradient-to-br ${preset.className} transition-all`,
                                organizationCustomGradient === preset.key
                                  ? 'ring-2 ring-offset-2 ring-offset-background ring-white/70 scale-110'
                                  : 'opacity-60 hover:opacity-100',
                              )}
                              title={preset.key.charAt(0).toUpperCase() + preset.key.slice(1)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Description — custom only, always its own row */}
                  {organizationSelectionKey === CUSTOM_ORGANIZATION_KEY && (
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={organizationCustomDescriptionId}
                        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Description
                      </Label>
                      <Textarea
                        id={organizationCustomDescriptionId}
                        value={organizationCustomDescription}
                        onChange={(event) => {
                          const value = event.target.value
                          setDraftField('organizationCustomDescription', value)
                          updateActiveCharacterDetails({
                            organizationCustomDescription: value,
                          })
                        }}
                        placeholder="Describe the custom ally or organization."
                        rows={4}
                      />
                    </div>
                  )}

                  <OrganizationPreview
                    custom={organizationSelectionKey === CUSTOM_ORGANIZATION_KEY}
                    description={previewDescription}
                    gradient={previewGradient}
                    hasSelection={Boolean(organizationSelectionKey)}
                    image={previewImage}
                    showImage={showPreviewImage}
                    title={previewTitle}
                    onImageError={() => setFailedOrganizationPreviewImagePath(previewImage)}
                  />
                </div>

                <input
                  ref={customImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleOrganizationImageUpload}
                  className="hidden"
                />
              </section>
            </div>
          </div>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
