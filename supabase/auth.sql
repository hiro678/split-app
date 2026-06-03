-- ════════════════════════════════════════════════════════════════
--  Split — 認証（メール＋パスワード）用スキーマ
--  Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
--  併せて Authentication → Providers → Email を有効化し、
--  テスト段階では「Confirm email」を OFF にすると即ログインできます。
-- ════════════════════════════════════════════════════════════════

-- ── プロフィール（auth.users と 1:1） ────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  is_admin   boolean default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- 誰でも閲覧可（ユーザー名・バッジ表示のため）
drop policy if exists "profiles_read" on profiles;
create policy "profiles_read" on profiles for select using (true);

-- 自分のプロフィールのみ作成・更新可
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- ── サインアップ時に profiles を自動作成するトリガー ──────────────
--  username は signUp(options.data.username) から取得。無ければメール名。
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 管理者の付与（自分のアカウント作成後に実行） ──────────────────
--   update profiles set is_admin = true where username = 'あなたのユーザー名';
