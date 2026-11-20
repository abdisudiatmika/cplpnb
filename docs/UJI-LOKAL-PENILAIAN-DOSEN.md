# Skenario Demo Kaprodi: SI-CPL Terintegrasi

## Tujuan demo

Demo ini menunjukkan alur OBE dari hulu ke hilir:

1. Admin jurusan menyiapkan CPL, profil lulusan, CPMK, rencana asesmen, dan penugasan dosen.
2. Dosen hanya melihat kelas yang menjadi tanggung jawabnya.
3. Dosen mengisi nilai berdasarkan komponen asesmen yang sudah ditetapkan.
4. Admin jurusan memverifikasi dan mengunci nilai.
5. Sistem menghitung ketercapaian CPMK, CPL, profil lulusan, serta transkrip OBE mahasiswa.

Pesan utama untuk Kaprodi:

> Nilai mentah hanya dimasukkan satu kali oleh dosen. Sistem menelusurkannya melalui komponen asesmen, CPMK, CPL, hingga profil lulusan. Hanya nilai yang sudah dikunci yang masuk ke laporan resmi.

## Durasi dan pembagian waktu

| Bagian | Durasi |
| --- | ---: |
| Pembukaan dan dashboard hasil | 2 menit |
| Penjelasan struktur OBE | 3 menit |
| Penugasan dosen | 2 menit |
| Input dan pengajuan nilai oleh dosen | 4 menit |
| Persetujuan, penguncian, dan hasil | 3 menit |
| Penutup | 1 menit |

Total target: 12-15 menit.

## Akun demo

| Peran | Email | Kata sandi |
| --- | --- | --- |
| Admin jurusan | `admin.demo@cpl.local` | `masung2` |
| Dosen pengampu | `dosen.demo@cpl.local` | `masung2` |

Tidak ada peran dosen koordinator dalam skenario ini. Dosen mengajukan nilai, sedangkan admin jurusan menyetujui dan menguncinya.

## Data yang telah disiapkan

| Data | Isi |
| --- | --- |
| Program studi | D3 Akuntansi Demo |
| Mata kuliah | `MKK2462401108 - Data Analitik` |
| Periode | Ganjil 2026/2027 |
| CPL | `CPL-1` sampai `CPL-10` |
| CPMK Data Analitik | `CPMK07-01`, `CPMK09-01`, `CPMK03-01`, dan `CPMK10-01` |
| Profil lulusan | `PL-1` sampai `PL-6` |
| Dosen | I Made Dosen Demo, S.E., M.Ak. (`DEMO-NIP-001`) |
| Mahasiswa | 6 orang pada kelas `DEMO-A` dan `DEMO-B` |

Kelas memiliki fungsi berbeda:

| Kelas | Kondisi awal | Fungsi saat demo |
| --- | --- | --- |
| `DEMO-A` | Sudah memiliki 30 nilai dan berstatus `Locked` | Menunjukkan dashboard, capaian CPL, profil lulusan, dan transkrip OBE yang sudah jadi |
| `DEMO-B` | Belum memiliki nilai, berstatus `Draft`, dan belum ditugaskan | Menunjukkan alur langsung dari penugasan dosen sampai nilai dikunci |

## Persiapan sebelum presentasi

### Menjalankan aplikasi

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

Buka `http://localhost:5173`.

### Pemeriksaan lima menit sebelum demo

- Pastikan login admin dan dosen berhasil.
- Pastikan dashboard admin menampilkan 6 mahasiswa dan 4 CPL terukur.
- Pastikan `DEMO-A` berstatus `Locked`.
- Pastikan `DEMO-B` belum muncul pada kelas ajar dosen.
- Pastikan halaman mahasiswa `DEMO26001 - Ayu Mahasiswa Demo` menampilkan grafik CPL.
- Gunakan dua jendela browser terpisah: jendela biasa untuk admin dan jendela privat untuk dosen. Ini menghindari logout berulang.
- Tutup tab, notifikasi, dan aplikasi lain yang tidak dibutuhkan.

Jika muncul `Too Many Attempts`, jalankan dari `apps/api`:

```bash
php artisan cache:clear
```

## Naskah presentasi utama

### 1. Pembukaan

Tampilan: halaman login, lalu masuk sebagai admin jurusan.

Narasi yang disarankan:

> SI-CPL Terintegrasi membantu program studi mengelola siklus OBE secara utuh. Sistem tidak hanya menyimpan nilai akhir, tetapi menjaga keterlacakan dari profil lulusan, CPL, CPMK mata kuliah, komponen asesmen, sampai capaian setiap mahasiswa.

### 2. Tunjukkan dashboard hasil yang sudah jadi

1. Buka menu **Dashboard**.
2. Tunjukkan jumlah mahasiswa, mata kuliah, CPL terukur, dan rata-rata capaian.
3. Tunjukkan grafik **Ketercapaian CPL**.
4. Tunjukkan bagian **Ketercapaian Profil Lulusan**.

Narasi:

> Dashboard ini memakai nilai resmi yang sudah dikunci. Nilai berstatus draf, diajukan, atau baru disetujui belum memengaruhi indikator jurusan.

Hal yang perlu ditekankan:

- CPL merupakan indikator utama tingkat program studi.
- CPMK berfungsi sebagai diagnosis untuk mengetahui sumber capaian CPL.
- Profil lulusan dihitung dari CPL inti dan CPL pendukung yang telah dipetakan.

### 3. Jelaskan struktur data OBE

Lakukan singkat agar fokus tetap pada alur kerja.

1. Buka **Profil Lulusan** dan pilih salah satu profil.
2. Tunjukkan CPL inti dan CPL pendukungnya.
3. Buka **Mata Kuliah**, pilih **Data Analitik**.
4. Tunjukkan CPMK mata kuliah beserta CPL tujuan dan bobot kontribusinya.
5. Buka **Rencana Asesmen**, cari `Data Analitik` kelas `DEMO-B`, lalu tunjukkan komponen penilaian dengan total bobot 100%.

Narasi:

> CPMK melekat pada mata kuliah karena kemampuan yang dinilai pada setiap mata kuliah berbeda. Komponen tugas, kuis, UTS, UAS, presentasi, atau proyek bersifat fleksibel dan disusun dalam rencana asesmen. Dosen tidak menentukan bobot saat memasukkan nilai.

### 4. Tugaskan dosen ke kelas DEMO-B

1. Buka **Penugasan Dosen**.
2. Klik **Tambah Penugasan**.
3. Isi data berikut.

| Field | Nilai |
| --- | --- |
| Dosen | I Made Dosen Demo, S.E., M.Ak. (`DEMO-NIP-001`) |
| Mata Kuliah | `MKK2462401108 - Data Analitik` |
| Kelas | `DEMO-B` |
| Angkatan | `2026` |
| Tahun Ajaran | `2026/2027` |
| Semester | `Ganjil` |
| Status Penugasan | `Aktif` |

4. Simpan penugasan.
5. Bila diperlukan, gunakan aksi **Sinkronkan Mahasiswa** pada baris penugasan.

Narasi:

> Hak akses dosen berasal dari penugasan mata kuliah, kelas, dan periode. Dengan demikian, dosen hanya dapat melihat serta mengisi nilai kelas yang memang ditugaskan kepadanya.

### 5. Masukkan nilai sebagai dosen

1. Beralih ke jendela dosen.
2. Refresh halaman dan buka **Dashboard Dosen**.
3. Pastikan kelas **Data Analitik - DEMO-B** muncul.
4. Buka **Input Nilai CPMK**, lalu klik **Input Nilai** pada kelas tersebut.
5. Tunjukkan bahwa kolom nilai dibuat otomatis dari rencana asesmen.
6. Isi nilai secara manual atau gunakan **Unduh Template** dan **Impor Excel**.
7. Klik **Simpan Draf**.
8. Buka tab **Statistik CPMK** untuk menunjukkan pratinjau capaian.
9. Isi catatan analisis berikut:

```text
Sebagian besar mahasiswa telah mencapai CPMK pengolahan dan visualisasi data. Mahasiswa yang belum mencapai target memerlukan latihan tambahan secara bertahap pada pembersihan data dan otomasi VBA.
```

10. Klik **Simpan Analisis**, lalu **Ajukan Nilai**.

Narasi:

> Dosen memasukkan skor mentah 0 sampai 100. Bobot sudah berasal dari rencana asesmen dan perhitungan dilakukan sistem. Simpan Draf digunakan selama proses koreksi, sedangkan Ajukan Nilai mengirim buku nilai untuk diverifikasi admin jurusan.

### 6. Setujui dan kunci nilai sebagai admin

1. Kembali ke jendela admin dan refresh halaman.
2. Buka **Penugasan Dosen**.
3. Tunjukkan status `Submitted` pada `DEMO-B`.
4. Klik ikon **Setujui Nilai**; status berubah menjadi `Approved`.
5. Klik ikon **Kunci Nilai**; status berubah menjadi `Locked`.

Narasi:

> Persetujuan menyatakan nilai telah diverifikasi. Penguncian menjadikannya sumber resmi untuk perhitungan CPL, profil lulusan, laporan, dan transkrip OBE. Jika ada koreksi, admin dapat membuka kembali nilai dengan alasan yang tercatat.

### 7. Tunjukkan perubahan hasil

1. Kembali ke **Dashboard**.
2. Tunjukkan perubahan rata-rata dan jumlah data terukur.
3. Buka **Mahasiswa**.
4. Pilih `DEMO26004 - Ni Luh Putri Demo`.
5. Tunjukkan radar kompetensi dan nilai per CPL yang sekarang sudah terisi.
6. Klik **Transkrip OBE** untuk menunjukkan laporan individu.

Narasi:

> Setelah dikunci, data yang sebelumnya belum terukur langsung mengalir ke capaian mahasiswa, agregasi CPL program studi, ketercapaian profil lulusan, dan transkrip OBE.

### 8. Penutup

Narasi:

> Dengan alur ini, program studi memperoleh data capaian yang konsisten, dapat ditelusuri, dan siap digunakan untuk evaluasi kurikulum maupun akreditasi. Dosen tetap fokus pada pemberian nilai, sedangkan pemetaan dan agregasi dikerjakan sistem.

## Nilai latihan DEMO-B

Gunakan data berikut agar hasil demo bervariasi dan mudah dijelaskan.

| Mahasiswa | Tugas Pengolahan | UTS Pengolah Angka | Tugas Pembersihan | Kuis Kualitas Data | UAS Manajemen Data | Tugas Visualisasi | Presentasi Analisis | UAS Analisis Data | Proyek VBA | UAS Otomasi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ni Luh Putri Demo | 86 | 84 | 82 | 80 | 85 | 88 | 87 | 86 | 90 | 89 |
| I Wayan Aditya Demo | 78 | 76 | 75 | 72 | 77 | 80 | 79 | 78 | 82 | 80 |
| Kadek Surya Demo | 70 | 68 | 72 | 65 | 69 | 74 | 71 | 70 | 76 | 73 |

Perkiraan nilai akhir berbobot:

| Mahasiswa | Nilai akhir |
| --- | ---: |
| Ni Luh Putri Demo | 86.30 |
| I Wayan Aditya Demo | 78.30 |
| Kadek Surya Demo | 71.55 |

Hasil ini sengaja menghasilkan mahasiswa dengan capaian tinggi, cukup, dan masih memerlukan tindak lanjut.

## Versi demo singkat lima menit

Gunakan urutan berikut bila waktu terbatas:

1. Login admin dan tunjukkan dashboard `DEMO-A`.
2. Tunjukkan pemetaan Data Analitik: CPMK ke CPL.
3. Login dosen dan tunjukkan buku nilai `DEMO-A` yang sudah dikunci.
4. Kembali ke admin, buka Ayu Mahasiswa Demo, lalu tampilkan radar CPL dan Transkrip OBE.
5. Tutup dengan penjelasan bahwa `DEMO-B` tersedia untuk simulasi alur penugasan dan input nilai secara penuh.

## Strategi cadangan saat presentasi

| Kendala | Tindakan |
| --- | --- |
| Input 30 nilai memakan waktu | Isi satu mahasiswa secara manual untuk menjelaskan UI; sebelum presentasi, siapkan template Excel berisi nilai latihan untuk mengisi sisanya |
| Penugasan `DEMO-B` sudah terlanjur dibuat | Lanjutkan dari akun dosen, atau reset seeder setelah presentasi |
| Nilai belum muncul di dashboard | Pastikan status sudah `Locked`, bukan hanya `Submitted` atau `Approved` |
| Grafik mahasiswa kosong | Pastikan mahasiswa berasal dari kelas yang nilainya sudah `Locked`; gunakan Ayu (`DEMO26001`) sebagai contoh aman |
| Login dibatasi | Jalankan `php artisan cache:clear`, lalu tunggu beberapa detik dan login kembali |
| Demo langsung terganggu | Gunakan `DEMO-A` untuk tetap menunjukkan hasil akhir tanpa mengubah data |

## Mengembalikan kondisi awal

Jalankan dari folder `apps/api`:

```bash
php artisan db:seed --class=DemoGradeWorkflowSeeder
```

Seeder aman dijalankan berulang kali pada environment `local` atau `testing`. Perintah tersebut akan:

- mempertahankan `DEMO-A` sebagai contoh data terukur;
- mengembalikan `DEMO-B` menjadi `Draft` tanpa skor;
- menghapus penugasan dosen untuk `DEMO-B`;
- menyiapkan kembali akun dan kata sandi demo.

## Checklist akhir presenter

- [ ] Backend aktif di `http://localhost:4000`.
- [ ] Frontend aktif di `http://localhost:5173`.
- [ ] Akun admin dan dosen sudah diuji.
- [ ] Dashboard menampilkan data `DEMO-A`.
- [ ] `DEMO-B` siap untuk penugasan langsung.
- [ ] Nilai latihan tersedia di layar atau catatan presenter.
- [ ] Dua sesi browser terpisah sudah dibuka.
- [ ] Jalur demo singkat dan strategi cadangan sudah dipahami.
