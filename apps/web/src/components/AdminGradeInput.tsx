import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

export type AdminGradeMode = 'cpmk' | 'single';

interface CourseOption {
  id: string;
  code: string;
  name: string;
  sks: number;
  semester?: number | string | null;
}

interface StudentOption {
  angkatan: string;
  kelas: string;
}

interface SheetCpmk {
  id: string;
  code: string;
  description: string;
  cpls: string[];
}

interface SheetStudent {
  id: string;
  nim: string;
  name: string;
  kelas: string;
  status: string;
  single: { score: number; grade: string; semester: string; academicYear: string } | null;
  cpmkScores: Record<string, number>;
  dosenGraded: boolean;
}

interface Sheet {
  course: { id: string; code: string; name: string; sks: number; semester: number | null };
  cpmks: SheetCpmk[];
  defaults: { semester: number | null; academicYear: string | null };
  students: SheetStudent[];
}

interface Props {
  mode: AdminGradeMode;
  courses: CourseOption[];
  students: StudentOption[];
  apiCall: (path: string, method?: string, body?: any) => Promise<any>;
  showToast: (message: string) => void;
  showNotice: (title: string, message: string, tone?: 'primary' | 'warning' | 'danger') => void;
  requestConfirmation: (options: { title: string; message: string; confirmLabel?: string; tone?: 'primary' | 'warning' | 'danger' }) => Promise<boolean>;
  renderCoursePicker: (value: string, onChange: (value: string) => void, options: { value: string; label: string; meta?: string }[]) => React.ReactNode;
}

// Skala huruf mutu sama dengan backend (StudentCplAchievementService::letterForScore).
export const letterForScore = (score: number) => {
  if (score >= 81) return 'A';
  if (score >= 76) return 'AB';
  if (score >= 66) return 'B';
  if (score >= 61) return 'BC';
  if (score >= 56) return 'C';
  if (score >= 41) return 'D';
  return 'E';
};

const formatScore = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(Math.round(value * 100) / 100));

/** '' = kosong, null = tidak valid, angka = valid (0-100). */
const parseScore = (raw: unknown): number | '' | null => {
  if (raw === null || raw === undefined) return '';
  const text = String(raw).trim().replace(',', '.');
  if (text === '') return '';
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;
};

const sanitizeFilePart = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, '_');

export function AdminGradeInput({ mode, courses, students, apiCall, showToast, showNotice, requestConfirmation, renderCoursePicker }: Props) {
  const [courseId, setCourseId] = useState('');
  const [angkatan, setAngkatan] = useState('');
  const [kelas, setKelas] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [semester, setSemester] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [search, setSearch] = useState('');
  // Perubahan yang belum disimpan: singleEdits[studentId] dan cpmkEdits[studentId][cpmkId] berisi teks input.
  const [singleEdits, setSingleEdits] = useState<Record<string, string>>({});
  const [cpmkEdits, setCpmkEdits] = useState<Record<string, Record<string, string>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const angkatanOptions = useMemo(() => Array.from(new Set(students.map(s => s.angkatan).filter(Boolean))).sort().reverse(), [students]);
  const kelasOptions = useMemo(() => Array.from(new Set(students.filter(s => !angkatan || s.angkatan === angkatan).map(s => s.kelas).filter(Boolean))).sort(), [students, angkatan]);
  const courseOptions = useMemo(() => [...courses]
    .sort((a, b) => (Number(a.semester || 0) - Number(b.semester || 0)) || a.code.localeCompare(b.code))
    .map(course => ({
      value: course.id,
      label: `${course.code} — ${course.name}`,
      meta: `Semester ${course.semester || '-'} · ${course.sks} SKS`,
    })), [courses]);

  const singleDirtyCount = Object.keys(singleEdits).length;
  const cpmkDirtyCount = Object.values(cpmkEdits).reduce((total, row) => total + Object.keys(row).length, 0);
  const hasUnsaved = singleDirtyCount + cpmkDirtyCount > 0;
  const dirtyCount = mode === 'single' ? singleDirtyCount : cpmkDirtyCount;

  const loadSheet = async (nextCourseId = courseId, nextAngkatan = angkatan, nextKelas = kelas, silent = false) => {
    if (!nextCourseId || !nextAngkatan) {
      setSheet(null);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ courseId: nextCourseId, angkatan: nextAngkatan });
      if (nextKelas) params.set('kelas', nextKelas);
      const data: Sheet = await apiCall(`/admin-grades/sheet?${params.toString()}`);
      setSheet(data);
      if (!silent) {
        setSemester(data.defaults.semester ? String(data.defaults.semester) : '');
        setAcademicYear(data.defaults.academicYear || '');
      }
      setSingleEdits({});
      setCpmkEdits({});
    } catch (error: any) {
      setSheet(null);
      showToast(error.message || 'Gagal memuat daftar nilai.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, angkatan, kelas]);

  const changeFilter = async (apply: () => void) => {
    if (hasUnsaved && !await requestConfirmation({
      title: 'Buang perubahan yang belum disimpan?',
      message: 'Ada nilai yang belum disimpan. Mengganti mata kuliah, angkatan, atau kelas akan membuang perubahan tersebut.',
      confirmLabel: 'Buang dan ganti',
      tone: 'warning',
    })) return;
    apply();
  };

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (sheet?.students || []).filter(student => !query || `${student.nim} ${student.name}`.toLowerCase().includes(query));
  }, [sheet, search]);

  const singleValue = (student: SheetStudent) => (student.id in singleEdits ? singleEdits[student.id] : formatScore(student.single?.score));
  const cpmkValue = (student: SheetStudent, cpmkId: string) => {
    const edited = cpmkEdits[student.id];
    return edited && cpmkId in edited ? edited[cpmkId] : formatScore(student.cpmkScores[cpmkId]);
  };

  const setSingle = (student: SheetStudent, text: string) => {
    setSingleEdits(current => {
      const next = { ...current };
      if (text.trim() === formatScore(student.single?.score)) delete next[student.id];
      else next[student.id] = text;
      return next;
    });
  };

  const setCpmk = (student: SheetStudent, cpmkId: string, text: string) => {
    setCpmkEdits(current => {
      const row = { ...(current[student.id] || {}) };
      if (text.trim() === formatScore(student.cpmkScores[cpmkId])) delete row[cpmkId];
      else row[cpmkId] = text;
      const next = { ...current };
      if (Object.keys(row).length === 0) delete next[student.id];
      else next[student.id] = row;
      return next;
    });
  };

  const discardChanges = () => {
    if (mode === 'single') setSingleEdits({});
    else setCpmkEdits({});
  };

  const save = async () => {
    if (!sheet) return;
    const semesterNumber = Number(semester);
    if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 14) {
      showToast('Isi semester dengan angka 1 sampai 14.');
      return;
    }
    if (!/^\d{4}\/\d{4}$/.test(academicYear.trim())) {
      showToast('Tahun ajaran harus berformat 2025/2026.');
      return;
    }

    let invalid = 0;
    let deletions = 0;
    let rows: any[] = [];
    if (mode === 'single') {
      rows = Object.entries(singleEdits).map(([studentId, text]) => {
        const parsed = parseScore(text);
        if (parsed === null) invalid++;
        if (parsed === '') deletions++;
        return { studentId, score: parsed === '' ? null : parsed };
      });
    } else {
      rows = Object.entries(cpmkEdits).map(([studentId, cells]) => ({
        studentId,
        scores: Object.fromEntries(Object.entries(cells).map(([cpmkId, text]) => {
          const parsed = parseScore(text);
          if (parsed === null) invalid++;
          if (parsed === '') deletions++;
          return [cpmkId, parsed === '' ? null : parsed];
        })),
      }));
    }

    if (rows.length === 0) {
      showToast('Belum ada perubahan nilai.');
      return;
    }
    if (invalid > 0) {
      showToast(`${invalid} nilai tidak valid (ditandai merah). Isi angka 0 sampai 100.`);
      return;
    }
    if (deletions > 0 && !await requestConfirmation({
      title: 'Hapus nilai yang dikosongkan?',
      message: `${deletions} nilai dikosongkan dan akan dihapus dari sistem. Lanjutkan menyimpan?`,
      confirmLabel: 'Simpan dan hapus',
      tone: 'danger',
    })) return;

    setSaving(true);
    try {
      const result = await apiCall(mode === 'single' ? '/admin-grades/single-scores' : '/admin-grades/cpmk-scores', 'PUT', {
        courseId: sheet.course.id,
        semester: semesterNumber,
        academicYear: academicYear.trim(),
        rows,
      });
      if (result?.dosenGraded > 0) showNotice('Nilai disimpan', result.message, 'primary');
      else showToast(result?.message || 'Nilai disimpan.');
      await loadSheet(courseId, angkatan, kelas, true);
    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan nilai.');
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    if (!sheet) return;
    const workbook = XLSX.utils.book_new();
    const course = sheet.course;
    const info: any[][] = [
      ['Kode MK', course.code],
      ['Nama MK', course.name],
      ['Angkatan', angkatan],
      ['Kelas', kelas || 'Semua'],
      ['Semester', semester],
      ['Tahun Ajaran', academicYear],
    ];

    if (mode === 'cpmk') {
      const rows: any[][] = [
        ['NIM', 'Nama', 'Kelas', ...sheet.cpmks.map(cpmk => cpmk.code)],
        ...sheet.students.map(student => [student.nim, student.name, student.kelas, ...sheet.cpmks.map(cpmk => {
          const parsed = parseScore(cpmkValue(student, cpmk.id));
          return typeof parsed === 'number' ? parsed : '';
        })]),
      ];
      const dataSheet = XLSX.utils.aoa_to_sheet(rows);
      dataSheet['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 8 }, ...sheet.cpmks.map(() => ({ wch: 12 }))];
      XLSX.utils.book_append_sheet(workbook, dataSheet, 'Nilai_CPMK');
      info.push([], ['Kode CPMK', 'Deskripsi', 'CPL'], ...sheet.cpmks.map(cpmk => [cpmk.code, cpmk.description, cpmk.cpls.join(', ')]));
    } else {
      const rows: any[][] = [
        ['NIM', 'Nama', 'Kelas', 'Kode MK', 'Nama MK', 'Nilai'],
        ...sheet.students.map(student => {
          const parsed = parseScore(singleValue(student));
          return [student.nim, student.name, student.kelas, course.code, course.name, typeof parsed === 'number' ? parsed : ''];
        }),
      ];
      const dataSheet = XLSX.utils.aoa_to_sheet(rows);
      dataSheet['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 8 }, { wch: 16 }, { wch: 32 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(workbook, dataSheet, 'Nilai_Satuan');
    }

    const infoSheet = XLSX.utils.aoa_to_sheet(info);
    infoSheet['!cols'] = [{ wch: 16 }, { wch: 60 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');
    const guide = XLSX.utils.aoa_to_sheet([
      ['Panduan Pengisian'],
      ['1', 'Jangan mengubah kolom NIM dan judul kolom.'],
      ['2', mode === 'cpmk' ? 'Isi nilai 0-100 pada setiap kolom CPMK.' : 'Isi kolom Nilai dengan angka 0-100. Huruf mutu dihitung otomatis oleh sistem.'],
      ['3', 'Sel yang dikosongkan tidak mengubah nilai yang sudah ada.'],
      ['4', 'Impor file ini dari halaman yang sama (mata kuliah dan angkatan yang sama), periksa tabel, lalu tekan Simpan.'],
    ]);
    guide['!cols'] = [{ wch: 6 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, guide, 'Panduan');

    const prefix = mode === 'cpmk' ? 'Template_Nilai_CPMK' : 'Template_Nilai_Satuan';
    XLSX.writeFile(workbook, `${prefix}_${sanitizeFilePart(course.code)}_${angkatan}${kelas ? `_${sanitizeFilePart(kelas)}` : ''}.xlsx`);
  };

  const importExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !sheet) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: 'array' });
        const preferred = mode === 'cpmk' ? 'nilai_cpmk' : 'nilai_satuan';
        const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === preferred) || workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as any[][];
        const errors: string[] = [];

        // Pastikan file dibuat untuk mata kuliah yang sama.
        const infoName = workbook.SheetNames.find(name => name.toLowerCase() === 'info');
        if (infoName) {
          const infoRows = XLSX.utils.sheet_to_json(workbook.Sheets[infoName], { header: 1, defval: '' }) as any[][];
          const fileCourse = String(infoRows.find(row => String(row[0]).trim().toLowerCase() === 'kode mk')?.[1] || '').trim();
          if (fileCourse && fileCourse.toUpperCase() !== sheet.course.code.toUpperCase()) {
            showNotice('File untuk mata kuliah lain', `File ini dibuat untuk ${fileCourse}, sedangkan yang dipilih ${sheet.course.code}. Pilih mata kuliah yang sesuai atau unduh template baru.`);
            return;
          }
        }

        const headerIndex = rows.findIndex(row => row.some(cell => String(cell).trim().toUpperCase() === 'NIM'));
        if (headerIndex < 0) {
          showNotice('Format tidak dikenali', 'Kolom NIM tidak ditemukan. Gunakan template yang diunduh dari halaman ini.');
          return;
        }
        const header = rows[headerIndex].map(cell => String(cell).trim());
        const nimColumn = header.findIndex(cell => cell.toUpperCase() === 'NIM');
        const studentsByNim = new Map(sheet.students.map(student => [String(student.nim).trim(), student]));

        let filled = 0;
        if (mode === 'cpmk') {
          const cpmkByCode = new Map(sheet.cpmks.map(cpmk => [cpmk.code.toUpperCase(), cpmk]));
          const ignoredHeaders = new Set(['NIM', 'NAMA', 'KELAS', '']);
          const columns = header
            .map((cell, index) => ({ index, code: cell.toUpperCase() }))
            .filter(column => !ignoredHeaders.has(column.code));
          const unknown = columns.filter(column => !cpmkByCode.has(column.code)).map(column => header[column.index]);
          if (unknown.length > 0) errors.push(`Kolom tidak dikenali sebagai CPMK ${sheet.course.code}: ${unknown.join(', ')}.`);
          const known = columns.filter(column => cpmkByCode.has(column.code));
          if (known.length === 0) {
            showNotice('Tidak ada kolom CPMK', `Tidak ada kolom yang cocok dengan CPMK ${sheet.course.code}. Unduh template baru dari halaman ini.`);
            return;
          }

          const updates: Record<string, Record<string, string>> = {};
          rows.slice(headerIndex + 1).forEach((row, offset) => {
            const nim = String(row[nimColumn] ?? '').trim();
            if (!nim) return;
            const student = studentsByNim.get(nim);
            if (!student) {
              errors.push(`Baris ${headerIndex + offset + 2}: NIM ${nim} tidak ada di angkatan/kelas yang dipilih.`);
              return;
            }
            known.forEach(column => {
              const parsed = parseScore(row[column.index]);
              if (parsed === '') return;
              if (parsed === null) {
                errors.push(`Baris ${headerIndex + offset + 2} (${nim}) ${header[column.index]}: "${row[column.index]}" bukan nilai 0-100.`);
                return;
              }
              const cpmk = cpmkByCode.get(column.code)!;
              if (parsed === student.cpmkScores[cpmk.id]) return;
              updates[student.id] = { ...(updates[student.id] || {}), [cpmk.id]: String(parsed) };
              filled++;
            });
          });
          setCpmkEdits(current => {
            const next = { ...current };
            Object.entries(updates).forEach(([studentId, cells]) => { next[studentId] = { ...(next[studentId] || {}), ...cells }; });
            return next;
          });
        } else {
          const scoreColumn = header.findIndex(cell => ['NILAI', 'NILAI ANGKA', 'NILAI_ANGKA'].includes(cell.toUpperCase()));
          const courseColumn = header.findIndex(cell => ['KODE MK', 'KODEMK', 'KODE_MK'].includes(cell.toUpperCase()));
          if (scoreColumn < 0) {
            showNotice('Kolom Nilai tidak ditemukan', 'Gunakan template Input Nilai Satuan yang diunduh dari halaman ini.');
            return;
          }
          const updates: Record<string, string> = {};
          rows.slice(headerIndex + 1).forEach((row, offset) => {
            const nim = String(row[nimColumn] ?? '').trim();
            if (!nim) return;
            const line = headerIndex + offset + 2;
            const rowCourse = courseColumn >= 0 ? String(row[courseColumn] ?? '').trim() : '';
            if (rowCourse && rowCourse.toUpperCase() !== sheet.course.code.toUpperCase()) {
              errors.push(`Baris ${line}: kode MK ${rowCourse} berbeda dari ${sheet.course.code}; baris dilewati.`);
              return;
            }
            const student = studentsByNim.get(nim);
            if (!student) {
              errors.push(`Baris ${line}: NIM ${nim} tidak ada di angkatan/kelas yang dipilih.`);
              return;
            }
            const parsed = parseScore(row[scoreColumn]);
            if (parsed === '') return;
            if (parsed === null) {
              errors.push(`Baris ${line} (${nim}): "${row[scoreColumn]}" bukan nilai 0-100.`);
              return;
            }
            if (parsed === student.single?.score) return;
            updates[student.id] = String(parsed);
            filled++;
          });
          setSingleEdits(current => ({ ...current, ...updates }));
        }

        const summary = filled > 0
          ? `${filled} nilai dari file dimasukkan ke tabel dan ditandai kuning. Periksa, lalu tekan "Simpan Perubahan".`
          : 'Tidak ada nilai baru di file (sel kosong atau nilai sama dengan yang tersimpan).';
        if (errors.length > 0) {
          showNotice('Impor selesai dengan catatan', `${summary}\n\n${errors.length} catatan:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n...dan ${errors.length - 8} lainnya` : ''}`);
        } else {
          showToast(summary);
        }
      } catch (error: any) {
        showToast(error.message || 'Gagal membaca file Excel.');
      }
    };
    reader.onerror = () => showToast('Gagal membaca file Excel.');
    reader.readAsArrayBuffer(file);
  };

  const cellProps = (text: string, edited: boolean) => {
    const state = parseScore(text) === null ? 'invalid' : edited ? 'edited' : 'saved';
    return {
      className: 'admin-grade-cell w-[72px] rounded-lg px-sm py-xs text-center font-body-sm',
      'data-state': state,
      'aria-invalid': state === 'invalid' ? true : undefined,
    };
  };

  const dosenCount = sheet?.students.filter(student => student.dosenGraded).length || 0;
  const cpmkCodes = sheet?.cpmks.map(cpmk => cpmk.code).join(', ');

  return (
    <div className="space-y-lg">
      <div className="glass-panel p-lg rounded-2xl shadow-sm grid grid-cols-1 md:grid-cols-12 gap-md items-end">
        <div className="md:col-span-6">
          <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Mata Kuliah</label>
          {renderCoursePicker(courseId, value => changeFilter(() => setCourseId(value)), courseOptions)}
        </div>
        <div className="md:col-span-3">
          <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase" htmlFor="admin-grade-angkatan">Angkatan</label>
          <select id="admin-grade-angkatan" className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-md font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none" value={angkatan} onChange={e => { const value = e.target.value; changeFilter(() => { setAngkatan(value); setKelas(''); }); }}>
            <option value="">Pilih angkatan</option>
            {angkatanOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase" htmlFor="admin-grade-kelas">Kelas</label>
          <select id="admin-grade-kelas" className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-md font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none" value={kelas} onChange={e => { const value = e.target.value; changeFilter(() => setKelas(value)); }}>
            <option value="">Semua kelas</option>
            {kelasOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>

      {!courseId || !angkatan ? (
        <div className="glass-panel rounded-xl p-xl text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-[40px] text-primary/60">{mode === 'cpmk' ? 'grid_on' : 'edit_note'}</span>
          <p className="mt-sm font-body-md">Pilih mata kuliah dan angkatan untuk mulai mengisi {mode === 'cpmk' ? 'nilai per CPMK' : 'nilai satuan'}.</p>
        </div>
      ) : loading ? (
        <div className="glass-panel rounded-xl p-xl text-center text-on-surface-variant">Memuat daftar mahasiswa...</div>
      ) : sheet && (
        <>
          <div className="glass-panel p-lg rounded-2xl shadow-sm flex flex-col lg:flex-row lg:items-end gap-md justify-between">
            <div className="flex flex-wrap gap-md items-end">
              <div>
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase" htmlFor="admin-grade-semester">Semester</label>
                <input id="admin-grade-semester" type="number" min={1} max={14} className="w-[110px] bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm" value={semester} onChange={e => setSemester(e.target.value)} />
              </div>
              <div>
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase" htmlFor="admin-grade-year">Tahun Ajaran</label>
                <input id="admin-grade-year" type="text" placeholder="2025/2026" className="w-[140px] bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm" value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
              </div>
              <p className="font-body-sm text-on-surface-variant max-w-[360px] pb-xs">Terisi otomatis dari angkatan dan semester MK. Dipakai untuk filter periode di laporan CPL.</p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <input type="file" accept=".xlsx,.xls" className="hidden" ref={fileInputRef} onChange={importExcel} />
              <button type="button" className="flex items-center gap-sm bg-surface text-on-surface border border-outline-variant px-lg py-sm rounded-xl font-label-sm font-bold hover:bg-surface-variant disabled:opacity-50" onClick={downloadTemplate} disabled={mode === 'cpmk' && sheet.cpmks.length === 0}>
                <span className="material-symbols-outlined text-[20px]">download</span>Unduh Template Excel
              </button>
              <button type="button" className="flex items-center gap-sm bg-surface text-on-surface border border-outline-variant px-lg py-sm rounded-xl font-label-sm font-bold hover:bg-surface-variant disabled:opacity-50" onClick={() => fileInputRef.current?.click()} disabled={sheet.students.length === 0 || (mode === 'cpmk' && sheet.cpmks.length === 0)}>
                <span className="material-symbols-outlined text-[20px]">upload</span>Impor Excel
              </button>
            </div>
          </div>

          {mode === 'cpmk' && sheet.cpmks.length === 0 ? (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-lg text-amber-900 font-body-sm">
              {sheet.course.code} belum memiliki CPMK aktif. Tambahkan CPMK di menu CPMK, atau gunakan tab <strong>Input Nilai Satuan</strong>.
            </div>
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-md font-body-sm text-on-surface-variant flex gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">info</span>
              <span>
                {mode === 'single'
                  ? (sheet.cpmks.length > 0
                    ? <>Nilai satuan diberikan sama ke {sheet.cpmks.length} CPMK ({cpmkCodes}) lalu dihitung ke CPL. CPMK yang diisi di tab Input per CPMK memakai nilai CPMK tersebut.</>
                    : <>{sheet.course.code} belum memiliki CPMK; nilai dihitung ke CPL lewat pemetaan mata kuliah.</>)
                  : <>Isi nilai 0-100 untuk setiap CPMK. CPMK yang dikosongkan memakai nilai satuan (bila ada).</>}
                {dosenCount > 0 && <> <strong className="text-on-surface">{dosenCount} mahasiswa</strong> sudah dinilai dosen lewat buku nilai yang dikunci; nilai dosen yang dipakai untuk mereka.</>}
              </span>
            </div>
          )}

          {(mode === 'single' || sheet.cpmks.length > 0) && (
            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              <div className="p-md border-b border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-md">
                <div>
                  <div className="font-label-lg font-bold text-on-surface">{sheet.course.code} — {sheet.course.name}</div>
                  <div className="font-body-sm text-on-surface-variant">Angkatan {angkatan}{kelas ? ` · Kelas ${kelas}` : ''} · {sheet.students.length} mahasiswa</div>
                </div>
                <div className="relative md:w-[260px]">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                  <input type="search" placeholder="Cari NIM atau nama..." className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[40px] pr-md py-sm font-label-sm" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="admin-grade-table w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30">
                      <th className="admin-grade-student px-md py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase min-w-[150px] md:min-w-[220px]">Mahasiswa</th>
                      <th className="px-sm py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase">Kelas</th>
                      {mode === 'cpmk' ? sheet.cpmks.map(cpmk => (
                        <th key={cpmk.id} className="px-xs py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase text-center whitespace-nowrap" title={`${cpmk.description}${cpmk.cpls.length ? `\nCPL: ${cpmk.cpls.join(', ')}` : ''}`}>
                          <div>{cpmk.code}</div>
                          <div className="font-normal normal-case">{cpmk.cpls.join(', ') || 'tanpa CPL'}</div>
                        </th>
                      )) : (
                        <>
                          <th className="px-sm py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase text-center whitespace-nowrap">Nilai (0-100)</th>
                          <th className="px-sm py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase text-center">Huruf</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {visibleStudents.length === 0 ? (
                      <tr><td colSpan={mode === 'cpmk' ? sheet.cpmks.length + 2 : 4} className="px-lg py-xl text-center text-on-surface-variant">{sheet.students.length === 0 ? 'Tidak ada mahasiswa pada angkatan/kelas ini.' : 'Tidak ada mahasiswa yang cocok dengan pencarian.'}</td></tr>
                    ) : visibleStudents.map(student => {
                      const text = singleValue(student);
                      const parsed = parseScore(text);
                      return (
                        <tr key={student.id} className="hover-row">
                          <td className="admin-grade-student px-md py-sm">
                            <div className="font-body-sm font-bold text-on-surface">{student.nim}</div>
                            <div className="font-body-sm text-on-surface">{student.name}</div>
                            {student.dosenGraded && <span className="mt-[2px] inline-flex items-center gap-xs rounded-full bg-primary/10 px-sm py-[1px] font-label-xs font-bold text-primary" title="Mahasiswa ini sudah dinilai dosen lewat buku nilai yang dikunci; nilai dosen yang dipakai dalam perhitungan CPL."><span className="material-symbols-outlined text-[14px]">lock</span>Nilai dosen dipakai</span>}
                            {!student.dosenGraded && student.status !== 'Aktif' && <span className="font-label-xs text-on-surface-variant">{student.status}</span>}
                          </td>
                          <td className="px-sm py-sm font-body-sm text-on-surface-variant whitespace-nowrap">{student.kelas}</td>
                          {mode === 'cpmk' ? sheet.cpmks.map(cpmk => {
                            const value = cpmkValue(student, cpmk.id);
                            return (
                              <td key={cpmk.id} className="px-xs py-sm text-center">
                                <input type="text" inputMode="decimal" aria-label={`${cpmk.code} ${student.name}`} {...cellProps(value, Boolean(cpmkEdits[student.id] && cpmk.id in cpmkEdits[student.id]))} value={value} onChange={e => setCpmk(student, cpmk.id, e.target.value)} />
                              </td>
                            );
                          }) : (
                            <>
                              <td className="px-sm py-sm text-center">
                                <input type="text" inputMode="decimal" aria-label={`Nilai ${student.name}`} {...cellProps(text, student.id in singleEdits)} value={text} onChange={e => setSingle(student, e.target.value)} />
                              </td>
                              <td className="px-sm py-sm text-center font-bold text-primary">{typeof parsed === 'number' ? letterForScore(parsed) : '-'}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-md border-t border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-md bg-white/[0.02]">
                <p className="font-body-sm text-on-surface-variant">
                  {dirtyCount > 0 ? <><strong className="text-on-surface">{dirtyCount} perubahan</strong> belum disimpan (kotak kuning). Mengosongkan nilai berarti menghapusnya.</> : 'Tidak ada perubahan yang belum disimpan.'}
                </p>
                <div className="flex flex-wrap gap-sm">
                  <button type="button" className="px-lg py-sm rounded-xl border border-outline-variant font-label-sm font-bold text-on-surface-variant hover:bg-surface-variant disabled:opacity-50" onClick={discardChanges} disabled={dirtyCount === 0 || saving}>Batalkan</button>
                  <button type="button" className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-label-sm font-bold disabled:opacity-50" onClick={save} disabled={dirtyCount === 0 || saving}>
                    <span className="material-symbols-outlined text-[20px]">save</span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
