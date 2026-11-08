import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { supabase } from './lib';

type MediaItem = { path: string; url: string };
type ThreadSection = { description: string; links?: string[]; link?: string; images: MediaItem[] };
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

const sectionMeta = [
  { key: 'introduction', label: 'Introduction', index: '01', hint: 'Pengenalan karakter dan konteks.' },
  { key: 'terminology', label: 'Terminology', index: '02', hint: 'Istilah khusus dan definisinya.' },
  { key: 'cosmology', label: 'Cosmology', index: '03', hint: 'Struktur dunia dan skalanya.' },
  { key: 'personality', label: 'Personality', index: '04', hint: 'Kepribadian dan karakterisasi.' },
  { key: 'statistic', label: 'Statistic', index: '05', hint: 'Feat, statistik, dan pencapaian.' },
  { key: 'hax_ability', label: 'Hax & Ability', index: '06', hint: 'Kemampuan khusus dan penerapannya.' },
  { key: 'resistance', label: 'Resistance', index: '07', hint: 'Ketahanan dan resistansi.' },
] as const;

const safeHttpUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

function ThreadImage({ item, title, index }: { item: MediaItem; title: string; index: number }) {
  return (
    <a className="rt-image-card" href={item.url} target="_blank" rel="noreferrer">
      <img src={item.url} alt={title + ' — foto ' + (index + 1)} loading="lazy" />
      <span><ImageIcon size={13} /> Buka gambar <ArrowUpRight size={13} /></span>
    </a>
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
    return sectionMeta.filter(({ key }) => {
      const section = thread.sections?.[key];
      return Boolean(section?.description?.trim() || section?.link?.trim() || section?.images?.length);
    }).length;
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
            <p className="rt-detail-intro">Referensi karakter yang disusun berdasarkan pengenalan, konteks, statistik, kemampuan, dan bukti pendukung.</p>
          </div>
        </header>

        <nav className="rt-toc" aria-label="Daftar bagian Respect Thread">
          {sectionMeta.map((section) => {
            const exists = Boolean(thread.sections?.[section.key]?.description?.trim());
            return exists ? <a key={section.key} href={'#rt-' + section.key}><span>{section.index}</span>{section.label}</a> : null;
          })}
        </nav>

        <div className="rt-detail-content">
          {sectionMeta.map((meta) => {
            const section = thread.sections?.[meta.key];
            if (!section?.description?.trim()) return null;
            const rawLinks = Array.isArray(section.links) ? section.links : (section.link ? [section.link] : []);
            const links = rawLinks.map(link => safeHttpUrl(link)).filter((link): link is string => Boolean(link));
            const images = Array.isArray(section.images) ? section.images : [];
            return (
              <article className="rt-section-card" id={'rt-' + meta.key} key={meta.key}>
                <div className="rt-section-heading"><span>{meta.index}</span><div><p className="eyebrow">RESPECT THREAD / SECTION {meta.index}</p><h2>{meta.label}</h2></div></div>
                <div className="rt-section-copy">{section.description.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                {links.length > 0 && <div className="rt-source-links">{links.map((link, index) => <a className="rt-source-link" key={link + '-' + index} href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> {links.length === 1 ? 'Buka sumber / referensi' : 'Buka sumber / referensi ' + (index + 1)} <ArrowUpRight size={14} /></a>)}</div>}
                {images.length > 0 && <div className="rt-image-grid">{images.map((item, index) => <ThreadImage key={item.path || item.url} item={item} title={thread.title} index={index} />)}</div>}
              </article>
            );
          })}
        </div>

        <footer className="rt-detail-footer"><span>IVORY DIARY / RESPECT THREAD</span><span>{sectionCount} BAGIAN TERISI</span></footer>
      </section>
    );
  }

  return (
    <section className="rt-page section-wrap">
      <header className="rt-list-hero">
        <div className="rt-list-hero-copy">
          <span className="eyebrow">IVORY DIARY / RESPECT THREAD</span>
          <h1>Respect <em>Thread.</em></h1>
          <p>Temukan dokumentasi karakter yang disusun dengan penjelasan, referensi, statistik, kemampuan, dan bukti pendukung.</p>
        </div>
      </header>
      <div className="rt-list-toolbar"><span>{loading ? 'MEMUAT THREAD…' : String(items.length).padStart(2, '0') + ' THREAD TERSEDIA'}</span><span>TERBUKA UNTUK PUBLIK</span></div>
      {error ? <div className="rt-empty"><p>{error}</p><button className="button secondary" onClick={() => window.location.reload()}>Muat ulang</button></div>
        : loading ? <div className="rt-loading">Memuat daftar Respect Thread…</div>
          : items.length === 0 ? <div className="rt-empty"><span className="eyebrow">ARCHIVE / EMPTY</span><h2>Belum ada Respect Thread.</h2><p>Thread yang telah dipublikasikan akan muncul di halaman ini.</p></div>
            : <div className="rt-list-grid">{items.map((item, index) => {
              const count = sectionMeta.filter(({ key }) => Boolean(item.sections?.[key]?.description?.trim())).length;
              const cover = item.sections?.introduction?.images?.[0]?.url;
              return (
                <button type="button" className="rt-list-card" key={item.id} onClick={() => onNavigate('/respect-thread/' + encodeURIComponent(item.slug))}>
                  <span className="rt-card-cover">{cover ? <img src={cover} alt="" loading="lazy" /> : <BookOpen size={24} />}</span>
                  <div className="rt-card-main">
                    <span className="rt-card-overline">RESPECT THREAD <span>{String(count).padStart(2, '0')} / 07 BAGIAN</span></span>
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
