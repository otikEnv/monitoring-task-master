-- Hold dan Catatan release (PRD-Release-Hold-Catatan.md): mengedit teks entri Hold ikut memperbarui alasan
-- hold yang sedang berlaku.
--
-- Banner dan kartu menampilkan releases.hold_reason, sedangkan log menyimpan teks yang sama pada entri 'hold'.
-- Tanpa sinkronisasi, memperbaiki typo pada entri Hold di log membuat banner tetap menampilkan teks lama.
-- Hanya entri hold TERBARU dari release yang MASIH ditahan yang menyinkronkan; entri hold lama (riwayat) tidak.
-- Sisanya sama dengan edit_release_note sebelumnya. Jalankan sekali saja.

create or replace function public.edit_release_note(p_note_id uuid, p_body text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.release_notes%rowtype;
  nb text := btrim(coalesce(p_body, ''));
begin
  select * into n from public.release_notes where id = p_note_id for update;
  if not found then raise exception 'note not found' using errcode = 'P0002'; end if;
  if nb = n.body then return; end if;

  update public.release_notes
     set body = nb,
         previous_body = n.body,
         edited_at = now(),
         edited_by_email = coalesce(nullif(btrim(p_email), ''), 'unknown')
   where id = p_note_id;

  if n.kind = 'hold' then
    update public.releases r
       set hold_reason = nb
     where r.id = n.release_id
       and r.held_at is not null
       and p_note_id = (
         select h.id from public.release_notes h
          where h.release_id = n.release_id and h.kind = 'hold'
          order by h.created_at desc, h.id desc
          limit 1
       );
  end if;
end;
$$;
