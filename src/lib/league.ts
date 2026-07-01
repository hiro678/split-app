// ─── #5 週間リーグ（毎週リセットの週間ポイント順位）────────────────
//  user_activity の「今週分」を集計。重みは書く行為を優遇（良い議論寄り）。
//  真の集計は Supabase RPC。未ログイン/ローカルは localStorage から自前集計。
import { supabase, isSupabaseConfigured } from "./supabase";
import { readLocalActivity, type DayActivity } from "./retention";

export type LeagueRow = { username: string; score: number };
export type MyWeekly = { score: number; rank: number | null };

// 週間スコアの重み（投票1・返信2・コメント3・投稿5・ボーナス1）
export const weekScore = (a: DayActivity) =>
  (a.votes || 0) + (a.comments || 0) * 3 + (a.replies || 0) * 2 + (a.debates || 0) * 5 + (a.bonus || 0);

const dstr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// 今週の月曜〜日曜 ＋ 次のリセットまでの残日数
export function weekBounds(now = new Date()): { start: string; end: string; resetInDays: number } {
  const d = new Date(now);
  const sinceMon = (d.getDay() + 6) % 7; // 月曜からの経過日数（月=0..日=6）
  const mon = new Date(d); mon.setDate(d.getDate() - sinceMon); mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { start: dstr(mon), end: dstr(sun), resetInDays: 7 - sinceMon };
}

export async function getLeaderboard(user: string | null, authed: boolean, start: string, end: string, limit = 10): Promise<LeagueRow[]> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data } = await supabase.rpc("weekly_leaderboard", { p_start: start, p_end: end, p_limit: limit });
    return (data || []).map((r: any) => ({ username: r.username, score: r.score }));
  }
  if (!user) return [];
  const act = readLocalActivity(user);
  let score = 0;
  for (const [day, a] of Object.entries(act)) if (day >= start && day <= end) score += weekScore(a);
  return score > 0 ? [{ username: user, score }] : [];
}

export async function getMyWeekly(user: string | null, authed: boolean, start: string, end: string): Promise<MyWeekly> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data } = await supabase.rpc("my_weekly", { p_start: start, p_end: end });
    return data ? { score: data.score, rank: data.rank } : { score: 0, rank: null };
  }
  if (!user) return { score: 0, rank: null };
  const act = readLocalActivity(user);
  let score = 0;
  for (const [day, a] of Object.entries(act)) if (day >= start && day <= end) score += weekScore(a);
  return { score, rank: score > 0 ? 1 : null };
}
