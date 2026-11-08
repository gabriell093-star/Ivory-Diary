import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const allowedOrigins = new Set([
  "https://iivory-diary.vercel.app",
  "https://iivory-diary-nffachys-projects.vercel.app",
  "https://iivory-diary-git-main-nffachys-projects.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const isAllowedOrigin = (origin: string): boolean => {
  if (allowedOrigins.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" &&
      /^iivory-diary-[a-z0-9-]+-nffachys-projects\.vercel\.app$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};
const corsHeaders = (origin: string | null): Record<string, string> => ({
  ...(origin && isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
});
const json = (body: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
});
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const allowedTables = new Set(["services", "staff", "testimonials", "site_content", "respect_threads"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);


class RequestBodyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestBodyError";
    this.status = status;
  }
}

async function readJsonBody(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError("Ukuran permintaan terlalu besar.", 413);
  }
  if (!req.body) return {};

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("Ukuran permintaan terlalu besar.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestBodyError("Format permintaan tidak valid.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestBodyError("Isi permintaan harus berupa objek JSON.", 400);
  }
  return parsed as Record<string, unknown>;
}

async function readBoundedFormData(req: Request, maxBytes: number): Promise<FormData> {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError("Ukuran permintaan terlalu besar.", 413);
  }
  if (!req.body) throw new RequestBodyError("Isi upload tidak ditemukan.", 400);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("Ukuran permintaan terlalu besar.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Request(req.url, { method: req.method, headers: req.headers, body: bytes }).formData();
  } catch {
    throw new RequestBodyError("Format form upload tidak valid.", 400);
  }
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


function safeStoragePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 500) return null;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some(part => part === "" || part === "." || part === "..")) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return null;
  return value;
}

function storagePathFromPublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    const projectOrigin = new URL(supabaseUrl).origin;
    const prefix = "/storage/v1/object/public/ivory-public/";
    if (parsed.origin !== projectOrigin || !parsed.pathname.startsWith(prefix)) return null;
    return safeStoragePath(decodeURIComponent(parsed.pathname.slice(prefix.length)));
  } catch {
    return null;
  }
}

async function removeIvoryMedia(paths: unknown[]) {
  const unique = [...new Set(paths.map(safeStoragePath).filter((value): value is string => Boolean(value)))];
  if (!unique.length) return;
  const { error } = await db.storage.from("ivory-public").remove(unique);
  if (error) console.error("Ivory media cleanup failed:", error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const respectSectionKeys = ["introduction", "terminology", "cosmology", "personality", "statistic", "hax_ability", "resistance"] as const;
const respectImageLimits: Record<string, number> = {
  introduction: 1,
  terminology: 0,
  cosmology: 0,
  personality: 0,
  statistic: 10,
  hax_ability: 10,
  resistance: 10,
};
const respectSectionWordLimits: Record<string, number> = {
  introduction: 2000,
  terminology: 15000,
  cosmology: 15000,
  personality: 15000,
  statistic: 15000,
  hax_ability: 15000,
  resistance: 15000,
};

const respectLinkPattern = /(?:\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>()]*)?)/iu;

function containsRespectLink(value: string): boolean {
  return respectLinkPattern.test(value);
}

function isValidHttpReference(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function respectDescriptionWordCount(description: string): number {
  const trimmed = description.trim();
  return trimmed ? (trimmed.match(/\S+/g) || []).length : 0;
}

function respectThreadImagePaths(sections: unknown): string[] {
  if (!isRecord(sections)) return [];
  const paths: string[] = [];
  for (const key of respectSectionKeys) {
    const section = sections[key];
    if (!isRecord(section) || !Array.isArray(section.images)) continue;
    for (const image of section.images) {
      if (isRecord(image)) {
        const path = safeStoragePath(image.path);
        if (path) paths.push(path);
      }
    }
  }
  return [...new Set(paths)];
}

function validateRespectSections(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw) || Object.keys(raw).length !== respectSectionKeys.length ||
      respectSectionKeys.some(key => !Object.prototype.hasOwnProperty.call(raw, key))) {
    throw new RequestBodyError("Struktur tujuh bagian Respect Thread tidak lengkap.", 400);
  }

  let threadImageCount = 0;
  for (const key of respectSectionKeys) {
    const section = raw[key];
    if (!isRecord(section)) throw new RequestBodyError("Bagian " + key + " tidak valid.", 400);
    const allowedKeys = key === "introduction"
      ? ["description", "images"]
      : ["description", "link", "links", "images"];
    if (Object.keys(section).some(field => !allowedKeys.includes(field))) {
      throw new RequestBodyError("Ada kolom yang tidak diizinkan pada bagian " + key + ".", 400);
    }

    const description = section.description;
    if (typeof description !== "string" || description.length > 500000) {
      throw new RequestBodyError("Deskripsi pada bagian " + key + " tidak valid.", 400);
    }
    if (containsRespectLink(description)) {
      throw new RequestBodyError("Deskripsi bagian " + key + " tidak boleh mengandung URL atau tautan. Pindahkan ke bagian Link & teks referensi.", 400);
    }
    if (respectDescriptionWordCount(description) > respectSectionWordLimits[key]) {
      throw new RequestBodyError("Deskripsi bagian " + key + " maksimal " + respectSectionWordLimits[key].toLocaleString("id-ID") + " kata.", 400);
    }
    const hasDescription = description.trim().length > 0;

    const links: unknown[] = [];
    if (key !== "introduction") {
      if (section.links !== undefined) {
        if (!Array.isArray(section.links)) {
          throw new RequestBodyError("Daftar link pada bagian " + key + " tidak valid.", 400);
        }
        links.push(...section.links);
      }
      // Backward compatibility: older Respect Threads stored one legacy link string.
      if (section.link !== undefined && section.link !== null && section.link !== "") {
        if (typeof section.link !== "string") {
          throw new RequestBodyError("Link pada bagian " + key + " tidak valid.", 400);
        }
        if (!Array.isArray(section.links)) links.push(section.link);
      }
    }

    const nonEmptyLinks: string[] = [];
    let plainTextWords = 0;
    for (const candidate of links) {
      if (typeof candidate !== "string" || candidate.length > 10000) {
        throw new RequestBodyError("Referensi pada bagian " + key + " tidak valid.", 400);
      }
      const link = candidate.trim();
      if (!link) continue;
      if (isValidHttpReference(link)) {
        // A URL must be a standalone item, separate from any explanatory text.
      } else if (/^https?:\/\//i.test(link) || containsRespectLink(link)) {
        throw new RequestBodyError("Referensi pada bagian " + key + " harus berupa satu URL HTTP/HTTPS yang valid per item, atau teks biasa tanpa URL.", 400);
      } else {
        // Non-URL content is allowed as plain reference text.
        plainTextWords += respectDescriptionWordCount(link);
      }
      nonEmptyLinks.push(link);
    }
    if (plainTextWords > 100) {
      throw new RequestBodyError("Teks biasa pada referensi bagian " + key + " maksimal 100 kata total.", 400);
    }

    const images = section.images;
    if (!Array.isArray(images) || images.length > respectImageLimits[key]) {
      throw new RequestBodyError("Jumlah foto pada bagian " + key + " melebihi batas.", 400);
    }
    threadImageCount += images.length;
    for (const image of images) {
      if (!isRecord(image) || Object.keys(image).some(field => field !== "path" && field !== "url") ||
          typeof image.path !== "string" || typeof image.url !== "string") {
        throw new RequestBodyError("Data foto pada bagian " + key + " tidak valid.", 400);
      }
      const path = safeStoragePath(image.path);
      if (!path || !path.startsWith("respect-threads/") || storagePathFromPublicUrl(image.url) !== path) {
        throw new RequestBodyError("Alamat foto Respect Thread tidak valid.", 400);
      }
    }

    // Link and photos may be staged while editing; the final save requires a description.
    if (!hasDescription && (nonEmptyLinks.length > 0 || images.length > 0)) {
      throw new RequestBodyError("Isi deskripsi pada bagian " + key + " sebelum menyimpan link atau foto.", 400);
    }
  }
  if (threadImageCount > 10) {
    throw new RequestBodyError("Satu Respect Thread maksimal 10 foto secara keseluruhan.", 400);
  }

  return raw;
}

const fieldRules: Record<string, Record<string, (value: unknown) => boolean>> = {
  services: {
    slug: v => typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 100,
    category: v => ["battle-boarding", "debat-konvensional", "akademis"].includes(String(v)),
    title: v => typeof v === "string" && v.trim().length > 0 && v.length <= 160,
    description: v => typeof v === "string" && v.length <= 1200,
    details: v => typeof v === "string" && v.length <= 4000,
    pricing_type: v => ["fixed", "tiered", "per_unit", "range"].includes(String(v)),
    price_label: v => typeof v === "string" && v.length <= 120,
    base_price: v => v === null || (typeof v === "number" && Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000000),
    unit_label: v => v === null || (typeof v === "string" && v.length <= 40),
    options: v => Array.isArray(v) && v.length <= 30 && v.every(item =>
      isRecord(item) &&
      Object.keys(item).every(key => key === "label" || key === "price") &&
      typeof item.label === "string" && item.label.trim().length > 0 && item.label.length <= 80 &&
      typeof item.price === "number" && Number.isSafeInteger(item.price) && Number(item.price) >= 0 && Number(item.price) <= 1000000000
    ),
    is_active: v => typeof v === "boolean",
    sort_order: v => typeof v === "number" && Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000,
  },
  staff: {
    slug: v => typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 100,
    name: v => typeof v === "string" && v.trim().length > 0 && v.length <= 100,
    summary: v => typeof v === "string" && v.length <= 500,
    bio: v => typeof v === "string" && v.length <= 6000,
    whatsapp_number: v => v === null || (typeof v === "string" && /^[0-9+() .-]{7,30}$/.test(v)),
    photo_path: v => v === null || storagePathFromPublicUrl(v) !== null,
    is_visible: v => typeof v === "boolean",
    is_detailed: v => typeof v === "boolean",
    sort_order: v => typeof v === "number" && Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000,
  },
  testimonials: {
    service_slug: v => typeof v === "string" && v.length <= 120,
    category: v => ["battle-boarding", "debat-konvensional", "akademis"].includes(String(v)),
    description: v => typeof v === "string" && v.length <= 4000,
    work_date: v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")),
    image_paths: v => Array.isArray(v) && v.length <= 20 && v.every(path => safeStoragePath(path) !== null),
    image_urls: v => Array.isArray(v) && v.length <= 20 && v.every(url => storagePathFromPublicUrl(url) !== null),
    is_published: v => typeof v === "boolean",
    sort_order: v => typeof v === "number" && Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000,
  },
  site_content: {
    key: v => typeof v === "string" && /^[a-z0-9_-]{1,80}$/.test(v),
    value: v => typeof v === "string" && v.length <= 6000,
  },
  respect_threads: {
    slug: v => typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 180,
    title: v => typeof v === "string" && v.trim().length > 0 && v.length <= 180,
    character_name: v => typeof v === "string" && v.length <= 160,
    universe: v => typeof v === "string" && v.length <= 160,
    sections: v => {
      try { validateRespectSections(v); return true; } catch { return false; }
    },
    is_published: v => typeof v === "boolean",
  },
};

function validateValues(table: string, raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) throw new RequestBodyError("Data yang dikirim tidak valid.", 400);
  const rules = fieldRules[table];
  if (!rules) throw new RequestBodyError("Modul tidak dikenal.", 400);
  const keys = Object.keys(raw);
  if (!keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(rules, key))) {
    throw new RequestBodyError("Ada kolom yang tidak diizinkan atau data kosong.", 400);
  }
  for (const key of keys) {
    if (!rules[key](raw[key])) {
      throw new RequestBodyError("Format atau ukuran kolom " + key + " tidak valid.", 400);
    }
  }
  if (table === "respect_threads") {
    validateRespectSections(raw.sections);
  }
  if (table === "testimonials") {
    const hasPaths = Object.prototype.hasOwnProperty.call(raw, "image_paths");
    const hasUrls = Object.prototype.hasOwnProperty.call(raw, "image_urls");
    if (hasPaths !== hasUrls) {
      throw new RequestBodyError("Daftar foto testimoni harus dikirim secara berpasangan.", 400);
    }
    const paths = raw.image_paths;
    const urls = raw.image_urls;
    if (Array.isArray(paths) && Array.isArray(urls)) {
      if (paths.length !== urls.length) throw new RequestBodyError("Daftar foto testimoni tidak sinkron.", 400);
      for (let i = 0; i < paths.length; i++) {
        if (safeStoragePath(paths[i]) !== storagePathFromPublicUrl(urls[i])) {
          throw new RequestBodyError("Pasangan alamat foto testimoni tidak cocok.", 400);
        }
      }
    }
  }
  return raw;
}

function validRowId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const respond = (body: unknown, status = 200) => json(body, status, origin);
  if (origin && !isAllowedOrigin(origin)) {
    return new Response("Origin tidak diizinkan.", {
      status: 403,
      headers: { "Vary": "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get("action");
    let body: Record<string, unknown> = {};
    if (req.method !== "GET" && queryAction !== "upload") {
      try {
        body = await readJsonBody(req, 4_000_000);
      } catch (error) {
        if (error instanceof RequestBodyError) return respond({ error: error.message }, error.status);
        return respond({ error: "Format permintaan tidak valid." }, 400);
      }
    }
    const action = queryAction || body.action;
    const expectedMethod: Record<string, string> = {
      login: "POST", me: "GET", logout: "POST", "change-password": "POST",
      upload: "POST", "cleanup-media": "POST", list: "GET", create: "POST", update: "PATCH", delete: "DELETE",
    };
    if (typeof action !== "string" || expectedMethod[action] !== req.method) {
      return respond({ error: "Aksi atau metode permintaan tidak diizinkan." }, 405);
    }

    if (action === "login" && req.method === "POST") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!username || !password || username.length > 40 || password.length > 200) {
        return respond({ error: "Username atau password tidak valid." }, 400);
      }
      // Use only the edge-populated client IP header for rate limiting.
      const ipAddress = req.headers.get("cf-connecting-ip") || "unknown";
      const ipHash = await sha256(ipAddress.split(",")[0].trim());
      const { data: allowed, error: rateLimitError } = await db.rpc("consume_owner_login_attempt", {
        p_username: username,
        p_ip_hash: ipHash,
      });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return respond({ error: "Terlalu banyak percobaan. Coba lagi 15 menit." }, 429);

      const { data: owners, error: verifyError } = await db.rpc("verify_owner_login", {
        p_username: username,
        p_password: password,
      });
      if (verifyError) throw verifyError;
      const owner = owners?.[0];
      if (!owner) return respond({ error: "Username atau password salah." }, 401);

      const token = crypto.randomUUID() + "." + crypto.randomUUID();
      const tokenHash = await sha256(token);
      const { error } = await db.from("owner_sessions").insert({
        owner_id: owner.owner_id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return respond({ token, owner: { username: owner.username, display_name: owner.display_name } });
    }

    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return respond({ error: "Sesi Owner diperlukan." }, 401);

    const tokenHash = await sha256(token);
    const { data: sessions, error: sessionError } = await db.from("owner_sessions")
      .select("id, owner_id, expires_at, owner_accounts!inner(username, display_name, is_active)")
      .eq("token_hash", tokenHash)
      .eq("owner_accounts.is_active", true)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1);
    if (sessionError) throw sessionError;
    const session = sessions?.[0];
    if (!session) return respond({ error: "Sesi berakhir. Silakan login kembali." }, 401);

    if (action === "me" && req.method === "GET") {
      return respond({ owner: session.owner_accounts });
    }

    if (action === "logout" && req.method === "POST") {
      const { error } = await db.from("owner_sessions")
        .update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
      if (error) throw error;
      return respond({ ok: true });
    }

    if (action === "change-password" && req.method === "POST") {
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      if (currentPassword.length > 200 || newPassword.length < 12 || newPassword.length > 200) {
        return respond({ error: "Kata sandi baru harus 12–200 karakter." }, 400);
      }
      const { data, error } = await db.rpc("change_owner_password", {
        p_owner_id: session.owner_id,
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });
      if (error) throw error;
      if (!data) return respond({ error: "Kata sandi saat ini salah atau kata sandi baru belum memenuhi 12 karakter." }, 400);
      await db.from("owner_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("owner_id", session.owner_id).is("revoked_at", null);
      return respond({ ok: true, message: "Kata sandi diperbarui. Silakan login kembali." });
    }

    if (action === "cleanup-media" && req.method === "POST") {
      if (!Array.isArray(body.paths) || body.paths.length > 31) {
        return respond({ error: "Daftar foto untuk pembersihan tidak valid." }, 400);
      }
      const submitted = body.paths.map(safeStoragePath);
      if (submitted.some(path => !path || !path.startsWith("respect-threads/"))) {
        return respond({ error: "Pembersihan hanya diizinkan untuk foto Respect Thread." }, 400);
      }
      const candidates = [...new Set(submitted.filter((path): path is string => Boolean(path)))];
      if (!candidates.length) return respond({ ok: true, removed: 0 });

      const { data: threads, error: readError } = await db.from("respect_threads").select("sections");
      if (readError) throw readError;
      const referenced = new Set((threads || []).flatMap(row => respectThreadImagePaths(row.sections)));
      const unused = candidates.filter(path => !referenced.has(path));
      await removeIvoryMedia(unused);
      return respond({ ok: true, removed: unused.length });
    }

    if (action === "upload" && req.method === "POST") {
      // The shared bucket and non-Respect-Thread uploads retain their existing 8 MB cap.
      const maxRequestFileBytes = 8 * 1024 * 1024;
      const declaredLength = Number(req.headers.get("content-length") || 0);
      if (Number.isFinite(declaredLength) && declaredLength > maxRequestFileBytes + 128 * 1024) {
        return respond({ error: "Ukuran foto terlalu besar. Maksimal 8 MB setelah crop." }, 413);
      }
      let form: FormData;
      try { form = await readBoundedFormData(req, maxRequestFileBytes + 128 * 1024); }
      catch (error) {
        if (error instanceof RequestBodyError) return respond({ error: error.message }, error.status);
        return respond({ error: "Form upload tidak valid. Silakan pilih ulang fotonya." }, 400);
      }
      const folder = String(form.get("folder") || "").trim();
      if (folder && folder !== "respect-threads") return respond({ error: "Folder upload tidak diizinkan." }, 400);
      const maxFileBytes = folder === "respect-threads" ? 3 * 1024 * 1024 : maxRequestFileBytes;
      const maxFileLabel = folder === "respect-threads" ? "3 MB" : "8 MB";
      const uploadedFile = form.get("file");
      if (!(uploadedFile instanceof File)) return respond({ error: "File foto tidak ditemukan pada permintaan upload." }, 400);
      const fileName = String(form.get("fileName") || uploadedFile.name || "ivory-photo.jpg")
        .replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
      const mime = uploadedFile.type;
      if (!fileName || mime !== "image/jpeg" || !allowedImageTypes.has(mime)) {
        return respond({ error: "Hasil crop harus berupa JPEG." }, 400);
      }
      if (uploadedFile.size < 4 || uploadedFile.size > maxFileBytes) {
        return respond({ error: "Ukuran foto maksimal " + maxFileLabel + " setelah crop." }, 413);
      }
      const binary = new Uint8Array(await uploadedFile.arrayBuffer());
      if (binary.length < 4 || binary[0] !== 0xff || binary[1] !== 0xd8 || binary[2] !== 0xff ||
          binary[binary.length - 2] !== 0xff || binary[binary.length - 1] !== 0xd9) {
        return respond({ error: "File bukan gambar JPEG yang valid. Silakan crop ulang." }, 400);
      }
      const path = (folder ? folder + "/" : "") + Date.now() + "-" + crypto.randomUUID() + "-" + fileName;
      const { error: storageError } = await db.storage.from("ivory-public").upload(path, binary, {
        contentType: mime, cacheControl: "31536000", upsert: false,
      });
      if (storageError) {
        console.error("Ivory media upload failed:", storageError.message);
        return respond({ error: "Storage menolak foto. Pastikan ukuran akhir maksimal " + maxFileLabel + ", lalu coba lagi." }, 502);
      }
      const { data } = db.storage.from("ivory-public").getPublicUrl(path);
      return respond({ path, url: data.publicUrl });
    }

    const table = String(body.table || url.searchParams.get("table") || "");
    if (!allowedTables.has(table)) return respond({ error: "Modul tidak dikenal." }, 400);

    if (action === "list" && req.method === "GET") {
      let query = db.from(table).select("*");
      if (table === "testimonials") query = query.order("work_date", { ascending: false });
      else if (table === "site_content") query = query.order("key", { ascending: true });
      else if (table === "respect_threads") query = query.order("updated_at", { ascending: false });
      else query = query.order("sort_order", { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return respond({ data });
    }

    if (action === "create" && req.method === "POST") {
      const values = validateValues(table, body.values);
      const { data, error } = await db.from(table).insert(values).select().single();
      if (error?.code === "23505" && table === "respect_threads") {
        return respond({ error: "Alamat halaman (slug) sudah digunakan oleh Respect Thread lain. Ubah slug lalu coba lagi." }, 409);
      }
      if (error) throw error;
      return respond({ data }, 201);
    }

    if (action === "update" && req.method === "PATCH") {
      const { id } = body;
      const values = validateValues(table, body.values);
      if (table !== "site_content" && !validRowId(id)) {
        return respond({ error: "ID data tidak valid." }, 400);
      }
      let obsoleteMedia: string[] = [];
      if (table !== "site_content" && id && values && typeof values === "object") {
        if (table === "testimonials" && Array.isArray((values as Record<string, unknown>).image_paths)) {
          const { data: before, error: readError } = await db.from(table).select("image_paths").eq("id", id).maybeSingle();
          if (readError) throw readError;
          const keep = new Set((values as Record<string, unknown>).image_paths as string[]);
          obsoleteMedia = ((before?.image_paths || []) as string[]).filter((path) => !keep.has(path));
        } else if (table === "staff" && Object.prototype.hasOwnProperty.call(values, "photo_path")) {
          const { data: before, error: readError } = await db.from(table).select("photo_path").eq("id", id).maybeSingle();
          if (readError) throw readError;
          if (before?.photo_path && before.photo_path !== (values as Record<string, unknown>).photo_path) {
            const oldPath = storagePathFromPublicUrl(before.photo_path);
            if (oldPath) obsoleteMedia.push(oldPath);
          }
        } else if (table === "respect_threads" && Object.prototype.hasOwnProperty.call(values, "sections")) {
          const { data: before, error: readError } = await db.from(table).select("sections").eq("id", id).maybeSingle();
          if (readError) throw readError;
          const keep = new Set(respectThreadImagePaths((values as Record<string, unknown>).sections));
          obsoleteMedia = respectThreadImagePaths(before?.sections).filter(path => !keep.has(path));
        }
      }
      const updateValues = table === "respect_threads" ? { ...values, updated_at: new Date().toISOString() } : values;
      const { data, error } = table === "site_content"
        ? await db.from(table).upsert(values, { onConflict: "key" }).select().single()
        : await db.from(table).update(updateValues).eq("id", id).select().single();
      if (error?.code === "23505" && table === "respect_threads") {
        return respond({ error: "Alamat halaman (slug) sudah digunakan oleh Respect Thread lain. Ubah slug lalu coba lagi." }, 409);
      }
      if (error) throw error;
      if (!data) return respond({ error: "Data tidak ditemukan." }, 404);
      await removeIvoryMedia(obsoleteMedia);
      return respond({ data });
    }

    if (action === "delete" && req.method === "DELETE") {
      if (table === "site_content") {
        return respond({ error: "Konten website tidak dapat dihapus dari dashboard." }, 405);
      }
      if (!validRowId(body.id)) return respond({ error: "ID data tidak valid." }, 400);
      let mediaToRemove: string[] = [];
      if (table === "testimonials") {
        const { data: before, error: readError } = await db.from(table).select("image_paths").eq("id", body.id).maybeSingle();
        if (readError) throw readError;
        mediaToRemove = (before?.image_paths || []) as string[];
      } else if (table === "staff") {
        const { data: before, error: readError } = await db.from(table).select("photo_path").eq("id", body.id).maybeSingle();
        if (readError) throw readError;
        const path = storagePathFromPublicUrl(before?.photo_path);
        if (path) mediaToRemove.push(path);
      } else if (table === "respect_threads") {
        const { data: before, error: readError } = await db.from(table).select("sections").eq("id", body.id).maybeSingle();
        if (readError) throw readError;
        mediaToRemove = respectThreadImagePaths(before?.sections);
      }
      const { error } = await db.from(table).delete().eq("id", body.id);
      if (error) throw error;
      await removeIvoryMedia(mediaToRemove);
      return respond({ ok: true });
    }

    return respond({ error: "Metode tidak didukung." }, 405);
  } catch (error) {
    console.error(error);
    return respond({ error: "Permintaan gagal diproses. Silakan coba lagi." }, 500);
  }
});
