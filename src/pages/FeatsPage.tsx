import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Star, Plus, Trash, Check } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/useFilteredGameData'
import { getASILevelsFromClass } from '@/lib/gameRules'
import { checkAllPrerequisites, type PrereqCharacterSnapshot } from '@/lib/prerequisites'
import { cn } from '@/lib/utils'
import type { Feat5e } from '@/types/5etools'
import { NoCharCard } from './_shared'

export function FeatsPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const { feats, classes } = useFilteredGameData()
    const [search, setSearch] = useState('')
    const [showOwned, setShowOwned] = useState(false)

    if (!character) {
        return <NoCharCard icon={<Star weight="duotone" />} noun="choose feats" />
    }

    const primaryClassData = (classes as any[]).find((c) => c.name === character.class)
    const asiLevels = getASILevelsFromClass(primaryClassData)
    const totalASI = asiLevels.filter((l) => l <= character.level).length
    const usedASI = character.feats?.length ?? 0
    const remainingASI = totalASI - usedASI

    const characterSnapshot: PrereqCharacterSnapshot = {
        level: character.level,
        class: character.class,
        race: character.race,
        abilityScores: character.abilityScores,
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
                                    key={`${feat.name}|${feat.source ?? ''}`}
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
