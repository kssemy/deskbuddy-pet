-- 캐릭터 앱 계정별 출퇴근·점심시간. 기존 Workbuddy 데이터와 별개입니다.
create table if not exists public.pet_schedule (
  member_id text primary key references pet_private.members(id) on delete cascade,
  work_start text not null default '09:00',
  work_end text not null default '18:00',
  lunch_start text not null default '12:00',
  lunch_end text not null default '13:00',
  constraint pet_schedule_work_start check (work_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint pet_schedule_work_end check (work_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint pet_schedule_lunch_start check (lunch_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint pet_schedule_lunch_end check (lunch_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
alter table public.pet_schedule enable row level security;
create policy pet_schedule_read on public.pet_schedule for select to anon
  using (member_id = public.pet_current_member());
create policy pet_schedule_insert on public.pet_schedule for insert to anon
  with check (member_id = public.pet_current_member());
create policy pet_schedule_update on public.pet_schedule for update to anon
  using (member_id = public.pet_current_member())
  with check (member_id = public.pet_current_member());
revoke all on public.pet_schedule from public, anon, authenticated;
grant select, insert, update on public.pet_schedule to anon;
