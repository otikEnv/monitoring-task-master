-- Penulisan hasil sinkronisasi yang berhasil, atomik dalam SATU transaksi:
--   1. ganti semua task milik sumber,
--   2. catat snapshot per tag,
--   3. perbarui status sumber (sukses, waktu, ETag, waktu commit, kedaluwarsa token).
-- Bila salah satu langkah gagal, seluruhnya dibatalkan dan data lama tetap utuh.
--
-- Klien Supabase tidak bisa multi-statement dalam satu transaksi, karena itu dibuat sebagai
-- fungsi. HANYA service role yang boleh memanggilnya (kode server setelah autentikasi).

create function public.sync_apply_success(
  p_source_id        uuid,
  p_tasks            jsonb,        -- array baris task: tag, task_id, title, ..., subtasks_done
  p_snapshots        jsonb,        -- array baris snapshot: tag, total, pending, ..., other
  p_etag             text,
  p_last_commit_at   timestamptz,
  p_token_expires_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Serialkan sinkronisasi pada sumber yang sama (mis. dua klik Segarkan bersamaan).
  perform pg_advisory_xact_lock(hashtextextended(p_source_id::text, 0));

  if not exists (select 1 from public.sources where id = p_source_id) then
    raise exception 'sumber % tidak ditemukan', p_source_id using errcode = 'P0002';
  end if;

  delete from public.tasks where source_id = p_source_id;

  insert into public.tasks (
    source_id, tag, task_id, title, description, status, priority,
    dependencies, details, test_strategy, subtasks, subtasks_total, subtasks_done
  )
  select
    p_source_id, r.tag, r.task_id, r.title, r.description, r.status, r.priority,
    coalesce(r.dependencies, '[]'::jsonb), r.details, r.test_strategy,
    coalesce(r.subtasks, '[]'::jsonb),
    coalesce(r.subtasks_total, 0), coalesce(r.subtasks_done, 0)
  from jsonb_to_recordset(coalesce(p_tasks, '[]'::jsonb)) as r(
    tag text, task_id text, title text, description text, status text, priority text,
    dependencies jsonb, details text, test_strategy text, subtasks jsonb,
    subtasks_total int, subtasks_done int
  );

  insert into public.snapshots (
    source_id, tag, total, pending, in_progress, review, blocked, done, deferred, cancelled, other
  )
  select
    p_source_id, r.tag,
    coalesce(r.total, 0), coalesce(r.pending, 0), coalesce(r.in_progress, 0),
    coalesce(r.review, 0), coalesce(r.blocked, 0), coalesce(r.done, 0),
    coalesce(r.deferred, 0), coalesce(r.cancelled, 0), coalesce(r.other, 0)
  from jsonb_to_recordset(coalesce(p_snapshots, '[]'::jsonb)) as r(
    tag text, total int, pending int, in_progress int, review int, blocked int,
    done int, deferred int, cancelled int, other int
  );

  update public.sources set
    last_sync_status = 'success',
    last_attempt_at  = now(),
    last_synced_at   = now(),
    last_error       = null,
    etag             = p_etag,
    last_commit_at   = p_last_commit_at,
    -- Bila penyedia tidak melaporkan kedaluwarsa, pertahankan nilai yang sudah ada.
    token_expires_at = coalesce(p_token_expires_at, token_expires_at)
  where id = p_source_id;
end;
$$;

-- Supabase memberi EXECUTE ke anon/authenticated secara default; cabut.
revoke all on function public.sync_apply_success(uuid, jsonb, jsonb, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sync_apply_success(uuid, jsonb, jsonb, text, timestamptz, timestamptz)
  to service_role;
