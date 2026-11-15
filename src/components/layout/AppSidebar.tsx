import type { Icon } from '@phosphor-icons/react'
import {
  Axe,
  Backpack,
  Barbell,
  Book,
  BookOpen,
  Books,
  Buildings,
  Certificate,
  ClipboardText,
  Crown,
  Eye,
  FilePdf,
  Gear,
  Gift,
  HandFist,
  HandsPraying,
  Heartbeat,
  IdentificationCard,
  Image,
  MagicWand,
  Medal,
  PawPrint,
  PersonSimple,
  PuzzlePiece,
  SlidersHorizontal,
  Sparkle,
  Sword,
  Tag,
  Translate,
  Users,
  Warning,
  Wrench,
} from '@phosphor-icons/react'
import { lazy, type Ref, Suspense } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'

const CharacterReadinessBadge = lazy(() =>
  import('@/components/character/CharacterReadinessBadge').then((module) => ({
    default: module.CharacterReadinessBadge,
  })),
)

interface ContextItem {
  label: string
  ariaLabel?: string
  path: string
  icon: Icon
  search?: string
}

interface ContextGroup {
  label?: string
  items: ContextItem[]
}

interface Workspace {
  id: 'start' | 'build' | 'rules' | 'sheet' | 'compendium'
  label: string
  path: string
  icon: Icon
  matches: (pathname: string) => boolean
  groups: ContextGroup[]
  requiresCharacter?: boolean
}

const workspaces: Workspace[] = [
  {
    id: 'start',
    label: 'Characters',
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
    label: 'Builder',
    path: '/build/race',
    icon: Wrench,
    requiresCharacter: true,
    matches: (pathname) =>
      ['/build', '/feats', '/spells', '/equipment', '/details'].some((prefix) =>
        pathname.startsWith(prefix),
      ),
    groups: [
      {
        label: 'Core',
        items: [
          { label: 'Race', path: '/build/race', icon: PersonSimple },
          { label: 'Class', path: '/build/class', icon: Sword },
          { label: 'Background', path: '/build/background', icon: IdentificationCard },
          { label: 'Ability Scores', path: '/build/ability-scores', icon: Barbell },
          { label: 'Proficiencies', path: '/build/proficiencies', icon: Certificate },
          { label: 'Feats', path: '/feats', icon: Medal },
          { label: 'Spells', path: '/spells', icon: MagicWand },
          { label: 'Equipment', path: '/equipment', icon: Backpack },
        ],
      },
      {
        label: 'Details',
        items: [
          { label: 'Portrait', path: '/details/portrait', icon: Image },
          { label: 'Characteristics', path: '/details/characteristics', icon: Sparkle },
          { label: 'Conditions', path: '/details/conditions', icon: Heartbeat },
          { label: 'Actions & Effects', path: '/build/adjustments', icon: HandFist },
        ],
      },
      {
        label: 'Finish',
        items: [{ label: 'Review', path: '/build/review', icon: ClipboardText }],
      },
    ],
  },
  {
    id: 'rules',
    label: 'Rules',
    path: '/rules',
    icon: SlidersHorizontal,
    requiresCharacter: true,
    matches: (pathname) => pathname.startsWith('/rules') || pathname.startsWith('/sources'),
    groups: [
      {
        label: 'Character Configuration',
        items: [
          { label: 'Character Rules', path: '/rules', icon: SlidersHorizontal },
          { label: 'Additional Content', path: '/sources', icon: Books },
        ],
      },
    ],
  },
  {
    id: 'sheet',
    label: 'Character Sheet',
    path: '/character-sheet',
    icon: FilePdf,
    requiresCharacter: true,
    matches: (pathname) => pathname.startsWith('/character-sheet'),
    groups: [
      ['2014', '5e (2014)', 'MorePurpleMoreBetter'],
      ['2024', '5.5e (2024)', 'Lost Loot'],
    ].map(([edition, ruleset, customLabel]) => ({
      label: `${ruleset} Templates`,
      items: [
        ['official', 'Wizards of the Coast'],
        ['custom', customLabel],
      ].map(([variant, label]) => ({
        label,
        ariaLabel: `${ruleset} ${label}`,
        path: `/character-sheet/${edition}/${variant}`,
        icon: FilePdf,
      })),
    })),
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
            label: 'Subclass Features',
            path: '/compendium',
            search: '?type=Subclass+Feature',
            icon: Sparkle,
          },
          {
            label: 'Backgrounds',
            path: '/compendium',
            search: '?type=Background',
            icon: IdentificationCard,
          },
          { label: 'Feats', path: '/compendium', search: '?type=Feat', icon: Medal },
        ],
      },
      {
        label: 'Rules & Play',
        items: [
          { label: 'Spells', path: '/compendium', search: '?type=Spell', icon: MagicWand },
          { label: 'Items', path: '/compendium', search: '?type=Item', icon: Backpack },
          { label: 'Creatures', path: '/compendium', search: '?type=Creature', icon: PawPrint },
          {
            label: 'Weapon Masteries',
            path: '/compendium',
            search: '?type=Weapon+Mastery',
            icon: Axe,
          },
          {
            label: 'Item Properties',
            path: '/compendium',
            search: '?type=Item+Property',
            icon: Tag,
          },
          { label: 'Skills', path: '/compendium', search: '?type=Skill', icon: Certificate },
          { label: 'Actions', path: '/compendium', search: '?type=Action', icon: HandFist },
          {
            label: 'Conditions',
            path: '/compendium',
            search: '?type=Condition',
            icon: Heartbeat,
          },
        ],
      },
      {
        label: 'Reference',
        items: [
          { label: 'Languages', path: '/compendium', search: '?type=Language', icon: Translate },
          { label: 'Senses', path: '/compendium', search: '?type=Sense', icon: Eye },
          { label: 'Deities', path: '/compendium', search: '?type=Deity', icon: Crown },
          {
            label: 'Organizations',
            path: '/compendium',
            search: '?type=Organization',
            icon: Buildings,
          },
          {
            label: 'Optional Features',
            path: '/compendium',
            search: '?type=Optional+Feature',
            icon: PuzzlePiece,
          },
          {
            label: 'Variant Rules',
            path: '/compendium',
            search: '?type=Variant+Rule',
            icon: BookOpen,
          },
          {
            label: 'Traps & Hazards',
            path: '/compendium',
            search: '?type=Trap+%2F+Hazard',
            icon: Warning,
          },
          { label: 'Rewards', path: '/compendium', search: '?type=Reward', icon: Gift },
          {
            label: 'Cults & Boons',
            path: '/compendium',
            search: '?type=Cult+%2F+Boon',
            icon: HandsPraying,
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

export function AppSidebar({ libraryControlsRef }: { libraryControlsRef?: Ref<HTMLDivElement> }) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const activeWorkspace =
    workspaces.find((workspace) => workspace.matches(location.pathname)) ?? workspaces[0]
  const isLibrary = location.pathname === '/'

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
            const unavailable = Boolean(workspace.requiresCharacter && !activeCharacter)

            return (
              <Tooltip key={workspace.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={workspace.label}
                    aria-current={active ? 'page' : undefined}
                    aria-disabled={unavailable || undefined}
                    onClick={() => {
                      if (!unavailable) navigate(workspace.path)
                    }}
                    className={cn(
                      'relative flex size-12 items-center justify-center rounded-md border text-[1.625rem] transition-colors',
                      unavailable
                        ? 'cursor-not-allowed border-muted-foreground/20 bg-background/5 text-muted-foreground/35'
                        : active
                          ? 'border-primary/50 bg-sidebar-accent/15 text-primary'
                          : 'border-muted-foreground/45 bg-background/10 text-[color:var(--navigation-foreground)] hover:border-muted-foreground/75 hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
                    )}
                    <WorkspaceIcon weight={active ? 'fill' : 'regular'} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {unavailable
                    ? `Open or create a character to use ${workspace.label}.`
                    : workspace.label}
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
                className="relative mt-auto flex size-12 items-center justify-center rounded-md border border-muted-foreground/45 bg-background/10 text-[1.625rem] text-[color:var(--navigation-foreground)] transition-colors hover:border-muted-foreground/75 hover:bg-secondary hover:text-foreground"
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
          {isLibrary ? (
            <div ref={libraryControlsRef} />
          ) : (
            activeWorkspace.groups.map((group, groupIndex) => (
              <div key={group.label ?? 'primary'} className={cn(groupIndex > 0 && 'mt-5')}>
                {group.label && (
                  <div className="mb-1 flex items-center gap-2 px-2">
                    <p className="shrink-0 text-[length:var(--font-size-caption)] font-semibold uppercase leading-[var(--line-height-caption)] tracking-[0.1em] text-muted-foreground/80">
                      {group.label}
                    </p>
                    <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
                  </div>
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon
                    const active = isContextItemActive(location.pathname, location.search, item)

                    return (
                      <li key={`${item.path}${item.search ?? ''}`}>
                        <Link
                          to={`${item.path}${item.search ?? ''}`}
                          aria-label={item.ariaLabel}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'relative flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
                            active
                              ? 'bg-secondary text-primary font-medium'
                              : 'text-[color:var(--navigation-foreground)] hover:bg-secondary/70 hover:text-foreground',
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
                          {item.path === '/build/review' && activeCharacter && (
                            <Suspense fallback={null}>
                              <CharacterReadinessBadge
                                character={activeCharacter}
                                compact
                                className="ml-auto px-1.5 py-0 text-[10px]"
                              />
                            </Suspense>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </nav>
      </aside>
    </div>
  )
}
