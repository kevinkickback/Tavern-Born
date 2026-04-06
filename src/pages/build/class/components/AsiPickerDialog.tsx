import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ABILITY_OPTIONS = [
  { value: 'strength', label: 'Strength' },
  { value: 'dexterity', label: 'Dexterity' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'intelligence', label: 'Intelligence' },
  { value: 'wisdom', label: 'Wisdom' },
  { value: 'charisma', label: 'Charisma' },
];

export interface AsiPickerDialogProps {
  open: boolean;
  level: number;
  existingChanges?: Record<string, 1 | 2>;
  onApply: (changes: Record<string, 1 | 2>) => void;
  onClose: () => void;
}

export function AsiPickerDialog({
  open,
  level,
  existingChanges,
  onApply,
  onClose,
}: AsiPickerDialogProps) {
  const [ability1, setAbility1] = useState('');
  const [bonus1, setBonus1] = useState<'1' | '2'>('2');
  const [ability2, setAbility2] = useState('');

  useEffect(() => {
    const keys = existingChanges ? Object.keys(existingChanges) : [];
    const values = existingChanges ? Object.values(existingChanges) : [];
    setAbility1(keys[0] ?? '');
    setBonus1(values[0] === 1 ? '1' : '2');
    setAbility2(keys.length > 1 ? (keys[1] ?? '') : '');
  }, [existingChanges]);

  const showAbility2 = bonus1 === '1';

  const canApply = useMemo(
    () =>
      !!ability1 && (!showAbility2 || (!!ability2 && ability2 !== ability1)),
    [ability1, showAbility2, ability2],
  );

  const handleApply = () => {
    if (!ability1) return;

    const changes: Record<string, 1 | 2> = {
      [ability1]: Number.parseInt(bonus1, 10) as 1 | 2,
    };

    if (showAbility2) {
      if (!ability2 || ability2 === ability1) return;
      changes[ability2] = 1;
    }

    onApply(changes);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ability Score Increase - Level {level}</DialogTitle>
          <DialogDescription>
            Increase one ability by +2, or two different abilities by +1 each.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select value={ability1} onValueChange={setAbility1}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Ability" />
                </SelectTrigger>
                <SelectContent>
                  {ABILITY_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-20">
              <Select
                value={bonus1}
                onValueChange={(value) => setBonus1(value as '1' | '2')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2" className="text-xs">
                    +2
                  </SelectItem>
                  <SelectItem value="1" className="text-xs">
                    +1
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showAbility2 && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Select value={ability2} onValueChange={setAbility2}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Second ability" />
                  </SelectTrigger>
                  <SelectContent>
                    {ABILITY_OPTIONS.filter(
                      (option) => option.value !== ability1,
                    ).map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-xs"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-20">
                <div className="h-8 flex items-center justify-center text-xs text-muted-foreground border rounded-md bg-muted/30">
                  +1
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canApply} onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
