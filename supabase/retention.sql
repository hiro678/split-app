-- ════════════════════════════════════════════════════════════════
--  Split — リテンション機能スキーマ
--   #4 ストリーク / 活動ログ土台  ＋  #6 デイリーミッション
--  Supabase ダッシュボード → SQL Editor に貼り付けて実行してください。
--  再実行しても安全（create table if not exists / create or replace）。
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
  points   int  default 0,                -- ミッション等で得たボーナスXP（当日分）
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

-- ── RPC: 活動を1件記録し、ストリーク更新＋当日カウントを返す（原子的）──
--  p_kind: 'vote' | 'comment' | 'reply' | 'debate'
--  p_day : 端末ローカルの当日（朝の電車＝当日扱いにするためクライアント基準）
create or replace function record_activity(p_kind text, p_day date)
returns json language plpgsql security definer as $$
declare
  uid  uuid := auth.uid();
  s    user_streaks%rowtype;
  a    user_activity%rowtype;
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

  select * into a from user_activity where user_id = uid and day = p_day;

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

  return json_build_object(
    'current', newcur, 'longest', newlong, 'freezes', newfreez,
    'incremented', inc, 'day', p_day,
    'votes', a.votes, 'comments', a.comments, 'replies', a.replies,
    'debates', a.debates, 'bonus', a.points);
end;
$$;

-- ── RPC: デイリーミッション全達成ボーナスを当日に一度だけ付与 ────────
--  当日 points=0 のときだけ p_amount を加算（冪等。二重付与しない）。
create or replace function claim_daily_bonus(p_day date, p_amount int)
returns json language plpgsql security definer as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update user_activity set points = p_amount
    where user_id = uid and day = p_day and points = 0;
  get diagnostics n = row_count;
  return json_build_object('claimed', n > 0, 'amount', case when n > 0 then p_amount else 0 end);
end;
$$;

-- ── RPC: 自分の状態を取得（RLSの read-all を跨がず本人のみ）───────────
create or replace function my_streak()
returns json language sql security definer as $$
  select coalesce(
    (select json_build_object('current', current, 'longest', longest,
            'lastActive', last_active, 'freezes', freezes)
       from user_streaks where user_id = auth.uid()),
    json_build_object('current', 0, 'longest', 0, 'lastActive', null, 'freezes', 1));
$$;

create or replace function my_day(p_day date)
returns json language sql security definer as $$
  select coalesce(
    (select json_build_object('votes', votes, 'comments', comments,
            'replies', replies, 'debates', debates, 'bonus', points)
       from user_activity where user_id = auth.uid() and day = p_day),
    json_build_object('votes', 0, 'comments', 0, 'replies', 0, 'debates', 0, 'bonus', 0));
$$;

create or replace function my_bonus_total()
returns int language sql security definer as $$
  select coalesce((select sum(points) from user_activity where user_id = auth.uid()), 0)::int;
$$;

-- ── Row Level Security ────────────────────────────────────────────
--  読み取りは全員可（週間リーグ #5 で他者の集計を読むため）。
--  書き込みは本人のみ（活動記録は基本 RPC=security definer 経由）。
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

-- ════════════════════════════════════════════════════════════════
--  #2 今日の論題（デイリー1問）— 管理者の手動上書き（折衷案 C）
--   自動ピックはクライアント側（logic.pickDailyDebate）。
--   このテーブルは「その日だけ運営が指定した1問」を保存する。
-- ════════════════════════════════════════════════════════════════
create table if not exists daily_debate (
  day        date primary key,                                  -- 1日1問
  debate_id  bigint references debates(id) on delete cascade,
  set_by     uuid,
  set_at     timestamptz default now()
);

alter table daily_debate enable row level security;
do $$
begin
  drop policy if exists "daily_read"  on daily_debate;
  drop policy if exists "daily_write" on daily_debate;
  -- 読み取りは全員可（全ユーザーが同じ今日の論題を見る）
  create policy "daily_read"  on daily_debate for select using (true);
  -- 書き込みは管理者のみ（profiles.is_admin）
  create policy "daily_write" on daily_debate for all
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
    with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
end $$;

-- ════════════════════════════════════════════════════════════════
--  #1 予想バトル — 締切時点でどちらが多数派になるかを予想
--   報酬は predictions 側で独立管理（的中数で算出）。user_activity と非干渉。
-- ════════════════════════════════════════════════════════════════
create table if not exists predictions (
  user_id     uuid   not null references auth.users(id) on delete cascade,
  debate_id   bigint not null references debates(id) on delete cascade,
  side        text   not null check (side in ('pro','con')),
  resolved    boolean default false,
  correct     boolean,
  created_at  timestamptz default now(),
  resolved_at timestamptz,
  primary key (user_id, debate_id)
);

alter table predictions enable row level security;
do $$
begin
  drop policy if exists "pred_rw" on predictions;
  -- 自分の予想のみ読み書き可
  create policy "pred_rw" on predictions for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
end $$;

-- ── RPC: 予想する/変更する（決着後は変更不可）────────────────────
create or replace function set_prediction(p_debate_id bigint, p_side text)
returns json language plpgsql security definer as $$
declare uid uuid := auth.uid(); r predictions%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_side not in ('pro','con') then raise exception 'bad side'; end if;
  select * into r from predictions where user_id = uid and debate_id = p_debate_id;
  if found and r.resolved then return json_build_object('ok', false, 'reason', 'resolved'); end if;
  insert into predictions (user_id, debate_id, side) values (uid, p_debate_id, p_side)
    on conflict (user_id, debate_id) do update set side = excluded.side
    where not predictions.resolved;
  return json_build_object('ok', true, 'side', p_side);
end;
$$;

-- ── RPC: 予想を確定（勝者はサーバ側で debates から算出＝改ざん不可）──
create or replace function resolve_prediction(p_debate_id bigint)
returns json language plpgsql security definer as $$
declare
  uid uuid := auth.uid();
  r predictions%rowtype;
  d debates%rowtype;
  winner text;
  ok boolean;
  decided boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into r from predictions where user_id = uid and debate_id = p_debate_id;
  if not found or r.resolved then return json_build_object('resolved', false); end if;
  select * into d from debates where id = p_debate_id;
  if not found then return json_build_object('resolved', false); end if;
  decided := (d.status = 'closed')
    or (d.deadline is not null and d.deadline < (extract(epoch from now()) * 1000));
  if not decided then return json_build_object('resolved', false); end if;
  winner := case when coalesce(d.pro,0) >= coalesce(d.con,0) then 'pro' else 'con' end;
  ok := (r.side = winner);
  update predictions set resolved = true, correct = ok, resolved_at = now()
    where user_id = uid and debate_id = p_debate_id;
  return json_build_object('resolved', true, 'correct', ok, 'winner', winner);
end;
$$;
