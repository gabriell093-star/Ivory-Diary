import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { supabase } from './lib';

type MediaItem = { path: string; url: string };
type ThreadContent = { description?: string; links?: string[]; link?: string; images?: MediaItem[]; level?: string };
type EvidenceFeat = ThreadContent & { id?: string };
type EvidenceEntry = { id?: string; name?: string; feats?: EvidenceFeat[] };
type ThreadSection = ThreadContent & {
  categories?: Record<string, ThreadContent>;
  entries?: EvidenceEntry[];
};
type ThreadRecord = {
  id: string;
  slug: string;
  title: string;
  character_name: string;
  universe: string;
  sections: Record<string, ThreadSection>;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

const statMeta = [
  { key: 'attack_potency', label: 'Attack Potency', index: '01' },
  { key: 'durability', label: 'Durability', index: '02' },
  { key: 'speed', label: 'Speed', index: '03' },
  { key: 'stamina', label: 'Stamina', index: '04' },
] as const;

const sectionMeta = [
  { key: 'introduction', label: 'Introduction', index: '01', hint: 'Pengenalan karakter dan konteks.' },
  { key: 'terminology', label: 'Terminology', index: '02', hint: 'Istilah khusus dan definisinya.' },
  { key: 'cosmology', label: 'Cosmology', index: '03', hint: 'Struktur dunia dan skalanya.' },
  { key: 'personality', label: 'Personality', index: '04', hint: 'Kepribadian dan karakterisasi.' },
  { key: 'in_char', label: 'BIQ', index: '05', hint: 'Battle IQ dan kecerdasan bertarung karakter.' },
  { key: 'statistic', label: 'Statistics', index: '06', hint: 'Attack Potency, Durability, Speed, dan Stamina.' },
  { key: 'resistance', label: 'Resistances', index: '07', hint: 'Jenis resistansi beserta feat pendukungnya.' },
  { key: 'hax_ability', label: 'Hax & Ability', index: '08', hint: 'Kemampuan beserta feat pendukungnya.' },
] as const;

const safeHttpUrl = (value?: string | null) => {
  if (!value || /\s/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const normalizeContent = (content?: ThreadContent | null): ThreadContent => ({
  description: typeof content?.description === 'string' ? content.description : '',
  links: Array.isArray(content?.links) ? content!.links!.filter((item): item is string => typeof item === 'string')
    : (typeof content?.link === 'string' && content.link.trim() ? [content.link] : []),
  images: Array.isArray(content?.images) ? content!.images!.filter(item => item && typeof item.url === 'string') : [],
  ...(typeof content?.level === 'string' ? { level: content.level } : {}),
});

const contentIsFilled = (content?: ThreadContent | null) => {
  const normalized = normalizeContent(content);
  return Boolean(normalized.description.trim() || normalized.links?.some(link => link.trim()) || normalized.images?.length || normalized.level?.trim());
};

const sectionIsFilled = (section: ThreadSection | undefined, key: string) => {
  if (!section) return false;
  if (contentIsFilled(section)) return true;
  if (key === 'statistic' && statMeta.some(meta => contentIsFilled(section.categories?.[meta.key]))) return true;
  if ((key === 'resistance' || key === 'hax_ability') && (section.entries || []).some(entry => (
    Boolean(entry.name?.trim()) || (entry.feats || []).some(contentIsFilled)
  ))) return true;
  return false;
};

function ThreadImage({ item, title, index }: { item: MediaItem; title: string; index: number }) {
  return (
    <a className="rt-image-card" href={item.url} target="_blank" rel="noreferrer">
      <img src={item.url} alt={title + ' — foto ' + (index + 1)} loading="lazy" />
      <span><ImageIcon size={13} /> Buka gambar <ArrowUpRight size={13} /></span>
    </a>
  );
}

function PublicContentBlock({ content, title, threadTitle }: { content?: ThreadContent | null; title?: string; threadTitle: string }) {
  const normalized = normalizeContent(content);
  const references = (normalized.links || []).map(reference => reference.trim()).filter(Boolean);
  const images = normalized.images || [];
  if (!normalized.description?.trim() && references.length === 0 && images.length === 0) return null;

  return (
    <div className="rt-public-content-block">
      {title && <h4 className="rt-public-content-title">{title}</h4>}
      {normalized.description?.trim() && <div className="rt-section-copy">{normalized.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
      {references.length > 0 && <div className="rt-source-links">{references.map((reference, index) => {
        const url = safeHttpUrl(reference);
        return url
          ? <a className="rt-source-link" key={reference + '-' + index} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Buka sumber / referensi {references.length > 1 ? index + 1 : ''} <ArrowUpRight size={14} /></a>
          : <p className="rt-source-note" key={'text-' + index}>{reference}</p>;
      })}</div>}
      {images.length > 0 && <div className="rt-image-grid">{images.map((item, index) => <ThreadImage key={item.path || item.url} item={item} title={threadTitle} index={index} />)}</div>}
    </div>
  );
}

export default function RespectThreads({ slug, onNavigate }: { slug?: string; onNavigate: (path: string) => void }) {
  const [items, setItems] = useState<ThreadRecord[]>([]);
  const [thread, setThread] = useState<ThreadRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      if (!supabase) {
        setError('Koneksi data belum tersedia. Silakan coba kembali beberapa saat lagi.');
        setLoading(false);
        return;
      }
      try {
        if (slug) {
          const { data, error: queryError } = await supabase
            .from('respect_threads')
            .select('id,slug,title,character_name,universe,sections,is_published,created_at,updated_at')
            .eq('slug', slug)
            .eq('is_published', true)
            .maybeSingle();
          if (queryError) throw queryError;
          if (active) setThread((data as ThreadRecord | null) || null);
        } else {
          const { data, error: queryError } = await supabase
            .from('respect_threads')
            .select('id,slug,title,character_name,universe,sections,is_published,created_at,updated_at')
            .eq('is_published', true)
            .order('updated_at', { ascending: false });
          if (queryError) throw queryError;
          if (active) setItems((data || []) as ThreadRecord[]);
        }
      } catch (cause) {
        console.error('Respect Thread fetch failed:', cause);
        if (active) setError('Respect Thread belum dapat dimuat. Silakan muat ulang halaman.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [slug]);

  const sectionCount = useMemo(() => {
    if (!thread) return 0;
    return sectionMeta.filter(({ key }) => sectionIsFilled(thread.sections?.[key], key)).length;
  }, [thread]);

  if (slug) {
    if (loading) return <section className="rt-page section-wrap"><div className="rt-loading">Memuat Respect Thread…</div></section>;
    if (error) return <section className="rt-page section-wrap"><div className="rt-empty"><p>{error}</p><button className="button secondary" onClick={() => window.location.reload()}>Muat ulang</button></div></section>;
    if (!thread) return (
      <section className="rt-page section-wrap">
        <button className="rt-back-link" onClick={() => onNavigate('/respect-thread')}><ArrowLeft size={15} /> Semua Respect Thread</button>
        <div className="rt-empty"><span className="eyebrow">RESPECT THREAD / 404</span><h1>Thread tidak<br /><em>ditemukan.</em></h1><p>Thread ini belum dipublikasikan atau alamatnya tidak tersedia.</p></div>
      </section>
    );

    return (
      <section className="rt-page rt-detail-page section-wrap">
        <button className="rt-back-link" onClick={() => onNavigate('/respect-thread')}><ArrowLeft size={15} /> Semua Respect Thread</button>
        <header className="rt-detail-hero">
          <div className="rt-detail-hero-copy">
            <span className="eyebrow">IVORY DIARY / RESPECT THREAD</span>
            <h1>{thread.title}</h1>
            {(thread.character_name || thread.universe) && (
              <p className="rt-detail-meta">{[thread.character_name, thread.universe].filter(Boolean).join(' · ')}</p>
            )}
            <p className="rt-detail-intro">Referensi karakter yang disusun berdasarkan pengenalan, konteks, statistik, kemampuan, resistansi, dan bukti feat pendukung.</p>
          </div>
        </header>

        <nav className="rt-toc" aria-label="Daftar bagian Respect Thread">
          {sectionMeta.map(section => sectionIsFilled(thread.sections?.[section.key], section.key)
            ? <a key={section.key} href={'#rt-' + section.key}><span>{section.index}</span>{section.label}</a>
            : null)}
        </nav>

        <div className="rt-detail-content">
          {sectionMeta.map(meta => {
            const section: ThreadSection = thread.sections?.[meta.key] || { description: '', images: [] };
            if (!sectionIsFilled(section, meta.key)) return null;
            return (
              <article className="rt-section-card" id={'rt-' + meta.key} key={meta.key}>
                <div className="rt-section-heading"><span>{meta.index}</span><div><p className="eyebrow">RESPECT THREAD / SECTION {meta.index}</p><h2>{meta.label}</h2></div></div>

                {meta.key === 'statistic' ? <>
                  {contentIsFilled(section) && <div className="rt-stat-overview"><PublicContentBlock content={section} title="Statistical overview" threadTitle={thread.title} /></div>}
                  <div className="rt-stat-public-list" aria-label="Empat kategori statistik">
                    {statMeta.map(category => {
                      const content = section.categories?.[category.key];
                      return contentIsFilled(content) ? <section className="rt-stat-public-card" key={category.key}>
                        <header>
                          <div className="rt-stat-public-topline">
                            <span className="eyebrow">METRIC / {category.index}</span>
                            <span className="rt-stat-public-marker">{category.index}</span>
                          </div>
                          <h3>{category.label}{content?.level?.trim() ? <span className="rt-stat-public-value">: {content.level.trim()}</span> : null}</h3>
                        </header>
                        <PublicContentBlock content={content} threadTitle={thread.title} />
                      </section> : null;
                    })}
                  </div>
                </> : meta.key === 'resistance' || meta.key === 'hax_ability' ? <>
                  {contentIsFilled(section) && <div className="rt-evidence-general-notes"><PublicContentBlock content={section} title="General notes" threadTitle={thread.title} /></div>}
                  <div className="rt-evidence-public-list">
                    {(section.entries || []).map((entry, entryIndex) => <article className="rt-evidence-public-card" key={entry.id || entryIndex}>
                      <header className="rt-evidence-public-heading">
                        <span className="rt-evidence-public-index">{String(entryIndex + 1).padStart(2, '0')}</span>
                        <div className="rt-evidence-public-title">
                          <span className="eyebrow">{meta.key === 'resistance' ? 'RESISTANCE' : 'ABILITY'} ENTRY</span>
                          <h3>{entry.name || (meta.key === 'resistance' ? 'Resistance' : 'Ability')}</h3>
                        </div>
                        <span className="rt-evidence-feat-count">{(entry.feats || []).length} {(entry.feats || []).length === 1 ? 'feat' : 'feats'}</span>
                      </header>
                      <div className="rt-public-feat-list">
                        {(entry.feats || []).map((feat, featIndex) => <article className="rt-public-feat-card" key={feat.id || featIndex}>
                          <div className="rt-public-feat-heading">
                            <span className="rt-public-feat-index">FEAT / {String(featIndex + 1).padStart(2, '0')}</span>
                            <span className="rt-public-feat-label">SUPPORTING EVIDENCE</span>
                          </div>
                          <PublicContentBlock content={feat} threadTitle={thread.title} />
                        </article>)}
                      </div>
                    </article>)}
                  </div>
                </> : <PublicContentBlock content={section} threadTitle={thread.title} />}
              </article>
            );
          })}
        </div>

        <footer className="rt-detail-footer"><span>IVORY DIARY / RESPECT THREAD</span><span>{sectionCount} / 08 BAGIAN TERISI</span></footer>
      </section>
    );
  }

  return (
    <section className="rt-page section-wrap">
      <header className="rt-list-hero">
        <div className="rt-list-hero-copy">
          <span className="eyebrow">IVORY DIARY / RESPECT THREAD</span>
          <h1>Respect <em>Thread.</em></h1>
          <p>Temukan dokumentasi karakter yang disusun dengan penjelasan, referensi, statistik, kemampuan, resistansi, dan bukti pendukung.</p>
        </div>
      </header>
      <div className="rt-list-toolbar"><span>{loading ? 'MEMUAT THREAD…' : String(items.length).padStart(2, '0') + ' THREAD TERSEDIA'}</span><span>TERBUKA UNTUK PUBLIK</span></div>
      {error ? <div className="rt-empty"><p>{error}</p><button className="button secondary" onClick={() => window.location.reload()}>Muat ulang</button></div>
        : loading ? <div className="rt-loading">Memuat daftar Respect Thread…</div>
          : items.length === 0 ? <div className="rt-empty"><span className="eyebrow">ARCHIVE / EMPTY</span><h2>Belum ada Respect Thread.</h2><p>Thread yang telah dipublikasikan akan muncul di halaman ini.</p></div>
            : <div className="rt-list-grid">{items.map(item => {
              const count = sectionMeta.filter(({ key }) => sectionIsFilled(item.sections?.[key], key)).length;
              const cover = item.sections?.introduction?.images?.[0]?.url;
              return (
                <button type="button" className="rt-list-card" key={item.id} onClick={() => onNavigate('/respect-thread/' + encodeURIComponent(item.slug))}>
                  <span className="rt-card-cover">{cover ? <img src={cover} alt="" loading="lazy" /> : <BookOpen size={24} />}</span>
                  <div className="rt-card-main">
                    <span className="rt-card-overline">RESPECT THREAD <span>{String(count).padStart(2, '0')} / 08 BAGIAN</span></span>
                    <h2>{item.title}</h2>
                    <p className="rt-card-meta">{[item.character_name, item.universe].filter(Boolean).join(' · ') || 'Karakter / Universe tidak dicantumkan'}</p>
                    {item.sections?.introduction?.description?.trim() && <p className="rt-card-excerpt">{item.sections.introduction.description.trim().replace(/\s+/g, ' ').slice(0, 145)}{item.sections.introduction.description.trim().length > 145 ? '…' : ''}</p>}
                  </div>
                  <span className="rt-card-arrow"><ArrowUpRight size={19} /></span>
                </button>
              );
            })}</div>}
      <div className="rt-list-footnote"><span>IVORY DIARY / RESPECT THREADS</span><span>OPEN READING / PUBLIC COLLECTION</span></div>
    </section>
  );
}
