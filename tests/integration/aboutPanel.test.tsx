import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AboutPanel } from '@/components/settings/AboutPanel'

describe('About panel', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('shows official SRD attribution without the internal transformation note', async () => {
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

    render(<AboutPanel />)

    await waitFor(() => expect(screen.getByText('SRD Attribution')).toBeTruthy())
    expect(screen.getByText('Official test attribution.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View the official SRD 5.1' })).toBeTruthy()
    expect(
      screen.getByRole('link', {
        name: 'Creative Commons Attribution 4.0 International',
      }),
    ).toBeTruthy()
    expect(screen.queryByText('Internal transformation note.')).toBeNull()
  })
})
