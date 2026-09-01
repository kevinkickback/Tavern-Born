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
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ContextItem {
  label: string
  path: string
  icon: Icon
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
        items: [
          { label: 'Characters', path: '/', icon: Users },
          { label: 'Settings', path: '/settings', icon: Gear },
        ],
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
    groups: [{ items: [{ label: 'Sheet & PDF', path: '/character-sheet', icon: FilePdf }] }],
  },
  {
    id: 'compendium',
    label: 'Compendium',
    path: '/compendium',
    icon: Book,
    matches: (pathname) => pathname.startsWith('/compendium'),
    groups: [],
  },
]

function isContextItemActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeWorkspace =
    workspaces.find((workspace) => workspace.matches(location.pathname)) ?? workspaces[0]

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
                  const active = isContextItemActive(location.pathname, item.path)

                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
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
        </nav>
      </aside>
    </div>
  )
}
