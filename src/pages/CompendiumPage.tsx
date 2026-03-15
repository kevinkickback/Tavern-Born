import { useState, useMemo } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MagnifyingGlass, Sword, Sparkle, Backpack, Book, Users, Flag, Star, Lightbulb, Scroll, Globe } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

type CompendiumCategory = 
  | 'all'
  | 'races'
  | 'classes'
  | 'spells'
  | 'items'
  | 'backgrounds'
  | 'feats'
  | 'skills'
  | 'actions'
  | 'conditions'
  | 'languages'
  | 'deities'

interface CompendiumEntry {
  name: string
  type: string
  source: string
  description?: string
  data: any
}

const categoryIcons: Record<CompendiumCategory, any> = {
  all: Book,
  races: Users,
  classes: Sword,
  spells: Sparkle,
  items: Backpack,
  backgrounds: Flag,
  feats: Star,
  skills: Lightbulb,
  actions: Scroll,
  conditions: Scroll,
  languages: Globe,
  deities: Sparkle,
}

export function CompendiumPage() {
  const { gameData } = useGameDataStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<CompendiumCategory>('all')
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null)

  const allEntries = useMemo(() => {
    if (!gameData) return []

    const entries: CompendiumEntry[] = []

    if (gameData.races) {
      Object.values(gameData.races).forEach((race: any) => {
        entries.push({
          name: race.name,
          type: 'Race',
          source: race.source || 'Unknown',
          description: race.entries?.[0] || '',
          data: race,
        })
      })
    }

    if (gameData.classes) {
      Object.values(gameData.classes).forEach((cls: any) => {
        entries.push({
          name: cls.name,
          type: 'Class',
          source: cls.source || 'Unknown',
          description: cls.fluff?.entries?.[0] || '',
          data: cls,
        })
      })
    }

    if (gameData.spells) {
      Object.values(gameData.spells).forEach((spell: any) => {
        entries.push({
          name: spell.name,
          type: 'Spell',
          source: spell.source || 'Unknown',
          description: `Level ${spell.level} ${spell.school}`,
          data: spell,
        })
      })
    }

    if (gameData.items) {
      gameData.items.forEach((item: any) => {
        entries.push({
          name: item.name,
          type: 'Item',
          source: item.source || 'Unknown',
          description: item.entries?.[0] || item.type || '',
          data: item,
        })
      })
    }

    if (gameData.backgrounds) {
      Object.values(gameData.backgrounds).forEach((bg: any) => {
        entries.push({
          name: bg.name,
          type: 'Background',
          source: bg.source || 'Unknown',
          description: bg.entries?.[0] || '',
          data: bg,
        })
      })
    }

    if (gameData.feats) {
      Object.values(gameData.feats).forEach((feat: any) => {
        entries.push({
          name: feat.name,
          type: 'Feat',
          source: feat.source || 'Unknown',
          description: feat.entries?.[0] || '',
          data: feat,
        })
      })
    }

    if (gameData.skills) {
      Object.values(gameData.skills).forEach((skill: any) => {
        entries.push({
          name: skill.name,
          type: 'Skill',
          source: skill.source || 'Unknown',
          description: skill.entries?.[0] || '',
          data: skill,
        })
      })
    }

    if (gameData.actions) {
      gameData.actions.forEach((action: any) => {
        entries.push({
          name: action.name,
          type: 'Action',
          source: action.source || 'Unknown',
          description: action.entries?.[0] || '',
          data: action,
        })
      })
    }

    if (gameData.conditions) {
      gameData.conditions.forEach((cond: any) => {
        entries.push({
          name: cond.name,
          type: 'Condition',
          source: cond.source || 'Unknown',
          description: cond.entries?.[0] || '',
          data: cond,
        })
      })
    }

    if (gameData.languages) {
      Object.values(gameData.languages).forEach((lang: any) => {
        entries.push({
          name: lang.name,
          type: 'Language',
          source: lang.source || 'Unknown',
          description: lang.entries?.[0] || lang.type || '',
          data: lang,
        })
      })
    }

    if (gameData.deities) {
      gameData.deities.forEach((deity: any) => {
        entries.push({
          name: deity.name,
          type: 'Deity',
          source: deity.source || 'Unknown',
          description: deity.title || deity.alignment || '',
          data: deity,
        })
      })
    }

    return entries
  }, [gameData])

  const filteredEntries = useMemo(() => {
    let filtered = allEntries

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(
        (entry) => entry.type.toLowerCase() === selectedCategory
      )
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (entry) =>
          entry.name.toLowerCase().includes(query) ||
          entry.type.toLowerCase().includes(query) ||
          entry.source.toLowerCase().includes(query)
      )
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [allEntries, selectedCategory, searchQuery])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allEntries.length,
    }

    allEntries.forEach((entry) => {
      const type = entry.type.toLowerCase()
      counts[type] = (counts[type] || 0) + 1
    })

    return counts
  }, [allEntries])

  if (!gameData) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Data Loaded</CardTitle>
            <CardDescription>
              Please configure and load a data source in Settings before using the Compendium.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Book className="text-3xl text-accent" weight="duotone" />
            <div>
              <h1 className="text-3xl font-display font-bold">Compendium</h1>
              <p className="text-sm text-muted-foreground">
                Search and explore all loaded D&D 5e content
              </p>
            </div>
          </div>

          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, type, or source..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full p-6">
          <Tabs
            value={selectedCategory}
            onValueChange={(value) => setSelectedCategory(value as CompendiumCategory)}
            className="h-full flex flex-col"
          >
            <TabsList className="grid grid-cols-6 lg:grid-cols-12 mb-4">
              {Object.keys(categoryIcons).map((category) => {
                const Icon = categoryIcons[category as CompendiumCategory]
                const count = categoryCounts[category] || 0
                return (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="flex flex-col gap-1 h-auto py-2"
                  >
                    <Icon className="text-lg" />
                    <span className="text-xs capitalize">{category}</span>
                    <Badge variant="secondary" className="text-xs">
                      {count}
                    </Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <TabsContent value={selectedCategory} className="flex-1 overflow-hidden mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                <Card className="overflow-hidden flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Results ({filteredEntries.length})
                    </CardTitle>
                  </CardHeader>
                  <Separator />
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-2">
                      {filteredEntries.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          No entries found
                        </div>
                      ) : (
                        filteredEntries.map((entry, index) => (
                          <button
                            key={`${entry.type}-${entry.name}-${index}`}
                            onClick={() => setSelectedEntry(entry)}
                            className={`w-full text-left p-3 rounded-lg border transition-all hover:border-accent ${
                              selectedEntry === entry
                                ? 'border-accent bg-accent/10'
                                : 'border-border bg-card'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold truncate">{entry.name}</h3>
                                {entry.description && (
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {typeof entry.description === 'string' 
                                      ? entry.description 
                                      : JSON.stringify(entry.description)}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <Badge variant="outline" className="text-xs">
                                  {entry.type}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {entry.source}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </Card>

                <Card className="overflow-hidden flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Details</CardTitle>
                  </CardHeader>
                  <Separator />
                  <ScrollArea className="flex-1">
                    <div className="p-4">
                      {selectedEntry ? (
                        <div className="space-y-4">
                          <div>
                            <h2 className="text-2xl font-display font-bold mb-2">
                              {selectedEntry.name}
                            </h2>
                            <div className="flex gap-2 mb-4">
                              <Badge>{selectedEntry.type}</Badge>
                              <Badge variant="outline">{selectedEntry.source}</Badge>
                            </div>
                          </div>

                          <Separator />

                          <div className="space-y-3">
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                              Raw Data
                            </h3>
                            <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
                              {JSON.stringify(selectedEntry.data, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          Select an entry to view details
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
