import { getInitials } from './model'

interface OrganizationPreviewProps {
  custom: boolean
  description: string
  gradient: string
  hasSelection: boolean
  image: string
  showImage: boolean
  title: string
  onImageError: () => void
}

function PreviewCard({
  description,
  gradient,
  image,
  showImage,
  title,
  onImageError,
}: Omit<OrganizationPreviewProps, 'custom' | 'hasSelection'>) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-border/60 bg-gradient-to-br ${gradient}`}
    >
      {showImage ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-black/15" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden">
            <img
              src={image}
              alt={title || 'Organization preview'}
              className="absolute right-2 top-1/2 h-[88%] w-auto -translate-y-1/2 object-contain opacity-95 drop-shadow-xl"
              onError={onImageError}
            />
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1/3 items-center justify-center">
          <span className="font-display text-4xl font-bold tracking-widest text-white/90">
            {getInitials(title || 'Organization')}
          </span>
        </div>
      )}
      <div className="relative z-10 min-h-44 space-y-2 p-4 pr-28 sm:pr-40">
        <h4 className="text-sm font-semibold text-white">
          {title || <span className="italic opacity-40">Organization name</span>}
        </h4>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{description}</p>
      </div>
    </div>
  )
}

export function OrganizationPreview(props: OrganizationPreviewProps) {
  if (!props.custom && !props.title && !props.description) {
    return props.hasSelection ? null : (
      <p className="text-sm text-muted-foreground">
        Select an organization to preview its details, or choose Custom to upload an image and write
        your own description.
      </p>
    )
  }

  const preview = (
    <PreviewCard
      description={props.description}
      gradient={props.gradient}
      image={props.image}
      showImage={props.showImage}
      title={props.title}
      onImageError={props.onImageError}
    />
  )
  return props.custom ? (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Preview
      </div>
      {preview}
    </div>
  ) : (
    preview
  )
}
