import {
  Backpack,
  Barbell,
  Book,
  Books,
  Certificate,
  ClipboardText,
  FilePdf,
  FloppyDisk,
  Gear,
  HandFist,
  Heartbeat,
  type Icon,
  IdentificationCard,
  Image,
  MagicWand,
  Medal,
  PersonSimple,
  SlidersHorizontal,
  Sparkle,
  Sword,
  TrendUp,
  Users,
} from '@phosphor-icons/react'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getRaceDisplayName } from '@/lib/calculations/raceDisplay'
import { isSettingsPath } from '@/lib/navigation/settingsNavigation'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { useCharacterStore } from '@/store/characterStore'

const GuidedLevelUpWizard = lazy(() => import('@/components/modals/GuidedLevelUpWizard'))

const PAGE_DETAILS: Array<[prefix: string, title: string, icon: Icon]> = [
  ['/build/overview', 'Overview', ClipboardText],
  ['/build/adjustments', 'Actions & Effects', HandFist],
  ['/build/ability-scores', 'Ability Scores', Barbell],
  ['/build/proficiencies', 'Proficiencies', Certificate],
  ['/build/background', 'Background', IdentificationCard],
  ['/build/class', 'Class', Sword],
  ['/build/race', 'Race', PersonSimple],
  ['/details/characteristics', 'Characteristics', Sparkle],
  ['/details/conditions', 'Conditions', Heartbeat],
  ['/details/portrait', 'Portrait', Image],
  ['/character-sheet', 'Character Sheet', FilePdf],
  ['/compendium', 'Compendium', Book],
  ['/equipment', 'Equipment', Backpack],
  ['/rules', 'Character Rules', SlidersHorizontal],
  ['/settings', 'Settings', Gear],
  ['/sources', 'Additional Content', Books],
  ['/spells', 'Spells', MagicWand],
  ['/feats', 'Feats', Medal],
  ['/', 'Characters', Users],
]

function getPageDetails(pathname: string) {
  return PAGE_DETAILS.find(([prefix]) => {
    if (prefix === '/settings') return isSettingsPath(pathname)
    return prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
  })
}

export function AppHeader() {
  const location = useLocation()
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const saveActiveCharacter = useCharacterStore((state) => state.saveActiveCharacter)
  const [levelUpCharacterId, setLevelUpCharacterId] = useState<string>()
  const levelUpButton = useRef<HTMLButtonElement>(null)
  const pageDetails = getPageDetails(location.pathname)
  const PageIcon = pageDetails?.[2]
  const showLevelUp = ['/build', '/feats', '/spells', '/equipment', '/details'].some((prefix) =>
    location.pathname.startsWith(prefix),
  )

  const characterSummary = useMemo(() => {
    if (!activeCharacter) return { visible: '', classBreakdown: '', isCondensed: false }

    const progression = activeCharacter.classProgression
    const classNames = progression.map((entry) => entry.name)
    const totalLevel = progression.reduce((sum, entry) => sum + entry.levels, 0) || 1
    const classBreakdown = progression.map((entry) => `${entry.name} ${entry.levels}`).join(' · ')
    const isCondensed = classNames.length > 2
    const classLabel = isCondensed ? `${classNames.length} classes` : classNames.join(' / ')

    return {
      visible: [
        getRaceDisplayName(activeCharacter.race, activeCharacter.subrace),
        `Level ${totalLevel}`,
        classLabel,
      ]
        .filter(Boolean)
        .join(' · '),
      classBreakdown,
      isCondensed,
    }
  }, [activeCharacter])

  const handleSave = async () => {
    if (!activeCharacter) return

    if (!hasUnsavedChanges) {
      toast.info('No changes to save')
      return
    }

    try {
      await saveActiveCharacter()
      toast.success('Character saved')
    } catch (error) {
      console.error('Failed to save character:', error)
      toast.error('Could not save character', {
        description: 'Your changes are still available. Check storage space and try again.',
      })
    }
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
          {activeCharacter && pageDetails?.[0] !== '/build/overview' && (
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
            </div>
          )}
          {!activeCharacter && (
            <span className="text-xs text-muted-foreground">No character loaded</span>
          )}
        </div>

        <div className="app-no-drag flex h-full min-w-0 items-center justify-end gap-2">
          {showLevelUp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  ref={levelUpButton}
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  data-level-up-button="true"
                  aria-label="Level up character"
                  disabled={!activeCharacter}
                  onClick={() => setLevelUpCharacterId(activeCharacter?.id)}
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
                  ? 'Save character'
                  : 'No changes to save'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {showLevelUp && activeCharacter && levelUpCharacterId === activeCharacter.id && (
        <Suspense fallback={null}>
          <GuidedLevelUpWizard
            key={levelUpCharacterId}
            onClose={() => {
              setLevelUpCharacterId(undefined)
              requestAnimationFrame(() => levelUpButton.current?.focus())
            }}
          />
        </Suspense>
      )}
    </TooltipProvider>
  )
}
