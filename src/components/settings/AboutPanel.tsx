import { Books, Code, GithubLogo, Globe, Heart } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Section } from '@/components/workspace'

const TECH_STACK = [
  { icon: Code, label: 'Electron + React 19' },
  { icon: Books, label: 'Radix UI + Tailwind CSS v4' },
]

export function AboutPanel() {
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.electronAPI
      ?.getAppVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  const infoRows = [
    { label: 'Version', value: appVersion || '—' },
    { label: 'License', value: 'GPL-3.0' },
    { label: 'Platform', value: 'Electron desktop application' },
  ]

  return (
    <div>
      <Section className="pt-0">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-sidebar">
            <img
              src={`${import.meta.env.BASE_URL}assets/images/ui/logo.png`}
              alt="Tavern Born"
              className="size-14 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold">Tavern Born</h2>
            <p className="text-sm text-muted-foreground">D&amp;D 5e Character Manager</p>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A desktop app for building and managing D&amp;D 5th Edition characters. Create characters,
          manage spells and equipment, and explore options across published sources.
        </p>

        <dl className="mt-4 grid max-w-xl grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          {infoRows.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="font-medium">{label}</dt>
              <dd className="text-muted-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Built With">
        <ul className="grid gap-2 sm:grid-cols-2">
          {TECH_STACK.map(({ icon: StackIcon, label }) => (
            <li key={label} className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <StackIcon className="size-4 text-primary" />
              {label}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Links">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a
            href="https://github.com/kevinkickback/Tavern-Born"
            target="_blank"
            rel="noreferrer"
            className="flex h-8 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubLogo className="size-4 text-primary" />
            GitHub Repository
          </a>
          <a
            href="https://kevinkickback.com"
            target="_blank"
            rel="noreferrer"
            className="flex h-8 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Globe className="size-4 text-primary" />
            KevinKickback.com
          </a>
        </div>
      </Section>

      <div className="flex items-center gap-1.5 pt-4 text-xs text-muted-foreground">
        <span>Made with</span>
        <Heart className="size-3.5 text-pink-500" weight="fill" />
        <span>for the D&amp;D community</span>
      </div>
    </div>
  )
}
