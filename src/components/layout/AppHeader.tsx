import { useState } from 'react'
import { FloppyDisk, TrendUp } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useCharacterStore } from '@/store/characterStore'
import { LevelUpModal } from '@/components/character/LevelUpModal'

export function AppHeader() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const [levelUpOpen, setLevelUpOpen] = useState(false)

  return (
    <>
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex-1 flex items-center">
          <h1 className="font-display text-2xl font-bold text-primary">
            Tavern Born
          </h1>
        </div>

        <div className="flex flex-col items-center">
          {activeCharacter ? (
            <>
              <h2 className="font-display text-lg font-bold">{activeCharacter.name}</h2>
              <p className="text-xs text-muted-foreground">
                Level {activeCharacter.level} {activeCharacter.race} {activeCharacter.class}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No Character Loaded</p>
          )}
        </div>

        <div className="flex-1 flex items-center justify-end gap-2">
          {activeCharacter && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setLevelUpOpen(true)}
            >
              <TrendUp />
              Level Up
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            disabled={!activeCharacter}
            className="gap-2 bg-accent hover:bg-accent/90"
          >
            <FloppyDisk />
            Save
          </Button>
        </div>
      </header>

      <LevelUpModal open={levelUpOpen} onOpenChange={setLevelUpOpen} />
    </>
  )
}
