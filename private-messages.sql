-- Run once in the Supabase SQL Editor for the Dolphin Staff Hub.
begin;
create or replace function public.staff_message_is_office()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.staff_profiles
    where id = (select auth.uid()) and role = 'office');
$$;
revoke all on function public.staff_message_is_office() from public, anon;
grant execute on function public.staff_message_is_office() to authenticated;

create table if not exists public.staff_private_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  message text not null check (char_length(btrim(message)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists staff_private_messages_recipient_created
on public.staff_private_messages(recipient_id, created_at desc);
alter table public.staff_private_messages enable row level security;
revoke all on public.staff_private_messages from anon, authenticated;
grant select, insert on public.staff_private_messages to authenticated;
drop policy if exists private_message_read on public.staff_private_messages;
create policy private_message_read on public.staff_private_messages
for select to authenticated using (
  recipient_id = (select auth.uid()) or public.staff_message_is_office()
);
drop policy if exists private_message_send on public.staff_private_messages;
create policy private_message_send on public.staff_private_messages
for insert to authenticated with check (
  public.staff_message_is_office() and sender_id = (select auth.uid())
);
create or replace function public.staff_message_recipients()
returns table(id uuid, email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.staff_message_is_office() then
    raise exception 'Office access required' using errcode = '42501';
  end if;
  return query select u.id, u.email::text from auth.users u
    where u.email is not null order by u.email;
end;
$$;
revoke all on function public.staff_message_recipients() from public, anon;
grant execute on function public.staff_message_recipients() to authenticated;
commit;

