import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import type { Feat5e } from '@/types/5etools'

vi.mock('@/hooks/data/useFilteredGameData', () => ({
    useFilteredGameData: () => ({
        spells: [
            {
                name: 'Guidance',
                source: 'PHB',
                level: 0,
                school: 'D',
                classes: { fromClassList: [{ name: 'Cleric', source: 'PHB' }] },
            },
            {
                name: 'Light',
                source: 'PHB',
                level: 0,
                school: 'E',
                classes: { fromClassList: [{ name: 'Cleric', source: 'PHB' }] },
            },
        ],
        optionalfeatures: [],
    }),
}))

const magicInitiate = {
    name: 'Magic Initiate',
    source: 'XPHB',
    additionalSpells: [
        { name: 'Cleric Spells', known: { _: [{ choose: 'level=0|class=Cleric', count: 2 }] } },
        { name: 'Druid Spells', known: { _: [{ choose: 'level=0|class=Druid', count: 2 }] } },
        { name: 'Wizard Spells', known: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] } },
    ],
} as Feat5e

describe('FeatOptionsModal fixed spellcasting class', () => {
    afterEach(cleanup)

    test('skips a fixed class step and preserves the class when finishing', () => {
        const onFinish = vi.fn()
        render(
            <FeatOptionsModal
                open
                onOpenChange={vi.fn()}
                feat={magicInitiate}
                initialSelections={{
                    spellcastingClass: 'Wizard Spells',
                    spells: ['Mage Hand|PHB', 'Minor Illusion|PHB'],
                }}
                fixedSpellcastingClass="Cleric Spells"
                onFinish={onFinish}
            />,
        )

        expect(screen.queryByRole('combobox')).toBeNull()
        expect(screen.getByText(/Choose 2 Cleric cantrips/)).toBeTruthy()
        expect(screen.getByText(/Step 1 of 1/)).toBeTruthy()
        expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(true)

        for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox)
        fireEvent.click(screen.getByRole('button', { name: /Finish/ }))

        expect(onFinish).toHaveBeenCalledWith({
            spellcastingClass: 'Cleric Spells',
            spells: ['Guidance|PHB', 'Light|PHB'],
        })
    })

    test('leaves the class selector enabled for a freely selected feat', () => {
        render(<FeatOptionsModal open onOpenChange={vi.fn()} feat={magicInitiate} onFinish={vi.fn()} />)

        const selector = screen.getByRole('combobox')
        expect(selector.getAttribute('data-disabled')).toBeNull()
        expect(selector.textContent).toContain('Select a class')
    })

    test('falls back to the class selector when a fixed class is invalid', () => {
        render(
            <FeatOptionsModal
                open
                onOpenChange={vi.fn()}
                feat={magicInitiate}
                fixedSpellcastingClass="Bard Spells"
                onFinish={vi.fn()}
            />,
        )

        expect(screen.getByRole('combobox').getAttribute('data-disabled')).toBeNull()
    })
})
