import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PersonSimple,
  Sword,
  Scroll,
  Certificate,
  Barbell,
  ArrowUp,
  ArrowDown,
  Star,
  Check,
} from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { useFilteredGameData } from '@/hooks/useFilteredGameData'
import { useAbilityScores } from '@/hooks/useAbilityScores'
import { useHitPoints } from '@/hooks/useHitPoints'
import { useSavingThrows } from '@/hooks/useSavingThrows'
import { useSkills } from '@/hooks/useSkills'
import { TraitTooltip } from '@/components/character/TraitTooltip'
import {
  ABILITY_NAMES,
  ABILITY_ABBREVIATIONS,
  formatModifier,
  type AbilityName,
} from '@/lib/abilityScores'
import {
  STANDARD_ARRAY,
  POINT_BUY_COSTS,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  CLASS_ASI_LEVELS,
  DEFAULT_ASI_LEVELS,
  getProficiencyBonus,
  getAbilityModifier,
} from '@/lib/gameRules'
import { cn } from '@/lib/utils'
import type { Race5e, Class5e, Background5e } from '@/types/5etools'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function NoCharacterCard({ icon, noun }: { icon: React.ReactNode; noun: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="p-8 text-center max-w-md w-full">
        <div className="h-12 w-12 mx-auto mb-4 text-muted-foreground">{icon}</div>
        <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
        <p className="text-muted-foreground">Please select or create a character to {noun}.</p>
      </Card>
    </div>
  )
}

function InfoTile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-accent/30 rounded-lg p-4 bg-card/50">
      <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  )
}

function ProfList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (!items.length) {
    return <p className="text-muted-foreground text-sm py-4 text-center">{emptyLabel}</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="capitalize text-sm px-3 py-1">
          {item}
        </Badge>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. RACE BUILD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BuildRacePage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { races } = useFilteredGameData()

  if (!character) {
    return <NoCharacterCard icon={<PersonSimple weight="duotone" />} noun="choose a race" />
  }

  const selectedRace = races.find((r) => r.name === character.race) as Race5e | undefined
  const subraces = (selectedRace?.subraces ?? []) as Race5e[]
  const selectedSubrace = subraces.find((sr) => sr.name === character.subrace)
  const displayRace = selectedSubrace ?? selectedRace

  const getSpeedText = (race: Race5e) => {
    if (!race.speed) return '—'
    if (typeof race.speed === 'number') return `${race.speed} ft.`
    if (typeof race.speed === 'object' && 'walk' in race.speed) return `${race.speed.walk ?? 30} ft.`
    return '—'
  }

  const getASILines = (race: Race5e): string[] => {
    const lines: string[] = []
    for (const block of race.ability ?? []) {
      for (const [key, val] of Object.entries(block)) {
        if (key !== 'choose' && typeof val === 'number') lines.push(`${key.toUpperCase()} +${val}`)
      }
      const choose = (block as any).choose
      if (choose) {
        lines.push(
          `Choose ${choose.count} from ${(choose.from as string[]).join(', ').toUpperCase()} +${choose.amount ?? 1}`,
        )
      }
    }
    return lines
  }

  const getLanguages = (race: Race5e): string => {
    const langs: string[] = []
    for (const block of race.languageProficiencies ?? []) {
      for (const [key, val] of Object.entries(block)) {
        if (key !== 'choose' && key !== 'anyStandard' && val === true)
          langs.push(key.charAt(0).toUpperCase() + key.slice(1))
      }
      const choose = (block as any).choose
      if (choose) langs.push(`Choose ${choose.count} from ${(choose.from as string[]).join(', ')}`)
      if ((block as any).anyStandard) langs.push(`Any ${(block as any).anyStandard} standard`)
    }
    return langs.join(', ')
  }

  const getTraits = (race: Race5e) => {
    const skip = new Set(['Age', 'Alignment', 'Size', 'Speed', 'Languages', 'Names'])
    return (race.entries as any[] ?? [])
      .filter(
        (e) =>
          typeof e === 'object' &&
          e.type === 'entries' &&
          e.name &&
          !skip.has(e.name) &&
          !e.name.includes('Names'),
      )
      .map((e: any) => ({ name: e.name as string, entries: e.entries ?? [] }))
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-3">
            <PersonSimple className="h-6 w-6 text-accent" weight="duotone" />
            Race
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="mb-2 block">Race</Label>
              <Select
                value={character.race || ''}
                onValueChange={(v) => updateCharacter(character.id, { race: v, subrace: undefined })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a race…" />
                </SelectTrigger>
                <SelectContent>
                  {races.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Subrace</Label>
              <Select
                value={character.subrace ?? ''}
                onValueChange={(v) => updateCharacter(character.id, { subrace: v })}
                disabled={subraces.length === 0}
              >
                <SelectTrigger className="h-11">
                  <SelectValue
                    placeholder={subraces.length === 0 ? 'No subraces' : 'Select subrace…'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {subraces.map((sr) => (
                    <SelectItem key={sr.name} value={sr.name}>
                      {sr.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {displayRace && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <InfoTile title="Ability Bonuses">
                  {getASILines(displayRace).length > 0 ? (
                    getASILines(displayRace).map((t, i) => (
                      <div key={i} className="text-sm font-mono">
                        {t}
                      </div>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </InfoTile>
                <InfoTile title="Size">
                  <span className="text-sm font-mono">{displayRace.size?.join(', ') ?? '—'}</span>
                </InfoTile>
                <InfoTile title="Speed">
                  <span className="text-sm font-mono">{getSpeedText(displayRace)}</span>
                </InfoTile>
              </div>
              <InfoTile title="Languages">
                <span className="text-sm">{getLanguages(displayRace) || '—'}</span>
              </InfoTile>
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider mb-3">Traits</h4>
                <div className="flex flex-wrap gap-2">
                  {getTraits(displayRace).map((trait, i) => (
                    <TraitTooltip key={i} name={trait.name} entries={trait.entries}>
                      <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent/10 hover:border-accent transition-colors cursor-help text-sm font-medium">
                        {trait.name}
                      </span>
                    </TraitTooltip>
                  ))}
                  {getTraits(displayRace).length === 0 && (
                    <span className="text-muted-foreground text-sm">No traits available</span>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}



// ─────────────────────────────────────────────────────────────────────────────
// 6. CLASS BUILD PAGE  (items 6, 14 level-up, 17 class feature choices)
// ─────────────────────────────────────────────────────────────────────────────

export function BuildClassPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { classes, classFeatures } = useFilteredGameData()
  const rawGameData = useGameDataStore((s) => s.gameData)
  const { calculatedMaxHP, hitDie, conMod, syncMaxHP } = useHitPoints()
  const [featureSearch, setFeatureSearch] = useState('')

  if (!character) {
    return <NoCharacterCard icon={<Sword weight="duotone" />} noun="configure your class" />
  }

  const selectedClass = classes.find((c) => c.name === character.class) as Class5e | undefined

  const handleClassChange = (className: string) => {
    const cls = classes.find((c) => c.name === className) as Class5e | undefined
    updateCharacter(character.id, {
      class: className,
      subclass: undefined,
      proficiencyBonus: getProficiencyBonus(character.level),
      proficiencies: {
        ...character.proficiencies,
        armor: [...new Set([...character.proficiencies.armor, ...(cls?.startingProficiencies?.armor ?? [])])],
        weapons: [...new Set([...character.proficiencies.weapons, ...(cls?.startingProficiencies?.weapons ?? [])])],
        tools: [...new Set([...character.proficiencies.tools, ...(cls?.startingProficiencies?.tools ?? [])])],
      },
      spells: {
        ...character.spells,
        spellcastingAbility: cls?.spellcastingAbility
          ? expandAbilityAbbr(cls.spellcastingAbility)
          : character.spells?.spellcastingAbility,
      },
    })
  }

  // ── Level-up (item 14) ────────────────────────────────────────────────────
  const handleLevelUp = () => {
    const newLevel = Math.min(20, character.level + 1)
    const useAvg = character.variantRules?.averageHitPoints !== false
    const hpGain = (useAvg ? Math.floor(hitDie / 2) + 1 : hitDie) + conMod
    updateCharacter(character.id, {
      level: newLevel,
      proficiencyBonus: getProficiencyBonus(newLevel),
      hitPoints: {
        ...character.hitPoints,
        max: character.hitPoints.max + hpGain,
        current: character.hitPoints.current + hpGain,
      },
    })
  }

  const handleLevelDown = () => {
    const newLevel = Math.max(1, character.level - 1)
    updateCharacter(character.id, {
      level: newLevel,
      proficiencyBonus: getProficiencyBonus(newLevel),
    })
  }

  // ── ASI slots ─────────────────────────────────────────────────────────────
  const asiLevels = (CLASS_ASI_LEVELS[character.class] ?? DEFAULT_ASI_LEVELS) as readonly number[]
  const asiAtCurrentLevel = asiLevels.filter((l) => l <= character.level)

  // ── Class features ────────────────────────────────────────────────────────
  const currentClassFeatures = useMemo(
    () =>
      classFeatures
        .filter((f) => f.className === character.class && (f.level ?? 0) <= character.level)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0)),
    [classFeatures, character.class, character.level],
  )

  // ── Optional feature choices (item 17) ───────────────────────────────────
  const optFeatures = rawGameData?.optionalfeatures ?? []
  const relevantOptFeatures = useMemo(() => {
    if (!character.class) return []
    const classLower = character.class.toLowerCase()
    const ftClassMap: Record<string, string[]> = {
      'FS:F': ['fighter'],
      'FS:P': ['paladin'],
      'FS:R': ['ranger'],
      'FS:B': ['bard'],
      EI: ['warlock'],
      MM: ['sorcerer'],
      'MV:B': ['monk'],
      OR: ['druid'],
    }
    return (optFeatures as any[]).filter((of) => {
      const ft: string = Array.isArray(of.featureType) ? of.featureType[0] : (of.featureType ?? '')
      return (ftClassMap[ft] ?? []).includes(classLower)
    })
  }, [character.class, optFeatures])

  const selectedNames = new Set((character.features ?? []).map((f) => f.name))
  const filteredOptFeatures = relevantOptFeatures.filter(
    (f: any) => !featureSearch || f.name?.toLowerCase().includes(featureSearch.toLowerCase()),
  )

  const toggleOptFeature = (feat: any) => {
    const alreadySelected = selectedNames.has(feat.name)
    const next = alreadySelected
      ? character.features.filter((f) => f.name !== feat.name)
      : [
        ...character.features,
        { id: `${feat.name}-opt`, name: feat.name, source: feat.source ?? '', description: '' },
      ]
    updateCharacter(character.id, { features: next })
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Class selector */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-3">
            <Sword className="h-6 w-6 text-accent" weight="duotone" />
            Class
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {classes.map((cls) => (
              <button
                key={cls.name}
                type="button"
                onClick={() => handleClassChange(cls.name)}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.02]',
                  character.class === cls.name
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50',
                )}
              >
                <div className="font-semibold font-display text-sm">{cls.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  d{cls.hd?.faces ?? 8}
                  {cls.spellcastingAbility ? ' · Spellcaster' : ''}
                </div>
              </button>
            ))}
          </div>

          {selectedClass && character.level >= 3 && (
            <div>
              <Label className="mb-2 block">Subclass</Label>
              <Select
                value={character.subclass ?? ''}
                onValueChange={(v) => updateCharacter(character.id, { subclass: v })}
              >
                <SelectTrigger className="h-11 max-w-sm">
                  <SelectValue placeholder="Choose a subclass…" />
                </SelectTrigger>
                <SelectContent>
                  {((selectedClass as any).subclasses ?? []).map((sc: any) => (
                    <SelectItem key={sc.name} value={sc.name}>
                      {sc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Level + HP (item 14) */}
      {character.class && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="font-display text-xl">Level &amp; Hit Points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLevelDown}
                  disabled={character.level <= 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <div className="text-center min-w-16">
                  <div className="text-3xl font-bold font-mono">{character.level}</div>
                  <div className="text-xs text-muted-foreground">Level</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLevelUp}
                  disabled={character.level >= 20}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-12" />

              <div className="flex items-start gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Hit Die</div>
                  <Badge variant="outline" className="font-mono text-base px-3">
                    d{hitDie}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Proficiency</div>
                  <Badge variant="outline" className="font-mono text-base px-3">
                    +{getProficiencyBonus(character.level)}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Calculated Max HP</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold font-mono">{calculatedMaxHP}</span>
                    <Button variant="ghost" size="sm" onClick={syncMaxHP} className="text-xs h-7 px-2">
                      Sync
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Stored Max HP</div>
                  <span className="text-xl font-bold font-mono">{character.hitPoints.max}</span>
                </div>
              </div>
            </div>

            {asiAtCurrentLevel.length > 0 && (
              <div className="flex items-center gap-3 pt-4 mt-4 border-t border-border flex-wrap">
                <Star className="h-4 w-4 text-accent flex-shrink-0" weight="duotone" />
                <span className="text-sm font-semibold">ASI / Feat Slots at:</span>
                {asiAtCurrentLevel.map((l) => (
                  <Badge key={l} variant="outline" className="font-mono text-xs">
                    Lv {l}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  {asiAtCurrentLevel.length} available · {character.feats?.length ?? 0} feats taken
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Class features (item 6) */}
      {currentClassFeatures.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="font-display text-xl">Class Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {currentClassFeatures.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm font-medium">{f.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    Lv {f.level}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Optional feature choices (item 17) */}
      {relevantOptFeatures.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="font-display text-xl">Class Feature Choices</CardTitle>
            <Input
              placeholder="Search features…"
              value={featureSearch}
              onChange={(e) => setFeatureSearch(e.target.value)}
              className="max-w-sm mt-2"
            />
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredOptFeatures.map((feat: any, i: number) => {
                const selected = selectedNames.has(feat.name)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleOptFeature(feat)}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-lg border-2 transition-colors',
                      selected
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-accent/40',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{feat.name}</span>
                      {selected && <Check className="h-4 w-4 text-accent" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {feat.featureType} · {feat.source}
                    </div>
                  </button>
                )
              })}
              {filteredOptFeatures.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No matching features
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function expandAbilityAbbr(abbr: string): string {
  const map: Record<string, string> = {
    int: 'intelligence',
    wis: 'wisdom',
    cha: 'charisma',
    str: 'strength',
    dex: 'dexterity',
    con: 'constitution',
  }
  return map[abbr.toLowerCase()] ?? abbr.toLowerCase()
}



// ─────────────────────────────────────────────────────────────────────────────
// 7. BACKGROUND BUILD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BuildBackgroundPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { backgrounds } = useFilteredGameData()

  if (!character) {
    return <NoCharacterCard icon={<Scroll weight="duotone" />} noun="choose a background" />
  }

  const selectedBg = backgrounds.find((b) => b.name === character.background) as
    | Background5e
    | undefined

  const handleBackground = (name: string) => {
    const bg = backgrounds.find((b) => b.name === name) as Background5e | undefined
    if (!bg) return
    const langs = extractProfNames(bg.languageProficiencies ?? [])
    const tools = extractProfNames(bg.toolProficiencies ?? [])
    updateCharacter(character.id, {
      background: name,
      proficiencies: {
        ...character.proficiencies,
        languages: [...new Set([...character.proficiencies.languages, ...langs])],
        tools: [...new Set([...character.proficiencies.tools, ...tools])],
      },
    })
  }

  const skills = selectedBg ? extractProfNames(selectedBg.skillProficiencies ?? []) : []
  const langs = selectedBg ? extractLangNames(selectedBg.languageProficiencies ?? []) : []
  const tools = selectedBg ? extractProfNames(selectedBg.toolProficiencies ?? []) : []

  const getFeatureText = (bg: Background5e): string => {
    const feature = (bg.entries as any[] ?? []).find(
      (e) => typeof e === 'object' && e.name && e.type === 'entries',
    )
    if (!feature) return ''
    const first = feature.entries?.[0]
    return typeof first === 'string'
      ? first.slice(0, 220) + (first.length > 220 ? '…' : '')
      : ''
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-3">
            <Scroll className="h-6 w-6 text-accent" weight="duotone" />
            Background
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
            {backgrounds.map((bg) => (
              <button
                key={bg.name}
                type="button"
                onClick={() => handleBackground(bg.name)}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01]',
                  character.background === bg.name
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50',
                )}
              >
                <div className="font-semibold text-sm font-display">{bg.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{bg.source}</div>
              </button>
            ))}
          </div>

          {selectedBg && (
            <>
              <Separator />
              <div className="grid grid-cols-3 gap-4">
                <InfoTile title="Skill Proficiencies">
                  {skills.length > 0 ? (
                    skills.map((s) => (
                      <Badge
                        key={s}
                        variant="secondary"
                        className="mr-1 mb-1 capitalize text-xs"
                      >
                        {s}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </InfoTile>
                <InfoTile title="Languages">
                  {langs.length > 0 ? (
                    langs.map((l) => (
                      <Badge
                        key={l}
                        variant="secondary"
                        className="mr-1 mb-1 capitalize text-xs"
                      >
                        {l}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </InfoTile>
                <InfoTile title="Tool Proficiencies">
                  {tools.length > 0 ? (
                    tools.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="mr-1 mb-1 capitalize text-xs"
                      >
                        {t}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </InfoTile>
              </div>
              {getFeatureText(selectedBg) && (
                <InfoTile title="Feature">
                  <p className="text-sm leading-relaxed">{getFeatureText(selectedBg)}</p>
                </InfoTile>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function extractProfNames(blocks: any[]): string[] {
  const out: string[] = []
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true) out.push(key)
    }
    const choose = (block as any).choose
    if (choose) out.push(`choose ${choose.count}`)
  }
  return out
}

function extractLangNames(blocks: any[]): string[] {
  const out: string[] = []
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true) out.push(key)
    }
    if ((block as any).anyStandard) out.push(`any ${(block as any).anyStandard} standard`)
    const choose = (block as any).choose
    if (choose) out.push(`choose ${choose.count}`)
  }
  return out
}



// ─────────────────────────────────────────────────────────────────────────────
// 8. PROFICIENCIES BUILD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BuildProficienciesPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const { skills, toggleProficiency, toggleExpertise } = useSkills()
  const { savingThrows } = useSavingThrows()

  if (!character) {
    return (
      <NoCharacterCard icon={<Certificate weight="duotone" />} noun="view proficiencies" />
    )
  }

  const { armor, weapons, tools, languages } = character.proficiencies

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-3">
            <Certificate className="h-6 w-6 text-accent" weight="duotone" />
            Proficiencies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="skills">
            <TabsList className="mb-6 flex-wrap h-auto gap-1">
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="saving-throws">Saving Throws</TabsTrigger>
              <TabsTrigger value="armor">Armor</TabsTrigger>
              <TabsTrigger value="weapons">Weapons</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="languages">Languages</TabsTrigger>
            </TabsList>

            <TabsContent value="skills">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {skills.map((skill) => (
                  <div
                    key={skill.name}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border transition-colors',
                      skill.proficient ? 'border-accent/50 bg-accent/5' : 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleProficiency(skill.name)}
                        className={cn(
                          'h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors',
                          skill.proficient
                            ? 'bg-accent border-accent'
                            : 'border-muted-foreground hover:border-accent',
                        )}
                        title="Toggle proficiency"
                      />
                      <button
                        type="button"
                        onClick={() => skill.proficient && toggleExpertise(skill.name)}
                        disabled={!skill.proficient}
                        className={cn(
                          'h-3 w-3 rounded-sm border-2 flex-shrink-0 transition-colors',
                          skill.expertise ? 'bg-accent border-accent' : 'border-muted-foreground',
                          !skill.proficient && 'opacity-30 cursor-not-allowed',
                        )}
                        title="Toggle expertise"
                      />
                      <span className="text-sm truncate capitalize">{skill.name}</span>
                    </div>
                    <span className="font-mono font-bold text-sm ml-2">
                      {skill.modifierString}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="saving-throws">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {savingThrows.map((st) => (
                  <div
                    key={st.ability}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      st.proficient ? 'border-accent/50 bg-accent/5' : 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'h-3 w-3 rounded-full border-2',
                          st.proficient ? 'bg-accent border-accent' : 'border-muted-foreground',
                        )}
                      />
                      <span className="text-sm capitalize">{st.ability}</span>
                    </div>
                    <span className="font-mono font-bold text-sm">{st.modifierString}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="armor">
              <ProfList items={armor} emptyLabel="No armor proficiencies" />
            </TabsContent>
            <TabsContent value="weapons">
              <ProfList items={weapons} emptyLabel="No weapon proficiencies" />
            </TabsContent>
            <TabsContent value="tools">
              <ProfList items={tools} emptyLabel="No tool proficiencies" />
            </TabsContent>
            <TabsContent value="languages">
              <ProfList items={languages} emptyLabel="No language proficiencies" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ABILITY SCORES BUILD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BuildAbilityScoresPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const { races } = useFilteredGameData()
  const {
    scores,
    modifiers,
    modifierStrings,
    setScore,
    setAllScores,
    pointBuyTotal,
    pointBuyRemaining,
  } = useAbilityScores()

  if (!character) {
    return <NoCharacterCard icon={<Barbell weight="duotone" />} noun="assign ability scores" />
  }

  const method = character.variantRules?.abilityScoreMethod ?? 'standard-array'

  // Build racial bonus map from selected race/subrace
  const selectedRace = races.find((r) => r.name === character.race) as Race5e | undefined
  const subraceData = selectedRace?.subraces?.find(
    (sr: Race5e) => sr.name === character.subrace,
  ) as Race5e | undefined
  const displayRace = subraceData ?? selectedRace
  const racialBonuses: Partial<Record<AbilityName, number>> = {}
  for (const block of displayRace?.ability ?? []) {
    for (const [key, val] of Object.entries(block)) {
      if (key !== 'choose' && typeof val === 'number') {
        const full = ABILITY_NAMES.find((n) =>
          n.toLowerCase().startsWith(key.toLowerCase()),
        )
        if (full) racialBonuses[full] = (racialBonuses[full] ?? 0) + val
      }
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-3">
            <Barbell className="h-6 w-6 text-accent" weight="duotone" />
            Ability Scores
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Method:{' '}
            <span className="font-semibold text-foreground capitalize">
              {method.replace('-', ' ')}
            </span>
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={method}>
            <TabsList className="mb-6">
              <TabsTrigger value="point-buy">Point Buy</TabsTrigger>
              <TabsTrigger value="standard-array">Standard Array</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            <TabsContent value="point-buy">
              <PointBuyPanel
                scores={scores}
                modifierStrings={modifierStrings}
                racialBonuses={racialBonuses}
                pointBuyTotal={pointBuyTotal}
                pointBuyRemaining={pointBuyRemaining}
                setScore={setScore}
              />
            </TabsContent>

            <TabsContent value="standard-array">
              <StandardArrayPanel
                scores={scores}
                racialBonuses={racialBonuses}
                setAllScores={setAllScores}
              />
            </TabsContent>

            <TabsContent value="custom">
              <CustomScoresPanel
                scores={scores}
                modifiers={modifiers}
                modifierStrings={modifierStrings}
                racialBonuses={racialBonuses}
                setScore={setScore}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function PointBuyPanel({
  scores,
  modifierStrings,
  racialBonuses,
  pointBuyTotal,
  pointBuyRemaining,
  setScore,
}: {
  scores: Record<AbilityName, number>
  modifierStrings: Record<AbilityName, string>
  racialBonuses: Partial<Record<AbilityName, number>>
  pointBuyTotal: number
  pointBuyRemaining: number
  setScore: (ability: AbilityName, score: number) => void
}) {
  const budgetPct = Math.min(100, (pointBuyTotal / POINT_BUY_BUDGET) * 100)

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
        <div className="flex justify-between text-sm font-semibold mb-2">
          <span>Points Used</span>
          <span className={cn(pointBuyRemaining < 0 && 'text-destructive font-bold')}>
            {pointBuyTotal} / {POINT_BUY_BUDGET}
            <span className="text-muted-foreground font-normal ml-2">
              (
              {pointBuyRemaining >= 0
                ? `${pointBuyRemaining} remaining`
                : `${-pointBuyRemaining} over budget`}
              )
            </span>
          </span>
        </div>
        <Progress value={budgetPct} className="h-2" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? 8
          const racial = racialBonuses[ability] ?? 0
          const cost = POINT_BUY_COSTS[score] ?? 0
          const nextCost = POINT_BUY_COSTS[score + 1] ?? 999

          return (
            <div key={ability} className="border border-border rounded-lg p-4 bg-card/50">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className="text-xs font-bold text-accent uppercase tracking-wider">
                    {ABILITY_ABBREVIATIONS[ability]}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{ability}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-mono">{score + racial}</div>
                  <div className="text-xs text-muted-foreground">{modifierStrings[ability]}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setScore(ability, Math.max(POINT_BUY_MIN, score - 1))}
                  disabled={score <= POINT_BUY_MIN}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <span className="flex-1 text-center font-mono font-bold">{score}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setScore(ability, Math.min(POINT_BUY_MAX, score + 1))}
                  disabled={score >= POINT_BUY_MAX || pointBuyRemaining < nextCost - cost}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-2 text-center">
                Cost: {cost} pts
                {racial !== 0 && ` · Racial: ${racial > 0 ? '+' : ''}${racial}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StandardArrayPanel({
  scores,
  racialBonuses,
  setAllScores,
}: {
  scores: Record<AbilityName, number>
  racialBonuses: Partial<Record<AbilityName, number>>
  setAllScores: (next: Partial<Record<AbilityName, number>>) => void
}) {
  const available = [...STANDARD_ARRAY] as number[]
  const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>(() => {
    const init: Partial<Record<AbilityName, number>> = {}
    for (const ab of ABILITY_NAMES) {
      if (available.includes(scores[ab])) init[ab] = scores[ab]
    }
    return init
  })

  const usedValues = Object.values(assignments).filter((v) => v !== undefined) as number[]

  const getOptions = (forAbility: AbilityName) => {
    const own = assignments[forAbility]
    return available.filter((v) => v === own || !usedValues.includes(v))
  }

  const assign = (ability: AbilityName, raw: string) => {
    const value = raw ? Number(raw) : undefined
    const next = { ...assignments }
    if (value === undefined) delete next[ability]
    else next[ability] = value
    setAssignments(next)
    const update: Partial<Record<AbilityName, number>> = {}
    for (const ab of ABILITY_NAMES) {
      if (next[ab] !== undefined) update[ab] = next[ab] as number
    }
    setAllScores(update)
  }

  const allAssigned = ABILITY_NAMES.every((ab) => assignments[ab] !== undefined)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 p-4 rounded-lg bg-accent/10 border border-accent/30 items-center">
        <span className="text-sm font-semibold mr-2">Values:</span>
        {available.map((v, i) => {
          const takenCount = usedValues.filter((x) => x === v).length
          const totalCount = available.filter((x) => x === v).length
          return (
            <Badge
              key={i}
              variant={takenCount >= totalCount ? 'secondary' : 'outline'}
              className="font-mono text-base px-3 py-1"
            >
              {v}
            </Badge>
          )
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {ABILITY_NAMES.map((ability) => {
          const racial = racialBonuses[ability] ?? 0
          const base = assignments[ability]
          const total = base !== undefined ? base + racial : undefined
          return (
            <div key={ability} className="border border-border rounded-lg p-4 bg-card/50">
              <div className="text-xs font-bold text-accent uppercase tracking-wider mb-1">
                {ABILITY_ABBREVIATIONS[ability]}
              </div>
              <div className="text-xs text-muted-foreground capitalize mb-3">{ability}</div>
              <Select
                value={base !== undefined ? String(base) : ''}
                onValueChange={(v) => assign(ability, v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {getOptions(ability).map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v} ({formatModifier(getAbilityModifier(v))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {total !== undefined && (
                <div className="text-xs text-muted-foreground mt-2">
                  Total: {total}
                  {racial !== 0 && ` (racial ${racial > 0 ? '+' : ''}${racial})`}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {allAssigned && (
        <p className="text-sm text-green-500 flex items-center gap-2">
          <Check className="h-4 w-4" /> All scores assigned.
        </p>
      )}
    </div>
  )
}

function CustomScoresPanel({
  scores,
  modifiers,
  modifierStrings,
  racialBonuses,
  setScore,
}: {
  scores: Record<AbilityName, number>
  modifiers: Record<AbilityName, number>
  modifierStrings: Record<AbilityName, string>
  racialBonuses: Partial<Record<AbilityName, number>>
  setScore: (ability: AbilityName, score: number) => void
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {ABILITY_NAMES.map((ability) => {
        const val = scores[ability] ?? 10
        const racial = racialBonuses[ability] ?? 0
        return (
          <div key={ability} className="border border-border rounded-lg p-4 bg-card/50">
            <Label className="text-xs font-bold text-accent uppercase tracking-wider mb-3 block">
              {ABILITY_ABBREVIATIONS[ability]} — {ability}
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={30}
                value={val}
                className="w-20 text-center font-mono font-bold text-lg"
                onChange={(e) => {
                  const n = Math.min(30, Math.max(1, Number(e.target.value) || 1))
                  setScore(ability, n)
                }}
              />
              <div>
                <div className="text-lg font-bold font-mono text-accent">
                  {modifierStrings[ability]}
                </div>
                {racial !== 0 && (
                  <div className="text-xs text-muted-foreground">
                    Total: {val + racial} (racial {racial > 0 ? '+' : ''}
                    {racial})
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
