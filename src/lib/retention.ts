// ─── リテンション: 毎日の活動ログ ＋ ストリーク（連続記録）─────────
//  真の保存先は Supabase（ログイン時・端末跨ぎ）。
//  未ログイン／ローカルデモ時は localStorage にフォールバックして動かす。
//  この「1日の活動ログ(user_activity)」はミッション(#6)・週間リーグ(#5)の共有土台。
import { supabase, isSupabaseConfigured } from "./supabase";

export type Streak = { current: number; longest: number; lastActive: string | null; freezes: number };
export type ActivityKind = "vote" | "comment" | "reply" | "debate";

// ローカル時刻での YYYY-MM-DD（朝の電車＝当日扱いになるよう端末TZ基準）
export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);

// dispatch のアクション種別 → 活動種別
export const activityKindFor = (type: string): ActivityKind | null =>
  type === "SET_STANCE" ? "vote"
  : type === "ADD_COMMENT" ? "comment"
  : type === "ADD_REPLY" ? "reply"
  : type === "ADD_DEBATE" ? "debate"
  : null;

// ─── 純粋ロジック: 現在のstreakと「今日」から次のstreakを算出 ──────
//  当日2回目以降は据え置き。1日空き＝freezeで救済、2日以上空き＝リセット。
export function advanceStreak(prev: Streak, day: string): { next: Streak; incremented: boolean } {
  if (prev.lastActive === day) return { next: prev, incremented: false };
  if (!prev.lastActive) {
    return { next: { current: 1, longest: Math.max(1, prev.longest), lastActive: day, freezes: prev.freezes }, incremented: true };
  }
  const diff = dayDiff(prev.lastActive, day);
  let current: number;
  let freezes = prev.freezes;
  if (diff === 1) current = prev.current + 1;
  else if (diff === 2 && prev.freezes > 0) { current = prev.current + 1; freezes = prev.freezes - 1; }
  else current = 1;
  return { next: { current, longest: Math.max(prev.longest, current), lastActive: day, freezes }, incremented: true };
}

// ─── localStorage フォールバック ──────────────────────────────────
const LS_KEY = (user: string) => `split-retention:${user}`;
type DayCounts = { votes: number; comments: number; replies: number; debates: number };
type LocalState = { streak: Streak; activity: Record<string, DayCounts> };

const emptyStreak = (): Streak => ({ current: 0, longest: 0, lastActive: null, freezes: 1 });
const emptyLocal = (): LocalState => ({ streak: emptyStreak(), activity: {} });

function loadLocal(user: string): LocalState {
  try { const raw = localStorage.getItem(LS_KEY(user)); if (raw) return { ...emptyLocal(), ...JSON.parse(raw) }; } catch { /* noop */ }
  return emptyLocal();
}
function saveLocal(user: string, s: LocalState) {
  try { localStorage.setItem(LS_KEY(user), JSON.stringify(s)); } catch { /* noop */ }
}
const kindCol = (k: ActivityKind): keyof DayCounts =>
  k === "vote" ? "votes" : k === "comment" ? "comments" : k === "reply" ? "replies" : "debates";

function recordLocal(user: string, kind: ActivityKind, day: string) {
  const s = loadLocal(user);
  const a: DayCounts = s.activity[day] || { votes: 0, comments: 0, replies: 0, debates: 0 };
  a[kindCol(kind)] += 1;
  s.activity[day] = a;
  const { next, incremented } = advanceStreak(s.streak, day);
  s.streak = next;
  saveLocal(user, s);
  return { streak: next, incremented };
}

// ─── 公開API ─────────────────────────────────────────────────────
export async function getStreak(user: string | null, authed: boolean): Promise<Streak> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data, error } = await supabase.from("user_streaks").select("current,longest,last_active,freezes").maybeSingle();
    if (!error && data) return { current: data.current, longest: data.longest, lastActive: data.last_active, freezes: data.freezes };
    return emptyStreak();
  }
  if (!user) return emptyStreak();
  return loadLocal(user).streak;
}

export async function recordActivity(user: string | null, authed: boolean, kind: ActivityKind): Promise<{ streak: Streak; incremented: boolean }> {
  const day = todayStr();
  if (isSupabaseConfigured && authed && supabase) {
    const { data, error } = await supabase.rpc("record_activity", { p_kind: kind, p_day: day });
    if (!error && data) {
      return { streak: { current: data.current, longest: data.longest, lastActive: data.day, freezes: data.freezes ?? 1 }, incremented: !!data.incremented };
    }
    // RPC未適用などは握りつぶし、ローカルにも記録しない（DBが正のため）
    return { streak: await getStreak(user, authed), incremented: false };
  }
  if (!user) return { streak: emptyStreak(), incremented: false };
  return recordLocal(user, kind, day);
}
