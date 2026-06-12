-- ════════════════════════════════════════════════════════════════
--  Split — Supabase スキーマ
--  Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
-- ════════════════════════════════════════════════════════════════

-- ── テーブル ──────────────────────────────────────────────────────
create table if not exists debates (
  id            bigint primary key,
  title         text not null,
  description   text,
  topic_id      text,
  author        text not null,
  status        text default 'active',
  deadline      bigint,
  created_at    bigint,
  pro           int  default 0,
  con           int  default 0,
  comment_count int  default 0,
  tags          text[] default '{}',
  thumbnail     text,
  ai_summary    jsonb,
  history       jsonb default '[]'
);

create table if not exists comments (
  id         bigint primary key,
  debate_id  bigint references debates(id) on delete cascade,
  stance     text not null,            -- 'pro' | 'con'
  author     text not null,
  text       text not null,
  score      int default 0,
  created_at bigint
);

create table if not exists replies (
  id         bigint primary key,
  comment_id bigint references comments(id) on delete cascade,
  stance     text,                     -- 'pro' | 'con' (返信ごとの立場)
  author     text not null,
  text       text not null,
  score      int default 0,
  created_at bigint
);
-- 手打ち計測（integrity）列。既存テーブルにも後付けで追加できる。
alter table debates  add column if not exists integrity jsonb;
alter table comments add column if not exists integrity jsonb;
alter table replies  add column if not exists integrity jsonb;

-- 既存テーブルに stance 列が無い場合の追加
alter table replies add column if not exists stance text;

create table if not exists reports (
  id         bigserial primary key,
  target     jsonb,
  reason     text,
  detail     text,
  status     text default 'open',      -- 'open' | 'resolved' | 'dismissed'
  created_at bigint
);

create table if not exists banned_users (
  author     text primary key,
  created_at timestamptz default now()
);

-- ── RPC: コメント数のインクリメント ───────────────────────────────
create or replace function increment_comment_count(d_id bigint)
returns void language sql as $$
  update debates set comment_count = comment_count + 1 where id = d_id;
$$;

-- ── RPC: いいねのトグル (delta = +1 / -1) ─────────────────────────
create or replace function toggle_like(tbl text, row_id bigint, delta int)
returns void language plpgsql as $$
begin
  if tbl = 'comments' then
    update comments set score = greatest(0, score + delta) where id = row_id;
  elsif tbl = 'replies' then
    update replies set score = greatest(0, score + delta) where id = row_id;
  end if;
end;
$$;

-- ── Row Level Security ────────────────────────────────────────────
-- テスト段階のため anon キーで読み書きを許可します。
-- 本番では認証 (auth.uid()) ベースのポリシーに置き換えてください。
alter table debates      enable row level security;
alter table comments     enable row level security;
alter table replies      enable row level security;
alter table reports      enable row level security;
alter table banned_users enable row level security;

do $$
declare t text;
begin
  foreach t in array array['debates','comments','replies','reports','banned_users'] loop
    execute format('drop policy if exists "anon_all" on %I;', t);
    execute format('create policy "anon_all" on %I for all using (true) with check (true);', t);
  end loop;
end $$;
