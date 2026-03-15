import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Star,
  MagicWand,
  Backpack,
  Plus,
  Trash,
  ArrowCounterClockwise,
  ShieldCheck,
  BookOpen,
  Check,
} from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/useFilteredGameData'
import { useSpellSlots } from '@/hooks/useSpellSlots'
import { useEquipment } from '@/hooks/useEquipment'
import {
  CLASS_ASI_LEVELS,
  DEFAULT_ASI_LEVELS,
  MAX_ATTUNEMENT_SLOTS,
  getAbilityModifier,
  getProficiencyBonus,
} from '@/lib/gameRules'
import { ABILITY_ABBREVIATIONS, formatModifier, type AbilityName } from '@/lib/abilityScores'
import { checkAllPrerequisites, type PrereqCharacterSnapshot } from '@/lib/prerequisites'
import { cn } from '@/lib/utils'
import type { Feat5e, Item5e, Spell5e } from '@/types/5etools'

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

function NoCharCard({ icon, noun }: { icon: React.ReactNode; noun: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="p-8 text-center max-w-md w-full">
        <div className="h-12 w-12 mx-auto mb-4 text-muted-foreground">{icon}</div>
        <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
        <p className="text-muted-foreground">
          Please select or create a character to {noun}.
        </p>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. FEATS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function FeatsPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { feats } = useFilteredGameData()
  const [search, setSearch] = useState('')
  const [showOwned, setShowOwned] = useState(false)

  if (!character) {
    return <NoCharCard icon={<Star weight="duotone" />} noun="choose feats" />
  }

  const asiLevels = (CLASS_ASI_LEVELS[character.class] ?? DEFAULT_ASI_LEVELS) as readonly number[]
  const totalASI = asiLevels.filter((l) => l <= character.level).length
  const usedASI = character.feats?.length ?? 0
  const remainingASI = totalASI - usedASI

  const characterSnapshot: PrereqCharacterSnapshot = {
    level: character.level,
    class: character.class,
    race: character.race,
    abilityScores: character.abilityScores as Record<string, number>,
    features: character.features,
    spells: {
      cantrips: character.spells?.cantrips ?? [],
      spellsKnown: character.spells?.spellsKnown ?? [],
      preparedSpells: character.spells?.preparedSpells ?? [],
    },
  }

  const ownedNames = new Set((character.feats ?? []).map((f) => f.name))

  const filteredFeats = useMemo(
    () =>
      (feats as Feat5e[]).filter((f) => {
        if (!showOwned && ownedNames.has(f.name)) return false
        if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [feats, search, showOwned, ownedNames],
  )

  const addFeat = (feat: Feat5e) => {
    if (ownedNames.has(feat.name)) return
    updateCharacter(character.id, {
      feats: [
        ...(character.feats ?? []),
        { id: `${feat.name}-${feat.source}`, name: feat.name, source: feat.source, description: '' },
      ],
    })
  }

  const removeFeat = (featName: string) => {
    updateCharacter(character.id, {
      feats: character.feats.filter((f) => f.name !== featName),
    })
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* ASI budget */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-3">
            <Star className="h-6 w-6 text-accent" weight="duotone" />
            Feats &amp; ASI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-accent">{totalASI}</div>
              <div className="text-xs text-muted-foreground">Total Slots</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold font-mono">{usedASI}</div>
              <div className="text-xs text-muted-foreground">Feats Taken</div>
            </div>
            <div className="text-center">
              <div
                className={cn(
                  'text-3xl font-bold font-mono',
                  remainingASI > 0 ? 'text-green-500' : remainingASI < 0 ? 'text-destructive' : '',
                )}
              >
                {remainingASI}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>

          {/* Current feats */}
          {(character.feats?.length ?? 0) > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Current Feats
              </h4>
              {character.feats.map((feat) => (
                <div
                  key={feat.id}
                  className="flex items-center justify-between px-4 py-2 rounded-lg border border-accent/40 bg-accent/5"
                >
                  <div>
                    <span className="font-medium text-sm">{feat.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{feat.source}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => removeFeat(feat.name)}
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feat browser */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-xl">Feat Browser</CardTitle>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <Input
              placeholder="Search feats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={showOwned} onCheckedChange={setShowOwned} />
              Show owned
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {filteredFeats.map((feat) => {
              const { met, failures } = checkAllPrerequisites(
                feat as { prerequisite?: any[] },
                characterSnapshot,
              )
              const owned = ownedNames.has(feat.name)
              return (
                <div
                  key={feat.name}
                  className={cn(
                    'flex items-start justify-between px-4 py-3 rounded-lg border transition-colors',
                    owned ? 'border-accent/40 bg-accent/5' : 'border-border',
                    !met && 'opacity-60',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{feat.name}</span>
                      <span className="text-xs text-muted-foreground">{feat.source}</span>
                      {met ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                          Met
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-destructive border-destructive">
                          Req. not met
                        </Badge>
                      )}
                      {owned && (
                        <Badge variant="secondary" className="text-xs">
                          Owned
                        </Badge>
                      )}
                    </div>
                    {failures.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{failures.join(' · ')}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 flex-shrink-0 ml-2"
                    onClick={() => addFeat(feat)}
                    disabled={owned || (remainingASI <= 0 && totalASI > 0)}
                    title={
                      owned
                        ? 'Already owned'
                        : remainingASI <= 0 && totalASI > 0
                          ? 'No ASI slots remaining'
                          : 'Add feat'
                    }
                  >
                    {owned ? <Check className="h-3.5 w-3.5 text-accent" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )
            })}
            {filteredFeats.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No feats found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 18 + 19. SPELLS PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function SpellsPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const { spells } = useFilteredGameData()
  const {
    slots,
    isSpellcaster,
    cantrips,
    spellsKnown,
    preparedSpells,
    useSlot,
    restoreSlot,
    longRest,
    addCantrip,
    removeCantrip,
    addSpellKnown,
    removeSpellKnown,
    togglePrepared,
    syncSlots,
  } = useSpellSlots()
  const [spellSearch, setSpellSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')

  if (!character) {
    return <NoCharCard icon={<MagicWand weight="duotone" />} noun="manage spells" />
  }

  const classLower = character.class?.toLowerCase() ?? ''

  const filteredSpells = useMemo(
    () =>
      (spells as Spell5e[]).filter((s) => {
        if (spellSearch && !s.name.toLowerCase().includes(spellSearch.toLowerCase())) return false
        if (levelFilter !== 'all' && String(s.level) !== levelFilter) return false
        if (classLower) {
          const fromList = s.classes?.fromClassList ?? []
          if (fromList.length > 0 && !fromList.some((c: any) => c.name?.toLowerCase() === classLower))
            return false
        }
        return true
      }),
    [spells, spellSearch, levelFilter, classLower],
  )

  const ownedSet = new Set([...cantrips, ...spellsKnown])

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spell slots panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <MagicWand className="h-5 w-5 text-accent" weight="duotone" />
                Spell Slots
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isSpellcaster ? (
                <p className="text-sm text-muted-foreground py-2">
                  {character.class || 'This class'} is not a spellcaster.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {slots.map((slot) => (
                      <div key={slot.level} className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium min-w-16">
                          Lv {slot.level}
                          {slot.isPactMagic && (
                            <Badge variant="secondary" className="ml-1 text-xs">
                              Pact
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1 flex-1">
                          {Array.from({ length: slot.max }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() =>
                                i < slot.used ? restoreSlot(slot.level) : useSlot(slot.level)
                              }
                              className={cn(
                                'h-5 w-5 rounded-full border-2 transition-colors flex-shrink-0',
                                i < slot.used
                                  ? 'bg-muted border-muted-foreground'
                                  : 'bg-accent border-accent',
                              )}
                              title={i < slot.used ? 'Restore slot' : 'Use slot'}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {slot.available}/{slot.max}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                    <Button variant="outline" size="sm" onClick={longRest} className="flex-1 text-xs">
                      <ArrowCounterClockwise className="h-3 w-3 mr-1" />
                      Long Rest
                    </Button>
                    <Button variant="ghost" size="sm" onClick={syncSlots} className="text-xs">
                      Sync
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Known spells + cantrips */}
          {isSpellcaster && (
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="font-display text-lg">Known Spells</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="known">
                  <TabsList className="mb-3">
                    <TabsTrigger value="cantrips">Cantrips ({cantrips.length})</TabsTrigger>
                    <TabsTrigger value="known">Known ({spellsKnown.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="cantrips">
                    <SpellList
                      names={cantrips}
                      preparedSpells={preparedSpells}
                      onRemove={removeCantrip}
                      onTogglePrepared={() => undefined}
                      showPrepare={false}
                    />
                  </TabsContent>
                  <TabsContent value="known">
                    <SpellList
                      names={spellsKnown}
                      preparedSpells={preparedSpells}
                      onRemove={removeSpellKnown}
                      onTogglePrepared={togglePrepared}
                      showPrepare
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Spell browser (item 19) */}
        <div className="lg:col-span-2">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-accent" weight="duotone" />
                Spell Browser
              </CardTitle>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Input
                  placeholder="Search spells…"
                  value={spellSearch}
                  onChange={(e) => setSpellSearch(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    <SelectItem value="0">Cantrip</SelectItem>
                    {Array.from({ length: 9 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        Level {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1">
                {filteredSpells.slice(0, 200).map((spell) => {
                  const owned = ownedSet.has(spell.name)
                  return (
                    <div
                      key={spell.name}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-lg border text-sm',
                        owned ? 'border-accent/40 bg-accent/5' : 'border-border',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className="font-mono text-xs flex-shrink-0">
                          {spell.level === 0 ? 'C' : spell.level}
                        </Badge>
                        <span className="font-medium truncate">{spell.name}</span>
                        <span className="text-xs text-muted-foreground capitalize flex-shrink-0">
                          {spell.school}
                        </span>
                      </div>
                      {!owned ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 flex-shrink-0 ml-2"
                          onClick={() =>
                            spell.level === 0 ? addCantrip(spell.name) : addSpellKnown(spell.name)
                          }
                          title="Add to known spells"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Check className="h-4 w-4 text-accent flex-shrink-0 ml-2" />
                      )}
                    </div>
                  )
                })}
                {filteredSpells.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No spells found</p>
                )}
                {filteredSpells.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 200 of {filteredSpells.length} — refine your search
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function SpellList({
  names,
  preparedSpells,
  onRemove,
  onTogglePrepared,
  showPrepare,
}: {
  names: string[]
  preparedSpells: string[]
  onRemove: (name: string) => void
  onTogglePrepared: (name: string) => void
  showPrepare: boolean
}) {
  if (!names.length) {
    return <p className="text-xs text-muted-foreground py-2 text-center">None</p>
  }
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {names.map((name) => {
        const prepared = preparedSpells.includes(name)
        return (
          <div key={name} className="flex items-center justify-between py-1 border-b border-border last:border-0">
            <div className="flex items-center gap-2">
              {showPrepare && (
                <button
                  type="button"
                  onClick={() => onTogglePrepared(name)}
                  className={cn(
                    'h-3 w-3 rounded-full border-2 flex-shrink-0 transition-colors',
                    prepared ? 'bg-accent border-accent' : 'border-muted-foreground',
                  )}
                  title={prepared ? 'Prepared' : 'Not prepared'}
                />
              )}
              <span className="text-sm">{name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(name)}
            >
              <Trash className="h-3 w-3" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 + 21. EQUIPMENT PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function EquipmentPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { items } = useFilteredGameData()
  const {
    equipment,
    totalWeight,
    carryCapacity,
    isEncumbered,
    attunedCount,
    derivedAC,
    addFromGameData,
    removeItem,
    updateItem,
    toggleEquip,
    toggleAttune,
  } = useEquipment()
  const [itemSearch, setItemSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  if (!character) {
    return <NoCharCard icon={<Backpack weight="duotone" />} noun="manage equipment" />
  }

  const filteredItems = useMemo(
    () =>
      (items as Item5e[]).filter((item) => {
        if (itemSearch && !item.name.toLowerCase().includes(itemSearch.toLowerCase())) return false
        if (typeFilter !== 'all' && item.type !== typeFilter) return false
        return true
      }),
    [items, itemSearch, typeFilter],
  )

  const typeOptions = useMemo(() => {
    const types = new Set((items as Item5e[]).map((i) => i.type).filter(Boolean))
    return Array.from(types).sort() as string[]
  }, [items])

  const encumbrancePct = carryCapacity > 0 ? Math.min(100, (totalWeight / carryCapacity) * 100) : 0

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary bar */}
          <Card className="w-full">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Weight</div>
                  <div className={cn('text-sm font-mono font-bold', isEncumbered && 'text-destructive')}>
                    {totalWeight.toFixed(1)} / {carryCapacity} lb
                    {isEncumbered && ' (Encumbered)'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Attunement</div>
                  <div
                    className={cn(
                      'text-sm font-mono font-bold',
                      attunedCount >= MAX_ATTUNEMENT_SLOTS && 'text-destructive',
                    )}
                  >
                    {attunedCount} / {MAX_ATTUNEMENT_SLOTS}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Derived AC</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold">{derivedAC}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() =>
                        updateCharacter(character.id, { armorClass: derivedAC })
                      }
                    >
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Sync
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory list */}
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <Backpack className="h-5 w-5 text-accent" weight="duotone" />
                Inventory ({equipment.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {equipment.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No items. Browse and add from the panel on the right.
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {equipment.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg border',
                        item.equipped ? 'border-accent/40 bg-accent/5' : 'border-border',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          {item.rarity && item.rarity !== 'none' && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {item.rarity}
                            </Badge>
                          )}
                          {item.armorType && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.armorType}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {item.weight !== undefined && <span>{item.weight} lb</span>}
                          {item.ac !== undefined && <span>AC {item.ac}</span>}
                          <span>×{item.quantity}</span>
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })
                          }
                          className="h-5 w-5 rounded border border-border text-xs leading-none"
                          disabled={item.quantity <= 1}
                        >
                          −
                        </button>
                        <span className="font-mono text-xs w-5 text-center">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                          className="h-5 w-5 rounded border border-border text-xs leading-none"
                        >
                          +
                        </button>
                      </div>

                      {/* Equip toggle */}
                      <label className="flex items-center gap-1 cursor-pointer">
                        <Switch
                          checked={item.equipped}
                          onCheckedChange={() => toggleEquip(item.id)}
                          className="scale-[0.8]"
                        />
                        <span className="text-xs">Equip</span>
                      </label>

                      {/* Attune toggle */}
                      {item.reqAttune && (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <Switch
                            checked={item.attuned ?? false}
                            onCheckedChange={() => toggleAttune(item.id)}
                            disabled={!item.attuned && attunedCount >= MAX_ATTUNEMENT_SLOTS}
                            className="scale-[0.8]"
                          />
                          <span className="text-xs">Attune</span>
                        </label>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Item browser (item 21) */}
        <div className="lg:col-span-1">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="font-display text-lg">Item Browser</CardTitle>
              <div className="space-y-2 mt-2">
                <Input
                  placeholder="Search items…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {typeOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                {filteredItems.slice(0, 150).map((item) => (
                  <button
                    key={`${item.name}-${item.source}`}
                    type="button"
                    onClick={() => addFromGameData(item)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{item.type}</span>
                      {item.rarity && item.rarity !== 'none' && (
                        <span className="capitalize">{item.rarity}</span>
                      )}
                      {item.weight !== undefined && <span>{item.weight} lb</span>}
                    </div>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No items found</p>
                )}
                {filteredItems.length > 150 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing 150 of {filteredItems.length} — refine your search
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function DetailsPage() {
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Character details editing interface
        </p>
      </div>
    </div>
  )
}

export function CharacterSheetPage() {
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Character sheet display and export interface
        </p>
      </div>
    </div>
  )
}

import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'

export function SettingsPage() {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <DataSourceConfigurator />
    </div>
  )
}
