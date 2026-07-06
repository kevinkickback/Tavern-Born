import {
  ArrowLineLeft,
  ArrowLineRight,
  Backpack,
  Barbell,
  Book,
  Books,
  CaretRight,
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
  User,
  Users,
  Wrench,
} from '@phosphor-icons/react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  children?: NavItem[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Character',
    items: [
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
        label: 'Sources',
        path: '/sources',
        icon: <Books />,
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        label: 'Compendium',
        path: '/compendium',
        icon: <Book />,
      },
      {
        label: 'Settings',
        path: '/settings',
        icon: <Gear />,
      },
    ],
  },
]

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [expandedSections, setExpandedSections] = useState<string[]>([])
  const [flyoutItem, setFlyoutItem] = useState<string | null>(null)
  const flyoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sidebarOpen = useAppPreferencesStore((state) => state.sidebarOpen)
  const setSidebarOpen = useAppPreferencesStore((state) => state.setSidebarOpen)

  const isExpanded = sidebarOpen

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    )
  }

  const openFlyout = (label: string) => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current)
    setFlyoutItem(label)
  }

  const scheduleFlyoutClose = () => {
    flyoutTimerRef.current = setTimeout(() => setFlyoutItem(null), 100)
  }

  const cancelFlyoutClose = () => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current)
  }

  const handleCollapseToggle = () => {
    if (sidebarOpen) setExpandedSections([])
    setSidebarOpen(!sidebarOpen)
  }

  // After the sidebar width transition (300ms), nudge all resize listeners so
  // fixed-position hint overlays recalculate their coordinates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sidebarOpen is an intentional trigger dep; value is not needed inside the callback
  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event('resize')), 310)
    return () => clearTimeout(timer)
  }, [sidebarOpen])

  const isExactActive = (path: string) => location.pathname === path

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <TooltipProvider delayDuration={300}>
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
          'fixed top-[4.5rem] bottom-0 left-0 z-50 flex flex-col border-r border-t border-border bg-card',
          'transition-[width,transform] duration-300 overflow-x-hidden',
          // Mobile: slide in/out at full width (existing behavior)
          'w-56',
          sidebarOpen ? 'translate-x-0' : '-translate-x-56',
          // Desktop: always visible, width-based toggle
          'xl:translate-x-0',
          isExpanded ? 'xl:w-56' : 'xl:w-12',
        )}
      >
        <nav className="flex-1 overflow-y-auto p-2">
          <div className="flex flex-col gap-1">
            {navGroups.map((group, groupIndex) => (
              <div key={group.label} className={cn(groupIndex > 0 && 'pt-2')}>
                {groupIndex > 0 && !isExpanded && (
                  <div className="mx-2 mb-2 border-t border-border/40" />
                )}
                {isExpanded && (
                  <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                    {group.label}
                  </p>
                )}
                <ul className="flex flex-col gap-px">
                  {group.items.map((item) => {
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
                            <PopoverPrimitive.Root open={!sidebarOpen && flyoutItem === item.label}>
                              <PopoverPrimitive.Anchor asChild>
                                <button
                                  type="button"
                                  onClick={() =>
                                    sidebarOpen ? toggleSection(item.label) : navigate(item.path)
                                  }
                                  onMouseEnter={() => !sidebarOpen && openFlyout(item.label)}
                                  onMouseLeave={() => !sidebarOpen && scheduleFlyoutClose()}
                                  className={cn(
                                    'w-full flex items-center py-2 rounded-lg text-base font-medium transition-colors',
                                    sidebarOpen ? 'gap-2.5 pl-3 pr-2.5' : 'justify-center',
                                    active
                                      ? 'bg-secondary text-primary'
                                      : childActive
                                        ? 'text-primary/70 hover:bg-secondary hover:text-foreground'
                                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                                  )}
                                >
                                  <span className="flex items-center shrink-0 text-xl">
                                    {item.icon}
                                  </span>
                                  <span
                                    className={cn(
                                      'flex-1 text-left overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200',
                                      isExpanded ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0',
                                    )}
                                  >
                                    {item.label}
                                  </span>
                                  <CaretRight
                                    className={cn(
                                      'shrink-0 text-base text-muted-foreground overflow-hidden transition-[transform,opacity,max-width] duration-200',
                                      expanded && 'rotate-90',
                                      (active || childActive) && 'text-current',
                                      isExpanded ? 'opacity-100 max-w-4' : 'opacity-0 max-w-0',
                                    )}
                                  />
                                </button>
                              </PopoverPrimitive.Anchor>
                              <PopoverPrimitive.Portal>
                                <PopoverPrimitive.Content
                                  side="right"
                                  align="start"
                                  sideOffset={12}
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                  onMouseEnter={cancelFlyoutClose}
                                  onMouseLeave={scheduleFlyoutClose}
                                  className={cn(
                                    'z-50 min-w-44 rounded-xl border border-border bg-card p-1 shadow-xl outline-none',
                                    'data-[state=open]:animate-in data-[state=closed]:animate-out',
                                    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                                    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                                    'data-[side=right]:slide-in-from-left-2',
                                  )}
                                >
                                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    {item.label}
                                  </div>
                                  <div className="mt-0.5 flex flex-col gap-px">
                                    {item.children.map((child) => {
                                      const childIsActive = isActive(child.path)
                                      return (
                                        <Link
                                          key={child.path}
                                          to={child.path}
                                          onClick={() => setFlyoutItem(null)}
                                          className={cn(
                                            'relative flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
                                            childIsActive
                                              ? 'bg-secondary text-primary font-medium'
                                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                                          )}
                                        >
                                          {childIsActive && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-primary" />
                                          )}
                                          <span className="flex items-center shrink-0 text-base">
                                            {child.icon}
                                          </span>
                                          <span>{child.label}</span>
                                        </Link>
                                      )
                                    })}
                                  </div>
                                </PopoverPrimitive.Content>
                              </PopoverPrimitive.Portal>
                            </PopoverPrimitive.Root>
                          ) : (
                            <Tooltip open={isExpanded ? false : undefined}>
                              <TooltipTrigger asChild>
                                <Link
                                  to={item.path}
                                  className={cn(
                                    'flex items-center py-2 rounded-lg text-base font-medium transition-colors',
                                    sidebarOpen ? 'gap-2.5 pl-3 pr-2.5' : 'justify-center',
                                    active
                                      ? 'bg-secondary text-primary'
                                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                                  )}
                                >
                                  <span className="flex items-center shrink-0 text-xl">
                                    {item.icon}
                                  </span>
                                  <span
                                    className={cn(
                                      'flex-1 overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200',
                                      isExpanded ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0',
                                    )}
                                  >
                                    {item.label}
                                  </span>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent side="right">{item.label}</TooltipContent>
                            </Tooltip>
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
              </div>
            ))}
          </div>
        </nav>

        {/* Collapse toggle */}
        <div className="px-2 pb-2">
          <Tooltip open={isExpanded ? false : undefined}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                onClick={handleCollapseToggle}
                className={cn(
                  'w-full flex items-center py-2 rounded-lg text-base font-medium transition-colors text-muted-foreground hover:bg-secondary hover:text-foreground',
                  sidebarOpen ? 'gap-2.5 pl-3 pr-2.5' : 'justify-center',
                )}
              >
                <span className="flex items-center shrink-0 text-xl">
                  {sidebarOpen ? <ArrowLineLeft /> : <ArrowLineRight />}
                </span>
                <span
                  className={cn(
                    'flex-1 text-left overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-200',
                    isExpanded ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0',
                  )}
                >
                  Collapse Menu
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
