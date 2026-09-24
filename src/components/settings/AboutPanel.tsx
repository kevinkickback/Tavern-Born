import { Books, Code, GithubLogo, Globe, Heart } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Section } from '@/components/workspace'
import { getBundledFileUrl } from '@/lib/assetUrls'
import {
  CHARACTER_SHEET_TEMPLATES,
  getCharacterSheetAttributionAnchor,
} from '@/lib/pdf/characterSheetTemplates'
import type { CharacterSheetTemplate } from '@/lib/pdf/types'

type BundledManifest = Awaited<ReturnType<Window['electronAPI']['getBundledManifest']>>

const TECH_STACK = [
  { icon: Code, label: 'Electron + React 19' },
  { icon: Books, label: 'Radix UI + Tailwind CSS v4' },
]

export function AboutPanel() {
  const location = useLocation()
  const [appVersion, setAppVersion] = useState('')
  const [srdManifest, setSrdManifest] = useState<BundledManifest | null>(null)

  useEffect(() => {
    window.electronAPI
      ?.getAppVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  useEffect(() => {
    const getBundledManifest = window.electronAPI?.getBundledManifest
    if (!getBundledManifest) return

    let active = true
    getBundledManifest()
      .then((manifest) => {
        if (active) setSrdManifest(manifest)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const infoRows = [
    { label: 'Version', value: appVersion || '—' },
    { label: 'License', value: 'GPL-3.0' },
    { label: 'Platform', value: 'Electron desktop application' },
  ]

  return (
    <div className="@container">
      <Section className="pt-0 pb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-sidebar">
            <img
              src={getBundledFileUrl('assets/images/ui/logo.png')}
              alt="Tavern Born"
              className="size-14 object-contain"
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold">Tavern Born</h2>
            <p className="text-sm text-muted-foreground">D&amp;D 5e Character Manager</p>
          </div>
          <dl className="grid gap-x-3 gap-y-1 text-sm @min-[640px]:ml-auto">
            {infoRows.map(({ label, value }) => (
              <div key={label} className="flex flex-wrap items-baseline gap-x-2">
                <dt className="font-medium">{label}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Build D&amp;D 5e characters, manage spells and equipment, and explore published content.
        </p>
      </Section>

      <Accordion
        key={location.hash}
        type="multiple"
        defaultValue={location.hash.startsWith('#character-sheet-pdf-') ? ['pdf'] : []}
        className="border-b border-border-subtle"
      >
        {srdManifest && (
          <AccordionItem value="srd">
            <AccordionTrigger className="py-3 font-semibold">SRD Attribution</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                {srdManifest.documents.map((document) => (
                  <p key={document.version}>
                    <span>{document.attribution}</span>{' '}
                    <a
                      href={document.landingPage}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      View the official SRD {document.version}
                    </a>
                  </p>
                ))}
                <p>
                  Available under the{' '}
                  <a
                    href={srdManifest.license.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    {srdManifest.license.name}
                  </a>
                  .
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="pdf">
          <AccordionTrigger className="py-3 font-semibold">
            Character Sheet PDF Attribution
          </AccordionTrigger>
          <AccordionContent>
            <ul className="grid gap-x-6 gap-y-3 text-sm leading-relaxed text-muted-foreground @min-[640px]:grid-cols-2">
              {CHARACTER_SHEET_TEMPLATES.map((template: CharacterSheetTemplate) => (
                <li
                  key={template.id}
                  id={getCharacterSheetAttributionAnchor(template.id)}
                  className="scroll-mt-5"
                >
                  <p className="font-medium text-foreground">{template.name}</p>
                  <p>
                    {template.attribution.credit}
                    {template.attribution.creatorName && template.attribution.creatorUrl && (
                      <>
                        {' '}
                        <a
                          href={template.attribution.creatorUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          {template.attribution.creatorName}
                        </a>
                        .
                      </>
                    )}
                  </p>
                  {template.attribution.notice && <p>{template.attribution.notice}</p>}
                </li>
              ))}
              <li className="@min-[640px]:col-span-2">
                <p className="font-medium text-foreground">Companion Sheet Form</p>
                <p>
                  Optional companion sheet.{' '}
                  <a
                    href="https://www.dmsguild.com/en/product/318155/companion-sheet-form"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Support the creator on DMs Guild.
                  </a>
                </p>
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="grid gap-x-6 @min-[640px]:grid-cols-2">
        <Section title="Built With" className="border-b-0 py-2">
          <ul className="space-y-1">
            {TECH_STACK.map(({ icon: StackIcon, label }) => (
              <li
                key={label}
                className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground"
              >
                <StackIcon className="size-4 text-primary" />
                {label}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Links" className="py-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
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
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Made with</span>
        <Heart className="size-3.5 text-pink-500" weight="fill" />
        <span>for the D&amp;D community</span>
      </div>
    </div>
  )
}
