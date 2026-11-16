-- Hold dan Catatan release (PRD-Release-Hold-Catatan.md): menghapus catatan bebas.
--
-- Hanya entri bertipe 'note' (catatan bebas) yang boleh dihapus, mis. yang terkirim tanpa sengaja. Entri sistem
-- (hold, resume, target_change, released) adalah riwayat jadwal dan keputusan: tidak bisa dihapus lewat fungsi ini.
-- Penghapusan permanen. Hanya service_role; klien login tetap hanya membaca.
--   P0002 = catatan tidak ditemukan
--   55000 = bukan catatan bebas; pesan: not_deletable
-- Menghapus release tetap menghapus seluruh log-nya (cascade) seperti sebelumnya. Jalankan sekali saja.

create function public.delete_release_note(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.release_notes%rowtype;
begin
  select * into n from public.release_notes where id = p_note_id for update;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
  if n.kind <> 'note' then raise exception 'not_deletable' using errcode = '55000'; end if;

  delete from public.release_notes where id = p_note_id;
  return n.release_id; -- agar pemanggil tahu halaman release mana yang perlu disegarkan
end;
$$;

revoke all on function public.delete_release_note(uuid) from public, anon, authenticated;
grant execute on function public.delete_release_note(uuid) to service_role;
