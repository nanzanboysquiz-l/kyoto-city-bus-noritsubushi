create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  if display_name is null or char_length(display_name) > 60 then
    raise exception 'A display name of 1 to 60 characters is required.'
      using errcode = '22023';
  end if;

  insert into public.profiles (user_id, display_name)
  values (new.id, display_name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.ride_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  route_id text not null check (char_length(btrim(route_id)) > 0),
  boarded_stop_id text not null check (char_length(btrim(boarded_stop_id)) > 0),
  alighted_stop_id text not null check (char_length(btrim(alighted_stop_id)) > 0),
  ride_date date not null,
  distance_km numeric(10, 3) not null check (distance_km > 0),
  created_at timestamptz not null default now(),
  check (boarded_stop_id <> alighted_stop_id)
);

create index group_members_user_id_idx on public.group_members (user_id);
create index ride_records_user_date_idx on public.ride_records (user_id, ride_date desc);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.ride_records enable row level security;

create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members member
    where member.group_id = p_group_id
      and member.user_id = auth.uid()
  );
$$;

create policy "Profiles are private to their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Groups are visible to their members"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "Ride records are private to their owner"
  on public.ride_records for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  group_id uuid;
  clean_name text := btrim(p_name);
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if clean_name is null or char_length(clean_name) not between 1 and 80 then
    raise exception 'Group name must contain 1 to 80 characters.' using errcode = '22023';
  end if;

  insert into public.groups (name, created_by)
  values (clean_name, actor_id)
  returning id into group_id;

  insert into public.group_members (group_id, user_id, role)
  values (group_id, actor_id, 'owner');

  return group_id;
end;
$$;

create function public.group_distance_totals(p_group_id uuid)
returns table (display_name text, total_distance_km double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.display_name,
    coalesce(sum(ride.distance_km), 0)::double precision
  from public.group_members member
  join public.profiles profile on profile.user_id = member.user_id
  left join public.ride_records ride on ride.user_id = member.user_id
  where member.group_id = p_group_id
    and public.is_group_member(p_group_id)
  group by member.user_id, profile.display_name, member.joined_at
  order by member.joined_at, profile.display_name;
$$;

revoke all on table
  public.profiles,
  public.groups,
  public.group_members,
  public.ride_records
from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.groups to authenticated;
grant select, insert, update, delete on public.ride_records to authenticated;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.create_group(text) from public, anon;
revoke all on function public.group_distance_totals(uuid) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.group_distance_totals(uuid) to authenticated;
