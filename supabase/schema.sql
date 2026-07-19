-- ============================================================================
-- CARD VAULT — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- Assumes the built-in `auth.users` table (Supabase Auth) already exists.
-- ============================================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";

-- ============================================================================
-- CATALOG TABLES (admin-managed, publicly readable)
-- ============================================================================

create table if not exists series (
  id text primary key,
  name text not null,
  icon text not null default '🎴',
  accent text not null default '#a78bfa',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id text primary key,
  series_id text not null references series(id) on delete cascade,
  name text not null,
  rarity text not null check (rarity in ('common','uncommon','rare','epic','legendary','mythic')),
  image_url text not null default '',
  flavor text not null default '',
  earn_rate numeric not null default 0.1,   -- coins/sec generated per copy owned, before multipliers
  cap_hours numeric not null default 8,     -- max hours of production a card can hold before it must be collected
  created_at timestamptz not null default now()
);
create index if not exists idx_cards_series on cards(series_id);

create table if not exists packs (
  id text primary key,
  name text not null,
  icon text not null default '📦',
  cost numeric not null default 100,
  pull_count int not null default 3,
  series_filter text references series(id) on delete set null,
  accent text not null default '#a78bfa',
  weights jsonb not null default '{"common":50,"uncommon":30,"rare":14,"epic":5,"legendary":1,"mythic":0}',
  created_at timestamptz not null default now()
);

create table if not exists upgrades (
  id text primary key,
  name text not null,
  description text not null default '',
  category text not null check (category in ('auto_collect','multiplier','capacity','luck','offline')),
  base_cost_gems numeric not null default 10,
  cost_growth numeric not null default 1.6,
  effect_value numeric not null default 0.1, -- meaning depends on category, see README
  max_level int not null default 10,
  sort_order int not null default 0
);

create table if not exists achievements (
  id text primary key,
  name text not null,
  description text not null default '',
  condition_type text not null check (condition_type in ('unique_cards','total_coins_earned','packs_opened','collection_pct')),
  condition_value numeric not null,
  gem_reward numeric not null default 10,
  title text -- profile title unlocked, null if none
);

create table if not exists quest_templates (
  id text primary key,
  description text not null,
  quest_type text not null check (quest_type in ('open_packs','collect_coins','collect_clicks')),
  target_value numeric not null,
  coin_reward numeric not null default 0,
  gem_reward numeric not null default 0,
  weight numeric not null default 1 -- higher weight = more likely to be picked for a given day
);

-- ============================================================================
-- PLAYER TABLES (private to each user)
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  bio text not null default '',
  banner_color text not null default '#a78bfa',
  avatar_card_id text references cards(id) on delete set null,
  favorite_card_ids text[] not null default '{}',
  is_admin boolean not null default false,
  is_guest boolean not null default true,
  level int not null default 1,
  xp numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists player_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins numeric not null default 500,
  gems numeric not null default 20,
  total_coins_earned numeric not null default 0,
  packs_opened int not null default 0,
  login_streak int not null default 0,
  last_login date not null default '1970-01-01',
  updated_at timestamptz not null default now()
);

create table if not exists player_cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references cards(id) on delete cascade,
  count int not null default 0,
  last_tick timestamptz not null default now(),
  total_generated numeric not null default 0, -- lifetime coins this specific card has generated (for "flex" display)
  primary key (user_id, card_id)
);

create table if not exists player_upgrades (
  user_id uuid not null references auth.users(id) on delete cascade,
  upgrade_id text not null references upgrades(id) on delete cascade,
  level int not null default 0,
  primary key (user_id, upgrade_id)
);

create table if not exists player_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists player_daily_quests (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_date date not null,
  template_id text not null references quest_templates(id) on delete cascade,
  description text not null,      -- snapshotted at assignment time so admin edits don't retroactively change active quests
  quest_type text not null,
  progress numeric not null default 0,
  target numeric not null,
  coin_reward numeric not null default 0,
  gem_reward numeric not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  primary key (user_id, quest_date, template_id)
);
create index if not exists idx_player_daily_quests_today on player_daily_quests(user_id, quest_date);

create table if not exists pull_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  card_id text not null,
  rarity text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pull_history_user on pull_history(user_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table series enable row level security;
alter table cards enable row level security;
alter table packs enable row level security;
alter table upgrades enable row level security;
alter table achievements enable row level security;
alter table quest_templates enable row level security;
alter table player_daily_quests enable row level security;
alter table profiles enable row level security;
alter table player_state enable row level security;
alter table player_cards enable row level security;
alter table player_upgrades enable row level security;
alter table player_achievements enable row level security;
alter table pull_history enable row level security;

-- helper: is the current user an admin?
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- catalog: public read, admin write
create policy "series read all" on series for select using (true);
create policy "series admin write" on series for all using (is_admin()) with check (is_admin());

create policy "cards read all" on cards for select using (true);
create policy "cards admin write" on cards for all using (is_admin()) with check (is_admin());

create policy "packs read all" on packs for select using (true);
create policy "packs admin write" on packs for all using (is_admin()) with check (is_admin());

create policy "upgrades read all" on upgrades for select using (true);
create policy "upgrades admin write" on upgrades for all using (is_admin()) with check (is_admin());

create policy "achievements read all" on achievements for select using (true);
create policy "achievements admin write" on achievements for all using (is_admin()) with check (is_admin());

create policy "quest_templates read all" on quest_templates for select using (true);
create policy "quest_templates admin write" on quest_templates for all using (is_admin()) with check (is_admin());

create policy "player_daily_quests select own" on player_daily_quests for select using (auth.uid() = user_id);

-- profiles: readable by anyone (needed for showcase/leaderboard-style views), writable only by owner
create policy "profiles read all" on profiles for select using (true);
create policy "profiles insert own" on profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- player-private tables: owner only, no direct client writes to currency (handled by functions below)
create policy "player_state select own" on player_state for select using (auth.uid() = user_id);
create policy "player_cards select own" on player_cards for select using (auth.uid() = user_id);
create policy "player_upgrades select own" on player_upgrades for select using (auth.uid() = user_id);
create policy "player_achievements select own" on player_achievements for select using (auth.uid() = user_id);
create policy "pull_history select own" on pull_history for select using (auth.uid() = user_id);

-- ============================================================================
-- NEW USER BOOTSTRAP
-- ============================================================================

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, username, is_guest)
    values (new.id, 'Player' || substr(new.id::text, 1, 6), coalesce(new.is_anonymous, false));
  insert into player_state (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- GAME LOGIC FUNCTIONS (SECURITY DEFINER — the only way currency/cards change)
-- ============================================================================

-- Assigns today's 3 quests to the player if they don't have any yet. Safe to call every time the app loads.
create or replace function ensure_daily_quests() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_count int;
  t record;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select count(*) into v_count from player_daily_quests where user_id = v_user and quest_date = current_date;
  if v_count > 0 then return; end if;

  for t in
    select * from quest_templates order by random() * greatest(weight, 0.01) desc limit 3
  loop
    insert into player_daily_quests (user_id, quest_date, template_id, description, quest_type, progress, target, coin_reward, gem_reward)
    values (v_user, current_date, t.id, t.description, t.quest_type, 0, t.target_value, t.coin_reward, t.gem_reward)
    on conflict do nothing;
  end loop;
end;
$$;

-- Adds progress toward any of today's in-progress quests matching p_type. Called internally by
-- open_pack / collect_card / collect_all — never exposed directly to the client.
create or replace function increment_quest_progress(p_user uuid, p_type text, p_amount numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_amount <= 0 then return; end if;
  update player_daily_quests
    set progress = least(target, progress + p_amount),
        completed = (progress + p_amount) >= target
    where user_id = p_user and quest_date = current_date and quest_type = p_type and not completed;
end;
$$;

-- Claims the coin/gem reward for a completed, unclaimed quest.
create or replace function claim_quest_reward(p_template_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  q player_daily_quests%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into q from player_daily_quests
    where user_id = v_user and quest_date = current_date and template_id = p_template_id
    for update;
  if not found then raise exception 'quest not found'; end if;
  if not q.completed then raise exception 'quest not complete yet'; end if;
  if q.claimed then raise exception 'already claimed'; end if;

  update player_daily_quests set claimed = true
    where user_id = v_user and quest_date = current_date and template_id = p_template_id;
  update player_state set coins = coins + q.coin_reward, gems = gems + q.gem_reward, updated_at = now()
    where user_id = v_user;

  return jsonb_build_object('coin_reward', q.coin_reward, 'gem_reward', q.gem_reward);
end;
$$;

-- Effective multiplier from the player's "multiplier" category upgrades.
create or replace function effective_multiplier(p_user uuid) returns numeric
language sql security definer stable set search_path = public, pg_temp as $$
  select 1 + coalesce(sum(u.effect_value * pu.level), 0)
  from player_upgrades pu
  join upgrades u on u.id = pu.upgrade_id and u.category = 'multiplier'
  where pu.user_id = p_user;
$$;

-- Capacity bonus (extra hours) from "capacity" category upgrades.
create or replace function capacity_bonus_hours(p_user uuid) returns numeric
language sql security definer stable set search_path = public, pg_temp as $$
  select coalesce(sum(u.effect_value * pu.level), 0)
  from player_upgrades pu
  join upgrades u on u.id = pu.upgrade_id and u.category = 'capacity'
  where pu.user_id = p_user;
$$;

-- Collect ALL pending income across every owned card. Returns coins collected.
create or replace function collect_all() returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_mult numeric;
  v_cap_bonus numeric;
  v_total numeric := 0;
  r record;
  v_elapsed numeric;
  v_cap_seconds numeric;
  v_amount numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  v_mult := effective_multiplier(v_user);
  v_cap_bonus := capacity_bonus_hours(v_user);

  for r in
    select pc.card_id, pc.count, pc.last_tick, c.earn_rate, c.cap_hours
    from player_cards pc
    join cards c on c.id = pc.card_id
    where pc.user_id = v_user and pc.count > 0
  loop
    v_elapsed := greatest(0, extract(epoch from (now() - r.last_tick)));
    v_cap_seconds := (r.cap_hours + v_cap_bonus) * 3600;
    v_amount := least(v_elapsed, v_cap_seconds) * r.earn_rate * r.count * v_mult;
    if v_amount > 0 then
      v_total := v_total + v_amount;
      update player_cards
        set total_generated = total_generated + v_amount, last_tick = now()
        where user_id = v_user and card_id = r.card_id;
    else
      update player_cards set last_tick = now() where user_id = v_user and card_id = r.card_id;
    end if;
  end loop;

  if v_total > 0 then
    update player_state
      set coins = coins + v_total, total_coins_earned = total_coins_earned + v_total, updated_at = now()
      where user_id = v_user;
    perform increment_quest_progress(v_user, 'collect_coins', v_total);
    perform increment_quest_progress(v_user, 'collect_clicks', 1);
  end if;

  return v_total;
end;
$$;

-- Collect pending income from a single card. Returns coins collected.
create or replace function collect_card(p_card_id text) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_mult numeric;
  v_cap_bonus numeric;
  r record;
  v_elapsed numeric;
  v_cap_seconds numeric;
  v_amount numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select pc.count, pc.last_tick, c.earn_rate, c.cap_hours into r
  from player_cards pc join cards c on c.id = pc.card_id
  where pc.user_id = v_user and pc.card_id = p_card_id;

  if not found or r.count <= 0 then return 0; end if;

  v_mult := effective_multiplier(v_user);
  v_cap_bonus := capacity_bonus_hours(v_user);
  v_elapsed := greatest(0, extract(epoch from (now() - r.last_tick)));
  v_cap_seconds := (r.cap_hours + v_cap_bonus) * 3600;
  v_amount := least(v_elapsed, v_cap_seconds) * r.earn_rate * r.count * v_mult;

  update player_cards
    set total_generated = total_generated + v_amount, last_tick = now()
    where user_id = v_user and card_id = p_card_id;

  if v_amount > 0 then
    update player_state
      set coins = coins + v_amount, total_coins_earned = total_coins_earned + v_amount, updated_at = now()
      where user_id = v_user;
    perform increment_quest_progress(v_user, 'collect_coins', v_amount);
    perform increment_quest_progress(v_user, 'collect_clicks', 1);
  end if;

  return v_amount;
end;
$$;

-- Open a pack: validates cost, deducts coins, rolls cards server-side, returns the pulled cards as JSON.
create or replace function open_pack(p_pack_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_pack packs%rowtype;
  v_coins numeric;
  v_results jsonb := '[]'::jsonb;
  i int;
  v_rarity text;
  v_roll numeric;
  v_cum numeric;
  v_card cards%rowtype;
  v_was_new boolean;
  rarities text[] := array['common','uncommon','rare','epic','legendary','mythic'];
  v_weight numeric;
  v_sum numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_pack from packs where id = p_pack_id;
  if not found then raise exception 'pack not found'; end if;

  select coins into v_coins from player_state where user_id = v_user for update;
  if v_coins < v_pack.cost then raise exception 'insufficient coins'; end if;

  update player_state set coins = coins - v_pack.cost, packs_opened = packs_opened + 1, updated_at = now()
    where user_id = v_user;

  for i in 1..v_pack.pull_count loop
    -- weighted rarity pick
    v_sum := 0;
    for j in 1..array_length(rarities,1) loop
      v_sum := v_sum + coalesce((v_pack.weights->>rarities[j])::numeric, 0);
    end loop;
    v_roll := random() * greatest(v_sum, 0.0001);
    v_cum := 0;
    v_rarity := rarities[1];
    for j in 1..array_length(rarities,1) loop
      v_weight := coalesce((v_pack.weights->>rarities[j])::numeric, 0);
      v_cum := v_cum + v_weight;
      if v_roll < v_cum then v_rarity := rarities[j]; exit; end if;
    end loop;

    -- pick a random card of that rarity, honoring series filter, with fallback
    select * into v_card from cards
      where rarity = v_rarity and (v_pack.series_filter is null or series_id = v_pack.series_filter)
      order by random() limit 1;
    if not found then
      select * into v_card from cards where rarity = v_rarity order by random() limit 1;
    end if;
    if not found then
      select * into v_card from cards order by random() limit 1;
    end if;
    if not found then exit; end if;

    select not exists(select 1 from player_cards where user_id = v_user and card_id = v_card.id and count > 0) into v_was_new;

    insert into player_cards (user_id, card_id, count, last_tick)
      values (v_user, v_card.id, 1, now())
      on conflict (user_id, card_id) do update
        set count = player_cards.count + 1;

    insert into pull_history (user_id, pack_id, card_id, rarity) values (v_user, p_pack_id, v_card.id, v_card.rarity);

    v_results := v_results || jsonb_build_object(
      'card_id', v_card.id, 'name', v_card.name, 'rarity', v_card.rarity,
      'series_id', v_card.series_id, 'image_url', v_card.image_url, 'is_new', v_was_new
    );
  end loop;

  perform increment_quest_progress(v_user, 'open_packs', 1);

  return v_results;
end;
$$;

-- Purchase/level-up an upgrade with gems.
create or replace function purchase_upgrade(p_upgrade_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_upgrade upgrades%rowtype;
  v_current_level int;
  v_cost numeric;
  v_gems numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_upgrade from upgrades where id = p_upgrade_id;
  if not found then raise exception 'upgrade not found'; end if;

  select coalesce(level,0) into v_current_level from player_upgrades where user_id = v_user and upgrade_id = p_upgrade_id;
  v_current_level := coalesce(v_current_level, 0);

  if v_current_level >= v_upgrade.max_level then raise exception 'max level reached'; end if;

  v_cost := ceil(v_upgrade.base_cost_gems * power(v_upgrade.cost_growth, v_current_level));

  select gems into v_gems from player_state where user_id = v_user for update;
  if v_gems < v_cost then raise exception 'insufficient gems'; end if;

  update player_state set gems = gems - v_cost, updated_at = now() where user_id = v_user;

  insert into player_upgrades (user_id, upgrade_id, level) values (v_user, p_upgrade_id, 1)
    on conflict (user_id, upgrade_id) do update set level = player_upgrades.level + 1;

  return jsonb_build_object('upgrade_id', p_upgrade_id, 'new_level', v_current_level + 1, 'cost_paid', v_cost);
end;
$$;

-- Check + grant any newly-earned achievements. Returns array of newly unlocked achievement ids.
create or replace function check_achievements() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_unique_cards int;
  v_total_coins numeric;
  v_packs_opened int;
  v_total_cards int;
  v_pct numeric;
  a record;
  v_newly jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select count(*) into v_unique_cards from player_cards where user_id = v_user and count > 0;
  select total_coins_earned, packs_opened into v_total_coins, v_packs_opened from player_state where user_id = v_user;
  select count(*) into v_total_cards from cards;
  v_pct := case when v_total_cards > 0 then (v_unique_cards::numeric / v_total_cards) * 100 else 0 end;

  for a in select * from achievements loop
    if exists (select 1 from player_achievements where user_id = v_user and achievement_id = a.id) then
      continue;
    end if;

    if (a.condition_type = 'unique_cards' and v_unique_cards >= a.condition_value)
      or (a.condition_type = 'total_coins_earned' and v_total_coins >= a.condition_value)
      or (a.condition_type = 'packs_opened' and v_packs_opened >= a.condition_value)
      or (a.condition_type = 'collection_pct' and v_pct >= a.condition_value)
    then
      insert into player_achievements (user_id, achievement_id) values (v_user, a.id);
      update player_state set gems = gems + a.gem_reward where user_id = v_user;
      v_newly := v_newly || jsonb_build_object('id', a.id, 'name', a.name, 'title', a.title, 'gem_reward', a.gem_reward);
    end if;
  end loop;

  return v_newly;
end;
$$;

-- Daily login streak + small coin/gem bonus, call once when the app loads.
create or replace function daily_login() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_last date;
  v_streak int;
  v_bonus_coins numeric;
  v_bonus_gems numeric;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select last_login, login_streak into v_last, v_streak from player_state where user_id = v_user for update;

  if v_last = current_date then
    return jsonb_build_object('already_claimed', true, 'streak', v_streak);
  elsif v_last = current_date - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  v_bonus_coins := 50 * v_streak;
  v_bonus_gems := least(v_streak, 10);

  update player_state set
    coins = coins + v_bonus_coins,
    gems = gems + v_bonus_gems,
    login_streak = v_streak,
    last_login = current_date,
    updated_at = now()
  where user_id = v_user;

  return jsonb_build_object('already_claimed', false, 'streak', v_streak, 'bonus_coins', v_bonus_coins, 'bonus_gems', v_bonus_gems);
end;
$$;

-- ============================================================================
-- SEED DATA — original (non-copyrighted) series, cards, packs, upgrades, achievements
-- ============================================================================

insert into series (id, name, icon, accent, sort_order) values
  ('shinobi','Crimson Shinobi','🥷','#e15b5b',1),
  ('pirates','Void Pirates','🏴‍☠️','#38bdf8',2),
  ('academy','Starforge Academy','✨','#a78bfa',3),
  ('hunters','Chainbound Hunters','⛓️','#f5b642',4),
  ('blades','Blossom Blades','🌸','#f4568c',5)
on conflict (id) do nothing;

insert into cards (id, series_id, name, rarity, earn_rate, cap_hours) values
  ('shinobi-common','shinobi','Genin Recruit','common',0.1,8),
  ('shinobi-uncommon','shinobi','Shadow Scout','uncommon',0.3,8),
  ('shinobi-rare','shinobi','Crimson Jōnin','rare',1,10),
  ('shinobi-epic','shinobi','Twin Blade Assassin','epic',3,12),
  ('shinobi-legendary','shinobi','Shadowfall Sensei','legendary',10,16),
  ('shinobi-mythic','shinobi','Crimson Void Avatar','mythic',30,24),

  ('pirates-common','pirates','Deckhand Rookie','common',0.1,8),
  ('pirates-uncommon','pirates','Cannoneer','uncommon',0.3,8),
  ('pirates-rare','pirates','First Mate Kira','rare',1,10),
  ('pirates-epic','pirates','Storm Captain Vale','epic',3,12),
  ('pirates-legendary','pirates','Ghost Fleet Admiral','legendary',10,16),
  ('pirates-mythic','pirates',E'Leviathan\'s Chosen','mythic',30,24),

  ('academy-common','academy','Freshman Mage','common',0.1,8),
  ('academy-uncommon','academy','Rune Apprentice','uncommon',0.3,8),
  ('academy-rare','academy','Starlit Duelist','rare',1,10),
  ('academy-epic','academy','Astral Valedictorian','epic',3,12),
  ('academy-legendary','academy','Archmage Seraphine','legendary',10,16),
  ('academy-mythic','academy','Celestial Overmind','mythic',30,24),

  ('hunters-common','hunters','Chain Initiate','common',0.1,8),
  ('hunters-uncommon','hunters','Bound Tracker','uncommon',0.3,8),
  ('hunters-rare','hunters','Fang Reaper','rare',1,10),
  ('hunters-epic','hunters','Ashen Executioner','epic',3,12),
  ('hunters-legendary','hunters','Voidchain Warden','legendary',10,16),
  ('hunters-mythic','hunters',E'The Devourer\'s Heir','mythic',30,24),

  ('blades-common','blades','Dojo Student','common',0.1,8),
  ('blades-uncommon','blades','Petal Duelist','uncommon',0.3,8),
  ('blades-rare','blades','Crimson Blossom','rare',1,10),
  ('blades-epic','blades','Iaijutsu Master','epic',3,12),
  ('blades-legendary','blades','Sakura Oathkeeper','legendary',10,16),
  ('blades-mythic','blades','Eternal Blade Spirit','mythic',30,24)
on conflict (id) do nothing;

insert into packs (id, name, icon, cost, pull_count, series_filter, accent, weights) values
  ('starter','Starter Pack','📦',100,3,null,'#8b8fa3','{"common":60,"uncommon":25,"rare":10,"epic":4,"legendary":1,"mythic":0}'),
  ('fusion','Fusion Pack','💠',600,4,null,'#38bdf8','{"common":28,"uncommon":30,"rare":25,"epic":12,"legendary":4,"mythic":1}'),
  ('vault','Mythic Vault','🔮',3000,5,null,'#f4568c','{"common":0,"uncommon":8,"rare":30,"epic":36,"legendary":20,"mythic":6}')
on conflict (id) do nothing;

insert into upgrades (id, name, description, category, base_cost_gems, cost_growth, effect_value, max_level, sort_order) values
  ('auto_collect','Auto-Collector','Automatically collects income from every card at an interval, no clicking needed.','auto_collect',25,1.8,1,5,1),
  ('multiplier','Income Multiplier','Increases all coin income from every card.','multiplier',15,1.5,0.1,20,2),
  ('capacity','Vault Expansion','Increases how long cards can store income before they cap out.','capacity',20,1.6,2,10,3),
  ('luck','Lucky Charm','Improves the odds of pulling rare-and-above cards from packs.','luck',30,1.7,0.05,8,4)
on conflict (id) do nothing;

insert into quest_templates (id, description, quest_type, target_value, coin_reward, gem_reward, weight) values
  ('open_2_packs', 'Open 2 packs', 'open_packs', 2, 100, 2, 1),
  ('open_5_packs', 'Open 5 packs', 'open_packs', 5, 300, 5, 1),
  ('collect_500', 'Collect 500 coins from your cards', 'collect_coins', 500, 150, 3, 1),
  ('collect_2000', 'Collect 2,000 coins from your cards', 'collect_coins', 2000, 500, 8, 1),
  ('taps_5', 'Tap to collect from cards 5 times', 'collect_clicks', 5, 100, 2, 1),
  ('taps_10', 'Tap to collect from cards 10 times', 'collect_clicks', 10, 250, 4, 1)
on conflict (id) do nothing;

insert into achievements (id, name, description, condition_type, condition_value, gem_reward, title) values
  ('first_pull','First Steps','Open your very first pack.','packs_opened',1,5,'Newcomer'),
  ('ten_packs','Getting Serious','Open 10 packs.','packs_opened',10,10,'Collector'),
  ('fifty_packs','Vault Regular','Open 50 packs.','packs_opened',50,25,'Vault Regular'),
  ('ten_unique','Growing Binder','Collect 10 unique cards.','unique_cards',10,10,null),
  ('half_collection','Halfway There','Collect 50% of all cards.','collection_pct',50,40,'Archivist'),
  ('full_collection','Master Collector','Collect every card in the game.','collection_pct',100,150,'Master Collector'),
  ('rich_100k','Big Spender','Earn a lifetime total of 100,000 coins.','total_coins_earned',100000,30,'Tycoon')
on conflict (id) do nothing;
