import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Move } from 'lucide-react';

/**
 * Drag-to-reframe component that mimics the Hero image of a location card
 * (aspect ratio matching CARD width:height ~= 360:160 ~= 2.25:1).
 *
 * The image is rendered "cover" inside the frame; the user can drag it
 * horizontally/vertically to choose the exact crop. Calling `getCroppedBlob()`
 * via ref returns a JPEG matching the frame ratio at high resolution.
 */

export const HERO_RATIO = 360 / 160; // 2.25
export const HERO_OUTPUT_WIDTH = 1280;
export const HERO_OUTPUT_HEIGHT = Math.round(HERO_OUTPUT_WIDTH / HERO_RATIO); // 569

export interface HeroCropFrameHandle {
  getCroppedBlob: (mime?: string, quality?: number) => Promise<Blob | null>;
}

interface Props {
  src: string;
  alt?: string;
}

export const HeroCropFrame = forwardRef<HeroCropFrameHandle, Props>(({ src, alt }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Reset offset when image changes
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setImgNatural({ w: 0, h: 0 });
  }, [src]);

  // Compute display size (cover)
  const display = (() => {
    if (!containerSize.w || !imgNatural.w) return { w: 0, h: 0, scale: 1 };
    const scale = Math.max(containerSize.w / imgNatural.w, containerSize.h / imgNatural.h);
    return { w: imgNatural.w * scale, h: imgNatural.h * scale, scale };
  })();

  const maxOffsetX = Math.max(0, (display.w - containerSize.w) / 2);
  const maxOffsetY = Math.max(0, (display.h - containerSize.h) / 2);

  const clamp = (x: number, y: number) => ({
    x: Math.max(-maxOffsetX, Math.min(maxOffsetX, x)),
    y: Math.max(-maxOffsetY, Math.min(maxOffsetY, y)),
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!display.w) return;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  useImperativeHandle(ref, () => ({
    async getCroppedBlob(mime = 'image/jpeg', quality = 0.92) {
      if (!imgNatural.w || !containerSize.w) return null;

      // Map preview-space crop to natural image-space.
      // The visible window in display-space is centered (containerSize) with current offset.
      // Display image size: display.w x display.h
      // Top-left of visible window in display coordinates:
      const visLeft = (display.w - containerSize.w) / 2 - offset.x;
      const visTop = (display.h - containerSize.h) / 2 - offset.y;
      // Convert to natural pixels:
      const ratio = imgNatural.w / display.w; // = 1/scale
      const sx = visLeft * ratio;
      const sy = visTop * ratio;
      const sw = containerSize.w * ratio;
      const sh = containerSize.h * ratio;

      // Output canvas
      const canvas = document.createElement('canvas');
      canvas.width = HERO_OUTPUT_WIDTH;
      canvas.height = HERO_OUTPUT_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Load image fresh to ensure decoded, with CORS for canvas
      const img = await loadImage(src);

      ctx.drawImage(
        img,
        Math.max(0, sx),
        Math.max(0, sy),
        Math.min(sw, imgNatural.w - sx),
        Math.min(sh, imgNatural.h - sy),
        0,
        0,
        HERO_OUTPUT_WIDTH,
        HERO_OUTPUT_HEIGHT,
      );

      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mime, quality),
      );
    },
  }), [src, imgNatural, containerSize, display.w, display.h, offset]);

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border border-primary/30 bg-black/80 select-none"
        style={{ aspectRatio: `${HERO_RATIO}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={(e) => {
              const t = e.currentTarget;
              setImgNatural({ w: t.naturalWidth, h: t.naturalHeight });
            }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: display.w || 'auto',
              height: display.h || 'auto',
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              cursor: dragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              maxWidth: 'none',
              touchAction: 'none',
            }}
          />
        )}
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px]">
          <Move className="w-3 h-3" />
          Arrastra para reencuadrar
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Vista previa al ratio de la ficha. La zona visible será la portada.
      </p>
    </div>
  );
});

HeroCropFrame.displayName = 'HeroCropFrame';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
