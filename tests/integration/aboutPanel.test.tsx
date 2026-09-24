import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AboutPanel } from '@/components/settings/AboutPanel'

describe('About panel', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('shows official SRD attribution without the internal transformation note', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('electronAPI', {
      getAppVersion: vi.fn(async () => '0.5.0'),
      getBundledManifest: vi.fn(async () => ({
        schemaVersion: 1,
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.0',
        distributionStatus: 'approved-for-distribution',
        documents: [
          {
            version: '5.1',
            landingPage: 'https://example.com/srd',
            downloadUrl: 'https://example.com/srd-5.1.pdf',
            attribution: 'Official test attribution.',
          },
        ],
        license: {
          name: 'Creative Commons Attribution 4.0 International',
          identifier: 'CC-BY-4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
        },
        transformationNotice: 'Internal transformation note.',
      })),
    })

    render(
      <MemoryRouter>
        <AboutPanel />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('SRD Attribution')).toBeTruthy())
    expect(
      screen.getByRole('button', { name: 'SRD Attribution' }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(
      screen
        .getByRole('button', { name: 'Character Sheet PDF Attribution' })
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(screen.queryByRole('link', { name: 'MorePurpleMoreBetter (Joost Wijnen)' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'SRD Attribution' }))
    await user.click(screen.getByRole('button', { name: 'Character Sheet PDF Attribution' }))
    expect(screen.getByText('Official test attribution.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View the official SRD 5.1' })).toBeTruthy()
    expect(
      screen.getByRole('link', {
        name: 'Creative Commons Attribution 4.0 International',
      }),
    ).toBeTruthy()
    expect(screen.queryByText('Internal transformation note.')).toBeNull()
    expect(screen.getByText('Character Sheet PDF Attribution')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'MorePurpleMoreBetter (Joost Wijnen)' })
        .getAttribute('href'),
    ).toBe('https://www.flapkan.com/')
    expect(screen.getByRole('link', { name: 'Lost Loot (u/Beaoudix)' }).getAttribute('href')).toBe(
      'https://www.reddit.com/r/DnD/comments/1e5apxk/dd_5e24_new_character_sheets/',
    )
    expect(document.body.textContent).toContain('Free D&D 5E24 character-sheet replica created by')
    expect(document.getElementById('character-sheet-pdf-2014-official')).toBeTruthy()
    expect(document.getElementById('character-sheet-pdf-2024-custom')).toBeTruthy()
  })

  test('opens PDF credits when arriving from a sheet attribution link', () => {
    render(
      <MemoryRouter initialEntries={['/settings?section=about#character-sheet-pdf-2024-custom']}>
        <AboutPanel />
      </MemoryRouter>,
    )
    expect(
      screen
        .getByRole('button', { name: 'Character Sheet PDF Attribution' })
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(screen.getByRole('link', { name: 'Lost Loot (u/Beaoudix)' })).toBeTruthy()
  })
})
