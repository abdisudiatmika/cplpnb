# Diagram Relasi Penilaian Dosen

Diagram berikut menggambarkan hubungan data yang direncanakan. Ini adalah desain konseptual, bukan migration yang sudah diterapkan.

```mermaid
erDiagram
    USERS ||--o| LECTURERS : memiliki
    DEPARTMENTS ||--o{ LECTURERS : menaungi
    DEPARTMENTS ||--o{ CLASSES : memiliki
    ACADEMIC_PERIODS ||--o{ COURSE_OFFERINGS : digunakan
    COURSES ||--o{ COURSE_OFFERINGS : ditawarkan
    CLASSES ||--o{ COURSE_OFFERINGS : mengikuti

    COURSE_OFFERINGS ||--o{ COURSE_ENROLLMENTS : memiliki
    STUDENTS ||--o{ COURSE_ENROLLMENTS : terdaftar

    COURSE_OFFERINGS ||--o{ TEACHING_ASSIGNMENTS : diajar
    LECTURERS ||--o{ TEACHING_ASSIGNMENTS : menerima

    COURSES ||--o{ CPMKS : memiliki
    CPMKS ||--o{ CPMK_CPL_MAPPINGS : dipetakan
    CPLS ||--o{ CPMK_CPL_MAPPINGS : dicapai

    COURSE_OFFERINGS ||--o{ ASSESSMENT_PLANS : memiliki
    ASSESSMENT_PLANS ||--o{ ASSESSMENT_ITEMS : terdiri_dari
    CPMKS ||--o{ ASSESSMENT_ITEMS : diukur_oleh

    COURSE_ENROLLMENTS ||--o{ STUDENT_ASSESSMENT_SCORES : memperoleh
    ASSESSMENT_ITEMS ||--o{ STUDENT_ASSESSMENT_SCORES : dinilai

    ASSESSMENT_PLANS ||--o{ GRADE_SUBMISSIONS : diajukan
    STUDENT_ASSESSMENT_SCORES ||--o{ GRADE_AUDIT_LOGS : diaudit
```

## Alur Data

```text
Admin membuat kelas dan penawaran mata kuliah
    -> admin mendaftarkan peserta
    -> admin menugaskan dosen
    -> admin membuat CPMK dan pemetaan CPL
    -> admin membuat rencana dan item penilaian
    -> sistem memvalidasi total bobot 100%
    -> rencana dipublikasikan
    -> dosen mengisi skor
    -> sistem menghitung nilai akhir, CPMK, dan CPL
    -> dosen mengajukan
    -> koordinator menyetujui
    -> nilai dikunci
```

## Batas Keamanan Utama

`course_offering_id` menjadi batas utama akses dosen. Seluruh permintaan skor harus ditelusuri melalui penugasan dosen pada penawaran mata kuliah tersebut. Identitas `student_id`, `course_id`, atau `class_id` dari frontend tidak boleh dipercaya tanpa pemeriksaan relasi di backend.
