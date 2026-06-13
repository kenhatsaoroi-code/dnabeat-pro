// =====================================================================
// api/_lib.js — shared server-side helpers (NOT a route)
// Underscore prefix => Vercel does not expose this as an endpoint.
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client bypasses RLS — server only.
export const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Pull the bearer token from the Authorization header.
export function getBearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

// Verify a Supabase access token and return the auth user (or null).
export async function getUser(req) {
  const token = getBearer(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Read (or lazily create) the profile row for a user.
export async function getProfile(user) {
  let { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const meta = user.user_metadata || {};
    const { data: created } = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: meta.full_name || meta.name || null,
          avatar_url: meta.avatar_url || null,
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();
    profile = created;
  }
  return profile;
}

// Is this profile currently premium? (flag + optional expiry)
export function isPremium(profile) {
  if (!profile?.is_premium) return false;
  if (!profile.premium_until) return true;
  return new Date(profile.premium_until).getTime() > Date.now();
}

// Today's usage count for a user (UTC day).
export async function getTodayUsage(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return data?.count || 0;
}

// Atomically +1 and return the new count.
export async function bumpUsage(userId) {
  const { data, error } = await admin.rpc("increment_usage", { p_user: userId });
  if (error) throw error;
  return data;
}

export function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

export const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || "5", 10);
