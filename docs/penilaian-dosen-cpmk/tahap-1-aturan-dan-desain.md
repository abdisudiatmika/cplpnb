# Tahap 1 Aturan Akademik dan Desain Penilaian Dosen

## 1. Tujuan

Dokumen ini menjadi acuan sebelum pengembangan fitur input nilai dosen berbasis CPL dan CPMK. Tahap ini belum mengubah database, API, atau tampilan produksi. Semua implementasi berikutnya harus mengikuti keputusan dalam dokumen ini dan dikerjakan pada branch `codex/penilaian-dosen-cpmk`.

Sasaran utama sistem adalah:

- admin menyiapkan struktur akademik dan penilaian;
- dosen hanya mengisi skor mahasiswa dan analisis ketercapaian;
- sistem menghitung nilai akhir, nilai huruf, CPMK, dan CPL;
- koordinator memeriksa dan memfinalisasi nilai;
- admin dapat membuka kembali nilai yang terkunci dengan alasan yang tercatat.

## 2. Keputusan Utama

### 2.1 Pembagian kewenangan

| Peran | Kewenangan |
| --- | --- |
| Super admin | Mengelola jurusan, akun, periode global, dan seluruh konfigurasi |
| Admin jurusan | Mengelola dosen, kelas, peserta, CPL, CPMK, komponen, bobot, dan penugasan dalam jurusannya |
| Koordinator mata kuliah | Memeriksa konfigurasi, memeriksa nilai tim, mengajukan finalisasi, dan menyetujui sesuai kebijakan jurusan |
| Dosen anggota | Mengisi skor pada kelas dan komponen yang ditugaskan serta menulis analisis CPMK |

Backend wajib memeriksa kewenangan ini. Menyembunyikan menu pada frontend saja tidak dianggap sebagai pengamanan.

### 2.2 Konfigurasi bobot

Bobot tidak diisi oleh dosen pada halaman input nilai. Admin jurusan atau koordinator yang diberi hak konfigurasi menetapkan bobot berdasarkan RPS sebelum pengisian nilai dibuka.

Sistem menyediakan template awal berikut, tetapi admin dapat menyesuaikannya sesuai RPS:

| Kelompok komponen | Bobot awal |
| --- | ---: |
| Tugas | 20% |
| Kuis | 15% |
| UTS | 30% |
| UAS | 35% |
| Total | 100% |

Template bukan aturan wajib untuk seluruh mata kuliah. Mata kuliah praktik, proyek, seminar, magang, dan bentuk pembelajaran lain dapat menggunakan komponen berbeda.

Aturan bobot:

1. Total seluruh item penilaian dalam satu rencana harus tepat 100% sebelum dipublikasikan.
2. Setiap item penilaian harus terhubung ke minimal satu CPMK.
3. Setiap CPMK yang digunakan dalam mata kuliah harus terhubung ke minimal satu CPL.
4. Satu CPMK tidak wajib memiliki UAS. CPMK dapat dinilai melalui tugas, kuis, UTS, UAS, praktik, proyek, presentasi, atau komponen lain.
5. Sistem boleh membuat pembagian awal secara otomatis, tetapi admin harus meninjau dan mengesahkannya.
6. Konfigurasi tidak boleh diubah setelah nilai diajukan atau dikunci. Perubahan harus melalui pembuatan revisi rencana.

### 2.3 Pengisian nilai

- Dosen hanya melihat mata kuliah, kelas, periode, mahasiswa, dan item penilaian yang ditugaskan.
- Skor menggunakan rentang 0 sampai 100.
- Nilai yang belum diisi disimpan sebagai `NULL`, bukan `0`.
- Angka `0` berarti mahasiswa benar-benar memperoleh skor nol.
- Nilai akhir dan nilai huruf tidak diketik manual oleh dosen.
- Sistem mencatat pengguna dan waktu setiap perubahan skor.
- Dosen dapat menyimpan draft sebelum seluruh skor terisi.
- Finalisasi ditolak jika masih ada skor wajib yang kosong, kecuali memiliki status pengecualian yang sah.

### 2.4 Mahasiswa tidak mengikuti UAS

Status presensi atau larangan mengikuti UAS tidak boleh direpresentasikan hanya dengan warna merah. Data harus mempunyai status terstruktur, misalnya:

- `eligible`;
- `not_eligible_attendance`;
- `excused`;
- `absent`;
- `makeup_exam`.

Status ditampilkan pada form dan dipakai oleh aturan finalisasi. Skor kosong karena belum dinilai harus dibedakan dari skor kosong karena mahasiswa tidak berhak mengikuti ujian.

## 3. Model Perhitungan

### 3.1 Nilai akhir mata kuliah

Untuk item penilaian `i` dengan skor `s_i` dan bobot `w_i`:

```text
Nilai akhir = jumlah(s_i x w_i) / 100
```

Perhitungan resmi hanya dilakukan jika rencana telah dipublikasikan dan semua skor wajib telah lengkap atau memiliki pengecualian yang sah.

### 3.2 Nilai CPMK

Nilai CPMK dinormalisasi terhadap total bobot item yang mengukur CPMK tersebut:

```text
Nilai CPMK = jumlah(s_i x w_i) / jumlah(w_i untuk CPMK terkait)
```

Contoh:

```text
CPMK-01 diukur oleh Tugas 10% dan UTS 15%
Skor Tugas = 80
Skor UTS   = 70

Nilai CPMK-01 = ((80 x 10) + (70 x 15)) / 25 = 74
```

### 3.3 Nilai CPL

Pada versi awal, satu CPMK dipetakan ke satu CPL utama. Nilai CPL mahasiswa dihitung dari rata-rata berbobot CPMK yang terkait. Bobot kontribusi CPMK ke CPL ditetapkan admin dan dinormalisasi di dalam CPL.

```text
Nilai CPL = jumlah(nilai CPMK x bobot kontribusi) / jumlah(bobot kontribusi)
```

Pada tahap lanjutan, satu CPMK dapat dipetakan ke beberapa CPL jika kebijakan akademik membutuhkan. Sistem harus mencegah perhitungan ganda dengan bobot alokasi yang eksplisit.

### 3.4 Nilai huruf

Nilai huruf dihitung dari nilai akhir menggunakan skala yang dikonfigurasi per jurusan atau kurikulum. Sistem tidak boleh menerima nilai huruf yang bertentangan dengan nilai angka.

## 4. Status Proses Nilai

```text
DRAFT -> SUBMITTED -> APPROVED -> LOCKED
```

| Status | Makna |
| --- | --- |
| `DRAFT` | Dosen masih dapat mengubah skor |
| `SUBMITTED` | Dosen telah mengajukan nilai untuk diperiksa |
| `APPROVED` | Koordinator atau admin menyatakan nilai valid |
| `LOCKED` | Nilai tidak dapat diubah tanpa pembukaan resmi |

Pembukaan nilai terkunci wajib menyimpan alasan, pelaksana, dan waktu perubahan.

## 5. Rancangan Data Konseptual

Rancangan ini bersifat aditif. Tabel lama tidak dihapus pada tahap pengembangan.

### 5.1 Pengguna dan dosen

```text
lecturers
- id
- user_id
- department_id
- employee_number
- name
- status
```

### 5.2 Periode, kelas, dan peserta

```text
academic_periods
- id
- academic_year
- semester
- starts_at
- ends_at
- status

classes
- id
- department_id
- name
- cohort_year
- status

course_offerings
- id
- course_id
- class_id
- academic_period_id
- status

course_enrollments
- id
- course_offering_id
- student_id
- enrollment_status
```

### 5.3 Penugasan dosen

```text
teaching_assignments
- id
- course_offering_id
- lecturer_id
- role
- status
- assigned_by
```

Nilai `role` minimal terdiri dari `coordinator` dan `member`.

### 5.4 CPMK dan pemetaan CPL

```text
cpmks
- id
- course_id
- code
- description
- curriculum_version
- status

cpmk_cpl_mappings
- id
- cpmk_id
- cpl_id
- contribution_weight
```

### 5.5 Rencana dan item penilaian

Setiap kolom yang terlihat pada form dosen merupakan satu item penilaian atomik. Contohnya `Tugas 1 untuk CPMK01-01` dan `UAS untuk CPMK01-01` adalah dua item berbeda.

```text
assessment_plans
- id
- course_offering_id
- version
- status
- published_by
- published_at

assessment_items
- id
- assessment_plan_id
- cpmk_id
- category
- name
- weight
- sequence
- is_required
```

Nilai `category` dapat berisi `assignment`, `quiz`, `midterm`, `final`, `project`, `practice`, `presentation`, atau `other`. Nama tampilan tetap bebas, misalnya `Tugas Proyek` atau `Ujian Praktik`.

### 5.6 Skor mahasiswa

```text
student_assessment_scores
- id
- course_enrollment_id
- assessment_item_id
- score nullable
- eligibility_status
- note
- entered_by
- entered_at
- updated_by
- updated_at
```

Kombinasi `course_enrollment_id` dan `assessment_item_id` harus unik.

### 5.7 Pengajuan, penguncian, dan audit

```text
grade_submissions
- id
- assessment_plan_id
- status
- submitted_by
- submitted_at
- approved_by
- approved_at
- locked_by
- locked_at

grade_audit_logs
- id
- score_id
- old_score
- new_score
- action
- reason
- user_id
- created_at
```

## 6. Aturan Hak Akses

Permintaan dosen terhadap nilai hanya diizinkan jika seluruh kondisi berikut terpenuhi:

```text
pengguna terhubung ke lecturer
AND lecturer memiliki teaching_assignment aktif
AND assignment terhubung ke course_offering yang diminta
AND periode masih dapat diisi
AND assessment_plan sudah dipublikasikan
AND grade_submission belum LOCKED
```

Admin jurusan hanya boleh mengakses data dengan `department_id` yang sama. Super admin dapat mengakses seluruh jurusan.

## 7. Validasi Wajib

Sebelum rencana penilaian dipublikasikan:

- total bobot tepat 100%;
- setiap bobot lebih besar dari 0;
- setiap item mempunyai CPMK;
- setiap CPMK mempunyai CPL;
- kode CPMK unik dalam mata kuliah dan versi kurikulum;
- tidak ada dua item dengan urutan yang sama dalam satu rencana;
- mata kuliah, kelas, periode, dan jurusan konsisten.

Sebelum nilai dikunci:

- seluruh peserta aktif telah diproses;
- seluruh skor wajib sudah diisi atau memiliki pengecualian;
- semua skor berada pada rentang 0 sampai 100;
- nilai akhir dan nilai huruf berhasil dihitung;
- analisis ketercapaian CPMK telah diisi jika diwajibkan;
- tidak ada perubahan konfigurasi setelah pengajuan.

## 8. Strategi Kompatibilitas

Fitur lama tetap berjalan selama pengembangan.

1. Jangan menghapus atau mengubah arti tabel `student_grades` dan `course_cpl_mappings` pada tahap awal.
2. Tambahkan tabel baru melalui migration terpisah.
3. Aktifkan fitur baru menggunakan feature flag atau hanya untuk kelas pilot.
4. Nilai lama tetap menjadi sumber laporan lama sampai hasil perhitungan baru diverifikasi.
5. Setelah nilai baru dikunci, sistem dapat menulis ringkasan nilai akhir ke `student_grades` sebagai jembatan sementara.
6. Migrasi penghapusan struktur lama hanya boleh dibuat setelah seluruh laporan menggunakan struktur baru dan data telah diaudit.

Kondisi sistem saat ini yang harus diperhatikan pada Tahap 2:

- kolom `users.role` merupakan enum dengan nilai `super_admin`, `admin_jurusan`, dan `user`;
- role `dosen` harus ditambahkan menggunakan migration baru, bukan dengan mengedit migration lama;
- API nilai saat ini menyimpan satu nilai akhir per pasangan mahasiswa dan mata kuliah pada `student_grades`;
- pemetaan saat ini langsung menghubungkan mata kuliah dan CPL melalui `course_cpl_mappings`;
- struktur baru harus berjalan berdampingan sampai hasil perhitungan CPMK dan CPL baru terverifikasi.

## 9. Strategi Pengembangan Aman

- Pengembangan dilakukan pada branch `codex/penilaian-dosen-cpmk`.
- Pengujian pertama menggunakan database lokal dan data fiktif.
- Jangan menggunakan akun atau database production untuk pengujian fitur.
- Setiap tahap dibuat dalam migration dan commit terpisah.
- Migration harus memiliki jalur `down()` yang aman selama belum digunakan di production.
- Sebelum deployment, uji migration terhadap salinan database production.
- Backup database production sebelum migration pertama.
- Mulai production dengan satu kelas pilot.
- Sediakan prosedur rollback aplikasi dan database.

## 10. Batas Tahap 1

Tahap 1 menghasilkan keputusan dan desain. Tahap ini tidak mencakup:

- migration database;
- penambahan role dosen;
- form input nilai;
- perubahan rumus laporan production;
- impor data dosen atau KRS;
- deployment ke server.

## 11. Kriteria Selesai Tahap 1

Tahap 1 dinyatakan selesai jika:

- pembagian kewenangan telah ditetapkan;
- aturan bobot dan CPMK telah ditetapkan;
- rumus nilai akhir, CPMK, dan CPL telah ditulis;
- status nilai dan penguncian telah ditetapkan;
- rancangan tabel telah tersedia;
- validasi utama telah tersedia;
- strategi kompatibilitas dan rollback telah tersedia;
- belum ada perubahan pada database atau production.

## 12. Tahap Berikutnya

Tahap 2 akan membuat role dan master dosen menggunakan tabel baru tanpa mengubah fungsi nilai lama. Sebelum tahap tersebut dimulai, dokumen ini digunakan sebagai sumber keputusan implementasi.
