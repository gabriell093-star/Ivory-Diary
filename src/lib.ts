import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const PUBLIC_SUPABASE_KEY = key || '';
export const supabase = url && key ? createClient(url, key) : null;
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_FUNCTION_URL as string | undefined) || `${url}/functions/v1/ivory-admin`;
export const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
export const categoryLabels: Record<string,string> = {'battle-boarding':'Battle Boarding','debat-konvensional':'Debat Konvensional','akademis':'Kebutuhan Akademis'};
export type Service = {id:string;slug:string;category:string;title:string;description:string;details:string;pricing_type:string;price_label:string;base_price:number|null;unit_label:string|null;options:{label:string;price:number}[];is_active:boolean;sort_order:number};
export type Staff = {id:string;slug:string;name:string;summary:string;bio:string;whatsapp_number:string|null;photo_path:string|null;is_visible:boolean;is_detailed:boolean;sort_order:number};
export type Testimonial = {id:string;service_slug:string;category:string;description:string;work_date:string;image_paths:string[];image_urls:string[];is_published:boolean;sort_order:number};
export class AdminRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminRequestError';
    this.status = status;
  }
}

export async function adminRequest<T=any>(token:string, action:string, payload:Record<string,unknown>={}, method='POST'):Promise<T>{
  const [actionName, query=''] = action.split('&', 2);
  const response = await fetch(`${ADMIN_URL}?action=${encodeURIComponent(actionName)}${query ? `&${query}` : ''}`, {method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...(PUBLIC_SUPABASE_KEY?{'apikey':PUBLIC_SUPABASE_KEY}:{})},body:method==='GET'?undefined:JSON.stringify(payload)});
  const result = await response.json().catch(()=>({error:'Respons server tidak valid.'}));
  if(!response.ok) throw new AdminRequestError(result.error || 'Permintaan gagal.', response.status);
  return result as T;
}
