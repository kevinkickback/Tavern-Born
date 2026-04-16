import {
  Backpack,
  Bell,
  BookOpen,
  CaretDown,
  FileText,
  Gear,
  House,
  MagicWand,
  Moon,
  Star,
  Sword,
  User,
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
    icon: <House />,
  },
  {
    label: 'Build',
    path: '/build',
    icon: <Sword />,
    children: [
      { label: 'Race', path: '/build/race', icon: null },
      { label: 'Class', path: '/build/class', icon: null },
      { label: 'Background', path: '/build/background', icon: null },
      { label: 'Ability Scores', path: '/build/ability-scores', icon: null },
      { label: 'Proficiencies', path: '/build/proficiencies', icon: null },
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
      { label: 'Portrait', path: '/details/portrait', icon: null },
      {
        label: 'Characteristics',
        path: '/details/characteristics',
        icon: null,
      },
      { label: 'Backstory & Appearance', path: '/details/backstory', icon: null },
    ],
  },
  {
    label: 'Character Sheet',
    path: '/character-sheet',
    icon: <FileText />,
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
  const [expandedSections, setExpandedSections] = useState<string[]>([])
  const [activeFooterAction, setActiveFooterAction] = useState<string | null>(null)
  const sidebarOpen = useAppPreferencesStore((state) => state.sidebarOpen)
  const setSidebarOpen = useAppPreferencesStore((state) => state.setSidebarOpen)

  const footerActions: FooterAction[] = [
    {
      id: 'compendium',
      label: 'Compendium',
      icon: <BookOpen className="text-lg" />,
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
    setExpandedSections((prev) => (prev.includes(label) ? [] : [label]))
  }

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

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                {item.children ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSection(item.label)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                        isActive(item.path)
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-secondary hover:text-secondary-foreground',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-lg">{item.icon}</span>
                        {item.label}
                      </span>
                      <CaretDown
                        className={cn(
                          'transition-transform text-base',
                          expandedSections.includes(item.label) && 'rotate-180',
                        )}
                      />
                    </button>
                    {expandedSections.includes(item.label) && (
                      <ul className="mt-1 ml-4 space-y-1">
                        {item.children.map((child) => (
                          <li key={child.path}>
                            <Link
                              to={child.path}
                              className={cn(
                                'block px-4 py-2 rounded-lg text-sm transition-colors',
                                isActive(child.path)
                                  ? 'bg-accent text-accent-foreground font-medium'
                                  : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <Link
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      isActive(item.path)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary hover:text-secondary-foreground',
                    )}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
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
                    'cursor-pointer flex h-10 items-center overflow-hidden rounded-xl text-sm font-medium transition-all duration-200 ease-out',
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
