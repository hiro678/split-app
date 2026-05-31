# Supabase 連携セットアップ手順

このアプリは **環境変数が未設定ならローカルモード**（アプリ内サンプルデータ）で動き、
**設定済みなら Supabase（DBモード）** で動く、ハイブリッド構成です。テスト段階の無料枠で十分動きます。

## 1. プロジェクトを作成
1. https://supabase.com にサインアップ（無料）
2. 「New project」でプロジェクトを作成（リージョンは Tokyo 推奨）
3. パスワードは控えておく

## 2. テーブルを作成
1. ダッシュボード左の **SQL Editor** を開く
2. リポジトリの `supabase/schema.sql` の中身を貼り付けて **Run**
3. テーブル（debates / comments / replies / reports / banned_users）と
   RPC（increment_comment_count / toggle_like）が作成されます

## 3. 接続キーを設定
1. **Project Settings → API** で以下をコピー
   - `Project URL`
   - `anon public` キー
2. プロジェクト直下の `.env.example` を `.env.local` にコピー
3. 値を貼り付け：
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbG...
   ```

## 4. 起動
```
npm run dev
```
ヘッダーのバッジが **🟢 DB接続** になれば成功です。
（⚪ ローカル＝未設定 / ⏳ 接続中 / 🔴 接続失敗）

## 動作の仕組み
- 起動時に `debates` を DB から読み込み（0件なら空で開始）
- ディベート作成・コメント・返信・いいね・通報・管理操作は
  reducer で即時反映（楽観的更新）しつつ、裏で DB に書き込みます
- 書き込みに失敗してもアプリは止まらず、コンソールに警告を出します

## 注意（テスト段階の RLS）
`schema.sql` は anon キーで読み書きを許可するポリシーを付けています。
**公開する前に**、Supabase Auth を導入し `auth.uid()` ベースのポリシーへ
置き換えてください（特に通報・管理者操作・BAN）。
