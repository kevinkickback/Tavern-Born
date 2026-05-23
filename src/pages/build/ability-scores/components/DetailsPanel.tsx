import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { AbilityName } from '@/lib/calculations/abilityScores'
import { ALL_SKILLS, getSkillAbility } from '@/lib/calculations/skills'
import { renderEntry } from '@/lib/renderer'
import {
  buildSkillSourceTags,
  formatTitleCase,
  type SkillDetail,
} from '@/pages/build/ability-scores/model/data'

interface BuildAbilityScoresDetailsPanelProps {
  selectedAbility: AbilityName
  selectedSkillDetails: SkillDetail[]
}

function renderInlineEntry(entry: unknown): string {
  return renderEntry(entry).replace(/^<p>|<\/p>$/g, '')
}

export function BuildAbilityScoresDetailsPanel({
  selectedAbility,
  selectedSkillDetails,
}: BuildAbilityScoresDetailsPanelProps) {
  const selectedSkills = ALL_SKILLS.filter((skill) => getSkillAbility(skill) === selectedAbility)
  const sourceTags = buildSkillSourceTags(selectedSkillDetails)

  return (
    <>
      <div className="bg-gradient-to-r from-accent/30 via-accent/15 to-transparent border-b border-border/40 px-4 py-3 flex-shrink-0 flex flex-col gap-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Details
        </span>
        <div className="flex items-center gap-2 min-h-8">
          <span className="text-sm font-bold font-display leading-tight">
            {formatTitleCase(selectedAbility)} Skills
          </span>
        </div>
      </div>
      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-4">
          <div>
            <h2 className="text-2xl font-display font-bold">
              {formatTitleCase(selectedAbility)} Skills
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Skills that use this ability score:
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            {selectedSkillDetails.length > 0 ? (
              <div className="space-y-2">
                {selectedSkillDetails.map((skill) => (
                  <div key={skill.name} className="space-y-1">
                    <div className="text-base font-semibold">{skill.name}</div>
                    <div
                      className="text-sm text-muted-foreground"
                      dangerouslySetInnerHTML={{
                        __html: skill.entries.map((entry) => renderInlineEntry(entry)).join(' '),
                      }}
                    />
                  </div>
                ))}
                {sourceTags.length > 0 && (
                  <p className="text-sm text-muted-foreground pt-1">
                    Source: {sourceTags.join(' ; ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedSkills.length > 0
                  ? selectedSkills.map(formatTitleCase).join(', ')
                  : 'No skills mapped.'}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </>
  )
}
