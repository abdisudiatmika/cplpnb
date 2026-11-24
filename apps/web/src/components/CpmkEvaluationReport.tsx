import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

interface StudentOption {
  angkatan: string;
  kelas: string;
}

interface Thresholds {
  minScore: number;
  minPercent: number;
}

interface Stats {
  measured: number;
  average: number | null;
  min: number | null;
  max: number | null;
  passed: number;
  passedPercent: number | null;
  status: string;
}

interface CourseSummary {
  id: string;
  code: string;
  name: string;
  sks: number;
  semester: number | string | null;
  cpmkCount: number;
  cpmkMeasured: number;
  cpmkAchieved: number;
  students: number;
  average: number | null;
  lowestCpmk?: { code: string; passedPercent: number } | null;
  status: string;
}

interface CpmkDetail extends Stats {
  id: string;
  code: string;
  description: string;
  weight: number;
  cpls: string[];
  byClass: (Stats & { kelas: string })[];
}

interface StudentRow {
  id: string;
  nim: string;
  name: string;
  kelas: string | null;
  angkatan: string | null;
  scores: Record<string, number>;
  courseScore: number | null;
  belowCount: number;
  sources: string[];
}

interface Detail {
  thresholds: Thresholds;
  course: CourseSummary;
  cpmks: CpmkDetail[];
  students: StudentRow[];
}

interface Props {
  students: StudentOption[];
  apiCall: (path: string, method?: string, body?: any) => Promise<any>;
  showToast: (message: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  dosen: 'Buku nilai dosen',
  admin_cpmk: 'Input per CPMK',
  nilai_satuan: 'Nilai satuan',
};

const fmt = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '-' : (Math.round(value * 100) / 100).toLocaleString('id-ID', { maximumFractionDigits: digits });

const statusTone = (status: string) => {
  if (status === 'Tercapai') return 'bg-success/10 text-success border-success/20';
  if (status === 'Sebagian Tercapai') return 'bg-warning/10 text-amber-700 border-warning/30';
  if (status === 'Belum Tercapai') return 'bg-error/10 text-error border-error/20';
  return 'bg-surface-container text-on-surface-variant border-outline-variant';
};

const StatusChip = ({ status }: { status: string }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-sm py-xs font-label-xs font-bold ${statusTone(status)}`}>{status}</span>
);

const PercentBar = ({ percent, target }: { percent: number | null; target: number }) => (
  <div className="min-w-[104px]">
    <div className="flex justify-between gap-sm whitespace-nowrap font-label-xs text-on-surface-variant mb-[2px]">
      <span className="font-bold text-on-surface">{percent === null ? '-' : `${fmt(percent, 1)}%`}</span>
      <span>target {target}%</span>
    </div>
    <div className="relative h-2 rounded-full bg-surface-container overflow-hidden">
      <div className={`h-full rounded-full ${percent !== null && percent >= target ? 'bg-success' : 'bg-error'}`} style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
      <div className="absolute top-0 h-full w-[2px] bg-on-surface/60" style={{ left: `${target}%` }} />
    </div>
  </div>
);

const academicYearOptions = (() => {
  const now = new Date();
  const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 7 }, (_, index) => `${start - index}/${start - index + 1}`);
})();

export function CpmkEvaluationReport({ students, apiCall, showToast }: Props) {
  const [angkatan, setAngkatan] = useState('');
  const [kelas, setKelas] = useState('');
  const [semesterType, setSemesterType] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ thresholds: Thresholds; courses: CourseSummary[] } | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showStudents, setShowStudents] = useState(false);

  const angkatanOptions = useMemo(() => Array.from(new Set(students.map(student => String(student.angkatan || '')).filter(Boolean))).sort().reverse(), [students]);
  const kelasOptions = useMemo(() => Array.from(new Set(students
    .filter(student => !angkatan || String(student.angkatan) === angkatan)
    .map(student => String(student.kelas || '')).filter(Boolean))).sort(), [students, angkatan]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (angkatan) params.append('angkatan', angkatan);
    if (kelas) params.append('kelas', kelas);
    if (semesterType) params.append('semesterType', semesterType);
    if (academicYear) params.append('academicYear', academicYear);
    const text = params.toString();
    return text ? `?${text}` : '';
  }, [angkatan, kelas, semesterType, academicYear]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const request = selectedCourseId
      ? apiCall(`/reports/cpmk-evaluation/${selectedCourseId}${query}`).then(result => { if (!cancelled) setDetail(result); })
      : apiCall(`/reports/cpmk-evaluation${query}`).then(result => { if (!cancelled) setSummary(result); });
    request
      .catch((error: any) => { if (!cancelled) showToast(error?.message || 'Gagal memuat laporan evaluasi CPMK.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, query]);

  const thresholds = (selectedCourseId ? detail?.thresholds : summary?.thresholds) || { minScore: 75, minPercent: 70 };
  const periodLabel = [semesterType ? (semesterType === 'ganjil' ? 'Ganjil' : 'Genap') : '', academicYear].filter(Boolean).join(' ') || 'Semua periode';
  const scopeLabel = `${angkatan ? `Angkatan ${angkatan}` : 'Semua angkatan'} · ${kelas ? `Kelas ${kelas}` : 'Semua kelas'} · ${periodLabel}`;

  const courses = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (summary?.courses || []).filter(course => !text || `${course.code} ${course.name}`.toLowerCase().includes(text));
  }, [summary, search]);

  const totals = useMemo(() => {
    const list = summary?.courses || [];
    const measured = list.filter(course => course.cpmkMeasured > 0);
    return {
      courses: list.length,
      measured: measured.length,
      cpmkMeasured: measured.reduce((sum, course) => sum + course.cpmkMeasured, 0),
      cpmkAchieved: measured.reduce((sum, course) => sum + course.cpmkAchieved, 0),
      needAction: measured.filter(course => course.status !== 'Tercapai').length,
    };
  }, [summary]);

  const exportSummary = () => {
    if (!summary) return;
    const rows = [
      ['Laporan Evaluasi CPMK per Mata Kuliah'],
      ['Cakupan', scopeLabel],
      ['Kriteria', `CPMK tercapai bila >= ${thresholds.minPercent}% mahasiswa memperoleh nilai >= ${thresholds.minScore}`],
      [],
      ['Kode MK', 'Mata Kuliah', 'Semester', 'SKS', 'Jumlah CPMK', 'CPMK Terukur', 'CPMK Tercapai', 'Mahasiswa', 'Rata-rata', 'CPMK Terendah', '% Lulus CPMK Terendah', 'Status'],
      ...courses.map(course => [course.code, course.name, course.semester ?? '', course.sks, course.cpmkCount, course.cpmkMeasured, course.cpmkAchieved, course.students, course.average ?? '', course.lowestCpmk?.code ?? '', course.lowestCpmk?.passedPercent ?? '', course.status]),
    ];
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 9 }, { wch: 6 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Ringkasan');
    XLSX.writeFile(workbook, `Evaluasi_CPMK_Ringkasan${angkatan ? `_${angkatan}` : ''}${kelas ? `_${kelas}` : ''}.xlsx`);
  };

  const exportDetail = () => {
    if (!detail) return;
    const { course, cpmks } = detail;
    const workbook = XLSX.utils.book_new();
    const cpmkRows = [
      [`Evaluasi CPMK ${course.code} - ${course.name}`],
      ['Cakupan', scopeLabel],
      ['Kriteria', `CPMK tercapai bila >= ${thresholds.minPercent}% mahasiswa memperoleh nilai >= ${thresholds.minScore}`],
      ['Status mata kuliah', `${course.status} (${course.cpmkAchieved} dari ${course.cpmkCount} CPMK tercapai)`],
      [],
      ['Kode CPMK', 'Deskripsi', 'CPL', 'Bobot (%)', 'Mahasiswa Terukur', 'Rata-rata', 'Min', 'Maks', `Jumlah >= ${thresholds.minScore}`, '% Mahasiswa', 'Status', 'Catatan Tindak Lanjut'],
      ...cpmks.map(cpmk => [cpmk.code, cpmk.description, cpmk.cpls.join(', '), cpmk.weight, cpmk.measured, cpmk.average ?? '', cpmk.min ?? '', cpmk.max ?? '', cpmk.passed, cpmk.passedPercent ?? '', cpmk.status, '']),
    ];
    const cpmkSheet = XLSX.utils.aoa_to_sheet(cpmkRows);
    cpmkSheet['!cols'] = [{ wch: 13 }, { wch: 50 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 7 }, { wch: 7 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(workbook, cpmkSheet, 'Per CPMK');

    const classes = cpmks[0]?.byClass.map(item => item.kelas) || [];
    const classRows = [
      ['Persentase mahasiswa >= ' + thresholds.minScore + ' per kelas'],
      ['Kode CPMK', ...classes.map(item => `Kelas ${item}`)],
      ...cpmks.map(cpmk => [cpmk.code, ...cpmk.byClass.map(item => item.passedPercent === null ? '-' : `${fmt(item.passedPercent, 1)}% (${item.passed}/${item.measured})`)]),
    ];
    const classSheet = XLSX.utils.aoa_to_sheet(classRows);
    classSheet['!cols'] = [{ wch: 13 }, ...classes.map(() => ({ wch: 16 }))];
    XLSX.utils.book_append_sheet(workbook, classSheet, 'Per Kelas');

    const studentRows = [
      ['NIM', 'Nama', 'Kelas', ...cpmks.map(cpmk => cpmk.code), 'Nilai MK (berbobot)', `CPMK < ${thresholds.minScore}`, 'Sumber Nilai'],
      ...detail.students.map(student => [student.nim, student.name, student.kelas ?? '', ...cpmks.map(cpmk => student.scores[cpmk.id] ?? ''), student.courseScore ?? '', student.belowCount, student.sources.map(source => SOURCE_LABELS[source] || source).join(', ')]),
    ];
    const studentSheet = XLSX.utils.aoa_to_sheet(studentRows);
    studentSheet['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 7 }, ...cpmks.map(() => ({ wch: 11 })), { wch: 16 }, { wch: 10 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(workbook, studentSheet, 'Per Mahasiswa');
    XLSX.writeFile(workbook, `Evaluasi_CPMK_${course.code}${angkatan ? `_${angkatan}` : ''}${kelas ? `_${kelas}` : ''}.xlsx`);
  };

  const selectClass = 'w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none';
  const labelClass = 'block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase';

  return (
    <div className="space-y-lg">
      <div className="glass-panel p-lg rounded-2xl shadow-sm grid grid-cols-2 md:grid-cols-4 gap-md items-end">
        <div>
          <label className={labelClass} htmlFor="eval-angkatan">Angkatan</label>
          <select id="eval-angkatan" className={selectClass} value={angkatan} onChange={event => { setAngkatan(event.target.value); setKelas(''); }}>
            <option value="">Semua angkatan</option>
            {angkatanOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="eval-kelas">Kelas</label>
          <select id="eval-kelas" className={selectClass} value={kelas} onChange={event => setKelas(event.target.value)}>
            <option value="">Semua kelas</option>
            {kelasOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="eval-semester">Semester</label>
          <select id="eval-semester" className={selectClass} value={semesterType} onChange={event => setSemesterType(event.target.value)}>
            <option value="">Ganjil & Genap</option>
            <option value="ganjil">Ganjil</option>
            <option value="genap">Genap</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="eval-year">Tahun Ajaran</label>
          <select id="eval-year" className={selectClass} value={academicYear} onChange={event => setAcademicYear(event.target.value)}>
            <option value="">Semua tahun</option>
            {academicYearOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-md font-body-sm text-on-surface-variant flex gap-sm">
        <span className="material-symbols-outlined text-primary text-[20px]">info</span>
        <span>
          CPMK dinyatakan <strong className="text-on-surface">Tercapai</strong> bila minimal <strong className="text-on-surface">{thresholds.minPercent}% mahasiswa</strong> memperoleh nilai CPMK <strong className="text-on-surface">≥ {thresholds.minScore}</strong>.
          Nilai diambil dari buku nilai dosen yang dikunci, input nilai per CPMK, atau nilai satuan (dibagikan ke setiap CPMK), sama seperti perhitungan CPL.
        </span>
      </div>

      {!selectedCourseId ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
            {[
              ['Mata kuliah ber-CPMK', totals.courses, 'menu_book'],
              ['Mata kuliah terukur', totals.measured, 'fact_check'],
              ['CPMK tercapai', `${totals.cpmkAchieved} / ${totals.cpmkMeasured}`, 'task_alt'],
              ['MK perlu tindak lanjut', totals.needAction, 'report'],
            ].map(([label, value, icon]) => (
              <div key={String(label)} className="glass-panel rounded-xl p-md flex items-center gap-md">
                <span className="material-symbols-outlined text-primary text-[28px]">{icon}</span>
                <div><p className="font-label-xs text-on-surface-variant uppercase">{label}</p><p className="font-headline-lg font-bold text-on-surface">{value}</p></div>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm p-md border-b border-outline-variant/40">
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                <input className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[38px] pr-md py-sm font-label-sm" placeholder="Cari kode atau nama mata kuliah..." value={search} onChange={event => setSearch(event.target.value)} />
              </div>
              <button type="button" onClick={exportSummary} disabled={!summary || courses.length === 0} className="inline-flex items-center gap-xs border border-outline-variant bg-surface px-md py-sm rounded-lg font-label-sm font-bold hover:bg-surface-variant disabled:opacity-50">
                <span className="material-symbols-outlined text-[18px]">download</span>Unduh Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left border-collapse">
                <thead><tr className="bg-surface-container border-b border-outline-variant">
                  {['Mata Kuliah', 'Smt', 'CPMK Tercapai', 'Mahasiswa', 'Rata-rata', 'CPMK Terendah', 'Status', ''].map(header => <th key={header} className="px-md py-sm font-label-xs uppercase text-on-surface-variant">{header}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {loading && !summary ? (
                    <tr><td colSpan={8} className="px-md py-xl text-center text-on-surface-variant">Memuat laporan...</td></tr>
                  ) : courses.length === 0 ? (
                    <tr><td colSpan={8} className="px-md py-xl text-center text-on-surface-variant">Belum ada mata kuliah dengan CPMK aktif.</td></tr>
                  ) : courses.map(course => (
                    <tr key={course.id} className="hover:bg-surface-container/50 cursor-pointer" onClick={() => { setDetail(null); setShowStudents(false); setSelectedCourseId(course.id); }}>
                      <td className="px-md py-sm"><p className="font-body-sm font-bold text-on-surface">{course.name}</p><p className="font-label-xs text-on-surface-variant">{course.code} · {course.sks} SKS</p></td>
                      <td className="px-md py-sm font-body-sm">{course.semester ?? '-'}</td>
                      <td className="px-md py-sm font-body-sm"><span className="font-bold">{course.cpmkAchieved}</span> / {course.cpmkCount}{course.cpmkMeasured < course.cpmkCount && course.cpmkMeasured > 0 && <span className="block font-label-xs text-on-surface-variant">{course.cpmkCount - course.cpmkMeasured} belum terukur</span>}</td>
                      <td className="px-md py-sm font-body-sm">{course.students}</td>
                      <td className="px-md py-sm font-body-sm font-bold">{fmt(course.average)}</td>
                      <td className="px-md py-sm font-body-sm">{course.lowestCpmk ? <><span className="font-bold">{course.lowestCpmk.code}</span><span className={`block font-label-xs ${course.lowestCpmk.passedPercent >= thresholds.minPercent ? 'text-success' : 'text-error'}`}>{fmt(course.lowestCpmk.passedPercent, 1)}% mahasiswa ≥ {thresholds.minScore}</span></> : '-'}</td>
                      <td className="px-md py-sm"><StatusChip status={course.status} /></td>
                      <td className="px-md py-sm text-right"><span className="material-symbols-outlined text-primary">chevron_right</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm">
            <button type="button" onClick={() => { setSelectedCourseId(''); setDetail(null); }} className="inline-flex items-center gap-xs text-primary font-label-sm font-bold">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>Semua mata kuliah
            </button>
            <button type="button" onClick={exportDetail} disabled={!detail} className="inline-flex items-center gap-xs border border-outline-variant bg-surface px-md py-sm rounded-lg font-label-sm font-bold hover:bg-surface-variant disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">download</span>Unduh Excel
            </button>
          </div>

          {!detail ? (
            <div className="glass-panel rounded-xl p-xl text-center text-on-surface-variant">Memuat evaluasi mata kuliah...</div>
          ) : (
            <>
              <div className="glass-panel rounded-2xl p-lg flex flex-col lg:flex-row lg:items-center justify-between gap-md">
                <div>
                  <p className="font-label-xs text-primary font-bold">{detail.course.code} · {detail.course.sks} SKS · Semester {detail.course.semester ?? '-'}</p>
                  <h4 className="font-headline-xl font-bold text-on-surface">{detail.course.name}</h4>
                  <p className="font-body-sm text-on-surface-variant">{scopeLabel}</p>
                </div>
                <div className="grid grid-cols-3 gap-md text-center">
                  <div><p className="font-label-xs text-on-surface-variant uppercase">Mahasiswa</p><p className="font-headline-lg font-bold">{detail.course.students}</p></div>
                  <div><p className="font-label-xs text-on-surface-variant uppercase">Rata-rata</p><p className="font-headline-lg font-bold">{fmt(detail.course.average)}</p></div>
                  <div><p className="font-label-xs text-on-surface-variant uppercase">CPMK Tercapai</p><p className="font-headline-lg font-bold">{detail.course.cpmkAchieved} / {detail.course.cpmkCount}</p></div>
                </div>
                <StatusChip status={detail.course.status} />
              </div>

              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="px-md py-sm border-b border-outline-variant/40"><h5 className="font-headline-md font-bold text-on-surface">Ketercapaian per CPMK</h5></div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left border-collapse">
                    <thead><tr className="bg-surface-container border-b border-outline-variant">
                      {['CPMK', 'CPL', 'Bobot', 'Rata-rata', `Mahasiswa ≥ ${thresholds.minScore}`, '% Mahasiswa', 'Per Kelas', 'Status'].map(header => <th key={header} className="px-md py-sm font-label-xs uppercase text-on-surface-variant whitespace-nowrap">{header}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {detail.cpmks.map(cpmk => (
                        <tr key={cpmk.id} className={cpmk.status === 'Belum Tercapai' ? 'bg-error/5' : ''}>
                          <td className="px-md py-sm min-w-[190px] max-w-[250px]"><p className="font-body-sm font-bold text-primary">{cpmk.code}</p><p className="font-label-xs text-on-surface-variant line-clamp-2" title={cpmk.description}>{cpmk.description}</p></td>
                          <td className="px-md py-sm font-label-sm whitespace-nowrap">{cpmk.cpls.join(', ') || '-'}</td>
                          <td className="px-md py-sm font-body-sm whitespace-nowrap">{fmt(cpmk.weight)}%</td>
                          <td className="px-md py-sm whitespace-nowrap"><p className="font-body-sm font-bold">{fmt(cpmk.average)}</p><p className="font-label-xs text-on-surface-variant">{fmt(cpmk.min)} – {fmt(cpmk.max)}</p></td>
                          <td className="px-md py-sm font-body-sm whitespace-nowrap"><span className="font-bold">{cpmk.passed}</span> dari {cpmk.measured}</td>
                          <td className="px-md py-sm"><PercentBar percent={cpmk.passedPercent} target={thresholds.minPercent} /></td>
                          <td className="px-md py-sm">
                            <div className="flex flex-col gap-[2px]">
                              {cpmk.byClass.filter(item => item.measured > 0).map(item => (
                                <span key={item.kelas} title={`${item.passed} dari ${item.measured} mahasiswa`} className={`whitespace-nowrap rounded border px-xs font-label-xs ${item.passedPercent !== null && item.passedPercent >= thresholds.minPercent ? 'border-success/30 text-success' : 'border-error/30 text-error'}`}>{item.kelas}: {fmt(item.passedPercent, 0)}%</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-md py-sm"><StatusChip status={cpmk.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {detail.cpmks.some(cpmk => cpmk.status === 'Belum Tercapai') && (
                <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-md font-body-sm text-amber-900 flex gap-sm">
                  <span className="material-symbols-outlined text-[20px]">lightbulb</span>
                  <span>
                    Perlu tindak lanjut: {detail.cpmks.filter(cpmk => cpmk.status === 'Belum Tercapai').map(cpmk => `${cpmk.code} (${fmt(cpmk.passedPercent, 1)}%)`).join(', ')}.
                    Tinjau kembali metode pembelajaran, instrumen dan rubrik penilaian, atau berikan remedial pada RPS semester berikutnya.
                  </span>
                </div>
              )}

              <div className="glass-panel rounded-2xl overflow-hidden">
                <button type="button" className="w-full flex items-center justify-between px-md py-sm border-b border-outline-variant/40" onClick={() => setShowStudents(value => !value)} aria-expanded={showStudents}>
                  <h5 className="font-headline-md font-bold text-on-surface">Nilai CPMK per Mahasiswa ({detail.students.length})</h5>
                  <span className="material-symbols-outlined">{showStudents ? 'expand_less' : 'expand_more'}</span>
                </button>
                {showStudents && (
                  <div className="overflow-x-auto max-h-[560px]">
                    <table className="w-full min-w-[760px] text-left border-collapse">
                      <thead className="sticky top-0 z-10"><tr className="bg-surface-container border-b border-outline-variant">
                        {['NIM', 'Nama', 'Kelas', ...detail.cpmks.map(cpmk => cpmk.code), 'Nilai MK', 'Sumber'].map(header => <th key={header} className="px-md py-sm font-label-xs uppercase text-on-surface-variant whitespace-nowrap">{header}</th>)}
                      </tr></thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {detail.students.length === 0 ? (
                          <tr><td colSpan={detail.cpmks.length + 5} className="px-md py-lg text-center text-on-surface-variant">Belum ada nilai pada cakupan ini.</td></tr>
                        ) : detail.students.map(student => (
                          <tr key={student.id}>
                            <td className="px-md py-xs font-label-sm">{student.nim}</td>
                            <td className="px-md py-xs font-body-sm whitespace-nowrap">{student.name}</td>
                            <td className="px-md py-xs font-body-sm whitespace-nowrap">{student.kelas || '-'}</td>
                            {detail.cpmks.map(cpmk => {
                              const score = student.scores[cpmk.id];
                              return <td key={cpmk.id} className={`px-md py-xs font-body-sm text-center ${score !== undefined && score < thresholds.minScore ? 'text-error font-bold bg-error/5' : ''}`}>{fmt(score)}</td>;
                            })}
                            <td className="px-md py-xs font-body-sm font-bold text-center">{fmt(student.courseScore)}</td>
                            <td className="px-md py-xs font-label-xs text-on-surface-variant whitespace-nowrap">{student.sources.map(source => SOURCE_LABELS[source] || source).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
