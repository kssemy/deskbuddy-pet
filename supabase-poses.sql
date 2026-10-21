-- 캐릭터 동작 PNG: 로그인한 친구끼리만 읽고, 본인만 변경합니다.
create table if not exists public.pet_poses (
  member_id text not null references pet_private.members(id) on delete cascade,
  slot smallint not null check (slot between 0 and 11),
  image text not null check (left(image,22) = 'data:image/png;base64,' and length(image) <= 200000),
  primary key (member_id, slot)
);
alter table public.pet_poses enable row level security;
drop policy if exists pet_poses_read on public.pet_poses;
drop policy if exists pet_poses_insert on public.pet_poses;
drop policy if exists pet_poses_delete on public.pet_poses;
create policy pet_poses_read on public.pet_poses for select to anon
  using (public.pet_current_member() is not null);
create policy pet_poses_insert on public.pet_poses for insert to anon
  with check (member_id = public.pet_current_member());
create policy pet_poses_delete on public.pet_poses for delete to anon
  using (member_id = public.pet_current_member());
revoke all on public.pet_poses from public, anon, authenticated;
grant select, insert, delete on public.pet_poses to anon;
