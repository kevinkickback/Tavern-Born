export type AdditionalSpellItem =
  | string
  | { choose: string | { from: string[]; count?: number }; count?: number }
export type AdditionalSpellSchedule = Record<
  string,
  | AdditionalSpellItem[]
  | {
      _?: AdditionalSpellItem[]
      will?: AdditionalSpellItem[]
      ritual?: AdditionalSpellItem[]
      daily?: Record<string, AdditionalSpellItem[]>
      rest?: Record<string, AdditionalSpellItem[]>
    }
>
export interface AdditionalSpellBlock {
  name?: string
  innate?: AdditionalSpellSchedule
  known?: AdditionalSpellSchedule
  prepared?: AdditionalSpellSchedule
  expanded?: Record<string, string[]>
  ability?: string | { choose: string[] }
}
