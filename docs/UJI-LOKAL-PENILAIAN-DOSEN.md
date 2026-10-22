# Skenario Uji Lokal Penilaian Dosen

## Menyiapkan data demo

Jalankan dari folder `apps/api`:

```bash
php artisan migrate
php artisan db:seed --class=DemoGradeWorkflowSeeder
php artisan serve --port=4000
```

Pada terminal kedua, jalankan dari folder `apps/web`:

```bash
npm run dev
```

Buka `http://localhost:5173`. Seeder ini hanya dapat berjalan ketika `APP_ENV` bernilai `local` atau `testing`. Menjalankannya kembali akan mengosongkan nilai demo dan mengembalikan status menjadi `Draft`.

## Akun demo

Semua akun menggunakan kata sandi `DemoCpl2026!`.

| Peran | Email | Fungsi uji |
| --- | --- | --- |
| Admin jurusan | `admin.demo@cpl.local` | Sinkronisasi peserta, menyetujui, mengunci, dan membuka nilai |
| Koordinator | `koordinator.demo@cpl.local` | Memeriksa dan menyetujui pengajuan nilai |
| Dosen anggota | `dosen.demo@cpl.local` | Mengisi, menyimpan draf, dan mengajukan nilai |

## Skenario utama

1. Login sebagai dosen anggota.
2. Buka menu **Input Nilai CPMK** dan pilih `DEMO-AKT101 - Praktikum Akuntansi Terintegrasi` kelas `DEMO-A`.
3. Isi dua nilai untuk ketiga mahasiswa. Gunakan contoh `80` dan `85`, lalu pilih **Simpan Draf**.
4. Pastikan Nilai Akhir, `CPL-1`, dan `CPL-2` dihitung otomatis.
5. Pilih **Ajukan Nilai**. Setelah diajukan, input harus terkunci.
6. Logout, lalu login sebagai koordinator.
7. Buka **Input Nilai CPMK**, pilih mata kuliah yang sama, lalu pilih **Setujui Nilai**.
8. Logout, lalu login sebagai admin jurusan.
9. Buka **Penugasan Dosen**. Status nilai harus `Approved`; pilih ikon gembok untuk mengunci.
10. Pastikan status menjadi `Locked`.

## Skenario pembukaan kembali

1. Saat login sebagai admin, pada **Penugasan Dosen** pilih ikon gembok terbuka.
2. Masukkan alasan minimal 10 karakter, misalnya `Koreksi berdasarkan berita acara ujian`.
3. Login kembali sebagai dosen anggota.
4. Pastikan status kembali `Draft`, nilai dapat diubah, dan alasan pembukaan tercatat pada audit backend.

## Skenario validasi

- Coba ajukan ketika salah satu nilai wajib kosong: sistem harus menolak.
- Isi nilai `0`: sistem harus menyimpannya sebagai nilai nyata, bukan nilai kosong.
- Pilih `Tidak berhak karena presensi` atau `Tidak hadir`: komponen dianggap lengkap dengan nilai efektif nol.
- Pilih `Izin` atau `Ujian susulan` tanpa nilai: pengajuan harus ditolak karena belum selesai.
- Setelah status `Submitted`, `Approved`, atau `Locked`, dosen tidak boleh mengubah nilai.
