import { Crop, Image, Images, Upload, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_PORTRAIT_TRANSFORM,
  PLACEHOLDER_PORTRAITS,
} from '@/lib/portraitConstants';
import { cn } from '@/lib/utils';
import { useCharacterStore } from '@/store/characterStore';

export function PortraitPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter);
  const updateActiveCharacter = useCharacterStore(
    (state) => state.updateActiveCharacter,
  );
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_PORTRAIT_TRANSFORM.zoom);
  const [panX, setPanX] = useState(DEFAULT_PORTRAIT_TRANSFORM.panX);
  const [panY, setPanY] = useState(DEFAULT_PORTRAIT_TRANSFORM.panY);
  const [rotation, setRotation] = useState(DEFAULT_PORTRAIT_TRANSFORM.rotation);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portraitUploadId = useId();

  const applyTransformDraft = useCallback(
    (
      updates: Partial<{
        zoom: number;
        panX: number;
        panY: number;
        rotation: number;
      }>,
    ) => {
      const nextZoom = updates.zoom ?? zoom;
      const nextPanX = updates.panX ?? panX;
      const nextPanY = updates.panY ?? panY;
      const nextRotation = updates.rotation ?? rotation;

      setZoom(nextZoom);
      setPanX(nextPanX);
      setPanY(nextPanY);
      setRotation(nextRotation);

      updateActiveCharacter({
        portraitTransform: {
          zoom: nextZoom,
          panX: nextPanX,
          panY: nextPanY,
          rotation: nextRotation,
        },
      });
    },
    [panX, panY, rotation, updateActiveCharacter, zoom],
  );

  const resetTransforms = useCallback(() => {
    applyTransformDraft(DEFAULT_PORTRAIT_TRANSFORM);
  }, [applyTransformDraft]);

  useEffect(() => {
    setImagePreview(activeCharacter?.portrait ?? null);
    const transform = activeCharacter?.portraitTransform;
    setZoom(transform?.zoom ?? DEFAULT_PORTRAIT_TRANSFORM.zoom);
    setPanX(transform?.panX ?? DEFAULT_PORTRAIT_TRANSFORM.panX);
    setPanY(transform?.panY ?? DEFAULT_PORTRAIT_TRANSFORM.panY);
    setRotation(transform?.rotation ?? DEFAULT_PORTRAIT_TRANSFORM.rotation);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [activeCharacter?.portrait, activeCharacter?.portraitTransform]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const image = reader.result as string;
        setImagePreview(image);
        updateActiveCharacter({ portrait: image });
        resetTransforms();
        toast.success('Portrait uploaded successfully');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClear = () => {
    setImagePreview(null);
    updateActiveCharacter({ portrait: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    resetTransforms();
    toast.info('Portrait cleared');
  };

  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Image
            className="h-12 w-12 mx-auto mb-4 text-muted-foreground"
            weight="duotone"
          />
          <h2 className="font-display text-2xl font-bold mb-2">
            No Character Selected
          </h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their portrait.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <Card className="p-4 sm:p-6 w-full">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
          <div className="w-full lg:w-1/2 space-y-3">
            <Label className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Card Preview
            </Label>
            <div className="rounded-xl border-2 border-dashed border-border p-2 sm:p-3">
              <PortraitCardPreview
                image={imagePreview}
                name={activeCharacter.name}
                level={activeCharacter.level}
                race={activeCharacter.race}
                characterClass={activeCharacter.class}
                lastModified={activeCharacter.lastModified}
                transform={{ zoom, panX, panY, rotation }}
              />
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
                id={portraitUploadId}
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
                      setImagePreview(src);
                      updateActiveCharacter({ portrait: src });
                      resetTransforms();
                      toast.success('Portrait selected');
                    }}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                      imagePreview === src
                        ? 'border-accent ring-2 ring-accent/50'
                        : 'border-border hover:border-accent/50',
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
                    onValueChange={(value) =>
                      applyTransformDraft({ zoom: value[0] })
                    }
                    min={50}
                    max={400}
                    step={5}
                    disabled={!imagePreview}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Pan X</span>
                    <span className="text-sm font-medium">{panX}px</span>
                  </div>
                  <Slider
                    value={[panX]}
                    onValueChange={(value) =>
                      applyTransformDraft({ panX: value[0] })
                    }
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
                    onValueChange={(value) =>
                      applyTransformDraft({ panY: value[0] })
                    }
                    min={-200}
                    max={200}
                    step={5}
                    disabled={!imagePreview}
                    className="w-full"
                  />
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={resetTransforms}
                  disabled={!imagePreview}
                  className="w-full"
                >
                  Reset View
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
