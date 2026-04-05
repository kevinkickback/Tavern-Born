import { Sparkle } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import { RichTextArea } from '@/components/editor/RichTextArea';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCharacterStore } from '@/store/characterStore';

export function CharacteristicsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter);
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  );

  const [alignment, setAlignment] = useState(
    activeCharacter?.details?.alignment || '',
  );
  const [faith, setFaith] = useState(activeCharacter?.details?.faith || '');
  const [lifestyle, setLifestyle] = useState(
    activeCharacter?.details?.lifestyle || '',
  );
  const [personalityTraits, setPersonalityTraits] = useState(
    activeCharacter?.details?.personalityTraits || '',
  );
  const [ideals, setIdeals] = useState(activeCharacter?.details?.ideals || '');
  const [bonds, setBonds] = useState(activeCharacter?.details?.bonds || '');
  const [flaws, setFlaws] = useState(activeCharacter?.details?.flaws || '');
  const [goals, setGoals] = useState(activeCharacter?.details?.goals || '');
  const [fears, setFears] = useState(activeCharacter?.details?.fears || '');
  const alignmentId = useId();
  const faithId = useId();
  const lifestyleId = useId();
  const personalityTraitsId = useId();
  const idealsId = useId();
  const bondsId = useId();
  const flawsId = useId();
  const goalsId = useId();
  const fearsId = useId();

  useEffect(() => {
    if (activeCharacter?.details) {
      setAlignment(activeCharacter.details.alignment || '');
      setFaith(activeCharacter.details.faith || '');
      setLifestyle(activeCharacter.details.lifestyle || '');
      setPersonalityTraits(activeCharacter.details.personalityTraits || '');
      setIdeals(activeCharacter.details.ideals || '');
      setBonds(activeCharacter.details.bonds || '');
      setFlaws(activeCharacter.details.flaws || '');
      setGoals(activeCharacter.details.goals || '');
      setFears(activeCharacter.details.fears || '');
    }
  }, [activeCharacter]);

  const alignments = [
    'Lawful Good',
    'Neutral Good',
    'Chaotic Good',
    'Lawful Neutral',
    'True Neutral',
    'Chaotic Neutral',
    'Lawful Evil',
    'Neutral Evil',
    'Chaotic Evil',
  ];

  const updateDraftDetails = (updates: Record<string, unknown>) => {
    updateActiveCharacterDetails(updates);
  };

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Sparkle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold mb-2">
            No Character Selected
          </h2>
          <p className="text-muted-foreground">
            Please select or create a character to edit their characteristics.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">
          Characteristics
        </h1>
        <p className="text-muted-foreground">
          Define your character's personality and beliefs
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div>
            <Label
              htmlFor={alignmentId}
              className="mb-2 block flex items-center gap-2"
            >
              <Sparkle className="h-4 w-4" weight="fill" />
              Alignment
            </Label>
            <Select
              value={alignment}
              onValueChange={(value) => {
                setAlignment(value);
                updateDraftDetails({ alignment: value });
              }}
            >
              <SelectTrigger id={alignmentId}>
                <SelectValue placeholder="Select alignment" />
              </SelectTrigger>
              <SelectContent>
                {alignments.map((align) => (
                  <SelectItem
                    key={align}
                    value={align.toLowerCase().replace(' ', '-')}
                  >
                    {align}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor={faithId} className="mb-2 block">
              Faith / Deity
            </Label>
            <Input
              id={faithId}
              value={faith}
              onChange={(e) => {
                const value = e.target.value;
                setFaith(value);
                updateDraftDetails({ faith: value });
              }}
              placeholder="e.g., Bahamut, Pelor, None"
            />
          </div>

          <div>
            <Label htmlFor={lifestyleId} className="mb-2 block">
              Lifestyle
            </Label>
            <Select
              value={lifestyle}
              onValueChange={(value) => {
                setLifestyle(value);
                updateDraftDetails({ lifestyle: value });
              }}
            >
              <SelectTrigger id={lifestyleId}>
                <SelectValue placeholder="Select lifestyle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wretched">Wretched</SelectItem>
                <SelectItem value="squalid">Squalid</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
                <SelectItem value="modest">Modest</SelectItem>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="wealthy">Wealthy</SelectItem>
                <SelectItem value="aristocratic">Aristocratic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={personalityTraitsId}
            label="Personality Traits"
            value={personalityTraits}
            onChange={(value) => {
              setPersonalityTraits(value);
              updateDraftDetails({ personalityTraits: value });
            }}
            placeholder="Describe your character's personality traits in plain language."
            rows={4}
          />

          <RichTextArea
            id={idealsId}
            label="Ideals"
            value={ideals}
            onChange={(value) => {
              setIdeals(value);
              updateDraftDetails({ ideals: value });
            }}
            placeholder="What does your character believe in? (e.g., Justice, Freedom, Honor)"
            rows={3}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={bondsId}
            label="Bonds"
            value={bonds}
            onChange={(value) => {
              setBonds(value);
              updateDraftDetails({ bonds: value });
            }}
            placeholder="What ties bind your character to the world?"
            rows={4}
          />

          <RichTextArea
            id={flawsId}
            label="Flaws"
            value={flaws}
            onChange={(value) => {
              setFlaws(value);
              updateDraftDetails({ flaws: value });
            }}
            placeholder="What weaknesses does your character have?"
            rows={3}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <RichTextArea
            id={goalsId}
            label="Goals & Motivations"
            value={goals}
            onChange={(value) => {
              setGoals(value);
              updateDraftDetails({ goals: value });
            }}
            placeholder="What drives your character forward?"
            rows={4}
          />

          <RichTextArea
            id={fearsId}
            label="Fears & Phobias"
            value={fears}
            onChange={(value) => {
              setFears(value);
              updateDraftDetails({ fears: value });
            }}
            placeholder="What does your character fear? (e.g., dragons, darkness)"
            rows={3}
          />
        </Card>
      </div>
    </div>
  );
}
