// ─── #3+#7 通知センター（アプリ内・ベル）───────────────────────────
//  読み込み済みデータから通知を「その都度算出」する（プッシュ基盤は別フェーズ）。
//  種別: 反論/返信・いいね・締切間近・結果確定。
//  既読は通知IDの集合を localStorage に保持（型に依らず堅牢）。
import { isDecided } from "./logic";

export type NotifType = "reply" | "like" | "deadline" | "result";
export type Notif = { id: string; type: NotifType; debateId: number; text: string; ts: number };

const DAY = 24 * 3600 * 1000;
const trunc = (s: string, n = 18) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

// 全ディベートのコメント/返信をフラットに（自分の投稿検出用）
function bubblesOf(d: any): any[] {
  const out: any[] = [];
  for (const list of [d.proComments || [], d.conComments || []]) {
    for (const c of list) { out.push(c); for (const r of (c.replies || [])) out.push(r); }
  }
  return out;
}

/** 現在のデータから自分向け通知を算出（新しい順は呼び出し側でソート）。 */
export function buildNotifications(debates: any[], me: string | null, myPreds: Record<number, any>): Notif[] {
  if (!me) return [];
  const now = Date.now();
  const out: Notif[] = [];
  const participated = new Set<number>();

  for (const d of debates) {
    const bubbles = bubblesOf(d);
    if (bubbles.some(b => b.author === me) || myPreds[d.id]) participated.add(d.id);

    // 反論/返信: 自分のコメントに付いた他者の返信
    for (const list of [d.proComments || [], d.conComments || []]) {
      for (const c of list) {
        if (c.author !== me) continue;
        for (const r of (c.replies || [])) {
          if (r.author === me) continue;
          out.push({ id: `reply:${r.id}`, type: "reply", debateId: d.id,
            text: `@${r.author} があなたのコメントに反論`, ts: r.createdAt || now });
        }
      }
    }
    // いいね: 自分の投稿に付いたいいね（IDにscoreを含めるので増える度に未読化）
    for (const b of bubbles) {
      if (b.author === me && (b.score || 0) > 0) {
        out.push({ id: `like:${b.id}:${b.score}`, type: "like", debateId: d.id,
          text: `あなたの投稿に ❤️${b.score}`, ts: b.createdAt || now });
      }
    }
  }

  // 締切間近 / 結果確定（参加した議論のみ）
  for (const d of debates) {
    if (!participated.has(d.id)) continue;
    if (isDecided(d)) {
      const p = myPreds[d.id];
      const text = p && p.resolved
        ? `「${trunc(d.title)}」決着 — 予想${p.correct ? "的中🎯" : "は外れ"}`
        : `「${trunc(d.title)}」が決着しました`;
      out.push({ id: `result:${d.id}`, type: "result", debateId: d.id, text, ts: d.deadline || now });
    } else if (typeof d.deadline === "number" && d.deadline - now > 0 && d.deadline - now < DAY) {
      out.push({ id: `deadline:${d.id}`, type: "deadline", debateId: d.id,
        text: `「${trunc(d.title)}」がまもなく締切`, ts: d.deadline });
    }
  }
  return out;
}

// ─── 既読管理（localStorage・通知IDの集合）──────────────────────────
const SEEN = (user: string) => `split-notif-seen:${user}`;

export function getSeen(user: string | null): Set<string> {
  if (!user) return new Set();
  try { const raw = localStorage.getItem(SEEN(user)); if (raw) return new Set(JSON.parse(raw)); } catch { /* noop */ }
  return new Set();
}
export function markSeen(user: string | null, ids: string[]) {
  if (!user) return;
  const s = getSeen(user);
  for (const id of ids) s.add(id);
  const arr = [...s].slice(-500); // 上限で剪定
  try { localStorage.setItem(SEEN(user), JSON.stringify(arr)); } catch { /* noop */ }
}
export function unreadCount(user: string | null, notifs: Notif[]): number {
  if (!user) return 0;
  const s = getSeen(user);
  return notifs.filter(n => !s.has(n.id)).length;
}
