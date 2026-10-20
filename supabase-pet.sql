-- 독립적인 캐릭터 앱 계정. 기존 Workbuddy 계정과 데이터는 사용하지 않습니다.
create schema if not exists pet_private;
revoke all on schema pet_private from public, anon, authenticated;

create table pet_private.members (
  id text primary key,
  name text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  constraint pet_member_name_size check (length(name) between 1 and 12)
);
create unique index pet_member_unique_name on pet_private.members (lower(btrim(name)));
create table pet_private.sessions (
  token_hash text primary key,
  member_id text not null references pet_private.members(id) on delete cascade,
  expires_at timestamptz not null
);
create index pet_session_expiry on pet_private.sessions (expires_at);

create function pet_private.new_session(p_id text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into pet_private.sessions(token_hash, member_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_id, now() + interval '30 days');
  return jsonb_build_object('member_id', p_id, 'name', p_name, 'session_token', v_token);
end;
$$;
revoke all on function pet_private.new_session(text,text) from public;

create function public.pet_register(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(p_name); v_id text;
begin
  if v_name is null or length(v_name) not between 1 and 12 then
    return jsonb_build_object('error', '닉네임은 1~12자로 입력해 주세요.');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('error', 'PIN은 숫자 6자리로 입력해 주세요.');
  end if;
  v_id := 'p_' || replace(gen_random_uuid()::text, '-', '');
  insert into pet_private.members(id, name, pin_hash)
  values (v_id, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)));
  return pet_private.new_session(v_id, v_name);
exception when unique_violation then
  return jsonb_build_object('error', '이미 사용 중인 닉네임이에요.');
end;
$$;
revoke all on function public.pet_register(text,text) from public;
grant execute on function public.pet_register(text,text) to anon;

create function public.pet_login(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_member pet_private.members%rowtype;
begin
  if p_name is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('error', '닉네임 또는 PIN을 확인해 주세요.');
  end if;
  select * into v_member from pet_private.members
  where lower(btrim(name)) = lower(btrim(p_name)) for update;
  if v_member.id is null then
    return jsonb_build_object('error', '닉네임 또는 PIN을 확인해 주세요.');
  end if;
  if v_member.locked_until > now() then
    return jsonb_build_object('error', '잠시 후 다시 시도해 주세요.');
  end if;
  if extensions.crypt(p_pin, v_member.pin_hash) <> v_member.pin_hash then
    update pet_private.members set failed_attempts = v_member.failed_attempts + 1,
      locked_until = case when v_member.failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where id = v_member.id;
    return jsonb_build_object('error', '닉네임 또는 PIN을 확인해 주세요.');
  end if;
  update pet_private.members set failed_attempts = 0, locked_until = null where id = v_member.id;
  delete from pet_private.sessions where expires_at <= now();
  return pet_private.new_session(v_member.id, v_member.name);
end;
$$;
revoke all on function public.pet_login(text,text) from public;
grant execute on function public.pet_login(text,text) to anon;

create function public.pet_current_member() returns text
language sql stable security definer set search_path = '' as $$
  select s.member_id from pet_private.sessions s
  where s.token_hash = encode(extensions.digest(
    coalesce((nullif(current_setting('request.headers', true), '')::jsonb)->>'x-pet-session', ''),
    'sha256'), 'hex')
    and s.expires_at > now()
  limit 1;
$$;
revoke all on function public.pet_current_member() from public;
grant execute on function public.pet_current_member() to anon;

-- 초기 Workbuddy 연결용 테이블이 비어 있을 때만 교체합니다.
do $$
begin
  if exists (select 1 from public.pet_presence limit 1) then
    raise exception '기존 pet_presence 데이터가 있어 교체를 중단했습니다.';
  end if;
end;
$$;
drop table public.pet_presence;
create table public.pet_presence (
  member_id text primary key references pet_private.members(id) on delete cascade,
  name text not null default '',
  avatar text,
  speech text not null default '',
  status text not null default '',
  public_tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pet_avatar_size check (avatar is null or length(avatar) <= 200000),
  constraint pet_name_size check (length(name) <= 12),
  constraint pet_speech_size check (length(speech) <= 80),
  constraint pet_tasks_array check (jsonb_typeof(public_tasks) = 'array')
);
alter table public.pet_presence enable row level security;
create policy pet_presence_read on public.pet_presence for select to anon
  using (public.pet_current_member() is not null);
create policy pet_presence_insert on public.pet_presence for insert to anon
  with check (member_id = public.pet_current_member());
create policy pet_presence_update on public.pet_presence for update to anon
  using (member_id = public.pet_current_member())
  with check (member_id = public.pet_current_member());
create policy pet_presence_delete on public.pet_presence for delete to anon
  using (member_id = public.pet_current_member());
revoke all on public.pet_presence from public, anon, authenticated;
grant select, insert, update, delete on public.pet_presence to anon;
