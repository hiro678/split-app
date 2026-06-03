// ─── データモデルの型定義（JSDoc / 軽量TypeScript） ────────────────
// 実行コードは無し。型注釈のみ。エディタの補完・型チェックに使う。

/** @typedef {"pro" | "con"} Stance */

/**
 * 返信（スレッド内の1発言）
 * @typedef {Object} Reply
 * @property {number} id
 * @property {string} author
 * @property {Stance} stance
 * @property {string} body
 * @property {number} score
 * @property {0|1} vote
 */

/**
 * ルートコメント（賛成 or 反対のスレッド起点）
 * @typedef {Object} CommentNode
 * @property {number} id
 * @property {string} author
 * @property {string} body
 * @property {number} score
 * @property {0|1} vote
 * @property {Reply[]} replies
 * @property {Stance} [stance] レンダリング時に注入される派生値
 */

/**
 * ディベート1件
 * @typedef {Object} Debate
 * @property {number} id
 * @property {string} topicId
 * @property {string} title
 * @property {string} description
 * @property {number} pro
 * @property {number} con
 * @property {"active"|"closed"} status
 * @property {number} deadline
 * @property {number} commentCount
 * @property {Date|number} createdAt
 * @property {string} author
 * @property {boolean} saved
 * @property {Stance|null} userStance
 * @property {string[]} tags
 * @property {string|null} thumbnail
 * @property {{pro:string[],con:string[]}|null} aiSummary
 * @property {Array<{t:number,pro:number,con:number,hour:number}>} history
 * @property {CommentNode[]} proComments
 * @property {CommentNode[]} conComments
 */

/**
 * ユーザープロフィール（Supabase profiles）
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} username
 * @property {boolean} is_admin
 */

export {};
