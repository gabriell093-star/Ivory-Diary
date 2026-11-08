import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ArrowUpRight, BookOpen, Check, ExternalLink, FilePlus2, ImagePlus, Link2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import ImageCropper from './ImageCropper';
import { ADMIN_URL, PUBLIC_SUPABASE_KEY, adminRequest } from './lib';

type MediaItem = { path: string; url: string };
type ThreadSection = { description: string; link?: string; images: MediaItem[] };
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

const sectionMeta: { key: SectionKey; label: string; hint: string; imageLimit: number }[] = [
  { key: 'introduction', label: 'Introduction', hint: 'Satu gambar pengenalan dan deskripsi singkat karakter.', imageLimit: 1 },
  { key: 'terminology', label: 'Terminology', hint: 'Uraian istilah, konsep, atau penamaan khusus.', imageLimit: 0 },
  { key: 'cosmology', label: 'Cosmology', hint: 'Penjelasan struktur dunia, alam, dimensi, atau kosmologi.', imageLimit: 0 },
  { key: 'personality', label: 'Personality', hint: 'Uraian karakterisasi dan kepribadian.', imageLimit: 0 },
  { key: 'statistic', label: 'Statistic', hint: 'Statistik dan feat yang mendukung penilaian karakter.', imageLimit: 10 },
  { key: 'hax_ability', label: 'Hax & Ability', hint: 'Kemampuan khusus, mekanisme, dan penerapannya.', imageLimit: 10 },
  { key: 'resistance', label: 'Resistance', hint: 'Jenis resistansi dan bukti pendukungnya.', imageLimit: 10 },
];

const blankSections = (): ThreadSections => ({
  introduction: { description: '', images: [] },
  terminology: { description: '', link: '', images: [] },
  cosmology: { description: '', link: '', images: [] },
  personality: { description: '', link: '', images: [] },
  statistic: { description: '', link: '', images: [] },
  hax_ability: { description: '', link: '', images: [] },
  resistance: { description: '', link: '', images: [] },
});

const newDraft = (): Draft => ({
  slug: '',
  title: '',
  character_name: '',
  universe: '',
  sections: blankSections(),
  is_published: true,
});

const words = (value: string) => value.trim() ? value.trim().split(/\s+/u).length : 0;
const totalWords = (sections: ThreadSections) => sectionMeta.reduce((sum, item) => sum + words(sections[item.key]?.description || ''), 0);
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
      ...(meta.key === 'introduction' ? {} : { link: typeof section.link === 'string' ? section.link : '' }),
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

  const wordCount = useMemo(() => totalWords(draft?.sections || blankSections()), [draft?.sections]);
  const activeMeta = sectionMeta.find(section => section.key === activeSection)!;
  const activeContent = draft?.sections[activeSection] || blankSections()[activeSection];

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
    if (!activeContent.description.trim()) {
      setNotice('Isi deskripsi bagian ini terlebih dahulu sebelum menambahkan foto.');
      return;
    }
    if (activeContent.images.length >= activeMeta.imageLimit) {
      setNotice('Kuota foto untuk bagian ' + activeMeta.label + ' sudah penuh.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice('Ukuran foto sumber maksimal 20 MB sebelum crop.');
      return;
    }
    setNotice('');
    setCropFile(file);
  };

  const uploadCroppedImage = async (file: File) => {
    if (!draft) throw new Error('Draft Respect Thread tidak ditemukan.');
    if (file.type !== 'image/jpeg') throw new Error('Foto harus berupa hasil crop JPEG.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Ukuran hasil crop maksimal 8 MB.');
    if (activeContent.images.length >= activeMeta.imageLimit) throw new Error('Batas foto bagian ini sudah tercapai.');
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
    if (wordCount > 15000) return 'Total seluruh deskripsi maksimal 15.000 kata.';
    const hasContent = sectionMeta.some(meta => draft.sections[meta.key].description.trim());
    if (!hasContent) return 'Isi setidaknya satu deskripsi pada salah satu bagian.';
    for (const meta of sectionMeta) {
      const section = draft.sections[meta.key];
      const hasDescription = section.description.trim().length > 0;
      if (!hasDescription && ((section.link || '').trim() || section.images.length > 0)) {
        return 'Isi deskripsi pada bagian ' + meta.label + ' sebelum menyimpan link atau foto.';
      }
      if (section.images.length > meta.imageLimit) return 'Jumlah foto bagian ' + meta.label + ' melebihi batas.';
      if (section.link?.trim()) {
        try {
          const url = new URL(section.link.trim());
          if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
        } catch {
          return 'Link bagian ' + meta.label + ' harus berupa alamat HTTP atau HTTPS yang valid.';
        }
      }
    }
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
        sections: draft.sections,
        is_published: draft.is_published,
      };
      if (draft.id) {
        await adminRequest(token, 'update', { table: 'respect_threads', id: draft.id, values }, 'PATCH');
      } else {
        await adminRequest(token, 'create', { table: 'respect_threads', values });
      }
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
          <div className="rt-editor-toolbar"><div><span className="eyebrow">THREAD EDITOR / {draft.id ? 'EDIT' : 'NEW ENTRY'}</span><h3>{draft.id ? 'Perbarui thread' : 'Thread baru'}</h3></div><button type="button" className="rt-editor-close" onClick={() => !saving && setDraft(null)} disabled={saving}><X size={16} /> Tutup editor</button></div>

          <div className="rt-editor-meta">
            <label className="field"><span>Judul Respect Thread *</span><input value={draft.title} maxLength={180} placeholder="Contoh: Nama Karakter — Respect Thread" onChange={event => {
              const title = event.target.value;
              setDraft(current => current ? ({ ...current, title, ...(!slugTouched ? { slug: makeSlug(title) } : {}) }) : current);
            }} /></label>
            <label className="field"><span>Nama karakter</span><input value={draft.character_name} maxLength={160} placeholder="Nama karakter" onChange={event => setDraft(current => current ? ({ ...current, character_name: event.target.value }) : current)} /></label>
            <label className="field"><span>Verse / Universe</span><input value={draft.universe} maxLength={160} placeholder="Asal cerita atau semesta" onChange={event => setDraft(current => current ? ({ ...current, universe: event.target.value }) : current)} /></label>
            <label className="field"><span>Alamat halaman (slug) *</span><input value={draft.slug} maxLength={180} placeholder="nama-karakter-respect-thread" onChange={event => { setSlugTouched(true); setDraft(current => current ? ({ ...current, slug: makeSlug(event.target.value) }) : current); }} /><small>Halaman publik: /respect-thread/{draft.slug || 'slug-thread'}</small></label>
          </div>

          <div className="rt-editor-section-intro"><span className="eyebrow">CONTENT STRUCTURE / 07 SECTIONS</span><p>Pilih bagian yang ingin diisi. Setiap bagian memiliki kolom deskripsinya sendiri.</p></div>
          <div className="rt-editor-layout">
            <nav className="rt-editor-nav" aria-label="Pilih bagian Respect Thread">
              {sectionMeta.map((meta, index) => {
                const filled = Boolean(draft.sections[meta.key].description.trim());
                return <button type="button" key={meta.key} className={activeSection === meta.key ? 'active' : ''} onClick={() => { setActiveSection(meta.key); setNotice(''); }}><span>{String(index + 1).padStart(2, '0')}</span><b>{meta.label}</b>{filled && <Check size={14} />}</button>;
              })}
            </nav>

            <section className="rt-editor-pane">
              <div className="rt-editor-pane-heading"><div><span className="eyebrow">SECTION {String(sectionMeta.findIndex(x => x.key === activeSection) + 1).padStart(2, '0')}</span><h3>{activeMeta.label}</h3><p>{activeMeta.hint}</p></div><span className="rt-section-word-count">{words(activeContent.description)} kata</span></div>
              <label className="field rt-description-field"><span>Deskripsi bagian</span><textarea rows={10} maxLength={180000} value={activeContent.description} placeholder={'Tulis penjelasan untuk ' + activeMeta.label + ' di sini…'} onChange={event => updateSection(activeSection, { description: event.target.value })} /><small>Total seluruh bagian: {wordCount.toLocaleString('id-ID')} / 15.000 kata.</small></label>

              {activeSection !== 'introduction' && <label className="field rt-link-field"><span><Link2 size={13} /> Link referensi (opsional)</span><input type="url" value={activeContent.link || ''} disabled={!activeContent.description.trim()} placeholder="https://…" onChange={event => updateSection(activeSection, { link: event.target.value })} /><small>Link akan ditampilkan sebagai tautan aktif pada halaman publik. Isi deskripsi sebelum menambahkan link.</small></label>}

              {activeMeta.imageLimit > 0 && <div className="rt-media-field">
                <div className="rt-media-field-heading"><div><span><ImagePlus size={14} /> Foto pendukung</span><small>{activeContent.images.length} / {activeMeta.imageLimit} foto · JPG, PNG, WebP</small></div><label className={activeContent.description.trim() && activeContent.images.length < activeMeta.imageLimit ? 'rt-upload-button' : 'rt-upload-button disabled'}><Plus size={14} /> Tambah foto<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!activeContent.description.trim() || activeContent.images.length >= activeMeta.imageLimit || cropBusy} onChange={chooseImage} /></label></div>
                <p className="rt-media-hint">Video tidak didukung. Foto akan dipotong dan disimpan sebagai JPEG. Deskripsi bagian wajib diisi sebelum foto dapat ditambahkan.</p>
                {activeContent.images.length > 0 && <div className="rt-upload-preview">{activeContent.images.map((image, index) => <figure key={image.path}><img src={image.url} alt={'Foto ' + (index + 1) + ' bagian ' + activeMeta.label} /><button type="button" aria-label="Hapus foto" onClick={() => removeImage(index)}><Trash2 size={13} /></button><figcaption>FOTO {String(index + 1).padStart(2, '0')}</figcaption></figure>)}</div>}
              </div>}

              {activeSection === 'introduction' && <div className="rt-intro-photo-note"><ImagePlus size={15} /><span>Introduction hanya menerima satu foto. Deskripsi boleh disimpan tanpa foto.</span></div>}
              {activeMeta.imageLimit === 0 && activeSection !== 'introduction' && <div className="rt-intro-photo-note"><Link2 size={15} /><span>Bagian ini berisi deskripsi dan satu link referensi opsional. Foto tidak tersedia di bagian ini.</span></div>}
            </section>
          </div>

          <div className="rt-editor-footer">
            <div className="rt-editor-word-total"><span>TOTAL KATA</span><b className={wordCount > 15000 ? 'over-limit' : ''}>{wordCount.toLocaleString('id-ID')} / 15.000</b></div>
            <label className="rt-publish-toggle"><input type="checkbox" checked={draft.is_published} onChange={event => setDraft(current => current ? ({ ...current, is_published: event.target.checked }) : current)} /><span><b>Publikasikan</b><small>{draft.is_published ? 'Thread dapat dibaca publik setelah disimpan.' : 'Thread disimpan sebagai draft dan tidak terlihat publik.'}</small></span></label>
            <div className="rt-editor-actions"><button className="button secondary" type="button" onClick={() => setDraft(null)} disabled={saving}>Batal</button><button className="button primary" type="button" onClick={() => void save()} disabled={saving || wordCount > 15000}><Save size={15} /> {saving ? 'Menyimpan…' : draft.is_published ? 'Simpan & publikasikan' : 'Simpan draft'}</button></div>
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

      {cropFile && <div className="rt-crop-overlay"><div className="rt-crop-dialog"><div className="rt-crop-heading"><span className="eyebrow">RESPECT THREAD / PHOTO STUDIO</span><button type="button" aria-label="Tutup crop foto" onClick={() => !cropBusy && setCropFile(null)} disabled={cropBusy}><X size={17} /></button></div><ImageCropper file={cropFile} busy={cropBusy} onCancel={() => !cropBusy && setCropFile(null)} onComplete={uploadCroppedImage} /></div></div>}
    </section>
  );
}
