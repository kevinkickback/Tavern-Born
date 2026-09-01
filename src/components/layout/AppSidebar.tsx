import type { Icon } from '@phosphor-icons/react'
import {
  Backpack,
  Barbell,
  Book,
  Books,
  Certificate,
  FilePdf,
  Gear,
  Image,
  Lightning,
  MagicWand,
  PersonSimple,
  Scroll,
  Sparkle,
  Star,
  Sword,
  Users,
  Wrench,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'

interface ContextItem {
  label: string
  path: string
  icon: Icon
  search?: string
}

interface ContextGroup {
  label?: string
  items: ContextItem[]
}

interface Workspace {
  id: 'start' | 'build' | 'sheet' | 'compendium'
  label: string
  path: string
  icon: Icon
  matches: (pathname: string) => boolean
  groups: ContextGroup[]
}

const workspaces: Workspace[] = [
  {
    id: 'start',
    label: 'Start',
    path: '/',
    icon: Users,
    matches: (pathname) => pathname === '/' || pathname.startsWith('/settings'),
    groups: [
      {
        label: 'Character Library',
        items: [{ label: 'Characters', path: '/', icon: Users }],
      },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    path: '/build/race',
    icon: Wrench,
    matches: (pathname) =>
      ['/build', '/feats', '/spells', '/equipment', '/details', '/sources'].some((prefix) =>
        pathname.startsWith(prefix),
      ),
    groups: [
      {
        label: 'Character Core',
        items: [
          { label: 'Race', path: '/build/race', icon: PersonSimple },
          { label: 'Class', path: '/build/class', icon: Sword },
          { label: 'Background', path: '/build/background', icon: Scroll },
          { label: 'Ability Scores', path: '/build/ability-scores', icon: Barbell },
          { label: 'Proficiencies', path: '/build/proficiencies', icon: Certificate },
          { label: 'Feats', path: '/feats', icon: Star },
          { label: 'Spells', path: '/spells', icon: MagicWand },
          { label: 'Equipment', path: '/equipment', icon: Backpack },
        ],
      },
      {
        label: 'Character Details',
        items: [
          { label: 'Portrait', path: '/details/portrait', icon: Image },
          { label: 'Characteristics', path: '/details/characteristics', icon: Sparkle },
          { label: 'Conditions', path: '/details/conditions', icon: Lightning },
          { label: 'Sources', path: '/sources', icon: Books },
        ],
      },
    ],
  },
  {
    id: 'sheet',
    label: 'Character Sheet',
    path: '/character-sheet',
    icon: FilePdf,
    matches: (pathname) => pathname.startsWith('/character-sheet'),
    groups: [
      {
        label: 'Templates',
        items: [
          { label: '5e (2014)', path: '/character-sheet/2014', icon: FilePdf },
          { label: '5.5e (2024)', path: '/character-sheet/2024', icon: FilePdf },
        ],
      },
    ],
  },
  {
    id: 'compendium',
    label: 'Compendium',
    path: '/compendium',
    icon: Book,
    matches: (pathname) => pathname.startsWith('/compendium'),
    groups: [
      {
        items: [{ label: 'All Entries', path: '/compendium', search: '', icon: Books }],
      },
      {
        label: 'Character Options',
        items: [
          { label: 'Races', path: '/compendium', search: '?type=Race', icon: PersonSimple },
          { label: 'Classes', path: '/compendium', search: '?type=Class', icon: Sword },
          {
            label: 'Backgrounds',
            path: '/compendium',
            search: '?type=Background',
            icon: Scroll,
          },
          { label: 'Feats', path: '/compendium', search: '?type=Feat', icon: Star },
        ],
      },
      {
        label: 'Rules & Play',
        items: [
          { label: 'Spells', path: '/compendium', search: '?type=Spell', icon: MagicWand },
          { label: 'Items', path: '/compendium', search: '?type=Item', icon: Backpack },
          { label: 'Skills', path: '/compendium', search: '?type=Skill', icon: Certificate },
          { label: 'Actions', path: '/compendium', search: '?type=Action', icon: Sword },
          {
            label: 'Conditions',
            path: '/compendium',
            search: '?type=Condition',
            icon: Lightning,
          },
        ],
      },
      {
        label: 'Reference',
        items: [
          { label: 'Languages', path: '/compendium', search: '?type=Language', icon: Book },
          { label: 'Senses', path: '/compendium', search: '?type=Sense', icon: Sparkle },
          { label: 'Deities', path: '/compendium', search: '?type=Deity', icon: Star },
          {
            label: 'Optional Features',
            path: '/compendium',
            search: '?type=Optional+Feature',
            icon: Wrench,
          },
          {
            label: 'Variant Rules',
            path: '/compendium',
            search: '?type=Variant+Rule',
            icon: Scroll,
          },
          {
            label: 'Traps & Hazards',
            path: '/compendium',
            search: '?type=Trap+%2F+Hazard',
            icon: Lightning,
          },
          { label: 'Rewards', path: '/compendium', search: '?type=Reward', icon: Certificate },
          {
            label: 'Cults & Boons',
            path: '/compendium',
            search: '?type=Cult+%2F+Boon',
            icon: Users,
          },
        ],
      },
    ],
  },
]

function isContextItemActive(pathname: string, locationSearch: string, item: ContextItem) {
  const { path, search } = item
  if (search !== undefined) {
    const currentTypes = new URLSearchParams(locationSearch).getAll('type').sort()
    const itemTypes = new URLSearchParams(search).getAll('type').sort()
    return pathname === path && currentTypes.join('|') === itemTypes.join('|')
  }
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const characters = useCharacterStore((state) => state.characters)
  const activeCharacterId = useCharacterStore((state) => state.activeCharacterId)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null)
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false)

  const recentCharacters = useMemo(
    () =>
      [...characters]
        .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
        .slice(0, 5),
    [characters],
  )

  const activeWorkspace =
    workspaces.find((workspace) => workspace.matches(location.pathname)) ?? workspaces[0]

  const openCharacter = (id: string) => {
    if (id === activeCharacterId) {
      navigate('/')
      return
    }
    if (hasUnsavedChanges) {
      setPendingCharacterId(id)
      setConfirmSwitchOpen(true)
      return
    }
    setActiveCharacter(id)
    navigate('/')
  }

  const confirmCharacterSwitch = () => {
    if (!pendingCharacterId) return
    setActiveCharacter(pendingCharacterId)
    setPendingCharacterId(null)
    setConfirmSwitchOpen(false)
    navigate('/')
  }

  return (
    <div className="contents" data-testid="workspace-navigation">
      <aside className="app-primary-rail app-drag col-start-1 row-[1/4] flex w-16 shrink-0 flex-col border-r border-border-strong bg-transparent">
        <nav
          aria-label="Primary workspaces"
          className="app-no-drag flex flex-1 flex-col items-center gap-1 py-2"
        >
          {workspaces.map((workspace) => {
            const WorkspaceIcon = workspace.icon
            const active = workspace.id === activeWorkspace.id

            return (
              <Tooltip key={workspace.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={workspace.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(workspace.path)}
                    className={cn(
                      'relative flex size-12 items-center justify-center rounded-md border text-[1.625rem] transition-colors',
                      active
                        ? 'border-primary/50 bg-sidebar-accent/15 text-primary'
                        : 'border-muted-foreground/45 bg-background/10 text-muted-foreground hover:border-muted-foreground/75 hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
                    )}
                    <WorkspaceIcon weight={active ? 'fill' : 'regular'} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {workspace.label}
                </TooltipContent>
              </Tooltip>
            )
          })}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Settings"
                onClick={() => navigate('/settings')}
                className="relative mt-auto flex size-12 items-center justify-center rounded-md border border-muted-foreground/45 bg-background/10 text-[1.625rem] text-muted-foreground transition-colors hover:border-muted-foreground/75 hover:bg-secondary hover:text-foreground"
              >
                <Gear />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Settings
            </TooltipContent>
          </Tooltip>
        </nav>
      </aside>

      <aside
        aria-label={`${activeWorkspace.label} navigation`}
        className="col-start-2 row-start-2 flex w-56 min-w-0 flex-col overflow-hidden bg-transparent"
      >
        <nav className="min-w-56 flex-1 overflow-y-auto px-2 py-2" aria-label="Workspace pages">
          {activeWorkspace.groups.map((group, groupIndex) => (
            <div key={group.label ?? 'primary'} className={cn(groupIndex > 0 && 'mt-5')}>
              {group.label && (
                <p className="mb-1 px-2 text-[length:var(--font-size-caption)] font-semibold uppercase leading-[var(--line-height-caption)] tracking-[0.1em] text-muted-foreground/80">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const ItemIcon = item.icon
                  const active = isContextItemActive(location.pathname, location.search, item)

                  return (
                    <li key={`${item.path}${item.search ?? ''}`}>
                      <Link
                        to={`${item.path}${item.search ?? ''}`}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
                          active
                            ? 'bg-secondary text-primary font-medium'
                            : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                        )}
                      >
                        {active && (
                          <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
                        )}
                        <ItemIcon
                          className="size-4 shrink-0"
                          weight={active ? 'fill' : 'regular'}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          {activeWorkspace.id === 'start' && (
            <div className="mt-5">
              <p className="mb-1 px-2 text-[length:var(--font-size-caption)] font-semibold uppercase leading-[var(--line-height-caption)] tracking-[0.1em] text-muted-foreground/80">
                Recent Characters
              </p>
              {recentCharacters.length > 0 ? (
                <ul className="space-y-0.5">
                  {recentCharacters.map((character) => {
                    const active = character.id === activeCharacterId
                    const name = character.name || 'Unnamed Character'
                    return (
                      <li key={character.id}>
                        <button
                          type="button"
                          aria-label={`Open ${name}`}
                          aria-pressed={active}
                          onClick={() => openCharacter(character.id)}
                          className={cn(
                            'relative flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                            active
                              ? 'bg-secondary text-foreground'
                              : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                          )}
                        >
                          {active && (
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
                          )}
                          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                            {character.portrait ? (
                              <img
                                src={resolvePortraitSrc(character.portrait)}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <Users className="size-3.5" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {[character.race, `Level ${getTotalCharacterLevel(character)}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-2 py-1 text-xs leading-relaxed text-muted-foreground">
                  Created and imported characters will appear here for quick access.
                </p>
              )}
            </div>
          )}
        </nav>
      </aside>

      <AlertDialog
        open={confirmSwitchOpen}
        onOpenChange={(open) => {
          setConfirmSwitchOpen(open)
          if (!open) setPendingCharacterId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on the current character. Switching characters will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCharacterSwitch}>Discard & Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
