// ─── P2-10: アバター画像の前処理 ──────────────────────────────────
//  アップロード前にクライアント側で 256×256 の正方形（中央クロップ）に
//  縮小し JPEG 化する。転送量と表示崩れを防ぐ。
export const AVATAR_MAX_INPUT = 8 * 1024 * 1024; // 入力上限 8MB

export function fileToAvatarBlob(file: File, px = 256): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("画像ファイルを選択してください")); return; }
    if (file.size > AVATAR_MAX_INPUT) { reject(new Error("画像は8MB以下にしてください")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2; // 中央の正方形を切り出し
      const canvas = document.createElement("canvas");
      canvas.width = px; canvas.height = px;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("画像を処理できませんでした")); return; }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, px, px);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("画像を変換できませんでした")), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
    img.src = url;
  });
}

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("画像を読み込めませんでした"));
    r.readAsDataURL(blob);
  });
