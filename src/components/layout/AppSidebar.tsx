import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  House,
  Sword,
  Star,
  MagicWand,
  Backpack,
  User,
  FileText,
  Gear,
  Bell,
  Moon,
  CaretDown,
  BookOpen,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  children?: NavItem[]
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
      { label: 'Proficiencies', path: '/build/proficiencies', icon: null },
      { label: 'Ability Scores', path: '/build/ability-scores', icon: null },
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
      { label: 'Characteristics', path: '/details/characteristics', icon: null },
      { label: 'Appearance', path: '/details/appearance', icon: null },
      { label: 'Allies & Organizations', path: '/details/allies-organizations', icon: null },
      { label: 'History', path: '/details/history', icon: null },
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

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    )
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col h-full">
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              {item.children ? (
                <div>
                  <button
                    onClick={() => toggleSection(item.label)}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                      isActive(item.path)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary hover:text-secondary-foreground'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-lg">{item.icon}</span>
                      {item.label}
                    </span>
                    <CaretDown
                      className={cn(
                        'transition-transform text-base',
                        expandedSections.includes(item.label) && 'rotate-180'
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
                              'block px-4 py-2 rounded-lg text-sm transition-all',
                              isActive(child.path)
                                ? 'bg-accent text-accent-foreground font-medium'
                                : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
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
                    'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                    isActive(item.path)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-secondary hover:text-secondary-foreground'
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

      <div className="p-4 border-t border-border flex items-center justify-center gap-4">
        <button 
          onClick={() => navigate('/compendium')}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <BookOpen className="text-lg" />
        </button>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <Bell className="text-lg" />
        </button>
        <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <Moon className="text-lg" />
        </button>
      </div>
    </aside>
  )
}
