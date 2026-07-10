// @ts-check
// 純粋ロジック（集計・整形・reducer）
/** @typedef {import("../types").Debate} Debate */
/** @typedef {import("../types").CommentNode} CommentNode */
/** @typedef {import("../types").Reply} Reply */
import { BADGES, USER_REP, RANK_PERKS, POINTS } from "../data/constants";

/** @param {number} rep */
export const getBadge = (rep) => {
  return [...BADGES].reverse().find(b => rep >= b.min) || BADGES[0];
};

/** @param {string} author */
export const repOf = (author) => USER_REP[author] ?? 0;

// ─── Likes / 人気ユーザー ─────────────────────────────────────────
/** @param {Debate[]} debates @returns {(CommentNode | Reply)[]} */
export const allBubbles = (debates) => {
  const out: any[] = [];
  for (const d of debates) {
    for (const list of [d.proComments, d.conComments]) {
      for (const c of list) {
        out.push(c);
        for (const r of (c.replies || [])) out.push(r);
      }
    }
  }
  return out;
};

/** @param {string} author @param {Debate[]} debates @returns {number} */
export const likesReceived = (author, debates) =>
  allBubbles(debates).filter(b => b.author === author).reduce((s, b) => s + (b.score || 0), 0);

/** @param {Debate[]} debates @param {number} [limit] */
export const popularUsers = (debates, limit = 5) => {
  const map: Record<string, number> = {};
  for (const b of allBubbles(debates)) map[b.author] = (map[b.author] || 0) + (b.score || 0);
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([author, likes]) => ({ author, likes }));
};

// ─── ランク / モチベーション ──────────────────────────────────────
/** @param {Debate[]} debates @param {string|null} me */
export const myUsage = (debates, me) => ({
  posts: debates.filter(d => d.author === me).length,
  comments: allBubbles(debates).filter(b => b.author === me).length,
});

// 自分の rep は活動で動的に増える（投稿/コメント/被いいね）
/** @param {Debate[]} debates @param {string|null} me @returns {number} */
export const computeMyRep = (debates, me) => {
  if (!me) return 0;
  const base = USER_REP[me] ?? 0;
  const { posts, comments } = myUsage(debates, me);
  const likes = likesReceived(me, debates);
  return base + posts * POINTS.debate + comments * POINTS.comment + likes * POINTS.like;
};

// アクションで得られるスコア（+Nポップ用）
/** @param {string} type @returns {number} */
export const pointsForAction = (type) => {
  if (type === "ADD_DEBATE") return POINTS.debate;
  if (type === "ADD_COMMENT") return POINTS.comment;
  if (type === "ADD_REPLY") return POINTS.reply;
  return 0;
};

/** @param {number} rep */
export const perkOf = (rep) => RANK_PERKS[getBadge(rep).id];

/** @param {number} n 桁区切り（例: 4300 → "4,300"） */
export const fmt = (n) => {
  const num = Number(n);
  return Number.isFinite(num) ? Math.round(num).toLocaleString("en-US") : String(n);
};

/** @param {Date|number} d */
export const ago = d => {
  const s = Math.floor((Date.now()-Number(d))/1000);
  if (s<3600) return `${Math.floor(s/60)}分前`;
  if (s<86400) return `${Math.floor(s/3600)}時間前`;
  return `${Math.floor(s/86400)}日前`;
};

/** @param {number} deadline */
export const timeLeft = (deadline) => {
  const ms = deadline - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms/(24*3600*1000));
  const h = Math.floor((ms%(24*3600*1000))/(3600*1000));
  if (d > 0) return `あと${d}日${h}時間`;
  return `あと${h}時間`;
};

/** @param {number} pro @param {number} con */
export const pct = (pro, con) => {
  const total = pro + con || 1;
  return { proP: (pro/total*100).toFixed(1), conP: (con/total*100).toFixed(1) };
};

// ─── 人気のタグ（全ディベートのタグを頻度集計） ───────────────────
/** @param {Debate[]} debates @param {number} [limit] @returns {{tag:string,count:number}[]} */
export const popularTags = (debates, limit = 8) => {
  const map: Record<string, number> = {};
  for (const d of debates) for (const t of (d.tags || [])) if (t) map[t] = (map[t] || 0) + 1;
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
};

// ─── 立場ラベルの自動サジェスト ───────────────────────────────────
// タイトルの疑問形パターンから「賛成＝◯◯だ／反対＝◯◯ではない」を推定。
// パターン外は「そう思う／そう思わない」の汎用ラベルにフォールバック。
/** @param {string} title @returns {{ pro: string, con: string }} */
export const suggestStanceLabels = (title) => {
  const t = (title || "").trim().replace(/[？?]+$/, "");
  const rules: [RegExp, (m: RegExpMatchArray) => { pro: string; con: string }][] = [
    [/(妥当|適切|正当|公平|合法)か$/,        m => ({ pro: `${m[1]}だ`, con: `${m[1]}ではない` })],
    [/(?:は|が)(必要|不可欠)か$/,            m => ({ pro: `${m[1]}だ`, con: `${m[1]}ではない` })],
    [/(?:す|する)べきか$/,                  () => ({ pro: "すべきだ", con: "すべきではない" })],
    [/べきか$/,                             () => ({ pro: "そうすべきだ", con: "そうすべきではない" })],
    [/になるか$/,                           () => ({ pro: "なると思う", con: "ならないと思う" })],
    [/できるか$/,                           () => ({ pro: "できると思う", con: "できないと思う" })],
    [/(?:は|が)(.{1,8}の未来)か$/,          m => ({ pro: `${m[1]}だと思う`, con: `${m[1]}ではないと思う` })],
  ];
  for (const [re, fn] of rules) {
    const m = t.match(re);
    if (m) return fn(m);
  }
  return { pro: "そう思う", con: "そう思わない" };
};

// ─── 今日の論題（デイリー1問）─────────────────────────────────────
//  管理者指定(overrideId)があれば最優先。無ければ「勢いのある論題」上位から
//  日付シードで決定的に1問選ぶ（その日のうちは誰が見ても同じ・リロードでも不変）。
/** @param {Debate[]} debates @param {string} day @param {number|null} [overrideId] */
export const pickDailyDebate = (debates, day, overrideId = null) => {
  const open = debates.filter(d => d.status !== "closed");
  const list = open.length ? open : debates;
  if (!list.length) return null;
  if (overrideId != null) { const o = list.find(d => d.id === overrideId); if (o) return o; }
  const hot = [...list]
    .sort((a, b) => (b.pro + b.con + b.commentCount) - (a.pro + a.con + a.commentCount))
    .slice(0, Math.min(5, list.length));
  let seed = 7;
  for (const ch of String(day)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return hot[seed % hot.length];
};

// ─── 勝敗・予想の判定 ────────────────────────────────────────────
//  決着＝明示的にclosed、または締切(epoch ms)を過ぎている。
/** @param {Debate} d @param {number} [now] */
export const isDecided = (d, now = Date.now()) =>
  d.status === "closed" || (typeof d.deadline === "number" && d.deadline > 0 && d.deadline < now);
//  勝者側＝賛否の多数（同数は賛成扱い・稀）。
/** @param {Debate} d @returns {"pro"|"con"} */
export const winnerSide = (d) => ((d.pro || 0) >= (d.con || 0) ? "pro" : "con");

// ─── Related debates: 同じトピックから他のディベートを抽出 ───────
/** @param {Debate} current @param {Debate[]} all */
export const getRelated = (current, all) => {
  return all
    .filter(d => d.id !== current.id && d.topicId === current.topicId)
    .slice(0, 3);
};

// ─── Reducer ─────────────────────────────────────────────────────
export function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE": return { ...state, debates: action.debates };
    // DBに保存された自分の投票を復元（votes: debateId → "pro"|"con"）
    case "APPLY_VOTES": return { ...state, debates: state.debates.map(d =>
      action.votes[d.id] ? { ...d, userStance: action.votes[d.id] } : d) };
    case "SET_STANCE": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.id || d.status === "closed") return d;
      const prev = d.userStance, next = prev === action.stance ? null : action.stance;
      const adj = k => Math.max(0, d[k] + (next===k?1:0) + (prev===k?-1:0));
      return { ...d, userStance: next, pro: adj("pro"), con: adj("con") };
    })};
    case "SAVE": return { ...state, debates: state.debates.map(d => d.id===action.id ? {...d,saved:!d.saved} : d) };
    case "ADD_DEBATE": return { ...state, debates: [action.debate, ...state.debates] };
    case "ADD_COMMENT": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId || d.status === "closed") return d;
      const key = action.stance==="pro" ? "proComments" : "conComments";
      return { ...d, [key]: [...d[key], action.comment], commentCount: d.commentCount+1 };
    })};
    case "ADD_REPLY": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId || d.status === "closed") return d;
      const key = action.stance==="pro" ? "proComments" : "conComments";
      return { ...d,
        [key]: d[key].map(c => c.id===action.commentId ? {...c, replies:[...(c.replies||[]), action.reply]} : c),
        commentCount: d.commentCount+1 };
    })};
    case "LIKE": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId || d.status === "closed") return d;
      const key = action.stance === "pro" ? "proComments" : "conComments";
      const toggle = b => { const liked = b.vote === 1; return { ...b, vote: liked ? 0 : 1, score: Math.max(0, b.score + (liked ? -1 : 1)) }; };
      return { ...d, [key]: d[key].map(c => {
        if (c.id !== action.commentId) return c;
        if (action.replyId == null) return toggle(c);
        return { ...c, replies: (c.replies || []).map(r => r.id === action.replyId ? toggle(r) : r) };
      })};
    })};
    case "SET_SORT": return { ...state, sort: action.sort };
    case "SET_TOPIC": return { ...state, activeTopic: action.id, activeTag: null, activeDebate: null, activeUser: null, activeAdmin: false };
    case "SET_TAG": return { ...state, activeTag: action.tag, activeDebate: null, activeUser: null };
    case "SET_ACTIVE": return { ...state, activeDebate: action.debate, activeUser: null, activeAdmin: false };
    case "SET_USER": return { ...state, activeUser: action.author, activeDebate: null };
    case "TOGGLE_NEW": return { ...state, showNew: !state.showNew };
    case "SET_SEARCH": return { ...state, search: action.q };
    case "OPEN_REPORT": return { ...state, reportTarget: action.target };
    case "CLOSE_REPORT": return { ...state, reportTarget: null };
    case "REPORT": return { ...state,
      reports: [...state.reports, { id: Date.now(), target: action.target, reason: action.reason, detail: action.detail, status: "open", createdAt: Date.now() }],
      reportTarget: null };
    // ─── 管理者アクション ───
    case "SET_ADMIN": return { ...state, activeAdmin: action.on, activeDebate: null, activeUser: null };
    case "ADMIN_DELETE_DEBATE": return { ...state,
      debates: state.debates.filter(d => d.id !== action.id),
      activeDebate: state.activeDebate?.id === action.id ? null : state.activeDebate };
    case "ADMIN_DELETE_COMMENT": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId) return d;
      const key = action.stance === "pro" ? "proComments" : "conComments";
      if (action.replyId == null) {
        const target = d[key].find(c => c.id === action.commentId);
        const removed = 1 + (target?.replies?.length || 0);
        return { ...d, [key]: d[key].filter(c => c.id !== action.commentId), commentCount: Math.max(0, d.commentCount - removed) };
      }
      return { ...d, [key]: d[key].map(c => c.id === action.commentId
        ? { ...c, replies: (c.replies || []).filter(r => r.id !== action.replyId) } : c),
        commentCount: Math.max(0, d.commentCount - 1) };
    })};
    // 管理者のみ: 締切の変更（延長/短縮）。UIは管理者ダッシュボード限定
    case "ADMIN_SET_DEADLINE": return { ...state, debates: state.debates.map(d =>
      d.id === action.id ? { ...d, deadline: action.deadline } : d) };
    case "ADMIN_BAN": return { ...state,
      bannedUsers: state.bannedUsers.includes(action.author)
        ? state.bannedUsers.filter(u => u !== action.author)
        : [...state.bannedUsers, action.author] };
    case "ADMIN_RESOLVE_REPORT": return { ...state,
      reports: state.reports.map(r => r.id === action.id ? { ...r, status: action.status } : r) };
    default: return state;
  }
}
