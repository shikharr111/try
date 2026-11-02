import "server-only";

/** Central, validated access to server configuration. Throws a readable error instead of failing obscurely. */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes("YOUR-PROJECT-REF") || anonKey === "YOUR-ANON-KEY") {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).");
  }
  return { url, anonKey };
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export interface AiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  dailyLimit: number;
}
/** null when AI is not configured: callers show a clear "not configured" state. */
export function aiConfig(): AiConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) return null;
  const limit = Number(process.env.AI_DAILY_LIMIT_PER_PROJECT ?? "20");
  return { apiKey, model, baseUrl: process.env.AI_BASE_URL || undefined, dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 20 };
}

export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";
