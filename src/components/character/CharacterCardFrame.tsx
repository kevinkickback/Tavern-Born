import { Clock, Crown, Sword, User } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import type { PortraitTransform } from '@/types/character'

interface CharacterCardFrameProps {
  image?: string | null
  imageAlt: string
  name?: string
  level?: number
  race?: string
  characterClass?: string
  gender?: string
  lastModified?: string
  transform?: PortraitTransform
  cardSize?: number
  portraitTransition?: boolean
  actions?: ReactNode
}

export function CharacterCardFrame({
  image,
  imageAlt,
  name,
  level,
  race,
  characterClass,
  gender,
  lastModified,
  transform,
  cardSize = 360,
  portraitTransition = false,
  actions,
}: CharacterCardFrameProps) {
  const sizeVariant = cardSize <= 300 ? 'small' : cardSize <= 380 ? 'medium' : 'large'
  const isSmall = sizeVariant === 'small'
  const isMedium = sizeVariant === 'medium'
  const portraitZoom = (transform?.zoom ?? 100) / 100
  const portraitPanX = transform?.panX ?? 0
  const portraitPanY = transform?.panY ?? 0
  const portraitRotation = transform?.rotation ?? 0
  const detailIconClass = cn('text-primary', isSmall ? 'size-3.5' : 'size-4')

  return (
    <>
      {image ? (
        <img
          src={resolvePortraitSrc(image)}
          alt={imageAlt}
          className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full max-w-none select-none object-contain"
          style={{
            transform: `translate(calc(-50% + ${portraitPanX - 92}px), calc(-50% + ${portraitPanY}px)) scale(${portraitZoom}) rotate(${portraitRotation}deg)`,
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

      <div
        className={cn(
          'absolute inset-y-0 right-0 z-[1] flex flex-col items-end text-right',
          isSmall ? 'w-[69%] p-2.5' : isMedium ? 'w-[63%] p-3.5' : 'w-[56%] p-4',
        )}
      >
        <div className="ml-auto flex max-w-full flex-col items-end">
          <h3
            className={cn(
              'max-w-full whitespace-normal break-normal [overflow-wrap:normal] hyphens-none text-right font-display font-bold leading-tight text-foreground',
              isSmall ? 'text-[0.95rem]' : isMedium ? 'text-[1.15rem]' : 'text-[1.45rem]',
            )}
          >
            {name || 'Unnamed Character'}
          </h3>
        </div>

        {typeof level === 'number' ? (
          <div
            className={cn('mt-auto flex w-full flex-col items-end', isSmall ? 'gap-2' : 'gap-3')}
          >
            <div
              className={cn(
                'flex flex-col items-end',
                isSmall
                  ? 'gap-1 text-[0.9rem]'
                  : isMedium
                    ? 'gap-1.5 text-[0.95rem]'
                    : 'gap-2 text-[1.02rem]',
              )}
            >
              <div className="flex items-center gap-2 text-foreground/90">
                <span className="font-semibold">Level {level}</span>
                <Crown
                  data-slot="character-card-detail-icon"
                  data-detail-icon="level"
                  className={detailIconClass}
                  weight="fill"
                />
              </div>
              {race && (
                <div className="flex items-center gap-2 text-foreground/90">
                  <span className="font-medium">{race}</span>
                  <User
                    data-slot="character-card-detail-icon"
                    data-detail-icon="race"
                    className={detailIconClass}
                    weight="fill"
                  />
                </div>
              )}
              {characterClass && (
                <div className="flex items-center gap-2 text-foreground/90">
                  <span className="font-medium">{characterClass}</span>
                  <Sword
                    data-slot="character-card-detail-icon"
                    data-detail-icon="class"
                    className={detailIconClass}
                    weight="fill"
                  />
                </div>
              )}
            </div>

            {actions}

            {lastModified && (
              <span
                className={cn(
                  'flex max-w-full items-center gap-1 whitespace-nowrap text-muted-foreground italic',
                  isSmall ? 'text-[9px]' : isMedium ? 'text-[10px]' : 'text-xs',
                )}
              >
                <Clock size={isSmall ? 10 : 12} />
                Last modified: {new Date(lastModified).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-auto text-xs italic text-muted-foreground">
            {gender || 'Unspecified'}
          </div>
        )}
      </div>
    </>
  )
}
