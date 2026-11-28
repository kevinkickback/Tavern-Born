import { Heart, Scroll, Sword, Users } from '@phosphor-icons/react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useStore } from 'zustand'
import { ClassToAddSelect } from '@/components/character/ClassToAddSelect'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  getSelectedSubclassData,
  getSubclassSelectionInfo,
  resolveClassProgressionRules,
} from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { getPsionicKey } from '@/lib/5etools/psionics'
import { getCachedCharacterCalculationContext } from '@/lib/calculations/cachedCharacterCalculationContext'
import {
  checkMulticlassRequirements,
  getHitDiceFromClass,
  MAX_CHARACTER_LEVEL,
  rollDie,
} from '@/lib/calculations/gameRules'
import { isSubclassEligible } from '@/lib/calculations/subclassEligibility'
import { advanceClassLevel } from '@/lib/character/commands/advanceClassLevel'
import {
  getClassProgressionRestriction,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  getMysticDisciplineReplacementOptions,
  getMysticDisciplineSlotKey,
} from '@/lib/character/mysticDisciplineReplacement'
import {
  getCharacterClassEntries,
  getEffectiveMaxHP,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import { getClassIconUrl } from '@/lib/classIcons'
import { cn } from '@/lib/utils'
import {
  CharacterEditingContext,
  createCharacterEditingDraft,
} from '@/store/characterEditingContext'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Subclass5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { GuidedLevelChoices } from './GuidedLevelChoices'
import { GuidedLevelUpReview } from './GuidedLevelUpReview'

const classKey = ({ name, source }: Pick<CharacterClassEntry, 'name' | 'source'>) =>
  JSON.stringify([name, source])
const subclassKey = ({ name, source }: Subclass5e) => JSON.stringify([name, source])
const emptyEditor = createCharacterEditingDraft(null)

function ClassLevelTargets({
  candidates,
  selected,
  fixed = false,
  onSelect,
}: {
  candidates: { entry: CharacterClassEntry }[]
  selected?: CharacterClassEntry
  fixed?: boolean
  onSelect: (key: string) => void
}) {
  const selectedKey = selected && classKey(selected)
  return (
    <fieldset className="grid max-h-56 min-w-0 gap-1.5 overflow-y-auto px-0.5 py-0.5">
      <legend className="sr-only">Classes</legend>
      {candidates.map(({ entry }) => {
        const key = classKey(entry)
        const isSelected = key === selectedKey
        const icon = getClassIconUrl(entry.name)
        const contents = (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              {icon ? <img src={icon} alt="" className="size-5" /> : <Sword className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{entry.name}</span>
              <span className="block text-xs text-muted-foreground">{entry.source}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
              Level {entry.levels} → {entry.levels + 1}
            </span>
          </>
        )
        const className = cn(
          'flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors',
          isSelected ? 'border-primary/45 bg-primary/10' : 'border-border bg-workspace-pane',
        )
        return fixed ? (
          <div className={className} key={key}>
            {contents}
          </div>
        ) : (
          <button
            type="button"
            key={key}
            aria-pressed={isSelected}
            className={cn(
              className,
              'hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring',
            )}
            onClick={() => {
              if (!isSelected) onSelect(key)
            }}
          >
            {contents}
          </button>
        )
      })}
    </fieldset>
  )
}

export default function GuidedLevelUpWizard({ onClose }: { onClose: () => void }) {
  const active = useCharacterStore((state) => state.activeCharacter)
  const raw = useGameDataStore((state) => state.gameData)
  const filtered = useFilteredGameData()
  const [{ character, catalog }] = useState(() => ({ character: active, catalog: raw }))
  const [target, setTarget] = useState('')
  const [mode, setMode] = useState<'advance' | 'multiclass'>('advance')
  const [ignoreRequirements, setIgnoreRequirements] = useState(false)
  const [step, setStep] = useState<'setup' | 'subclass' | 'choices' | 'review'>('setup')
  const [editingSession, setEditingSession] = useState<{
    key: string
    store: ReturnType<typeof createCharacterEditingDraft>
  }>()
  const [roll, setRoll] = useState('')
  const [method, setMethod] = useState<'rolled' | 'manual'>('manual')
  const [subclass, setSubclass] = useState('')
  const [disciplineFrom, setDisciplineFrom] = useState('')
  const [disciplineTo, setDisciplineTo] = useState('')
  const rollId = useId()
  const ignoreRequirementsId = useId()
  const hasClass = !!character && getCharacterClassEntries(character).length > 0
  const invalidated = active !== character || raw !== catalog
  const atLevelCap = !!character && getTotalCharacterLevel(character) >= MAX_CHARACTER_LEVEL
  const totalLevel = character ? getTotalCharacterLevel(character) : 0
  const average = character?.variantRules?.averageHitPoints !== false
  const before = useMemo(
    () =>
      character ? getCachedCharacterCalculationContext(character, filtered, raw?.lookups) : null,
    [character, filtered, raw],
  )
  const options = useMemo(
    () =>
      (character ? getCharacterClassEntries(character) : []).flatMap((entry) => {
        const rules = resolveClassProgressionRules(entry, raw?.classes ?? filtered.classes)
        return rules ? [{ entry, rules }] : []
      }),
    [character, filtered.classes, raw],
  )
  const multiclasses = useMemo(() => {
    if (!before || !character || !getCharacterClassEntries(character).length) return []
    const seen = new Set<string>()
    return filtered.classes.flatMap((rules) => {
      const entry: CharacterClassEntry = { name: rules.name, source: rules.source, levels: 0 }
      const key = classKey(entry)
      if (
        rules.isSidekick ||
        seen.has(key) ||
        findClassReference(entry, character.classProgression)
      )
        return []
      seen.add(key)
      const requirement = checkMulticlassRequirements(rules, before.abilityScores.total)
      return [{ entry, rules, requirement }]
    })
  }, [before, character, filtered.classes])
  const selected =
    mode === 'advance'
      ? (options.find(({ entry }) => classKey(entry) === target) ?? options[0])
      : multiclasses.find(
          ({ entry, requirement }) =>
            classKey(entry) === target && (ignoreRequirements || requirement.meetsRequirements),
        )
  const hitDie = selected ? getHitDiceFromClass(selected.rules) : 0
  const enteredRoll = Number(roll)
  const validRoll = Number.isInteger(enteredRoll) && enteredRoll >= 1 && enteredRoll <= hitDie
  const hpReady = average || validRoll
  // An average gain lets the choices preview run before a manual result is entered on Review.
  const gainMethod = average || !validRoll ? 'average' : method
  const dieResult = gainMethod === 'average' ? Math.floor(hitDie / 2) + 1 : enteredRoll
  const disciplines = useMemo(
    () =>
      character && before && selected && mode === 'advance'
        ? getMysticDisciplineReplacementOptions(
            character,
            before.classChoices.catalogs,
            selected.entry.name,
            selected.entry.source,
            selected.entry.levels + 1,
          )
        : undefined,
    [before, character, mode, selected],
  )
  const outgoing = disciplines?.outgoing.find(
    (slot) => getMysticDisciplineSlotKey(slot) === disciplineFrom,
  )
  const incoming = disciplines?.incoming.find(
    (row) => getPsionicKey(row.name, row.source) === disciplineTo,
  )
  const replacementReady = !disciplineFrom || !!(outgoing?.current.source && incoming)
  const draft = useMemo(() => {
    if (
      !character ||
      !before ||
      invalidated ||
      !selected ||
      atLevelCap ||
      !Number.isInteger(dieResult) ||
      dieResult < 1 ||
      dieResult > hitDie
    )
      return null
    try {
      const classLevel = selected.entry.levels + 1
      const replacement =
        outgoing?.current.source && incoming
          ? {
              choiceId: outgoing.selection.choiceId,
              slotLevel: outgoing.original.slotLevel,
              from: { name: outgoing.current.name, source: outgoing.current.source },
              to: { name: incoming.name, source: incoming.source },
            }
          : undefined
      const gain = advanceClassLevel(
        character,
        selected.rules,
        {
          className: selected.entry.name,
          classSource: selected.entry.source,
          classLevel,
          hitDie,
          dieResult,
          method: gainMethod,
        },
        before,
        replacement,
      )
      const leveled = applyCharacterCommandResult(character, gain)
      const progression = getCharacterClassEntries(leveled)
      const leveledContext = getCachedCharacterCalculationContext(leveled, filtered, raw?.lookups)
      const eligible: Subclass5e[] = []
      if (
        !selected.entry.subclass &&
        getSubclassSelectionInfo(selected.rules).subclassLevel === classLevel
      ) {
        const current = resolveClassProgressionRules(selected.entry, filtered.classes)
        for (const entry of current?.subclasses ?? []) {
          const reference = { subclass: entry.name, subclassSource: entry.source }
          if (
            entry.source &&
            getSelectedSubclassData(current, reference) === entry &&
            getSelectedSubclassData(selected.rules, reference) &&
            !getClassProgressionRestriction(
              leveled,
              progression.map((owner) =>
                classKey(owner) === classKey(selected.entry) ? { ...owner, ...reference } : owner,
              ),
            ) &&
            isSubclassEligible({
              subclass: entry,
              className: selected.entry.name,
              classSource: selected.entry.source,
              character: leveled,
              effectiveAbilityScores: leveledContext.abilityScores.total,
              classChoiceFeatureCatalogs: leveledContext.classChoices.catalogs,
              classChoicePrerequisites: leveledContext.classChoices.prerequisites,
              effectiveSpellProfiles: leveledContext.character.spells.spellProfiles,
            })
          )
            eligible.push(entry)
        }
      }
      const selectedSubclass = eligible.find((entry) => subclassKey(entry) === subclass)
      let result: CharacterCommandResult = gain
      let choiceError: string | undefined
      if (selectedSubclass) {
        try {
          const selection = selectSubclass(
            leveled,
            leveled.provenance,
            selectedSubclass.name,
            selectedSubclass.source,
            undefined,
            {
              viewingEntry: findClassReference(selected.entry, progression),
              raceResolution: leveledContext.raceResolution,
              spellsByKey: leveledContext.lookups.primary.spellsByKey,
              rawSpellsByKey: leveledContext.lookups.raw.spellsByKey,
              classChoiceFeatureCatalogs: leveledContext.classChoices.catalogs,
              spellContext: leveledContext.classChoices.spellContext,
            },
          )
          result = {
            characterPatch: { ...gain.characterPatch, ...selection.characterPatch },
            provenanceUpdate: selection.provenanceUpdate,
          }
        } catch (error) {
          choiceError = error instanceof Error ? error.message : 'Choose a different subclass.'
        }
      }
      let projected = applyCharacterCommandResult(character, result)
      if (selectedSubclass && !choiceError) {
        const after = getCachedCharacterCalculationContext(projected, filtered, raw?.lookups)
        const finalMaxHP = getEffectiveMaxHP(
          projected,
          after.classes,
          after.abilityScores.total,
          after.effects.sourceDeclarations,
        )
        if (projected.hitPoints.current !== finalMaxHP) {
          projected = { ...projected, hitPoints: { ...projected.hitPoints, current: finalMaxHP } }
        }
      }
      return {
        status: 'preview' as const,
        before,
        projected,
        eligible,
        selectedSubclass,
        choiceError,
      }
    } catch (error) {
      return {
        status: 'error' as const,
        message: error instanceof Error ? error.message : 'The next level could not be prepared.',
      }
    }
  }, [
    atLevelCap,
    before,
    character,
    dieResult,
    filtered,
    gainMethod,
    hitDie,
    invalidated,
    incoming,
    raw,
    outgoing,
    selected,
    subclass,
  ])
  const preview = draft?.status === 'preview' ? draft : null
  const error = draft?.status === 'error' ? draft.message : preview?.choiceError
  const editKey =
    preview && selected
      ? JSON.stringify([
          classKey(selected.entry),
          selected.entry.levels,
          preview.selectedSubclass && subclassKey(preview.selectedSubclass),
          disciplineFrom,
          disciplineTo,
        ])
      : undefined
  const editor =
    editingSession?.key === editKey ? (editingSession?.store ?? emptyEditor) : emptyEditor
  const edited = useStore(editor, (state) => state.activeCharacter)
  const editedEntry =
    edited && selected ? findClassReference(selected.entry, edited.classProgression) : undefined
  const hitPointGains = preview?.projected.hitPointGains
  const editedWithCurrentGain = useMemo(
    () =>
      edited && hitPointGains !== edited.hitPointGains ? { ...edited, hitPointGains } : edited,
    [edited, hitPointGains],
  )
  const after =
    editedWithCurrentGain &&
    getCachedCharacterCalculationContext(editedWithCurrentGain, filtered, raw?.lookups)
  const projected = editedWithCurrentGain &&
    after && {
      ...editedWithCurrentGain,
      hitPoints: {
        ...editedWithCurrentGain.hitPoints,
        current: getEffectiveMaxHP(
          editedWithCurrentGain,
          after.classes,
          after.abilityScores.total,
          after.effects.sourceDeclarations,
        ),
      },
    }
  const setupCharacter = projected ?? preview?.projected
  const setupContext =
    after ??
    (setupCharacter && getCachedCharacterCalculationContext(setupCharacter, filtered, raw?.lookups))

  const setClassTarget = (key: string) => {
    setTarget(key)
    setRoll('')
    setSubclass('')
    setDisciplineFrom('')
    setDisciplineTo('')
  }

  const nextStep = () => {
    if (!preview || !editKey || !replacementReady) return
    if (step === 'setup' && preview.eligible.length) {
      setStep('subclass')
      return
    }
    if (step === 'choices') {
      setStep('review')
      return
    }
    if (editedWithCurrentGain) {
      editor.setState({ activeCharacter: editedWithCurrentGain })
    } else {
      setEditingSession({ key: editKey, store: createCharacterEditingDraft(preview.projected) })
    }
    setStep('choices')
  }

  const apply = () => {
    const store = useCharacterStore.getState()
    if (
      !preview ||
      preview.choiceError ||
      !hpReady ||
      !character ||
      !projected ||
      store.activeCharacter !== character ||
      useGameDataStore.getState().gameData !== catalog
    ) {
      toast.error('The character or source rules changed. Reopen the wizard to update the draft.')
      return
    }
    store.updateCharacter(character.id, projected)
    if (useCharacterStore.getState().activeCharacter === character) {
      toast.error('The level could not be applied. Your draft is still open.')
      return
    }
    toast.success('Level applied.')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden border-border bg-workspace-detail sm:max-w-xl">
        <DialogHeader className="-mx-6 -mt-6 shrink-0 border-b border-border bg-surface-raised px-6 py-4 pr-12">
          <div className="flex items-center gap-2 text-left">
            <Scroll className="size-5 shrink-0 text-primary" weight="duotone" aria-hidden />
            <DialogTitle className="shrink-0">Level Up</DialogTitle>
            {character && (
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {character.name}
              </span>
            )}
            {hasClass && !atLevelCap && (
              <span className="ml-auto shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
                Level {totalLevel} → {totalLevel + 1}
              </span>
            )}
          </div>
          <DialogDescription>
            {step === 'setup'
              ? 'Class & level gains'
              : step === 'subclass'
                ? 'Subclass choice'
                : step === 'choices'
                  ? 'Choices earned at this level'
                  : 'Review changes before applying'}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          {invalidated && (
            <p role="alert" className="text-sm text-warning">
              The character or source rules changed. Reopen the wizard for a fresh draft.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-warning">
              {error}
            </p>
          )}
          {!invalidated && atLevelCap && (
            <p className="text-sm text-muted-foreground">
              This character has reached level {MAX_CHARACTER_LEVEL}. Direct level controls are on
              Overview.
            </p>
          )}
          {!invalidated && !atLevelCap && !hasClass && (
            <p className="text-sm text-muted-foreground">
              Choose your first class on the Class page.
            </p>
          )}
          {!invalidated && !atLevelCap && hasClass && step === 'setup' && (
            <div className="space-y-4">
              <Tabs
                value={mode}
                onValueChange={(value) => {
                  const nextMode = value === 'multiclass' ? 'multiclass' : 'advance'
                  if (nextMode === mode) return
                  setMode(nextMode)
                  setClassTarget('')
                }}
              >
                <TabsList aria-label="How to level up" className="w-full">
                  <TabsTrigger value="advance">
                    <Sword aria-hidden /> Advance Class
                  </TabsTrigger>
                  <TabsTrigger value="multiclass">
                    <Users aria-hidden /> Multiclass
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="advance">
                  {options.length ? (
                    <ClassLevelTargets
                      candidates={options}
                      selected={selected?.entry}
                      fixed={options.length === 1}
                      onSelect={setClassTarget}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Restore a current class’s rules to advance it.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="multiclass" className="pt-3">
                  {multiclasses.length ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-end gap-2">
                        <Label
                          htmlFor={ignoreRequirementsId}
                          className="text-xs text-muted-foreground"
                        >
                          Ignore requirements
                        </Label>
                        <Switch
                          id={ignoreRequirementsId}
                          checked={ignoreRequirements}
                          onCheckedChange={(checked) => {
                            setIgnoreRequirements(checked)
                            if (
                              !checked &&
                              multiclasses.some(
                                ({ entry, requirement }) =>
                                  classKey(entry) === target && !requirement.meetsRequirements,
                              )
                            ) {
                              setClassTarget('')
                            }
                          }}
                        />
                      </div>
                      <ClassToAddSelect
                        options={multiclasses.map(({ entry, requirement }) => ({
                          value: classKey(entry),
                          name: entry.name,
                          source: entry.source,
                          disabled: !ignoreRequirements && !requirement.meetsRequirements,
                          note: requirement.meetsRequirements
                            ? undefined
                            : requirement.requirementText,
                        }))}
                        value={target}
                        onValueChange={setClassTarget}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No additional class rules are available.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
              {selected && preview && character && setupCharacter && setupContext && (
                <section aria-label="Level gains" className="space-y-3">
                  <h3 className="font-semibold">
                    {selected.entry.name} level {selected.entry.levels + 1} gains
                  </h3>
                  <GuidedLevelUpReview
                    character={character}
                    projected={setupCharacter}
                    before={preview.before}
                    after={setupContext}
                    rules={selected.rules}
                    classLevel={selected.entry.levels + 1}
                    subclass={preview.selectedSubclass}
                    subclassAvailable={preview.eligible.length > 0}
                    levelPreview
                  />
                </section>
              )}
              {disciplines && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Known discipline</h3>
                  <Select
                    value={disciplineFrom || 'keep'}
                    onValueChange={(value) => {
                      setDisciplineFrom(value === 'keep' ? '' : value)
                      setDisciplineTo('')
                    }}
                  >
                    <SelectTrigger aria-label="Discipline to replace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep current disciplines</SelectItem>
                      {disciplines.outgoing.map((slot) => (
                        <SelectItem
                          key={getMysticDisciplineSlotKey(slot)}
                          value={getMysticDisciplineSlotKey(slot)}
                        >
                          {slot.current.name} ({slot.current.source})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {disciplineFrom && (
                    <Select value={disciplineTo} onValueChange={setDisciplineTo}>
                      <SelectTrigger aria-label="New discipline">
                        <SelectValue placeholder="Choose a discipline" />
                      </SelectTrigger>
                      <SelectContent>
                        {disciplines.incoming.map((row) => {
                          const key = getPsionicKey(row.name, row.source)
                          return (
                            <SelectItem key={key} value={key}>
                              {row.name} ({row.source})
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {editingSession && editKey !== editingSession.key && (
                <p className="text-xs text-muted-foreground">
                  Continuing with a different class or discipline starts a new set of choices.
                </p>
              )}
            </div>
          )}
          {!invalidated && step === 'subclass' && preview && (
            <div className="space-y-2">
              <Select
                value={subclass || 'later'}
                onValueChange={(key) => setSubclass(key === 'later' ? '' : key)}
              >
                <SelectTrigger aria-label="Choose a subclass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="later">Choose later</SelectItem>
                  {preview.eligible.map((entry) => (
                    <SelectItem key={subclassKey(entry)} value={subclassKey(entry)}>
                      {entry.name} ({entry.source})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingSession && editKey !== editingSession.key && (
                <p className="text-xs text-muted-foreground">
                  Continuing with a different subclass starts a new set of choices.
                </p>
              )}
            </div>
          )}
          {!invalidated && step === 'choices' && edited && editedEntry && (
            <CharacterEditingContext.Provider value={editor}>
              <GuidedLevelChoices
                key={classKey(editedEntry)}
                character={edited}
                entry={editedEntry}
              />
            </CharacterEditingContext.Provider>
          )}
          {!invalidated &&
            step === 'review' &&
            preview &&
            character &&
            selected &&
            projected &&
            after && (
              <>
                {average ? (
                  <p className="text-sm text-muted-foreground">
                    Hit points use the fixed average of {Math.floor(hitDie / 2) + 1} for a d{hitDie}
                    .
                  </p>
                ) : (
                  <section className="space-y-2 rounded-lg border border-border bg-workspace-pane p-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Heart className="size-4 text-primary" weight="duotone" aria-hidden /> Hit
                      points
                    </h3>
                    <Label htmlFor={rollId}>Hit die result (1–{hitDie})</Label>
                    <div className="flex gap-2">
                      <Input
                        id={rollId}
                        type="number"
                        min={1}
                        max={hitDie}
                        value={roll}
                        onChange={(event) => {
                          setMethod('manual')
                          setRoll(event.target.value)
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMethod('rolled')
                          setRoll(String(rollDie(hitDie)))
                        }}
                      >
                        Roll d{hitDie}
                      </Button>
                    </div>
                  </section>
                )}
                <GuidedLevelUpReview
                  character={character}
                  projected={projected}
                  before={preview.before}
                  after={after}
                  rules={selected.rules}
                  classLevel={selected.entry.levels + 1}
                  subclass={preview.selectedSubclass}
                  showHitPoints={hpReady}
                />
              </>
            )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {step !== 'setup' && (
            <Button
              variant="outline"
              onClick={() =>
                setStep(
                  step === 'review'
                    ? 'choices'
                    : step === 'choices' && preview?.eligible.length
                      ? 'subclass'
                      : 'setup',
                )
              }
            >
              Back
            </Button>
          )}
          {step === 'review' ? (
            <Button
              disabled={!preview || !hpReady || !!preview.choiceError || invalidated}
              onClick={apply}
            >
              Apply level
            </Button>
          ) : (
            <Button
              disabled={
                !preview ||
                !replacementReady ||
                invalidated ||
                (step === 'subclass' && !!preview.choiceError)
              }
              onClick={nextStep}
            >
              {step === 'choices' ? 'Review level' : 'Next'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
