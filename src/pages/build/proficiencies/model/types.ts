export type ProfFocus =
  | {
      type: 'skill';
      name: string;
      ability: string;
      proficient: boolean;
      expertise: boolean;
      modifierString: string;
    }
  | {
      type: 'save';
      ability: string;
      proficient: boolean;
      modifierString: string;
    }
  | { type: 'item'; category: string; name: string };
