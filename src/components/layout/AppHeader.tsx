import { FloppyDisk, Heart, Shield, TrendUp } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { LevelUpModal } from '@/components/modals/LevelUpModal'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { useCharacterStore } from '@/store/characterStore'

const PAGE_TITLES: Array<[prefix: string, title: string]> = [
  ['/build/ability-scores', 'Ability Scores'],
  ['/build/proficiencies', 'Proficiencies'],
  ['/build/background', 'Background'],
  ['/build/class', 'Class'],
  ['/build/race', 'Race'],
  ['/details/characteristics', 'Characteristics'],
  ['/details/conditions', 'Conditions'],
  ['/details/portrait', 'Portrait'],
  ['/character-sheet', 'Character Sheet'],
  ['/compendium', 'Compendium'],
  ['/equipment', 'Equipment'],
  ['/settings', 'Settings'],
  ['/sources', 'Sources'],
  ['/spells', 'Spells'],
  ['/feats', 'Feats'],
  ['/', 'Characters'],
]

function getPageTitle(pathname: string) {
  return PAGE_TITLES.find(([prefix]) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix),
  )?.[1]
}

export function AppHeader() {
  const location = useLocation()
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const saveActiveCharacter = useCharacterStore((state) => state.saveActiveCharacter)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const { effectiveAC } = useArmorClass()
  const { effectiveMaxHP } = useHitPoints()
  const showLevelUp = [
    '/build',
    '/feats',
    '/spells',
    '/equipment',
    '/details',
    '/sources',
    '/character-sheet',
  ].some((prefix) => location.pathname.startsWith(prefix))

  const classSummary = useMemo(() => {
    if (!activeCharacter) return ''

    const progression = activeCharacter.classProgression ?? []
    const classes =
      progression.length > 0
        ? progression.map((entry) => `${entry.name} ${entry.levels}`).join(' - ')
        : (activeCharacter.class ?? '')

    return [activeCharacter.race, classes].filter(Boolean).join(' - ')
  }, [activeCharacter])

  const handleSave = () => {
    if (!activeCharacter) return

    if (!hasUnsavedChanges) {
      toast.info('No changes to save')
      return
    }

    saveActiveCharacter()
    toast.success('Character saved')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <header className="app-drag grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-border bg-sidebar px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {getPageTitle(location.pathname) ?? 'Tavern Born'}
          </h1>
        </div>

        <div className="app-no-drag flex min-w-0 items-center justify-center px-3">
          {activeCharacter ? (
            <div className="flex min-w-0 items-center gap-3" title={classSummary}>
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-sm font-semibold text-muted-foreground">
                {activeCharacter.portrait ? (
                  <img
                    src={resolvePortraitSrc(activeCharacter.portrait)}
                    alt={`${activeCharacter.name || 'Character'} portrait`}
                    className="size-full object-cover"
                  />
                ) : (
                  activeCharacter.name?.trim().charAt(0).toUpperCase() || '?'
                )}
              </div>
              <div className="min-w-0 text-left">
                <p className="max-w-72 truncate text-[15px] font-semibold leading-tight">
                  {activeCharacter.name}
                </p>
                <p className="mt-0.5 max-w-72 truncate text-xs leading-tight text-muted-foreground">
                  {classSummary}
                </p>
              </div>
              <div className="ml-1 hidden items-center gap-2 border-l border-border pl-4 lg:flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-8 items-center gap-1.5 px-1 text-xs tabular-nums text-muted-foreground"
                      data-testid="header-ac-badge"
                    >
                      <Shield className="size-4 text-primary" weight="fill" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide">AC</span>
                      <span className="text-sm font-semibold text-foreground">{effectiveAC}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Armor Class</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-8 items-center gap-1.5 px-1 text-xs tabular-nums text-muted-foreground"
                      data-testid="header-hp-badge"
                    >
                      <Heart className="size-4 text-red-500" weight="fill" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide">HP</span>
                      <span className="text-sm font-semibold text-foreground">
                        {effectiveMaxHP}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Maximum Hit Points</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No character loaded</span>
          )}
        </div>

        <div className="app-no-drag flex min-w-0 items-center justify-end gap-1.5">
          {showLevelUp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3"
                  aria-label="Level up character"
                  disabled={!activeCharacter}
                  onClick={() => setLevelUpOpen(true)}
                >
                  <TrendUp />
                  <span className="hidden 2xl:inline">Level Up</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Level up character</TooltipContent>
            </Tooltip>
          )}

          {activeCharacter && hasUnsavedChanges && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-9 gap-2 px-3"
                  aria-label="Save character"
                  onClick={handleSave}
                >
                  <FloppyDisk />
                  <span className="hidden xl:inline">Save changes</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save character (Ctrl+S)</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <LevelUpModal open={levelUpOpen} onOpenChange={setLevelUpOpen} />
    </TooltipProvider>
  )
}
