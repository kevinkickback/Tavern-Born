import { FloppyDisk, Heart, List, Shield, TrendUp } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { Button } from '@/components/ui/button'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'

export function AppHeader() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const saveActiveCharacter = useCharacterStore((state) => state.saveActiveCharacter)
  const setSidebarOpen = useAppPreferencesStore((state) => state.setSidebarOpen)
  const sidebarOpen = useAppPreferencesStore((state) => state.sidebarOpen)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const { effectiveAC } = useArmorClass()
  const { hitPoints, calculatedMaxHP } = useHitPoints()

  const classSummary = useMemo(() => {
    if (!activeCharacter) {
      return ''
    }

    const progression = activeCharacter.classProgression ?? []

    const classes =
      progression.length > 0
        ? progression.map((entry) => `${entry.name} ${entry.levels}`).join(' - ')
        : (activeCharacter.class ?? '')

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
      <nav className="mb-6 grid grid-cols-3 items-center rounded-xl bg-card/80 backdrop-blur-sm px-4 py-3 shadow-md border border-border">
        {/* Hamburger — mobile only (left slot) */}
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground xl:hidden"
          >
            <List className="h-6 w-6" />
          </button>
        </div>

        {/* Character info — center slot */}
        <div className="flex items-center justify-center gap-3">
          {activeCharacter ? (
            <>
<div className="flex items-center gap-2">
                <div
                  className="relative h-10 w-10 text-accent"
                  data-testid="header-ac-badge"
                >
                  <Shield weight="fill" className="h-10 w-10" />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-card-foreground leading-none">
                    {effectiveAC}
                  </span>
                </div>
                <div
                  className="relative h-10 w-10 text-red-500"
                  data-testid="header-hp-badge"
                >
                  <Heart weight="fill" className="h-10 w-10" />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-card-foreground leading-none">
                    {displayedMaxHP}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center text-center">
                <h2 className="font-display text-lg font-bold leading-tight">
                  {activeCharacter.name}
                </h2>
                <p
                  className="text-xs text-muted-foreground max-w-[24rem] truncate"
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

        {/* Actions — right slot */}
        <div className="flex items-center justify-end gap-2">
          {activeCharacter && (
            <Button
              variant="outline"
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
      </nav>

      <LevelUpModal open={levelUpOpen} onOpenChange={setLevelUpOpen} />
    </>
  )
}
