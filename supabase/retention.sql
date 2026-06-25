-- ════════════════════════════════════════════════════════════════
--  Split — リテンション機能スキーマ（#4 ストリーク / 活動ログ土台）
--  Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
--  ※ auth.users を参照するため、ログイン（profiles）導入済み前提。
-- ════════════════════════════════════════════════════════════════

-- ── 1日ごとの活動ログ（ストリーク・ミッション・週間リーグの共有土台）──
create table if not exists user_activity (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,                 -- ユーザー端末ローカルの日付
  votes    int  default 0,
  comments int  default 0,
  replies  int  default 0,
  debates  int  default 0,
  points   int  default 0,
  primary key (user_id, day)
);

-- ── ストリーク状態（連続記録の要約。日次活動から更新）──────────────
create table if not exists user_streaks (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  current     int default 0,              -- 現在の連続日数
  longest     int default 0,              -- 最長記録
  last_active date,                        -- 最後に活動した日（端末ローカル日付）
  freezes     int default 1,              -- ストリーク防御（1日の空きを救済）
  updated_at  timestamptz default now()
);

-- ── RPC: 活動を1件記録し、ストリークを更新して返す（原子的）──────────
--  p_kind: 'vote' | 'comment' | 'reply' | 'debate'
--  p_day : 端末ローカルの当日（朝の電車＝当日扱いにするためクライアント基準）
create or replace function record_activity(p_kind text, p_day date)
returns json language plpgsql security definer as $$
declare
  uid  uuid := auth.uid();
  s    user_streaks%rowtype;
  diff int;
  newcur  int;
  newlong int;
  newfreez int;
  inc  boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- 当日の活動カウントを加算（無ければ作成）
  insert into user_activity (user_id, day, votes, comments, replies, debates)
    values (uid, p_day,
      (p_kind = 'vote')::int, (p_kind = 'comment')::int,
      (p_kind = 'reply')::int, (p_kind = 'debate')::int)
    on conflict (user_id, day) do update set
      votes    = user_activity.votes    + (p_kind = 'vote')::int,
      comments = user_activity.comments + (p_kind = 'comment')::int,
      replies  = user_activity.replies  + (p_kind = 'reply')::int,
      debates  = user_activity.debates  + (p_kind = 'debate')::int;

  -- ストリーク更新
  select * into s from user_streaks where user_id = uid;
  if not found then
    insert into user_streaks (user_id, current, longest, last_active, freezes)
      values (uid, 1, 1, p_day, 1);
    newcur := 1; newlong := 1; newfreez := 1; inc := true;
  elsif s.last_active = p_day then
    newcur := s.current; newlong := s.longest; newfreez := s.freezes;  -- 当日2回目以降は据え置き
  else
    diff := p_day - s.last_active;
    newfreez := s.freezes;
    if diff = 1 then
      newcur := s.current + 1;
    elsif diff = 2 and s.freezes > 0 then
      newcur := s.current + 1; newfreez := s.freezes - 1;             -- 1日の空きを防御で救済
    else
      newcur := 1;                                                    -- 2日以上空き＝リセット
    end if;
    newlong := greatest(s.longest, newcur);
    inc := true;
    update user_streaks set current = newcur, longest = newlong,
      last_active = p_day, freezes = newfreez, updated_at = now()
      where user_id = uid;
  end if;

  return json_build_object('current', newcur, 'longest', newlong,
    'freezes', newfreez, 'incremented', inc, 'day', p_day);
end;
$$;

-- ── Row Level Security ────────────────────────────────────────────
--  読み取りは全員可（週間リーグ #5 で他者の集計を読むため）。
--  書き込みは本人のみ（活動記録は基本 RPC 経由。RPCは security definer）。
alter table user_activity enable row level security;
alter table user_streaks  enable row level security;

do $$
begin
  drop policy if exists "activity_read"  on user_activity;
  drop policy if exists "activity_write" on user_activity;
  create policy "activity_read"  on user_activity for select using (true);
  create policy "activity_write" on user_activity for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

  drop policy if exists "streaks_read"  on user_streaks;
  drop policy if exists "streaks_write" on user_streaks;
  create policy "streaks_read"  on user_streaks for select using (true);
  create policy "streaks_write" on user_streaks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
end $$;
