import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Volume2, VolumeX } from 'lucide-react';

type CoinSide = 'heads' | 'tails';
type LabelMode = 'id' | 'en';

type FlipCoinProps = {
  onNavigate: (path: string) => void;
  isOwner?: boolean;
};

const FLIP_DURATION_MS = 2450;
const SNAP_TIMES = [
  0.035, 0.125, 0.245, 0.335, 0.425, 0.535,
  0.645, 0.755, 0.895, 1.035, 1.165, 1.295,
  1.445, 1.585, 1.685, 1.775, 1.895, 2.045,
];

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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const timerRef = useRef<number | null>(null);
  const flipLockRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const soundBusRef = useRef<GainNode | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);

  const playFingerSnap = (reducedMotion: boolean) => {
    if (!soundEnabled || typeof window === 'undefined' || !window.AudioContext) return;

    try {
      const AudioContextClass = window.AudioContext;
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      if (context.state === 'suspended') void context.resume().catch(() => undefined);

      const noiseBuffer = noiseBufferRef.current ?? (() => {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.075), context.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < channel.length; index += 1) {
          channel[index] = (Math.random() * 2 - 1) * (0.82 + Math.random() * 0.18);
        }
        noiseBufferRef.current = buffer;
        return buffer;
      })();

      const bus = context.createGain();
      const startAt = context.currentTime + 0.025;
      bus.gain.setValueAtTime(0.52, startAt);
      bus.connect(context.destination);
      soundBusRef.current = bus;

      const scheduleSnap = (offset: number, strength: number) => {
        const at = startAt + offset;

        // Bright, short noise crack: the main finger-snap transient.
        const crack = context.createBufferSource();
        crack.buffer = noiseBuffer;
        const highPass = context.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.setValueAtTime(1450, at);
        highPass.Q.setValueAtTime(0.72, at);
        const crisp = context.createBiquadFilter();
        crisp.type = 'lowpass';
        crisp.frequency.setValueAtTime(8500, at);
        const crackGain = context.createGain();
        crackGain.gain.setValueAtTime(0.0001, at);
        crackGain.gain.exponentialRampToValueAtTime(0.46 * strength, at + 0.0015);
        crackGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.043);
        crack.connect(highPass);
        highPass.connect(crisp);
        crisp.connect(crackGain);
        crackGain.connect(bus);
        crack.start(at);
        crack.stop(at + 0.052);
        audioSourcesRef.current.push(crack);

        // A softer low-mid body gives the click a fleshy snap instead of a UI beep.
        const body = context.createBufferSource();
        body.buffer = noiseBuffer;
        const bodyFilter = context.createBiquadFilter();
        bodyFilter.type = 'lowpass';
        bodyFilter.frequency.setValueAtTime(720, at);
        const bodyGain = context.createGain();
        bodyGain.gain.setValueAtTime(0.0001, at);
        bodyGain.gain.exponentialRampToValueAtTime(0.17 * strength, at + 0.002);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.032);
        body.connect(bodyFilter);
        bodyFilter.connect(bodyGain);
        bodyGain.connect(bus);
        body.start(at);
        body.stop(at + 0.04);
        audioSourcesRef.current.push(body);

        crack.onended = () => {
          crack.disconnect();
          highPass.disconnect();
          crisp.disconnect();
          crackGain.disconnect();
          audioSourcesRef.current = audioSourcesRef.current.filter((source) => source !== crack);
        };
        body.onended = () => {
          body.disconnect();
          bodyFilter.disconnect();
          bodyGain.disconnect();
          audioSourcesRef.current = audioSourcesRef.current.filter((source) => source !== body);
        };
      };

      if (reducedMotion) {
        scheduleSnap(0, 1);
      } else {
        SNAP_TIMES.forEach((time, index) => {
          const variation = 0.88 + ((index * 7) % 5) * 0.035;
          scheduleSnap(time, variation);
        });
      }

      window.setTimeout(() => {
        if (soundBusRef.current === bus) soundBusRef.current = null;
        bus.disconnect();
      }, reducedMotion ? 180 : FLIP_DURATION_MS + 180);
    } catch {
      // Audio is an enhancement: playback failure must never block the coin flip.
    }
  };

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    flipLockRef.current = false;
    audioSourcesRef.current.forEach((source) => {
      try { source.stop(); } catch { /* A completed source cannot be stopped again. */ }
      try { source.disconnect(); } catch { /* Already disconnected. */ }
    });
    audioSourcesRef.current = [];
    soundBusRef.current?.disconnect();
    soundBusRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  const flip = () => {
    // A synchronous ref prevents rapid taps before React updates the disabled state.
    if (flipLockRef.current) return;
    flipLockRef.current = true;

    // One internal outcome remains shared by both language modes.
    const next: CoinSide = Math.random() < 0.5 ? 'heads' : 'tails';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    playFingerSnap(reducedMotion);

    if (reducedMotion) {
      setResult(next);
      setFlipTarget(null);
      setFlipCount((count) => count + 1);
      flipLockRef.current = false;
      return;
    }

    setFlipTarget(next);
    setIsFlipping(true);
    timerRef.current = window.setTimeout(() => {
      setResult(next);
      setFlipTarget(null);
      setIsFlipping(false);
      setFlipCount((count) => count + 1);
      flipLockRef.current = false;
      timerRef.current = null;
    }, FLIP_DURATION_MS);
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
        <div className="flip-coin-tools">
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
          <button
            className={soundEnabled ? 'flip-coin-sound is-on' : 'flip-coin-sound'}
            type="button"
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Matikan suara flip coin' : 'Nyalakan suara flip coin'}
            onClick={() => setSoundEnabled((enabled) => !enabled)}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>{soundEnabled ? 'SOUND ON' : 'SOUND OFF'}</span>
          </button>
        </div>

        <div className={isFlipping ? 'flip-coin-stage is-flipping' : 'flip-coin-stage'}>
          <div className="coin-stage-keylight" aria-hidden="true" />
          <div className="coin-shadow" aria-hidden="true" />
          <div className={coinClass} aria-hidden="true">
            <div className="coin-edge-stack">
              {Array.from({ length: 17 }, (_, index) => (
                <span
                  className="coin-edge-layer"
                  key={index}
                  style={{ transform: `translateZ(${(index - 8) * 2.25}px)` }}
                />
              ))}
            </div>

            <div className="coin-face coin-face-front">
              <div className="coin-face-inset">
                <span className="coin-face-shine" />
                <span className="coin-face-serial">IVORY DIARY <i /> EST. 2024</span>
                <div className="coin-crest coin-crest-front">
                  <span className="coin-crest-letter">I</span>
                  <span className="coin-crest-accent" />
                </div>
                <strong className="coin-face-label">{mode === 'id' ? 'DEPAN' : 'HEADS'}</strong>
                <span className="coin-face-footer"><span>NO. 01</span><span>PURE CHANCE</span></span>
              </div>
            </div>

            <div className="coin-face coin-face-back">
              <div className="coin-face-inset">
                <span className="coin-face-shine" />
                <span className="coin-face-serial">IVORY DIARY <i /> EST. 2024</span>
                <div className="coin-crest coin-crest-back">
                  <span className="coin-crest-letter">II</span>
                  <span className="coin-crest-accent" />
                </div>
                <strong className="coin-face-label">{mode === 'id' ? 'BELAKANG' : 'TAILS'}</strong>
                <span className="coin-face-footer"><span>NO. 02</span><span>PURE CHANCE</span></span>
              </div>
            </div>
          </div>
          <span className="flip-coin-stage-caption" aria-hidden="true">THE IVORY EDITION / 01—02</span>
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
