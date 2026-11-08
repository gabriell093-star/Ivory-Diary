import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { BookOpen, Check, ExternalLink, ImagePlus, Link2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import ImageCropper from './ImageCropper';
import { ADMIN_URL, PUBLIC_SUPABASE_KEY, adminRequest } from './lib';

type MediaItem = { path: string; url: string };
type ThreadSection = { description: string; links?: string[]; images: MediaItem[] };
type SectionKey = 'introduction' | 'terminology' | 'cosmology' | 'personality' | 'statistic' | 'hax_ability' | 'resistance';
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

const sectionMeta: { key: SectionKey; label: string; hint: string; imageLimit: number; maxWords: number }[] = [
  { key: 'introduction', label: 'Introduction', hint: 'Pengenalan karakter dan konteks. Maksimal 2.000 kata.', imageLimit: 1, maxWords: 2000 },
  { key: 'terminology', label: 'Terminology', hint: 'Uraian istilah, konsep, atau penamaan khusus. Maksimal 15.000 kata.', imageLimit: 0, maxWords: 15000 },
  { key: 'cosmology', label: 'Cosmology', hint: 'Penjelasan struktur dunia, alam, dimensi, atau kosmologi. Maksimal 15.000 kata.', imageLimit: 0, maxWords: 15000 },
  { key: 'personality', label: 'Personality', hint: 'Uraian karakterisasi dan kepribadian. Maksimal 15.000 kata.', imageLimit: 0, maxWords: 15000 },
  { key: 'statistic', label: 'Statistic', hint: 'Statistik dan feat yang mendukung penilaian karakter. Maksimal 15.000 kata.', imageLimit: 10, maxWords: 15000 },
  { key: 'hax_ability', label: 'Hax & Ability', hint: 'Kemampuan khusus, mekanisme, dan penerapannya. Maksimal 15.000 kata.', imageLimit: 10, maxWords: 15000 },
  { key: 'resistance', label: 'Resistance', hint: 'Jenis resistansi dan bukti pendukungnya. Maksimal 15.000 kata.', imageLimit: 10, maxWords: 15000 },
];

const blankSections = (): ThreadSections => ({
  introduction: { description: '', images: [] },
  terminology: { description: '', links: [], images: [] },
  cosmology: { description: '', links: [], images: [] },
  personality: { description: '', links: [], images: [] },
  statistic: { description: '', links: [], images: [] },
  hax_ability: { description: '', links: [], images: [] },
  resistance: { description: '', links: [], images: [] },
});

const newDraft = (): Draft => ({
  slug: '',
  title: '',
  character_name: '',
  universe: '',
  sections: blankSections(),
  is_published: true,
});

const MAX_THREAD_IMAGES = 10;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const RESPECT_LINK_PATTERN = /(?:\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>()]*)?)/iu;
const words = (value: string) => value.trim() ? value.trim().split(/\s+/u).length : 0;
const containsRespectLink = (value: string) => RESPECT_LINK_PATTERN.test(value);
const isValidHttpReference = (value: string) => {
  if (!/^https?:\/\//i.test(value) || /\s/u.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};
const totalWords = (sections: ThreadSections) => sectionMeta.reduce((sum, item) => sum + words(sections[item.key]?.description || ''), 0);
const countThreadImages = (sections: ThreadSections) => sectionMeta.reduce((sum, item) => sum + (sections[item.key]?.images?.length || 0), 0);
const referenceTextWords = (references: string[]) => references.reduce((sum, value) => {
  const reference = value.trim();
  if (!reference || isValidHttpReference(reference)) return sum;
  return sum + words(reference);
}, 0);
const makeSlug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);

const normalizeSections = (value: unknown): ThreadSections => {
  const fallback = blankSections();
  if (!value || typeof value !== 'object') return fallback;
  const data = value as Record<string, any>;
  for (const meta of sectionMeta) {
    const section = data[meta.key];
    if (!section || typeof section !== 'object') continue;
    fallback[meta.key] = {
      description: typeof section.description === 'string' ? section.description : '',
      ...(meta.key === 'introduction' ? {} : { links: Array.isArray(section.links) ? section.links.filter((link: unknown) => typeof link === 'string') : (typeof section.link === 'string' && section.link.trim() ? [section.link] : []) }),
      images: Array.isArray(section.images) ? section.images.filter((image: any) => image && typeof image.path === 'string' && typeof image.url === 'string').slice(0, meta.imageLimit) : [],
    };
  }
  return fallback;
};

export default function RespectThreadManager({ token, onNavigate }: { token: string; onNavigate: (path: string) => void }) {
  const [items, setItems] = useState<ThreadRecord[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('introduction');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const newUploadPathsRef = useRef<string[]>([]);

  const wordCount = useMemo(() => totalWords(draft?.sections || blankSections()), [draft?.sections]);
  const filledSections = useMemo(
    () => sectionMeta.filter(meta => draft?.sections[meta.key].description.trim()).length,
    [draft?.sections],
  );
  const progressPercent = Math.round((filledSections / sectionMeta.length) * 100);
  const activeMeta = sectionMeta.find(section => section.key === activeSection)!;
  const activeContent = draft?.sections[activeSection] || blankSections()[activeSection];

  const cleanupUploadedMedia = async () => {
    const paths = [...new Set(newUploadPathsRef.current)];
    if (!paths.length) return;
    try {
      await adminRequest(token, 'cleanup-media', { paths });
      newUploadPathsRef.current = [];
    } catch (error) {
      console.warn('Respect Thread temporary media cleanup failed:', error);
    }
  };

  const abandonDraft = async () => {
    if (saving || cropBusy) return;
    await cleanupUploadedMedia();
    setCropFile(null);
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
    setSlugTouched(true);
    setNotice('');
  };

  const updateSection = (key: SectionKey, patch: Partial<ThreadSection>) => {
    setDraft(current => current ? ({
      ...current,
      sections: {
        ...current.sections,
        [key]: { ...current.sections[key], ...patch },
      },
    }) : current);
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !draft) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setNotice('Hanya foto JPG, PNG, atau WebP yang dapat dipilih. Video tidak didukung.');
      return;
    }
    if (!activeMeta.imageLimit) {
      setNotice('Bagian ini tidak menerima foto.');
      return;
    }
    if (activeContent.images.length >= activeMeta.imageLimit) {
      setNotice('Kuota foto untuk bagian ' + activeMeta.label + ' sudah penuh.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice('Setiap foto Respect Thread maksimal 3 MB. Pilih file yang lebih kecil.');
      return;
    }
    if (countThreadImages(draft.sections) >= MAX_THREAD_IMAGES) {
      setNotice('Satu Respect Thread maksimal 10 foto secara keseluruhan.');
      return;
    }
    setNotice('');
    setCropFile(file);
  };

  const uploadCroppedImage = async (file: File) => {
    if (!draft) throw new Error('Draft Respect Thread tidak ditemukan.');
    if (file.type !== 'image/jpeg') throw new Error('Foto harus berupa hasil crop JPEG.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Setiap foto Respect Thread maksimal 3 MB.');
    if (activeContent.images.length >= activeMeta.imageLimit) throw new Error('Batas foto bagian ini sudah tercapai.');
    if (countThreadImages(draft.sections) >= MAX_THREAD_IMAGES) throw new Error('Satu Respect Thread maksimal 10 foto secara keseluruhan.');
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
      updateSection(activeSection, { images: [...activeContent.images, { path: result.path, url: result.url }] });
      setCropFile(null);
      setNotice('Foto berhasil ditambahkan ke ' + activeMeta.label + '.');
    } finally {
      setCropBusy(false);
    }
  };

  const removeImage = (index: number) => {
    if (!activeContent) return;
    updateSection(activeSection, { images: activeContent.images.filter((_, i) => i !== index) });
  };

  const validateDraft = (): string | null => {
    if (!draft) return 'Editor belum dibuka.';
    if (!draft.title.trim()) return 'Judul Respect Thread wajib diisi.';
    if (!draft.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) return 'Slug harus menggunakan huruf kecil, angka, dan tanda hubung.';
    if (items.some(item => item.slug === draft.slug && item.id !== draft.id)) return 'Slug tersebut sudah digunakan. Silakan ubah alamat halaman.';
    for (const meta of sectionMeta) {
      const section = draft.sections[meta.key];
      const hasDescription = section.description.trim().length > 0;
      const links = (section.links || []).map(link => link.trim()).filter(Boolean);
      if (containsRespectLink(section.description)) return 'Deskripsi bagian ' + meta.label + ' tidak boleh mengandung URL atau tautan. Pindahkan ke bagian Link & teks referensi.';
      if (words(section.description) > meta.maxWords) return 'Bagian ' + meta.label + ' maksimal ' + meta.maxWords.toLocaleString('id-ID') + ' kata.';
      if (!hasDescription && (links.length > 0 || section.images.length > 0)) return 'Bagian ' + meta.label + ' memiliki referensi atau foto. Isi deskripsinya sebelum menyimpan.';
      if (section.images.length > meta.imageLimit) return 'Jumlah foto bagian ' + meta.label + ' melebihi batas.';
      let plainTextWords = 0;
      for (const reference of links) {
        if (isValidHttpReference(reference)) continue;
        if (/^https?:\/\//i.test(reference) || containsRespectLink(reference)) {
          return 'Referensi bagian ' + meta.label + ' harus berupa satu URL HTTP/HTTPS yang valid per item, atau teks biasa tanpa URL.';
        }
        plainTextWords += words(reference);
      }
      if (plainTextWords > 100) return 'Teks biasa pada referensi bagian ' + meta.label + ' maksimal 100 kata total.';
    }
    if (countThreadImages(draft.sections) > MAX_THREAD_IMAGES) return 'Satu Respect Thread maksimal 10 foto secara keseluruhan.';
    if (!sectionMeta.some(meta => draft.sections[meta.key].description.trim())) return 'Isi setidaknya satu deskripsi pada salah satu bagian.';
    return null;
  };

  const save = async () => {
    if (!draft) return;
    const issue = validateDraft();
    if (issue) { setNotice(issue); return; }
    setSaving(true);
    setNotice('');
    try {
      const values = {
        slug: draft.slug.trim(),
        title: draft.title.trim(),
        character_name: draft.character_name.trim(),
        universe: draft.universe.trim(),
        sections: Object.fromEntries(sectionMeta.map(meta => {
          const section = draft.sections[meta.key];
          return [meta.key, { ...section, ...(meta.key === 'introduction' ? {} : { links: (section.links || []).map(link => link.trim()).filter(Boolean) }) }];
        })) as ThreadSections,
        is_published: draft.is_published,
      };
      if (draft.id) {
        await adminRequest(token, 'update', { table: 'respect_threads', id: draft.id, values }, 'PATCH');
      } else {
        await adminRequest(token, 'create', { table: 'respect_threads', values });
      }
      await cleanupUploadedMedia();
      setDraft(null);
      await fetchThreads();
      setNotice(draft.is_published ? 'Respect Thread berhasil disimpan dan dipublikasikan.' : 'Respect Thread tersimpan sebagai draft pribadi.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Respect Thread gagal disimpan.');
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

  return (
    <section className="rt-manager">
      <header className="rt-manager-heading">
        <div><span className="eyebrow">OWNER WORKSPACE / CONTENT ARCHIVE</span><h2>Respect <em>Thread.</em></h2><p>Susun tujuh bagian, lampirkan sumber, lalu publikasikan ke halaman publik.</p></div>
        {!draft && <button className="button primary" type="button" onClick={startNew}><Plus size={16} /> Buat Respect Thread</button>}
      </header>

      {notice && <div className="rt-manager-notice" role="status"><span>{notice}</span><button type="button" aria-label="Tutup pesan" onClick={() => setNotice('')}><X size={15} /></button></div>}

      {draft ? (
        <div className="rt-editor">
          <div className="rt-editor-toolbar"><div><span className="eyebrow">THREAD EDITOR / {draft.id ? 'EDIT' : 'NEW ENTRY'}</span><h3>{draft.id ? 'Perbarui thread' : 'Thread baru'}</h3><p>Susun materi per bagian, periksa batas kata, lalu simpan sebagai draft atau publikasikan.</p></div><button type="button" className="rt-editor-close" onClick={() => void abandonDraft()} disabled={saving || cropBusy}><X size={16} /> Tutup editor</button></div>

          <div className="rt-editor-meta">
            <label className="field"><span>Judul Respect Thread *</span><input value={draft.title} maxLength={180} placeholder="Contoh: Nama Karakter — Respect Thread" onChange={event => {
              const title = event.target.value;
              setDraft(current => current ? ({ ...current, title, ...(!slugTouched ? { slug: makeSlug(title) } : {}) }) : current);
            }} /></label>
            <label className="field"><span>Nama karakter</span><input value={draft.character_name} maxLength={160} placeholder="Nama karakter" onChange={event => setDraft(current => current ? ({ ...current, character_name: event.target.value }) : current)} /></label>
            <label className="field"><span>Verse / Universe</span><input value={draft.universe} maxLength={160} placeholder="Asal cerita atau semesta" onChange={event => setDraft(current => current ? ({ ...current, universe: event.target.value }) : current)} /></label>
            <label className="field"><span>Alamat halaman (slug) *</span><input value={draft.slug} maxLength={180} placeholder="nama-karakter-respect-thread" onChange={event => { setSlugTouched(true); setDraft(current => current ? ({ ...current, slug: makeSlug(event.target.value) }) : current); }} /><small>Halaman publik: /respect-thread/{draft.slug || 'slug-thread'}</small></label>
          </div>

          <div className="rt-editor-section-intro"><div><span className="eyebrow">CONTENT STRUCTURE / 07 SECTIONS</span><p>Pilih bagian untuk mulai menulis. Bagian yang sudah memiliki deskripsi akan ditandai.</p></div><div className="rt-editor-progress" aria-label={filledSections + ' dari 7 bagian sudah diisi'}><div><span>{filledSections} / 07 BAGIAN TERISI</span><b>{progressPercent}%</b></div><div className="rt-progress-track"><span style={{ width: progressPercent + '%' }} /></div></div></div>
          <div className="rt-editor-layout">
            <nav className="rt-editor-nav" aria-label="Pilih bagian Respect Thread">
              {sectionMeta.map((meta, index) => {
                const filled = Boolean(draft.sections[meta.key].description.trim());
                return <button type="button" key={meta.key} className={activeSection === meta.key ? 'active' : ''} onClick={() => { setActiveSection(meta.key); setNotice(''); }} aria-current={activeSection === meta.key ? 'step' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><b>{meta.label}</b><i>{filled ? <Check size={13} /> : <small>Belum diisi</small>}</i></button>;
              })}
            </nav>

            <section className="rt-editor-pane">
              <div className="rt-editor-pane-heading"><div><span className="eyebrow">SECTION {String(sectionMeta.findIndex(x => x.key === activeSection) + 1).padStart(2, '0')}</span><h3>{activeMeta.label}</h3><p>{activeMeta.hint}</p></div><span className={'rt-section-word-count' + (words(activeContent.description) > activeMeta.maxWords ? ' over-limit' : '')}>{words(activeContent.description).toLocaleString('id-ID')} / {activeMeta.maxWords.toLocaleString('id-ID')} kata</span></div>
              <label className="field rt-description-field"><span>Deskripsi bagian</span><textarea rows={10} maxLength={500000} value={activeContent.description} placeholder={'Tulis penjelasan untuk ' + activeMeta.label + ' di sini…'} aria-invalid={containsRespectLink(activeContent.description)} onChange={event => updateSection(activeSection, { description: event.target.value })} /><small>Batas berlaku per bagian: Introduction maksimal 2.000 kata, sedangkan setiap bagian lainnya maksimal 15.000 kata.</small>{containsRespectLink(activeContent.description) && <small className="rt-validation-error" role="alert">Deskripsi tidak boleh berisi URL/tautan. Pindahkan URL ke bagian Link & teks referensi.</small>}</label>

              {activeSection !== 'introduction' && <div className="rt-links-field">
                <div className="rt-links-field-heading"><span><Link2 size={13} /> Link & teks referensi</span><small>{(activeContent.links || []).filter(link => link.trim()).length} item · {referenceTextWords(activeContent.links || [])} / 100 kata teks</small></div>
                {(activeContent.links || []).map((link, index) => <div className="rt-link-item" key={index}>
                  <textarea rows={2} maxLength={10000} value={link} placeholder="https://… atau teks biasa" aria-label={'Referensi ' + (index + 1)} onChange={event => updateSection(activeSection, { links: (activeContent.links || []).map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />
                  <button type="button" className="rt-link-remove" aria-label={'Hapus link ' + (index + 1)} onClick={() => updateSection(activeSection, { links: (activeContent.links || []).filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={14} /></button>
                </div>)}
                <button type="button" className="rt-add-link" onClick={() => updateSection(activeSection, { links: [...(activeContent.links || []), ''] })}><Plus size={14} /> Tambah link</button>
                <small>Jumlah URL tidak dibatasi. Setiap bagian boleh memuat teks biasa hingga 100 kata total. Tambahkan referensi sebelum deskripsi bila perlu; deskripsi bagian wajib diisi saat konfirmasi simpan.</small>
              </div>}

              {activeMeta.imageLimit > 0 && <div className="rt-media-field">
                <div className="rt-media-field-heading"><div><span><ImagePlus size={14} /> Foto pendukung</span><small>{activeContent.images.length} / {activeMeta.imageLimit} foto bagian · {countThreadImages(draft.sections)} / 10 total · maks. 3 MB/foto</small></div><label className={activeContent.images.length < activeMeta.imageLimit && countThreadImages(draft.sections) < MAX_THREAD_IMAGES && !cropBusy ? 'rt-upload-button' : 'rt-upload-button disabled'}><Plus size={14} /> Tambah foto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={activeContent.images.length >= activeMeta.imageLimit || countThreadImages(draft.sections) >= MAX_THREAD_IMAGES || cropBusy} onChange={chooseImage} /></label></div>
                <p className="rt-media-hint">Video tidak didukung. Maksimal 10 foto untuk satu thread, dengan ukuran maksimal 3 MB per foto. Foto boleh ditambahkan lebih dulu; deskripsi wajib tersedia saat menyimpan.</p>
                {activeContent.images.length > 0 && <div className="rt-upload-preview">{activeContent.images.map((image, index) => <figure key={image.path}><img src={image.url} alt={'Foto ' + (index + 1) + ' bagian ' + activeMeta.label} /><button type="button" aria-label="Hapus foto" onClick={() => removeImage(index)}><Trash2 size={13} /></button><figcaption>FOTO {String(index + 1).padStart(2, '0')}</figcaption></figure>)}</div>}
              </div>}

              {activeSection === 'introduction' && <div className="rt-intro-photo-note"><ImagePlus size={15} /><span>Introduction hanya menerima satu foto; batas keseluruhan tetap 10 foto per thread dan 3 MB per foto. Deskripsi boleh disimpan tanpa foto.</span></div>}
              {activeMeta.imageLimit === 0 && activeSection !== 'introduction' && <div className="rt-intro-photo-note"><Link2 size={15} /><span>Bagian ini berisi deskripsi dan link referensi tanpa batas. Foto tidak tersedia di bagian ini.</span></div>}
            </section>
          </div>

          <div className="rt-editor-footer">
            <div className="rt-editor-word-total"><span>TOTAL SELURUH BAGIAN</span><b>{wordCount.toLocaleString('id-ID')} <small>kata</small></b><small>Batas dihitung terpisah untuk tiap bagian.</small></div>
            <label className="rt-publish-toggle"><input type="checkbox" checked={draft.is_published} onChange={event => setDraft(current => current ? ({ ...current, is_published: event.target.checked }) : current)} /><span><b>Publikasikan</b><small>{draft.is_published ? 'Thread dapat dibaca publik setelah disimpan.' : 'Thread disimpan sebagai draft dan tidak terlihat publik.'}</small></span></label>
            <div className="rt-editor-actions"><button className="button secondary" type="button" onClick={() => void abandonDraft()} disabled={saving || cropBusy}>Batal</button><button className="button primary" type="button" onClick={() => void save()} disabled={saving || cropBusy}><Save size={15} /> {saving ? 'Menyimpan…' : draft.is_published ? 'Simpan & publikasikan' : 'Simpan draft'}</button></div>
          </div>
        </div>
      ) : (
        <div className="rt-owner-list">
          {loading ? <div className="empty-state">Memuat Respect Thread…</div> : items.length === 0 ? <div className="rt-owner-empty"><BookOpen size={26} /><h3>Belum ada Respect Thread.</h3><p>Buat thread pertama untuk mengisi arsip publik Ivory Diary.</p><button className="button primary" type="button" onClick={startNew}><Plus size={15} /> Buat Respect Thread</button></div> : items.map(item => (
            <article className="rt-owner-row" key={item.id}>
              <div className="rt-owner-row-icon"><BookOpen size={18} /></div>
              <div className="rt-owner-row-copy"><div><b>{item.title}</b><span className={item.is_published ? 'rt-status-published' : 'rt-status-draft'}>{item.is_published ? 'PUBLIC' : 'DRAFT'}</span></div><small>{[item.character_name, item.universe].filter(Boolean).join(' · ') || item.slug}</small><small>{sectionMeta.filter(meta => item.sections?.[meta.key]?.description?.trim()).length} bagian berisi · {totalWords(normalizeSections(item.sections))} kata</small></div>
              <div className="rt-owner-row-actions"><button type="button" onClick={() => onNavigate('/respect-thread/' + encodeURIComponent(item.slug))} disabled={!item.is_published}><ExternalLink size={14} /> Lihat</button><button type="button" onClick={() => startEdit(item)}><Pencil size={14} /> Edit</button><button type="button" className="danger-text" onClick={() => void deleteThread(item)} disabled={saving}><Trash2 size={14} /> Hapus</button></div>
            </article>
          ))}
        </div>
      )}

      {cropFile && <div className="rt-crop-overlay"><div className="rt-crop-dialog"><div className="rt-crop-heading"><span className="eyebrow">RESPECT THREAD / PHOTO STUDIO</span><button type="button" aria-label="Tutup crop foto" onClick={() => !cropBusy && setCropFile(null)} disabled={cropBusy}><X size={17} /></button></div><ImageCropper file={cropFile} busy={cropBusy} maxOutputBytes={MAX_IMAGE_BYTES} onCancel={() => !cropBusy && setCropFile(null)} onComplete={uploadCroppedImage} /></div></div>}
    </section>
  );
}
