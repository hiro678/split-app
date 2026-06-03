// ─── デザイントークン & 共有スタイル ──────────────────────────────
// 余白・角丸・フォントサイズの基準値。新規スタイルはここを参照すると統一しやすい。
import type { CSSProperties } from "react";
import { STANCE } from "./data/constants";

export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 8, lg: 12, xl: 14, pill: 99 },
  font: { xs: 11, sm: 12, md: 13, base: 14, lg: 16, xl: 18, xxl: 22 },
  weight: { normal: 400, medium: 600, bold: 700, heavy: 800 },
};

// ─── 共有スタイルオブジェクト ─────────────────────────────────────
export const btnPrimary: CSSProperties = { background: STANCE.pro.color, color: "#fff", border: "none", borderRadius: 99, padding: "9px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
export const btnGhost: CSSProperties = { background: "none", border: "1.5px solid var(--border)", borderRadius: 99, padding: "9px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", color: "var(--text-2)", fontFamily: "inherit" };
export const cActBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-4)", fontWeight: 600, padding: "3px 7px", borderRadius: 6, fontFamily: "inherit" };
export const labelStyle: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-2)", marginBottom: 6 };
export const menuItem: CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-2)", fontFamily: "inherit" };
export const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", background: "var(--surface-2)", color: "var(--text)" };
export const replyBtn: CSSProperties = { background: "var(--surface)", border: "1.5px solid", borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
