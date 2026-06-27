// ─── #1 予想バトル: 締切時点でどちらが多数派になるかを予想 ──────────
//  ・予想は自分の投票と独立（分析力を評価＝煽りになりにくい）
//  ・結果はクライアントで遅延判定（締切超過/closed を決着とみなす）
//  ・報酬はこの predictions 側で独立管理（的中数 × PRED_AWARD）。
//    user_activity.points（ミッション）と列を奪い合わない設計。
import { supabase, isSupabaseConfigured } from "./supabase";
import { isDecided, winnerSide } from "./logic";

export type PredSide = "pro" | "con";
export type PredRow = { debateId: number; side: PredSide; resolved: boolean; correct: boolean | null; resolvedAt: number | null };
export type PredStats = { predicted: number; resolved: number; correct: number; rate: number; streak: number };
export type Resolved = { debateId: number; side: PredSide; correct: boolean; title: string };

const LS = (user: string) => `split-pred:${user}`;
type LocalMap = Record<string, { side: PredSide; resolved: boolean; correct: boolean | null; resolvedAt: number | null }>;

function loadLocal(user: string): LocalMap {
  try { const raw = localStorage.getItem(LS(user)); if (raw) return JSON.parse(raw); } catch { /* noop */ }
  return {};
}
function saveLocal(user: string, m: LocalMap) {
  try { localStorage.setItem(LS(user), JSON.stringify(m)); } catch { /* noop */ }
}
const toRows = (m: LocalMap): PredRow[] =>
  Object.entries(m).map(([id, v]) => ({ debateId: Number(id), side: v.side, resolved: v.resolved, correct: v.correct, resolvedAt: v.resolvedAt }));

// ─── 統計（的中率・連勝）。連勝は解決日時の新しい順に的中が続く数 ──────
export function predictionStats(rows: PredRow[]): PredStats {
  const resolved = rows.filter(r => r.resolved);
  const correct = resolved.filter(r => r.correct).length;
  const ordered = [...resolved].sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
  let streak = 0;
  for (const r of ordered) { if (r.correct) streak++; else break; }
  return { predicted: rows.length, resolved: resolved.length, correct, rate: resolved.length ? correct / resolved.length : 0, streak };
}

// ─── 取得 ────────────────────────────────────────────────────────
export async function getPredictions(user: string | null, authed: boolean): Promise<PredRow[]> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data } = await supabase.from("predictions").select("debate_id,side,resolved,correct,resolved_at");
    return (data || []).map((r: any) => ({
      debateId: r.debate_id, side: r.side, resolved: r.resolved, correct: r.correct,
      resolvedAt: r.resolved_at ? new Date(r.resolved_at).getTime() : null,
    }));
  }
  if (!user) return [];
  return toRows(loadLocal(user));
}

// ─── 予想する/変更する（決着後は不可）────────────────────────────
export async function setPrediction(user: string | null, authed: boolean, debateId: number, side: PredSide): Promise<boolean> {
  if (isSupabaseConfigured && authed && supabase) {
    const { data, error } = await supabase.rpc("set_prediction", { p_debate_id: debateId, p_side: side });
    return !error && !!data?.ok;
  }
  if (!user) return false;
  const m = loadLocal(user);
  const cur = m[String(debateId)];
  if (cur?.resolved) return false;
  m[String(debateId)] = { side, resolved: false, correct: null, resolvedAt: null };
  saveLocal(user, m);
  return true;
}

// ─── 未解決の予想のうち、決着済みのものを判定して確定 ──────────────
export async function resolvePending(user: string | null, authed: boolean, debates: any[]): Promise<Resolved[]> {
  const byId = new Map<number, any>(debates.map(d => [d.id, d]));
  const rows = await getPredictions(user, authed);
  const out: Resolved[] = [];
  if (isSupabaseConfigured && authed && supabase) {
    for (const r of rows) {
      if (r.resolved) continue;
      const d = byId.get(r.debateId);
      if (!d || !isDecided(d)) continue;
      const { data, error } = await supabase.rpc("resolve_prediction", { p_debate_id: r.debateId });
      if (!error && data?.resolved) out.push({ debateId: r.debateId, side: r.side, correct: !!data.correct, title: d.title });
    }
    return out;
  }
  if (!user) return [];
  const m = loadLocal(user);
  let changed = false;
  for (const r of rows) {
    if (r.resolved) continue;
    const d = byId.get(r.debateId);
    if (!d || !isDecided(d)) continue;
    const correct = r.side === winnerSide(d);
    m[String(r.debateId)] = { side: r.side, resolved: true, correct, resolvedAt: Date.now() };
    changed = true;
    out.push({ debateId: r.debateId, side: r.side, correct, title: d.title });
  }
  if (changed) saveLocal(user, m);
  return out;
}
