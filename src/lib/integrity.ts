// ─── 手打ちガード（IME対応の打鍵計測＋ペースト無効化） ───────────
//  コンセプト「手打ち・AIなしの真剣勝負」のための一次計測。
//  ⚠️ 完全防止は不可能。これは抑止＋ベストエフォートの検出シグナル。
//  判定結果はユーザーには出さず、管理画面のみで参照する想定。
import { useRef } from "react";

export type Integrity = {
  ms: number;        // 作成にかかった時間(ミリ秒)
  len: number;       // 最終文字数
  keys: number;      // 打鍵数(おおよそ)
  pastes: number;    // 貼り付け/ドロップの試行回数(ブロック済み)
  urls?: number;     // 許可されたURL貼り付けの回数(出典用・ペナルティなし)
  cps: number;       // 文字/秒
  verdict: "ok" | "review"; // ok=手打ちらしい / review=要確認
};

// 「URL単体」だけ貼り付けを許可する（出典・ソース用）
const URL_ONLY_RE = /^https?:\/\/\S+$/i;

// 計測値から判定（IMEのローマ字入力は打鍵数 >= 文字数になるため、
// 文字数 >> 打鍵数 は「打たずに出現した(=貼付/自動入力)」の良い指標）
export function verdictOf(d: { len: number; keys: number; pastes: number; cps: number }): "ok" | "review" {
  if (d.pastes > 0) return "review";
  if (d.len > d.keys * 1.8 + 8) return "review";        // 打鍵に対して文字が多すぎ
  if (d.len >= 40 && d.cps > 18) return "review";        // 人間離れした速度
  return "ok";
}

/**
 * テキスト入力に手打ちガードを付ける。
 * 返り値の bind を textarea/input に spread し、submit時に snapshot() を保存、reset()。
 * @param notify 貼付試行時の最小通知（任意）
 */
export function useTypingGuard(notify?: (msg: string, kind?: string) => void) {
  const ref = useRef({ keys: 0, pastes: 0, urls: 0, urlChars: 0, start: 0 });

  const onKeyDownCapture = (e: any) => {
    if (!ref.current.start) ref.current.start = Date.now();
    const k = e.key;
    // 文字キー・編集キー・IME確定(Process)を打鍵としてカウント（修飾キー等は除外）
    if (k && (k.length === 1 || k === "Backspace" || k === "Enter" || k === "Process" || k === " ")) {
      ref.current.keys++;
    }
  };

  // 貼り付け: URL単体のみ許可（出典用）。それ以外はブロック。
  const onPaste = (e: any) => {
    const text = (e.clipboardData?.getData("text/plain") || "").trim();
    if (URL_ONLY_RE.test(text)) {
      // 許可。貼られた文字数ぶん打鍵数を補正し、手打ち判定（len vs keys）の誤爆を防ぐ
      if (!ref.current.start) ref.current.start = Date.now();
      ref.current.urlChars += text.length; // 判定時にこの分を文字数から除外する
      ref.current.urls++;
      notify?.("出典URLを貼り付けました", "info");
      return; // preventDefaultしない＝通常どおり挿入される
    }
    e.preventDefault();
    ref.current.pastes++;
    notify?.("貼り付けは無効です（手打ちのみ・出典URLのみ貼り付け可）", "con");
  };
  // ドロップは従来どおり全ブロック
  const blockDrop = (e: any) => {
    e.preventDefault();
    ref.current.pastes++;
    notify?.("貼り付けは無効です（手打ちのみ・出典URLのみ貼り付け可）", "con");
  };
  const onDragOver = (e: any) => e.preventDefault();

  const bind = { onKeyDownCapture, onPaste, onDrop: blockDrop, onDragOver };

  const snapshot = (len: number): Integrity => {
    const s = ref.current;
    const ms = s.start ? Date.now() - s.start : 0;
    // 判定用の文字数・速度はURL分を除外（貼り付け許可したURLで誤爆しないように）
    const lenAdj = Math.max(0, len - s.urlChars);
    const cps = ms > 0 ? Math.round((lenAdj / (ms / 1000)) * 10) / 10 : 0;
    return { ms, len, keys: s.keys, pastes: s.pastes, urls: s.urls, cps,
      verdict: verdictOf({ len: lenAdj, keys: s.keys, pastes: s.pastes, cps }) };
  };

  const reset = () => { ref.current = { keys: 0, pastes: 0, urls: 0, urlChars: 0, start: 0 }; };

  return { bind, snapshot, reset };
}
