import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Certificate,
    CaretLeft,
    CaretRight,
} from '@phosphor-icons/react'
import { renderEntry } from '@/lib/renderer'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { useSkills } from '@/hooks/character/useSkills'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { cn } from '@/lib/utils'
import { NoCharCard, InfoTile } from '@/pages/_shared'
import { SKILL_TO_ABILITY } from '@/lib/calculations/skills'

type ProfFocus =
    | { type: 'skill'; name: string; ability: string; proficient: boolean; expertise: boolean; modifierString: string }
    | { type: 'save'; ability: string; proficient: boolean; modifierString: string }
    | { type: 'item'; category: string; name: string }

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildProficienciesPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const gameData = useGameDataStore((s) => s.gameData)
    const { skills, toggleProficiency, toggleExpertise } = useSkills()
    const { savingThrows } = useSavingThrows()
    const [detailCollapsed, setDetailCollapsed] = useState(false)
    const [focused, setFocused] = useState<ProfFocus | null>(null)

    if (!character) {
        return (
            <NoCharCard icon={<Certificate weight="duotone" />} noun="view proficiencies" />
        )
    }

    const { armor, weapons, tools, languages } = character.proficiencies

    // Look up rich skill description from game data if available
    const skillDescriptions = useMemo(() => {
        const map: Record<string, any[]> = {}
        if (gameData?.skills) {
            for (const [, skill] of Object.entries(gameData.skills as Record<string, any>)) {
                if (skill?.name && skill?.entries) {
                    map[skill.name.toLowerCase()] = skill.entries
                }
            }
        }
        return map
    }, [gameData?.skills])

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 pt-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <h1 className="font-display text-2xl font-bold flex items-center gap-3">
                        <Certificate className="h-6 w-6 text-accent" weight="duotone" />
                        Proficiencies
                    </h1>
                </div>
            </div>

            <div className="flex-1 overflow-hidden px-6 pb-6">
                <div className="max-w-7xl mx-auto h-full">
                    <Card className="h-full overflow-hidden flex flex-col">
                        <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">

                            {/* Toggle button */}
                            <button
                                onClick={() => setDetailCollapsed((c) => !c)}
                                title={detailCollapsed ? 'Expand details panel' : 'Collapse details panel'}
                                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
                            >
                                {detailCollapsed ? (
                                    <CaretLeft className="h-3.5 w-3.5" />
                                ) : (
                                    <CaretRight className="h-3.5 w-3.5" />
                                )}
                            </button>

                            {/* Left pane — tabs */}
                            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4 pr-8">
                                        <Tabs defaultValue="skills">
                                            <TabsList className="mb-4 flex-wrap h-auto gap-1">
                                                <TabsTrigger value="skills">Skills</TabsTrigger>
                                                <TabsTrigger value="saving-throws">Saves</TabsTrigger>
                                                <TabsTrigger value="armor">Armor</TabsTrigger>
                                                <TabsTrigger value="weapons">Weapons</TabsTrigger>
                                                <TabsTrigger value="tools">Tools</TabsTrigger>
                                                <TabsTrigger value="languages">Languages</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="skills">
                                                <div className="space-y-1.5">
                                                    {skills.map((skill) => (
                                                        <button
                                                            key={skill.name}
                                                            type="button"
                                                            onClick={() => {
                                                                setFocused({
                                                                    type: 'skill',
                                                                    name: skill.name,
                                                                    ability: SKILL_TO_ABILITY[skill.name.toLowerCase()] ?? '',
                                                                    proficient: skill.proficient,
                                                                    expertise: skill.expertise,
                                                                    modifierString: skill.modifierString,
                                                                })
                                                                if (detailCollapsed) setDetailCollapsed(false)
                                                            }}
                                                            className={cn(
                                                                'w-full flex items-center justify-between p-3 rounded-lg border transition-colors hover:border-accent text-left',
                                                                focused?.type === 'skill' && (focused as any).name === skill.name
                                                                    ? 'border-accent bg-accent/10'
                                                                    : skill.proficient ? 'border-accent/40 bg-accent/5' : 'border-border bg-card',
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); toggleProficiency(skill.name) }}
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
                                                                    onClick={(e) => { e.stopPropagation(); skill.proficient && toggleExpertise(skill.name) }}
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
                                                            <span className="font-mono font-bold text-sm ml-2 flex-shrink-0">
                                                                {skill.modifierString}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="saving-throws">
                                                <div className="space-y-1.5">
                                                    {savingThrows.map((st) => (
                                                        <button
                                                            key={st.ability}
                                                            type="button"
                                                            onClick={() => {
                                                                setFocused({ type: 'save', ability: st.ability, proficient: st.proficient, modifierString: st.modifierString })
                                                                if (detailCollapsed) setDetailCollapsed(false)
                                                            }}
                                                            className={cn(
                                                                'w-full flex items-center justify-between p-3 rounded-lg border transition-colors hover:border-accent text-left',
                                                                focused?.type === 'save' && (focused as any).ability === st.ability
                                                                    ? 'border-accent bg-accent/10'
                                                                    : st.proficient ? 'border-accent/40 bg-accent/5' : 'border-border bg-card',
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
                                                                {st.proficient && <Badge variant="secondary" className="text-xs px-1.5 py-0">Prof</Badge>}
                                                            </div>
                                                            <span className="font-mono font-bold text-sm">{st.modifierString}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="armor">
                                                {armor.length === 0 ? (
                                                    <p className="text-muted-foreground text-sm py-4 text-center">No armor proficiencies</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {armor.map((item) => (
                                                            <button
                                                                key={item}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({ type: 'item', category: 'Armor', name: item })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'w-full text-left p-3 rounded-lg border capitalize text-sm transition-colors hover:border-accent',
                                                                    focused?.type === 'item' && (focused as any).name === item
                                                                        ? 'border-accent bg-accent/10' : 'border-border bg-card',
                                                                )}
                                                            >{item}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>

                                            <TabsContent value="weapons">
                                                {weapons.length === 0 ? (
                                                    <p className="text-muted-foreground text-sm py-4 text-center">No weapon proficiencies</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {weapons.map((item) => (
                                                            <button
                                                                key={item}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({ type: 'item', category: 'Weapon', name: item })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'w-full text-left p-3 rounded-lg border capitalize text-sm transition-colors hover:border-accent',
                                                                    focused?.type === 'item' && (focused as any).name === item
                                                                        ? 'border-accent bg-accent/10' : 'border-border bg-card',
                                                                )}
                                                            >{item}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>

                                            <TabsContent value="tools">
                                                {tools.length === 0 ? (
                                                    <p className="text-muted-foreground text-sm py-4 text-center">No tool proficiencies</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {tools.map((item) => (
                                                            <button
                                                                key={item}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({ type: 'item', category: 'Tool', name: item })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'w-full text-left p-3 rounded-lg border capitalize text-sm transition-colors hover:border-accent',
                                                                    focused?.type === 'item' && (focused as any).name === item
                                                                        ? 'border-accent bg-accent/10' : 'border-border bg-card',
                                                                )}
                                                            >{item}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>

                                            <TabsContent value="languages">
                                                {languages.length === 0 ? (
                                                    <p className="text-muted-foreground text-sm py-4 text-center">No language proficiencies</p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {languages.map((item) => (
                                                            <button
                                                                key={item}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({ type: 'item', category: 'Language', name: item })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'w-full text-left p-3 rounded-lg border capitalize text-sm transition-colors hover:border-accent',
                                                                    focused?.type === 'item' && (focused as any).name === item
                                                                        ? 'border-accent bg-accent/10' : 'border-border bg-card',
                                                                )}
                                                            >{item}</button>
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>
                                        </Tabs>
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* Right pane — proficiency detail */}
                            <div
                                className={cn(
                                    'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                                    detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-[40%] min-w-[280px]',
                                )}
                            >
                                <div className="p-4 border-b border-border">
                                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                        Details
                                    </span>
                                </div>
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4">
                                        {!focused ? (
                                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm text-center">
                                                Click any proficiency to view details
                                            </div>
                                        ) : focused.type === 'skill' ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                                                    <p className="text-sm text-muted-foreground capitalize">{focused.ability} check</p>
                                                </div>
                                                <Separator />
                                                <div className="grid grid-cols-3 gap-3">
                                                    <InfoTile title="Modifier">
                                                        <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                                                    </InfoTile>
                                                    <InfoTile title="Proficient">
                                                        <span className={cn('text-sm font-medium', focused.proficient ? 'text-accent' : 'text-muted-foreground')}>
                                                            {focused.proficient ? 'Yes' : 'No'}
                                                        </span>
                                                    </InfoTile>
                                                    <InfoTile title="Expertise">
                                                        <span className={cn('text-sm font-medium', focused.expertise ? 'text-accent' : 'text-muted-foreground')}>
                                                            {focused.expertise ? 'Yes' : 'No'}
                                                        </span>
                                                    </InfoTile>
                                                </div>
                                                {skillDescriptions[focused.name.toLowerCase()]?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Description</h4>
                                                        {skillDescriptions[focused.name.toLowerCase()].map((e: any, i: number) => (
                                                            <div
                                                                key={i}
                                                                className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1"
                                                                dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : focused.type === 'save' ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-xl font-display font-bold capitalize">{focused.ability} Save</h2>
                                                    <p className="text-sm text-muted-foreground">Saving Throw</p>
                                                </div>
                                                <Separator />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <InfoTile title="Modifier">
                                                        <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                                                    </InfoTile>
                                                    <InfoTile title="Proficient">
                                                        <span className={cn('text-sm font-medium', focused.proficient ? 'text-accent' : 'text-muted-foreground')}>
                                                            {focused.proficient ? 'Yes' : 'No'}
                                                        </span>
                                                    </InfoTile>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                                                    <p className="text-sm text-muted-foreground">{focused.category} Proficiency</p>
                                                </div>
                                                <Separator />
                                                <Badge variant="secondary" className="capitalize">{focused.category}</Badge>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>

                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
