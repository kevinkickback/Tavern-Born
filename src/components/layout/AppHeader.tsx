import {
  Backpack,
  Barbell,
  Book,
  Books,
  Certificate,
  FilePdf,
  FloppyDisk,
  Gear,
  Heart,
  type Icon,
  Image,
  Lightning,
  MagicWand,
  PersonSimple,
  Scroll,
  Shield,
  Sparkle,
  Star,
  Sword,
  TrendUp,
  Users,
} from '@phosphor-icons/react'
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

const PAGE_DETAILS: Array<[prefix: string, title: string, icon: Icon]> = [
  ['/build/ability-scores', 'Ability Scores', Barbell],
  ['/build/proficiencies', 'Proficiencies', Certificate],
  ['/build/background', 'Background', Scroll],
  ['/build/class', 'Class', Sword],
  ['/build/race', 'Race', PersonSimple],
  ['/details/characteristics', 'Characteristics', Sparkle],
  ['/details/conditions', 'Conditions', Lightning],
  ['/details/portrait', 'Portrait', Image],
  ['/character-sheet', 'Character Sheet', FilePdf],
  ['/compendium', 'Compendium', Book],
  ['/equipment', 'Equipment', Backpack],
  ['/settings', 'Settings', Gear],
  ['/sources', 'Sources', Books],
  ['/spells', 'Spells', MagicWand],
  ['/feats', 'Feats', Star],
  ['/', 'Characters', Users],
]

function getPageDetails(pathname: string) {
  return PAGE_DETAILS.find(([prefix]) =>
    prefix === '/' ? pathname === '/' : pathname.startsWith(prefix),
  )
}

export function AppHeader() {
  const location = useLocation()
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const saveActiveCharacter = useCharacterStore((state) => state.saveActiveCharacter)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const { effectiveAC } = useArmorClass()
  const { effectiveMaxHP } = useHitPoints()
  const pageDetails = getPageDetails(location.pathname)
  const PageIcon = pageDetails?.[2]
  const showLevelUp = ['/build', '/feats', '/spells', '/equipment', '/details', '/sources'].some(
    (prefix) => location.pathname.startsWith(prefix),
  )

  const characterSummary = useMemo(() => {
    if (!activeCharacter) return { visible: '', classBreakdown: '', isCondensed: false }

    const progression = activeCharacter.classProgression ?? []
    const classNames =
      progression.length > 0
        ? progression.map((entry) => entry.name).filter(Boolean)
        : [activeCharacter.class].filter((name): name is string => Boolean(name))
    const totalLevel =
      progression.length > 0
        ? progression.reduce((sum, entry) => sum + entry.levels, 0)
        : activeCharacter.level
    const classBreakdown =
      progression.length > 0
        ? progression.map((entry) => `${entry.name} ${entry.levels}`).join(' · ')
        : classNames.join(' · ')
    const isCondensed = classNames.length > 2
    const classLabel = isCondensed ? `${classNames.length} classes` : classNames.join(' / ')

    return {
      visible: [activeCharacter.race, `Level ${totalLevel}`, classLabel]
        .filter(Boolean)
        .join(' · '),
      classBreakdown,
      isCondensed,
    }
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
      <header className="app-drag grid h-16 shrink-0 grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] items-center bg-workspace-canvas px-5">
        <div className="flex min-w-0 items-center gap-3">
          {PageIcon && <PageIcon className="size-7 shrink-0 text-primary" weight="fill" />}
          <h1 className="truncate text-[length:var(--font-size-page-title)] font-semibold leading-[var(--line-height-page-title)] tracking-tight">
            {pageDetails?.[1] ?? 'Tavern Born'}
          </h1>
        </div>

        <div className="app-no-drag flex min-w-0 items-center justify-center px-4">
          {activeCharacter ? (
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-base font-semibold text-muted-foreground">
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
                <p className="max-w-80 truncate text-lg font-semibold leading-tight">
                  {activeCharacter.name}
                </p>
                {characterSummary.isCondensed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="mt-1 max-w-80 truncate text-sm leading-tight text-muted-foreground">
                        {characterSummary.visible}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>Classes: {characterSummary.classBreakdown}</TooltipContent>
                  </Tooltip>
                ) : (
                  <p className="mt-1 max-w-80 truncate text-sm leading-tight text-muted-foreground">
                    {characterSummary.visible}
                  </p>
                )}
              </div>
              <div className="ml-1 hidden items-center gap-3 border-l border-border pl-5 xl:flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-9 items-center gap-2 px-1 text-sm tabular-nums text-muted-foreground"
                      data-testid="header-ac-badge"
                    >
                      <Shield className="size-6 text-primary" weight="fill" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">AC</span>
                      <span className="text-base font-semibold text-foreground">{effectiveAC}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Armor Class</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex h-9 items-center gap-2 px-1 text-sm tabular-nums text-muted-foreground"
                      data-testid="header-hp-badge"
                    >
                      <Heart className="size-6 text-red-500" weight="fill" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">HP</span>
                      <span className="text-base font-semibold text-foreground">
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

        <div className="app-no-drag flex h-full min-w-0 items-center justify-end gap-2">
          {showLevelUp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-9 gap-2 px-3"
                aria-label="Save character"
                disabled={!activeCharacter || !hasUnsavedChanges}
                onClick={handleSave}
              >
                <FloppyDisk />
                <span className="hidden xl:inline">Save changes</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {!activeCharacter
                ? 'No character loaded'
                : hasUnsavedChanges
                  ? 'Save character (Ctrl+S)'
                  : 'No changes to save'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <LevelUpModal open={levelUpOpen} onOpenChange={setLevelUpOpen} />
    </TooltipProvider>
  )
}
