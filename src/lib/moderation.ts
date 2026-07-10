// ─── ユーザー名のモデレーション ───────────────────────────────────
// 登録時に不適切なユーザー名を弾く。リストは随時追記して運用する。
// ※ これはクライアント側の一次フィルタ。本番ではサーバ側（DBトリガー等）
//   や専用モデレーションサービスとの併用を推奨。

// なりすまし・運営詐称を防ぐ予約語（完全一致で禁止）
const RESERVED = [
  "admin", "administrator", "root", "system", "official", "support",
  "staff", "mod", "moderator", "split", "splitofficial", "team",
  "anonymous", "null", "undefined", "guest", "me", "you", "user",
  "あなた",
];

// 不適切語（正規化後に部分一致で禁止）。誤検知しにくい強い語を中心に。
const BANNED = [
  "fuck", "fck", "fack", "phuck", "shit", "bitch", "biatch", "cunt",
  "asshole", "bastard", "dipshit",
  "motherfuck", "wanker", "jackass", "dick", "cock", "pussy", "slut",
  "whore", "porn", "anal", "jizz", "cum", "boobs", "blowjob", "handjob",
  "nigger", "nigga", "faggot", "retard", "kike", "spic", "chink",
  "coon", "gook", "tranny", "rape", "rapist", "pedo", "pedophile",
  "nazi", "hitler", "isis",
];

// リート文字を通常文字へ正規化（f4ck / sh1t / @ss などを検出）
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

const normalize = (s: string) =>
  s.toLowerCase().replace(/[0134578@$!]/g, c => LEET[c] ?? c).replace(/_/g, "");

/**
 * ユーザー名を検証。問題があればエラーメッセージ、なければ null を返す。
 * @param {string} name
 * @returns {string | null}
 */
export function validateUsername(name: string): string | null {
  const n = (name || "").trim();
  if (n.length < 3) return "ユーザー名は3文字以上にしてください";
  if (n.length > 20) return "ユーザー名は20文字以内にしてください";
  if (/[^\x00-\x7F]/.test(n)) return "ユーザー名に日本語（全角文字）は使えません。半角英数字と _ で入力してください";
  if (!/^[A-Za-z0-9_]+$/.test(n)) return "ユーザー名に使えるのは半角英数字と _ のみです";
  if (!/^[A-Za-z]/.test(n)) return "ユーザー名は英字で始めてください";

  const low = n.toLowerCase();
  if (RESERVED.includes(low)) return "そのユーザー名は使用できません";

  const norm = normalize(n);
  if (RESERVED.includes(norm)) return "そのユーザー名は使用できません";
  if (BANNED.some(w => norm.includes(w))) return "ユーザー名に不適切な語が含まれています";

  return null;
}

// ─── 表示名（日本語OK）のモデレーション ────────────────────────────
// 日本語の不適切語（部分一致で禁止）。強い語のみ・随時追記して運用。
const JP_BANNED = [
  "死ね", "殺す", "殺せ", "しね", "ころす", "レイプ", "強姦",
  "セックス", "ちんこ", "まんこ", "うんこ野郎", "きちがい", "気違い",
  "在日死", "劣等民族", "皆殺",
];
// なりすまし防止（表示名の完全一致・空白除去後）
const JP_RESERVED = ["運営", "管理者", "公式", "スプリット公式", "split公式", "サポート"];

/**
 * 表示名を検証。問題があればエラーメッセージ、なければ null を返す。
 * ユーザー名(@ハンドル)と違い日本語・絵文字も可。1〜20文字。
 */
export function validateDisplayName(name: string): string | null {
  const n = (name || "").trim();
  if (!n) return null; // 空は「未設定」として許可（@ハンドル表示に戻る）
  if (n.length > 20) return "表示名は20文字以内にしてください";
  if (/[\n\r\t]/.test(n)) return "表示名に改行やタブは使えません";
  if (/https?:\/\//i.test(n)) return "表示名にURLは使えません";
  if (/^@/.test(n)) return "表示名を @ で始めることはできません（ハンドルと紛らわしいため）";

  const compact = n.replace(/\s/g, "");
  if (JP_RESERVED.includes(compact)) return "その表示名は使用できません";
  if (RESERVED.includes(compact.toLowerCase())) return "その表示名は使用できません";
  if (JP_BANNED.some(w => compact.includes(w))) return "表示名に不適切な語が含まれています";
  const norm = normalize(compact);
  if (BANNED.some(w => norm.includes(w))) return "表示名に不適切な語が含まれています";

  return null;
}
