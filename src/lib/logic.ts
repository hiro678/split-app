// @ts-check
// 純粋ロジック（集計・整形・reducer）
/** @typedef {import("../types").Debate} Debate */
/** @typedef {import("../types").CommentNode} CommentNode */
/** @typedef {import("../types").Reply} Reply */
import { BADGES, USER_REP, RANK_PERKS } from "../data/constants";

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
  return base + posts * 30 + comments * 10 + likes * 5;
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
    case "ADMIN_BAN": return { ...state,
      bannedUsers: state.bannedUsers.includes(action.author)
        ? state.bannedUsers.filter(u => u !== action.author)
        : [...state.bannedUsers, action.author] };
    case "ADMIN_RESOLVE_REPORT": return { ...state,
      reports: state.reports.map(r => r.id === action.id ? { ...r, status: action.status } : r) };
    default: return state;
  }
}
