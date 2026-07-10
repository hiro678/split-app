// ─── P3-12: カラーテーマ（Slack風に複数から選択）──────────────────
//  id は <html data-theme="..."> と localStorage "split-theme" に入る値。
//  "light"(ペーパー) と "dark"(インク) は従来からの既定テーマ（後方互換）。
//  実際の配色は App.tsx の <style> 内 CSS 変数ブロックで定義する。
export type ThemeDef = {
  id: string;
  label: string;
  kind: "light" | "dark";
  // マイページのテーマ選択スウォッチ用のプレビュー色
  preview: { bg: string; surface: string; text: string };
};

export const THEMES: ThemeDef[] = [
  { id: "light",    label: "ペーパー",   kind: "light", preview: { bg: "#f4f0e7", surface: "#fcfaf4", text: "#1c1917" } },
  { id: "snow",     label: "スノー",     kind: "light", preview: { bg: "#f1f4f7", surface: "#ffffff", text: "#16181d" } },
  { id: "sakura",   label: "サクラ",     kind: "light", preview: { bg: "#f9eef1", surface: "#fdf7f8", text: "#291b20" } },
  { id: "dark",     label: "インク",     kind: "dark",  preview: { bg: "#17140e", surface: "#211d15", text: "#efe9da" } },
  { id: "midnight", label: "ミッドナイト", kind: "dark", preview: { bg: "#0e1420", surface: "#161e2e", text: "#e6ecf7" } },
  { id: "forest",   label: "フォレスト", kind: "dark",  preview: { bg: "#11170f", surface: "#1a2317", text: "#e9efe4" } },
];

export const themeById = (id: string | null | undefined): ThemeDef =>
  THEMES.find(t => t.id === id) || THEMES[0];
