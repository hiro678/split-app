// ─── P2-9/11: プロフィール拡張（表示名・自己紹介文）────────────────
//  username(@ハンドル)は不変。display_name は日本語OKの見せ名（任意）。
//  Supabase が正、ローカルモードは localStorage にフォールバック。
import { supabase, isSupabaseConfigured } from "./supabase";

export type ProfileExtras = { displayName: string; bio: string };

const LS = (username: string) => `split-profile:${username}`;
const empty = (): ProfileExtras => ({ displayName: "", bio: "" });

// 任意ユーザーのプロフィール拡張を取得（他人のマイページ表示にも使う）
export async function getProfileExtras(username: string | null): Promise<ProfileExtras> {
  if (!username) return empty();
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from("profiles")
      .select("display_name,bio").eq("username", username).maybeSingle();
    return { displayName: data?.display_name || "", bio: data?.bio || "" };
  }
  try { const raw = localStorage.getItem(LS(username)); if (raw) return { ...empty(), ...JSON.parse(raw) }; } catch { /* noop */ }
  return empty();
}

// 自分のプロフィール拡張を保存（RLSにより本人のみ更新可）
export async function saveProfileExtras(
  username: string, userId: string | null, extras: ProfileExtras,
): Promise<boolean> {
  if (isSupabaseConfigured && supabase) {
    if (!userId) return false;
    const { error } = await supabase.from("profiles")
      .update({ display_name: extras.displayName.trim() || null, bio: extras.bio.trim() || null })
      .eq("id", userId);
    if (error) console.error("[supabase] saveProfileExtras", error);
    return !error;
  }
  try { localStorage.setItem(LS(username), JSON.stringify(extras)); return true; } catch { return false; }
}
