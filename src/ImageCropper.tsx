import { useEffect, useRef, useState, type PointerEvent } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Gesture = {
  mode: 'move' | 'resize' | 'draw';
  start: Point;
  original: Rect;
  corner?: Corner;
  anchor?: Point;
};

type Props = {
  file: File;
  onCancel: () => void;
  onComplete: (file: File) => Promise<void> | void;
  busy?: boolean;
  aspectRatio?: number;
};

export default function ImageCropper({
  file, onCancel, onComplete, busy = false, aspectRatio,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [display, setDisplay] = useState<{ x: number; y: number; w: number; h: number; scale: number } | null>(null);
  const [error, setError] = useState('');

  const draw = (rect: Rect | null) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    const imageX = (width - imageWidth) / 2;
    const imageY = (height - imageHeight) / 2;
    setDisplay({ x: imageX, y: imageY, w: imageWidth, h: imageHeight, scale });

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#171313';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);

    if (!rect || rect.w < 2 || rect.h < 2) return;

    // Darken the area that will be removed.
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.drawImage(
      image,
      (rect.x - imageX) / scale,
      (rect.y - imageY) / scale,
      rect.w / scale,
      rect.h / scale,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );

    // Crop frame and composition guides.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 3, rect.y);
    ctx.lineTo(rect.x + rect.w / 3, rect.y + rect.h);
    ctx.moveTo(rect.x + rect.w * 2 / 3, rect.y);
    ctx.lineTo(rect.x + rect.w * 2 / 3, rect.y + rect.h);
    ctx.moveTo(rect.x, rect.y + rect.h / 3);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 3);
    ctx.moveTo(rect.x, rect.y + rect.h * 2 / 3);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 2 / 3);
    ctx.stroke();

    // Large red handles are intentionally easy to grab on a touchscreen.
    const handle = 20;
    const corners: Point[] = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
    ];
    corners.forEach(({ x, y }) => {
      ctx.fillStyle = '#b5232b';
      ctx.fillRect(x - handle / 2, y - handle / 2, handle, handle);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - handle / 2, y - handle / 2, handle, handle);
    });
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(rect.x + rect.w / 2 - 48, rect.y + rect.h / 2 - 13, 96, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GESER AREA', rect.x + rect.w / 2, rect.y + rect.h / 2);
  };

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      const canvas = canvasRef.current;
      if (!canvas || !image.naturalWidth || !image.naturalHeight) {
        setError('Foto tidak dapat disiapkan untuk crop.');
        return;
      }
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      const imageX = (canvas.width - imageWidth) / 2;
      const imageY = (canvas.height - imageHeight) / 2;
      const ratio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
        ? aspectRatio
        : imageWidth / imageHeight;
      let cropWidth = Math.min(imageWidth * 0.9, imageHeight * 0.9 * ratio);
      let cropHeight = cropWidth / ratio;
      if (cropHeight > imageHeight * 0.9) {
        cropHeight = imageHeight * 0.9;
        cropWidth = cropHeight * ratio;
      }
      const initial = {
        x: imageX + (imageWidth - cropWidth) / 2,
        y: imageY + (imageHeight - cropHeight) / 2,
        w: cropWidth,
        h: cropHeight,
      };
      setDisplay({ x: imageX, y: imageY, w: imageWidth, h: imageHeight, scale });
      setSelection(initial);
      setError('');
    };
    image.onerror = () => setError('Foto tidak dapat dibuka. Coba file JPG, PNG, atau WebP lain.');
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      imageRef.current = null;
      gestureRef.current = null;
    };
  }, [file, aspectRatio]);

  useEffect(() => { draw(selection); }, [selection]);

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height,
    };
  };

  const onDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!display || busy) return;
    const p = point(event);
    const inImage = p.x >= display.x && p.y >= display.y &&
      p.x <= display.x + display.w && p.y <= display.y + display.h;
    if (!inImage) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = selection ?? {
      x: display.x + display.w * .05,
      y: display.y + display.h * .05,
      w: display.w * .9,
      h: display.h * .9,
    };
    const inSelection = p.x >= current.x && p.x <= current.x + current.w &&
      p.y >= current.y && p.y <= current.y + current.h;

    if (inSelection) {
      const corners: { key: Corner; x: number; y: number }[] = [
        { key: 'nw', x: current.x, y: current.y },
        { key: 'ne', x: current.x + current.w, y: current.y },
        { key: 'sw', x: current.x, y: current.y + current.h },
        { key: 'se', x: current.x + current.w, y: current.y + current.h },
      ];
      const nearest = corners
        .map(corner => ({ ...corner, distance: Math.hypot(p.x - corner.x, p.y - corner.y) }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (nearest.distance < 42) {
        const anchor = {
          x: nearest.key.includes('w') ? current.x + current.w : current.x,
          y: nearest.key.includes('n') ? current.y + current.h : current.y,
        };
        gestureRef.current = { mode: 'resize', start: p, original: current, corner: nearest.key, anchor };
      } else {
        gestureRef.current = { mode: 'move', start: p, original: current };
      }
    } else {
      gestureRef.current = { mode: 'draw', start: p, original: current };
    }
  };

  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || !display || busy) return;
    event.preventDefault();
    const p = point(event);

    if (gesture.mode === 'move') {
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      setSelection({
        ...gesture.original,
        x: Math.max(display.x, Math.min(display.x + display.w - gesture.original.w, gesture.original.x + dx)),
        y: Math.max(display.y, Math.min(display.y + display.h - gesture.original.h, gesture.original.y + dy)),
      });
      return;
    }

    const anchor = gesture.mode === 'resize' && gesture.anchor ? gesture.anchor : gesture.start;
    const corner = gesture.corner ?? 'se';
    const directionX = gesture.mode === 'resize' && corner.includes('w') ? -1 : 1;
    const directionY = gesture.mode === 'resize' && corner.includes('n') ? -1 : 1;
    const maxWidth = directionX > 0 ? display.x + display.w - anchor.x : anchor.x - display.x;
    const maxHeight = directionY > 0 ? display.y + display.h - anchor.y : anchor.y - display.y;
    let width = Math.max(18, Math.abs(p.x - anchor.x));
    let height = Math.max(18, Math.abs(p.y - anchor.y));
    const ratio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : null;
    if (ratio) {
      width = Math.max(width, height * ratio);
      height = width / ratio;
    }
    width = Math.min(width, maxWidth);
    height = ratio ? width / ratio : Math.min(height, maxHeight);
    if (ratio && height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
    if (width < 12 || height < 12) return;
    setSelection({
      x: directionX > 0 ? anchor.x : anchor.x - width,
      y: directionY > 0 ? anchor.y : anchor.y - height,
      w: width,
      h: height,
    });
  };

  const onUp = () => { gestureRef.current = null; };

  const useWholePhoto = () => {
    if (!display || busy) return;
    setSelection({ x: display.x, y: display.y, w: display.w, h: display.h });
    setError('');
  };

  const resetSelection = () => {
    if (!display || busy) return;
    const ratio = aspectRatio && aspectRatio > 0 ? aspectRatio : display.w / display.h;
    let width = Math.min(display.w * .9, display.h * .9 * ratio);
    let height = width / ratio;
    if (height > display.h * .9) {
      height = display.h * .9;
      width = height * ratio;
    }
    setSelection({
      x: display.x + (display.w - width) / 2,
      y: display.y + (display.h - height) / 2,
      w: width,
      h: height,
    });
    setError('');
  };

  const crop = () => {
    const image = imageRef.current;
    const rect = selection;
    const frame = display;
    if (!image || !frame || !rect || busy) return;
    const sx = Math.max(0, (rect.x - frame.x) / frame.scale);
    const sy = Math.max(0, (rect.y - frame.y) / frame.scale);
    const sw = Math.min(image.naturalWidth - sx, rect.w / frame.scale);
    const sh = Math.min(image.naturalHeight - sy, rect.h / frame.scale);
    if (sw < 1 || sh < 1) {
      setError('Area crop terlalu kecil. Atur ulang area lalu coba lagi.');
      return;
    }
    const output = document.createElement('canvas');
    const factor = Math.min(1, 1600 / Math.max(sw, sh));
    output.width = Math.max(1, Math.round(sw * factor));
    output.height = Math.max(1, Math.round(sh * factor));
    const context = output.getContext('2d');
    if (!context) {
      setError('Browser tidak dapat memproses foto ini.');
      return;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, output.width, output.height);
    output.toBlob(async blob => {
      if (!blob) {
        setError('Gagal membuat hasil crop. Coba lagi.');
        return;
      }
      if (blob.size > 8 * 1024 * 1024) {
        setError('Hasil foto masih terlalu besar. Atur area crop yang lebih kecil lalu coba lagi.');
        return;
      }
      const cropped = new File(
        [blob],
        file.name.replace(/\.[^.]+$/, '') + '-crop.jpg',
        { type: 'image/jpeg', lastModified: Date.now() },
      );
      try {
        await onComplete(cropped);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Upload gagal. Periksa koneksi lalu coba lagi.');
      }
    }, 'image/jpeg', 0.84);
  };

  return (
    <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label="Potong foto">
      <section className="crop-dialog">
        <div className="crop-heading">
          <div><span className="eyebrow">IMAGE / EDIT</span><h2>Atur potongan foto</h2></div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Tutup">×</button>
        </div>
        <div className="crop-help">
          <b>PANDUAN CROP FOTO</b>
          <span><strong>1.</strong> Ketuk dan geser bagian tengah bingkai untuk memindahkan area foto.</span>
          <span><strong>2.</strong> Tarik salah satu kotak merah di sudut untuk memperbesar atau memperkecil potongan.</span>
          <span><strong>3.</strong> Area gelap adalah bagian yang akan dibuang.</span>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={440}
          className="crop-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
        />
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="crop-actions">
          <button className="button secondary" type="button" onClick={resetSelection} disabled={busy}>Atur ulang</button>
          <button className="button secondary" type="button" onClick={useWholePhoto} disabled={busy}>Gunakan seluruh foto</button>
          <button className="button primary" type="button" onClick={crop} disabled={busy || !display || !selection}>
            {busy ? 'Mengunggah foto…' : 'Gunakan hasil crop'}
          </button>
        </div>
      </section>
    </div>
  );
}
