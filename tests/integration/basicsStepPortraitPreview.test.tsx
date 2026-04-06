import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BasicsStep } from '@/components/character/wizard/steps/1-BasicsStep';
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants';

const previewSpy = vi.hoisted(() => vi.fn());

vi.mock('@/components/character/PortraitCardPreview', () => ({
    PortraitCardPreview: (props: Record<string, unknown>) => {
        previewSpy(props);
        return <div data-testid="portrait-card-preview-mock" />;
    },
}));

const baseData = {
    name: 'Aelar',
    gender: 'Male',
    race: '',
    raceSource: '',
    subrace: '',
    subraceSource: '',
    class: '',
    classSource: '',
    background: '',
    backgroundSource: '',
    abilityScoreMethod: 'pointBuy',
    abilityScores: {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
    },
    portrait: '/portrait.png',
    portraitTransform: { ...DEFAULT_PORTRAIT_TRANSFORM },
    rulesMode: 'legacy',
    allowedSources: [],
    raceAsiChoices: [],
    variantRules: {
        optionalClassFeatures: false,
        averageHitPoints: true,
    },
};

describe('BasicsStep portrait preview wiring', () => {
    beforeEach(() => {
        previewSpy.mockClear();
    });

    afterEach(() => {
        cleanup();
    });

    test('passes placeholder card metadata and current transform to PortraitCardPreview', () => {
        render(
            <BasicsStep
                data={baseData}
                onChange={vi.fn()}
                invalidFields={new Set()}
            />,
        );

        expect(screen.getByTestId('portrait-card-preview-mock')).toBeTruthy();
        expect(previewSpy).toHaveBeenCalledTimes(1);

        const props = previewSpy.mock.calls[0][0] as Record<string, unknown>;

        expect(props.image).toBe('/portrait.png');
        expect(props.name).toBe('Aelar');
        expect(props.level).toBe(1);
        expect(props.race).toBe('Race');
        expect(props.characterClass).toBe('Class');
        expect(props.gender).toBe('Male');
        expect(props.transform).toEqual(DEFAULT_PORTRAIT_TRANSFORM);
        expect(props.className).toBe('mx-auto max-w-xl xl:max-w-none');
        expect(typeof props.lastModified).toBe('string');
        expect(Number.isNaN(Date.parse(String(props.lastModified)))).toBe(false);
    });

    test('uses default portrait transform when wizard data does not provide one', () => {
        const dataWithoutTransform = {
            ...baseData,
            portraitTransform: undefined,
        };

        render(
            <BasicsStep
                data={dataWithoutTransform as unknown as typeof baseData}
                onChange={vi.fn()}
                invalidFields={new Set()}
            />,
        );

        expect(previewSpy).toHaveBeenCalledTimes(1);

        const props = previewSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(props.transform).toEqual(DEFAULT_PORTRAIT_TRANSFORM);
    });
});
