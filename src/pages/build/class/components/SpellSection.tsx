import { MagicWand } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { formatSpellLevel } from '@/lib/calculations/spellUtils';
import type { Spell5e } from '@/types/5etools';
import type { SelectedFeatureState } from './DetailsPanel';

interface SpellGain {
  cantrips: number;
  spells: number;
  maxSpellLevel: number;
}

interface BuildClassSpellSectionProps {
  level: number;
  spellGain: SpellGain;
  chosenNames: string[];
  spellByName: Map<string, Spell5e>;
  detailCollapsed: boolean;
  onOpenSpellPicker: (level: number) => void;
  onSelectFeature: (feature: SelectedFeatureState) => void;
  onExpandDetails: () => void;
  getOrdinalForm: (n: number) => string;
}

export function BuildClassSpellSection({
  level,
  spellGain,
  chosenNames,
  spellByName,
  detailCollapsed,
  onOpenSpellPicker,
  onSelectFeature,
  onExpandDetails,
  getOrdinalForm,
}: BuildClassSpellSectionProps) {
  return (
    <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <MagicWand
            className="h-4 w-4 text-accent-secondary flex-shrink-0"
            weight="duotone"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Spell Selection</div>
            <div className="text-xs text-muted-foreground">
              {[
                spellGain.cantrips > 0 &&
                  `${spellGain.cantrips} cantrip${spellGain.cantrips > 1 ? 's' : ''}`,
                spellGain.spells > 0 &&
                  `${spellGain.spells} spell${spellGain.spells > 1 ? 's' : ''}${spellGain.maxSpellLevel > 0 ? ` (up to ${getOrdinalForm(spellGain.maxSpellLevel)}-level)` : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
        <Button
          variant={chosenNames.length > 0 ? 'outline' : 'default'}
          size="sm"
          className="flex-shrink-0 ml-2 h-7 text-xs"
          onClick={() => onOpenSpellPicker(level)}
        >
          {chosenNames.length > 0 ? 'Edit' : 'Choose'}
        </Button>
      </div>
      {chosenNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-accent-secondary/20 pt-2">
          {chosenNames.map((name) => {
            const spell = spellByName.get(name);
            return (
              <button
                key={spell ? `${spell.name}|${spell.source ?? ''}` : name}
                type="button"
                onMouseEnter={() => {
                  if (!spell) return;
                  onSelectFeature({
                    name: spell.name,
                    source: spell.source,
                    entries: spell.entries ?? [],
                  });
                  if (detailCollapsed) onExpandDetails();
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-accent-secondary/30 bg-accent-secondary/5 hover:border-accent-secondary/50 hover:bg-accent-secondary/15 text-foreground transition-colors"
              >
                <span className="font-medium">{name}</span>
                {spell && (
                  <span className="text-muted-foreground opacity-80">
                    {formatSpellLevel(spell.level)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
