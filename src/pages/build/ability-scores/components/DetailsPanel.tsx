import { GameContent } from '@/components/editor/GameContent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { WorkspaceDetailContent, WorkspacePaneHeader } from '@/components/workspace'
import type { AbilityName } from '@/lib/calculations/abilityScores'
import {
  buildSkillSourceTags,
  formatTitleCase,
  type SkillDetail,
} from '@/pages/build/ability-scores/model/data'

interface BuildAbilityScoresDetailsPanelProps {
  selectedAbility: AbilityName
  selectedSkillNames: readonly string[]
  selectedSkillDetails: SkillDetail[]
}

export function BuildAbilityScoresDetailsPanel({
  selectedAbility,
  selectedSkillNames,
  selectedSkillDetails,
}: BuildAbilityScoresDetailsPanelProps) {
  const sourceTags = buildSkillSourceTags(selectedSkillDetails)

  return (
    <>
      <WorkspacePaneHeader title="Ability details" className="pr-20" />
      <ScrollArea className="flex-1 overflow-hidden">
        <WorkspaceDetailContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{formatTitleCase(selectedAbility)} Skills</h2>
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
                    <GameContent entry={skill.entries} className="text-sm text-muted-foreground" />
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
                {selectedSkillNames.length > 0
                  ? selectedSkillNames.map(formatTitleCase).join(', ')
                  : 'No skills mapped.'}
              </p>
            )}
          </div>
        </WorkspaceDetailContent>
      </ScrollArea>
    </>
  )
}
