import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Gesture = { mode: 'move' | 'resize' | 'draw'; start: Point; original: Rect; corner?: Corner; anchor?: Point };
type Preset = 'original' | 'square' | 'portrait' | 'portraitThreeFour' | 'landscape' | 'landscapeFourThree';
type Props = {
  file: File;
  onCancel: () => void;
  onComplete: (file: File) => Promise<void> | void;
  busy?: boolean;
  aspectRatio?: number;
  maxOutputBytes?: number;
};

const presetNames: Record<Preset, string> = {
  original: 'Asli',
  square: '1 : 1',
  portrait: '4 : 5',
  portraitThreeFour: '3 : 4',
  landscapeFourThree: '4 : 3',
  landscape: '16 : 9',
};

export default function ImageCropper({ file, onCancel, onComplete, busy = false, aspectRatio, maxOutputBytes = 8 * 1024 * 1024 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [display, setDisplay] = useState<{ x: number; y: number; w: number; h: number; scale: number } | null>(null);
  const [sourceRatio, setSourceRatio] = useState(1);
  const [preset, setPreset] = useState<Preset>(aspectRatio === 4 / 5 ? 'portrait' : 'original');
  const [mode, setMode] = useState<'automatic' | 'manual'>('automatic');
  const [error, setError] = useState('');

  const ratioForPreset = (value: Preset, originalRatio: number) => {
    if (value === 'square') return 1;
    if (value === 'portrait') return 4 / 5;
    if (value === 'portraitThreeFour') return 3 / 4;
    if (value === 'landscapeFourThree') return 4 / 3;
    if (value === 'landscape') return 16 / 9;
    return originalRatio;
  };

  const currentRatio = useMemo(
    () => mode === 'manual' ? null : ratioForPreset(preset, sourceRatio),
    [mode, preset, sourceRatio],
  );

  const fitSelection = (frame: NonNullable<typeof display>, ratio: number): Rect => {
    let width = Math.min(frame.w * .88, frame.h * .88 * ratio);
    let height = width / ratio;
    if (height > frame.h * .88) {
      height = frame.h * .88;
      width = height * ratio;
    }
    return {
      x: frame.x + (frame.w - width) / 2,
      y: frame.y + (frame.h - height) / 2,
      w: width,
      h: height,
    };
  };

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
    const frame = { x: imageX, y: imageY, w: imageWidth, h: imageHeight, scale };
    setDisplay(frame);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#171313';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, imageX, imageY, imageWidth, imageHeight);
    if (!rect || rect.w < 2 || rect.h < 2) return;

    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    ctx.drawImage(
      image,
      (rect.x - imageX) / scale,
      (rect.y - imageY) / scale,
      rect.w / scale,
      rect.h / scale,
      rect.x, rect.y, rect.w, rect.h,
    );

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 3, rect.y); ctx.lineTo(rect.x + rect.w / 3, rect.y + rect.h);
    ctx.moveTo(rect.x + rect.w * 2 / 3, rect.y); ctx.lineTo(rect.x + rect.w * 2 / 3, rect.y + rect.h);
    ctx.moveTo(rect.x, rect.y + rect.h / 3); ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 3);
    ctx.moveTo(rect.x, rect.y + rect.h * 2 / 3); ctx.lineTo(rect.x + rect.w, rect.y + rect.h * 2 / 3);
    ctx.stroke();

    const handle = 22;
    const corners: Point[] = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
    ];
    corners.forEach(({ x, y }) => {
      ctx.fillStyle = '#b5232b';
      ctx.fillRect(x - handle / 2, y - handle / 2, handle, handle);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - handle / 2, y - handle / 2, handle, handle);
    });
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
        setError('Foto tidak dapat disiapkan. Pilih file lain.');
        return;
      }
      const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const imageWidth = image.naturalWidth * scale;
      const imageHeight = image.naturalHeight * scale;
      const frame = {
        x: (canvas.width - imageWidth) / 2,
        y: (canvas.height - imageHeight) / 2,
        w: imageWidth,
        h: imageHeight,
        scale,
      };
      const ratio = aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
        ? aspectRatio
        : image.naturalWidth / image.naturalHeight;
      const initialPreset: Preset = Math.abs(ratio - 4 / 5) < .001 ? 'portrait' : 'original';
      setSourceRatio(image.naturalWidth / image.naturalHeight);
      setPreset(initialPreset);
      setMode('automatic');
      setDisplay(frame);
      setSelection(fitSelection(frame, ratio));
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

  useEffect(() => {
    if (imageRef.current) draw(selection);
  }, [selection]);

  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height,
    };
  };

  const onDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!display || !selection || busy) return;
    const p = point(event);
    const insideImage = p.x >= display.x && p.y >= display.y &&
      p.x <= display.x + display.w && p.y <= display.y + display.h;
    if (!insideImage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const insideCrop = p.x >= selection.x && p.x <= selection.x + selection.w &&
      p.y >= selection.y && p.y <= selection.y + selection.h;
    if (insideCrop) {
      const corners: { key: Corner; x: number; y: number }[] = [
        { key: 'nw', x: selection.x, y: selection.y },
        { key: 'ne', x: selection.x + selection.w, y: selection.y },
        { key: 'sw', x: selection.x, y: selection.y + selection.h },
        { key: 'se', x: selection.x + selection.w, y: selection.y + selection.h },
      ];
      const nearest = corners
        .map(item => ({ ...item, distance: Math.hypot(p.x - item.x, p.y - item.y) }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (nearest.distance <= 44) {
        const anchor = {
          x: nearest.key.includes('w') ? selection.x + selection.w : selection.x,
          y: nearest.key.includes('n') ? selection.y + selection.h : selection.y,
        };
        gestureRef.current = { mode: 'resize', start: p, original: selection, corner: nearest.key, anchor };
      } else {
        gestureRef.current = { mode: 'move', start: p, original: selection };
      }
    } else {
      gestureRef.current = { mode: 'draw', start: p, original: selection };
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
    const dirX = gesture.mode === 'resize'
      ? (corner.includes('w') ? -1 : 1)
      : (p.x < gesture.start.x ? -1 : 1);
    const dirY = gesture.mode === 'resize'
      ? (corner.includes('n') ? -1 : 1)
      : (p.y < gesture.start.y ? -1 : 1);
    const maxW = dirX > 0 ? display.x + display.w - anchor.x : anchor.x - display.x;
    const maxH = dirY > 0 ? display.y + display.h - anchor.y : anchor.y - display.y;
    let width = Math.max(16, Math.abs(p.x - anchor.x));
    let height = Math.max(16, Math.abs(p.y - anchor.y));
    if (currentRatio) {
      width = Math.max(width, height * currentRatio);
      height = width / currentRatio;
    }
    width = Math.min(width, maxW);
    height = currentRatio ? width / currentRatio : Math.min(height, maxH);
    if (currentRatio && height > maxH) {
      height = maxH;
      width = height * currentRatio;
    }
    if (width < 12 || height < 12) return;
    setSelection({
      x: dirX > 0 ? anchor.x : anchor.x - width,
      y: dirY > 0 ? anchor.y : anchor.y - height,
      w: width,
      h: height,
    });
  };

  const onUp = () => { gestureRef.current = null; };

  const nudgeSelection = (horizontal: number, vertical: number) => {
    if (!display || !selection) return;
    const stepX = display.w * 0.025;
    const stepY = display.h * 0.025;
    setSelection({
      ...selection,
      x: Math.max(display.x, Math.min(display.x + display.w - selection.w, selection.x + horizontal * stepX)),
      y: Math.max(display.y, Math.min(display.y + display.h - selection.h, selection.y + vertical * stepY)),
    });
  };

  const setManualDimension = (axis: 'width' | 'height', percent: number) => {
    if (!display || !selection) return;
    const nextSize = (axis === 'width' ? display.w : display.h) * Math.max(15, Math.min(100, percent)) / 100;
    if (axis === 'width') {
      const center = selection.x + selection.w / 2;
      const width = Math.min(display.w, nextSize);
      setSelection({
        ...selection,
        x: Math.max(display.x, Math.min(display.x + display.w - width, center - width / 2)),
        w: width,
      });
    } else {
      const center = selection.y + selection.h / 2;
      const height = Math.min(display.h, nextSize);
      setSelection({
        ...selection,
        y: Math.max(display.y, Math.min(display.y + display.h - height, center - height / 2)),
        h: height,
      });
    }
  };

  const changePreset = (value: Preset) => {
    setPreset(value);
    setMode('automatic');
    if (display) setSelection(fitSelection(display, ratioForPreset(value, sourceRatio)));
  };

  const changeMode = (next: 'automatic' | 'manual') => {
    setMode(next);
    setError('');
    if (next === 'automatic' && display) {
      setSelection(fitSelection(display, ratioForPreset(preset, sourceRatio)));
    }
  };

  const reset = () => {
    if (display) setSelection(fitSelection(display, currentRatio ?? sourceRatio));
    setError('');
  };

  const useWholePhoto = () => {
    if (!display) return;
    setSelection({ x: display.x, y: display.y, w: display.w, h: display.h });
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
      setError('Area crop tidak valid. Atur ulang lalu coba lagi.');
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
      if (blob.size > maxOutputBytes) {
        const maxMb = (maxOutputBytes / (1024 * 1024)).toLocaleString('id-ID', { maximumFractionDigits: 1 });
        setError('Hasil foto terlalu besar. Ukuran maksimal ' + maxMb + ' MB; perkecil area crop lalu coba lagi.');
        return;
      }
      const cropped = new File(
        [blob],
        (file.name.lastIndexOf('.') > 0 ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name) + '-crop.jpg',
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
    <section className="crop-editor-card" aria-label="Editor pemotongan foto">
      <div className="crop-editor-top">
        <div>
          <span className="eyebrow">IMAGE / EDIT</span>
          <h2>Atur area foto</h2>
          <p className="crop-file-name">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>
        </div>
        <button type="button" className="crop-cancel-button" onClick={onCancel} disabled={busy}>Batal</button>
      </div>

      <div className="crop-mode-switch" aria-label="Mode crop">
        <button type="button" className={mode === 'automatic' ? 'active' : ''} onClick={() => changeMode('automatic')} disabled={busy}>Ukuran otomatis</button>
        <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => changeMode('manual')} disabled={busy}>Crop manual</button>
      </div>

      {mode === 'automatic' ? (
        <div className="crop-preset-row">
          {(['original', 'square', 'portraitThreeFour', 'portrait', 'landscapeFourThree', 'landscape'] as Preset[]).map(item => (
            <button type="button" key={item} className={preset === item ? 'active' : ''} onClick={() => changePreset(item)} disabled={busy}>
              {presetNames[item]}
            </button>
          ))}
        </div>
      ) : (
        <div className="crop-manual-note">
          Atur posisi dengan tombol arah dan ubah lebar atau tinggi menggunakan slider. Anda juga tetap bisa menggeser bingkai pada foto.
        </div>
      )}

      <div className="crop-instructions">
        <div><b>1</b><span><strong>Geser</strong> bagian tengah bingkai untuk memilih posisi foto.</span></div>
        <div><b>2</b><span><strong>Tarik</strong> kotak merah di sudut untuk mengubah ukuran.</span></div>
        <div><b>3</b><span><strong>Area gelap</strong> adalah bagian yang akan dipotong.</span></div>
      </div>

      <div className="crop-canvas-wrap">
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
      </div>
      {mode === 'manual' && display && selection && (
        <div className="crop-manual-controls">
          <div className="crop-position-controls">
            <div>
              <b>POSISI AREA CROP</b>
              <span>Geser sedikit demi sedikit tanpa menarik foto.</span>
            </div>
            <div className="crop-direction-pad" aria-label="Kontrol posisi crop">
              <span />
              <button type="button" aria-label="Geser ke atas" onClick={() => nudgeSelection(0, -1)} disabled={busy}>↑</button>
              <span />
              <button type="button" aria-label="Geser ke kiri" onClick={() => nudgeSelection(-1, 0)} disabled={busy}>←</button>
              <button type="button" className="crop-direction-center" onClick={reset} disabled={busy} aria-label="Atur ulang posisi">•</button>
              <button type="button" aria-label="Geser ke kanan" onClick={() => nudgeSelection(1, 0)} disabled={busy}>→</button>
              <span />
              <button type="button" aria-label="Geser ke bawah" onClick={() => nudgeSelection(0, 1)} disabled={busy}>↓</button>
              <span />
            </div>
          </div>
          <div className="crop-size-controls">
            <label>
              <span><b>Lebar area</b><output>{Math.round(selection.w / display.w * 100)}%</output></span>
              <input type="range" min="15" max="100" step="1" value={Math.max(15,Math.min(100,Math.round(selection.w / display.w * 100)))} onChange={event => setManualDimension('width', Number(event.target.value))} disabled={busy}/>
            </label>
            <label>
              <span><b>Tinggi area</b><output>{Math.round(selection.h / display.h * 100)}%</output></span>
              <input type="range" min="15" max="100" step="1" value={Math.max(15,Math.min(100,Math.round(selection.h / display.h * 100)))} onChange={event => setManualDimension('height', Number(event.target.value))} disabled={busy}/>
            </label>
          </div>
        </div>
      )}
      {error && <p className="crop-error" role="alert">{error}</p>}

      <div className="crop-editor-actions">
        <button type="button" className="crop-action-secondary" onClick={reset} disabled={busy}>Atur ulang</button>
        <button type="button" className="crop-action-secondary" onClick={useWholePhoto} disabled={busy}>Gunakan seluruh foto</button>
        <button type="button" className="crop-action-primary" onClick={crop} disabled={busy || !selection || !display}>
          {busy ? 'Mengunggah…' : 'Gunakan hasil crop'}
        </button>
      </div>
    </section>
  );
}
