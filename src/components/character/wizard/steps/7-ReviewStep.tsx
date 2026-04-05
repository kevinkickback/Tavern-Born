import { UserCircle, Warning } from '@phosphor-icons/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type AbilityName,
  formatModifier,
  getRaceAbilityData,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores';
import { getAbilityModifier } from '@/lib/calculations/gameRules';
import { cn } from '@/lib/utils';
import { useGameDataStore } from '@/store/gameDataStore';
import type { CharacterWizardData } from '../types';

interface ReviewStepProps {
  data: CharacterWizardData;
}

function InfoRow({
  label,
  value,
  warn,
}: {
  label: string;
  value?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span
        className={cn(
          'text-xs text-muted-foreground shrink-0',
          warn && 'text-destructive',
        )}
      >
        {label}
        {warn && <Warning className="inline ml-1 h-3 w-3" />}
      </span>
      <span
        className={cn(
          'text-sm font-semibold text-right truncate',
          !value && 'text-muted-foreground italic font-normal',
        )}
      >
        {value || 'Not set'}
      </span>
    </div>
  );
}

export function ReviewStep({ data }: ReviewStepProps) {
  const gameData = useGameDataStore((s) => s.gameData);

  const missingFields: string[] = [];
  if (!data.name) missingFields.push('Name');
  if (!data.race) missingFields.push('Race');
  if (!data.class) missingFields.push('Class');
  if (!data.background) missingFields.push('Background');

  const raceObj = (gameData?.races ?? []).find(
    (r) =>
      r.name === data.race &&
      (!data.raceSource || r.source === data.raceSource),
  );
  const subraceObj = raceObj?.subraces?.find((sr) => sr.name === data.subrace);
  const raceAsiData = getRaceAbilityData(raceObj, subraceObj);
  const racialBonuses: Partial<Record<AbilityName, number>> = {};
  for (const fb of raceAsiData.fixed) {
    racialBonuses[fb.ability] = (racialBonuses[fb.ability] ?? 0) + fb.value;
  }
  for (const [blockIdx, block] of raceAsiData.choices.entries()) {
    for (const raw of data.raceAsiChoices?.[blockIdx] ?? []) {
      const ab = normalizeAbilityName(raw);
      if (ab) racialBonuses[ab] = (racialBonuses[ab] ?? 0) + block.amount;
    }
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {missingFields.length > 0 && (
        <Alert variant="destructive" className="shrink-0 py-2">
          <Warning className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Missing: {missingFields.join(', ')}. You can configure these after
            creation.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="w-[160px] shrink-0 flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0 max-h-[260px] rounded-lg overflow-hidden border border-border relative bg-muted/10">
            {data.portrait ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${data.portrait})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center top',
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <UserCircle
                  className="h-16 w-16 text-muted-foreground/20"
                  weight="thin"
                />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-card/95 via-card/50 to-transparent px-2 pb-2 pt-6">
              <div className="font-display text-sm font-bold leading-tight">
                {data.name || (
                  <span className="text-muted-foreground italic font-normal text-xs">
                    Unnamed
                  </span>
                )}
              </div>
              {data.gender && (
                <div className="text-[10px] text-muted-foreground">
                  {data.gender}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="w-[190px] shrink-0 flex flex-col min-h-0">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Character
          </div>
          <div className="flex-1 bg-muted/10 rounded-lg border border-border px-3 py-1">
            <InfoRow
              label="Race"
              value={[data.race, data.subrace].filter(Boolean).join(' \u2022 ')}
              warn={!data.race}
            />
            <InfoRow label="Class" value={data.class} warn={!data.class} />
            <InfoRow
              label="Background"
              value={data.background}
              warn={!data.background}
            />
            <InfoRow
              label="Score Method"
              value={data.abilityScoreMethod?.replace(/-/g, ' ')}
            />
            {data.gender && <InfoRow label="Gender" value={data.gender} />}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Ability Scores
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-3 gap-2 max-h-[280px]">
            {ABILITY_NAMES.map((ability) => {
              const base =
                (data.abilityScores?.[ability] as number | undefined) ?? 8;
              const bonus = racialBonuses[ability] ?? 0;
              const total = base + bonus;
              const mod = getAbilityModifier(total);
              return (
                <div
                  key={ability}
                  className="border rounded-lg bg-card/50 border-border flex flex-col items-center justify-center gap-0.5 p-2"
                >
                  <div className="text-[10px] font-bold text-accent uppercase tracking-wider">
                    {ABILITY_ABBREVIATIONS[ability]}
                  </div>
                  <div className="text-2xl font-bold font-mono leading-none">
                    {total}
                  </div>
                  {bonus !== 0 && (
                    <div className="text-[10px] text-emerald-500 font-semibold leading-none">
                      {base}+{bonus}
                    </div>
                  )}
                  <div
                    className={cn(
                      'text-sm font-semibold',
                      mod >= 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {formatModifier(mod)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
