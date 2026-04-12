import { FloppyDisk, Heart, Shield, TrendUp } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { Button } from '@/components/ui/button'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useCharacterStore } from '@/store/characterStore'

export function AppHeader() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const saveActiveCharacter = useCharacterStore((state) => state.saveActiveCharacter)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const { storedAC } = useArmorClass()
  const { hitPoints, calculatedMaxHP } = useHitPoints()

  const classSummary = useMemo(() => {
    if (!activeCharacter) {
      return ''
    }

    const progression = activeCharacter.classProgression?.length
      ? activeCharacter.classProgression
      : [
          {
            name: activeCharacter.class,
            levels: Math.max(activeCharacter.level || 1, 1),
          },
        ]

    const classes = progression.map((entry) => `${entry.name} ${entry.levels}`).join(' - ')

    return `${activeCharacter.race} - ${classes}`
  }, [activeCharacter])

  const displayedMaxHP = useMemo(() => {
    if (!activeCharacter) {
      return 0
    }
    return hitPoints.max > 0 ? hitPoints.max : calculatedMaxHP
  }, [activeCharacter, hitPoints.max, calculatedMaxHP])

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
          <h1 className="font-display text-2xl font-bold text-primary">Tavern Born</h1>
        </div>

        <div className="flex items-center gap-3">
          {activeCharacter ? (
            <>
              <div className="flex items-center gap-2">
                <div
                  className="relative h-10 w-10 text-muted-foreground"
                  data-testid="header-ac-badge"
                >
                  <Shield weight="fill" className="h-10 w-10" />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-card-foreground leading-none">
                    {storedAC}
                  </span>
                </div>
                <div
                  className="relative h-10 w-10 text-muted-foreground"
                  data-testid="header-hp-badge"
                >
                  <Heart weight="fill" className="h-10 w-10" />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-card-foreground leading-none">
                    {displayedMaxHP}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <h2 className="font-display text-lg font-bold">{activeCharacter.name}</h2>
                <p
                  className="text-xs text-muted-foreground max-w-[34rem] truncate"
                  title={classSummary}
                >
                  {classSummary}
                </p>
              </div>
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
              data-level-up-button="true"
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
