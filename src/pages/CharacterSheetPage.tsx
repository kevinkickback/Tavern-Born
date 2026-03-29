import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
    Scroll,
    Sword,
    Heart,
    Shield,
    Star,
    Lightning,
    Sneaker,
    BookOpen,
    Backpack,
    MagicWand,
    Check,
} from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useAbilityScores } from '@/hooks/character/useAbilityScores'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useSkills } from '@/hooks/character/useSkills'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useCharacterLevel } from '@/hooks/character/useCharacterLevel'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { ABILITY_NAMES, ABILITY_ABBREVIATIONS, formatModifier } from '@/lib/calculations/abilityScores'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { SKILL_TO_ABILITY } from '@/lib/calculations/skills'
import { cn } from '@/lib/utils'
import { NoCharCard } from './_shared'
import type { AbilityName } from '@/lib/calculations/abilityScores'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="flex flex-col items-center justify-center border border-border rounded-lg p-3 bg-card/50 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</span>
            <span className="text-2xl font-bold text-foreground leading-none">{value}</span>
            {sub && <span className="text-xs text-muted-foreground mt-0.5">{sub}</span>}
        </div>
    )
}

function AbilityBlock({ ability, score, modifier }: { ability: string; score: number; modifier: string }) {
    return (
        <div className="flex flex-col items-center border border-border rounded-lg p-3 bg-card/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">{ability}</span>
            <span className="text-2xl font-bold leading-none">{score}</span>
            <span className="text-sm text-muted-foreground mt-1">{modifier}</span>
        </div>
    )
}

function ProfDot({ proficient, expertise }: { proficient: boolean; expertise?: boolean }) {
    return (
        <span
            className={cn(
                'inline-block w-3 h-3 rounded-full border border-current flex-shrink-0',
                expertise ? 'bg-accent border-accent' : proficient ? 'bg-foreground' : 'bg-transparent',
            )}
        />
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CharacterSheetPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const { scores, modifiers, modifierStrings } = useAbilityScores()
    const { hitPoints, calculatedMaxHP, hitDie } = useHitPoints()
    const { skills, passivePerception } = useSkills()
    const { savingThrows } = useSavingThrows()
    const { calculatedAC } = useArmorClass()
    const { level, proficiencyBonus, proficiencyBonusString, initiativeString } = useCharacterLevel()
    const { slots, isSpellcaster, cantrips, spellsKnown, preparedSpells, spellcastingAbility } = useSpellSlots()

    if (!character) {
        return <NoCharCard icon={<Scroll weight="duotone" />} noun="view a character sheet" />
    }

    const hitDieValue = hitDie
    const speed = character.speed ?? 30
    const conMod = getAbilityModifier(character.abilityScores.constitution)
    const spellSaveDC = useMemo(() => {
        if (!spellcastingAbility) return null
        const abilityMod = getAbilityModifier(character.abilityScores[spellcastingAbility as AbilityName] ?? 10)
        return 8 + proficiencyBonus + abilityMod
    }, [spellcastingAbility, character.abilityScores, proficiencyBonus])
    const spellAttackBonus = useMemo(() => {
        if (!spellcastingAbility) return null
        const abilityMod = getAbilityModifier(character.abilityScores[spellcastingAbility as AbilityName] ?? 10)
        return formatModifier(proficiencyBonus + abilityMod)
    }, [spellcastingAbility, character.abilityScores, proficiencyBonus])

    // Group skills by governing ability for display
    const skillsByAbility = useMemo(() => {
        const map = new Map<string, typeof skills>()
        for (const skill of skills) {
            const ability = SKILL_TO_ABILITY[skill.name] ?? 'strength'
            if (!map.has(ability)) map.set(ability, [])
            map.get(ability)!.push(skill)
        }
        return map
    }, [skills])

    const proficiencyList = [
        ...(character.proficiencies.armor.length ? [`Armor: ${character.proficiencies.armor.join(', ')}`] : []),
        ...(character.proficiencies.weapons.length ? [`Weapons: ${character.proficiencies.weapons.join(', ')}`] : []),
        ...(character.proficiencies.tools.length ? [`Tools: ${character.proficiencies.tools.join(', ')}`] : []),
    ]

    const xpToNext: Record<number, number> = {
        1: 300, 2: 900, 3: 2700, 4: 6500, 5: 14000,
        6: 23000, 7: 34000, 8: 48000, 9: 64000, 10: 85000,
        11: 100000, 12: 120000, 13: 140000, 14: 165000, 15: 195000,
        16: 225000, 17: 265000, 18: 305000, 19: 355000, 20: 0,
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-4 pb-8">

            {/* ── Header ───────────────────────────────────────────────── */}
            <Card className="w-full">
                <CardContent className="pt-5 pb-4">
                    <div className="flex flex-wrap items-start gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="font-display text-3xl font-bold text-foreground truncate">
                                {character.name || 'Unnamed Character'}
                            </h1>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {character.race && (
                                    <Badge variant="secondary">
                                        {character.subrace ? `${character.subrace} (${character.race})` : character.race}
                                    </Badge>
                                )}
                                {character.class && (
                                    <Badge variant="secondary">
                                        {character.class}{character.subclass ? ` • ${character.subclass}` : ''}
                                    </Badge>
                                )}
                                {character.background && (
                                    <Badge variant="outline">{character.background}</Badge>
                                )}
                                {character.details?.alignment && (
                                    <Badge variant="outline">{character.details.alignment}</Badge>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-accent">{level}</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-wide">Level</div>
                            </div>
                            {level < 20 && (
                                <div className="text-center text-xs text-muted-foreground">
                                    <div>{(character.experiencePoints ?? 0).toLocaleString()} XP</div>
                                    <div className="text-[10px]">/ {(xpToNext[level] ?? 0).toLocaleString()}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Combat stat tiles ────────────────────────────────────── */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                <StatBox label="Armor Class" value={calculatedAC} />
                <StatBox
                    label="Hit Points"
                    value={`${hitPoints.current} / ${calculatedMaxHP}`}
                    sub={hitPoints.temporary ? `+${hitPoints.temporary} temp` : undefined}
                />
                <StatBox label="Initiative" value={initiativeString} />
                <StatBox label="Speed" value={`${speed} ft`} />
                <StatBox label="Prof Bonus" value={proficiencyBonusString} />
                <StatBox label="Hit Die" value={`d${hitDieValue}`} sub={`×${level}`} />
                <StatBox label="Passive Perc" value={passivePerception} />
            </div>

            {/* ── Ability / Saves / Skills / Misc ─────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Col 1 — Ability Scores + Saving Throws */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ability Scores</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 gap-2">
                                {ABILITY_NAMES.map((ability) => (
                                    <AbilityBlock
                                        key={ability}
                                        ability={ABILITY_ABBREVIATIONS[ability]}
                                        score={scores[ability]}
                                        modifier={modifierStrings[ability]}
                                    />
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                                <Shield className="h-4 w-4 text-accent" weight="duotone" />
                                Saving Throws
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1.5">
                                {savingThrows.map((st) => (
                                    <div key={st.ability} className="flex items-center gap-2.5 py-0.5">
                                        <ProfDot proficient={st.proficient} />
                                        <span className="text-sm font-mono w-10 text-right flex-shrink-0 text-foreground">
                                            {formatModifier(st.modifier)}
                                        </span>
                                        <span className="text-sm text-foreground capitalize">{st.ability}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Death Saves */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                                <Heart className="h-4 w-4 text-red-400" weight="duotone" />
                                Death Saves
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {(['Successes', 'Failures'] as const).map((label) => (
                                    <div key={label} className="flex items-center gap-3">
                                        <span className="text-sm text-muted-foreground w-20">{label}</span>
                                        <div className="flex gap-2">
                                            {[0, 1, 2].map((i) => (
                                                <span key={i} className="w-5 h-5 rounded-full border-2 border-border bg-card/50" />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Col 2 — Skills */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                            <Star className="h-4 w-4 text-accent" weight="duotone" />
                            Skills
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            {skills.map((skill) => (
                                <div key={skill.name} className="flex items-center gap-2.5 py-0.5">
                                    <ProfDot proficient={skill.proficient} expertise={skill.expertise} />
                                    <span className="text-sm font-mono w-8 text-right flex-shrink-0 text-foreground">
                                        {formatModifier(skill.modifier)}
                                    </span>
                                    <span className="text-sm text-foreground capitalize flex-1">{skill.name}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase">
                                        {ABILITY_ABBREVIATIONS[skill.ability as AbilityName] ?? skill.ability.slice(0, 3).toUpperCase()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Col 3 — Proficiencies, Languages, Personality */}
                <div className="space-y-4">
                    {(proficiencyList.length > 0 || character.proficiencies.languages.length > 0) && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                                    <BookOpen className="h-4 w-4 text-accent" weight="duotone" />
                                    Proficiencies &amp; Languages
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {proficiencyList.map((line) => (
                                    <p key={line} className="text-sm text-foreground">{line}</p>
                                ))}
                                {character.proficiencies.languages.length > 0 && (
                                    <p className="text-sm text-foreground">
                                        <span className="font-semibold">Languages: </span>
                                        {character.proficiencies.languages
                                            .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
                                            .join(', ')}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {character.details?.personalityTraits || character.details?.personality ? (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personality</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm text-foreground">
                                {(character.details.personalityTraits || character.details.personality) && (
                                    <p><span className="font-semibold text-muted-foreground">Traits: </span>{character.details.personalityTraits ?? character.details.personality}</p>
                                )}
                                {character.details.ideals && (
                                    <p><span className="font-semibold text-muted-foreground">Ideals: </span>{character.details.ideals}</p>
                                )}
                                {character.details.bonds && (
                                    <p><span className="font-semibold text-muted-foreground">Bonds: </span>{character.details.bonds}</p>
                                )}
                                {character.details.flaws && (
                                    <p><span className="font-semibold text-muted-foreground">Flaws: </span>{character.details.flaws}</p>
                                )}
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>

            {/* ── Features & Traits ────────────────────────────────────── */}
            {character.features.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Lightning className="h-5 w-5 text-accent" weight="duotone" />
                            Features &amp; Traits
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {character.features.map((f) => (
                                <div key={f.id} className="border border-border rounded-lg p-3 bg-card/30">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold text-foreground">{f.name}</p>
                                        {f.source && (
                                            <Badge variant="outline" className="text-[10px] py-0 flex-shrink-0">{f.source}</Badge>
                                        )}
                                    </div>
                                    {f.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{f.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Feats ────────────────────────────────────────────────── */}
            {(character.feats?.length ?? 0) > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Star className="h-5 w-5 text-accent" weight="duotone" />
                            Feats
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {character.feats.map((f) => (
                                <div key={f.id} className="border border-border rounded-lg p-3 bg-card/30">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold text-foreground">{f.name}</p>
                                        {f.source && (
                                            <Badge variant="outline" className="text-[10px] py-0 flex-shrink-0">{f.source}</Badge>
                                        )}
                                    </div>
                                    {f.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{f.description}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Equipment ────────────────────────────────────────────── */}
            {character.equipment.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Backpack className="h-5 w-5 text-accent" weight="duotone" />
                            Equipment
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {character.equipment.map((item) => (
                                <div
                                    key={item.id}
                                    className={cn(
                                        'border rounded-lg px-3 py-2 text-sm',
                                        item.equipped
                                            ? 'border-accent/40 bg-accent/5'
                                            : 'border-border bg-card/30 opacity-60',
                                    )}
                                >
                                    <div className="flex items-center gap-1.5">
                                        {item.equipped && <Check className="h-3 w-3 text-accent flex-shrink-0" />}
                                        <span className="font-medium truncate">{item.name}</span>
                                    </div>
                                    <div className="flex gap-2 mt-0.5">
                                        {item.quantity > 1 && (
                                            <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                                        )}
                                        {item.rarity && item.rarity !== 'none' && (
                                            <span className="text-xs text-muted-foreground capitalize">{item.rarity}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Spells ───────────────────────────────────────────────── */}
            {isSpellcaster && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <MagicWand className="h-5 w-5 text-accent" weight="duotone" />
                            Spellcasting
                            {spellcastingAbility && (
                                <Badge variant="secondary" className="ml-1 text-xs">
                                    {ABILITY_ABBREVIATIONS[spellcastingAbility as AbilityName] ?? spellcastingAbility.toUpperCase()}
                                </Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Spell attack / save */}
                        <div className="flex gap-4">
                            {spellSaveDC !== null && (
                                <div className="text-center border border-border rounded-lg px-4 py-2">
                                    <div className="text-xl font-bold">{spellSaveDC}</div>
                                    <div className="text-xs text-muted-foreground">Spell Save DC</div>
                                </div>
                            )}
                            {spellAttackBonus !== null && (
                                <div className="text-center border border-border rounded-lg px-4 py-2">
                                    <div className="text-xl font-bold">{spellAttackBonus}</div>
                                    <div className="text-xs text-muted-foreground">Spell Attack</div>
                                </div>
                            )}
                        </div>

                        {/* Spell slots */}
                        {slots.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Spell Slots</p>
                                <div className="flex flex-wrap gap-2">
                                    {slots.map((slot) => (
                                        <div
                                            key={slot.level}
                                            className={cn(
                                                'border rounded-lg px-3 py-1.5 text-center min-w-[56px]',
                                                slot.available === 0
                                                    ? 'border-border opacity-50'
                                                    : 'border-accent/40 bg-accent/5',
                                            )}
                                        >
                                            <div className="text-sm font-bold">{slot.available}/{slot.max}</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {slot.isPactMagic ? 'Pact' : `Level ${slot.level}`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Cantrips */}
                        {cantrips.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cantrips</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {cantrips.map((name) => (
                                        <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Prepared / Known spells */}
                        {(preparedSpells.length > 0 || spellsKnown.length > 0) && (
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                    {preparedSpells.length > 0 ? 'Prepared Spells' : 'Spells Known'}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(preparedSpells.length > 0 ? preparedSpells : spellsKnown).map((name) => (
                                        <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
