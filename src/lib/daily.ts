// ─── 今日の論題: 管理者による手動上書き（#2 折衷案 C）──────────────
//  自動ピックは logic.pickDailyDebate（DB不要）。ここは「その日だけ運営が
//  指定した1問」を保存/取得する層。Supabase が正、未接続時は localStorage。
import { supabase, isSupabaseConfigured } from "./supabase";
import { todayStr } from "./retention";

const LS = (day: string) => `split-daily:${day}`;

export async function getDailyOverride(day = todayStr()): Promise<number | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from("daily_debate").select("debate_id").eq("day", day).maybeSingle();
    return data?.debate_id ?? null;
  }
  try { const v = localStorage.getItem(LS(day)); return v ? Number(v) : null; } catch { return null; }
}

// 指定/解除（debateId=null で解除）。Supabase では admin のみRLSで通る。
export async function setDailyOverride(debateId: number | null, day = todayStr()): Promise<boolean> {
  if (isSupabaseConfigured && supabase) {
    if (debateId == null) { const { error } = await supabase.from("daily_debate").delete().eq("day", day); return !error; }
    const { error } = await supabase.from("daily_debate").upsert({ day, debate_id: debateId });
    return !error;
  }
  try {
    if (debateId == null) localStorage.removeItem(LS(day));
    else localStorage.setItem(LS(day), String(debateId));
    return true;
  } catch { return false; }
}
