// ─── アバター（フラットSVGイラスト） ─────────────────────────────
// 手描き風のシンプルなベクター。ランク(tier)で段階的に解放される。
import { Lock } from "./ui/Icn";

type AvProps = { size?: number };

// 男性
function AvMan({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#dbeafe" />
      <path d="M18 100c0-19 14-30 32-30s32 11 32 30z" fill="#2563eb" />
      <rect x="44" y="56" width="12" height="12" rx="5" fill="#f3c08b" />
      <circle cx="50" cy="44" r="20" fill="#f6c79a" />
      <path d="M30 44c0-16 9-24 20-24s20 8 20 24c-5-7-11-9-20-9s-15 2-20 9z" fill="#3f372f" />
      <circle cx="43" cy="45" r="2.3" fill="#2b2b2b" />
      <circle cx="57" cy="45" r="2.3" fill="#2b2b2b" />
      <path d="M45 53c3 3 7 3 10 0" stroke="#c98a5e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 女性
function AvWoman({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#ffe0ef" />
      <path d="M22 100c0-18 12-28 28-28s28 10 28 28z" fill="#ec4899" />
      <path d="M26 50c-3 12 0 24 4 30h40c4-6 7-18 4-30z" fill="#7b4a3a" />
      <circle cx="50" cy="46" r="20" fill="#f8cda0" />
      <path d="M28 46c0-17 10-25 22-25s22 8 22 25c-4-9-9-13-22-13S33 38 28 46z" fill="#7b4a3a" />
      <circle cx="43" cy="47" r="2.4" fill="#2b2b2b" />
      <circle cx="57" cy="47" r="2.4" fill="#2b2b2b" />
      <path d="M45 55c3 3 7 3 10 0" stroke="#d98aa0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="36" cy="52" r="3" fill="#f9a8c4" opacity="0.7" />
      <circle cx="64" cy="52" r="3" fill="#f9a8c4" opacity="0.7" />
    </svg>
  );
}

// 人間（中性的）
function AvNeutral({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#d9f2e6" />
      <path d="M20 100c0-19 13-29 30-29s30 10 30 29z" fill="#10b981" />
      <rect x="44" y="56" width="12" height="12" rx="5" fill="#edc39a" />
      <circle cx="50" cy="45" r="20" fill="#f0c89c" />
      <path d="M29 47c0-17 9-26 21-26s21 9 21 26c-4-6-7-12-21-12s-17 6-21 12z" fill="#5b4b40" />
      <circle cx="43" cy="46" r="2.3" fill="#2b2b2b" />
      <circle cx="57" cy="46" r="2.3" fill="#2b2b2b" />
      <path d="M46 54h8" stroke="#bf8a60" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 動物（ねこ）
function AvAnimal({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#fff0d6" />
      <path d="M24 36 30 16 46 30z" fill="#f59e0b" />
      <path d="M76 36 70 16 54 30z" fill="#f59e0b" />
      <path d="M27 32 31 22 40 30z" fill="#fbcfe8" />
      <path d="M73 32 69 22 60 30z" fill="#fbcfe8" />
      <circle cx="50" cy="52" r="28" fill="#f59e0b" />
      <circle cx="40" cy="48" r="3.4" fill="#3a2a12" />
      <circle cx="60" cy="48" r="3.4" fill="#3a2a12" />
      <path d="M47 58 50 61 53 58z" fill="#ef4444" />
      <path d="M50 61v4M50 65c-3 0-5-2-5-2M50 65c3 0 5-2 5-2" stroke="#7c4a12" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M22 54h12M22 60h12M66 54h12M66 60h12" stroke="#c98a3a" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// アンドロイド
function AvAndroid({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#e2e8f0" />
      <line x1="50" y1="22" x2="50" y2="13" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="11" r="4" fill="#38bdf8" />
      <rect x="26" y="26" width="48" height="44" rx="12" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2" />
      <rect x="33" y="38" width="34" height="18" rx="7" fill="#1e293b" />
      <circle cx="43" cy="47" r="4" fill="#38bdf8" />
      <circle cx="57" cy="47" r="4" fill="#38bdf8" />
      <path d="M40 86c0-9 5-14 10-14s10 5 10 14z" fill="#64748b" />
      <circle cx="28" cy="48" r="3" fill="#94a3b8" />
      <circle cx="72" cy="48" r="3" fill="#94a3b8" />
    </svg>
  );
}

// 宇宙人
function AvAlien({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#efe0ff" />
      <path d="M30 86c0-12 9-18 20-18s20 6 20 18z" fill="#86efac" />
      <ellipse cx="50" cy="44" rx="24" ry="28" fill="#86efac" />
      <path d="M50 16c14 0 22 12 22 26 0 4-1 8-2 11-3-16-10-25-20-25s-17 9-20 25c-1-3-2-7-2-11 0-14 8-26 22-26z" fill="#bbf7d0" />
      <ellipse cx="40" cy="46" rx="6" ry="9" fill="#0f172a" transform="rotate(20 40 46)" />
      <ellipse cx="60" cy="46" rx="6" ry="9" fill="#0f172a" transform="rotate(-20 60 46)" />
      <circle cx="42" cy="43" r="1.6" fill="#fff" />
      <circle cx="62" cy="43" r="1.6" fill="#fff" />
      <path d="M46 60h8" stroke="#3f8a52" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 動物（メカ）
function AvMech({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="#d6f5f0" />
      <path d="M24 38 28 18 46 32z" fill="#94a3b8" />
      <path d="M76 38 72 18 54 32z" fill="#94a3b8" />
      <path d="M27 33 30 23 40 31z" fill="#06b6d4" />
      <path d="M73 33 70 23 60 31z" fill="#06b6d4" />
      <rect x="24" y="34" width="52" height="40" rx="16" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2" />
      <rect x="34" y="44" width="13" height="9" rx="3" fill="#0e7490" />
      <rect x="53" y="44" width="13" height="9" rx="3" fill="#0e7490" />
      <circle cx="40.5" cy="48.5" r="2.4" fill="#22d3ee" />
      <circle cx="59.5" cy="48.5" r="2.4" fill="#22d3ee" />
      <rect x="44" y="60" width="12" height="5" rx="2.5" fill="#64748b" />
      <circle cx="50" cy="36" r="2.4" fill="#f59e0b" />
      <path d="M20 56h10M70 56h10" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Splitくん（サービスのマスコット：賛否を体現した二色キャラ）
function AvSplit({ size = 40 }: AvProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id="splitClip"><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      <g clipPath="url(#splitClip)">
        <rect x="0" y="0" width="50" height="100" fill="#93c5fd" />
        <rect x="50" y="0" width="50" height="100" fill="#fca5a5" />
        <circle cx="50" cy="50" r="26" fill="#ffffff" />
        <circle cx="41" cy="47" r="3.4" fill="#1e293b" />
        <circle cx="59" cy="47" r="3.4" fill="#1e293b" />
        <path d="M42 58c4 4 12 4 16 0" stroke="#1e293b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M33 41l5 2-5 2z" fill="#1d4ed8" />
        <path d="M67 41l-5 2 5 2z" fill="#b91c1c" />
      </g>
    </svg>
  );
}

export type AvatarDef = { id: string; name: string; unlockTier: number; Svg: (p: AvProps) => any };

// tier = 解放に必要なランク（Lv）。序盤3体は最初から、以降は昇格で解放。
export const AVATARS: AvatarDef[] = [
  { id: "man",     name: "男性",         unlockTier: 1, Svg: AvMan },
  { id: "woman",   name: "女性",         unlockTier: 1, Svg: AvWoman },
  { id: "neutral", name: "中性的",       unlockTier: 1, Svg: AvNeutral },
  { id: "animal",  name: "動物",         unlockTier: 2, Svg: AvAnimal },
  { id: "android", name: "アンドロイド", unlockTier: 3, Svg: AvAndroid },
  { id: "alien",   name: "宇宙人",       unlockTier: 4, Svg: AvAlien },
  { id: "mech",    name: "メカ動物",     unlockTier: 5, Svg: AvMech },
  { id: "split",   name: "Splitくん",    unlockTier: 6, Svg: AvSplit },
];

export const DEFAULT_AVATAR = "man";
export const avatarById = (id?: string | null) => AVATARS.find(a => a.id === id);

// 円形フレームでアバターを描画。未設定/未知IDは頭文字フォールバック。
export function Avatar({ id, size = 40, fallback }: { id?: string | null; size?: number; fallback?: string }) {
  // URL / データURI はアップロードされた写真として表示
  if (id && (/^https?:\/\//.test(id) || id.startsWith("data:image/"))) {
    return <img src={id} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block", background: "var(--surface-3)" }} />;
  }
  const a = avatarById(id);
  if (a) {
    const S = a.Svg;
    return <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, display: "block" }}><S size={size} /></div>;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#93c5fd,#fca5a5)", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.42, color: "var(--text-2)" }}>
      {fallback || "?"}
    </div>
  );
}

export { Lock };
