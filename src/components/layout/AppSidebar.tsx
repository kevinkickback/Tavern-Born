import type { Icon } from '@phosphor-icons/react'
import {
  ArrowLineLeft,
  ArrowLineRight,
  Backpack,
  Barbell,
  Book,
  Books,
  Certificate,
  Database,
  FilePdf,
  Gear,
  Image,
  Info,
  Lightning,
  MagicWand,
  Palette,
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
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

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
  id: 'characters' | 'build' | 'sheet' | 'compendium' | 'settings'
  label: string
  path: string
  icon: Icon
  matches: (pathname: string) => boolean
  groups: ContextGroup[]
}

const workspaces: Workspace[] = [
  {
    id: 'characters',
    label: 'Characters',
    path: '/',
    icon: Users,
    matches: (pathname) => pathname === '/',
    groups: [],
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
        label: 'Character Build',
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
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings/general',
    icon: Gear,
    matches: (pathname) => pathname.startsWith('/settings'),
    groups: [
      {
        label: 'Application Settings',
        items: [
          { label: 'General', path: '/settings/general', icon: Gear },
          { label: 'Appearance', path: '/settings/appearance', icon: Palette },
          { label: 'Game Data', path: '/settings/data', icon: Database },
          { label: 'About', path: '/settings/about', icon: Info },
        ],
      },
    ],
  },
]

function isContextItemActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const sidebarOpen = useAppPreferencesStore((state) => state.sidebarOpen)
  const setSidebarOpen = useAppPreferencesStore((state) => state.setSidebarOpen)

  const activeWorkspace =
    workspaces.find((workspace) => workspace.matches(location.pathname)) ?? workspaces[0]
  const hasContextPane = activeWorkspace.groups.length > 0

  return (
    <div className="flex h-full shrink-0" data-testid="workspace-navigation">
      <aside className="app-primary-rail app-drag flex w-14 shrink-0 flex-col border-r border-border bg-sidebar">
        <Link
          to="/"
          aria-label="Tavern Born home"
          className="app-no-drag flex h-14 items-center justify-center border-b border-border"
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/images/ui/logo.png`}
            alt=""
            className="size-9 object-contain"
          />
        </Link>

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
                      'relative flex size-10 items-center justify-center rounded-md text-xl transition-colors',
                      active
                        ? 'bg-sidebar-accent/15 text-primary'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
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

        {hasContextPane && (
          <div className="app-no-drag border-t border-border p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={sidebarOpen ? 'Collapse context pane' : 'Expand context pane'}
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="flex size-10 items-center justify-center rounded-md text-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {sidebarOpen ? <ArrowLineLeft /> : <ArrowLineRight />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {sidebarOpen ? 'Collapse context pane' : 'Expand context pane'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </aside>

      {hasContextPane && (
        <aside
          aria-label={`${activeWorkspace.label} navigation`}
          className={cn(
            'flex min-w-0 flex-col overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200',
            sidebarOpen ? 'w-56' : 'w-0 border-r-0',
          )}
        >
          <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
            <span className="truncate text-sm font-semibold">{activeWorkspace.label}</span>
          </div>

          <nav className="min-w-56 flex-1 overflow-y-auto px-2 py-3" aria-label="Workspace pages">
            {activeWorkspace.groups.map((group, groupIndex) => (
              <div key={group.label ?? 'primary'} className={cn(groupIndex > 0 && 'mt-5')}>
                {group.label && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
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
      )}
    </div>
  )
}
