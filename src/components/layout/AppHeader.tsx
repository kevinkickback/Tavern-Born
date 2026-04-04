import { useState } from 'react'
import { FloppyDisk, TrendUp } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useCharacterStore } from '@/store/characterStore'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { toast } from 'sonner'

export function AppHeader() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const saveActiveCharacter = useCharacterStore((state) => state.saveActiveCharacter)
  const [levelUpOpen, setLevelUpOpen] = useState(false)

  const handleSave = () => {
    if (!activeCharacter) {
      return
    }

    if (!hasUnsavedChanges) {
      toast.info('No changes to save')
      return
    }

    saveActiveCharacter()
    toast.success('Character saved')
  }

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
            disabled={!activeCharacter || !hasUnsavedChanges}
            className="relative gap-2 bg-accent hover:bg-accent/90"
            onClick={handleSave}
          >
            {hasUnsavedChanges && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            )}
            <FloppyDisk />
            Save
          </Button>
        </div>
      </header>

      <LevelUpModal open={levelUpOpen} onOpenChange={setLevelUpOpen} />
    </>
  )
}
