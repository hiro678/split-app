// アイコンの共有エクスポート。lucide-react を再エクスポートし、
// 行内アイコン Icn（currentColor 継承でテーマ追従）を提供する。
export * from "lucide-react";

export const Icn = ({ icon: I, size = 14, fill = "none", style, ...rest }) => (
  <I size={size} fill={fill} strokeWidth={2} style={{ flexShrink: 0, ...style }} {...rest} />
);
