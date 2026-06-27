// ─── リテンション: 毎日の活動ログ ＋ ストリーク ＋ デイリーミッション ──
//  真の保存先は Supabase（ログイン時・端末跨ぎ）。
//  未ログイン／ローカルデモ時は localStorage にフォールバックして動かす。
//  「1日の活動ログ(user_activity)」はミッション(#6)・週間リーグ(#5)の共有土台。
import { supabase, isSupabaseConfigured } from "./supabase";

export type Streak = { current: number; longest: number; lastActive: string | null; freezes: number };
export type DayActivity = { votes: number; comments: number; replies: number; debates: number; bonus: number };
export type ActivityKind = "vote" | "comment" | "reply" | "debate";

const emptyStreak = (): Streak => ({ current: 0, longest: 0, lastActive: null, freezes: 1 });
const emptyDay = (): DayActivity => ({ votes: 0, comments: 0, replies: 0, debates: 0, bonus: 0 });

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

// ─── デイリーミッション定義（当日の活動カウントから達成判定）──────────
export const DAILY_MISSIONS: { id: string; label: string; done: (a: DayActivity) => boolean }[] = [
  { id: "vote",    label: "今日の1票を投じる",          done: a => a.votes >= 1 },
  { id: "opinion", label: "意見を書く（コメント/返信）", done: a => a.comments + a.replies >= 1 },
  { id: "active",  label: "今日3アクション",            done: a => a.votes + a.comments + a.replies + a.debates >= 3 },
];
export const DAILY_BONUS = 20; // 全ミッション達成のボーナスXP
export const missionsCleared = (a: DayActivity) => DAILY_MISSIONS.every(m => m.done(a));
export const missionsDoneCount = (a: DayActivity) => DAILY_MISSIONS.filter(m => m.done(a)).length;

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
type LocalState = { streak: Streak; activity: Record<string, DayActivity> };
const emptyLocal = (): LocalState => ({ streak: emptyStreak(), activity: {} });

function loadLocal(user: string): LocalState {
  try { const raw = localStorage.getItem(LS_KEY(user)); if (raw) return { ...emptyLocal(), ...JSON.parse(raw) }; } catch { /* noop */ }
  return emptyLocal();
}
function saveLocal(user: string, s: LocalState) {
  try { localStorage.setItem(LS_KEY(user), JSON.stringify(s)); } catch { /* noop */ }
}
const dayOf = (s: LocalState, day: string): DayActivity => s.activity[day] || emptyDay();
const kindCol = (k: ActivityKind): keyof DayActivity =>
  k === "vote" ? "votes" : k === "comment" ? "comments" : k === "reply" ? "replies" : "debates";

function recordLocal(user: string, kind: ActivityKind, day: string) {
  const s = loadLocal(user);
  const a: DayActivity = { ...emptyDay(), ...s.activity[day] };
  a[kindCol(kind)] += 1;
  s.activity[day] = a;
  const { next, incremented } = advanceStreak(s.streak, day);
  s.streak = next;
  saveLocal(user, s);
  return { streak: next, incremented, today: a };
}

// ─── 公開API ─────────────────────────────────────────────────────
export async function getStreak(user: string | null, authed: boolean): Promise<Streak> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data } = await supabase.rpc("my_streak");
    return data ? { current: data.current, longest: data.longest, lastActive: data.lastActive, freezes: data.freezes } : emptyStreak();
  }
  if (!user) return emptyStreak();
  return loadLocal(user).streak;
}

export async function getDayActivity(user: string | null, authed: boolean, day = todayStr()): Promise<DayActivity> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data } = await supabase.rpc("my_day", { p_day: day });
    return data ? { ...emptyDay(), ...data } : emptyDay();
  }
  if (!user) return emptyDay();
  return dayOf(loadLocal(user), day);
}

export async function getBonusTotal(user: string | null, authed: boolean): Promise<number> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data } = await supabase.rpc("my_bonus_total");
    return typeof data === "number" ? data : 0;
  }
  if (!user) return 0;
  const s = loadLocal(user);
  return Object.values(s.activity).reduce((sum, d) => sum + (d.bonus || 0), 0);
}

export async function recordActivity(
  user: string | null, authed: boolean, kind: ActivityKind,
): Promise<{ streak: Streak; incremented: boolean; today: DayActivity }> {
  const day = todayStr();
  if (isSupabaseConfigured && authed && supabase) {
    const { data, error } = await supabase.rpc("record_activity", { p_kind: kind, p_day: day });
    if (!error && data) {
      return {
        streak: { current: data.current, longest: data.longest, lastActive: data.day, freezes: data.freezes ?? 1 },
        incremented: !!data.incremented,
        today: { votes: data.votes, comments: data.comments, replies: data.replies, debates: data.debates, bonus: data.bonus },
      };
    }
    return { streak: await getStreak(user, authed), incremented: false, today: await getDayActivity(user, authed, day) };
  }
  if (!user) return { streak: emptyStreak(), incremented: false, today: emptyDay() };
  return recordLocal(user, kind, day);
}

// 全ミッション達成ボーナスを当日に一度だけ付与（冪等）
export async function claimDailyBonus(
  user: string | null, authed: boolean, amount = DAILY_BONUS, day = todayStr(),
): Promise<{ claimed: boolean; amount: number }> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data, error } = await supabase.rpc("claim_daily_bonus", { p_day: day, p_amount: amount });
    if (!error && data) return { claimed: !!data.claimed, amount: data.amount ?? 0 };
    return { claimed: false, amount: 0 };
  }
  if (!user) return { claimed: false, amount: 0 };
  const s = loadLocal(user);
  const a: DayActivity = { ...emptyDay(), ...s.activity[day] };
  if (a.bonus > 0) return { claimed: false, amount: 0 };
  a.bonus = amount;
  s.activity[day] = a;
  saveLocal(user, s);
  return { claimed: true, amount };
}
