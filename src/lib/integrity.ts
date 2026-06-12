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
  cps: number;       // 文字/秒
  verdict: "ok" | "review"; // ok=手打ちらしい / review=要確認
};

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
  const ref = useRef({ keys: 0, pastes: 0, start: 0 });

  const onKeyDownCapture = (e: any) => {
    if (!ref.current.start) ref.current.start = Date.now();
    const k = e.key;
    // 文字キー・編集キー・IME確定(Process)を打鍵としてカウント（修飾キー等は除外）
    if (k && (k.length === 1 || k === "Backspace" || k === "Enter" || k === "Process" || k === " ")) {
      ref.current.keys++;
    }
  };

  const blockPaste = (e: any) => {
    e.preventDefault();
    ref.current.pastes++;
    notify?.("貼り付けは無効です（手打ちのみ）", "con");
  };
  const onDragOver = (e: any) => e.preventDefault();

  const bind = { onKeyDownCapture, onPaste: blockPaste, onDrop: blockPaste, onDragOver };

  const snapshot = (len: number): Integrity => {
    const s = ref.current;
    const ms = s.start ? Date.now() - s.start : 0;
    const cps = ms > 0 ? Math.round((len / (ms / 1000)) * 10) / 10 : 0;
    return { ms, len, keys: s.keys, pastes: s.pastes, cps, verdict: verdictOf({ len, keys: s.keys, pastes: s.pastes, cps }) };
  };

  const reset = () => { ref.current = { keys: 0, pastes: 0, start: 0 }; };

  return { bind, snapshot, reset };
}
