// ─── Supabase 接続レイヤー ──────────────────────────────────────────
// 環境変数 (.env.local) に下記を設定すると DB モードで起動します。
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
// 未設定の場合はローカルモード (アプリ内のサンプルデータ) で動作します。
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;

// ─── 認証（メール＋パスワード） ─────────────────────────────────────
// username は user_metadata に格納し、DB トリガー handle_new_user が
// profiles 行を自動作成します（supabase/auth.sql 参照）。
export async function signUp(email, password, username) {
  if (!supabase) return { error: { message: "DB未接続" } };
  return supabase.auth.signUp({ email, password, options: { data: { username } } });
}
export async function signIn(email, password) {
  if (!supabase) return { error: { message: "DB未接続" } };
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
// アバター（profiles.avatar）を更新
export async function updateAvatar(userId, avatar) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from("profiles").update({ avatar }).eq("id", userId);
  if (error) console.error("[supabase] updateAvatar", error);
}

// プロフィール（username / is_admin / avatar）を取得
// 自分の投票一覧（debateId → stance）。リロード/別端末でも投票済みを復元する。
export async function fetchMyVotes(): Promise<Record<number, "pro" | "con">> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc("my_votes");
  if (error) { console.error("[supabase] my_votes", error); return {}; }
  return Object.fromEntries((data || []).map((r) => [r.debate_id, r.stance]));
}

export async function fetchProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) { console.error("[supabase] fetchProfile", error); return null; }
  return data;
}

// ─── 読み込み: ネスト構造 (debates → comments → replies) を復元 ───
export async function fetchDebates() {
  if (!supabase) return null;
  const [{ data: debates, error: dErr }, { data: comments }, { data: replies }] = await Promise.all([
    supabase.from("debates").select("*").order("created_at", { ascending: false }),
    supabase.from("comments").select("*"),
    supabase.from("replies").select("*"),
  ]);
  if (dErr) { console.error("[supabase] fetchDebates", dErr); return null; }

  const repliesByComment: Record<string, any[]> = {};
  for (const r of replies || []) {
    (repliesByComment[r.comment_id] ||= []).push({
      id: r.id, author: r.author, body: r.text, stance: r.stance || "pro", score: r.score || 0, vote: 0, integrity: r.integrity || null,
    });
  }
  for (const arr of Object.values(repliesByComment)) arr.sort((a, b) => a.id - b.id);
  const proByDebate: Record<string, any[]> = {}, conByDebate: Record<string, any[]> = {};
  for (const c of comments || []) {
    const node = {
      id: c.id, author: c.author, body: c.text, score: c.score || 0, vote: 0, integrity: c.integrity || null,
      replies: repliesByComment[c.id] || [],
    };
    (c.stance === "pro" ? (proByDebate[c.debate_id] ||= []) : (conByDebate[c.debate_id] ||= [])).push(node);
  }
  for (const arr of [...Object.values(proByDebate), ...Object.values(conByDebate)]) arr.sort((a, b) => a.id - b.id);
  return (debates || []).map(d => ({
    id: d.id, title: d.title, description: d.description, topicId: d.topic_id, author: d.author,
    status: d.status, deadline: d.deadline, createdAt: d.created_at, pro: d.pro, con: d.con,
    commentCount: d.comment_count, tags: d.tags || [], thumbnail: d.thumbnail || null,
    aiSummary: d.ai_summary || null, history: d.history || [], integrity: d.integrity || null,
    proLabel: d.pro_label || null, conLabel: d.con_label || null,
    userStance: null, saved: false,
    proComments: proByDebate[d.id] || [], conComments: conByDebate[d.id] || [],
  }));
}

// ─── 書き込み: reducer のアクションを DB へミラーリング ───
// 失敗してもアプリは落とさず警告のみ (楽観的更新は reducer 側で完了済み)。
const warn = (label) => (err) => { if (err) console.error(`[supabase] ${label}`, err); };

// createdAt が Date でも数値でも bigint(ミリ秒) に正規化
const toMs = (v) => (v == null ? Date.now() : Number(new Date(v)));

const debateRow = (d) => ({
  id: d.id, title: d.title, description: d.description, topic_id: d.topicId, author: d.author,
  status: d.status, deadline: toMs(d.deadline), created_at: toMs(d.createdAt), pro: d.pro, con: d.con,
  comment_count: d.commentCount, tags: d.tags || [], thumbnail: d.thumbnail || null,
  ai_summary: d.aiSummary || null, history: d.history || [], integrity: d.integrity || null,
  pro_label: d.proLabel || null, con_label: d.conLabel || null,
});

// ─── シード: アプリ内サンプルデータを一括投入 (空のDB初期化用) ───
export async function seedDebates(debates) {
  if (!supabase) return false;
  const comments = [], replies = [];
  for (const d of debates) {
    for (const [stance, list] of [["pro", d.proComments], ["con", d.conComments]]) {
      for (const c of list || []) {
        comments.push({ id: c.id, debate_id: d.id, stance, author: c.author, text: c.body, score: c.score || 0, created_at: c.id });
        for (const r of c.replies || []) {
          replies.push({ id: r.id, comment_id: c.id, stance: r.stance || stance, author: r.author, text: r.body, score: r.score || 0, created_at: r.id });
        }
      }
    }
  }
  const { error: e1 } = await supabase.from("debates").upsert(debates.map(debateRow));
  if (e1) { console.error("[supabase] seed debates", e1); return false; }
  const { error: e2 } = await supabase.from("comments").upsert(comments);
  if (e2) { console.error("[supabase] seed comments", e2); return false; }
  const { error: e3 } = await supabase.from("replies").upsert(replies);
  if (e3) { console.error("[supabase] seed replies", e3); return false; }
  return true;
}

export async function syncAction(action) {
  if (!supabase) return;
  try {
    switch (action.type) {
      case "ADD_DEBATE": {
        await supabase.from("debates").insert(debateRow(action.debate))
          .then(({ error }) => warn("ADD_DEBATE")(error));
        break;
      }
      case "ADD_COMMENT": {
        const c = action.comment;
        await supabase.from("comments").insert({
          id: c.id, debate_id: action.debateId, stance: action.stance,
          author: c.author, text: c.body, score: c.score || 0, created_at: c.id, integrity: c.integrity || null,
        }).then(({ error }) => warn("ADD_COMMENT")(error));
        await supabase.rpc("increment_comment_count", { d_id: action.debateId }).then(({ error }) => warn("inc_cc")(error));
        break;
      }
      case "ADD_REPLY": {
        const r = action.reply;
        await supabase.from("replies").insert({
          id: r.id, comment_id: action.commentId, stance: r.stance,
          author: r.author, text: r.body, score: r.score || 0, created_at: r.id, integrity: r.integrity || null,
        }).then(({ error }) => warn("ADD_REPLY")(error));
        await supabase.rpc("increment_comment_count", { d_id: action.debateId }).then(({ error }) => warn("inc_cc")(error));
        break;
      }
      case "SET_STANCE": {
        // 投票はサーバ側RPCで1ユーザー1票を保証（トグル/切替/取消もサーバが判定）
        await supabase.rpc("cast_vote", { p_debate_id: action.id, p_stance: action.stance })
          .then(({ data, error }) => {
            warn("SET_STANCE")(error);
            if (!error && data && data.ok === false) console.warn("[supabase] cast_vote rejected:", data.reason);
          });
        break;
      }
      case "LIKE": {
        const table = action.replyId != null ? "replies" : "comments";
        const id = action.replyId ?? action.commentId;
        await supabase.rpc("toggle_like", { tbl: table, row_id: id, delta: action.delta ?? 1 })
          .then(({ error }) => warn("LIKE")(error));
        break;
      }
      case "REPORT": {
        await supabase.from("reports").insert({
          target: action.target, reason: action.reason, detail: action.detail, status: "open", created_at: Date.now(),
        }).then(({ error }) => warn("REPORT")(error));
        break;
      }
      case "ADMIN_DELETE_DEBATE": {
        await supabase.from("debates").delete().eq("id", action.id).then(({ error }) => warn("DEL_DEBATE")(error));
        break;
      }
      case "ADMIN_DELETE_COMMENT": {
        if (action.replyId != null) {
          await supabase.from("replies").delete().eq("id", action.replyId).then(({ error }) => warn("DEL_REPLY")(error));
        } else {
          await supabase.from("comments").delete().eq("id", action.commentId).then(({ error }) => warn("DEL_COMMENT")(error));
        }
        break;
      }
      case "ADMIN_BAN": {
        // トグル: 既存なら削除、無ければ追加
        const { data } = await supabase.from("banned_users").select("author").eq("author", action.author);
        if (data && data.length) await supabase.from("banned_users").delete().eq("author", action.author);
        else await supabase.from("banned_users").insert({ author: action.author });
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error("[supabase] syncAction failed", e);
  }
}
