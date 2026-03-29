import { Card } from '@/components/ui/card'
import { Info } from '@phosphor-icons/react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function FormattingGuide() {
  const [isOpen, setIsOpen] = useState(false)

  const tags = [
    { tag: '{@b text}', desc: 'Bold text', example: '{@b Important}' },
    { tag: '{@i text}', desc: 'Italic text', example: '{@i emphasis}' },
    { tag: '{@spell name}', desc: 'Spell reference', example: '{@spell Fireball}' },
    { tag: '{@item name}', desc: 'Item reference', example: '{@item longsword}' },
    { tag: '{@creature name}', desc: 'Creature reference', example: '{@creature dragon}' },
    { tag: '{@condition name}', desc: 'Condition reference', example: '{@condition poisoned}' },
    { tag: '{@skill name}', desc: 'Skill reference', example: '{@skill Perception}' },
    { tag: '{@dice formula}', desc: 'Dice notation', example: '{@dice 2d6+3}' },
    { tag: '{@damage formula}', desc: 'Damage notation', example: '{@damage 1d8}' },
    { tag: '{@dc number}', desc: 'Difficulty class', example: '{@dc 15}' },
    { tag: '{@class name}', desc: 'Class reference', example: '{@class Fighter}' },
    { tag: '{@race name}', desc: 'Race reference', example: '{@race Elf}' },
    { tag: '{@background name}', desc: 'Background reference', example: '{@background Soldier}' },
    { tag: '{@feat name}', desc: 'Feat reference', example: '{@feat Great Weapon Master}' },
    { tag: '{@deity name}', desc: 'Deity reference', example: '{@deity Bahamut}' },
    { tag: '{@language name}', desc: 'Language reference', example: '{@language Elvish}' },
  ]

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="p-4 bg-muted/30 border-primary/20">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="h-4 w-4 text-primary" weight="fill" />
              <span>Text Formatting & @-Tag Guide</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {isOpen ? 'Hide' : 'Show'}
            </span>
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Use @-tags to create formatted references that will be styled and potentially interactive:
          </p>
          
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {tags.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-0.5 p-2 bg-background/50 rounded border border-border/50">
                <code className="font-mono text-primary">{item.tag}</code>
                <span className="text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
          
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Use double line breaks to create paragraphs. Single line breaks become line breaks within a paragraph.
            </p>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
