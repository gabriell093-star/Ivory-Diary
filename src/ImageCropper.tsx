import { useEffect, useRef, useState, type PointerEvent } from 'react';

type Props = { file: File; onCancel: () => void; onComplete: (file: File) => void; busy?: boolean };

export default function ImageCropper({ file, onCancel, onComplete, busy = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [display, setDisplay] = useState<{ x: number; y: number; w: number; h: number; scale: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { imageRef.current = image; draw(null); };
    image.onerror = () => setError('Foto tidak dapat dibuka. Coba file JPG, PNG, atau WebP lain.');
    image.src = url;
    return () => { URL.revokeObjectURL(url); imageRef.current = null; };
  }, [file]);

  const draw = (rect: typeof selection) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width, height = canvas.height;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    const x = (width - w) / 2, y = (height - h) / 2;
    setDisplay({ x, y, w, h, scale });
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#171313';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, x, y, w, h);
    if (rect && rect.w > 1 && rect.h > 1) {
      ctx.fillStyle = 'rgba(0,0,0,.52)';
      ctx.fillRect(x, y, w, h);
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      ctx.drawImage(image,
        (rect.x - x) / scale, (rect.y - y) / scale, rect.w / scale, rect.h / scale,
        rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.setLineDash([]);
    }
  };

  useEffect(() => { draw(selection); }, [selection]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  };
  const onDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!display || busy) return;
    const p = point(event);
    if (p.x < display.x || p.y < display.y || p.x > display.x + display.w || p.y > display.y + display.h) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = p;
    setSelection({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!startRef.current || !display) return;
    const p = point(event), start = startRef.current;
    const x1 = Math.max(display.x, Math.min(start.x, p.x));
    const y1 = Math.max(display.y, Math.min(start.y, p.y));
    const x2 = Math.min(display.x + display.w, Math.max(start.x, p.x));
    const y2 = Math.min(display.y + display.h, Math.max(start.y, p.y));
    setSelection({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  };
  const onUp = () => { startRef.current = null; };

  const crop = () => {
    const image = imageRef.current, rect = selection, frame = display;
    if (!image || !frame || busy) return;
    const valid = rect && rect.w > 8 && rect.h > 8 ? rect : { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
    const sx = Math.max(0, (valid.x - frame.x) / frame.scale);
    const sy = Math.max(0, (valid.y - frame.y) / frame.scale);
    const sw = Math.min(image.naturalWidth - sx, valid.w / frame.scale);
    const sh = Math.min(image.naturalHeight - sy, valid.h / frame.scale);
    if (sw < 1 || sh < 1) { setError('Area crop terlalu kecil. Pilih area yang lebih besar.'); return; }
    const out = document.createElement('canvas');
    const factor = Math.min(1, 2000 / Math.max(sw, sh));
    out.width = Math.max(1, Math.round(sw * factor));
    out.height = Math.max(1, Math.round(sh * factor));
    const ctx = out.getContext('2d');
    if (!ctx) { setError('Browser tidak dapat memproses foto ini.'); return; }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, out.width, out.height);
    out.toBlob(blob => {
      if (!blob) { setError('Gagal membuat hasil crop. Coba lagi.'); return; }
      onComplete(new File([blob], file.name.replace(/\.[^.]+$/, '') + '-crop.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', 0.92);
  };

  return <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label="Potong foto">
    <section className="crop-dialog">
      <div className="crop-heading"><div><span className="eyebrow">IMAGE / EDIT</span><h2>Atur potongan foto</h2></div><button type="button" onClick={onCancel} disabled={busy} aria-label="Tutup">×</button></div>
      <p className="crop-instruction">Sentuh lalu tarik pada foto untuk memilih area crop. Ukuran dan rasio bebas. Jika tidak memilih area, foto digunakan utuh.</p>
      <canvas ref={canvasRef} width={640} height={440} className="crop-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}/>
      {error && <p className="error-text">{error}</p>}
      <div className="crop-actions"><button className="button secondary" type="button" onClick={() => { setSelection(null); setError(''); }} disabled={busy}>Reset pilihan</button><button className="button primary" type="button" onClick={crop} disabled={busy || !display}>{busy ? 'Memproses…' : 'Gunakan foto'}</button></div>
    </section>
  </div>;
}
