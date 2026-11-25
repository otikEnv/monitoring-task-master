-- RBAC (PRD-RBAC.md) bagian 1: nilai role baru. Jalankan sekali saja, SEBELUM 20261125010000_rbac.sql.
--
-- Dipisah ke berkas sendiri karena nilai enum baru tidak bisa dipakai di transaksi yang sama dengan
-- `alter type ... add value` (npm run db:run menjalankan satu berkas sebagai satu transaksi).

alter type public.user_role add value if not exists 'superadmin';
alter type public.user_role add value if not exists 'developer';
