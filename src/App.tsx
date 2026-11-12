import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Menu, Moon, Plus, ShieldCheck, Sun, X, Clock3, LockKeyhole, Pencil, Trash2 } from 'lucide-react';
import ImageCropper from './ImageCropper';
import FlipCoin from './FlipCoin';
import RespectThreads from './RespectThreads';
import RespectThreadManager from './RespectThreadManager';
import { ADMIN_URL, AdminRequestError, adminRequest, categoryLabels, money, supabase, type Service, type Staff, type Testimonial } from './lib';

type Owner = { username:string; display_name:string };
type AdminTab = 'services'|'testimonials'|'staff'|'site_content'|'respect_threads';
const staffSeed:Staff[]=[
{id:'gabriel',slug:'gabriel',name:'Gabriel',summary:'Debater yang berfokus pada analisis low dan mid tier, khususnya To Be Hero X.',bio:'Gabriel adalah debater yang berkecimpung di tanah low dan mid tier, terutama verse To Be Hero X. Tidak hanya handal dalam menganalisis, tetapi juga berkecukupan menjabarkannya secara proporsional. Sempat menerbitkan beberapa karya akademisnya tentang Filsafat, Politik, dan Teologi.',whatsapp_number:'082228671206',photo_path:null,is_visible:true,is_detailed:true,sort_order:1},
{id:'maru',slug:'maru',name:'Maru',summary:'Debater aktif dengan cakupan berbagai verse populer hingga underrated.',bio:'Maru adalah debater yang cukup aktif berkecimpung dalam berbagai verse besar seperti Naruto, One Piece, My Hero Academia, hingga berbagai fiksi Manhwa yang tergolong underrated. Memiliki cakupan pengetahuan yang cukup luas dalam melakukan Scaling maupun analisis terhadap berbagai verse.',whatsapp_number:'085761300772',photo_path:null,is_visible:true,is_detailed:true,sort_order:2},
{id:'albirru',slug:'albirru',name:'Albirru',summary:'Staff Ivory Diary.',bio:'Hubungi Albirru untuk konsultasi dan kebutuhan layanan Ivory Diary.',whatsapp_number:'085886744562',photo_path:null,is_visible:true,is_detailed:true,sort_order:3}
];
const serviceSeed:Service[]=[
{id:'1',slug:'penilaian-debat',category:'battle-boarding',title:'Penilaian Debat',description:'Penilaian debat berdasarkan tier yang dipilih.',details:'Pilih Low, Mid, atau High Tier sesuai kebutuhan.',pricing_type:'tiered',price_label:'Rp11.000 – Rp20.000',base_price:null,unit_label:null,options:[{label:'Low Tier',price:11000},{label:'Mid Tier',price:14000},{label:'High Tier',price:20000}],is_active:true,sort_order:1},
{id:'2',slug:'joki-debat',category:'battle-boarding',title:'Joki Debat',description:'Layanan joki debat untuk kebutuhan Battle Boarding.',details:'Kategori atau karakter tertentu dapat termasuk dalam ketentuan High Tier.',pricing_type:'tiered',price_label:'Rp12.000 – Rp21.000',base_price:null,unit_label:null,options:[{label:'Low Tier',price:12000},{label:'Mid Tier',price:15000},{label:'High Tier',price:21000}],is_active:true,sort_order:2},
{id:'3',slug:'respect-thread',category:'battle-boarding',title:'Pembuatan Respect Thread',description:'Penyusunan Respect Thread berdasarkan jumlah chapter.',details:'Estimasi dihitung dari jumlah chapter dikalikan Rp700.',pricing_type:'per_unit',price_label:'Rp700 / chapter',base_price:700,unit_label:'chapter',options:[],is_active:true,sort_order:3},
{id:'4',slug:'kalkulasi-feats',category:'battle-boarding',title:'Pembuatan Kalkulasi',description:'Pembuatan kalkulasi berdasarkan jumlah feats.',details:'Estimasi dihitung dari jumlah feats dikalikan Rp10.000.',pricing_type:'per_unit',price_label:'Rp10.000 / feats',base_price:10000,unit_label:'feats',options:[],is_active:true,sort_order:4},
{id:'5',slug:'penilaian-pro-kontra',category:'debat-konvensional',title:'Penilaian Pro & Kontra / Debat',description:'Penilaian dan analisis untuk berbagai subjek debat.',details:'Harga tetap untuk layanan penilaian Pro & Kontra / Debat.',pricing_type:'fixed',price_label:'Rp20.000',base_price:20000,unit_label:null,options:[],is_active:true,sort_order:1},
{id:'6',slug:'joki-pro-kontra',category:'debat-konvensional',title:'Joki Pro & Kontra / Debat',description:'Bantuan penyusunan materi Pro & Kontra / Debat.',details:'Detail kebutuhan dibicarakan lebih lanjut melalui WhatsApp.',pricing_type:'fixed',price_label:'Rp23.000',base_price:23000,unit_label:null,options:[],is_active:true,sort_order:2},
{id:'7',slug:'pembuatan-esai',category:'akademis',title:'Pembuatan Esai',description:'Penulisan esai untuk berbagai topik dengan pendekatan yang tidak generik.',details:'Harga akhir dikonfirmasi berdasarkan kebutuhan melalui WhatsApp.',pricing_type:'range',price_label:'Rp30.000 – Rp50.000',base_price:null,unit_label:null,options:[],is_active:true,sort_order:1},
{id:'8',slug:'pembuatan-artikel',category:'akademis',title:'Pembuatan Artikel',description:'Pembuatan artikel untuk berbagai topik.',details:'Harga akhir dikonfirmasi melalui WhatsApp.',pricing_type:'range',price_label:'Rp25.000 – Rp35.000',base_price:null,unit_label:null,options:[],is_active:true,sort_order:2},
{id:'9',slug:'pembuatan-makalah',category:'akademis',title:'Pembuatan Makalah',description:'Pembuatan makalah untuk berbagai topik.',details:'Harga akhir dikonfirmasi melalui WhatsApp.',pricing_type:'range',price_label:'Rp25.000 – Rp35.000',base_price:null,unit_label:null,options:[],is_active:true,sort_order:3},
{id:'10',slug:'pembuatan-ppt',category:'akademis',title:'Pembuatan PowerPoint / PPT',description:'Pembuatan slide presentasi berdasarkan jumlah halaman.',details:'Estimasi dihitung dari jumlah halaman dikalikan Rp3.000.',pricing_type:'per_unit',price_label:'Rp3.000 / halaman',base_price:3000,unit_label:'halaman',options:[],is_active:true,sort_order:4}
];
const dateLabel=(value:string)=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T00:00:00'));
const fieldLabel=(key:string)=>key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const localDateValue=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const MAX_TESTIMONIAL_IMAGES=20;
function Portrait({src,name,large=false}:{src:string|null;name:string;large?:boolean}){
 const [failed,setFailed]=useState(!src);useEffect(()=>setFailed(!src),[src]);
 return failed?<div className={large?'portrait-fallback portrait-large':'portrait-fallback'} aria-label={name}>{name.slice(0,1)}</div>:<img src={src||''} alt={name} onError={()=>setFailed(true)}/>;
}
function IconButton({children,label,onClick}:{children:ReactNode;label:string;onClick:()=>void}){
 return <button className="icon-button" type="button" aria-label={label} onClick={onClick}>{children}</button>;
}
function App(){
 const [path,setPath]=useState(()=>window.location.pathname.replace(/\/+$/,'')||'/');
 const [theme,setTheme]=useState<'light'|'dark'>(()=>{const saved=localStorage.getItem('ivory-theme');return saved==='light'||saved==='dark'?saved:window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'});
 const [services,setServices]=useState<Service[]>(serviceSeed);const [staff,setStaff]=useState<Staff[]>(staffSeed);const [testimonials,setTestimonials]=useState<Testimonial[]>([]);const [siteCopy,setSiteCopy]=useState<Record<string,string>>({});
 const [loadError,setLoadError]=useState(false);const [menuOpen,setMenuOpen]=useState(false);const [activeCategory,setActiveCategory]=useState('all');
 const [modal,setModal]=useState<'order'|'staff'|'login'|'gallery'|null>(null);const [selectedService,setSelectedService]=useState<Service|null>(null);const [selectedStaff,setSelectedStaff]=useState<Staff|null>(null);const [selectedTestimonial,setSelectedTestimonial]=useState<Testimonial|null>(null);const [galleryIndex,setGalleryIndex]=useState(0);const [touchStart,setTouchStart]=useState<number|null>(null);
 const [quantity,setQuantity]=useState(1);const [tier,setTier]=useState('');const [loginName,setLoginName]=useState('');const [loginPass,setLoginPass]=useState('');const [loginError,setLoginError]=useState('');const [loginBusy,setLoginBusy]=useState(false);
 const [token,setToken]=useState(()=>sessionStorage.getItem('ivory-owner-token')||'');const [owner,setOwner]=useState<Owner|null>(null);const [adminTab,setAdminTab]=useState<AdminTab>('services');const [adminRows,setAdminRows]=useState<Record<string,any>[]>([]);const [editing,setEditing]=useState<Record<string,any>|null>(null);const [jsonDrafts,setJsonDrafts]=useState<Record<string,string>>({});const adminFetchSequence=useRef(0);const [saving,setSaving]=useState(false);const [notice,setNotice]=useState('');const [cropFile,setCropFile]=useState<File|null>(null);const [cropTarget,setCropTarget]=useState<'photo_path'|'image_urls'|null>(null);const [cropBusy,setCropBusy]=useState(false);
 useEffect(()=>{document.documentElement.dataset.theme=theme},[theme]);
 useEffect(()=>{if(localStorage.getItem('ivory-theme'))return;const media=window.matchMedia('(prefers-color-scheme: dark)');const update=()=>{if(!localStorage.getItem('ivory-theme'))setTheme(media.matches?'dark':'light')};media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 const toggleTheme=()=>{const next=theme==='light'?'dark':'light';localStorage.setItem('ivory-theme',next);setTheme(next)};
 useEffect(()=>{let active=true;(async()=>{if(!supabase){setLoadError(true);return}const [s,st,t,c]=await Promise.all([
  supabase.from('services').select('id,slug,category,title,description,details,pricing_type,price_label,base_price,unit_label,options,is_active,sort_order').eq('is_active',true).order('sort_order'),
  supabase.from('staff').select('id,slug,name,summary,bio,whatsapp_number,photo_path,is_visible,is_detailed,sort_order').eq('is_visible',true).order('sort_order'),
  supabase.from('testimonials').select('id,service_slug,category,description,work_date,image_urls,is_published,sort_order').eq('is_published',true).order('work_date',{ascending:false}),
  supabase.from('site_content').select('key,value')
 ]);if(!active)return;if([s,st,t,c].some(x=>x.error))setLoadError(true);if(s.data)setServices(s.data as Service[]);if(st.data)setStaff(st.data as Staff[]);if(t.data)setTestimonials(t.data as Testimonial[]);if(c.data)setSiteCopy(Object.fromEntries(c.data.map((x:any)=>[x.key,x.value])));})().catch(e=>{console.error(e);if(active)setLoadError(true)});return()=>{active=false}},[]);
 const clearOwnerSession=()=>{
  sessionStorage.removeItem('ivory-owner-token');
  adminFetchSequence.current++;
  setToken('');
  setOwner(null);
  setAdminRows([]);
  setEditing(null);
  setJsonDrafts({});
  setCropFile(null);
  setCropTarget(null);
  if(window.location.pathname.startsWith('/owner')){
   window.history.replaceState({},'','/');
   setPath('/');
   setLoginError('Sesi Owner berakhir. Silakan masuk kembali.');
   setModal('login');
  }
 };
 useEffect(()=>{
  if(!token)return;
  let active=true;
  const verifySession=async()=>{
   try{
    const result=await adminRequest<{owner:Owner}>(token,'me',{},'GET');
    if(active)setOwner(result.owner);
   }catch(error){
    if(!active)return;
    if(error instanceof AdminRequestError&&error.status===401)clearOwnerSession();
    else console.warn('Owner session verification temporarily failed:',error);
   }
  };
  void verifySession();
  const onFocus=()=>{void verifySession()};
  const onVisibility=()=>{if(document.visibilityState==='visible')void verifySession()};
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   active=false;
   window.removeEventListener('focus',onFocus);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[token]);
 const fetchAdmin=async(tab:AdminTab)=>{
  const requestId=++adminFetchSequence.current;
  setAdminTab(tab);
  try{
   const result=await adminRequest<{data:Record<string,any>[]}>(token,'list&table='+encodeURIComponent(tab),{},'GET');
   if(requestId!==adminFetchSequence.current)return;
   setAdminRows(result.data||[]);
   setNotice('');
  }catch(error){
   if(requestId!==adminFetchSequence.current)return;
   if(error instanceof AdminRequestError&&error.status===401){clearOwnerSession();return}
   setNotice(error instanceof Error?error.message:'Gagal memuat data.');
  }
 };
 const fetchAdmin=async(tab:AdminTab)=>{setAdminTab(tab);try{const result=await adminRequest<{data:Record<string,any>[]}>(token,'list&table='+encodeURIComponent(tab),{},'GET');setAdminRows(result.data||[]);setNotice('')}catch(e:any){setNotice(e.message||'Gagal memuat data.')}};
 const refreshPublicContent=async(tab:AdminTab):Promise<boolean>=>{
  if(!supabase)return false;
  try{
   if(tab==='services'){
    const {data,error}=await supabase.from('services').select('id,slug,category,title,description,details,pricing_type,price_label,base_price,unit_label,options,is_active,sort_order').eq('is_active',true).order('sort_order');
    if(error)throw error;setServices((data||[]) as Service[]);
   }else if(tab==='staff'){
    const {data,error}=await supabase.from('staff').select('id,slug,name,summary,bio,whatsapp_number,photo_path,is_visible,is_detailed,sort_order').eq('is_visible',true).order('sort_order');
    if(error)throw error;setStaff((data||[]) as Staff[]);
   }else if(tab==='testimonials'){
    const {data,error}=await supabase.from('testimonials').select('id,service_slug,category,description,work_date,image_urls,is_published,sort_order').eq('is_published',true).order('work_date',{ascending:false});
    if(error)throw error;setTestimonials((data||[]) as Testimonial[]);
   }else{
    const {data,error}=await supabase.from('site_content').select('key,value');
    if(error)throw error;setSiteCopy(Object.fromEntries((data||[]).map((item:any)=>[item.key,item.value])));
   }
   setLoadError(false);return true;
  }catch(error){
   console.error('Public content refresh failed:',error);
   setLoadError(true);return false;
  }
 };
 useEffect(()=>{if(owner&&token)void fetchAdmin('services')},[owner,token]);
 const groups=useMemo(()=>['battle-boarding','debat-konvensional','akademis'].map(key=>({key,label:categoryLabels[key],items:services.filter(s=>s.category===key)})),[services]);
 const openOrder=(service:Service,person?:Staff|null)=>{setSelectedService(service);setSelectedStaff(person||null);setQuantity(1);setTier(service.options?.[0]?.label||'');setModal('order')};
 const optionPrice=selectedService?.pricing_type==='tiered'?selectedService.options?.find(x=>x.label===tier)?.price:selectedService?.base_price;
 const estimate=selectedService?.pricing_type==='per_unit'?(optionPrice||0)*quantity:optionPrice??null;
 const orderNow=()=>{if(!selectedService||!selectedStaff)return;const raw=(selectedStaff.whatsapp_number||'').replace(/\D/g,'');const number=raw.startsWith('62')?raw:raw.startsWith('0')?'62'+raw.slice(1):raw;if(number.length<10){setNotice('Nomor WhatsApp staf belum diatur dengan benar.');return}const lines=['Halo, saya ingin melakukan order melalui Ivory Diary.','Layanan: '+selectedService.title,'Pilihan: '+(tier||selectedService.price_label),...(selectedService.pricing_type==='per_unit'?['Jumlah: '+quantity+' '+(selectedService.unit_label||'')]:[]),...(estimate!==null?['Estimasi Harga: '+money(estimate)]:[]),'','Saya ingin berkonsultasi lebih lanjut mengenai kebutuhan saya.'];window.open('https://wa.me/'+number+'?text='+encodeURIComponent(lines.join('\n')),'_blank','noopener,noreferrer')};
 const login=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setLoginBusy(true);setLoginError('');try{const response=await fetch(ADMIN_URL+'?action=login',{method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY||''},body:JSON.stringify({username:loginName,password:loginPass})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Login gagal. Periksa kembali kredensial Anda.');sessionStorage.setItem('ivory-owner-token',data.token);setToken(data.token);setOwner(data.owner);setLoginPass('');navigate('/owner')}catch(e:any){setLoginError(e.message||'Login gagal.')}finally{setLoginBusy(false)}};
 const logout=async()=>{try{await adminRequest(token,'logout')}catch(error){console.error('Owner logout request failed:',error)}adminFetchSequence.current++;sessionStorage.removeItem('ivory-owner-token');setToken('');setOwner(null);setAdminRows([]);setEditing(null);setJsonDrafts({});navigate('/')};
 const uploadImage=async(file:File)=>{
  if(file.type!=='image/jpeg')throw new Error('Hasil crop harus berupa JPEG.');
  if(file.size>8*1024*1024)throw new Error('Ukuran gambar maksimal 8 MB.');
  if(!token)throw new Error('Sesi Owner tidak ditemukan. Silakan login kembali.');
  const form=new FormData();form.append('file',file,file.name);form.append('fileName',file.name);
  const headers:Record<string,string>={Authorization:`Bearer ${token}`};
  const publicKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY||'';
  if(publicKey)headers.apikey=publicKey;
  const response=await fetch(ADMIN_URL+'?action=upload',{method:'POST',headers,body:form});
  const result=await response.json().catch(()=>({error:'Respons server upload tidak valid.'}));
  if(!response.ok)throw new Error(result.error||'Upload foto gagal. Silakan coba lagi.');
  if(typeof result.url!=='string'||typeof result.path!=='string')throw new Error('Server tidak mengembalikan alamat foto yang valid.');
  return result as {path:string;url:string};
};
 const beginNew=()=>{const data:Record<AdminTab,Record<string,any>>={
 services:{slug:'',category:'battle-boarding',title:'',description:'',details:'',pricing_type:'fixed',price_label:'',base_price:null,unit_label:'',options:[],is_active:true,sort_order:0},
 testimonials:{service_slug:'',category:'battle-boarding',description:'',work_date:localDateValue(),image_paths:[],image_urls:[],is_published:true,sort_order:0},
 staff:{slug:'',name:'',summary:'',bio:'',whatsapp_number:'',photo_path:null,is_visible:true,is_detailed:true,sort_order:0},
 site_content:{key:'',value:''},
 respect_threads:{}};setJsonDrafts({});setEditing(data[adminTab])};
 const saveAdmin=async()=>{
  if(!editing||saving||cropBusy)return;
  const snapshot=editing;
  const tabSnapshot=adminTab;
  const parsedJson:Record<string,unknown>={};
  for(const [key,raw] of Object.entries(jsonDrafts)){
   try{parsedJson[key]=JSON.parse(raw)}
   catch{setNotice('Format JSON pada '+fieldLabel(key)+' belum valid. Perbaiki sebelum menyimpan.');return}
  }
  if(tabSnapshot==='testimonials'){
   if(!String(snapshot.service_slug||'').trim()){setNotice('Pilih jenis pekerjaan untuk testimoni ini.');return}
   if(!String(snapshot.description||'').trim()){setNotice('Isi deskripsi hasil pekerjaan terlebih dahulu.');return}
   if(!String(snapshot.work_date||'').trim()){setNotice('Tanggal pekerjaan harus diisi.');return}
   if(!Array.isArray(snapshot.image_urls)||snapshot.image_urls.length===0){setNotice('Tambahkan minimal satu foto sebelum menyimpan testimoni.');return}
   if(snapshot.image_urls.length>MAX_TESTIMONIAL_IMAGES){setNotice('Satu testimoni maksimal '+MAX_TESTIMONIAL_IMAGES+' foto. Hapus foto tambahan sebelum menyimpan.');return}
  }
  setSaving(true);
  setNotice('Menyimpan perubahan dan menunggu konfirmasi server…');
  try{
   const values={...snapshot,...parsedJson};delete values.id;delete values.created_at;delete values.updated_at;
   const response=snapshot.id||(tabSnapshot==='site_content'&&adminRows.some(row=>row.key===snapshot.key))
    ? await adminRequest<{data?:Record<string,any>}>(token,'update',{table:tabSnapshot,id:snapshot.id,values},'PATCH')
    : await adminRequest<{data?:Record<string,any>}>(token,'create',{table:tabSnapshot,values});
   if(!response?.data)throw new Error('Server belum mengonfirmasi bahwa perubahan tersimpan. Editor tetap dibuka agar data tidak hilang.');
   setEditing(null);
   setJsonDrafts({});
   const [,refreshed]=await Promise.all([fetchAdmin(tabSnapshot),refreshPublicContent(tabSnapshot)]);
   setNotice(refreshed?'Perubahan berhasil disimpan.':'Perubahan tersimpan, tetapi tampilan publik gagal disegarkan. Muat ulang halaman untuk melihatnya.');
  }catch(error){
   if(error instanceof AdminRequestError&&error.status===401){clearOwnerSession();return}
   setNotice(error instanceof Error?error.message:'Perubahan gagal disimpan.');
  }finally{setSaving(false)}
};
 const deleteAdmin=async(row:Record<string,any>)=>{
  if(saving||cropBusy||!window.confirm('Hapus konten ini? Tindakan ini tidak dapat dibatalkan.'))return;
  const tabSnapshot=adminTab;
  setSaving(true);
  setNotice('Menghapus konten dan menunggu konfirmasi server…');
  try{
   const response=await adminRequest<{ok?:boolean}>(token,'delete',{table:tabSnapshot,id:row.id},'DELETE');
   if(!response?.ok)throw new Error('Server belum mengonfirmasi penghapusan.');
   const [,refreshed]=await Promise.all([fetchAdmin(tabSnapshot),refreshPublicContent(tabSnapshot)]);
   setNotice(refreshed?'Konten berhasil dihapus.':'Konten dihapus, tetapi tampilan publik gagal disegarkan. Muat ulang halaman.');
  }catch(error){
   if(error instanceof AdminRequestError&&error.status===401){clearOwnerSession();return}
   setNotice(error instanceof Error?error.message:'Konten gagal dihapus.');
  }finally{setSaving(false)}
 };
 const updateField=(key:string,value:any)=>setEditing(current=>current?({...current,[key]:value}):current);
 const finishCrop=async(file:File)=>{
  if(!cropTarget)throw new Error('Tujuan upload foto tidak ditemukan.');
  if(cropTarget==='image_urls'&&(editing?.image_urls||[]).length>=MAX_TESTIMONIAL_IMAGES)throw new Error('Satu testimoni maksimal '+MAX_TESTIMONIAL_IMAGES+' foto. Hapus foto tambahan sebelum menambahkan yang baru.');
  setCropBusy(true);
  try{
   const uploaded=await uploadImage(file);
   if(cropTarget==='photo_path')updateField('photo_path',uploaded.url);
   else{
    updateField('image_urls',[...(editing?.image_urls||[]),uploaded.url]);
    updateField('image_paths',[...(editing?.image_paths||[]),uploaded.path]);
   }
   setCropFile(null);setCropTarget(null);
   setNotice(cropTarget==='photo_path'?'Foto Staff berhasil diunggah.':'Foto Testimoni berhasil ditambahkan.');
  }finally{setCropBusy(false)}
};
 const removeImage=(index:number)=>{if(!editing)return;updateField('image_urls',(editing.image_urls||[]).filter((_:string,i:number)=>i!==index));updateField('image_paths',(editing.image_paths||[]).filter((_:string,i:number)=>i!==index))};
 const respectThreadMatch=path.match(/^\/respect-thread(?:\/([^/]+))?$/);
 const respectThreadSlug=respectThreadMatch?.[1];
 const page=path==='/'?'home':path==='/layanan'?'services':path==='/testimoni'?'testimonials':path==='/staff'?'staff':path==='/flip-coin'?'flip-coin':respectThreadMatch?(respectThreadSlug?'respect-thread-detail':'respect-threads'):'not-found';
 const navigate=(to:string)=>{const next=to.replace(new RegExp('/+$'),'')||'/';if(next!==path){window.history.pushState({},'',next);setPath(next)}setMenuOpen(false);setModal(null);window.scrollTo({top:0,behavior:'smooth'})};
 useEffect(()=>{const onPop=()=>{setPath(window.location.pathname.replace(new RegExp('/+$'),'')||'/');setMenuOpen(false);setModal(null)};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);
 useEffect(()=>{const titles:Record<string,string>={'/':'Ivory Diary','/layanan':'Layanan — Ivory Diary','/testimoni':'Testimoni — Ivory Diary','/staff':'Staff — Ivory Diary','/flip-coin':'Flip Coin — Ivory Diary','/respect-thread':'Respect Thread — Ivory Diary'};document.title=titles[path]||(path.startsWith('/respect-thread/')?'Respect Thread — Ivory Diary':'Ivory Diary')},[path]);
 const scrollTo=(id:string)=>{setMenuOpen(false);document.getElementById(id)?.scrollIntoView({behavior:'smooth'})};
 const visibleTestimonials=testimonials.filter(item=>activeCategory==='all'||item.category===activeCategory);

 if(owner&&path==='/owner/crop')return <div className="crop-workspace">
  <header className="crop-workspace-header">
   <button className="crop-back-button" type="button" onClick={()=>{if(!cropBusy){setCropFile(null);setCropTarget(null);navigate('/owner')}}}><ArrowLeft size={17}/> Kembali ke editor</button>
   <img src="/logo.svg" alt="Ivory Diary"/>
   <span className="crop-workspace-tag">OWNER / IMAGE STUDIO</span>
  </header>
  <main className="crop-workspace-main">
   <div className="crop-workspace-intro">
    <span className="eyebrow">MEDIA WORKSPACE / 01</span>
    <h1>Atur <em>foto.</em></h1>
    <p>Pilih ukuran otomatis atau atur area potong sendiri. Foto baru diunggah setelah Anda menekan tombol gunakan hasil crop.</p>
   </div>
   {cropFile&&cropTarget?<ImageCropper
     file={cropFile}
     aspectRatio={cropTarget==='photo_path'?4/5:undefined}
     busy={cropBusy}
     onCancel={()=>{if(!cropBusy){setCropFile(null);setCropTarget(null);navigate('/owner')}}}
     onComplete={async file=>{await finishCrop(file);navigate('/owner')}}
   />:<section className="crop-expired-state">
     <p>File foto tidak tersedia. Silakan kembali ke editor dan pilih foto sekali lagi.</p>
     <button className="button primary" type="button" onClick={()=>navigate('/owner')}>Kembali ke editor</button>
    </section>}
  </main>
 </div>;

 if(owner&&path==='/owner')return <div className="admin-shell">
  <aside className="admin-side"><button className="brand brand-button" type="button" onClick={()=>navigate('/')} aria-label="Ivory Diary — Beranda"><img src="/logo.svg" alt="Ivory Diary"/></button><button className="owner-back-link" type="button" onClick={()=>navigate('/')}><ArrowLeft size={15}/> Kembali ke Beranda</button><p className="admin-caption">WORKSPACE</p>
   {([['services','Layanan'],['testimonials','Testimoni'],['staff','Staff'],['site_content','Konten Website'],['respect_threads','Respect Thread']] as [AdminTab,string][]).map(([tab,label])=><button key={tab} disabled={saving||cropBusy} className={adminTab===tab?'side-link active':'side-link'} onClick={()=>{setEditing(null);setJsonDrafts({});if(tab==='respect_threads'){adminFetchSequence.current++;setAdminTab(tab);setNotice('')}else void fetchAdmin(tab)}}>{label}</button>)}
   <button className="side-link" type="button" onClick={()=>navigate('/flip-coin')}>Flip Coin</button>
   <div className="side-bottom"><span>Masuk sebagai <b>{owner.display_name}</b></span><button className="side-link" onClick={logout}>Keluar</button></div>
  </aside>
  <main className="admin-main">{adminTab==='respect_threads'?<RespectThreadManager token={token} onNavigate={navigate}/>:<>
   <header className="admin-top"><div><span className="eyebrow">IVORY DIARY / OWNER</span><h1>{({services:'Layanan',testimonials:'Testimoni',staff:'Staff',site_content:'Konten Website',respect_threads:'Respect Thread'} as Record<AdminTab,string>)[adminTab]}</h1></div><button className="button primary small" disabled={saving||cropBusy} onClick={beginNew}><Plus size={16}/> Tambah</button></header>
   {notice&&<div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Tutup pesan"><X size={15}/></button></div>}
   {editing?<section className="edit-panel" aria-busy={saving||cropBusy}><div className="edit-heading"><h2>{editing.id?'Edit':'Tambah'} {adminTab==='site_content'?'konten':adminTab==='services'?'layanan':adminTab==='staff'?'staff':'testimoni'}</h2><button className="icon-button" type="button" aria-label="Tutup editor" disabled={saving||cropBusy} onClick={()=>{setEditing(null);setJsonDrafts({})}}><X/></button></div><fieldset className="edit-fields" disabled={saving||cropBusy}>
    {Object.entries(editing).filter(([key])=>!['id','created_at','updated_at','image_paths'].includes(key)&&!(adminTab==='testimonials'&&key==='category')).map(([key,value])=><div className="field" key={key}><label className="field-label" htmlFor={'owner-field-'+key}>{key==='service_slug'&&adminTab==='testimonials'?'Jenis pekerjaan':fieldLabel(key)}</label>
      {key==='photo_path'||key==='image_urls'?<>
       <input id={'owner-field-'+key} type="file" accept="image/jpeg,image/png,image/webp" disabled={saving||cropBusy||(key==='image_urls'&&adminTab==='testimonials'&&(editing.image_urls||[]).length>=MAX_TESTIMONIAL_IMAGES)} onChange={event=>{const file=event.target.files?.[0];if(file){if(key==='image_urls'&&adminTab==='testimonials'&&(editing.image_urls||[]).length>=MAX_TESTIMONIAL_IMAGES){setNotice('Satu testimoni maksimal '+MAX_TESTIMONIAL_IMAGES+' foto.');}else if(file.size>20*1024*1024){setNotice('Ukuran foto sumber maksimal 20 MB.');}else{setCropTarget(key as 'photo_path'|'image_urls');setCropFile(file);setNotice('');navigate('/owner/crop')}}event.target.value=''}}/>
       <small>{adminTab==='testimonials'&&key==='image_urls'?'JPG, PNG, atau WebP · Maksimal 20 MB sebelum crop · '+(editing.image_urls||[]).length+'/'+MAX_TESTIMONIAL_IMAGES+' foto.':'JPG, PNG, atau WebP · Maksimal 20 MB sebelum crop. Foto akan dipotong dan dioptimalkan sebelum diunggah.'}</small>
       {key==='photo_path'&&value&&<div className="image-preview-row"><img src={String(value)} alt="Pratinjau foto staf" onError={e=>{e.currentTarget.style.display="none"}}/><button type="button" className="row-actions-button" onClick={()=>updateField('photo_path',null)}>Hapus foto</button></div>}
       {key==='image_urls'&&Array.isArray(value)&&value.map((url:string,index:number)=><div className="image-preview-row" key={url+'-'+index}><img src={url} alt={'Pratinjau hasil '+(index+1)} onError={e=>{e.currentTarget.style.display='none'}}/><button type="button" className="row-actions-button" onClick={()=>removeImage(index)}>Hapus foto</button></div>)}
      </>:key==='service_slug'&&adminTab==='testimonials'?<select id={'owner-field-'+key} value={String(value??'')} onChange={e=>{const selected=services.find(service=>service.slug===e.target.value);updateField('service_slug',e.target.value);if(selected)updateField('category',selected.category)}}><option value="">Pilih jenis pekerjaan</option>{services.map(service=><option key={service.slug} value={service.slug}>{service.title}</option>)}</select>
      :key==='category'?<select id={'owner-field-'+key} value={String(value??'')} onChange={e=>updateField(key,e.target.value)}><option value="battle-boarding">Battle Boarding</option><option value="debat-konvensional">Debat Konvensional</option><option value="akademis">Kebutuhan Akademis</option></select>
      :key==='pricing_type'?<select id={'owner-field-'+key} value={String(value??'fixed')} onChange={e=>updateField(key,e.target.value)}><option value="fixed">Harga tetap</option><option value="tiered">Tier</option><option value="per_unit">Per unit</option><option value="range">Rentang harga</option></select>
      :typeof value==='boolean'?<input id={'owner-field-'+key} type="checkbox" checked={value} onChange={e=>updateField(key,e.target.checked)}/>
      :['base_price','sort_order'].includes(key)?<input id={'owner-field-'+key} type="number" min="0" value={value??''} onChange={e=>updateField(key,e.target.value===''?null:Number(e.target.value))}/>
      :key==='work_date'?<input id={'owner-field-'+key} type="date" value={String(value??'')} onChange={e=>updateField(key,e.target.value)}/>
      :Array.isArray(value)||(value!==null&&typeof value==='object')?<textarea id={'owner-field-'+key} rows={4} value={jsonDrafts[key]??JSON.stringify(value,null,2)} aria-invalid={Object.prototype.hasOwnProperty.call(jsonDrafts,key)&&(()=>{try{JSON.parse(jsonDrafts[key]);return false}catch{return true}})()} onChange={e=>setJsonDrafts(current=>({...current,[key]:e.target.value}))} onBlur={e=>{try{updateField(key,JSON.parse(e.currentTarget.value));setJsonDrafts(current=>{const next={...current};delete next[key];return next});setNotice('')}catch{setNotice('Format JSON pada '+fieldLabel(key)+' belum valid.')}}}/>
      :['bio','description','details','summary','value'].includes(key)?<textarea id={'owner-field-'+key} rows={5} value={String(value??'')} onChange={e=>updateField(key,e.target.value)}/>
      :<input id={'owner-field-'+key} value={String(value??'')} onChange={e=>updateField(key,e.target.value)}/>}
    </div>)}
     </fieldset>
     <div className="edit-actions"><button className="button secondary" disabled={saving||cropBusy} onClick={()=>{setEditing(null);setJsonDrafts({})}}>Batal</button><button className="button primary" disabled={saving||cropBusy} onClick={saveAdmin}>{saving?'Menyimpan…':'Simpan perubahan'}</button></div>
   </section>:<section className="admin-list">{adminRows.length===0?<div className="empty-state">Belum ada data untuk ditampilkan.</div>:adminRows.map((row,index)=><article className="admin-row" key={row.id||row.key||index}><div><b>{row.title||row.name||row.key||row.description||row.slug}</b><small>{row.category||row.slug||String(row.value||'').slice(0,80)}</small></div><div className="row-actions"><button disabled={saving||cropBusy} onClick={()=>{setJsonDrafts({});setEditing({...row})}}><Pencil size={13}/> Edit</button>{adminTab!=='site_content'&&<button className="danger-text" disabled={saving||cropBusy} onClick={()=>void deleteAdmin(row)}><Trash2 size={13}/> Hapus</button>}</div></article>)}</section>}
   <p className="admin-helper">Perubahan tersimpan ke database dan akan tampil pada halaman publik setelah pembaruan berhasil dimuat.</p>
  </>}</main>
 </div>;

 return <div id="top" className="site-shell">
  <header className="navbar"><button className="brand brand-button" type="button" onClick={()=>navigate('/')} aria-label="Ivory Diary — Beranda"><img src="/logo.svg" alt="Ivory Diary"/></button>
   <nav className={menuOpen?'nav-links open':'nav-links'} aria-label="Navigasi utama">{[['/','Beranda'],['/layanan','Layanan'],['/testimoni','Testimoni'],['/staff','Staff'],['/respect-thread','Respect Thread'],['/flip-coin','Flip Coin']].map(([href,label])=><button key={href} className={path===href||(href==='/respect-thread'&&path.startsWith('/respect-thread/'))?'nav-item active':'nav-item'} onClick={()=>navigate(href)} aria-current={path===href?'page':undefined}>{label}</button>)}</nav>
   <div className="nav-actions"><IconButton label="Ganti tema" onClick={toggleTheme}>{theme==='light'?<Moon size={17}/>:<Sun size={17}/>}</IconButton><button className="button primary nav-cta" onClick={()=>navigate('/layanan')}>Order sekarang <ArrowUpRight size={15}/></button><button className="icon-button mobile-menu" type="button" aria-label="Menu" onClick={()=>setMenuOpen(!menuOpen)}><Menu size={18}/></button></div>
  </header>
  <main>
   {loadError&&<div className="load-note">Sebagian konten belum dapat dimuat. Informasi dasar tetap tersedia; periksa konfigurasi Supabase bila masalah berlanjut.</div>}
{page==='home' && (   <section className="hero section-wrap"><div className="hero-copy"><p className="eyebrow">{siteCopy.hero_eyebrow||'COMMUNITY · ANALYSIS · ACADEMIC'}</p><h1>{siteCopy.hero_title||'Ivory Diary'}<span className="hero-period">.</span></h1><p className="hero-desc">{siteCopy.hero_description||'Ivory Diary adalah sebuah komunitas yang menyediakan layanan kebutuhan Battle Boarding, Debat Konvensional, dan Kebutuhan Akademis.'}</p><div className="hero-actions"><button className="button primary" onClick={()=>navigate('/layanan')}>Jelajahi layanan <ArrowUpRight size={16}/></button><button className="text-link" onClick={()=>navigate('/testimoni')}>Lihat hasil pekerjaan <ArrowRight size={16}/></button></div><div className="hero-foot"><span>01 / 04</span><span className="hero-line"/><span>THOUGHTFULLY CONSIDERED</span></div></div>
    <div className="hero-art" aria-hidden="true"><div className="art-frame"><div className="art-letter">I<span>D</span></div><div className="art-rule"/><span className="art-small">A PLACE FOR<br/>BETTER THINKING</span><span className="art-index">EST. MMXXIV</span></div><div className="art-side-label">IVORY DIARY — INDEPENDENT COMMUNITY</div></div><div className="hero-index">01 <span>—</span> 04</div>
   </section>)}
{page==='home' && (   <section className="intro section-wrap"><div className="section-marker"><span className="section-marker-number">01</span><span className="section-marker-title">WHO WE ARE</span></div><div className="intro-content"><h2>Thoughtful work.<br/><em>Clear perspective.</em></h2><div><p>{siteCopy.about_description||'Kami percaya pekerjaan yang baik lahir dari ketelitian, pemahaman, dan komunikasi yang jernih. Setiap kebutuhan ditangani dengan memperhatikan kualitas, waktu, dan privasi.'}</p><button className="text-link" onClick={()=>navigate('/staff')}>Kenali tim kami <ArrowUpRight size={16}/></button></div></div></section>)}

{page==='services' && (   <section id="services" className="services section-wrap"><div className="section-heading"><div><div className="section-marker"><span className="section-marker-number">02</span><span className="section-marker-title">WHAT WE DO</span></div><h2>Ruang lingkup<br/><em>layanan.</em></h2></div><p>Temukan layanan yang sesuai dengan kebutuhan. Detail kompleks dapat dibicarakan langsung melalui staf Ivory Diary.</p></div>
    {groups.map((group,index)=><div className="service-group" key={group.key}><div className="group-heading"><span>0{index+1}</span><h3>{group.label}</h3><span className="group-count">{String(group.items.length).padStart(2,'0')} SERVICES</span></div><div className="service-grid">{group.items.map(service=><article className="service-card" key={service.id}><div className="service-card-top"><span>{service.slug.toUpperCase()}</span><ArrowUpRight size={16}/></div><h4>{service.title}</h4><p>{service.description}</p><div className="service-card-bottom"><b>{service.price_label}</b><button onClick={()=>openOrder(service)}>Lihat & order <ArrowRight size={15}/></button></div></article>)}</div></div>)}
   </section>)}
{page==='home' && (<>
<section className="home-categories section-wrap">
    <div className="section-heading"><div><div className="section-marker"><span className="section-marker-number">02</span><span className="section-marker-title">WHAT WE DO</span></div><h2>Ruang lingkup<br/><em>layanan.</em></h2></div><p>Temukan layanan yang sesuai kebutuhan, mulai dari Battle Boarding hingga kebutuhan akademis.</p></div>
    <div className="home-category-list">{groups.map((group,index)=><button className="home-category-row" type="button" key={group.key} onClick={()=>navigate('/layanan')}><span className="category-no">0{index+1}</span><span className="category-copy"><b>{group.label}</b><small>{group.items.length} layanan tersedia</small></span><ArrowUpRight size={20}/></button>)}</div>
    <div className="home-services-link"><span>Ingin melihat harga dan detail setiap layanan?</span><button className="text-link" onClick={()=>navigate('/layanan')}>Lihat semua layanan <ArrowRight size={15}/></button></div>
   </section>
<section className="quote-band"><div className="section-wrap quote-inner"><span>THE IVORY PRINCIPLE</span><p>“Kepuasan konsumen, berpacu pada <em>kualitas, waktu pengerjaan,</em> dan privasi.”</p><span>IVORY DIARY / {new Date().getFullYear()}</span></div></section>
</>)}
{page==='testimonials' && (   <section id="testimonials" className="testimonials section-wrap"><div className="section-heading"><div><div className="section-marker"><span className="section-marker-number">03</span><span className="section-marker-title">SELECTED WORKS</span></div><h2>Hasil yang<br/><em>berbicara.</em></h2></div><p>Dokumentasi hasil pekerjaan Ivory Diary. Setiap karya ditampilkan berdasarkan kategori layanan.</p></div>
    <div className="tabs">{[['all','Semua'],...Object.entries(categoryLabels)].map(([key,label])=><button key={key} className={activeCategory===key?'active':''} onClick={()=>setActiveCategory(key)}>{label}</button>)}</div>
    <label className="mobile-filter"><span>Filter kategori</span><select value={activeCategory} onChange={e=>setActiveCategory(e.target.value)}><option value="all">Semua kategori</option>{Object.entries(categoryLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {visibleTestimonials.length===0?<div className="empty-state">Belum ada hasil yang ditampilkan.</div>:<div className="work-grid">{visibleTestimonials.map(item=><button className="work-card" key={item.id} onClick={()=>{setSelectedTestimonial(item);setGalleryIndex(0);setModal('gallery')}}><div className="work-image">{item.image_urls?.[0]?<><img src={item.image_urls[0]} alt="Dokumentasi hasil pekerjaan" onError={e=>{e.currentTarget.classList.add('image-broken');const fallback=e.currentTarget.nextElementSibling as HTMLElement|null;if(fallback)fallback.style.display='grid'}}/><div className="image-fallback" style={{display:'none'}}>IVORY<br/>DIARY</div></>:<div className="image-fallback">IVORY<br/>DIARY</div>}<span><ArrowUpRight size={18}/></span></div><div className="work-meta"><span>{categoryLabels[item.category]||item.category}</span><time>{dateLabel(item.work_date)}</time></div><p>{item.description}</p></button>)}</div>}
   </section>)}
{page==='staff' && (   <section id="staff" className="staff-section"><div className="section-wrap"><div className="section-heading"><div><div className="section-marker"><span className="section-marker-number">04</span><span className="section-marker-title">THE PEOPLE</span></div><h2>Behind the<br/><em>perspective.</em></h2></div><p>Orang-orang di balik Ivory Diary. Setiap staf membawa sudut pandang dan pengalaman yang berbeda.</p></div><div className="staff-grid">{staff.map((person,index)=><article className="staff-card" key={person.id}><div className="staff-photo"><div className="staff-photo-frame"><Portrait src={person.photo_path} name={person.name}/></div><span className="staff-photo-index">0{index+1}</span></div><div className="staff-meta"><div className="staff-meta-copy"><h3>{person.name}</h3><p>{person.summary}</p></div><button className="round-arrow" type="button" aria-label={'Selengkapnya tentang '+person.name} onClick={()=>{setSelectedStaff(person);setModal('staff')}}><ArrowUpRight size={19}/></button></div></article>)}</div><p className="staff-note">Ivory Diary juga didukung oleh beberapa worker yang tidak dapat dipublikasikan, dengan kapasitas analisis dan pemahaman yang sebanding.</p></div></section>)}
{page==='home' && (   <section className="closing section-wrap"><div className="section-marker"><span className="section-marker-number">05</span><span className="section-marker-title">LET'S BEGIN</span></div><div className="closing-content"><h2>A conversation<br/><em>starts here.</em></h2><button className="button primary" onClick={()=>services[0]&&openOrder(services[0])}>Mulai konsultasi <ArrowUpRight size={16}/></button></div><p className="payment-note">{siteCopy.order_note||'Pembayaran menggunakan QRIS dan proses pembayaran akan dikonfirmasi lebih lanjut melalui Staff Ivory Diary melalui WhatsApp.'}</p></section>)}

   {(page==='respect-threads'||page==='respect-thread-detail')&&<RespectThreads slug={respectThreadSlug} onNavigate={navigate}/>}
   {page==='flip-coin'&&<FlipCoin onNavigate={navigate} isOwner={Boolean(owner)}/>}
   {page==='not-found' && <section className="not-found section-wrap"><span className="eyebrow">404 / PAGE NOT FOUND</span><h1>Halaman tidak<br/><em>ditemukan.</em></h1><p>Alamat yang Anda buka tidak tersedia.</p><button className="button primary" onClick={()=>navigate('/')}>Kembali ke beranda <ArrowRight size={15}/></button></section>}
  </main>
  <footer className="footer"><div className="section-wrap footer-inner"><img src="/logo.svg" alt="Ivory Diary"/><div className="footer-links"><button onClick={()=>navigate('/')}>Beranda</button><button onClick={()=>navigate('/layanan')}>Layanan</button><button onClick={()=>navigate('/testimoni')}>Testimoni</button><button onClick={()=>navigate('/staff')}>Staff</button><button onClick={()=>navigate('/respect-thread')}>Respect Thread</button><button onClick={()=>navigate('/flip-coin')}>Flip Coin</button></div><div className="footer-contact"><span className="footer-contact-label">WHATSAPP STAFF</span><a href="https://wa.me/6282228671206" target="_blank" rel="noreferrer">Gabriel · 0822 2867 1206</a><a href="https://wa.me/6285761300772" target="_blank" rel="noreferrer">Maru · 0857 6130 0772</a><a href="https://wa.me/6285886744562" target="_blank" rel="noreferrer">Albirru · 0858 8674 4562</a><a className="footer-channel-link" href="https://whatsapp.com/channel/0029VaefbkN6GcGJbtzmST1j" target="_blank" rel="noreferrer">Saluran Ivory Diary <ArrowUpRight size={13}/></a></div><span className="copyright">© {new Date().getFullYear()} IVORY DIARY. ALL RIGHTS RESERVED.</span><button className="owner-link" onClick={()=>{if(owner)navigate('/owner');else{setLoginError('');setModal('login')}}}>{owner?'Dashboard Owner':'Owner access'}</button></div></footer>

  {modal==='order'&&selectedService&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal order-modal"><div className="modal-top"><span className="eyebrow">ORDER / {selectedService.slug.toUpperCase()}</span><IconButton label="Tutup" onClick={()=>setModal(null)}><X/></IconButton></div><h2>{selectedService.title}</h2><p className="modal-description">{selectedService.details||selectedService.description}</p>
   {selectedService.options?.length>0&&<div className="field-block"><label>Pilih opsi harga</label><div className="tier-options">{selectedService.options.map(option=><button type="button" key={option.label} className={tier===option.label?'tier-option selected':'tier-option'} onClick={()=>setTier(option.label)}><span>{option.label}</span><b>{money(option.price)}</b>{tier===option.label&&<Check size={16}/>}</button>)}</div></div>}
   {selectedService.pricing_type==='per_unit'&&<div className="field-block"><label>Jumlah {selectedService.unit_label}</label><div className="quantity-control"><button type="button" onClick={()=>setQuantity(Math.max(1,quantity-1))} aria-label="Kurangi"><ChevronLeft/></button><b>{quantity}</b><button type="button" onClick={()=>setQuantity(Math.min(500,quantity+1))} aria-label="Tambah"><ChevronRight/></button></div></div>}
   <div className="estimate"><span>Estimasi harga</span><b>{estimate!==null?money(estimate):selectedService.price_label}</b></div><div className="field-block"><label>Pilih staf yang ingin dihubungi</label><div className="staff-choice">{staff.filter(x=>x.whatsapp_number).map(person=><button type="button" className={selectedStaff?.id===person.id?'staff-choice-card selected':'staff-choice-card'} key={person.id} onClick={()=>setSelectedStaff(person)}><span className="choice-avatar">{person.name[0]}</span><span><b>{person.name}</b><small>{person.whatsapp_number}</small><em>{person.summary}</em></span>{selectedStaff?.id===person.id&&<Check size={17}/>}</button>)}</div></div><a className="whatsapp-channel-link" href="https://whatsapp.com/channel/0029VaefbkN6GcGJbtzmST1j" target="_blank" rel="noreferrer"><span>Ikuti kabar dan informasi terbaru</span><b>Saluran Ivory Diary</b><ArrowUpRight size={15}/></a>
   <p className="modal-footnote">Pembayaran menggunakan QRIS dan akan dikonfirmasi lebih lanjut melalui staf di WhatsApp.</p><button className="button primary full" disabled={!selectedStaff} onClick={orderNow}>Lanjutkan ke WhatsApp <ArrowUpRight size={16}/></button>
  </section></div>}

  {modal==='staff'&&selectedStaff&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal staff-modal"><div className="modal-top"><span className="eyebrow">THE PEOPLE / PROFILE</span><IconButton label="Tutup" onClick={()=>setModal(null)}><X/></IconButton></div><div className="staff-detail-image"><div className="staff-detail-image-frame"><Portrait src={selectedStaff.photo_path} name={selectedStaff.name} large/></div></div><div className="staff-profile-copy"><h2>{selectedStaff.name}</h2><p>{selectedStaff.bio}</p></div><button className="button primary full" onClick={()=>services[0]&&openOrder(services[0],selectedStaff)}>Hubungi {selectedStaff.name} <ArrowUpRight size={16}/></button></section></div>}

  {modal==='gallery'&&selectedTestimonial&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><section className="modal gallery-modal"><div className="modal-top"><span className="eyebrow">{categoryLabels[selectedTestimonial.category]}</span><IconButton label="Tutup" onClick={()=>setModal(null)}><X/></IconButton></div>
   <div className="gallery-image" onTouchStart={e=>setTouchStart(e.touches[0]?.clientX??null)} onTouchEnd={e=>{if(touchStart===null)return;const delta=e.changedTouches[0].clientX-touchStart;if(Math.abs(delta)>45&&selectedTestimonial.image_urls?.length)setGalleryIndex(i=>(i+(delta<0?1:-1)+selectedTestimonial.image_urls.length)%selectedTestimonial.image_urls.length);setTouchStart(null)}}>{selectedTestimonial.image_urls?.length?<><img src={selectedTestimonial.image_urls[galleryIndex]} alt="Hasil pekerjaan" onError={e=>{e.currentTarget.classList.add("image-broken");const fallback=e.currentTarget.nextElementSibling as HTMLElement|null;if(fallback)fallback.style.display="grid"}}/><div className="image-fallback gallery-fallback" style={{display:"none"}}>IVORY DIARY</div></>:<div className="image-fallback">IVORY DIARY</div>}
    {selectedTestimonial.image_urls?.length>1&&<><button className="gallery-prev" aria-label="Foto sebelumnya" onClick={()=>setGalleryIndex((galleryIndex-1+selectedTestimonial.image_urls.length)%selectedTestimonial.image_urls.length)}><ChevronLeft/></button><button className="gallery-next" aria-label="Foto berikutnya" onClick={()=>setGalleryIndex((galleryIndex+1)%selectedTestimonial.image_urls.length)}><ChevronRight/></button></>}
   </div><time>{dateLabel(selectedTestimonial.work_date)}</time><p>{selectedTestimonial.description}</p>
  </section></div>}

  {modal==='login'&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal(null)}><form className="modal login-modal" onSubmit={login}><div className="modal-top"><span className="eyebrow">PRIVATE AREA / OWNER</span><IconButton label="Tutup" onClick={()=>setModal(null)}><X/></IconButton></div><h2>Welcome back.</h2><p className="modal-description">Masuk untuk mengelola konten Ivory Diary.</p><label className="field"><span>Username</span><input autoComplete="username" value={loginName} onChange={e=>setLoginName(e.target.value)} required/></label><label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required/></label>{loginError&&<p className="error-text">{loginError}</p>}<button className="button primary full" disabled={loginBusy}>{loginBusy?'Memverifikasi…':'Masuk ke dashboard'} <ArrowUpRight size={16}/></button></form></div>}
 </div>;
}
export default App;
