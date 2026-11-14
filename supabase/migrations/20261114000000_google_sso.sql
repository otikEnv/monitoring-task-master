-- Login SSO Google (PRD-Login-SSO-Google.md).
--  1. Akun baru hanya boleh ber-email @envisions.app (semua cara daftar: Google, signUp email, admin API).
--  2. Akun yang dibuat lewat Google mendapat role 'admin'; akun lain tetap 'viewer'.
-- Akun yang sudah ada tidak berubah. Jalankan sekali saja (tidak idempoten).

-- ---------------------------------------------------------------------------
-- 1. Batas domain: ditolak sebelum baris auth.users dibuat
-- ---------------------------------------------------------------------------
-- Pengecualian untuk skrip uji SQL: hanya bila koneksi benar-benar login sebagai 'postgres'
-- (session_user, bukan current_user) DAN GUC app.allow_any_domain = 'on'. GoTrue (supabase_auth_admin)
-- dan PostgREST tidak bisa memenuhi keduanya, jadi API publik tidak bisa melewati batas ini.
create function public.enforce_allowed_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user = 'postgres'
     and coalesce(current_setting('app.allow_any_domain', true), '') = 'on' then
    return new;
  end if;

  if new.email is null or lower(new.email) !~ '^[^@[:space:]]+@envisions\.app$' then
    raise exception 'Only @envisions.app email addresses can register.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_allowed_email_domain
  before insert on auth.users
  for each row execute function public.enforce_allowed_email_domain();

revoke all on function public.enforce_allowed_email_domain() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Role bawaan: Google = admin, selain itu viewer
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'provider' = 'google'
         then 'admin'::public.user_role
         else 'viewer'::public.user_role
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
