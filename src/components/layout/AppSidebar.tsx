import {
  Backpack,
  Barbell,
  Bell,
  Book,
  CaretRight,
  Certificate,
  FilePdf,
  Gear,
  Image,
  Lightning,
  MagicWand,
  Moon,
  PersonSimple,
  Scroll,
  Sparkle,
  Star,
  Sword,
  User,
  Users,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  children?: NavItem[]
}

interface FooterAction {
  id: string
  label: string
  icon: React.ReactNode
  onClick?: () => void
}

const navItems: NavItem[] = [
  {
    label: 'Home',
    path: '/',
    icon: <Users />,
  },
  {
    label: 'Build',
    path: '/build',
    icon: <Wrench />,
    children: [
      { label: 'Race', path: '/build/race', icon: <PersonSimple /> },
      { label: 'Class', path: '/build/class', icon: <Sword /> },
      { label: 'Background', path: '/build/background', icon: <Scroll /> },
      { label: 'Ability Scores', path: '/build/ability-scores', icon: <Barbell /> },
      { label: 'Proficiencies', path: '/build/proficiencies', icon: <Certificate /> },
    ],
  },
  {
    label: 'Feats',
    path: '/feats',
    icon: <Star />,
  },
  {
    label: 'Spells',
    path: '/spells',
    icon: <MagicWand />,
  },
  {
    label: 'Equipment',
    path: '/equipment',
    icon: <Backpack />,
  },
  {
    label: 'Details',
    path: '/details',
    icon: <User />,
    children: [
      { label: 'Portrait', path: '/details/portrait', icon: <Image /> },
      { label: 'Characteristics', path: '/details/characteristics', icon: <Sparkle /> },
      { label: 'Conditions', path: '/details/conditions', icon: <Lightning /> },
    ],
  },
  {
    label: 'Character Sheet',
    path: '/character-sheet',
    icon: <FilePdf />,
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: <Gear />,
  },
]

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedSections, setExpandedSections] = useState<string[]>(['Build'])
  const [activeFooterAction, setActiveFooterAction] = useState<string | null>(null)
  const sidebarOpen = useAppPreferencesStore((state) => state.sidebarOpen)
  const setSidebarOpen = useAppPreferencesStore((state) => state.setSidebarOpen)

  const footerActions: FooterAction[] = [
    {
      id: 'compendium',
      label: 'Compendium',
      icon: <Book className="text-lg" />,
      onClick: () => navigate('/compendium'),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="text-lg" />,
    },
    {
      id: 'theme',
      label: 'Theme',
      icon: <Moon className="text-lg" />,
    },
  ]

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    )
  }

  const isExactActive = (path: string) => location.pathname === path

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/40 xl:hidden cursor-default"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 my-4 ml-4 flex h-[calc(100vh-32px)] w-72 flex-col rounded-xl border border-border bg-card shadow-sm transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-80',
          'xl:translate-x-0',
        )}
      >
        {/* Brand header */}
        <div className="relative flex items-center justify-center py-6 px-8 overflow-hidden">
          <Link
            to="/"
            className="relative flex items-center font-display text-xl font-bold text-primary whitespace-nowrap"
          >
            <img
              src="/assets/images/ui/logo.png"
              alt="Tavern Born"
              className="absolute -left-7 top-1/2 h-24 w-24 -translate-y-1/2 object-contain"
            />
            <span className="pl-16">Tavern Born</span>
          </Link>
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground xl:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 border-t border-border" />

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-px">
            {navItems.map((item) => {
              const active = item.children ? isExactActive(item.path) : isActive(item.path)
              const childActive = item.children?.some((c) => isActive(c.path)) ?? false
              const expanded = expandedSections.includes(item.label)

              return (
                <li key={item.path}>
                  {/* Parent row */}
                  <div className="relative">
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
                    )}
                    {item.children ? (
                      <button
                        type="button"
                        onClick={() => toggleSection(item.label)}
                        className={cn(
                          'w-full flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-lg text-base font-medium transition-colors',
                          active
                            ? 'bg-secondary text-primary'
                            : childActive
                              ? 'text-primary/70 hover:bg-secondary hover:text-foreground'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <span className="flex items-center shrink-0 text-xl">{item.icon}</span>
                        <span className="flex-1 text-left">{item.label}</span>
                        <CaretRight
                          className={cn(
                            'shrink-0 text-base text-muted-foreground transition-transform duration-200',
                            expanded && 'rotate-90',
                            (active || childActive) && 'text-current',
                          )}
                        />
                      </button>
                    ) : (
                      <Link
                        to={item.path}
                        className={cn(
                          'flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-lg text-base font-medium transition-colors',
                          active
                            ? 'bg-secondary text-primary'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <span className="flex items-center shrink-0 text-xl">{item.icon}</span>
                        <span className="flex-1">{item.label}</span>
                      </Link>
                    )}
                  </div>

                  {/* Sub-nav with vertical track */}
                  {item.children && expanded && (
                    <div className="flex mt-0.5">
                      <div className="w-px ml-[19px] my-1 bg-gradient-to-b from-border to-transparent shrink-0" />
                      <ul className="flex-1 flex flex-col gap-px py-0.5 pl-1">
                        {item.children.map((child) => {
                          const childIsActive = isActive(child.path)
                          return (
                            <li key={child.path} className="relative">
                              {childIsActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-primary" />
                              )}
                              <Link
                                to={child.path}
                                className={cn(
                                  'flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-lg text-[15px] transition-colors',
                                  childIsActive
                                    ? 'bg-secondary text-primary font-medium'
                                    : 'text-muted-foreground/80 hover:bg-secondary hover:text-foreground',
                                )}
                              >
                                <span className="flex items-center shrink-0 text-base">
                                  {child.icon}
                                </span>
                                <span>{child.label}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center justify-center overflow-hidden">
            {footerActions.map((action) => {
              const isExpanded = activeFooterAction === action.id
              const isCollapsed = activeFooterAction !== null && !isExpanded

              return (
                <button
                  key={action.id}
                  type="button"
                  aria-label={action.label}
                  title={action.label}
                  onClick={action.onClick}
                  onMouseEnter={() => setActiveFooterAction(action.id)}
                  onMouseLeave={() => setActiveFooterAction(null)}
                  onFocus={() => setActiveFooterAction(action.id)}
                  onBlur={() => setActiveFooterAction(null)}
                  className={cn(
                    'flex h-10 items-center overflow-hidden rounded-xl text-sm font-medium transition-all duration-200 ease-out',
                    isExpanded
                      ? 'w-36 gap-2 bg-secondary px-3 text-secondary-foreground shadow-sm'
                      : 'w-10 justify-center text-muted-foreground hover:bg-secondary/70 hover:text-secondary-foreground',
                    isCollapsed && 'w-0 scale-90 px-0 opacity-0 pointer-events-none',
                  )}
                >
                  <span className="shrink-0">{action.icon}</span>
                  <span
                    className={cn(
                      'whitespace-nowrap transition-all duration-200 ease-out',
                      isExpanded
                        ? 'max-w-24 translate-x-0 opacity-100'
                        : 'max-w-0 -translate-x-2 opacity-0',
                    )}
                  >
                    {action.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
