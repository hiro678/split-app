// アプリ全体で使う定数・スタンス定義
import {
  ThumbsUp, ThumbsDown, Medal, Award, Gem, Star, Crown, Leaf,
  Cpu, BookOpen, BarChart3, HeartPulse, Landmark, Clapperboard,
} from "lucide-react";

// ─── Topics (芸能・スポーツ追加) ──────────────────────────────────
export const TOPICS = [
  { id: "t1", name: "AI・テクノロジー", Icon: Cpu, members: "128k" },
  { id: "t2", name: "環境・気候変動", Icon: Leaf, members: "94k" },
  { id: "t3", name: "教育", Icon: BookOpen, members: "73k" },
  { id: "t4", name: "経済・金融", Icon: BarChart3, members: "61k" },
  { id: "t5", name: "医療・健康", Icon: HeartPulse, members: "55k" },
  { id: "t6", name: "政治・社会", Icon: Landmark, members: "49k" },
  { id: "t7", name: "芸能・スポーツ", Icon: Clapperboard, members: "82k" },
];

// ─── ランク（Lv.1→7 の昇格ラダー）────────────────────────────────
//  称号・アイコン・色を一貫して上昇させ、レベルアップ感を出す。
//  しきい値は序盤を細かく、上位ほど広く（昇格の達成感を維持）。
export const BADGES = [
  { id: "bronze",   tier: 1, label: "ブロンズ",   min: 0,    color: "#b45309", Icon: Medal },
  { id: "silver",   tier: 2, label: "シルバー",   min: 40,   color: "#94a3b8", Icon: Medal },
  { id: "gold",     tier: 3, label: "ゴールド",   min: 120,  color: "#eab308", Icon: Medal },
  { id: "platinum", tier: 4, label: "プラチナ",   min: 280,  color: "#22d3ee", Icon: Award },
  { id: "diamond",  tier: 5, label: "ダイヤ",     min: 600,  color: "#3b82f6", Icon: Gem },
  { id: "master",   tier: 6, label: "マスター",   min: 1200, color: "#a855f7", Icon: Star },
  { id: "legend",   tier: 7, label: "レジェンド", min: 2500, color: "#ef4444", Icon: Crown },
];

// 仮想ユーザーのレピュテーション
/** @type {Record<string, number>} */
export const USER_REP = {
  "economist_a": 423, "futurist_x": 156, "policy_z": 89, "academic_u": 612,
  "optimist_s": 45, "futurist_c": 287, "artist_r": 134, "dev_p": 38,
  "creative_d": 198, "realist_b": 1632, "worker_y": 67, "data_w": 712,
  "realist_t": 245, "data_v": 388, "worker_e": 102, "analyst_q": 521,
  "economist_f": 1845, "nuke_fan": 891, "engineer_g": 234, "engineer_g2": 156,
  "green_energy": 567, "safety_h": 412, "teacher_i": 178, "student_j": 89,
  "crypto_bull": 345, "economist_k": 1023, "parent_l": 267, "youth_m": 156,
  "tech_observer": 89, "energy_analyst": 567, "edu_reform": 234,
  "crypto_watcher": 123, "digital_rights": 456,
  "celeb_fan": 87, "sports_pro": 423, "balanced_t": 612, "fan_z": 134,
  "あなた": 12,
};

// ランク別の月間クォータ（badge.id をキーに）
/** @type {Record<string, { debates: number, comments: number }>} */
export const RANK_PERKS = {
  bronze:   { debates: 2,    comments: 10 },
  silver:   { debates: 4,    comments: 25 },
  gold:     { debates: 6,    comments: 40 },
  platinum: { debates: 10,   comments: 70 },
  diamond:  { debates: 18,   comments: 130 },
  master:   { debates: 35,   comments: 300 },
  legend:   { debates: 9999, comments: 9999 },
};

// ─── 通報理由 ─────────────────────────────────────────────────────
export const REPORT_REASONS = ["スパム・宣伝", "誹謗中傷・嫌がらせ", "虚偽・誤情報", "暴力的・不適切な内容", "その他"];

// ─── 管理者パスコード（ローカルモード用の暫定ガード） ─────────────
//  DB接続時は profiles.is_admin で判定。ローカルデモ時のみこのコードを使用。
export const ADMIN_PASSCODE = "split-admin";

// ─── ログイン必須アクション（DBモードのみ強制） ───────────────────
export const NEEDS_AUTH = new Set([
  "SET_STANCE", "ADD_COMMENT", "ADD_REPLY", "ADD_DEBATE", "LIKE", "SAVE", "REPORT",
]);

export const STANCE = {
  pro: { label: "賛成", color: "#1d4ed8", bg: "var(--pro-bg)", border: "#bfdbfe", bar: "#93c5fd", light: "var(--pro-light)", Icon: ThumbsUp },
  con: { label: "反対", color: "#b91c1c", bg: "var(--con-bg)", border: "#fecaca", bar: "#fca5a5", light: "var(--con-light)", Icon: ThumbsDown },
};
