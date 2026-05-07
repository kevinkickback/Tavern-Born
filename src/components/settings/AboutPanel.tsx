import { Books, Code, GithubLogo, Globe, Heart, Info } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const TECH_STACK = [
  { icon: Code, label: 'Electron + React 18' },
  { icon: Books, label: 'Radix UI + Tailwind CSS v4' },
]

export function AboutPanel() {
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.electronAPI
      ?.getAppVersion()
      .then(setAppVersion)
      .catch(() => {
        // Version display is best-effort; silence is intentional.
      })
  }, [])

  const infoRows = [
    { label: 'Version', value: appVersion || '—' },
    { label: 'License', value: 'GPL-3.0' },
    { label: 'Platform', value: 'Electron (Desktop)' },
  ]

  return (
    <div className="space-y-6">
      {/* Hero card — profile-page style from material-tailwind */}
      <Card className="w-full overflow-hidden">
        {/* Gradient banner */}
        <div className="relative h-32 bg-gradient-to-br from-primary/30 via-accent/20 to-primary/10">
          <div className="absolute inset-0 bg-[url('/assets/images/ui/logo.png')] bg-no-repeat bg-right-bottom opacity-10 bg-contain" />
        </div>

        {/* Logo + name pulled up over banner */}
        <CardContent className="pt-0 pb-6 px-6">
          <div className="-mt-10 flex items-end gap-4 mb-4">
            <div className="h-20 w-20 rounded-2xl border-4 border-card bg-card shadow-lg flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="/assets/images/ui/logo.png"
                alt="Tavern Born"
                className="h-16 w-16 object-contain"
              />
            </div>
            <div className="pb-1">
              <h2 className="text-xl font-display font-bold">Tavern Born</h2>
              <p className="text-sm text-muted-foreground">D&amp;D 5e Character Manager</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            A desktop app for building and managing D&amp;D 5th Edition characters. Create
            characters, manage spells and equipment, and explore options across all published
            sources.
          </p>

          <Separator className="mb-4" />

          {/* Info rows — inspired by material-tailwind ProfileInfoCard */}
          <ul className="space-y-2.5">
            {infoRows.map(({ label, value }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="w-28 font-semibold text-foreground shrink-0">{label}:</span>
                <span className="text-muted-foreground">{value}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Two-column grid — tech + links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Built with */}
        <Card className="w-full">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-primary" weight="duotone" />
              <CardTitle className="text-base">Built With</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5 pb-5 px-6">
            <ul className="space-y-3">
              {TECH_STACK.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <Icon className="h-4 w-4 text-primary" weight="duotone" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Links */}
        <Card className="w-full">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" weight="duotone" />
              <CardTitle className="text-base">Links</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-5 pb-5 px-6">
            <ul className="space-y-3">
              <li>
                <a
                  href="https://github.com/kevinkickback/Tavern-Born"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0 group-hover:bg-primary/20 transition-colors">
                    <GithubLogo className="h-4 w-4 text-primary" weight="duotone" />
                  </span>
                  GitHub Repository
                </a>
              </li>
              <li>
                <a
                  href="https://kevinkickback.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Globe className="h-4 w-4 text-primary" weight="duotone" />
                  </span>
                  KevinKickback.com
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Footer credit */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pb-2">
        <span>Made with</span>
        <Heart className="h-3.5 w-3.5 text-pink-500" weight="fill" />
        <span>for the D&amp;D community</span>
      </div>
    </div>
  )
}
