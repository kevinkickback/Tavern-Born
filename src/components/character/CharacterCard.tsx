import {
  Clock,
  Sword,
  Trash,
  Upload,
  User,
  Users,
} from '@phosphor-icons/react';
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Character } from '@/types/character';

interface CharacterCardProps {
  character: Character;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (character: Character) => void;
  isActive?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  cardSize?: number;
}

export const CharacterCard = memo(function CharacterCard({
  character,
  onLoad,
  onDelete,
  onExport,
  isActive = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  cardSize = 340,
}: CharacterCardProps) {
  const sizeVariant =
    cardSize <= 300 ? 'small' : cardSize <= 380 ? 'medium' : 'large';
  const isSmall = sizeVariant === 'small';
  const isMedium = sizeVariant === 'medium';

  const rightPanelWidth = isSmall
    ? 'w-[69%]'
    : isMedium
      ? 'w-[63%]'
      : 'w-[56%]';
  const shellPadding = isSmall ? 'p-2.5' : isMedium ? 'p-3.5' : 'p-4';
  const _titleGap = isSmall ? 'gap-1.5' : 'gap-2';
  const titleClass = isSmall
    ? 'text-[0.95rem]'
    : isMedium
      ? 'text-[1.15rem]'
      : 'text-[1.45rem]';
  const detailsGap = isSmall ? 'gap-1' : isMedium ? 'gap-1.5' : 'gap-2';
  const detailText = isSmall
    ? 'text-[0.9rem]'
    : isMedium
      ? 'text-[0.95rem]'
      : 'text-[1.02rem]';
  const actionButtonClass = isSmall
    ? 'h-8 min-w-10 px-2.5'
    : isMedium
      ? 'h-9 min-w-11 px-3'
      : 'h-10 min-w-12 px-3.5';
  const actionIconClass = isSmall ? 'size-4' : 'size-5';
  const footerTextClass = isSmall
    ? 'text-[9px]'
    : isMedium
      ? 'text-[10px]'
      : 'text-xs';

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.(character.id);
      return;
    }

    onLoad(character.id);
  };

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExport(character);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(character.id);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(character.id);
  };

  return (
    <Card
      className={`group relative aspect-[3/2] cursor-pointer overflow-hidden border transition-colors hover:border-accent ${isActive ? 'border-accent border-2' : ''} ${isSelected ? 'ring-2 ring-primary/50' : ''}`}
      onClick={handleCardClick}
    >
      {character.portrait ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${character.portrait})`,
            backgroundSize: 'cover',
            backgroundPosition: 'left center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-background" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-transparent from-[18%] via-card/54 via-[45%] to-card/94 to-[72%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/35 via-transparent to-transparent" />

      {selectionMode && (
        <button
          type="button"
          className="absolute top-3 left-3 z-10"
          onClick={handleCheckboxClick}
        >
          <Checkbox
            checked={isSelected}
            aria-label={`Select ${character.name || 'character'}`}
          />
        </button>
      )}

      {isActive && (
        <div className="absolute top-3 right-3 z-10">
          <Badge
            variant="default"
            className="shrink-0 bg-accent text-accent-foreground shadow-sm"
          >
            Active
          </Badge>
        </div>
      )}

      <div
        className={cn(
          'absolute inset-y-0 right-0 z-[1] flex flex-col items-end text-right',
          rightPanelWidth,
          shellPadding,
        )}
      >
        <div
          className={cn(
            'flex w-full justify-end',
            isActive && (isSmall ? 'pr-16' : 'pr-20'),
          )}
        >
          <div className="ml-auto flex max-w-full flex-col items-end">
            <div className="flex min-w-0 flex-col items-end">
              <h3
                className={cn(
                  'max-w-full whitespace-normal break-normal [overflow-wrap:normal] hyphens-none text-right font-display font-bold leading-tight text-foreground',
                  titleClass,
                )}
              >
                {character.name || 'Unnamed Character'}
              </h3>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'mt-auto flex w-full flex-col items-end',
            isSmall ? 'gap-2' : 'gap-3',
          )}
        >
          <div
            className={cn('flex flex-col items-end', detailsGap, detailText)}
          >
            <div className="flex items-center gap-2 text-foreground/90">
              <span className="font-semibold">Level {character.level}</span>
              <User
                className={cn('text-accent', isSmall ? 'size-3.5' : 'size-4')}
                weight="fill"
              />
            </div>
            {character.race && (
              <div className="flex items-center gap-2 text-foreground/90">
                <span className="font-medium">{character.race}</span>
                <Users
                  className={cn('text-accent', isSmall ? 'size-3.5' : 'size-4')}
                  weight="fill"
                />
              </div>
            )}
            {character.class && (
              <div className="flex items-center gap-2 text-foreground/90">
                <span className="font-medium">{character.class}</span>
                <Sword
                  className={cn('text-accent', isSmall ? 'size-3.5' : 'size-4')}
                  weight="fill"
                />
              </div>
            )}
          </div>

          {!selectionMode && (
            <div className={cn('flex', isSmall ? 'gap-2' : 'gap-3')}>
              <Button
                variant="outline"
                size="default"
                className={cn(
                  actionButtonClass,
                  'bg-background/55 backdrop-blur-sm',
                )}
                onClick={handleExport}
              >
                <Upload className={actionIconClass} />
              </Button>
              <Button
                variant="destructive"
                size="default"
                className={actionButtonClass}
                onClick={handleDelete}
              >
                <Trash className={actionIconClass} />
              </Button>
            </div>
          )}

          <span
            className={cn(
              'flex max-w-full items-center gap-1 text-muted-foreground italic whitespace-nowrap',
              footerTextClass,
            )}
          >
            <Clock size={isSmall ? 10 : 12} />
            Last modified:{' '}
            {new Date(character.lastModified).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Card>
  );
});
