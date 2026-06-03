// アイコンの共有エクスポート。lucide-react を再エクスポートし、
// 行内アイコン Icn（currentColor 継承でテーマ追従）を提供する。
import type { CSSProperties } from "react";
export * from "lucide-react";

type IcnProps = {
  icon: any;
  size?: number;
  fill?: string;
  style?: CSSProperties;
  [key: string]: any;
};

export const Icn = ({ icon: I, size = 14, fill = "none", style, ...rest }: IcnProps) => (
  <I size={size} fill={fill} strokeWidth={2} style={{ flexShrink: 0, ...style }} {...rest} />
);
