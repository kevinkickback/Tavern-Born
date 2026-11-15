import { Clock, Crown, Sword, User } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { getOriginSystemLabel } from '@/lib/calculations/originSystem'
import { getPortraitCssTransform, resolvePortraitSrc } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import type { CharacterClassEntry, OriginSystem, PortraitTransform } from '@/types/character'

export const CHARACTER_CARD_REVEAL_CLASS =
  'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-in-out [@media(hover:hover)_and_(not_(any-pointer:coarse))]:group-[&:not(:hover):not(:focus-within)]/card:pointer-events-none [@media(hover:hover)_and_(not_(any-pointer:coarse))]:group-[&:not(:hover):not(:focus-within)]/card:opacity-0'

interface CharacterCardFrameProps {
  image?: string | null
  imageAlt: string
  name?: string
  level?: number
  race?: string
  classes?: readonly CharacterClassEntry[]
  originSystem?: OriginSystem
  gender?: string
  lastModified?: string
  transform?: PortraitTransform
  portraitTransition?: boolean
  preview?: boolean
  selectionControl?: ReactNode
  statusBadge?: ReactNode
}

export function CharacterCardFrame({
  image,
  imageAlt,
  name,
  level,
  race,
  classes = [],
  originSystem,
  gender,
  lastModified,
  transform,
  portraitTransition = false,
  preview = false,
  selectionControl,
  statusBadge,
}: CharacterCardFrameProps) {
  const displayName = name || 'Unnamed Character'
  const detailIconClass = 'size-3.5 shrink-0 text-primary @[300px]:size-4'
  const showClassLevels = classes.length > 1
  const revealClass = !preview && CHARACTER_CARD_REVEAL_CLASS

  return (
    <>
      {image ? (
        <img
          src={resolvePortraitSrc(image)}
          alt={imageAlt}
          className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full max-w-none select-none object-contain"
          style={{
            transform: getPortraitCssTransform(transform),
            ...(portraitTransition ? { transition: 'transform 0.2s ease-out' } : {}),
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-background" />
      )}

      <div className="absolute inset-y-0 right-0 w-[84%] bg-gradient-to-l from-card/98 via-card/75 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[64%] bg-gradient-to-l from-card/99 via-card/88 to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[30%] bg-gradient-to-l from-card via-card/99 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-background/60 via-background/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-background/70 via-background/25 to-transparent" />

      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5">
        {selectionControl}
        {originSystem && (
          <Badge
            variant="outline"
            title={getOriginSystemLabel(originSystem)}
            className={cn(
              revealClass,
              'px-1.5 font-semibold tabular-nums shadow-sm',
              originSystem === '2014'
                ? 'border-[var(--amber-8)] bg-[var(--amber-4)] [color:var(--amber-12)]'
                : 'border-[var(--blue-8)] bg-[var(--blue-4)] [color:var(--blue-12)]',
            )}
          >
            {originSystem}
          </Badge>
        )}
        {statusBadge}
      </div>

      <div className="absolute inset-y-0 right-0 left-[36%] z-[1] flex min-w-0 flex-col items-end gap-1 py-2 pr-2.5 text-right @[300px]:gap-2 @[300px]:py-3.5 @[300px]:pr-3.5">
        <h3
          title={displayName}
          className="line-clamp-1 w-full shrink-0 wrap-anywhere font-display text-[clamp(1.0625rem,7.2cqw,1.8rem)] leading-[1.1] font-bold text-foreground @[250px]:line-clamp-2"
        >
          {displayName}
        </h3>

        {typeof level === 'number' ? (
          <>
            <div className="my-auto flex min-h-0 w-full flex-col items-end gap-1 text-sm leading-[1.25] text-foreground/90 @[300px]:gap-1.5 @[300px]:text-[0.95rem]">
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold">Level {level}</span>
                <Crown
                  data-slot="character-card-detail-icon"
                  data-detail-icon="level"
                  className={detailIconClass}
                  weight="fill"
                />
              </div>
              {race && (
                <div className="flex min-w-0 max-w-full shrink-0 items-center gap-2">
                  <span className="truncate font-medium" title={race}>
                    {race}
                  </span>
                  <User
                    data-slot="character-card-detail-icon"
                    data-detail-icon="race"
                    className={detailIconClass}
                    weight="fill"
                  />
                </div>
              )}
              {classes.length > 0 && (
                <div className="flex min-h-0 w-full justify-end gap-2">
                  <ul
                    aria-label="Class levels"
                    className="min-w-0 overflow-y-auto overscroll-contain font-medium [scrollbar-width:thin]"
                  >
                    {classes.map(({ name, source, levels }) => (
                      <li
                        key={JSON.stringify([name, source])}
                        className="flex justify-end"
                        title={showClassLevels ? `${name} ${levels}` : name}
                      >
                        <span className="truncate">{name}</span>
                        {showClassLevels && (
                          <span className="shrink-0 whitespace-pre tabular-nums">{` ${levels}`}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Sword
                    data-slot="character-card-detail-icon"
                    data-detail-icon="class"
                    className={cn(detailIconClass, 'mt-0.5')}
                    weight="fill"
                  />
                </div>
              )}
            </div>

            {(lastModified || preview) && (
              <span
                data-slot="character-card-date"
                className={cn(
                  revealClass,
                  'flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap text-[11px] leading-none text-muted-foreground italic',
                )}
              >
                <Clock className="size-3 shrink-0" />
                <span className="truncate">
                  Last modified:{' '}
                  {lastModified ? new Date(lastModified).toLocaleDateString() : 'Unsaved'}
                </span>
              </span>
            )}
          </>
        ) : (
          <div className="mt-auto text-xs italic text-muted-foreground">
            {gender || 'Unspecified'}
          </div>
        )}
      </div>
    </>
  )
}
