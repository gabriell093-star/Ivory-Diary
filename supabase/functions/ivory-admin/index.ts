import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const allowedTables = new Set(["services", "staff", "testimonials", "site_content"]);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get("action");
    let body: Record<string, unknown> = {};
    if (req.method !== "GET" && queryAction !== "upload") {
      try {
        body = await readJsonBody(req, 256_000);
      } catch (error) {
        if (error instanceof RequestBodyError) return json({ error: error.message }, error.status);
        return json({ error: "Format permintaan tidak valid." }, 400);
      }
    }
    const action = queryAction || body.action;

    if (action === "login" && req.method === "POST") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!username || !password || username.length > 40 || password.length > 200) {
        return json({ error: "Username atau password tidak valid." }, 400);
      }
      const ipAddress = req.headers.get("cf-connecting-ip")
        || req.headers.get("x-real-ip")
        || req.headers.get("x-forwarded-for")
        || "unknown";
      const ipHash = await sha256(ipAddress.split(",")[0].trim());
      const { data: allowed, error: rateLimitError } = await db.rpc("consume_owner_login_attempt", {
        p_username: username,
        p_ip_hash: ipHash,
      });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit." }, 429);

      const { data: owners, error: verifyError } = await db.rpc("verify_owner_login", {
        p_username: username,
        p_password: password,
      });
      if (verifyError) throw verifyError;
      const owner = owners?.[0];
      if (!owner) return json({ error: "Username atau password salah." }, 401);

      const token = crypto.randomUUID() + "." + crypto.randomUUID();
      const tokenHash = await sha256(token);
      const { error } = await db.from("owner_sessions").insert({
        owner_id: owner.owner_id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      return json({ token, owner: { username: owner.username, display_name: owner.display_name } });
    }

    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "Sesi Owner diperlukan." }, 401);

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
    if (!session) return json({ error: "Sesi berakhir. Silakan login kembali." }, 401);

    if (action === "me" && req.method === "GET") {
      return json({ owner: session.owner_accounts });
    }

    if (action === "logout" && req.method === "POST") {
      const { error } = await db.from("owner_sessions")
        .update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "change-password" && req.method === "POST") {
      const { data, error } = await db.rpc("change_owner_password", {
        p_owner_id: session.owner_id,
        p_current_password: String(body.currentPassword || ""),
        p_new_password: String(body.newPassword || ""),
      });
      if (error) throw error;
      if (!data) return json({ error: "Kata sandi saat ini salah atau kata sandi baru belum memenuhi 12 karakter." }, 400);
      await db.from("owner_sessions").update({ revoked_at: new Date().toISOString() })
        .eq("owner_id", session.owner_id).is("revoked_at", null);
      return json({ ok: true, message: "Kata sandi diperbarui. Silakan login kembali." });
    }

    if (action === "upload" && req.method === "POST") {
      const maxFileBytes = 8 * 1024 * 1024;
      const declaredLength = Number(req.headers.get("content-length") || 0);
      if (Number.isFinite(declaredLength) && declaredLength > maxFileBytes + 128 * 1024) {
        return json({ error: "Ukuran foto terlalu besar. Maksimal 8 MB setelah crop." }, 413);
      }
      let form: FormData;
      try { form = await req.formData(); }
      catch { return json({ error: "Form upload tidak valid. Silakan pilih ulang fotonya." }, 400); }
      const uploadedFile = form.get("file");
      if (!(uploadedFile instanceof File)) return json({ error: "File foto tidak ditemukan pada permintaan upload." }, 400);
      const fileName = String(form.get("fileName") || uploadedFile.name || "ivory-photo.jpg")
        .replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
      const mime = uploadedFile.type;
      if (!fileName || mime !== "image/jpeg" || !allowedImageTypes.has(mime)) {
        return json({ error: "Hasil crop harus berupa JPEG." }, 400);
      }
      if (uploadedFile.size < 4 || uploadedFile.size > maxFileBytes) {
        return json({ error: "Ukuran foto maksimal 8 MB setelah crop." }, 413);
      }
      const binary = new Uint8Array(await uploadedFile.arrayBuffer());
      if (binary.length < 4 || binary[0] !== 0xff || binary[1] !== 0xd8 || binary[2] !== 0xff ||
          binary[binary.length - 2] !== 0xff || binary[binary.length - 1] !== 0xd9) {
        return json({ error: "File bukan gambar JPEG yang valid. Silakan crop ulang." }, 400);
      }
      const path = Date.now() + "-" + crypto.randomUUID() + "-" + fileName;
      const { error: storageError } = await db.storage.from("ivory-public").upload(path, binary, {
        contentType: mime, cacheControl: "31536000", upsert: false,
      });
      if (storageError) {
        console.error("Ivory media upload failed:", storageError.message);
        return json({ error: "Storage menolak foto. Pastikan ukuran akhir maksimal 8 MB, lalu coba lagi." }, 502);
      }
      const { data } = db.storage.from("ivory-public").getPublicUrl(path);
      return json({ path, url: data.publicUrl });
    }

    const table = String(body.table || url.searchParams.get("table") || "");
    if (!allowedTables.has(table)) return json({ error: "Modul tidak dikenal." }, 400);

    if (req.method === "GET") {
      let query = db.from(table).select("*");
      if (table === "testimonials") query = query.order("work_date", { ascending: false });
      else if (table === "site_content") query = query.order("key", { ascending: true });
      else query = query.order("sort_order", { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return json({ data });
    }

    if (req.method === "POST") {
      const { data, error } = await db.from(table).insert(body.values || {}).select().single();
      if (error) throw error;
      return json({ data }, 201);
    }

    if (req.method === "PATCH") {
      const { id, values } = body;
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
        }
      }
      const { data, error } = table === "site_content"
        ? await db.from(table).upsert(values, { onConflict: "key" }).select().single()
        : await db.from(table).update(values).eq("id", id).select().single();
      if (error) throw error;
      if (!data) return json({ error: "Data tidak ditemukan." }, 404);
      await removeIvoryMedia(obsoleteMedia);
      return json({ data });
    }

    if (req.method === "DELETE") {
      if (table === "site_content") {
        return json({ error: "Konten website tidak dapat dihapus dari dashboard." }, 405);
      }
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
      }
      const { error } = await db.from(table).delete().eq("id", body.id);
      if (error) throw error;
      await removeIvoryMedia(mediaToRemove);
      return json({ ok: true });
    }

    return json({ error: "Metode tidak didukung." }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: "Permintaan gagal diproses. Silakan coba lagi." }, 500);
  }
});
