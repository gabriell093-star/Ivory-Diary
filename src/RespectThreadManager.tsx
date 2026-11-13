import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { BookOpen, Check, ExternalLink, ImagePlus, Link2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import ImageCropper from './ImageCropper';
import { ADMIN_URL, PUBLIC_SUPABASE_KEY, adminRequest } from './lib';

type MediaItem = { path: string; url: string };
type ThreadContent = { description: string; links: string[]; images: MediaItem[]; level?: string };
type StatKey = 'attack_potency' | 'durability' | 'speed' | 'stamina';
type EvidenceFeat = ThreadContent & { id: string };
type EvidenceEntry = { id: string; name: string; feats: EvidenceFeat[] };
type ThreadSection = ThreadContent & {
  categories?: Record<StatKey, ThreadContent>;
  entries?: EvidenceEntry[];
};
type SectionKey = 'introduction' | 'terminology' | 'cosmology' | 'personality' | 'in_char' | 'statistic' | 'resistance' | 'hax_ability';
type EvidenceSectionKey = 'resistance' | 'hax_ability';
type ThreadSections = Record<SectionKey, ThreadSection>;
type ThreadRecord = {
  id: string;
  slug: string;
  title: string;
  character_name: string;
  universe: string;
  sections: ThreadSections;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
};
type Draft = Omit<ThreadRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string };
type UploadTarget =
  | { kind: 'section'; key: SectionKey }
  | { kind: 'statistic'; category: StatKey }
  | { kind: 'feat'; section: EvidenceSectionKey; entryId: string; featId: string };

const statMeta: { key: StatKey; label: string }[] = [
  { key: 'attack_potency', label: 'Attack Potency' },
  { key: 'durability', label: 'Durability' },
  { key: 'speed', label: 'Speed' },
  { key: 'stamina', label: 'Stamina' },
];

const sectionMeta: { key: SectionKey; label: string; hint: string; maxWords: number }[] = [
  { key: 'introduction', label: 'Introduction', hint: 'Pengenalan karakter, identitas, dan konteks utama. Maksimal 2.000 kata; tanpa referensi tautan dan hanya satu foto.', maxWords: 2000 },
  { key: 'terminology', label: 'Terminology', hint: 'Istilah, konsep, nama khusus, dan definisi yang digunakan dalam pembahasan. Maksimal 15.000 kata.', maxWords: 15000 },
  { key: 'cosmology', label: 'Cosmology', hint: 'Struktur dunia, alam, dimensi, ruang, waktu, dan skala kosmologi. Maksimal 15.000 kata.', maxWords: 15000 },
  { key: 'personality', label: 'Personality', hint: 'Karakterisasi, kepribadian, pola pikir, motivasi, dan kecenderungan perilaku. Maksimal 15.000 kata.', maxWords: 15000 },
  { key: 'in_char', label: 'BIQ', hint: 'Battle IQ: strategi, pengambilan keputusan, kecerdikan, dan respons karakter dalam situasi bertarung. Maksimal 15.000 kata.', maxWords: 15000 },
  { key: 'statistic', label: 'Statistics', hint: 'Empat metrik terpisah: Attack Potency, Durability, Speed, dan Stamina. Batas 15.000 kata dihitung gabungan untuk seluruh kategori.', maxWords: 15000 },
  { key: 'resistance', label: 'Resistances', hint: 'Daftarkan setiap jenis resistansi sebagai entri tersendiri dan lampirkan satu atau beberapa Feat pendukung. Batas 15.000 kata berlaku untuk seluruh bagian ini.', maxWords: 15000 },
  { key: 'hax_ability', label: 'Hax & Ability', hint: 'Daftarkan setiap kemampuan sebagai entri tersendiri dan lampirkan satu atau beberapa Feat pendukung. Batas 15.000 kata berlaku untuk seluruh bagian ini.', maxWords: 15000 },
];

const blankContent = (): ThreadContent => ({ description: '', links: [], images: [] });
const blankStatContent = (): ThreadContent => ({ ...blankContent(), level: '' });
const blankCategories = (): Record<StatKey, ThreadContent> => ({
  attack_potency: blankStatContent(),
  durability: blankStatContent(),
  speed: blankStatContent(),
  stamina: blankStatContent(),
});
const blankSections = (): ThreadSections => ({
  introduction: blankContent(),
  terminology: blankContent(),
  cosmology: blankContent(),
  personality: blankContent(),
  in_char: blankContent(),
  statistic: { ...blankContent(), categories: blankCategories() },
  resistance: { ...blankContent(), entries: [] },
  hax_ability: { ...blankContent(), entries: [] },
});

const newDraft = (): Draft => ({
  slug: '',
  title: '',
  character_name: '',
  universe: '',
  sections: blankSections(),
  is_published: true,
});

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_INTRODUCTION_IMAGES = 1;
const RESPECT_LINK_PATTERN = /(?:\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|(?<![\w@.-])(?=[a-z0-9-]{2,}\.)(?=[a-z0-9-]*[a-z])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?::\d+)?(?:\/[^\s<>()]*)?|\blocalhost(?::\d+)?(?:\/[^\s<>()]*)?)/iu;
const words = (value: string) => value.trim() ? value.trim().split(/\s+/u).length : 0;
const containsRespectLink = (value: string) => RESPECT_LINK_PATTERN.test(value);
const isValidHttpReference = (value: string) => {
  const numbered = value.trim().match(/^(?:\d{1,4}[.)]|\[\d{1,4}\])\s*(https?:\/\/\S+)$/i);
  const candidate = numbered?.[1] || value.trim();
  if (!/^https?:\/\//i.test(candidate) || /\s/u.test(candidate)) return false;
  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};
const referenceTextWords = (references: string[]) => references.reduce((sum, value) => {
  const reference = value.trim();
  if (!reference || isValidHttpReference(reference)) return sum;
  return sum + words(reference);
}, 0);
const makeSlug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'rt-' + Date.now() + '-' + Math.random().toString(36).slice(2);

const normalizeContent = (value: unknown): ThreadContent => {
  if (!value || typeof value !== 'object') return blankContent();
  const data = value as Record<string, any>;
  return {
    description: typeof data.description === 'string' ? data.description : '',
    links: Array.isArray(data.links)
      ? data.links.filter((link: unknown) => typeof link === 'string')
      : (typeof data.link === 'string' && data.link.trim() ? [data.link] : []),
    images: Array.isArray(data.images)
      ? data.images.filter((image: any) => image && typeof image.path === 'string' && typeof image.url === 'string')
      : [],
  };
};

const normalizeSections = (value: unknown): ThreadSections => {
  const fallback = blankSections();
  if (!value || typeof value !== 'object') return fallback;
  const data = value as Record<string, any>;
  for (const meta of sectionMeta) {
    const section = data[meta.key];
    if (!section || typeof section !== 'object') continue;
    const content = normalizeContent(section);
    fallback[meta.key] = { ...content };
    if (meta.key === 'statistic') {
      const categories = section.categories && typeof section.categories === 'object' ? section.categories : {};
      fallback.statistic.categories = {
        attack_potency: { ...normalizeContent(categories.attack_potency), level: typeof categories.attack_potency?.level === 'string' ? categories.attack_potency.level : '' },
        durability: { ...normalizeContent(categories.durability), level: typeof categories.durability?.level === 'string' ? categories.durability.level : '' },
        speed: { ...normalizeContent(categories.speed), level: typeof categories.speed?.level === 'string' ? categories.speed.level : '' },
        stamina: { ...normalizeContent(categories.stamina), level: typeof categories.stamina?.level === 'string' ? categories.stamina.level : '' },
      };
    }
    if (meta.key === 'resistance' || meta.key === 'hax_ability') {
      fallback[meta.key].entries = Array.isArray(section.entries)
        ? section.entries.filter((entry: any) => entry && typeof entry === 'object').map((entry: any) => ({
          id: typeof entry.id === 'string' && entry.id ? entry.id : makeId(),
          name: typeof entry.name === 'string' ? entry.name : '',
          feats: Array.isArray(entry.feats) ? entry.feats.filter((feat: any) => feat && typeof feat === 'object').map((feat: any) => ({
            ...normalizeContent(feat),
            id: typeof feat.id === 'string' && feat.id ? feat.id : makeId(),
          })) : [],
        }))
        : [];
    }
  }
  return fallback;
};

const contentIsFilled = (content?: ThreadContent | null) => Boolean(
  content && (content.description.trim() || content.links.some(link => link.trim()) || content.images.length || content.level?.trim()),
);
const sectionContents = (section: ThreadSection, key: SectionKey): ThreadContent[] => {
  const contents: ThreadContent[] = [section];
  if (key === 'statistic') {
    for (const meta of statMeta) contents.push(section.categories?.[meta.key] || blankStatContent());
  }
  if (key === 'resistance' || key === 'hax_ability') {
    for (const entry of section.entries || []) contents.push(...entry.feats);
  }
  return contents;
};
const sectionWordCount = (section: ThreadSection, key: SectionKey) => sectionContents(section, key).reduce((sum, content) => sum + words(content.description) + words(content.level || ''), 0);
const totalWords = (sections: ThreadSections) => sectionMeta.reduce((sum, meta) => sum + sectionWordCount(sections[meta.key], meta.key), 0);
const sectionIsFilled = (section: ThreadSection, key: SectionKey) => {
  if (contentIsFilled(section)) return true;
  if (key === 'statistic' && statMeta.some(meta => contentIsFilled(section.categories?.[meta.key]))) return true;
  if ((key === 'resistance' || key === 'hax_ability') && (section.entries || []).some(entry => entry.name.trim() || entry.feats.some(contentIsFilled))) return true;
  return false;
};

export default function RespectThreadManager({ token, onNavigate }: { token: string; onNavigate: (path: string) => void }) {
  const [items, setItems] = useState<ThreadRecord[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('introduction');
  const [activeStatCategory, setActiveStatCategory] = useState<StatKey>('attack_potency');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<UploadTarget | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const newUploadPathsRef = useRef<string[]>([]);

  const wordCount = useMemo(() => totalWords(draft?.sections || blankSections()), [draft?.sections]);
  const filledSections = useMemo(
    () => sectionMeta.filter(meta => draft && sectionIsFilled(draft.sections[meta.key], meta.key)).length,
    [draft?.sections],
  );
  const progressPercent = Math.round((filledSections / sectionMeta.length) * 100);
  const activeMeta = sectionMeta.find(section => section.key === activeSection)!;
  const activeContent = draft?.sections[activeSection] || blankSections()[activeSection];
  const activeSectionWords = draft ? sectionWordCount(activeContent, activeSection) : 0;

  const cleanupUploadedMedia = async () => {
    const paths = [...new Set(newUploadPathsRef.current)];
    if (!paths.length) return;
    const remaining: string[] = [];
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      try {
        await adminRequest(token, 'cleanup-media', { paths: batch });
      } catch (error) {
        console.warn('Respect Thread temporary media cleanup failed:', error);
        remaining.push(...batch);
      }
    }
    newUploadPathsRef.current = remaining;
  };

  const abandonDraft = async () => {
    if (saving || cropBusy) return;
    await cleanupUploadedMedia();
    setCropFile(null);
    setCropTarget(null);
    setDraft(null);
    setNotice('Perubahan yang belum disimpan dibatalkan.');
  };

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ data: ThreadRecord[] }>(token, 'list&table=respect_threads', {}, 'GET');
      setItems((result.data || []).map(item => ({ ...item, sections: normalizeSections(item.sections) })));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Daftar Respect Thread gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchThreads(); }, [token]);

  const startNew = () => {
    setDraft(newDraft());
    setActiveSection('introduction');
    setActiveStatCategory('attack_potency');
    setSlugTouched(false);
    setNotice('');
  };

  const startEdit = (item: ThreadRecord) => {
    setDraft({
      id: item.id,
      slug: item.slug,
      title: item.title,
      character_name: item.character_name || '',
      universe: item.universe || '',
      sections: normalizeSections(item.sections),
      is_published: item.is_published,
    });
    setActiveSection('introduction');
    setActiveStatCategory('attack_potency');
    setSlugTouched(true);
    setNotice('');
  };

  const updateEvidenceEntries = (
    key: EvidenceSectionKey,
    updater: (entries: EvidenceEntry[]) => EvidenceEntry[],
  ) => {
    setDraft(current => {
      if (!current) return current;
      const section = current.sections[key];
      return {
        ...current,
        sections: {
          ...current.sections,
          [key]: { ...section, entries: updater(section.entries || []) },
        },
      };
    });
  };

  const getTargetContent = (currentDraft: Draft | null, target: UploadTarget): ThreadContent => {
    if (!currentDraft) return blankContent();
    if (target.kind === 'section') return currentDraft.sections[target.key];
    if (target.kind === 'statistic') return currentDraft.sections.statistic.categories?.[target.category] || blankStatContent();
    const entry = (currentDraft.sections[target.section].entries || []).find(item => item.id === target.entryId);
    return entry?.feats.find(feat => feat.id === target.featId) || blankContent();
  };

  const updateTargetContent = (
    target: UploadTarget,
    change: Partial<ThreadContent> | ((content: ThreadContent) => Partial<ThreadContent>),
  ) => {
    setDraft(current => {
      if (!current) return current;
      const content = getTargetContent(current, target);
      const patch = typeof change === 'function' ? change(content) : change;
      const sections = { ...current.sections };
      if (target.kind === 'section') {
        sections[target.key] = { ...sections[target.key], ...patch };
      } else if (target.kind === 'statistic') {
        const statistic = sections.statistic;
        sections.statistic = {
          ...statistic,
          categories: {
            ...blankCategories(),
            ...(statistic.categories || {}),
            [target.category]: { ...(statistic.categories?.[target.category] || blankStatContent()), ...patch },
          },
        };
      } else {
        const section = sections[target.section];
        sections[target.section] = {
          ...section,
          entries: (section.entries || []).map(entry => entry.id === target.entryId ? ({
            ...entry,
            feats: entry.feats.map(feat => feat.id === target.featId ? { ...feat, ...patch } : feat),
          }) : entry),
        };
      }
      return { ...current, sections };
    });
  };

  const addEvidenceEntry = (key: EvidenceSectionKey) => {
    const entry: EvidenceEntry = { id: makeId(), name: '', feats: [] };
    updateEvidenceEntries(key, entries => [...entries, entry]);
  };

  const updateEvidenceEntry = (key: EvidenceSectionKey, entryId: string, patch: Partial<EvidenceEntry>) => {
    updateEvidenceEntries(key, entries => entries.map(entry => (
      entry.id === entryId ? { ...entry, ...patch } : entry
    )));
  };

  const removeEvidenceEntry = (key: EvidenceSectionKey, entryId: string) => {
    updateEvidenceEntries(key, entries => entries.filter(entry => entry.id !== entryId));
  };

  const addFeat = (key: EvidenceSectionKey, entryId: string) => {
    const feat: EvidenceFeat = { ...blankContent(), id: makeId() };
    updateEvidenceEntries(key, entries => entries.map(entry => (
      entry.id === entryId ? { ...entry, feats: [...entry.feats, feat] } : entry
    )));
  };

  const removeFeat = (key: EvidenceSectionKey, entryId: string, featId: string) => {
    updateEvidenceEntries(key, entries => entries.map(entry => (
      entry.id === entryId
        ? { ...entry, feats: entry.feats.filter(feat => feat.id !== featId) }
        : entry
    )));
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>, target: UploadTarget) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !draft) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice('Hanya foto JPG, PNG, atau WebP yang dapat dipilih. Video tidak didukung.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice('Setiap foto Respect Thread maksimal 3 MB. Pilih file yang lebih kecil.');
      return;
    }
    if (target.kind === 'section' && target.key === 'introduction' &&
        getTargetContent(draft, target).images.length >= MAX_INTRODUCTION_IMAGES) {
      setNotice('Introduction hanya dapat memiliki 1 foto. Hapus foto yang ada sebelum menggantinya.');
      return;
    }
    setNotice('');
    setCropTarget(target);
    setCropFile(file);
  };

  const uploadCroppedImage = async (file: File) => {
    if (!draft || !cropTarget) throw new Error('Tujuan foto Respect Thread tidak ditemukan.');
    const currentContent = getTargetContent(draft, cropTarget);
    if (cropTarget.kind === 'section' && cropTarget.key === 'introduction' &&
        currentContent.images.length >= MAX_INTRODUCTION_IMAGES) {
      throw new Error('Introduction hanya dapat memiliki 1 foto. Hapus foto yang ada sebelum menggantinya.');
    }
    if (file.type !== 'image/jpeg') throw new Error('Foto harus berupa hasil crop JPEG.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Setiap foto Respect Thread maksimal 3 MB.');

    setCropBusy(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('fileName', file.name);
      form.append('folder', 'respect-threads');
      const headers: Record<string, string> = { Authorization: 'Bearer ' + token };
      if (PUBLIC_SUPABASE_KEY) headers.apikey = PUBLIC_SUPABASE_KEY;
      const response = await fetch(ADMIN_URL + '?action=upload', { method: 'POST', headers, body: form });
      const result = await response.json().catch(() => ({ error: 'Respons upload tidak valid.' }));
      if (!response.ok) throw new Error(result.error || 'Foto gagal diunggah.');
      if (typeof result.path !== 'string' || typeof result.url !== 'string') throw new Error('Server tidak mengembalikan alamat foto yang valid.');
      newUploadPathsRef.current.push(result.path);
      updateTargetContent(cropTarget, content => ({
        images: [...content.images, { path: result.path, url: result.url }],
      }));
      setCropFile(null);
      setCropTarget(null);
      setNotice('Foto berhasil ditambahkan.');
    } finally {
      setCropBusy(false);
    }
  };

  const removeImage = (target: UploadTarget, index: number) => {
    updateTargetContent(target, content => ({
      images: content.images.filter((_, imageIndex) => imageIndex !== index),
    }));
  };

  const validateContent = (content: ThreadContent, label: string, allowLinks = true): string | null => {
    const description = content.description || '';
    const links = (content.links || []).map(link => link.trim()).filter(Boolean);
    const images = content.images || [];
    if (description.length > 500000) return 'Deskripsi ' + label + ' terlalu panjang.';
    if (containsRespectLink(description)) return 'Deskripsi ' + label + ' tidak boleh mengandung URL atau tautan. Pindahkan ke bagian Link & teks referensi.';
    if (!allowLinks && links.length) return 'Introduction tidak menerima link; pindahkan referensi ke bagian lain.';
    let plainTextWords = 0;
    for (const reference of links) {
      if (reference.length > 10000) return 'Salah satu referensi ' + label + ' terlalu panjang.';
      if (isValidHttpReference(reference)) continue;
      if (/^https?:\/\//i.test(reference) || containsRespectLink(reference)) {
        return 'Referensi ' + label + ' harus berupa satu URL lengkap berawalan http:// atau https://, atau teks biasa tanpa URL. Jangan gabungkan beberapa URL dalam satu item.';
      }
      plainTextWords += words(reference);
    }
    if (plainTextWords > 100) return 'Teks biasa pada referensi ' + label + ' maksimal 100 kata total.';
    if (!description.trim() && (links.length > 0 || images.length > 0)) return 'Isi deskripsi ' + label + ' sebelum menyimpan link atau foto.';
    for (const image of images) {
      if (!image || typeof image.path !== 'string' || !image.path.startsWith('respect-threads/') || !isValidHttpReference(image.url)) {
        return 'Alamat foto pada ' + label + ' tidak valid.';
      }
    }
    return null;
  };

  const validateDraft = (): string | null => {
    if (!draft) return 'Editor belum dibuka.';
    if (!draft.title.trim()) return 'Judul Respect Thread wajib diisi.';
    if (!draft.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) return 'Slug harus menggunakan huruf kecil, angka, dan tanda hubung.';
    if (items.some(item => item.slug === draft.slug && item.id !== draft.id)) return 'Slug tersebut sudah digunakan. Silakan ubah alamat halaman.';
    let hasAnyDescription = false;
    for (const meta of sectionMeta) {
      const section = draft.sections[meta.key];
      const contents = sectionContents(section, meta.key);
      const sectionWords = sectionWordCount(section, meta.key);
      if (sectionWords > meta.maxWords) return 'Bagian ' + meta.label + ' maksimal ' + meta.maxWords.toLocaleString('id-ID') + ' kata.';
      if (meta.key === 'introduction' && (section.images || []).length > MAX_INTRODUCTION_IMAGES) {
        return 'Introduction hanya dapat memiliki maksimal 1 foto. Hapus foto tambahan sebelum menyimpan.';
      }
      if (meta.key === 'statistic') {
        for (const statistic of statMeta) {
          const level = section.categories?.[statistic.key]?.level || '';
          if (level.length > 180) return 'Nilai ' + statistic.label + ' maksimal 180 karakter.';
          if (containsRespectLink(level)) return 'Nilai ' + statistic.label + ' tidak boleh berisi URL atau tautan.';
        }
      }
      for (const content of contents) {
        const issue = validateContent(content, meta.label, meta.key !== 'introduction');
        if (issue) return issue;
        if (content.description.trim()) hasAnyDescription = true;
      }
      if (meta.key === 'resistance' || meta.key === 'hax_ability') {
        for (let entryIndex = 0; entryIndex < (section.entries || []).length; entryIndex++) {
          const entry = section.entries![entryIndex];
          const entryLabel = (meta.key === 'resistance' ? 'Resistance ' : 'Ability ') + (entryIndex + 1);
          if (!entry.name.trim()) return 'Nama ' + entryLabel + ' wajib diisi.';
          if (entry.name.length > 160) return 'Nama ' + entryLabel + ' maksimal 160 karakter.';
          if (!entry.feats.length) return entryLabel + ' harus memiliki minimal satu feat pendukung.';
          for (let featIndex = 0; featIndex < entry.feats.length; featIndex++) {
            if (!entry.feats[featIndex].description.trim()) return entryLabel + ', Feat ' + (featIndex + 1) + ': deskripsi feat wajib diisi.';
          }
        }
      }
    }
    if (!hasAnyDescription) return 'Isi setidaknya satu deskripsi pada salah satu bagian.';
    return null;
  };

  const save = async () => {
    if (!draft || saving) return;
    const snapshot = draft;
    const issue = validateDraft();
    if (issue) { setNotice(issue); return; }

    setSaving(true);
    setNotice('Mengirim data dan menunggu konfirmasi penyimpanan dari server…');
    try {
      const values = {
        slug: snapshot.slug.trim(),
        title: snapshot.title.trim(),
        character_name: snapshot.character_name.trim(),
        universe: snapshot.universe.trim(),
        sections: snapshot.sections,
        is_published: snapshot.is_published,
      };
      const response = snapshot.id
        ? await adminRequest<{ data?: ThreadRecord }>(token, 'update', { table: 'respect_threads', id: snapshot.id, values }, 'PATCH')
        : await adminRequest<{ data?: ThreadRecord }>(token, 'create', { table: 'respect_threads', values });

      const savedRecord = response?.data;
      if (!savedRecord || typeof savedRecord.id !== 'string' ||
          savedRecord.slug !== values.slug || savedRecord.is_published !== values.is_published) {
        throw new Error('Server belum mengonfirmasi bahwa Respect Thread tersimpan. Editor tetap dibuka agar data tidak hilang.');
      }

      // Update the owner list from the record returned by the database instead
      // of closing the editor and relying on a second request to show the save.
      setItems(current => [savedRecord, ...current.filter(item => item.id !== savedRecord.id)]);
      setDraft(null);
      setNotice(savedRecord.is_published
        ? 'Respect Thread berhasil disimpan dan dipublikasikan.'
        : 'Respect Thread berhasil disimpan sebagai draft pribadi.');

      // Uploaded files are cleaned only after the database confirms the row.
      // Cleanup failures are retained for a later cleanup attempt and do not
      // turn a successful database save into a failed save state.
      await cleanupUploadedMedia();
    } catch (error) {
      console.error('Respect Thread save failed:', error);
      setNotice(error instanceof Error ? error.message : 'Respect Thread gagal disimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const deleteThread = async (item: ThreadRecord) => {
    if (!window.confirm('Hapus Respect Thread "' + item.title + '" beserta foto-fotonya? Tindakan ini tidak dapat dibatalkan.')) return;
    setSaving(true);
    try {
      await adminRequest(token, 'delete', { table: 'respect_threads', id: item.id }, 'DELETE');
      await fetchThreads();
      setNotice('Respect Thread berhasil dihapus.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Respect Thread gagal dihapus.');
    } finally {
      setSaving(false);
    }
  };

  const renderContentEditor = (
    content: ThreadContent,
    target: UploadTarget,
    label: string,
    allowLinks: boolean,
    statisticCategory?: StatKey,
    descriptionHint?: string,
  ) => {
    const links = content.links || [];
    const images = content.images || [];
    const plainWords = referenceTextWords(links);
    const isIntroduction = target.kind === 'section' && target.key === 'introduction';
    const introductionLimitReached = isIntroduction && images.length >= MAX_INTRODUCTION_IMAGES;
    const photoCountLabel = isIntroduction
      ? images.length + ' / ' + MAX_INTRODUCTION_IMAGES + ' foto · batas khusus Introduction'
      : images.length + ' foto di area ini · tanpa batas jumlah · maks. 3 MB/foto';
    const guidance = descriptionHint || (statisticCategory
      ? 'Cantumkan dasar penilaian, feat yang relevan, kondisi saat ditampilkan, serta alasan level tersebut sesuai.'
      : 'Susun penjelasan secara runtut: konteks, hal yang ditunjukkan, lalu kesimpulan atau relevansinya.');
    return (
      <div className="rt-nested-content">
        {statisticCategory && <label className="field rt-stat-level-field">
          <span>{label}: nilai / tier statistik</span>
          <input type="text" maxLength={180} value={content.level || ''} placeholder="Large Building Level" aria-label={label + ' level statistik'} onChange={event => updateTargetContent(target, { level: event.target.value })} />
          <small>Ditampilkan sebagai “{label}: {content.level?.trim() || 'Large Building Level'}” pada halaman publik.</small>
        </label>}
        <label className="field rt-description-field">
          <span>Penjelasan {label}</span>
          <textarea rows={7} maxLength={500000} value={content.description || ''} placeholder={'Jelaskan ' + label + ' secara runtut…'} aria-label={'Penjelasan ' + label} aria-invalid={containsRespectLink(content.description || '')} onChange={event => updateTargetContent(target, { description: event.target.value })} />
          <small className="rt-description-guidance">{guidance} Angka, penomoran, desimal, tanda plus/minus, dan simbol boleh digunakan. Jangan tempelkan URL di deskripsi; masukkan ke Link & teks referensi.</small>
          {containsRespectLink(content.description || '') && <small className="rt-validation-error" role="alert">Deskripsi tidak boleh berisi URL/tautan. Pindahkan URL ke bagian Link & teks referensi.</small>}
        </label>
        {allowLinks && <div className="rt-links-field">
          <div className="rt-links-field-heading"><span><Link2 size={13} /> Link & teks referensi</span><small>{links.filter(link => link.trim()).length} item · {plainWords} / 100 kata teks</small></div>
          {links.map((link, index) => <div className="rt-link-item" key={index}>
            <textarea rows={2} maxLength={10000} value={link} placeholder="URL lengkap atau teks biasa (angka/simbol bebas)" aria-label={'Referensi ' + (index + 1) + ' ' + label} onChange={event => updateTargetContent(target, { links: links.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />
            <button type="button" className="rt-link-remove" aria-label={'Hapus link ' + (index + 1)} onClick={() => updateTargetContent(target, { links: links.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={14} /></button>
          </div>)}
          <button type="button" className="rt-add-link" onClick={() => updateTargetContent(target, { links: [...links, ''] })}><Plus size={14} /> Tambah link</button>
          <small>URL harus lengkap dengan http:// atau https://, satu URL per item (boleh diawali nomor seperti “1. https://…”). Teks biasa maksimal 100 kata; angka, desimal, nomor urut, tanda plus/minus, dan simbol tetap diperbolehkan.</small>
        </div>}
        <div className="rt-media-field">
          <div className="rt-media-field-heading">
            <div><span><ImagePlus size={14} /> Foto pendukung</span><small>{photoCountLabel}</small></div>
            <label className={!cropBusy && !introductionLimitReached ? 'rt-upload-button' : 'rt-upload-button disabled'}>
              {introductionLimitReached ? <Check size={14} /> : <Plus size={14} />}
              {introductionLimitReached ? 'Batas foto tercapai' : 'Tambah foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={cropBusy || Boolean(introductionLimitReached)} onChange={event => chooseImage(event, target)} />
            </label>
          </div>
          <p className="rt-media-hint">{isIntroduction
            ? 'Introduction dibatasi satu foto. Untuk mengganti, hapus foto yang ada terlebih dahulu. Foto tetap wajib melewati cropper dan maksimal 3 MB.'
            : 'Tidak ada batas jumlah foto untuk bagian ini. Setiap foto wajib melewati cropper dan maksimal 3 MB; video tidak didukung.'}</p>
          {images.length > 0 && <div className="rt-upload-preview">{images.map((image, index) => <figure key={image.path}><img src={image.url} alt={'Foto ' + (index + 1) + ' ' + label} /><button type="button" aria-label={'Hapus foto ' + (index + 1)} onClick={() => removeImage(target, index)}><Trash2 size={13} /></button><figcaption>FOTO {String(index + 1).padStart(2, '0')}</figcaption></figure>)}</div>}
        </div>
      </div>
    );
  };

  const isEvidenceSection = activeSection === 'resistance' || activeSection === 'hax_ability';
  const evidenceKey = activeSection === 'resistance' ? 'resistance' : 'hax_ability';
  const evidenceEntries = isEvidenceSection ? (activeContent.entries || []) : [];

  return (
    <section className="rt-manager">
      <header className="rt-manager-heading">
        <div><span className="eyebrow">OWNER WORKSPACE / CONTENT ARCHIVE</span><h2>Respect <em>Thread.</em></h2><p>Susun delapan bagian, kelola bukti per feat, lalu publikasikan ke arsip Respect Thread.</p></div>
        {!draft && <button className="button primary" type="button" onClick={startNew}><Plus size={16} /> Buat Respect Thread</button>}
      </header>

      {notice && <div className="rt-manager-notice" role="status"><span>{notice}</span><button type="button" aria-label="Tutup pesan" onClick={() => setNotice('')}><X size={15} /></button></div>}

      {draft ? (
        <div className="rt-editor">
          <fieldset className="rt-editor-fieldset" disabled={saving || cropBusy}>
          <div className="rt-editor-toolbar"><div><span className="eyebrow">THREAD EDITOR / {draft.id ? 'EDIT' : 'NEW ENTRY'}</span><h3>{draft.id ? 'Perbarui thread' : 'Thread baru'}</h3><p>Susun materi secara bertahap. Data pada kategori dan feat lain tetap tersimpan ketika Anda berpindah bagian.</p></div><button type="button" className="rt-editor-close" onClick={() => void abandonDraft()} disabled={saving || cropBusy}><X size={16} /> Tutup editor</button></div>

          <div className="rt-editor-meta">
            <label className="field"><span>Judul Respect Thread *</span><input value={draft.title} maxLength={180} placeholder="Contoh: Nama Karakter — Respect Thread" onChange={event => {
              const title = event.target.value;
              setDraft(current => current ? ({ ...current, title, ...(!slugTouched ? { slug: makeSlug(title) } : {}) }) : current);
            }} /></label>
            <label className="field"><span>Nama karakter</span><input value={draft.character_name} maxLength={160} placeholder="Nama karakter" onChange={event => setDraft(current => current ? ({ ...current, character_name: event.target.value }) : current)} /></label>
            <label className="field"><span>Verse / Universe</span><input value={draft.universe} maxLength={160} placeholder="Asal cerita atau semesta" onChange={event => setDraft(current => current ? ({ ...current, universe: event.target.value }) : current)} /></label>
            <label className="field"><span>Alamat halaman (slug) *</span><input value={draft.slug} maxLength={180} placeholder="nama-karakter-respect-thread" onChange={event => { setSlugTouched(true); setDraft(current => current ? ({ ...current, slug: makeSlug(event.target.value) }) : current); }} /><small>Halaman publik: /respect-thread/{draft.slug || 'slug-thread'}</small></label>
          </div>

          <div className="rt-editor-section-intro">
            <div><span className="eyebrow">CONTENT STRUCTURE / 08 SECTIONS</span><p>Susun materi melalui delapan bagian. Pilih bagian di samping; progres dan jumlah kata akan mengikuti isi yang sudah ditulis.</p></div>
            <div className="rt-editor-progress" aria-label={filledSections + ' dari ' + sectionMeta.length + ' bagian sudah diisi'}><div><span>{filledSections} / {String(sectionMeta.length).padStart(2, '0')} BAGIAN TERISI</span><b>{progressPercent}%</b></div><div className="rt-progress-track"><span style={{ width: progressPercent + '%' }} /></div></div>
          </div>
          <div className="rt-editor-guide" aria-label="Panduan penulisan Respect Thread">
            <article className="rt-editor-guide-card"><span className="eyebrow">01 / WORD LIMIT</span><b>Batas kata</b><p>Introduction maksimal 2.000 kata. Tujuh bagian lainnya maksimal 15.000 kata per bagian. Statistics dihitung gabungan untuk empat metrik.</p></article>
            <article className="rt-editor-guide-card"><span className="eyebrow">02 / DESCRIPTION</span><b>Deskripsi</b><p>Tulis uraian di kolom Penjelasan. URL tidak boleh berada di deskripsi; pindahkan ke Link & teks referensi. Angka dan simbol tetap diperbolehkan.</p></article>
            <article className="rt-editor-guide-card"><span className="eyebrow">03 / REFERENCES</span><b>Referensi</b><p>Tambahkan satu URL lengkap http:// atau https:// per item, atau teks biasa. Teks biasa maksimal 100 kata per area; jumlah item tautan tidak dibatasi.</p></article>
            <article className="rt-editor-guide-card"><span className="eyebrow">04 / MEDIA</span><b>Foto pendukung</b><p>Introduction hanya satu foto. Bagian lain bebas jumlah foto. Semua foto wajib di-crop; hasil akhir maksimal 3 MB per foto. Video tidak didukung.</p></article>
          </div>
          <div className="rt-editor-layout">
            <nav className="rt-editor-nav" aria-label="Pilih bagian Respect Thread">
              {sectionMeta.map((meta, index) => {
                const filled = sectionIsFilled(draft.sections[meta.key], meta.key);
                return <button type="button" key={meta.key} className={activeSection === meta.key ? 'active' : ''} onClick={() => { setActiveSection(meta.key); setNotice(''); }} aria-current={activeSection === meta.key ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><b>{meta.label}</b><i>{filled ? <Check size={13} /> : <small>Belum diisi</small>}</i></button>;
              })}
            </nav>

            <section className="rt-editor-pane">
              <div className="rt-editor-pane-heading"><div><span className="eyebrow">SECTION {String(sectionMeta.findIndex(x => x.key === activeSection) + 1).padStart(2, '0')}</span><h3>{activeMeta.label}</h3><p>{activeMeta.hint}</p></div><span className={'rt-section-word-count' + (activeSectionWords > activeMeta.maxWords ? ' over-limit' : '')}>{activeSectionWords.toLocaleString('id-ID')} / {activeMeta.maxWords.toLocaleString('id-ID')} kata</span></div>

              {activeSection === 'statistic' ? <>
                <details className="rt-legacy-panel" open={Boolean(activeContent.description.trim() || activeContent.links.length || activeContent.images.length)}>
                  <summary>Catatan tambahan Statistics (opsional)</summary>
                  {renderContentEditor(activeContent, { kind: 'section', key: 'statistic' }, 'catatan statistik umum', true)}
                </details>
                <div className="rt-stat-editor">
                  <div className="rt-evidence-heading"><div><span className="eyebrow">STATISTICS / 04 CATEGORIES</span><h4>Statistik karakter</h4><p>Isi nilai/tier, lalu lengkapi penjelasan dan bukti untuk setiap metrik. Batas 15.000 kata berlaku untuk gabungan Attack Potency, Durability, Speed, dan Stamina.</p></div></div>
                  <div className="rt-stat-tabs" role="tablist" aria-label="Kategori statistik" onKeyDown={event => {
                    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
                    if (!direction) return;
                    event.preventDefault();
                    const currentIndex = statMeta.findIndex(meta => meta.key === activeStatCategory);
                    const nextIndex = (currentIndex + direction + statMeta.length) % statMeta.length;
                    const nextCategory = statMeta[nextIndex].key;
                    setActiveStatCategory(nextCategory);
                    document.getElementById('rt-stat-tab-' + nextCategory)?.focus();
                  }}>
                    {statMeta.map((meta, index) => {
                      const category = activeContent.categories?.[meta.key] || blankStatContent();
                      const filled = contentIsFilled(category);
                      return <button key={meta.key} id={'rt-stat-tab-' + meta.key} type="button" role="tab" aria-selected={activeStatCategory === meta.key} aria-controls="rt-stat-category-panel" tabIndex={activeStatCategory === meta.key ? 0 : -1} className={activeStatCategory === meta.key ? 'active' : ''} onClick={() => setActiveStatCategory(meta.key)}>
                        <span className="rt-stat-tab-number">{String(index + 1).padStart(2, '0')}</span>
                        <b>{meta.label}</b>
                        <small className={filled ? 'is-filled' : ''}>{filled ? 'Terisi' : 'Belum diisi'}</small>
                      </button>;
                    })}
                  </div>
                  <div className="rt-stat-category-panel" id="rt-stat-category-panel" role="tabpanel" aria-labelledby={'rt-stat-tab-' + activeStatCategory}>
                    <div className="rt-stat-category-heading">
                      <div><span className="eyebrow">STATISTIC / {String(statMeta.findIndex(meta => meta.key === activeStatCategory) + 1).padStart(2, '0')}</span><h5>{statMeta.find(meta => meta.key === activeStatCategory)?.label}</h5></div>
                      <span className="rt-stat-category-note">Tuliskan nilai/tier terlebih dahulu. Contoh: Attack Potency: Large Building Level.</span>
                    </div>
                    {renderContentEditor(activeContent.categories?.[activeStatCategory] || blankStatContent(), { kind: 'statistic', category: activeStatCategory }, statMeta.find(meta => meta.key === activeStatCategory)?.label || 'statistik', true, activeStatCategory)}
                  </div>
                </div>
              </> : isEvidenceSection ? <>
                <details className="rt-legacy-panel" open={Boolean(activeContent.description.trim() || activeContent.links.length || activeContent.images.length)}>
                  <summary>Ringkasan umum bagian ini (opsional)</summary>
                  {renderContentEditor(activeContent, { kind: 'section', key: activeSection }, 'catatan umum', true)}
                </details>
                <div className="rt-evidence-manager">
                  <div className="rt-evidence-heading"><div><span className="eyebrow">{activeSection === 'resistance' ? 'RESISTANCE ARCHIVE' : 'ABILITY ARCHIVE'}</span><h4>{activeSection === 'resistance' ? 'Daftar Resistances' : 'Daftar Hax & Ability'}</h4><p>Buat satu entri untuk setiap jenis Resistance atau Ability. Setiap entri dapat memiliki banyak Feat; batas 15.000 kata dihitung gabungan untuk semua entri dan Feat di bagian ini.</p></div><div className="rt-evidence-heading-actions"><span className="rt-entry-total">{evidenceEntries.length} {evidenceEntries.length === 1 ? 'entri' : 'entri'}</span><button type="button" className="rt-add-evidence" onClick={() => addEvidenceEntry(evidenceKey)}><Plus size={15} /> {activeSection === 'resistance' ? 'Tambah Resistance' : 'Tambah Ability'}</button></div></div>
                  {evidenceEntries.length === 0 ? <div className="rt-evidence-empty"><BookOpen size={19} /><p>Belum ada entri. Tambahkan satu {activeSection === 'resistance' ? 'jenis resistance' : 'ability'}, kemudian tambahkan feat pendukungnya.</p></div> : <div className="rt-evidence-list">
                    {evidenceEntries.map((entry, entryIndex) => <article className="rt-evidence-entry" key={entry.id}>
                      <header className="rt-evidence-entry-heading">
                        <div className="rt-evidence-entry-main">
                          <span className="rt-evidence-entry-index">{String(entryIndex + 1).padStart(2, '0')}</span>
                          <div className="rt-evidence-entry-fields">
                            <span className="eyebrow">{activeSection === 'resistance' ? 'RESISTANCE ENTRY' : 'ABILITY ENTRY'}</span>
                            <label className="field"><span>Nama {activeSection === 'resistance' ? 'Resistance' : 'Ability'} *</span><input value={entry.name} maxLength={160} placeholder={activeSection === 'resistance' ? 'Contoh: Fire Manipulation Resistance' : 'Contoh: Spatial Manipulation'} onChange={event => updateEvidenceEntry(evidenceKey, entry.id, { name: event.target.value })} /></label>
                          </div>
                        </div>
                        <div className="rt-evidence-entry-actions">
                          <span className="rt-feat-total">{entry.feats.length} feat pendukung</span>
                          <button type="button" className="rt-evidence-remove" aria-label="Hapus entri" onClick={() => removeEvidenceEntry(evidenceKey, entry.id)}><Trash2 size={14} /> Hapus entri</button>
                        </div>
                      </header>
                      <div className="rt-feat-list">
                        <div className="rt-feat-toolbar">
                          <button type="button" className="rt-add-feat" onClick={() => addFeat(evidenceKey, entry.id)}><Plus size={14} /> Tambah feat pendukung</button>
                          <small>{entry.feats.length} feat dalam entri ini · tambah berikutnya langsung dari sini</small>
                        </div>
                        {entry.feats.length === 0 && <div className="rt-feat-empty">Belum ada feat. Tambahkan bukti pertama untuk entri ini.</div>}
                        {entry.feats.map((feat, featIndex) => <article className="rt-feat-card" key={feat.id}>
                          <header className="rt-feat-heading"><div><span className="eyebrow">FEAT / {String(featIndex + 1).padStart(2, '0')}</span><p>Bukti pendukung untuk {entry.name.trim() || (activeSection === 'resistance' ? 'Resistance ini' : 'Ability ini')}.</p></div><button type="button" className="rt-feat-remove" aria-label="Hapus feat" onClick={() => removeFeat(evidenceKey, entry.id, feat.id)}><Trash2 size={13} /> Hapus feat</button></header>
                          {renderContentEditor(
                            feat,
                            { kind: 'feat', section: evidenceKey, entryId: entry.id, featId: feat.id },
                            'Feat ' + String(featIndex + 1).padStart(2, '0'),
                            true,
                            undefined,
                            'Jelaskan konteks kejadian, kemampuan yang ditunjukkan, dampaknya, dan hubungan bukti ini dengan ' + (entry.name.trim() || 'entri') + '.',
                          )}
                        </article>)}
                      </div>
                    </article>)}
                  </div>}
                </div>
              </> : renderContentEditor(activeContent, { kind: 'section', key: activeSection }, activeMeta.label, activeSection !== 'introduction')}
            </section>
          </div>

          <div className="rt-editor-footer">
            <div className="rt-editor-word-total"><span>TOTAL SELURUH BAGIAN</span><b>{wordCount.toLocaleString('id-ID')} <small>kata</small></b><small>Batas dihitung per bagian, termasuk seluruh kategori statistik dan feat.</small></div>
            <label className="rt-publish-toggle"><input type="checkbox" checked={draft.is_published} onChange={event => setDraft(current => current ? ({ ...current, is_published: event.target.checked }) : current)} /><span><b>Publikasikan</b><small>{draft.is_published ? 'Thread dapat dibaca publik setelah disimpan.' : 'Thread disimpan sebagai draft dan tidak terlihat publik.'}</small></span></label>
            <div className="rt-editor-actions"><button className="button secondary" type="button" onClick={() => void abandonDraft()} disabled={saving || cropBusy}>Batal</button><button className="button primary" type="button" onClick={() => void save()} disabled={saving || cropBusy}><Save size={15} /> {saving ? 'Menyimpan…' : draft.is_published ? 'Simpan & publikasikan' : 'Simpan draft'}</button></div>
          </div>
          </fieldset>
        </div>
      ) : (
        <div className="rt-owner-list">
          {loading ? <div className="empty-state">Memuat Respect Thread…</div> : items.length === 0 ? <div className="rt-owner-empty"><BookOpen size={26} /><h3>Belum ada Respect Thread.</h3><p>Buat thread pertama untuk mengisi arsip publik Ivory Diary.</p><button className="button primary" type="button" onClick={startNew}><Plus size={15} /> Buat Respect Thread</button></div> : items.map(item => {
            const sections = normalizeSections(item.sections);
            const filled = sectionMeta.filter(meta => sectionIsFilled(sections[meta.key], meta.key)).length;
            return <article className="rt-owner-row" key={item.id}>
              <div className="rt-owner-row-icon"><BookOpen size={18} /></div>
              <div className="rt-owner-row-copy"><div><b>{item.title}</b><span className={item.is_published ? 'rt-status-published' : 'rt-status-draft'}>{item.is_published ? 'PUBLIC' : 'DRAFT'}</span></div><small>{[item.character_name, item.universe].filter(Boolean).join(' · ') || item.slug}</small><small>{filled} bagian berisi · {totalWords(sections).toLocaleString('id-ID')} kata</small></div>
              <div className="rt-owner-row-actions"><button type="button" onClick={() => onNavigate('/respect-thread/' + encodeURIComponent(item.slug))} disabled={!item.is_published}><ExternalLink size={14} /> Lihat</button><button type="button" onClick={() => startEdit(item)}><Pencil size={14} /> Edit</button><button type="button" className="danger-text" onClick={() => void deleteThread(item)} disabled={saving}><Trash2 size={14} /> Hapus</button></div>
            </article>;
          })}
        </div>
      )}

      {cropFile && cropTarget && <div className="rt-crop-overlay"><div className="rt-crop-dialog"><div className="rt-crop-heading"><span className="eyebrow">RESPECT THREAD / PHOTO STUDIO</span><button type="button" aria-label="Tutup crop foto" onClick={() => { if (!cropBusy) { setCropFile(null); setCropTarget(null); } }} disabled={cropBusy}><X size={17} /></button></div><ImageCropper file={cropFile} busy={cropBusy} maxOutputBytes={MAX_IMAGE_BYTES} onCancel={() => { if (!cropBusy) { setCropFile(null); setCropTarget(null); } }} onComplete={uploadCroppedImage} /></div></div>}
    </section>
  );
}
