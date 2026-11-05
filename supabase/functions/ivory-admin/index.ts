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

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || body.action;

    if (action === "login" && req.method === "POST") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!username || !password || username.length > 40 || password.length > 200) {
        return json({ error: "Username atau password tidak valid." }, 400);
      }
      const forwarded = req.headers.get("x-forwarded-for") || "unknown";
      const ipHash = await sha256(forwarded.split(",")[0].trim());
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count, error: countError } = await db.from("owner_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("username", username).eq("ip_hash", ipHash).gte("attempted_at", since);
      if (countError) throw countError;
      if ((count || 0) >= 8) return json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit." }, 429);

      const { error: insertError } = await db.from("owner_login_attempts")
        .insert({ username, ip_hash: ipHash });
      if (insertError) throw insertError;

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
      await db.from("owner_login_attempts").delete()
        .lt("attempted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      return json({ token, owner: { username: owner.username, display_name: owner.display_name } });
    }

    const authorization = req.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "Sesi Owner diperlukan." }, 401);

    const tokenHash = await sha256(token);
    const { data: sessions, error: sessionError } = await db.from("owner_sessions")
      .select("id, owner_id, expires_at, owner_accounts(username, display_name)")
      .eq("token_hash", tokenHash)
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
      const fileName = String(body.fileName || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100);
      const mime = String(body.contentType || "");
      const base64 = String(body.base64 || "");
      if (!fileName || !allowedImageTypes.has(mime) || !base64 || base64.length > 11_200_000) {
        return json({ error: "Format gambar tidak didukung atau ukuran file terlalu besar." }, 400);
      }
      let binary: Uint8Array;
      try {
        binary = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      } catch {
        return json({ error: "Data gambar tidak valid." }, 400);
      }
      if (!binary.length || binary.length > 8 * 1024 * 1024) {
        return json({ error: "Ukuran gambar maksimal 8 MB." }, 400);
      }
      const path = Date.now() + "-" + crypto.randomUUID() + "-" + fileName;
      const { error } = await db.storage.from("ivory-public").upload(path, binary, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw error;
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
      const { data, error } = table === "site_content"
        ? await db.from(table).upsert(values, { onConflict: "key" }).select().single()
        : await db.from(table).update(values).eq("id", id).select().single();
      if (error) throw error;
      if (!data) return json({ error: "Data tidak ditemukan." }, 404);
      return json({ data });
    }

    if (req.method === "DELETE") {
      if (table === "site_content") {
        return json({ error: "Konten website tidak dapat dihapus dari dashboard." }, 405);
      }
      const { error } = await db.from(table).delete().eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Metode tidak didukung." }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: "Permintaan gagal diproses. Silakan coba lagi." }, 500);
  }
});
