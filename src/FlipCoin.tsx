import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';

type CoinSide = 'heads' | 'tails';
type LabelMode = 'id' | 'en';

type FlipCoinProps = {
  onNavigate: (path: string) => void;
  isOwner?: boolean;
};

function sideLabel(side: CoinSide, mode: LabelMode) {
  if (mode === 'id') return side === 'heads' ? 'Depan' : 'Belakang';
  return side === 'heads' ? 'Heads' : 'Tails';
}

export default function FlipCoin({ onNavigate, isOwner = false }: FlipCoinProps) {
  const [mode, setMode] = useState<LabelMode>('id');
  const [result, setResult] = useState<CoinSide | null>(null);
  const [flipTarget, setFlipTarget] = useState<CoinSide | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipCount, setFlipCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const flip = () => {
    if (isFlipping) return;

    // One internal result is shared by both label modes: exactly 50:50.
    const next: CoinSide = Math.random() < 0.5 ? 'heads' : 'tails';
    setFlipTarget(next);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setResult(next);
      setFlipTarget(null);
      setFlipCount((count) => count + 1);
      return;
    }

    setIsFlipping(true);
    timerRef.current = window.setTimeout(() => {
      setResult(next);
      setFlipTarget(null);
      setIsFlipping(false);
      setFlipCount((count) => count + 1);
      timerRef.current = null;
    }, 1050);
  };

  const coinClass = isFlipping
    ? `coin-shell coin-shell--flipping-${flipTarget}`
    : result
      ? `coin-shell coin-shell--${result}`
      : 'coin-shell';

  return (
    <section className="flip-coin-page section-wrap" aria-busy={isFlipping}>
      <div className="flip-coin-heading">
        <div>
          <p className="eyebrow">IVORY DIARY / RANDOM TOOL</p>
          <h1>Flip <em>Coin.</em></h1>
          <p className="flip-coin-description">
            Satu lemparan, dua kemungkinan. Setiap sisi memiliki peluang yang sama.
          </p>
        </div>
        {isOwner && (
          <button className="flip-owner-back" type="button" onClick={() => onNavigate('/owner')}>
            <ArrowLeft size={15} /> Kembali ke Workspace Owner
          </button>
        )}
      </div>

      <div className="flip-coin-panel">
        <div className="flip-coin-mode-wrap">
          <span className="flip-coin-overline">FORMAT HASIL</span>
          <div className="flip-coin-mode" role="group" aria-label="Pilih format keterangan hasil">
            <button
              type="button"
              aria-pressed={mode === 'id'}
              className={mode === 'id' ? 'active' : ''}
              onClick={() => setMode('id')}
            >
              Depan / Belakang
            </button>
            <button
              type="button"
              aria-pressed={mode === 'en'}
              className={mode === 'en' ? 'active' : ''}
              onClick={() => setMode('en')}
            >
              Heads / Tails
            </button>
          </div>
        </div>

        <div className="flip-coin-stage">
          <div className="coin-shadow" aria-hidden="true" />
          <div className={coinClass} aria-hidden="true">
            <div className="coin-face coin-face-front">
              <span className="coin-monogram">ID</span>
              <strong>{mode === 'id' ? 'DEPAN' : 'HEADS'}</strong>
              <small>IVORY DIARY</small>
            </div>
            <div className="coin-face coin-face-back">
              <span className="coin-monogram">ID</span>
              <strong>{mode === 'id' ? 'BELAKANG' : 'TAILS'}</strong>
              <small>IVORY DIARY</small>
            </div>
          </div>
        </div>

        <div className="flip-coin-outcome" aria-live="polite" aria-atomic="true">
          <span className="flip-coin-overline">{isFlipping ? 'SEDANG DILEMPAR' : 'HASIL'}</span>
          <strong>{isFlipping ? '…' : result ? sideLabel(result, mode) : '—'}</strong>
        </div>

        <button className="button primary flip-coin-button" type="button" onClick={flip} disabled={isFlipping}>
          <span>{isFlipping ? 'Flipping…' : 'Flip Coin'}</span>
          <RefreshCw size={16} aria-hidden="true" />
        </button>

        <p className="flip-coin-note">Peluang 50% untuk setiap sisi. Hasil sebelumnya tidak memengaruhi lemparan berikutnya.</p>
        <div className="flip-coin-count">
          <span>JUMLAH LEMPARAN</span>
          <strong>{flipCount.toString().padStart(2, '0')}</strong>
        </div>
      </div>
    </section>
  );
}
