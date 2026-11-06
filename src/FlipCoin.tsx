import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type CoinSide = 'heads' | 'tails';
type LabelMode = 'id' | 'en';

type FlipCoinProps = {
  onNavigate: (path: string) => void;
  isOwner?: boolean;
};

type CoinSceneHandle = {
  startFlip: (side: CoinSide) => void;
  settle: (side: CoinSide) => void;
};

const FLIP_DURATION_MS = 2800;
const SNAP_TIMES = [
  0.035, 0.125, 0.245, 0.335, 0.425, 0.535,
  0.645, 0.755, 0.895, 1.035, 1.165, 1.295,
  1.445, 1.585, 1.685, 1.775, 1.895, 2.045,
];
const TAU = Math.PI * 2;

function sideLabel(side: CoinSide, mode: LabelMode) {
  if (mode === 'id') return side === 'heads' ? 'Depan' : 'Belakang';
  return side === 'heads' ? 'Heads' : 'Tails';
}

function createIvoryLetter() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.17, -0.31);
  shape.lineTo(0.17, -0.31);
  shape.lineTo(0.17, -0.225);
  shape.lineTo(0.085, -0.225);
  shape.lineTo(0.085, 0.225);
  shape.lineTo(0.17, 0.225);
  shape.lineTo(0.17, 0.31);
  shape.lineTo(-0.17, 0.31);
  shape.lineTo(-0.17, 0.225);
  shape.lineTo(-0.085, 0.225);
  shape.lineTo(-0.085, -0.225);
  shape.lineTo(-0.17, -0.225);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.01,
    curveSegments: 12,
  });
}

function createCoinFace(side: CoinSide, enamel: THREE.MeshPhysicalMaterial, ivory: THREE.MeshPhysicalMaterial, dark: THREE.MeshPhysicalMaterial) {
  const face = new THREE.Group();
  face.position.z = side === 'heads' ? 0.137 : -0.137;
  if (side === 'tails') face.rotation.y = Math.PI;

  const disk = new THREE.Mesh(new THREE.CircleGeometry(1.075, 128), enamel);
  disk.position.z = 0.001;
  disk.receiveShadow = true;
  face.add(disk);

  const addRing = (radius: number, tube: number, z: number, material: THREE.Material) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 160), material);
    ring.position.z = z;
    ring.castShadow = true;
    face.add(ring);
  };

  addRing(1.005, 0.014, 0.012, ivory);
  addRing(0.955, 0.006, 0.014, dark);
  addRing(0.875, 0.009, 0.014, ivory);
  addRing(0.595, 0.017, 0.02, ivory);

  const medallion = new THREE.Mesh(new THREE.CircleGeometry(0.565, 96), dark);
  medallion.position.z = 0.013;
  face.add(medallion);
  const inset = new THREE.Mesh(
    new THREE.CircleGeometry(0.525, 96),
    new THREE.MeshPhysicalMaterial({
      color: '#5E090D',
      metalness: 0.68,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.35,
    }),
  );
  inset.position.z = 0.017;
  face.add(inset);
  addRing(0.515, 0.008, 0.026, ivory);

  const letterGeometry = createIvoryLetter();
  const letter = new THREE.Mesh(letterGeometry, ivory);
  letter.position.set(0, 0, 0.035);
  letter.castShadow = true;
  face.add(letter);

  if (side === 'tails') {
    const secondLetter = new THREE.Mesh(letterGeometry, ivory);
    secondLetter.position.set(0.245, 0, 0.035);
    secondLetter.scale.set(0.72, 1, 1);
    letter.position.x = -0.245;
    face.add(secondLetter);
  }

  const studGeometry = new THREE.SphereGeometry(0.022, 12, 8);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * TAU;
    const stud = new THREE.Mesh(studGeometry, ivory);
    stud.position.set(Math.cos(angle) * 0.77, Math.sin(angle) * 0.77, 0.022);
    stud.scale.set(1, 1, 0.42);
    face.add(stud);
  }

  // Four raised markers create a small, balanced mint-detail motif around the crest.
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * TAU + Math.PI / 4;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.016), ivory);
    marker.position.set(Math.cos(angle) * 0.69, Math.sin(angle) * 0.69, 0.024);
    marker.rotation.z = angle;
    face.add(marker);
  }

  return face;
}

function buildCoin() {
  const coin = new THREE.Group();

  const edgeMetal = new THREE.MeshPhysicalMaterial({
    color: '#C8A58F',
    metalness: 0.96,
    roughness: 0.2,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.8,
  });
  const edgeDark = new THREE.MeshPhysicalMaterial({
    color: '#211A1B',
    metalness: 0.88,
    roughness: 0.27,
    envMapIntensity: 1.4,
  });
  const ivoryMetal = new THREE.MeshPhysicalMaterial({
    color: '#F7F3F3',
    metalness: 0.82,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.65,
  });
  const enamel = new THREE.MeshPhysicalMaterial({
    color: '#800E13',
    metalness: 0.55,
    roughness: 0.26,
    clearcoat: 1,
    clearcoatRoughness: 0.13,
    reflectivity: 0.9,
    envMapIntensity: 1.6,
  });
  const darkEnamel = new THREE.MeshPhysicalMaterial({
    color: '#5E090D',
    metalness: 0.78,
    roughness: 0.23,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.55,
  });

  // A lathed profile produces the actual cylindrical side wall and a rounded bevel on both rims.
  const profile = [
    new THREE.Vector2(0, -0.145),
    new THREE.Vector2(1.025, -0.145),
    new THREE.Vector2(1.085, -0.137),
    new THREE.Vector2(1.135, -0.112),
    new THREE.Vector2(1.16, -0.078),
    new THREE.Vector2(1.16, 0.078),
    new THREE.Vector2(1.135, 0.112),
    new THREE.Vector2(1.085, 0.137),
    new THREE.Vector2(1.025, 0.145),
    new THREE.Vector2(0, 0.145),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 160), edgeMetal);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  coin.add(body);

  // Narrow concentric bevel highlights make the transition from face to edge readable.
  const frontLip = new THREE.Mesh(new THREE.TorusGeometry(1.075, 0.018, 12, 160), ivoryMetal);
  frontLip.position.z = 0.137;
  coin.add(frontLip);
  const backLip = new THREE.Mesh(new THREE.TorusGeometry(1.075, 0.018, 12, 160), ivoryMetal);
  backLip.position.z = -0.137;
  backLip.rotation.y = Math.PI;
  coin.add(backLip);

  // Fine radial ridges are instanced around the circumference, not painted onto a flat image.
  const grooveGeometry = new THREE.BoxGeometry(0.012, 0.017, 0.17);
  const grooves = new THREE.InstancedMesh(grooveGeometry, edgeDark, 112);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 112; index += 1) {
    const angle = (index / 112) * TAU;
    dummy.position.set(Math.cos(angle) * 1.153, Math.sin(angle) * 1.153, 0);
    dummy.rotation.set(0, 0, angle);
    dummy.updateMatrix();
    grooves.setMatrixAt(index, dummy.matrix);
  }
  grooves.instanceMatrix.needsUpdate = true;
  coin.add(grooves);

  coin.add(createCoinFace('heads', enamel, ivoryMetal, darkEnamel));
  coin.add(createCoinFace('tails', enamel, ivoryMetal, darkEnamel));

  return coin;
}

function createSoftShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
  gradient.addColorStop(0.34, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(0.72, 'rgba(0,0,0,0.12)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export default function FlipCoin({ onNavigate, isOwner = false }: FlipCoinProps) {
  const [mode, setMode] = useState<LabelMode>('id');
  const [result, setResult] = useState<CoinSide | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipCount, setFlipCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const flipLockRef = useRef(false);
  const sceneHandleRef = useRef<CoinSceneHandle | null>(null);
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
      // Audio is an enhancement; playback failure must never block the coin flip.
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    let renderer: THREE.WebGLRenderer;
    let environmentTexture: THREE.Texture | null = null;
    let animationFrame = 0;
    let animation: {
      start: number;
      duration: number;
      fromX: number;
      targetX: number;
      spin: number;
    } | null = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    camera.position.set(0, 0.42, 7.45);
    camera.lookAt(0, 0.12, 0);

    let coin: THREE.Group;
    let shadow: THREE.Mesh;
    let shadowMaterial: THREE.MeshBasicMaterial;
    let environment: RoomEnvironment | null = null;
    let pmrem: THREE.PMREMGenerator | null = null;
    let softShadowTexture: THREE.CanvasTexture | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setClearColor('#151011', 0);

      pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      environment = new RoomEnvironment();
      environmentTexture = pmrem.fromScene(environment, 0.04).texture;
      scene.environment = environmentTexture;
      scene.environmentIntensity = 1.05;

      scene.add(new THREE.HemisphereLight('#F7F3F3', '#211A1B', 1.15));

      const keyLight = new THREE.DirectionalLight('#FFF1E7', 4.3);
      keyLight.position.set(-3.6, 4.8, 5.5);
      scene.add(keyLight);

      const warmRim = new THREE.PointLight('#B52A31', 18, 12, 2);
      warmRim.position.set(3.1, 1.6, -2.7);
      scene.add(warmRim);

      const coolEdge = new THREE.PointLight('#F7F3F3', 11, 10, 2);
      coolEdge.position.set(-3.5, -1.2, -1.3);
      scene.add(coolEdge);

      const fillLight = new THREE.DirectionalLight('#B78E81', 1.65);
      fillLight.position.set(2.8, -2.4, 4.2);
      scene.add(fillLight);

      coin = buildCoin();
      coin.rotation.set(0, 0, 0);
      scene.add(coin);

      softShadowTexture = createSoftShadowTexture();
      if (softShadowTexture) {
        shadowMaterial = new THREE.MeshBasicMaterial({
          map: softShadowTexture,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          toneMapped: false,
        });
        shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, -1.175, -0.08);
        scene.add(shadow);
      } else {
        shadowMaterial = new THREE.MeshBasicMaterial({ color: '#090708', transparent: true, opacity: 0.2 });
        shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -1.17;
        scene.add(shadow);
      }

      const resize = () => {
        const width = Math.max(1, stage.clientWidth);
        const height = Math.max(1, stage.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);

      sceneHandleRef.current = {
        startFlip: (side) => {
          const fromX = side === result ? (side === 'tails' ? Math.PI : 0) : coin.rotation.x;
          const targetX = side === 'tails' ? Math.PI : 0;
          const remainder = ((targetX - fromX) % TAU + TAU) % TAU;
          animation = {
            start: performance.now(),
            duration: FLIP_DURATION_MS,
            fromX,
            targetX,
            spin: 9 * TAU + remainder,
          };
        },
        settle: (side) => {
          animation = null;
          coin.rotation.set(side === 'tails' ? Math.PI : 0, 0, 0);
          coin.position.set(0, 0, 0);
          coin.scale.setScalar(1);
          canvas.style.filter = 'none';
        },
      };

      const render = (now: number) => {
        animationFrame = window.requestAnimationFrame(render);

        if (animation) {
          const progress = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
          const angularProgress = 1 - Math.pow(1 - progress, 3.15);
          const lift = Math.sin(progress * Math.PI);
          const wobble = Math.sin(progress * Math.PI * 12) * Math.pow(1 - progress, 1.35) * 0.052;

          coin.rotation.x = animation.fromX + animation.spin * angularProgress + wobble;
          coin.rotation.y = Math.sin(progress * 15.5) * 0.18 * Math.pow(1 - progress, 0.85);
          coin.rotation.z = Math.sin(progress * 12.2 + 0.6) * 0.075 * (1 - progress);
          coin.position.set(Math.sin(progress * Math.PI * 2) * 0.075, lift * 1.28, 0.035 * Math.sin(progress * Math.PI));
          coin.scale.setScalar(1 + lift * 0.055);

          camera.position.y = 0.42 + lift * 0.13;
          camera.position.z = 7.45 - lift * 0.24;
          camera.lookAt(0, 0.12 + lift * 0.2, 0);

          if (shadowMaterial) {
            shadowMaterial.opacity = 0.52 - lift * 0.34;
            shadow.scale.setScalar(1 + lift * 0.48);
          }

          const blur = progress < 0.68
            ? 0.12 + Math.sin((progress / 0.68) * Math.PI) * 0.42
            : 0.42 * (1 - progress) / 0.32;
          canvas.style.filter = 'blur(' + Math.max(0, blur).toFixed(2) + 'px)';

          if (progress >= 1) {
            coin.rotation.set(animation.targetX, 0, 0);
            coin.position.set(0, 0, 0);
            coin.scale.setScalar(1);
            camera.position.set(0, 0.42, 7.45);
            camera.lookAt(0, 0.12, 0);
            canvas.style.filter = 'none';
            if (shadowMaterial) {
              shadowMaterial.opacity = 0.52;
              shadow.scale.setScalar(1);
            }
            animation = null;
          }
        }

        renderer.render(scene, camera);
      };
      animationFrame = window.requestAnimationFrame(render);
      setWebglUnavailable(false);

      return () => {
        window.cancelAnimationFrame(animationFrame);
        resizeObserver.disconnect();
        sceneHandleRef.current = null;
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        softShadowTexture?.dispose();
        environmentTexture?.dispose();
        pmrem?.dispose();
        renderer.dispose();
      };
    } catch {
      setWebglUnavailable(true);
      renderer?.dispose();
      return undefined;
    }
  }, []);

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
    if (flipLockRef.current) return;
    flipLockRef.current = true;

    const next: CoinSide = Math.random() < 0.5 ? 'heads' : 'tails';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    playFingerSnap(reducedMotion);

    if (reducedMotion || !sceneHandleRef.current) {
      sceneHandleRef.current?.settle(next);
      setResult(next);
      setIsFlipping(false);
      setFlipCount((count) => count + 1);
      flipLockRef.current = false;
      return;
    }

    sceneHandleRef.current.startFlip(next);
    setIsFlipping(true);
    timerRef.current = window.setTimeout(() => {
      setResult(next);
      setIsFlipping(false);
      setFlipCount((count) => count + 1);
      flipLockRef.current = false;
      timerRef.current = null;
    }, FLIP_DURATION_MS);
  };

  return (
    <section className="flip-coin-page section-wrap" aria-busy={isFlipping}>
      <div className="flip-coin-heading">
        <div className="flip-coin-heading-copy">
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

        <div className={isFlipping ? 'flip-coin-stage is-flipping' : 'flip-coin-stage'} ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="flip-coin-canvas"
            role="img"
            aria-label="Koin tiga dimensi berbahan enamel merah dan logam ivory"
          />
          {webglUnavailable && (
            <div className="flip-coin-webgl-fallback" role="status">
              Browser ini belum mendukung tampilan 3D WebGL. Coba buka halaman melalui browser terbaru.
            </div>
          )}
          <span className="flip-coin-stage-caption" aria-hidden="true">IVORY DIARY / FULL 3D MINT</span>
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
