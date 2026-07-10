// ─── Split View ロゴ ──────────────────────────────────────────────
//  コンセプト: 左右にずれた2枚のパネル＝「分割ビュー」×「すれ違う賛否」。
//  賛成の青・反対の赤はブランドの署名（STANCEと同色）。
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      {/* 賛成パネル（左・上寄り） */}
      <rect x="5" y="3" width="17.5" height="34" rx="7" fill="#1d4ed8" />
      {/* 反対パネル（右・下寄り） */}
      <rect x="25.5" y="11" width="17.5" height="34" rx="7" fill="#b91c1c" />
      {/* パネルの「発言」を示すハイライト行 */}
      <rect x="9.5" y="9" width="8.5" height="3.2" rx="1.6" fill="#ffffff" opacity="0.92" />
      <rect x="9.5" y="15" width="6" height="3.2" rx="1.6" fill="#ffffff" opacity="0.55" />
      <rect x="30" y="33" width="8.5" height="3.2" rx="1.6" fill="#ffffff" opacity="0.92" />
      <rect x="30" y="39" width="6" height="3.2" rx="1.6" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

// 単色にしたい場面（透かし等）用
export function LogoMono({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      <rect x="5" y="3" width="17.5" height="34" rx="7" fill={color} />
      <rect x="25.5" y="11" width="17.5" height="34" rx="7" fill={color} opacity="0.55" />
    </svg>
  );
}
