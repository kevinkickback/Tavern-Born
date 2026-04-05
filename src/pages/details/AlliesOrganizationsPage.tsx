import { Plus, Trash, Users } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import { RichTextArea } from '@/components/editor/RichTextArea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCharacterStore } from '@/store/characterStore';
import type { Ally } from '@/types/character';

export function AlliesOrganizationsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter);
  const updateActiveCharacterDetails = useCharacterStore(
    (state) => state.updateActiveCharacterDetails,
  );

  const [faction, setFaction] = useState(
    activeCharacter?.details?.faction || '',
  );
  const [rank, setRank] = useState(activeCharacter?.details?.rank || '');
  const [factionNotes, setFactionNotes] = useState(
    activeCharacter?.details?.factionNotes || '',
  );
  const [patron, setPatron] = useState(activeCharacter?.details?.patron || '');
  const [patronDetails, setPatronDetails] = useState(
    activeCharacter?.details?.patronDetails || '',
  );
  const [nemesis, setNemesis] = useState(
    activeCharacter?.details?.nemesis || '',
  );
  const [allies, setAllies] = useState<Ally[]>(
    activeCharacter?.details?.allies || [],
  );
  const factionId = useId();
  const rankId = useId();
  const factionNotesId = useId();
  const patronId = useId();
  const patronDetailsId = useId();
  const nemesisId = useId();

  useEffect(() => {
    if (activeCharacter?.details) {
      setFaction(activeCharacter.details.faction || '');
      setRank(activeCharacter.details.rank || '');
      setFactionNotes(activeCharacter.details.factionNotes || '');
      setPatron(activeCharacter.details.patron || '');
      setPatronDetails(activeCharacter.details.patronDetails || '');
      setNemesis(activeCharacter.details.nemesis || '');
      setAllies(activeCharacter.details.allies || []);
    }
  }, [activeCharacter]);

  const updateDraftDetails = (updates: Record<string, unknown>) => {
    updateActiveCharacterDetails(updates);
  };

  const addAlly = () => {
    const nextAllies = [
      ...allies,
      {
        id: Date.now().toString(),
        name: '',
        relationship: '',
        description: '',
      },
    ];

    setAllies(nextAllies);
    updateDraftDetails({ allies: nextAllies });
  };

  const removeAlly = (id: string) => {
    const nextAllies = allies.filter((ally) => ally.id !== id);
    setAllies(nextAllies);
    updateDraftDetails({ allies: nextAllies });
  };

  const updateAlly = (id: string, field: keyof Ally, value: string) => {
    const nextAllies = allies.map((ally) =>
      ally.id === id ? { ...ally, [field]: value } : ally,
    );

    setAllies(nextAllies);
    updateDraftDetails({ allies: nextAllies });
  };

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold mb-2">
            No Character Selected
          </h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their allies and
            organizations.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-4xl font-bold mb-2">
          Allies & Organizations
        </h1>
        <p className="text-muted-foreground">
          Track your character's relationships, allies, and organizational
          affiliations
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div>
            <Label
              htmlFor={factionId}
              className="mb-2 block flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Primary Faction / Organization
            </Label>
            <Input
              id={factionId}
              value={faction}
              onChange={(e) => {
                const value = e.target.value;
                setFaction(value);
                updateDraftDetails({ faction: value });
              }}
              placeholder="e.g., Harpers, Zhentarim, None"
            />
          </div>

          <div>
            <Label htmlFor={rankId} className="mb-2 block">
              Rank / Title
            </Label>
            <Input
              id={rankId}
              value={rank}
              onChange={(e) => {
                const value = e.target.value;
                setRank(value);
                updateDraftDetails({ rank: value });
              }}
              placeholder="e.g., Initiate, Member, Agent"
            />
          </div>

          <RichTextArea
            id={factionNotesId}
            label="Faction Notes"
            value={factionNotes}
            onChange={(value) => {
              setFactionNotes(value);
              updateDraftDetails({ factionNotes: value });
            }}
            placeholder="Details about your standing and activities within the organization..."
            rows={4}
          />
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor={patronId} className="mb-2 block">
              Patron / Mentor
            </Label>
            <Input
              id={patronId}
              value={patron}
              onChange={(e) => {
                const value = e.target.value;
                setPatron(value);
                updateDraftDetails({ patron: value });
              }}
              placeholder="Who guides or sponsors your character?"
            />
          </div>

          <RichTextArea
            id={patronDetailsId}
            label="Patron Details"
            value={patronDetails}
            onChange={(value) => {
              setPatronDetails(value);
              updateDraftDetails({ patronDetails: value });
            }}
            placeholder="Describe your relationship with your patron..."
            rows={4}
          />

          <div>
            <Label htmlFor={nemesisId} className="mb-2 block">
              Nemesis / Rival
            </Label>
            <Input
              id={nemesisId}
              value={nemesis}
              onChange={(e) => {
                const value = e.target.value;
                setNemesis(value);
                updateDraftDetails({ nemesis: value });
              }}
              placeholder="Who opposes your character?"
            />
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Label className="text-lg font-semibold">Allies & Contacts</Label>
          <Button onClick={addAlly} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Ally
          </Button>
        </div>

        {allies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No allies or contacts added yet</p>
            <Button
              onClick={addAlly}
              size="sm"
              variant="outline"
              className="mt-3"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Ally
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {allies.map((ally) => (
              <Card key={ally.id} className="p-4 space-y-3 bg-muted/30">
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid md:grid-cols-2 gap-4">
                    <div>
                      <Label
                        htmlFor={`ally-name-${ally.id}`}
                        className="text-sm mb-1 block"
                      >
                        Name
                      </Label>
                      <Input
                        id={`ally-name-${ally.id}`}
                        placeholder="Ally name"
                        value={ally.name}
                        onChange={(e) =>
                          updateAlly(ally.id, 'name', e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`ally-relationship-${ally.id}`}
                        className="text-sm mb-1 block"
                      >
                        Relationship
                      </Label>
                      <Input
                        id={`ally-relationship-${ally.id}`}
                        placeholder="e.g., Friend, Contact, Guild Member"
                        value={ally.relationship}
                        onChange={(e) =>
                          updateAlly(ally.id, 'relationship', e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAlly(ally.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
                <RichTextArea
                  id={`ally-description-${ally.id}`}
                  label="Description"
                  value={ally.description}
                  onChange={(value) =>
                    updateAlly(ally.id, 'description', value)
                  }
                  placeholder="Describe this ally and your relationship..."
                  rows={2}
                />
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
