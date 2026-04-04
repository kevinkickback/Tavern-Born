import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Image, Upload, X, MagnifyingGlassMinus, MagnifyingGlassPlus, ArrowsOut, ArrowsIn, Crop, Images } from '@phosphor-icons/react'
import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { useCharacterStore } from '@/store/characterStore'
import { cn } from '@/lib/utils'

const PLACEHOLDER_PORTRAITS = [
  '/assets/images/characters/placeholder_char_card.jpg',
  '/assets/images/characters/placeholder_char_card0.jpg',
  '/assets/images/characters/placeholder_char_card2.jpg',
  '/assets/images/characters/placeholder_char_card3.jpg',
  '/assets/images/characters/placeholder_char_card4.jpg',
  '/assets/images/characters/placeholder_char_card5.jpg',
  '/assets/images/characters/placeholder_char_card6.jpg',
  '/assets/images/characters/placeholder_char_card7.jpg',
  '/assets/images/characters/placeholder_char_card8.jpg',
  '/assets/images/characters/placeholder_char_card9.jpg',
  '/assets/images/characters/placeholder_char_card10.jpg',
  '/assets/images/characters/placeholder_char_card11.jpg',
]

export function PortraitPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const updateActiveCharacter = useCharacterStore((state) => state.updateActiveCharacter)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [rotation, setRotation] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setImagePreview(activeCharacter?.portrait ?? null)
    resetTransforms()

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [activeCharacter?.id, activeCharacter?.portrait])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        const image = reader.result as string
        setImagePreview(image)
        updateActiveCharacter({ portrait: image })
        resetTransforms()
        toast.success('Portrait uploaded successfully')
      }
      reader.readAsDataURL(file)
    }
  }

  const handleClear = () => {
    setImagePreview(null)
    updateActiveCharacter({ portrait: undefined })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    resetTransforms()
    toast.info('Portrait cleared')
  }

  const resetTransforms = () => {
    setZoom(100)
    setPanX(0)
    setPanY(0)
    setRotation(0)
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 200))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 50))
  }

  const handleFitToView = () => {
    setZoom(100)
    setPanX(0)
    setPanY(0)
  }

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  const getTransformStyle = () => {
    return {
      transform: `scale(${zoom / 100}) translate(${panX}px, ${panY}px) rotate(${rotation}deg)`,
      transition: 'transform 0.2s ease-out'
    }
  }

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Image className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their portrait.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <Card className="p-4 sm:p-6 w-full">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
          <div className="w-full lg:w-1/2 space-y-3">
            <Label className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Preview
            </Label>
            <div className="aspect-[3/4] w-full bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
              {imagePreview ? (
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={imagePreview}
                    alt="Character portrait"
                    className="max-w-full max-h-full object-contain"
                    style={getTransformStyle()}
                  />
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Image className="h-16 w-16 mx-auto mb-2 opacity-50" />
                  <p>No portrait uploaded</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full lg:w-1/2 flex flex-col gap-3 sm:gap-4">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Portrait
              </Label>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-w-[120px] sm:flex-initial sm:min-w-[140px]"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Browse
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={!imagePreview}
                  className="flex-1 min-w-[120px] sm:flex-initial sm:min-w-[140px]"
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
              <Input
                ref={fileInputRef}
                id="portrait-upload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground">
                JPG, PNG, GIF. Max 5MB
              </p>
            </div>

            <div className="space-y-3 border-t pt-3">
              <Label className="flex items-center gap-2">
                <Images className="h-5 w-5" />
                Select Placeholder
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {PLACEHOLDER_PORTRAITS.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      setImagePreview(src)
                      updateActiveCharacter({ portrait: src })
                      resetTransforms()
                      toast.success('Portrait selected')
                    }}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                      imagePreview === src
                        ? 'border-accent ring-2 ring-accent/50'
                        : 'border-border hover:border-accent/50'
                    )}
                  >
                    <img
                      src={src}
                      alt={`Placeholder ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4 border-t pt-3 sm:pt-4">
              <Label className="flex items-center gap-2">
                <Crop className="h-5 w-5" />
                Image Controls
              </Label>

              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Zoom</span>
                    <span className="text-sm font-medium">{zoom}%</span>
                  </div>
                  <Slider
                    value={[zoom]}
                    onValueChange={(value) => setZoom(value[0])}
                    min={50}
                    max={200}
                    step={5}
                    disabled={!imagePreview}
                    className="w-full"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleZoomOut}
                      disabled={!imagePreview}
                      className="w-full"
                    >
                      <MagnifyingGlassMinus className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Out</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleZoomIn}
                      disabled={!imagePreview}
                      className="w-full"
                    >
                      <MagnifyingGlassPlus className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">In</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Pan X</span>
                    <span className="text-sm font-medium">{panX}px</span>
                  </div>
                  <Slider
                    value={[panX]}
                    onValueChange={(value) => setPanX(value[0])}
                    min={-200}
                    max={200}
                    step={5}
                    disabled={!imagePreview}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Pan Y</span>
                    <span className="text-sm font-medium">{panY}px</span>
                  </div>
                  <Slider
                    value={[panY]}
                    onValueChange={(value) => setPanY(value[0])}
                    min={-200}
                    max={200}
                    step={5}
                    disabled={!imagePreview}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Rotation</span>
                    <span className="text-sm font-medium">{rotation}°</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRotate}
                    disabled={!imagePreview}
                    className="w-full"
                  >
                    <ArrowsOut className="h-4 w-4 mr-2" />
                    Rotate 90°
                  </Button>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFitToView}
                  disabled={!imagePreview}
                  className="w-full"
                >
                  <ArrowsIn className="h-4 w-4 mr-2" />
                  Reset View
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
