import React, { useState, useEffect, useRef } from 'react';
// Removed unused branding
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { RadarChart } from './components/RadarChart';
import { BarChart } from './components/BarChart';
import { CplPrintTemplate } from './components/CplPrintTemplate';
import { LandingPage } from './components/LandingPage';

// API Configuration
const API_BASE = import.meta.env.PROD 
  ? '/api' 
  : (import.meta.env.VITE_API_URL || 'http://localhost:4000/api');

async function apiCall(path: string, method: string = 'GET', body: any = null) {
  const options: RequestInit = {
    method,
    credentials: 'include',
  };
  
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  const getCookie = (name: string) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
  };
  
  const token = getCookie('XSRF-TOKEN');
  if (token && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())) {
    headers['X-XSRF-TOKEN'] = decodeURIComponent(token);
  }

  if (body) {
    options.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  
  options.headers = headers;
  
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let msg = `API Error: ${res.statusText}`;
    try {
      const errJson = await res.json();
      msg = errJson.message || errJson.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await res.json();
  }
  return null;
}

// Interfaces
interface Department {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  nim: string;
  name: string;
  angkatan: string;
  kelas: string;
  status: 'Aktif' | 'Lulus' | 'Cuti';
}

interface Course {
  id: string;
  code: string;
  name: string;
  sks: number;
}

interface Cpl {
  id: string;
  code: string;
  description: string;
  category: 'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus';
  targetValue: number;
}

interface CourseMapping {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  cplId: string;
  cplCode: string;
  cplDescription: string;
  cplCategory: string;
  weight: number;
}

interface StudentGrade {
  id: string;
  studentId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  sks: number;
  grade: string;
  score: number;
  semester: string;
  academicYear: string;
}

interface CplAchievement {
  id: string;
  code: string;
  description: string;
  category: 'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus';
  value: number;
  status: 'Tercapai' | 'Tidak Tercapai' | 'Belum Diukur';
}

export default function App() {
  // Authentication & Session
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [appLoading, setAppLoading] = useState(true);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Login Form states
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showLanding, setShowLanding] = useState(true);

  // Handle Browser Back Button for Landing Page
  useEffect(() => {
    const handlePopState = () => {
      if (!isLoggedIn && !showLanding) {
        setShowLanding(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoggedIn, showLanding]);

  const handleShowLogin = (_role: 'admin' | 'dosen') => {
    window.history.pushState({ loginPage: true }, '');
    setShowLanding(false);
  };

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState('');

  // General Loading State for Data Fetching
  const [dataLoading, setDataLoading] = useState(false);

  // Lists & States depending on Role
  // Super Admin
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  // Department Admin
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cpls, setCpls] = useState<Cpl[]>([]);
  const [mappings, setMappings] = useState<CourseMapping[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);

  // Filtering / Stats states (Department Admin Dashboard)
  const [studentStats, setStudentStats] = useState({ total: 0, active: 0, cuti: 0, lulus: 0 });
  const [cplAverages, setCplAverages] = useState<any[]>([]);
  const [dashboardAngkatan, setDashboardAngkatan] = useState('');
  const [dashboardKelas, setDashboardKelas] = useState('');

  const [gradeStudentSearch, setGradeStudentSearch] = useState('');
  const [gradeStudentAngkatan, setGradeStudentAngkatan] = useState('');
  const [gradeStudentKelas, setGradeStudentKelas] = useState('');

  // Search & Filter state for students page
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterAngkatan, setStudentFilterAngkatan] = useState('');
  const [studentFilterKelas, setStudentFilterKelas] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentItemsPerPage, setStudentItemsPerPage] = useState(25);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseSortConfig, setCourseSortConfig] = useState<{ key: 'code' | 'name' | 'sks', direction: 'asc' | 'desc' } | null>(null);

  // Selected entities for specific views
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentAchievements, setSelectedStudentAchievements] = useState<CplAchievement[]>([]);
  const measuredStudentAchievements = React.useMemo(() => {
    const measured = selectedStudentAchievements.filter(cpl => cpl.status !== 'Belum Diukur');
    return measured.length > 0 ? measured : selectedStudentAchievements;
  }, [selectedStudentAchievements]);
  // Removed unused cpl search/filter states
  const [cplMatrixAngkatan, setCplMatrixAngkatan] = useState('');
  const [cplMatrixKelas, setCplMatrixKelas] = useState('');
  const [cplMatrixAverageIpk, setCplMatrixAverageIpk] = useState<number | null>(null);
  const [selectedStudentForCpl, setSelectedStudentForCpl] = useState<string | null>(null);

  const [selectedCplForDetail, setSelectedCplForDetail] = useState<string | null>(null);
  const [cplDetailMappingCourses, setCplDetailMappingCourses] = useState<any[]>([]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'department' | 'admin' | 'student' | 'course' | 'cpl' | 'mapping' | 'grade'>('student');
  const [modalAction, setModalAction] = useState<'add' | 'edit'>('add');
  const [modalError, setModalError] = useState('');

  // Selected item IDs for edit/delete
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string; ids?: string[] } | null>(null);

  // Form input fields
  // Department form
  const [deptFormName, setDeptFormName] = useState('');
  const [deptFormCode, setDeptFormCode] = useState('');

  // Admin User form
  const [adminFormName, setAdminFormName] = useState('');
  const [adminFormEmail, setAdminFormEmail] = useState('');
  const [adminFormPassword, setAdminFormPassword] = useState('');
  const [adminFormDeptId, setAdminFormDeptId] = useState('');

  // Student form
  const [studentFormNim, setStudentFormNim] = useState('');
  const [studentFormName, setStudentFormName] = useState('');
  const [studentFormAngkatan, setStudentFormAngkatan] = useState('2024');
  const [studentFormKelas, setStudentFormKelas] = useState('A');
  const [studentFormStatus, setStudentFormStatus] = useState<'Aktif' | 'Lulus' | 'Cuti'>('Aktif');

  // Course form
  const [courseFormCode, setCourseFormCode] = useState('');
  const [courseFormName, setCourseFormName] = useState('');
  const [courseFormSks, setCourseFormSks] = useState(3);

  // CPL form
  const [cplFormCode, setCplFormCode] = useState('');
  const [cplFormDesc, setCplFormDesc] = useState('');
  const [cplFormCat, setCplFormCat] = useState<'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus'>('Sikap');
  const [cplFormTarget, setCplFormTarget] = useState(75);

  // Slide panel for course detail & mapping
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseMappings, setCourseMappings] = useState<CourseMapping[]>([]);
  const [courseMappingLoading, setCourseMappingLoading] = useState(false);
  const [inlineMapCplId, setInlineMapCplId] = useState('');
  const [inlineMapWeight, setInlineMapWeight] = useState(1.0);

  // Grade form
  const [gradeFormCourseId, setGradeFormCourseId] = useState('');
  const [gradeFormLetter, setGradeFormLetter] = useState('A');
  const [gradeFormSemester, setGradeFormSemester] = useState('IV');
  const [gradeFormYear, setGradeFormYear] = useState('2024/2025');

  // Mouse tracking gradient effect ref
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // File input ref for Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const courseFileInputRef = useRef<HTMLInputElement>(null);
  const mappingFileInputRef = useRef<HTMLInputElement>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const gradeFileInputRef = useRef<HTMLInputElement>(null);

  // Verification on mount
  const checkSession = async () => {
    try {
      const data = await apiCall('/me');
      if (data && data.user) {
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        if (data.user.role === 'super_admin') {
          setActiveTab('departments');
        } else {
          setActiveTab('dashboard');
        }
      }
    } catch (e) {
      // Ignored - user needs to sign in
    } finally {
      setAppLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Performance-optimized atmospheric mouse-tracking gradient animation (Login screen only)
  useEffect(() => {
    if (isLoggedIn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const panel = rightPanelRef.current;
      if (panel) {
        const rect = panel.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        panel.style.backgroundImage = `
          radial-gradient(at ${x}% ${y}%, rgba(19, 30, 58, 1) 0%, transparent 60%), 
          radial-gradient(at 100% 0%, rgba(13, 25, 48, 1) 0%, transparent 50%), 
          radial-gradient(at 50% 100%, rgba(15, 23, 42, 1) 0%, transparent 50%)
        `;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isLoggedIn]);

  // Toast trigger helper
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Excel categories normalizer
  const normalizeCategory = (cat: string): 'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus' | null => {
    const c = cat.toLowerCase().trim();
    if (c.includes('sikap')) return 'Sikap';
    if (c.includes('pengetahuan')) return 'Pengetahuan';
    if (c.includes('umum') || c === 'ku' || c.includes('keterampilan umum') || c.includes('ketrampilan umum')) return 'Keterampilan Umum';
    if (c.includes('khusus') || c === 'kk' || c.includes('keterampilan khusus') || c.includes('ketrampilan khusus')) return 'Keterampilan Khusus';
    return null;
  };

  // Download CPL Excel template
  const downloadCplTemplate = () => {
    const sampleData = [
      {
        "kode_cpl": "S1",
        "deskripsi": "Lulusan yang beriman, bertakwa, berakhlak mulia, berkarakter sesuai dengan nilai-nilai Pancasila dan menginternalisasi sikap, norma dan perilaku sesuai dengan Etika Bisnis dan etika profesi; dan",
        "kategori": "Sikap",
        "target_nilai": 75
      },
      {
        "kode_cpl": "S2",
        "deskripsi": "Menunjukkan sikap bertanggungjawab atas pekerjaan di bidang keahliannya secara mandiri.",
        "kategori": "Sikap",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P1",
        "deskripsi": "Menguasai prinsip dan konsep teoritis akuntansi perusahaan jasa, dagang dan pabrikasi berskala kecil, menengah dan besar & sektor publik secara umum; beserta penyajian dan pengungkapan laporan keuangan sesuai standar akuntansi yang berlaku secara umum",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P2",
        "deskripsi": "Menguasai konsep teoritis akuntansi manajemen, perhitungan biaya dan penganggaran entitas jasa, dagang dan pabrikasi, serta mampu menganalisis laporan keuangan secara umum",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P3",
        "deskripsi": "Menguasai konsep teoritis dan prinsip-prinsip sistem informasi akuntansi dan pengendalian internal serta pengauditan laporan keuangan secara umum sesuai dengan standar audit yang berlaku",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P4",
        "deskripsi": "Menguasai pengetahuan operasional yang lengkap, prinsip-prinsip serta konsep umum perpajakan, tata cara perhitungan, pemungutan dan penyetoran Pajak sesuai peraturan yang berlaku;",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P5",
        "deskripsi": "Menguasai konsep teoritis, prinsip-prinsip teknologi kekinian (informasi dan digital), aplikasi komputer dan perangkat lunak akuntansi serta aplikasi pengolah angka (spreadsheet) dan aplikasi komputer akuntansi secara umum;",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P6",
        "deskripsi": "Menguasai pengetahuan teoritis & prinsip-prinsip bisnis, ekonomi & metode kuantitatif, serta hukum komersial;",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      },
      {
        "kode_cpl": "P7",
        "deskripsi": "Menguasai konsep teoritis dan prinsip-prinsip penyusunan karya ilmiah serta teknik komunikasi yang efektif secara lisan maupun tulisan dalam bahasa Indonesia maupun dalam bahasa asing.",
        "kategori": "Pengetahuan",
        "target_nilai": 75
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    // Set custom column widths for visual aesthetics
    worksheet['!cols'] = [
      { wch: 12 }, // kode_cpl
      { wch: 80 }, // deskripsi
      { wch: 18 }, // kategori
      { wch: 15 }, // target_nilai
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template CPL");
    XLSX.writeFile(workbook, "template_cpl.xlsx");
  };

  // Import CPL from Excel file (.xlsx, .xls)
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (parsedRows.length === 0) {
          showToast('File Excel kosong.');
          return;
        }

        // Detect headers and columns
        const firstRow = parsedRows[0].map((h: any) => String(h || '').toLowerCase().trim());
        const isHeader = firstRow.some((cell: string) => 
          cell.includes('kode') || 
          cell.includes('code') || 
          cell.includes('deskripsi') || 
          cell.includes('description') || 
          cell.includes('kategori') || 
          cell.includes('category')
        );

        let codeIdx = 0;
        let descIdx = 1;
        let catIdx = 2;
        let targetIdx = 3;
        let startRow = 0;

        if (isHeader) {
          codeIdx = firstRow.findIndex((h: string) => h.includes('kode') || h.includes('code'));
          descIdx = firstRow.findIndex((h: string) => h.includes('deskripsi') || h.includes('description') || h.includes('desc'));
          catIdx = firstRow.findIndex((h: string) => h.includes('kategori') || h.includes('category') || h.includes('cat'));
          targetIdx = firstRow.findIndex((h: string) => h.includes('target') || h.includes('nilai'));
          startRow = 1;
        }

        if (codeIdx === -1 || descIdx === -1 || catIdx === -1) {
          showToast('Kolom kode_cpl, deskripsi, atau kategori tidak ditemukan.');
          return;
        }

        const itemsToImport: any[] = [];
        const errors: string[] = [];

        for (let i = startRow; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length === 0) continue;

          const rawCode = String(row[codeIdx] || '').trim();
          const rawDesc = String(row[descIdx] || '').trim();
          const rawCat = String(row[catIdx] || '').trim();
          const rawTarget = targetIdx !== -1 && row[targetIdx] !== undefined ? String(row[targetIdx]).trim() : '75';

          // Skip completely empty rows
          if (!rawCode && !rawDesc && !rawCat) continue;

          if (!rawCode) {
            errors.push(`Baris ${i + 1}: Kode CPL kosong.`);
            continue;
          }
          if (!rawDesc) {
            errors.push(`Baris ${i + 1}: Deskripsi CPL kosong.`);
            continue;
          }

          const category = normalizeCategory(rawCat);
          if (!category) {
            errors.push(`Baris ${i + 1}: Kategori "${rawCat}" tidak valid. Harus salah satu dari: Sikap, Pengetahuan, Keterampilan Umum, Keterampilan Khusus.`);
            continue;
          }

          const targetValue = Number(rawTarget) || 75;

          itemsToImport.push({
            code: rawCode,
            description: rawDesc,
            category,
            targetValue,
          });
        }

        if (errors.length > 0) {
          alert(`Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nHarap perbaiki file Anda.`);
          return;
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/cpl/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} CPL berhasil diimpor.`);

        // Reload CPL list
        const updatedList = await apiCall('/cpl');
        setCpls(updatedList);
      } catch (err: any) {
        showToast(err.message || 'Gagal membaca file Excel.');
      } finally {
        setDataLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Gagal membaca file Excel.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  // Download Course Excel template
  const downloadCourseTemplate = () => {
    const sampleData = [
      {
        "kode_mk": "MPK16006",
        "nama_mk": "Pendidikan Pancasila",
        "sks": 2,
        "semester": 1,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK16014",
        "nama_mk": "Hukum Pajak*",
        "sks": 2,
        "semester": 1,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MPK16007",
        "nama_mk": "Bahasa Indonesia",
        "sks": 2,
        "semester": 1,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MPK16008",
        "nama_mk": "Bahasa Inggris",
        "sks": 2,
        "semester": 1,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK16005",
        "nama_mk": "Matematika Bisnis",
        "sks": 2,
        "semester": 1,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK16010",
        "nama_mk": "Pengantar Akuntansi*",
        "sks": 3,
        "semester": 1,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK16011",
        "nama_mk": "Pengantar Bisnis",
        "sks": 2,
        "semester": 1,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK16012",
        "nama_mk": "Pengantar Ekonomi",
        "sks": 2,
        "semester": 1,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK16013",
        "nama_mk": "Aplikasi Komputer 1*",
        "sks": 2,
        "semester": 1,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MPK2462401210",
        "nama_mk": "Pendidikan Kewarganegaraan*",
        "sks": 2,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK2462401211",
        "nama_mk": "Statistik Bisnis",
        "sks": 2,
        "semester": 2,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401212",
        "nama_mk": "Akuntansi Jasa Wisata*",
        "sks": 2,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401213",
        "nama_mk": "Pengantar Ekonomi",
        "sks": 2,
        "semester": 2,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401214",
        "nama_mk": "Sistem Informasi Akuntansi*",
        "sks": 2,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK2462401215",
        "nama_mk": "Data Visualisasi Dan Presentasi*",
        "sks": 2,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401216",
        "nama_mk": "Audit 1*",
        "sks": 2,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MBB2462401217",
        "nama_mk": "Pendidikan Agama*",
        "sks": 2,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401218",
        "nama_mk": "Akuntansi Keuangan Menengah 1 Dan Praktikum*",
        "sks": 4,
        "semester": 2,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36002",
        "nama_mk": "Praktek Akuntansi Jasa Wisata*",
        "sks": 2,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36004",
        "nama_mk": "Akuntansi Keuangan 1*",
        "sks": 3,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36005",
        "nama_mk": "Lab. Pengantar Akuntansi*",
        "sks": 3,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36008",
        "nama_mk": "Perpajakan*",
        "sks": 2,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36011",
        "nama_mk": "Bahasa Inggris Profesi 2",
        "sks": 2,
        "semester": 3,
        "jenis": "pilihan",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36012",
        "nama_mk": "Aplikasi Komputer 3*",
        "sks": 2,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36013",
        "nama_mk": "Akuntansi Manajemen*",
        "sks": 2,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36014",
        "nama_mk": "Audit 1*",
        "sks": 2,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB36016",
        "nama_mk": "Sistem Akuntansi*",
        "sks": 2,
        "semester": 3,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401428",
        "nama_mk": "Praktikum Audit*",
        "sks": 3,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401429",
        "nama_mk": "Akuntansi Internasional *",
        "sks": 2,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401430",
        "nama_mk": "Penganggaran Perusahaan Dan Praktikum*",
        "sks": 4,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK2462401431",
        "nama_mk": "Metode Penelitian Terapan",
        "sks": 2,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401432",
        "nama_mk": "Akuntansi Keuangan Lanjutan*",
        "sks": 3,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKB2462401433",
        "nama_mk": "Praktikum Akuntansi Komputer *",
        "sks": 3,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK2462401434",
        "nama_mk": "Komunikasi Bisnis",
        "sks": 2,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      },
      {
        "kode_mk": "MKK2462401435",
        "nama_mk": "Hukum Bisnis",
        "sks": 2,
        "semester": 4,
        "jenis": "wajib",
        "deskripsi": "-"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 18 }, // kode_mk
      { wch: 45 }, // nama_mk
      { wch: 8 },  // sks
      { wch: 12 }, // semester
      { wch: 12 }, // jenis
      { wch: 15 }, // deskripsi
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template Mata Kuliah");
    XLSX.writeFile(workbook, "template_matakuliah.xlsx");
  };

  // Import Course from Excel file (.xlsx, .xls)
  const handleImportCourseExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (parsedRows.length === 0) {
          showToast('File Excel kosong.');
          return;
        }

        // Detect headers and columns
        const firstRow = parsedRows[0].map((h: any) => String(h || '').toLowerCase().trim());
        const isHeader = firstRow.some((cell: string) => 
          cell.includes('kode') || 
          cell.includes('code') || 
          cell.includes('nama') || 
          cell.includes('name') || 
          cell.includes('sks')
        );

        let codeIdx = 0;
        let nameIdx = 1;
        let sksIdx = 2;
        let startRow = 0;

        if (isHeader) {
          codeIdx = firstRow.findIndex((h: string) => h.includes('kode') || h.includes('code'));
          nameIdx = firstRow.findIndex((h: string) => h.includes('nama') || h.includes('name') || h === 'mk' || h.includes('mata kuliah') || h.includes('matakuliah'));
          sksIdx = firstRow.findIndex((h: string) => h.includes('sks'));
          startRow = 1;
        }

        if (codeIdx === -1 || nameIdx === -1 || sksIdx === -1) {
          showToast('Kolom kode_mk, nama_mk, atau sks tidak ditemukan.');
          return;
        }

        const itemsToImport: any[] = [];
        const errors: string[] = [];

        for (let i = startRow; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length === 0) continue;

          const rawCode = String(row[codeIdx] || '').trim();
          const rawName = String(row[nameIdx] || '').trim();
          const rawSks = row[sksIdx] !== undefined ? String(row[sksIdx]).trim() : '';

          // Skip completely empty rows
          if (!rawCode && !rawName && !rawSks) continue;

          if (!rawCode) {
            errors.push(`Baris ${i + 1}: Kode mata kuliah kosong.`);
            continue;
          }
          if (!rawName) {
            errors.push(`Baris ${i + 1}: Nama mata kuliah kosong.`);
            continue;
          }
          if (!rawSks || isNaN(Number(rawSks))) {
            errors.push(`Baris ${i + 1}: SKS "${rawSks}" tidak valid. Harus berupa angka.`);
            continue;
          }

          itemsToImport.push({
            code: rawCode,
            name: rawName,
            sks: Number(rawSks)
          });
        }

        if (errors.length > 0) {
          alert(`Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nHarap perbaiki file Anda.`);
          return;
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/courses/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} Mata Kuliah berhasil diimpor.`);

        // Reload Course list
        const updatedList = await apiCall('/courses');
        setCourses(updatedList);
      } catch (err: any) {
        showToast(err.message || 'Gagal membaca file Excel.');
      } finally {
        setDataLoading(false);
        if (courseFileInputRef.current) courseFileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Gagal membaca file Excel.');
      if (courseFileInputRef.current) courseFileInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  // Download Mapping Excel template
  const downloadMappingTemplate = () => {
    // Sort CPLs
    const sortedCpls = [...cpls].sort((a, b) => a.code.localeCompare(b.code));
    const cplCodes = sortedCpls.map(c => c.code);

    // Build header row
    const headers = ['Semester', 'Kode MK', 'Nama Mata Kuliah', ...cplCodes];
    const dataRows = [headers];

    // Build data rows for each course
    const sortedCourses = [...courses].sort((a, b) => a.code.localeCompare(b.code));
    sortedCourses.forEach(course => {
      const row: any[] = ['', course.code, course.name]; // We don't have semester so leave blank
      const courseMappings = mappings.filter(m => m.courseId === course.id);
      
      cplCodes.forEach(cplCode => {
        // find mapping
        const cplId = sortedCpls.find(c => c.code === cplCode)?.id;
        const mapping = courseMappings.find(m => m.cplId === cplId);
        row.push(mapping ? mapping.weight : '');
      });
      dataRows.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mapping_CPL");
    XLSX.writeFile(workbook, "Export_Mapping_CPL.xlsx");
    showToast('Berhasil mengunduh Export Mapping CPL.');
  };

  // Import Mapping from Excel file (.xlsx, .xls)
  const handleImportMappingExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (parsedRows.length <= 1) {
          showToast('File Excel kosong atau tidak memiliki baris data.');
          return;
        }

        const headersRow = parsedRows[0].map((h: any) => String(h || '').trim());
        
        // Find indices for MK identification
        const mkCodeIdx = headersRow.findIndex((h: string) => h.toLowerCase().includes('kode mk'));
        
        // Find CPL columns (columns that exist in our database)
        const cplColMap: { idx: number, cplId: string }[] = [];
        headersRow.forEach((h: string, idx: number) => {
          const cpl = cpls.find(c => c.code.toLowerCase() === h.toLowerCase());
          if (cpl) {
            cplColMap.push({ idx, cplId: cpl.id });
          }
        });

        if (cplColMap.length === 0) {
          showToast('Tidak ada header kolom CPL (S1, S2, dsb) yang dikenali di sistem.');
          return;
        }

        const itemsToImport: any[] = [];
        const errors: string[] = [];

        for (let i = 1; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length === 0) continue;

          let rawMkCode = '';
          if (mkCodeIdx !== -1) rawMkCode = String(row[mkCodeIdx] || '').trim().toLowerCase();

          if (!rawMkCode) continue; // Skip empty rows

          // Find course ID
          const course = courses.find(c => c.code.toLowerCase() === rawMkCode);

          if (!course) {
            errors.push(`Baris ${i + 1}: Mata kuliah dengan kode "${rawMkCode}" tidak ditemukan di sistem.`);
            continue;
          }

          // Loop through CPL columns for this row
          cplColMap.forEach(col => {
            const val = row[col.idx];
            if (val !== undefined && val !== null && val !== '') {
              const weight = Number(val);
              if (!isNaN(weight)) {
                itemsToImport.push({
                  courseId: course.id,
                  cplId: col.cplId,
                  weight: weight
                });
              }
            }
          });
        }

        if (errors.length > 0) {
          alert(`Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nMapping untuk MK yang sesuai tetap akan diimpor (jika ada).`);
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data mapping valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/mappings/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} Pemetaan CPL berhasil diimpor.`);

        // Reload Mappings
        const updatedMappings = await apiCall('/mappings');
        setMappings(updatedMappings);
      } catch (err: any) {
        showToast(err.message || 'Gagal membaca file Excel.');
      } finally {
        setDataLoading(false);
        if (mappingFileInputRef.current) mappingFileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Gagal membaca file Excel.');
      if (mappingFileInputRef.current) mappingFileInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  // Download Student Excel template
  const downloadStudentTemplate = () => {
    const sampleData = [
      {
        "nim": "2015613140",
        "nama": "Maria Yasinta Apriani",
        "program_studi": "Akuntansi",
        "semester": 12,
        "kelas": "A",
        "tahun_angkatan": "2020"
      },
      {
        "nim": "2115613098",
        "nama": "Ni Kadek Diah Arisma",
        "program_studi": "Akuntansi",
        "semester": 10,
        "kelas": "C",
        "tahun_angkatan": "2021"
      },
      {
        "nim": "2215613015",
        "nama": "Luh Ketut Diah Miantari Milena",
        "program_studi": "Akuntansi",
        "semester": 8,
        "kelas": "B",
        "tahun_angkatan": "2022"
      },
      {
        "nim": "2215613051",
        "nama": "I Gede Weda Widiatmika",
        "program_studi": "Akuntansi",
        "semester": 8,
        "kelas": "A",
        "tahun_angkatan": "2022"
      },
      {
        "nim": "2215613069",
        "nama": "Desak Putu Ayu Kharisma Dewi",
        "program_studi": "Akuntansi",
        "semester": 8,
        "kelas": "D",
        "tahun_angkatan": "2022"
      },
      {
        "nim": "2215613105",
        "nama": "Ni Made Parasila Artini",
        "program_studi": "Akuntansi",
        "semester": 8,
        "kelas": "A",
        "tahun_angkatan": "2022"
      },
      {
        "nim": "2215613121",
        "nama": "Ni Kadek Mega Setyawati",
        "program_studi": "Akuntansi",
        "semester": 8,
        "kelas": "A",
        "tahun_angkatan": "2022"
      },
      {
        "nim": "2315613001",
        "nama": "Zahwa Dwi Lestari",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "A",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613002",
        "nama": "Pande Kadek Dwi Rusma Udiantari",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "B",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613004",
        "nama": "Ni Putu Anggie Pramesti Putri",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "D",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613005",
        "nama": "Ni Luh Oktaviani",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "A",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613006",
        "nama": "Ni Luh Manik Sugiantari",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "A",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613008",
        "nama": "Ni Komang Ayu Gita Purnama Sari",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "C",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613009",
        "nama": "Ni Putu Devi Maharani",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "D",
        "tahun_angkatan": "2023"
      },
      {
        "nim": "2315613010",
        "nama": "Ni Luh Meiyanti Cahyani",
        "program_studi": "Akuntansi",
        "semester": 6,
        "kelas": "B",
        "tahun_angkatan": "2023"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 15 }, // nim
      { wch: 35 }, // nama
      { wch: 15 }, // program_studi
      { wch: 10 }, // semester
      { wch: 8 },  // kelas
      { wch: 18 }, // tahun_angkatan
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template Mahasiswa");
    XLSX.writeFile(workbook, "template_mahasiswa.xlsx");
  };

  // Import Student from Excel file (.xlsx, .xls)
  const handleImportStudentExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (parsedRows.length === 0) {
          showToast('File Excel kosong.');
          return;
        }

        // Detect headers and columns
        const firstRow = parsedRows[0].map((h: any) => String(h || '').toLowerCase().trim());
        const isHeader = firstRow.some((cell: string) => 
          cell.includes('nim') || 
          cell.includes('nama') || 
          cell.includes('name') || 
          cell.includes('angkatan') || 
          cell.includes('kelas')
        );

        let nimIdx = 0;
        let nameIdx = 1;
        let kelasIdx = 4;
        let angkatanIdx = 5;
        let startRow = 0;

        if (isHeader) {
          nimIdx = firstRow.findIndex((h: string) => h.includes('nim'));
          nameIdx = firstRow.findIndex((h: string) => h.includes('nama') || h.includes('name'));
          kelasIdx = firstRow.findIndex((h: string) => h.includes('kelas') || h.includes('class'));
          angkatanIdx = firstRow.findIndex((h: string) => h.includes('angkatan') || h.includes('tahun'));
          startRow = 1;
        }

        if (nimIdx === -1 || nameIdx === -1 || kelasIdx === -1 || angkatanIdx === -1) {
          showToast('Kolom nim, nama, kelas, atau tahun_angkatan tidak ditemukan.');
          return;
        }

        const itemsToImport: any[] = [];
        const errors: string[] = [];

        for (let i = startRow; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length === 0) continue;

          const rawNim = String(row[nimIdx] || '').trim();
          const rawName = String(row[nameIdx] || '').trim();
          const rawKelas = String(row[kelasIdx] || '').trim();
          const rawAngkatan = String(row[angkatanIdx] || '').trim();

          // Skip completely empty rows
          if (!rawNim && !rawName && !rawKelas && !rawAngkatan) continue;

          if (!rawNim) {
            errors.push(`Baris ${i + 1}: NIM kosong.`);
            continue;
          }
          if (!rawName) {
            errors.push(`Baris ${i + 1}: Nama kosong.`);
            continue;
          }
          if (!rawKelas) {
            errors.push(`Baris ${i + 1}: Kelas kosong.`);
            continue;
          }
          if (!rawAngkatan) {
            errors.push(`Baris ${i + 1}: Tahun angkatan kosong.`);
            continue;
          }

          itemsToImport.push({
            nim: rawNim,
            name: rawName,
            kelas: rawKelas,
            angkatan: rawAngkatan,
            status: 'Aktif'
          });
        }

        if (errors.length > 0) {
          alert(`Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nHarap perbaiki file Anda.`);
          return;
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/students/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} Mahasiswa berhasil diimpor.`);

        // Reload Student list
        const updatedList = await apiCall('/students');
        setStudents(updatedList);
      } catch (err: any) {
        showToast(err.message || 'Gagal membaca file Excel.');
      } finally {
        setDataLoading(false);
        if (studentFileInputRef.current) studentFileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Gagal membaca file Excel.');
      if (studentFileInputRef.current) studentFileInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  // Download Grade Excel template/export
  const downloadGradeTemplate = async () => {
    try {
      setDataLoading(true);
      const allGrades = await apiCall('/grades/export/all');
      
      const headers = ['No', 'NIM', 'Nama', 'Kelas', 'KodeMK', 'Nama_MK', 'SKS', 'Wajib', 'Nilai_Angka'];
      const dataRows: any[][] = [headers];

      allGrades.forEach((g: any, index: number) => {
        dataRows.push([
          index + 1,
          g.studentNim,
          g.studentName,
          g.studentClass,
          g.courseCode,
          g.courseName,
          g.sks,
          'Ya', // Default Wajib
          g.score !== null ? g.score : ''
        ]);
      });

      if (allGrades.length === 0) {
        // If empty, just provide sample
        dataRows.push([1, '2015613005', 'NI KOMANG INDAH', '1 A', 'MKK2462401102', 'HUKUM PAJAK', 2, 'Ya', 82.50]);
      }

      const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Nilai_Mahasiswa");
      XLSX.writeFile(workbook, "Export_Nilai_Mahasiswa.xlsx");
      showToast('Berhasil mengunduh Export Nilai Mahasiswa.');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunduh data nilai.');
    } finally {
      setDataLoading(false);
    }
  };

  // Helper function to convert score to grade (0-100 to A, B, etc.)
  const getGradeLetter = (score: number) => {
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'E';
  };

  // Import Grade from Excel
  const handleImportGradeExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const parsedRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (parsedRows.length <= 1) {
          showToast('File Excel kosong atau tidak memiliki baris data.');
          return;
        }

        const headersRow = parsedRows[0].map((h: any) => String(h || '').trim().toLowerCase());
        
        const nimIdx = headersRow.findIndex((h: string) => h === 'nim');
        const mkCodeIdx = headersRow.findIndex((h: string) => h === 'kodemk' || h === 'kode mk');
        const scoreIdx = headersRow.findIndex((h: string) => h.includes('nilai_angka') || h.includes('nilai angka') || h === 'nilai');

        if (nimIdx === -1 || mkCodeIdx === -1 || scoreIdx === -1) {
          showToast('Kolom NIM, KodeMK, dan Nilai_Angka harus ada.');
          return;
        }

        const itemsToImport: any[] = [];
        const errors: string[] = [];

        for (let i = 1; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length === 0) continue;

          const rawNim = String(row[nimIdx] || '').trim();
          const rawMkCode = String(row[mkCodeIdx] || '').trim().toLowerCase();
          const rawScore = row[scoreIdx];

          if (!rawNim || !rawMkCode) continue;

          if (rawScore === undefined || rawScore === null || rawScore === '') continue; // Skip empty grades

          const score = Number(rawScore);
          if (isNaN(score)) {
            errors.push(`Baris ${i + 1}: Nilai Angka tidak valid untuk NIM ${rawNim}`);
            continue;
          }

          const student = students.find(s => s.nim === rawNim);
          if (!student) {
            errors.push(`Baris ${i + 1}: Mahasiswa NIM ${rawNim} tidak ditemukan.`);
            continue;
          }

          const course = courses.find(c => c.code.toLowerCase() === rawMkCode);
          if (!course) {
            errors.push(`Baris ${i + 1}: Mata Kuliah ${rawMkCode} tidak ditemukan.`);
            continue;
          }

          itemsToImport.push({
            studentId: student.id,
            courseId: course.id,
            score: score,
            grade: getGradeLetter(score)
          });
        }

        if (errors.length > 0) {
          alert(`Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nNilai yang valid tetap akan diimpor.`);
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data nilai valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/grades/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} Nilai berhasil diimpor.`);

        // Reload Grades if a student is currently selected
        if (selectedStudentId) {
          handleSelectStudentForGrades(selectedStudentId);
        }
      } catch (err: any) {
        showToast(err.message || 'Gagal membaca file Excel.');
      } finally {
        setDataLoading(false);
        if (gradeFileInputRef.current) gradeFileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      showToast('Gagal membaca file Excel.');
      if (gradeFileInputRef.current) gradeFileInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  // Fetch Data trigger depending on role & active tab
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    const loadData = async () => {
      setDataLoading(true);
      try {
        if (currentUser.role === 'super_admin') {
          if (activeTab === 'departments') {
            const list = await apiCall('/departments');
            setDepartments(list);
          } else if (activeTab === 'admins') {
            const adminList = await apiCall('/user-admins');
            setAdmins(adminList);
            const deptList = await apiCall('/departments');
            setDepartments(deptList);
          }
        } else if (currentUser.role === 'admin_jurusan') {
          if (activeTab === 'dashboard') {
            let url = '/cpl/averages';
            const params = new URLSearchParams();
            if (dashboardAngkatan) params.append('angkatan', dashboardAngkatan);
            if (dashboardKelas) params.append('kelas', dashboardKelas);
            if (params.toString()) url += `?${params.toString()}`;

            const [list, stats, courseList, averages] = await Promise.all([
              apiCall('/students'),
              apiCall('/students/stats'),
              apiCall('/courses'),
              apiCall(url)
            ]);
            setStudents(list);
            setStudentStats(stats);
            setCourses(courseList);
            setCplAverages(averages);
          } else if (activeTab === 'mahasiswa') {
            const list = await apiCall('/students');
            setStudents(list);
          } else if (activeTab === 'matakuliah') {
            const [courseList, cplList, mappingList] = await Promise.all([
              apiCall('/courses'),
              apiCall('/cpl'),
              apiCall('/mappings')
            ]);
            setCourses(courseList);
            setCpls(cplList);
            setMappings(mappingList);
          } else if (activeTab === 'cpl') {
            const list = await apiCall('/cpl');
            setCpls(list);
          } else if (activeTab === 'nilai') {
            const [studentList, courseList] = await Promise.all([
              apiCall('/students'),
              apiCall('/courses')
            ]);
            setStudents(studentList);
            setCourses(courseList);

            if (selectedStudentId) {
              const gradeList = await apiCall(`/grades/student/${selectedStudentId}`);
              setGrades(gradeList);
            }
          } else if (activeTab === 'hasil_cpl') {
            let url = '/cpl/averages';
            const params = new URLSearchParams();
            if (cplMatrixAngkatan) params.append('angkatan', cplMatrixAngkatan);
            if (cplMatrixKelas) params.append('kelas', cplMatrixKelas);
            if (params.toString()) url += `?${params.toString()}`;

            let ipkUrl = '/students/ipk-average';
            if (params.toString()) ipkUrl += `?${params.toString()}`;

            const [studentList, averages, ipkData] = await Promise.all([
              apiCall('/students'),
              apiCall(url),
              apiCall(ipkUrl)
            ]);
            
            setStudents(studentList);
            setCplAverages(averages);
            setCplMatrixAverageIpk(ipkData.averageIpk);
          }
          
          if (activeTab === 'mahasiswa' && selectedStudentForCpl) {
            const achs = await apiCall(`/cpl/achievements/${selectedStudentForCpl}`);
            setSelectedStudentAchievements(achs);
          }
        }
      } catch (e: any) {
        showToast(e.message || 'Error loading data');
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
  }, [isLoggedIn, currentUser, activeTab, selectedStudentId, cplMatrixAngkatan, cplMatrixKelas, selectedStudentForCpl, dashboardAngkatan, dashboardKelas]);

  // Load student grades when selecting another student on Input Nilai tab
  const handleSelectStudentForGrades = (studentId: string) => {
    setSelectedStudentId(studentId);
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess(false);

    if (!emailInput.trim()) {
      setLoginError('Email tidak boleh kosong');
      return;
    }
    if (!passwordInput.trim()) {
      setLoginError('Password tidak boleh kosong');
      return;
    }

    setLoginLoading(true);
    try {
      // CSRF initialization for Sanctum (supports subdirectory deployment in production)
      const csrfUrl = import.meta.env.PROD
        ? `${API_BASE}/sanctum/csrf-cookie`
        : `${API_BASE.replace('/api', '')}/sanctum/csrf-cookie`;
      await fetch(csrfUrl, { method: 'GET', credentials: 'include' });

      // Call Laravel login endpoint
      const result = await apiCall('/login', 'POST', {
        email: emailInput.trim(),
        password: passwordInput,
      });

      if (result && result.user) {
        setLoginSuccess(true);
        setCurrentUser(result.user);
        setTimeout(() => {
          setIsLoggedIn(true);
          setLoginSuccess(false);
          if (result.user.role === 'super_admin') {
            setActiveTab('departments');
          } else {
            setActiveTab('dashboard');
          }
          setEmailInput('');
          setPasswordInput('');
        }, 800);
      } else {
        setLoginError('Email atau password salah.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Email atau password salah.');
    } finally {
      setLoginLoading(false);
    }
  };



  // Mapping logic
  const toggleCoursePanel = async (courseId: string) => {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      return;
    }
    setExpandedCourseId(courseId);
    setCourseMappingLoading(true);
    try {
      const list = await apiCall(`/mappings?courseId=${courseId}`);
      setCourseMappings(list);
    } catch (e: any) {
      showToast(e.message || 'Gagal memuat mapping CPL.');
    } finally {
      setCourseMappingLoading(false);
    }
  };

  const handleAddInlineMapping = async () => {
    if (!expandedCourseId || !inlineMapCplId) return;
    try {
      await apiCall('/mappings', 'POST', {
        courseId: expandedCourseId,
        cplId: inlineMapCplId,
        weight: inlineMapWeight,
      });
      showToast('CPL berhasil ditambahkan ke mata kuliah.');
      setInlineMapCplId('');
      setInlineMapWeight(1.0);
      // refresh mappings for this course
      const list = await apiCall(`/mappings?courseId=${expandedCourseId}`);
      setCourseMappings(list);
      // refresh all mappings to update the badges in the table
      const allMappings = await apiCall('/mappings');
      setMappings(allMappings);
    } catch (e: any) {
      showToast(e.message || 'Gagal menambahkan mapping CPL.');
    }
  };

  const handleDeleteInlineMapping = async (mappingId: string) => {
    if (!window.confirm('Yakin ingin menghapus pemetaan ini?')) return;
    try {
      await apiCall(`/mappings/${mappingId}`, 'DELETE');
      showToast('Pemetaan berhasil dihapus.');
      // refresh mappings
      const list = await apiCall(`/mappings?courseId=${expandedCourseId}`);
      setCourseMappings(list);
      const allMappings = await apiCall('/mappings');
      setMappings(allMappings);
    } catch (e: any) {
      showToast(e.message || 'Gagal menghapus mapping CPL.');
    }
  };


  // Logout handler
  const handleLogout = async () => {
    if (window.confirm('Apakah Anda yakin ingin keluar?')) {
      try {
        await apiCall('/logout', 'POST');
      } catch (err) {
        console.error('Logout error:', err);
      } finally {
        setIsLoggedIn(false);
        setCurrentUser(null);
        setSelectedStudentId('');
        setSelectedStudentAchievements([]);
      }
    }
  };

  // Print Laporan to PDF
  const handlePrintReport = async (elementId: string, filename: string, _isPrintTemplate = false) => {
    const input = document.getElementById(elementId);
    if (!input) {
      showToast('Gagal mencetak: area laporan tidak ditemukan.');
      return;
    }

    showToast(`Memproses ${filename} PDF...`);
    try {
      // Small delay to ensure the toast renders before freezing the main thread
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(input, {
        scale: 2, 
        backgroundColor: '#FFFFFF', 
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`${filename}.pdf`);
      
      showToast('Unduhan PDF berhasil!');
    } catch (error) {
      console.error('PDF Generation Error:', error);
      showToast('Gagal menghasilkan PDF.');
    }
  };

  // CRUD Save helper
  const handleSaveData = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    try {
      if (modalType === 'department') {
        if (!deptFormName.trim() || !deptFormCode.trim()) {
          setModalError('Nama dan kode jurusan wajib diisi.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/departments', 'POST', { name: deptFormName, code: deptFormCode });
          showToast('Jurusan berhasil ditambahkan.');
        } else {
          await apiCall(`/departments/${editingId}`, 'PUT', { name: deptFormName, code: deptFormCode });
          showToast('Jurusan berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/departments');
        setDepartments(list);
      } else if (modalType === 'admin') {
        if (!adminFormName.trim() || !adminFormEmail.trim() || (!editingId && !adminFormPassword)) {
          setModalError('Nama, email, dan password wajib diisi.');
          return;
        }
        if (!adminFormDeptId) {
          setModalError('Pilih jurusan untuk admin.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/user-admins', 'POST', {
            name: adminFormName,
            email: adminFormEmail,
            password: adminFormPassword,
            departmentId: adminFormDeptId,
          });
          showToast('Admin jurusan berhasil dibuat.');
        } else {
          await apiCall(`/user-admins/${editingId}`, 'PUT', {
            name: adminFormName,
            email: adminFormEmail,
            password: adminFormPassword || undefined,
            departmentId: adminFormDeptId,
          });
          showToast('Admin jurusan berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/user-admins');
        setAdmins(list);
      } else if (modalType === 'student') {
        if (!studentFormNim.trim() || !studentFormName.trim() || !studentFormAngkatan || !studentFormKelas) {
          setModalError('Harap isi semua kolom.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/students', 'POST', {
            nim: studentFormNim,
            name: studentFormName,
            angkatan: studentFormAngkatan,
            kelas: studentFormKelas,
            status: studentFormStatus,
          });
          showToast('Mahasiswa berhasil ditambahkan.');
        } else {
          await apiCall(`/students/${editingId}`, 'PUT', {
            nim: studentFormNim,
            name: studentFormName,
            angkatan: studentFormAngkatan,
            kelas: studentFormKelas,
            status: studentFormStatus,
          });
          showToast('Data mahasiswa berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/students');
        setStudents(list);
      } else if (modalType === 'course') {
        if (!courseFormCode.trim() || !courseFormName.trim() || !courseFormSks) {
          setModalError('Harap isi semua kolom.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/courses', 'POST', {
            code: courseFormCode,
            name: courseFormName,
            sks: courseFormSks,
          });
          showToast('Mata kuliah berhasil ditambahkan.');
        } else {
          await apiCall(`/courses/${editingId}`, 'PUT', {
            code: courseFormCode,
            name: courseFormName,
            sks: courseFormSks,
          });
          showToast('Mata kuliah berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/courses');
        setCourses(list);
      } else if (modalType === 'cpl') {
        if (!cplFormCode.trim() || !cplFormDesc.trim() || !cplFormCat || cplFormTarget === undefined) {
          setModalError('Harap isi semua kolom.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/cpl', 'POST', {
            code: cplFormCode,
            description: cplFormDesc,
            category: cplFormCat,
            targetValue: cplFormTarget,
          });
          showToast('CPL berhasil ditambahkan.');
        } else {
          await apiCall(`/cpl/${editingId}`, 'PUT', {
            code: cplFormCode,
            description: cplFormDesc,
            category: cplFormCat,
            targetValue: cplFormTarget,
          });
          showToast('CPL berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/cpl');
        setCpls(list);
      } else if (modalType === 'grade') {
        if (!gradeFormCourseId || !gradeFormLetter || !gradeFormSemester || !gradeFormYear) {
          setModalError('Pilih mata kuliah, nilai huruf, semester, dan tahun akademik.');
          return;
        }
        // Score conversion
        let score = 0;
        switch (gradeFormLetter) {
          case 'A': score = 4.0; break;
          case 'A-': score = 3.7; break;
          case 'B+': score = 3.3; break;
          case 'B': score = 3.0; break;
          case 'B-': score = 2.7; break;
          case 'C+': score = 2.3; break;
          case 'C': score = 2.0; break;
          case 'D': score = 1.0; break;
          default: score = 0.0;
        }

        await apiCall('/grades', 'POST', {
          studentId: selectedStudentId,
          courseId: gradeFormCourseId,
          grade: gradeFormLetter,
          score,
          semester: gradeFormSemester,
          academicYear: gradeFormYear,
        });
        showToast('Data nilai berhasil disimpan.');
        // Refresh
        const list = await apiCall(`/grades/student/${selectedStudentId}`);
        setGrades(list);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'Terjadi kesalahan sistem.');
    }
  };

  // Delete Action handler
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      const { type, id } = deleteTarget;
      if (type === 'department') {
        await apiCall(`/departments/${id}`, 'DELETE');
        showToast('Jurusan berhasil dihapus.');
        setDepartments(departments.filter(d => d.id !== id));
      } else if (type === 'admin') {
        await apiCall(`/user-admins/${id}`, 'DELETE');
        showToast('Admin berhasil dihapus.');
        setAdmins(admins.filter(a => a.id !== id));
      } else if (type === 'student') {
        await apiCall(`/students/${id}`, 'DELETE');
        showToast('Mahasiswa berhasil dihapus.');
        setStudents(students.filter(s => s.id !== id));
      } else if (type === 'student-bulk') {
        const idsToDelete = deleteTarget.ids || [];
        await apiCall('/students/bulk-delete', 'POST', { ids: idsToDelete });
        showToast(`${idsToDelete.length} Mahasiswa berhasil dihapus.`);
        setStudents(students.filter(s => !idsToDelete.includes(s.id)));
        setSelectedStudentIds([]);
      } else if (type === 'course') {
        await apiCall(`/courses/${id}`, 'DELETE');
        showToast('Mata kuliah berhasil dihapus.');
        setCourses(courses.filter(c => c.id !== id));
      } else if (type === 'course-bulk') {
        const idsToDelete = deleteTarget.ids || [];
        await apiCall('/courses/bulk-delete', 'POST', { ids: idsToDelete });
        showToast(`${idsToDelete.length} Mata kuliah berhasil dihapus.`);
        setCourses(courses.filter(c => !idsToDelete.includes(c.id)));
        setSelectedCourseIds([]);
      } else if (type === 'cpl') {
        await apiCall(`/cpl/${id}`, 'DELETE');
        showToast('CPL berhasil dihapus.');
        setCpls(cpls.filter(c => c.id !== id));
      } else if (type === 'mapping') {
        await apiCall(`/mappings/${id}`, 'DELETE');
        showToast('Pemetaan bobot berhasil dihapus.');
        setMappings(mappings.filter(m => m.id !== id));
      } else if (type === 'grade') {
        await apiCall(`/grades/${id}`, 'DELETE');
        showToast('Data nilai berhasil dihapus.');
        setGrades(grades.filter(g => g.id !== id));
      }
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus data.');
    }
  };

  // Open Add Modals
  const openAddModal = (type: typeof modalType) => {
    setModalType(type);
    setModalAction('add');
    setEditingId(null);
    setModalError('');

    // Clear fields
    if (type === 'department') {
      setDeptFormName('');
      setDeptFormCode('');
    } else if (type === 'admin') {
      setAdminFormName('');
      setAdminFormEmail('');
      setAdminFormPassword('');
      setAdminFormDeptId(departments[0]?.id || '');
    } else if (type === 'student') {
      setStudentFormNim('');
      setStudentFormName('');
      setStudentFormAngkatan('2024');
      setStudentFormKelas('A');
      setStudentFormStatus('Aktif');
    } else if (type === 'course') {
      setCourseFormCode('');
      setCourseFormName('');
      setCourseFormSks(3);
    } else if (type === 'cpl') {
      setCplFormCode('');
      setCplFormDesc('');
      setCplFormCat('Sikap');
      setCplFormTarget(75);
    } else if (type === 'grade') {
      setGradeFormCourseId(courses[0]?.id || '');
      setGradeFormLetter('A');
      setGradeFormSemester('IV');
      setGradeFormYear('2024/2025');
    }
    setIsModalOpen(true);
  };

  // Open Edit Modals
  const openEditModal = (type: typeof modalType, item: any) => {
    setModalType(type);
    setModalAction('edit');
    setEditingId(item.id);
    setModalError('');

    if (type === 'department') {
      setDeptFormName(item.name);
      setDeptFormCode(item.code);
    } else if (type === 'admin') {
      setAdminFormName(item.name);
      setAdminFormEmail(item.email);
      setAdminFormPassword('');
      setAdminFormDeptId(item.departmentId || '');
    } else if (type === 'student') {
      setStudentFormNim(item.nim);
      setStudentFormName(item.name);
      setStudentFormAngkatan(item.angkatan);
      setStudentFormKelas(item.kelas);
      setStudentFormStatus(item.status);
    } else if (type === 'course') {
      setCourseFormCode(item.code);
      setCourseFormName(item.name);
      setCourseFormSks(item.sks);
    } else if (type === 'cpl') {
      setCplFormCode(item.code);
      setCplFormDesc(item.description);
      setCplFormCat(item.category);
      setCplFormTarget(item.targetValue);
    }
    setIsModalOpen(true);
  };

  // Open delete confirm modal
  const openDeleteConfirm = (type: string, id: string, name: string, ids?: string[]) => {
    setDeleteTarget({ type, id, name, ids });
    setDeleteConfirmOpen(true);
  };

  // Get unique Kelas values dynamically from students
  const uniqueKelasList = React.useMemo(() => {
    if (!Array.isArray(students)) return [];
    const list = students.map(s => s ? s.kelas : '').filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [students]);

  // Get unique Angkatan values dynamically from students
  const uniqueAngkatanList = React.useMemo(() => {
    if (!Array.isArray(students)) return [];
    const list = students.map(s => s ? s.angkatan : '').filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) => Number(b) - Number(a)); // Sort descending
  }, [students]);

  // Live searching & dropdown filtering (Mahasiswa Screen)
  const filteredStudents = React.useMemo(() => {
    if (!Array.isArray(students)) return [];
    return students.filter(student => {
      if (!student) return false;
      const name = student.name || '';
      const nim = student.nim || '';
      const kelas = student.kelas || '';
      const angkatan = student.angkatan || '';

      const matchesSearch = studentSearch === '' || 
                            name.toLowerCase().includes(studentSearch.toLowerCase()) || 
                            nim.includes(studentSearch);
      const matchesAngkatan = studentFilterAngkatan === '' || angkatan === studentFilterAngkatan;
      const matchesKelas = studentFilterKelas === '' || kelas.toLowerCase() === studentFilterKelas.toLowerCase();
      
      return matchesSearch && matchesAngkatan && matchesKelas;
    });
  }, [students, studentSearch, studentFilterAngkatan, studentFilterKelas]);

  const filteredCourses = React.useMemo(() => {
    if (!Array.isArray(courses)) return [];
    let result = courses.filter(course => {
      if (!course) return false;
      const name = course.name || '';
      const code = course.code || '';
      return courseSearch === '' || 
             name.toLowerCase().includes(courseSearch.toLowerCase()) || 
             code.toLowerCase().includes(courseSearch.toLowerCase());
    });
    
    if (courseSortConfig) {
      result.sort((a: any, b: any) => {
        let valA = a[courseSortConfig.key];
        let valB = b[courseSortConfig.key];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return courseSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return courseSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [courses, courseSearch, courseSortConfig]);

  const handleCourseSort = (key: 'code' | 'name' | 'sks') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (courseSortConfig && courseSortConfig.key === key && courseSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setCourseSortConfig({ key, direction });
  };

  const totalItems = filteredStudents.length;
  const totalPages = Math.ceil(totalItems / studentItemsPerPage) || 1;
  const indexOfLastItem = studentPage * studentItemsPerPage;
  const indexOfFirstItem = indexOfLastItem - studentItemsPerPage;
  const currentItems = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    setStudentPage(1);
    setSelectedStudentIds([]);
  }, [studentSearch, studentFilterAngkatan, studentFilterKelas]);

  // CPL achievements filtering inside student detail (Hasil CPL Screen)
  // Removed pagination logic

  // Load CPL detail mapped courses
  const handleOpenCplDetailModal = async (cplCode: string, studentIdOverride?: string) => {
    try {
      setSelectedCplForDetail(cplCode);
      const sid = studentIdOverride || selectedStudentId;
      const url = sid 
        ? `/courses/mapping/${cplCode}?studentId=${sid}`
        : `/courses/mapping/${cplCode}`;
      const data = await apiCall(url);
      setCplDetailMappingCourses(data);
    } catch (e) {
      showToast('Gagal memuat detail pemetaan.');
    }
  };

  // Dashboard calculations based on averages
  const measuredCpls = React.useMemo(() => {
    const measured = cplAverages.filter(c => c.status !== 'Belum Diukur');
    return measured.length > 0 ? measured : cplAverages;
  }, [cplAverages]);
  const achievedCpls = measuredCpls.filter(c => c.status === 'Tercapai');
  const cplTerpenuhiPct = measuredCpls.length > 0 ? Math.round((achievedCpls.length / measuredCpls.length) * 100) : 0;
  const averageCplValue = measuredCpls.length > 0 ? (measuredCpls.reduce((acc, curr) => acc + curr.value, 0) / measuredCpls.length).toFixed(1) : '0.0';

  // Radar categories average computation
  const getCategoryAvg = (cat: string) => {
    const list = cplAverages.filter(c => c.category === cat && c.status !== 'Belum Diukur');
    if (list.length === 0) return 0;
    return Math.round(list.reduce((acc, curr) => acc + curr.value, 0) / list.length);
  };
  const avgSikap = getCategoryAvg('Sikap');
  const avgPengetahuan = getCategoryAvg('Pengetahuan');
  const avgKtmpUmum = getCategoryAvg('Keterampilan Umum');
  const avgKtmpKhusus = getCategoryAvg('Keterampilan Khusus');

  // Removed unused studentRadarPoints

  // App initialization screen
  if (appLoading) {
    return (
      <div className="min-h-screen bg-mesh flex flex-col justify-center items-center gap-md">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
        <p className="font-headline-lg text-primary text-headline-lg font-bold">Memuat Aplikasi...</p>
      </div>
    );
  }

  // LANDING PAGE & LOGIN SCREEN
  if (!isLoggedIn) {
    if (showLanding) {
      return (
        <LandingPage onLoginClick={handleShowLogin} />
      );
    }

    return (
      <main className="flex min-h-screen font-sans">
        {/* Left Panel: Branding & Illustration */}
        <section className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 overflow-hidden bg-[#0d2a6a]">
          {/* Background image overlay with blue tint */}
          <div className="absolute inset-0 z-0">
             <div className="absolute inset-0 bg-[#0d2a6a]/90 z-10 mix-blend-multiply"></div>
             {/* Using a placeholder university building image */}
             <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=2070')] bg-cover bg-center opacity-30 mix-blend-overlay"></div>
          </div>
          
          {/* Top Left Logo */}
          <div className="relative z-20 flex items-center gap-4">
            <img 
              alt="PNB Logo" 
              className="w-14 h-14" 
              src="https://upload.wikimedia.org/wikipedia/id/e/ed/Logo_Politeknik_Negeri_Bali.png"
            />
            <div className="flex flex-col">
              <span className="text-white font-bold text-xl leading-tight tracking-wide">POLITEKNIK</span>
              <span className="text-white font-bold text-xl leading-tight tracking-wide">NEGERI BALI</span>
            </div>
          </div>

          {/* Main Text Area */}
          <div className="relative z-20 flex flex-col mt-32 mb-auto">
            <h2 className="text-white text-3xl mb-1 font-medium tracking-wide">Sistem Informasi</h2>
            <h1 className="text-[#FFC107] text-5xl font-bold leading-[1.15] max-w-[90%]">
              Capaian Pembelajaran Lulusan (CPL)
            </h1>
            <div className="w-12 h-1 bg-[#FFC107] my-6"></div>
            <p className="text-white/90 text-lg max-w-[85%] leading-relaxed font-light">
              Platform pengelolaan dan pemantauan CPL berbasis mata kuliah untuk mendukung akreditasi dan mutu akademik PNB.
            </p>
          </div>

          {/* Bottom Left Yellow Curve (SVG) */}
          <div className="absolute bottom-0 left-0 w-full h-[180px] z-10 overflow-hidden">
             <svg viewBox="0 0 500 150" preserveAspectRatio="none" className="h-full w-full opacity-90 scale-x-125 origin-left">
               <path d="M-50,150 C100,50 300,100 500,0 L500,150 Z" fill="#FFC107" opacity="0.3"></path>
               <path d="M-50,150 C150,100 250,120 500,50 L500,150 Z" fill="#FFC107"></path>
             </svg>
          </div>
        </section>

        {/* Right Panel: Login Form */}
        <section className="w-full lg:w-[45%] bg-[#F8FAFC] flex flex-col justify-center items-center relative overflow-hidden">
          {/* Top Right Subtle Pattern */}
          <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full border-[60px] border-black/[0.02]"></div>
          <div className="absolute top-[-50px] right-[-50px] w-[300px] h-[300px] rounded-full border-[40px] border-black/[0.02]"></div>
          
          {/* Bottom Right Yellow Accent */}
          <div className="absolute bottom-[-20px] right-[-20px] w-48 h-48 opacity-80 rotate-12">
             <svg viewBox="0 0 100 100" className="w-full h-full fill-[#FFC107]">
               <path d="M100 100 V 30 Q 30 30 0 100 Z" />
             </svg>
          </div>

          <div className="absolute top-8 left-8 lg:hidden flex items-center gap-3">
            <img 
              alt="PNB Logo" 
              className="w-10 h-10" 
              src="https://upload.wikimedia.org/wikipedia/id/e/ed/Logo_Politeknik_Negeri_Bali.png"
            />
            <span className="font-bold text-xl text-[#0d2a6a]">CPL PNB</span>
          </div>

          <div className="w-full max-w-[580px] z-10 p-4 sm:p-8">
            <div className="bg-white rounded-[2rem] shadow-[0_8px_40px_rgb(0,0,0,0.06)] p-8 sm:px-14 sm:py-16 flex flex-col relative border border-black/[0.02]">
              
              {/* Logo & Title */}
              <div className="flex flex-col items-center text-center mb-10">
                <img 
                  alt="PNB Logo" 
                  className="w-24 h-24 object-contain mb-5" 
                  src="https://upload.wikimedia.org/wikipedia/id/e/ed/Logo_Politeknik_Negeri_Bali.png"
                />
                <h3 className="text-[#0d2a6a] font-bold text-[1.15rem] mb-4 tracking-wider uppercase">POLITEKNIK NEGERI BALI</h3>
                <p className="text-gray-500 text-[15px] leading-relaxed max-w-[95%] mx-auto font-medium">
                  Masuk untuk mengakses Sistem Informasi Capaian Pembelajaran Lulusan (CPL)
                </p>
              </div>

              {loginError && (
                <div className="bg-red-50 text-red-600 rounded-xl p-4 text-[15px] text-center flex items-center justify-center gap-2 mb-6 border border-red-100">
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  <span>{loginError}</span>
                </div>
              )}

              {loginSuccess && (
                <div className="bg-green-50 text-green-600 rounded-xl p-4 text-[15px] text-center flex items-center justify-center gap-2 mb-6 border border-green-100">
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  <span>Login Berhasil! Mengalihkan...</span>
                </div>
              )}

              <form className="flex flex-col gap-6" onSubmit={handleLogin}>
                <div className="flex flex-col gap-3">
                  <label className="text-[15px] font-bold text-gray-800 ml-1" htmlFor="email">
                    Username
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-[22px]">
                      person
                    </span>
                    <input 
                      className="w-full bg-[#F1F5F9] border-none rounded-full py-[18px] pl-[52px] pr-5 text-gray-800 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0d2a6a]/30 transition-all" 
                      id="email" 
                      placeholder="Masukkan username" 
                      type="text"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      disabled={loginLoading || loginSuccess}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[15px] font-bold text-gray-800 ml-1" htmlFor="password">
                    Kata Sandi
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-[22px]">
                      lock
                    </span>
                    <input 
                      className="w-full bg-[#F1F5F9] border-none rounded-full py-[18px] pl-[52px] pr-[52px] text-gray-800 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0d2a6a]/30 transition-all" 
                      id="password" 
                      placeholder="Masukkan kata sandi" 
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      disabled={loginLoading || loginSuccess}
                    />
                    <button 
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0d2a6a] transition-colors focus:outline-none flex items-center justify-center" 
                      onClick={() => setShowPassword(!showPassword)} 
                      type="button"
                      disabled={loginLoading || loginSuccess}
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end mt-[-4px]">
                  <a className="text-[#0d2a6a] text-[15px] font-semibold hover:underline" href="#">
                    Lupa kata sandi?
                  </a>
                </div>

                <button 
                  className={`w-full bg-[#0d2a6a] hover:bg-[#12398b] text-white font-bold py-[18px] rounded-full flex items-center justify-center gap-2 mt-4 transition-colors shadow-lg shadow-[#0d2a6a]/20 ${
                    loginLoading || loginSuccess ? 'opacity-80 cursor-not-allowed' : ''
                  }`}
                  type="submit"
                  disabled={loginLoading || loginSuccess}
                >
                  {loginLoading ? (
                    <>
                      <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[20px]">login</span>
                      <span>Masuk</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-12 text-center border-t border-gray-100 pt-6">
                <p className="text-gray-500 text-[13px] font-medium">
                  © 2024 <span className="text-[#0d2a6a]">Politeknik Negeri Bali</span>. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // MAIN LAYOUT (LOGGED IN)
  return (
    <div className="font-body-base text-body-base selection:bg-primary/30 min-h-screen flex flex-col bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 w-full h-[72px] bg-primary flex items-center justify-between px-xl shadow-md">
        <div className="flex items-center gap-md">
          <img 
            alt="PNB Logo" 
            className="w-12 h-12 bg-white rounded-full p-1" 
            src="https://upload.wikimedia.org/wikipedia/id/e/ed/Logo_Politeknik_Negeri_Bali.png"
          />
          <div>
            <h1 className="font-headline-xl text-white font-bold leading-tight">Sistem Informasi Capaian Pembelajaran Lulusan</h1>
            <p className="font-label-sm text-white/80 leading-tight">Politeknik Negeri Bali</p>
          </div>
        </div>
        <div className="flex items-center gap-lg">
          <div className="text-white text-label-sm">
            Selamat datang, <b>{currentUser?.name}</b>
          </div>
          <button 
            onClick={handleLogout} 
            className="bg-white text-primary px-md py-sm rounded-md font-label-sm font-bold shadow-sm hover:bg-surface-variant transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* SideNavBar */}
        <aside className="w-[260px] bg-surface border-r border-outline overflow-y-auto flex flex-col py-lg z-30 shrink-0">
          <nav className="flex-1 px-md space-y-unit custom-scrollbar">
            {currentUser?.role === 'super_admin' ? (
              <>
                {/* Departments CRUD */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'departments' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('departments')}
                >
                  <span className="material-symbols-outlined">domain</span>
                  <span>Jurusan (Departments)</span>
                </button>

                {/* Admins CRUD */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'admins' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('admins')}
                >
                  <span className="material-symbols-outlined">admin_panel_settings</span>
                  <span>Admin Jurusan</span>
                </button>
              </>
            ) : (
              <>
                {/* Dashboard Tab */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'dashboard' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('dashboard')}
                >
                  <span className="material-symbols-outlined">dashboard</span>
                  <span>Dashboard</span>
                </button>

                {/* Mahasiswa Tab */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'mahasiswa' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('mahasiswa')}
                >
                  <span className="material-symbols-outlined">group</span>
                  <span>Mahasiswa</span>
                </button>

                {/* Mata Kuliah */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'matakuliah' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('matakuliah')}
                >
                  <span className="material-symbols-outlined">book</span>
                  <span>Mata Kuliah</span>
                </button>

                {/* CPL */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'cpl' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('cpl')}
                >
                  <span className="material-symbols-outlined">verified</span>
                  <span>CPL</span>
                </button>

                {/* Input Nilai */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'nilai' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('nilai')}
                >
                  <span className="material-symbols-outlined">edit_note</span>
                  <span>Input Nilai</span>
                </button>

                {/* Hasil CPL */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'hasil_cpl' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => setActiveTab('hasil_cpl')}
                >
                  <span className="material-symbols-outlined">analytics</span>
                  <span>Hasil CPL</span>
                </button>
              </>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 relative flex flex-col overflow-y-auto bg-background">
          <div className="flex-1 max-w-7xl mx-auto w-full p-lg lg:p-2xl flex flex-col gap-lg">
        {/* Toast alert popup */}
        {toastMessage && (
          <div className="fixed top-20 right-6 z-50 bg-primary-container text-on-primary-container px-lg py-md rounded-xl shadow-2xl border border-primary/20 flex items-center gap-sm animate-bounce">
            <span className="material-symbols-outlined">info</span>
            <span className="font-label-sm text-label-sm font-bold">{toastMessage}</span>
          </div>
        )}

        {/* Dynamic Route Switching */}

        {/* ================= SUPER ADMIN TABS ================= */}
        {currentUser?.role === 'super_admin' && activeTab === 'departments' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Daftar Jurusan</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola data program studi / jurusan di Politeknik Negeri Bali.</p>
              </div>
              <button 
                className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                onClick={() => openAddModal('department')}
              >
                <span className="material-symbols-outlined">add</span>
                Tambah Jurusan
              </button>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kode</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Nama Jurusan</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {departments.length > 0 ? (
                      departments.map((dept, index) => (
                        <tr key={dept.id} className="hover-row transition-colors">
                          <td className="px-lg py-md font-body-sm">{index + 1}</td>
                          <td className="px-lg py-md font-body-sm font-bold text-primary">{dept.code}</td>
                          <td className="px-lg py-md font-body-sm font-medium text-on-surface">{dept.name}</td>
                          <td className="px-lg py-md">
                            <div className="flex items-center justify-center gap-sm">
                              <button 
                                className="p-xs text-on-surface-variant hover:text-secondary transition-colors"
                                onClick={() => openEditModal('department', dept)}
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              <button 
                                className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                onClick={() => openDeleteConfirm('department', dept.id, dept.name)}
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data jurusan. Silakan tambahkan.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === 'super_admin' && activeTab === 'admins' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Admin Jurusan</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola akun administrator untuk masing-masing jurusan.</p>
              </div>
              <button 
                className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                onClick={() => openAddModal('admin')}
              >
                <span className="material-symbols-outlined">person_add</span>
                Tambah Admin Jurusan
              </button>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Nama Admin</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Email</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Jurusan</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {admins.length > 0 ? (
                      admins.map((adm, index) => (
                        <tr key={adm.id} className="hover-row transition-colors">
                          <td className="px-lg py-md font-body-sm">{index + 1}</td>
                          <td className="px-lg py-md font-body-sm font-medium text-on-surface">{adm.name}</td>
                          <td className="px-lg py-md font-body-sm text-on-surface-variant">{adm.email}</td>
                          <td className="px-lg py-md font-body-sm text-primary font-semibold">
                            {adm.departmentName ? `${adm.departmentName} (${adm.departmentCode})` : '—'}
                          </td>
                          <td className="px-lg py-md">
                            <div className="flex items-center justify-center gap-sm">
                              <button 
                                className="p-xs text-on-surface-variant hover:text-secondary transition-colors"
                                onClick={() => openEditModal('admin', adm)}
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                              <button 
                                className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                onClick={() => openDeleteConfirm('admin', adm.id, adm.name)}
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data admin jurusan.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ================= DEPARTMENT ADMIN TABS ================= */}
        {currentUser?.role === 'admin_jurusan' && activeTab === 'dashboard' && (
          <div className="p-gutter space-y-lg flex-1">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface mb-xs">Dashboard Jurusan</h3>
                <nav className="flex items-center gap-xs font-label-xs text-label-xs text-on-surface-variant">
                  <span>Home</span>
                  <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                  <span className="text-primary font-bold">Dashboard</span>
                </nav>
              </div>
              <button 
                className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-label-sm glow-primary hover:scale-105 transition-transform duration-200"
                onClick={() => handlePrintReport('laporan-dashboard-content', 'Dashboard_Jurusan')}
              >
                <span className="material-symbols-outlined">download</span>
                Cetak Laporan
              </button>
            </div>

            {/* Filter Bar */}
            <section className="glass-panel p-md rounded-2xl flex flex-wrap gap-md items-end shadow-md">
              <div className="flex-1 min-w-[200px]">
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Filter Angkatan</label>
                <select 
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={dashboardAngkatan}
                  onChange={(e) => setDashboardAngkatan(e.target.value)}
                >
                  <option value="">Semua Angkatan</option>
                  {uniqueAngkatanList.map(angkatan => (
                    <option key={angkatan} value={angkatan}>{angkatan}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Filter Kelas</label>
                <select 
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={dashboardKelas}
                  onChange={(e) => setDashboardKelas(e.target.value)}
                >
                  <option value="">Semua Kelas</option>
                  {uniqueKelasList.map(kelas => (
                    <option key={kelas} value={kelas}>{kelas}</option>
                  ))}
                </select>
              </div>
              <button 
                className="bg-surface-bright text-on-surface px-lg py-[10px] rounded-lg font-label-sm hover:bg-surface-container-highest transition-colors cursor-pointer"
                onClick={() => {
                  showToast('Filter dashboard berhasil diterapkan.');
                }}
              >
                Terapkan
              </button>
            </section>

            <div id="laporan-dashboard-content" className="space-y-lg">
              {/* Stats Bento Grid */}
              <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter">
              <div className="glass-panel p-lg rounded-2xl flex items-center gap-lg shadow-sm">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-3xl">group</span>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Total Mahasiswa</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{studentStats.total}</p>
                </div>
              </div>

              <div className="glass-panel p-lg rounded-2xl flex items-center gap-lg shadow-sm">
                <div className="w-14 h-14 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-3xl">book</span>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Mata Kuliah</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{courses.length}</p>
                </div>
              </div>

              <div className="glass-panel p-lg rounded-2xl flex items-center gap-lg shadow-sm">
                <div className="w-14 h-14 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary">
                  <span className="material-symbols-outlined text-3xl">verified_user</span>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">CPL Terpenuhi</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{cplTerpenuhiPct}%</p>
                </div>
              </div>

              <div className="glass-panel p-lg rounded-2xl flex items-center gap-lg shadow-sm">
                <div className="w-14 h-14 rounded-full bg-surface-tint/10 flex items-center justify-center text-surface-tint">
                  <span className="material-symbols-outlined text-3xl">analytics</span>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 uppercase tracking-wider">Rata-rata Capaian</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{averageCplValue}</p>
                </div>
              </div>
            </section>

            {/* Status Kelulusan Donut Chart (Moved to top) */}
            <section className="glass-panel p-lg rounded-3xl flex flex-col md:flex-row items-center justify-between gap-xl shadow-md">
              <div className="w-full md:w-auto text-left">
                <h4 className="font-headline-lg text-headline-lg font-bold text-on-surface mb-xs">Status Kelulusan CPL</h4>
                <p className="text-on-surface-variant text-body-sm">Persentase capaian CPL yang memenuhi target kurikulum.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-xl w-full md:w-auto justify-end">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" fill="transparent" r="54" stroke="#334155" strokeWidth="12"></circle>
                    <circle 
                      cx="64" 
                      cy="64" 
                      fill="transparent" 
                      r="54" 
                      stroke="#6366F1" 
                      strokeDasharray="339" 
                      strokeDashoffset={339 - (339 * cplTerpenuhiPct) / 100} 
                      strokeLinecap="round" 
                      strokeWidth="12"
                      className="transition-all duration-700 ease-out"
                    ></circle>
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="font-display-xl text-display-xl font-bold text-on-surface">{cplTerpenuhiPct}%</span>
                    <span className="font-label-2xs text-label-2xs text-on-surface-variant">Tercapai</span>
                  </div>
                </div>

                <div className="w-full sm:w-auto space-y-md min-w-[220px]">
                  <div className="flex justify-between items-center p-md bg-white/5 rounded-xl">
                    <div className="flex items-center gap-md">
                      <span className="w-3 h-3 rounded-full bg-primary"></span>
                      <span className="font-label-sm text-label-sm text-on-surface">Tercapai</span>
                    </div>
                    <span className="font-label-sm font-bold text-tertiary">{achievedCpls.length} CPL</span>
                  </div>
                  <div className="flex justify-between items-center p-md bg-white/5 rounded-xl">
                    <div className="flex items-center gap-md">
                      <span className="w-3 h-3 rounded-full bg-error"></span>
                      <span className="font-label-sm text-label-sm text-on-surface">Tidak Tercapai</span>
                    </div>
                    <span className="font-label-sm font-bold text-error">{measuredCpls.length - achievedCpls.length} CPL</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Capaian Per CPL Bar Chart (Full width) */}
            <section className="glass-panel p-lg rounded-3xl flex flex-col shadow-md w-full">
              <div className="flex justify-between items-center mb-xl">
                <h4 className="font-headline-lg text-headline-lg font-bold text-on-surface">Capaian Per CPL</h4>
                <div className="flex gap-sm">
                  <span className="flex items-center gap-xs font-label-xs text-label-xs text-on-surface-variant">
                    <span className="w-3 h-3 rounded-full bg-primary"></span> Capaian (%)
                  </span>
                </div>
              </div>
              
              <div className="flex items-end justify-start gap-sm h-72 pt-lg px-md border-b border-outline-variant/30 overflow-x-auto overflow-y-hidden pb-4">
                {measuredCpls.length > 0 ? (
                  measuredCpls.map((cplData) => (
                    <div key={cplData.id} className="flex flex-col justify-end items-center h-full min-w-[48px] max-w-[80px] flex-1 group">
                      <div className="w-full h-full relative">
                        <div 
                          className="absolute bottom-0 w-full chart-bar rounded-t-lg transition-all duration-500 ease-in-out group-hover:brightness-125"
                          style={{ height: `${Math.max(cplData.value, 2)}%` }}
                        >
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white font-label-xs text-[10px] py-[2px] px-[6px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md z-20">
                            {cplData.value}%
                          </span>
                        </div>
                      </div>
                      <span className="font-label-xs text-label-xs text-on-surface-variant select-none truncate w-full text-center mt-sm">{cplData.code}</span>
                    </div>
                  ))
                ) : (
                  <div className="w-full text-center pb-lg text-on-surface-variant">Belum ada data CPL diukur.</div>
                )}
              </div>
            </section>

            {/* Radar Kategori Capaian CPL */}
            <section className="glass-panel p-lg rounded-3xl shadow-md">
              <div className="flex flex-col md:flex-row justify-between md:items-center mb-xl gap-md">
                <h4 className="font-headline-lg text-headline-lg font-bold text-on-surface">Radar Capaian Kategori CPL</h4>
                <div className="flex gap-md">
                  <div className="flex items-center gap-xs font-label-xs text-label-xs">
                    <span className="w-3 h-3 rounded bg-secondary"></span> Target Kurikulum
                  </div>
                  <div className="flex items-center gap-xs font-label-xs text-label-xs">
                    <span className="w-3 h-3 rounded bg-primary"></span> Realisasi Capaian
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter mt-lg">
                <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-primary">
                  <p className="font-label-xs text-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Sikap</p>
                  <p className="font-headline-xl text-headline-xl font-bold text-on-surface">{avgSikap}%</p>
                  <div className="w-full bg-white/10 h-1.5 rounded-full mt-sm">
                    <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${avgSikap}%` }}></div>
                  </div>
                </div>

                <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-secondary">
                  <p className="font-label-xs text-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Pengetahuan</p>
                  <p className="font-headline-xl text-headline-xl font-bold text-on-surface">{avgPengetahuan}%</p>
                  <div className="w-full bg-white/10 h-1.5 rounded-full mt-sm">
                    <div className="bg-secondary h-full rounded-full transition-all duration-500" style={{ width: `${avgPengetahuan}%` }}></div>
                  </div>
                </div>

                <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-tertiary">
                  <p className="font-label-xs text-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Keterampilan Umum</p>
                  <p className="font-headline-xl text-headline-xl font-bold text-on-surface">{avgKtmpUmum}%</p>
                  <div className="w-full bg-white/10 h-1.5 rounded-full mt-sm">
                    <div className="bg-tertiary h-full rounded-full transition-all duration-500" style={{ width: `${avgKtmpUmum}%` }}></div>
                  </div>
                </div>

                <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-surface-tint">
                  <p className="font-label-xs text-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Keterampilan Khusus</p>
                  <p className="font-headline-xl text-headline-xl font-bold text-on-surface">{avgKtmpKhusus}%</p>
                  <div className="w-full bg-white/10 h-1.5 rounded-full mt-sm">
                    <div className="bg-surface-tint h-full rounded-full transition-all duration-500" style={{ width: `${avgKtmpKhusus}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Radar SVG Chart */}
              <div className="mt-2xl h-[400px] w-full flex items-center justify-center relative overflow-hidden bg-white/5 rounded-3xl border border-slate-200 shadow-inner">
                <RadarChart
                  avgSikap={avgSikap}
                  avgPengetahuan={avgPengetahuan}
                  avgKtmpUmum={avgKtmpUmum}
                  avgKtmpKhusus={avgKtmpKhusus}
                />
              </div>
            </section>
            </div>
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'mahasiswa' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
              <div>
                <h2 className="font-display-3xl text-display-3xl text-on-surface">Data Mahasiswa</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola informasi data diri dan status akademik mahasiswa.</p>
              </div>
              <div className="flex flex-wrap items-center gap-md">
                {selectedStudentIds.length > 0 && (
                  <button 
                    className="flex items-center gap-sm bg-error-container text-on-error-container px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-error transition-all hover:bg-error-container/80 cursor-pointer"
                    onClick={() => openDeleteConfirm('student-bulk', '', `${selectedStudentIds.length} mahasiswa`, selectedStudentIds)}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                    Hapus Terpilih ({selectedStudentIds.length})
                  </button>
                )}
                <button 
                  className="flex items-center gap-sm bg-white/5 border border-white/10 text-on-surface hover:bg-white/10 px-lg py-md rounded-xl font-label-sm text-label-sm font-bold transition-all"
                  onClick={downloadStudentTemplate}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh Template
                </button>
                <button 
                  className="flex items-center gap-sm bg-secondary text-on-secondary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-secondary transition-all"
                  onClick={() => studentFileInputRef.current?.click()}
                >
                  <span className="material-symbols-outlined text-[20px]">upload</span>
                  Impor Excel
                </button>
                <input 
                  type="file" 
                  ref={studentFileInputRef} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportStudentExcel} 
                />
                <button 
                  className="inline-flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold btn-glow transition-all"
                  onClick={() => openAddModal('student')}
                >
                  <span className="material-symbols-outlined">add</span>
                  Tambah Mahasiswa
                </button>
              </div>
            </div>

            {!selectedStudentForCpl ? (
              <div className="space-y-lg flex-1">
                {/* Search & Filter Bar */}
                <div className="glass-panel p-md rounded-xl flex flex-wrap gap-md items-center shadow-md">
              <div className="relative flex-1 min-w-[280px] rounded-lg">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">
                  search
                </span>
                <input 
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-[48px] pr-md py-sm font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none" 
                  placeholder="Cari berdasarkan Nama atau NIM..." 
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </div>

              <div className="flex gap-md flex-wrap">
                <select 
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                  value={studentFilterAngkatan}
                  onChange={(e) => setStudentFilterAngkatan(e.target.value)}
                >
                  <option value="">Semua Angkatan</option>
                  {uniqueAngkatanList.map(angkatan => (
                    <option key={angkatan} value={angkatan}>{angkatan}</option>
                  ))}
                </select>

                <select 
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                  value={studentFilterKelas}
                  onChange={(e) => setStudentFilterKelas(e.target.value)}
                >
                  <option value="">Semua Kelas</option>
                  {uniqueKelasList.map(kelas => (
                    <option key={kelas} value={kelas}>{kelas}</option>
                  ))}
                </select>

                <button 
                  className="bg-surface-bright text-on-surface px-md py-sm rounded-lg font-label-sm text-label-sm flex items-center gap-xs hover:bg-surface-container-highest transition-colors cursor-pointer"
                  onClick={() => {
                    setStudentSearch('');
                    setStudentFilterAngkatan('');
                    setStudentFilterKelas('');
                  }}
                >
                  <span className="material-symbols-outlined">filter_list</span>
                  Reset Filter
                </button>
              </div>
            </div>

            {/* Data Table */}
            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                          <th className="px-lg py-md text-center" style={{ width: '40px' }}>
                            <input 
                              type="checkbox"
                              className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer w-4 h-4"
                              checked={currentItems.length > 0 && currentItems.every(student => selectedStudentIds.includes(student.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const visibleIds = currentItems.map(student => student.id);
                                  setSelectedStudentIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                                } else {
                                  const visibleIds = currentItems.map(student => student.id);
                                  setSelectedStudentIds(prev => prev.filter(id => !visibleIds.includes(id)));
                                }
                              }}
                            />
                          </th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">NIM</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Nama</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Angkatan</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kelas</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Status</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {currentItems.length > 0 ? (
                          currentItems.map((student, idx) => (
                            <tr 
                              key={student.id} 
                              className="hover-row transition-colors cursor-pointer"
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (target.tagName.toLowerCase() !== 'input' && target.tagName.toLowerCase() !== 'button' && target.closest('button') === null) {
                                  setSelectedStudentForCpl(student.id);
                                }
                              }}
                            >
                              <td className="px-lg py-md text-center">
                                <input 
                                  type="checkbox"
                                  className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer w-4 h-4"
                                  checked={selectedStudentIds.includes(student.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedStudentIds(prev => [...prev, student.id]);
                                    } else {
                                      setSelectedStudentIds(prev => prev.filter(id => id !== student.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="px-lg py-md font-body-sm">{indexOfFirstItem + idx + 1}</td>
                              <td className="px-lg py-md font-body-sm font-bold text-primary">{student.nim}</td>
                              <td className="px-lg py-md font-body-sm text-on-surface font-medium">{student.name}</td>
                              <td className="px-lg py-md font-body-sm text-on-surface-variant">{student.angkatan}</td>
                              <td className="px-lg py-md font-body-sm text-on-surface-variant">{student.kelas}</td>
                              <td className="px-lg py-md">
                                <span className={`inline-flex items-center px-sm py-xs rounded-lg font-label-xs text-label-xs font-semibold ${
                                  student.status === 'Aktif' ? 'bg-tertiary/20 text-tertiary' :
                                  student.status === 'Lulus' ? 'bg-primary/20 text-primary' :
                                  'bg-secondary/20 text-secondary'
                                }`}>
                                  {student.status}
                                </span>
                              </td>
                              <td className="px-lg py-md">
                                <div className="flex items-center justify-center gap-sm">
                                  <button 
                                    className="p-xs text-on-surface-variant hover:text-secondary transition-colors"
                                    onClick={(e) => { e.stopPropagation(); openEditModal('student', student); }}
                                  >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                  </button>
                                  <button 
                                    className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                    onClick={(e) => { e.stopPropagation(); openDeleteConfirm('student', student.id, student.name); }}
                                  >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-lg py-xl text-center text-on-surface-variant">Tidak ada data mahasiswa.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="p-lg flex items-center justify-between border-t border-outline-variant/30 bg-white/[0.02] flex-wrap gap-md">
                    <div className="flex items-center gap-md flex-wrap">
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Menampilkan {currentItems.length} dari {totalItems} Mahasiswa
                      </p>
                      <div className="flex items-center gap-xs">
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Tampilkan:</span>
                        <select 
                          value={studentItemsPerPage}
                          onChange={(e) => {
                            setStudentItemsPerPage(Number(e.target.value));
                            setStudentPage(1);
                          }}
                          className="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-xs font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-xs">
                      <button 
                        className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-50"
                        onClick={() => studentPage > 1 && setStudentPage(studentPage - 1)}
                        disabled={studentPage === 1}
                      >
                        <span className="material-symbols-outlined">chevron_left</span>
                      </button>
                      {Array.from({ length: totalPages }).map((_, pIdx) => (
                        <button 
                          key={pIdx}
                          className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-all ${
                            studentPage === pIdx + 1 ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-bright'
                          }`}
                          onClick={() => setStudentPage(pIdx + 1)}
                        >
                          {pIdx + 1}
                        </button>
                      ))}
                      <button 
                        className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-50"
                        onClick={() => studentPage < totalPages && setStudentPage(studentPage + 1)}
                        disabled={studentPage === totalPages}
                      >
                        <span className="material-symbols-outlined">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
              </div>
            ) : (
              <div className="animate-fade-in flex flex-col gap-lg flex-1">
                <button 
                  className="self-start flex items-center gap-xs text-on-surface-variant hover:text-primary font-label-sm font-bold transition-colors"
                  onClick={() => setSelectedStudentForCpl(null)}
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                  Kembali ke Daftar Mahasiswa
                </button>
                
                {selectedStudentAchievements.length > 0 ? (
                  <div className="grid grid-cols-12 gap-lg">
                    {/* Profile Card */}
                    <section className="col-span-12 lg:col-span-4 glass-panel rounded-xl p-lg flex flex-col gap-lg glow-primary shadow-lg">
                      <div className="flex items-center gap-lg">
                        <div className="w-16 h-16 rounded-xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-primary font-bold text-[28px]">
                          {students.find(s => s.id === selectedStudentForCpl)?.name[0].toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-headline-xl text-headline-xl text-on-surface font-bold">
                            {students.find(s => s.id === selectedStudentForCpl)?.name}
                          </h3>
                          <p className="text-primary font-bold">NIM: {students.find(s => s.id === selectedStudentForCpl)?.nim}</p>
                        </div>
                      </div>

                      <div className="space-y-md border-t border-slate-200 pt-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-label-sm text-label-sm">Program Studi</span>
                          <span className="text-on-surface font-label-sm text-label-sm font-semibold">{currentUser?.departmentName}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-label-sm text-label-sm">Tahun Masuk / Angkatan</span>
                          <span className="text-on-surface font-label-sm text-label-sm font-semibold">
                            {students.find(s => s.id === selectedStudentForCpl)?.angkatan}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-label-sm text-label-sm">Kelas</span>
                          <span className="text-on-surface font-label-sm text-label-sm font-semibold">
                            {students.find(s => s.id === selectedStudentForCpl)?.kelas}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant font-label-sm text-label-sm">Status Akademik</span>
                          <span className="text-on-surface font-label-sm text-label-sm font-semibold text-tertiary">
                            {students.find(s => s.id === selectedStudentForCpl)?.status}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Radar Chart */}
                    <div className="col-span-12 lg:col-span-8 glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
                      <div className="flex items-center justify-between mb-lg">
                        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Profil Kompetensi</h4>
                        <span className="material-symbols-outlined text-outline">radar</span>
                      </div>
                      <div className="h-[300px] flex items-center justify-center relative bg-white/[0.01] rounded-xl border border-slate-200 shadow-inner">
                        <svg className="w-[260px] h-[260px]" viewBox="0 0 300 300">
                          {/* Concentric Grid Circles */}
                          {[20, 40, 60, 80, 100].map((rValue) => (
                            <circle key={rValue} cx="150" cy="150" r={rValue} fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
                          ))}

                          {/* Axis lines and labels */}
                          {measuredStudentAchievements.map((cpl, i) => {
                            const angle = (i * 2 * Math.PI) / measuredStudentAchievements.length - Math.PI / 2;
                            const lineX = 150 + 100 * Math.cos(angle);
                            const lineY = 150 + 100 * Math.sin(angle);
                            
                            const labelX = 150 + 118 * Math.cos(angle);
                            const labelY = 150 + 118 * Math.sin(angle);
                            let textAnchor: 'start' | 'middle' | 'end' = 'middle';
                            if (Math.cos(angle) > 0.1) textAnchor = 'start';
                            else if (Math.cos(angle) < -0.1) textAnchor = 'end';

                            return (
                              <g key={cpl.id}>
                                <line x1="150" y1="150" x2={lineX} y2={lineY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                                <text x={labelX} y={labelY + 4} fill="#908fa0" fontSize="9" fontWeight="bold" textAnchor={textAnchor}>
                                  {cpl.code}
                                </text>
                              </g>
                            );
                          })}

                          {/* Student Radar Polygon */}
                          <polygon 
                            fill="rgba(192, 193, 255, 0.25)" 
                            points={measuredStudentAchievements.map((cpl, i) => {
                              const angle = (i * 2 * Math.PI) / measuredStudentAchievements.length - Math.PI / 2;
                              const r = (cpl.value / 100) * 100;
                              const x = 150 + r * Math.cos(angle);
                              const y = 150 + r * Math.sin(angle);
                              return `${x},${y}`;
                            }).join(' ')} 
                            stroke="#c0c1ff" 
                            strokeWidth="2.5"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Bar Chart */}
                    <div className="col-span-12 glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
                      <div className="flex items-center justify-between mb-lg">
                        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Nilai per CPL</h4>
                        <span className="material-symbols-outlined text-outline">bar_chart</span>
                      </div>
                      
                      <div className="h-[300px] w-full flex items-center justify-center relative bg-white/[0.01] rounded-xl border border-slate-200 shadow-inner px-lg">
                        <svg className="w-full h-[260px]" viewBox="0 0 800 300" preserveAspectRatio="none">
                          {/* Grid Lines */}
                          {[20, 80, 140, 200, 260].map((yVal, idx) => (
                            <g key={yVal}>
                              <line x1="40" y1={yVal} x2="780" y2={yVal} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                              <text x="10" y={yVal + 4} fill="#908fa0" fontSize="12" textAnchor="start">
                                {100 - idx * 25}
                              </text>
                            </g>
                          ))}

                          {/* Bars */}
                          {measuredStudentAchievements.map((cpl, i) => {
                            const barWidth = Math.max(16, 500 / measuredStudentAchievements.length);
                            const spacing = 720 / measuredStudentAchievements.length;
                            const barX = 50 + i * spacing + (spacing / 2) - (barWidth / 2);
                            const barHeight = (cpl.value / 100) * 240;
                            const barY = 260 - barHeight;
                            
                            let fillCol = '#4edea3'; // Tercapai (green)
                            if (cpl.value === 0) fillCol = '#464554'; // Belum Diukur (grey)
                            else if (cpl.value < cplFormTarget) fillCol = '#ffb4ab'; // Tidak Tercapai (red)

                            return (
                              <g key={cpl.id} className="group cursor-pointer">
                                <rect 
                                  x={barX} 
                                  y={barY} 
                                  width={barWidth} 
                                  height={barHeight} 
                                  fill={fillCol}
                                  rx="4"
                                  className="transition-all duration-300 hover:brightness-110"
                                />
                                <text x={barX + barWidth / 2} y="280" fill="#908fa0" fontSize="12" fontWeight="bold" textAnchor="middle">
                                  {cpl.code}
                                </text>
                                <title>{`${cpl.code}: ${cpl.value}%`}</title>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* Achievements Table */}
                    <section className="col-span-12 glass-panel rounded-xl overflow-hidden shadow-xl">
                      <div className="p-lg border-b border-slate-200 flex flex-wrap items-center justify-between bg-white/5 gap-md">
                        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Rincian Capaian per Dimensi</h4>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-highest/30">
                              <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider">CPL</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider">Deskripsi Kompetensi</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider text-center">Nilai</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider">Status</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider text-right">Detail MK</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {selectedStudentAchievements.length > 0 ? (
                              selectedStudentAchievements.map((cpl) => (
                                <tr key={cpl.id} className="hover:bg-white/5 transition-colors group">
                                  <td className="px-lg py-lg font-bold text-primary">{cpl.code}</td>
                                  <td className="px-lg py-lg text-body-sm text-on-surface-variant max-w-md">{cpl.description}</td>
                                  <td className="px-lg py-lg text-center font-bold text-headline-lg">{cpl.value === 0 ? '—' : cpl.value}</td>
                                  <td className="px-lg py-lg">
                                    <span className={`inline-flex items-center gap-1.5 px-sm py-1 rounded-md text-label-xs font-bold ${
                                      cpl.status === 'Tercapai' ? 'bg-tertiary/20 text-tertiary' :
                                      cpl.status === 'Tidak Tercapai' ? 'bg-error/20 text-error' :
                                      'bg-outline/20 text-outline'
                                    }`}>
                                      {cpl.status}
                                    </span>
                                  </td>
                                  <td className="px-lg py-lg text-right">
                                    <button 
                                      className="text-primary hover:text-white bg-primary/10 hover:bg-primary px-md py-1.5 rounded-lg text-label-sm font-medium transition-all"
                                      onClick={() => handleOpenCplDetailModal(cpl.code, selectedStudentForCpl || undefined)}
                                    >
                                      Lihat Detail
                                    </button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-lg py-xl text-center text-outline font-body-sm">
                                  Tidak ada rincian CPL.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="p-xl text-center text-on-surface-variant bg-white/5 rounded-2xl border border-slate-200 mt-lg flex-1 flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-[48px] text-outline mb-md">analytics</span>
                    <p className="font-headline-sm text-headline-sm font-bold mb-xs">CPL Belum Diukur</p>
                    <p className="text-body-sm text-outline">Mahasiswa ini belum memiliki data nilai untuk perhitungan CPL.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'matakuliah' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Data Mata Kuliah</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola daftar kurikulum mata kuliah di jurusan.</p>
              </div>
              <div className="flex flex-wrap items-center gap-md">
                {selectedCourseIds.length > 0 && (
                  <button 
                    className="flex items-center gap-sm bg-error-container text-on-error-container px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-error transition-all hover:bg-error-container/80 cursor-pointer"
                    onClick={() => openDeleteConfirm('course-bulk', '', `${selectedCourseIds.length} mata kuliah`, selectedCourseIds)}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                    Hapus Terpilih ({selectedCourseIds.length})
                  </button>
                )}

                <button 
                  className="flex items-center gap-sm bg-white/5 border border-white/10 text-on-surface hover:bg-white/10 px-lg py-md rounded-xl font-label-sm text-label-sm font-bold transition-all"
                  onClick={downloadMappingTemplate}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Template Mapping
                </button>
                <button 
                  className="flex items-center gap-sm bg-tertiary text-on-tertiary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-tertiary transition-all"
                  onClick={() => mappingFileInputRef.current?.click()}
                >
                  <span className="material-symbols-outlined text-[20px]">upload</span>
                  Impor Mapping
                </button>
                <input 
                  type="file" 
                  ref={mappingFileInputRef} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportMappingExcel} 
                />
                <button 
                  className="flex items-center gap-sm bg-white/5 border border-white/10 text-on-surface hover:bg-white/10 px-lg py-md rounded-xl font-label-sm text-label-sm font-bold transition-all"
                  onClick={downloadCourseTemplate}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh Template MK
                </button>
                <button 
                  className="flex items-center gap-sm bg-secondary text-on-secondary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-secondary transition-all"
                  onClick={() => courseFileInputRef.current?.click()}
                >
                  <span className="material-symbols-outlined text-[20px]">upload</span>
                  Impor MK Excel
                </button>
                <input 
                  type="file" 
                  ref={courseFileInputRef} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportCourseExcel} 
                />
                <button 
                  className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                  onClick={() => openAddModal('course')}
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  Tambah Mata Kuliah
                </button>
              </div>
            </div>

            <div className="glass-panel p-md rounded-xl flex flex-wrap gap-md items-center shadow-md">
              <div className="relative flex-1 min-w-[280px] rounded-lg">
                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">
                  search
                </span>
                <input 
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-[48px] pr-md py-sm font-body-sm text-body-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none" 
                  placeholder="Cari berdasarkan Nama atau Kode MK..." 
                  type="text"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                        <th className="px-lg py-md text-center" style={{ width: '40px' }}>
                          <input 
                            type="checkbox"
                            className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer w-4 h-4"
                            checked={filteredCourses.length > 0 && filteredCourses.every(course => selectedCourseIds.includes(course.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCourseIds(filteredCourses.map(c => c.id));
                              } else {
                                setSelectedCourseIds([]);
                              }
                            }}
                          />
                        </th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider cursor-pointer hover:text-on-surface select-none group" onClick={() => handleCourseSort('code')}>
                          <div className="flex items-center gap-xs">Kode MK <span className={`material-symbols-outlined text-[16px] transition-opacity ${courseSortConfig?.key === 'code' ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-50'}`}>{courseSortConfig?.key === 'code' && courseSortConfig.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span></div>
                        </th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider cursor-pointer hover:text-on-surface select-none group" onClick={() => handleCourseSort('name')}>
                          <div className="flex items-center gap-xs">Nama Mata Kuliah <span className={`material-symbols-outlined text-[16px] transition-opacity ${courseSortConfig?.key === 'name' ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-50'}`}>{courseSortConfig?.key === 'name' && courseSortConfig.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span></div>
                        </th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center cursor-pointer hover:text-on-surface select-none group" onClick={() => handleCourseSort('sks')}>
                          <div className="flex items-center justify-center gap-xs">SKS <span className={`material-symbols-outlined text-[16px] transition-opacity ${courseSortConfig?.key === 'sks' ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-50'}`}>{courseSortConfig?.key === 'sks' && courseSortConfig.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span></div>
                        </th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">CPL Terpetakan</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {filteredCourses.length > 0 ? (
                        filteredCourses.map((course, index) => (
                          <React.Fragment key={course.id}>
                          <tr className={`hover-row transition-colors cursor-pointer ${expandedCourseId === course.id ? 'bg-primary/5' : ''}`} onClick={() => toggleCoursePanel(course.id)}>
                            <td className="px-lg py-md text-center" onClick={e => e.stopPropagation()}>
                              <input 
                                type="checkbox"
                                className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer w-4 h-4"
                                checked={selectedCourseIds.includes(course.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCourseIds(prev => [...prev, course.id]);
                                  } else {
                                    setSelectedCourseIds(prev => prev.filter(id => id !== course.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="px-lg py-md font-body-sm">{index + 1}</td>
                            <td className="px-lg py-md font-body-sm font-bold text-primary">{course.code}</td>
                            <td className="px-lg py-md font-body-sm font-medium text-on-surface">{course.name}</td>
                            <td className="px-lg py-md font-body-sm text-center font-semibold text-on-surface-variant">{course.sks}</td>
                            <td className="px-lg py-md">
                              <div className="flex flex-wrap gap-xs items-center">
                                {mappings.filter(m => m.courseId === course.id).length > 0 ? (
                                  mappings.filter(m => m.courseId === course.id).slice(0, 5).map(m => (
                                    <span key={m.id} className="inline-block px-[6px] py-[2px] rounded bg-white/5 border border-white/10 text-[10px] font-bold text-on-surface-variant">
                                      {m.cplCode}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-on-surface-variant/50 italic">-</span>
                                )}
                                {mappings.filter(m => m.courseId === course.id).length > 5 && (
                                  <span className="inline-block px-[6px] py-[2px] rounded bg-white/5 border border-white/10 text-[10px] font-bold text-on-surface-variant">
                                    +{mappings.filter(m => m.courseId === course.id).length - 5}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-lg py-md" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-sm">
                                <button 
                                  className="p-xs text-on-surface-variant hover:text-secondary transition-colors"
                                  onClick={() => openEditModal('course', course)}
                                >
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button 
                                  className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                  onClick={() => openDeleteConfirm('course', course.id, course.name)}
                                >
                                  <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedCourseId === course.id && (
                            <tr className="bg-surface-dim/30 slide-panel">
                              <td colSpan={7} className="p-0 border-b border-outline-variant/10">
                                <div className="p-xl slide-panel-overlay">
                                  <div className="flex justify-between items-center mb-md">
                                    <h4 className="font-label-lg font-bold text-on-surface">Detail CPL Terpetakan: {course.name}</h4>
                                  </div>
                                  
                                  {courseMappingLoading ? (
                                    <div className="py-lg text-center text-on-surface-variant font-body-sm">Memuat data mapping...</div>
                                  ) : (
                                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden mb-lg">
                                      <table className="w-full text-left border-collapse">
                                        <thead>
                                          <tr className="bg-white/[0.02] border-b border-outline-variant/20">
                                            <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase">Kode CPL</th>
                                            <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase">Deskripsi</th>
                                            <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase text-center">Bobot</th>
                                            <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase text-center">Aksi</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline-variant/50">
                                          {courseMappings.length > 0 ? (
                                            courseMappings.map(cm => (
                                              <tr key={cm.id}>
                                                <td className="px-lg py-sm font-body-sm font-bold text-secondary">{cm.cplCode}</td>
                                                <td className="px-lg py-sm font-body-sm text-on-surface-variant truncate max-w-xs" title={cm.cplDescription}>{cm.cplDescription}</td>
                                                <td className="px-lg py-sm font-body-sm text-center font-bold text-tertiary">{cm.weight}</td>
                                                <td className="px-lg py-sm text-center">
                                                  <button 
                                                    className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                                    onClick={() => handleDeleteInlineMapping(cm.id)}
                                                    title="Hapus Pemetaan"
                                                  >
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                  </button>
                                                </td>
                                              </tr>
                                            ))
                                          ) : (
                                            <tr>
                                              <td colSpan={4} className="px-lg py-md text-center text-on-surface-variant font-body-sm italic">Belum ada CPL yang terpetakan untuk mata kuliah ini.</td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}

                                  <div className="flex flex-col md:flex-row gap-sm items-end bg-primary/5 p-lg rounded-xl border border-primary/20">
                                    <div className="flex-1 w-full">
                                      <label className="font-label-xs text-on-surface-variant mb-xs block">Tambah CPL Baru</label>
                                      <select 
                                        className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-on-surface font-body-sm focus:outline-none focus:border-primary transition-all"
                                        value={inlineMapCplId}
                                        onChange={e => setInlineMapCplId(e.target.value)}
                                      >
                                        <option value="">-- Pilih CPL --</option>
                                        {cpls
                                          .filter(c => !courseMappings.some(cm => cm.cplId === c.id))
                                          .map(c => (
                                            <option key={c.id} value={c.id}>{c.code} - {c.description.substring(0, 60)}...</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="w-full md:w-32">
                                      <label className="font-label-xs text-on-surface-variant mb-xs block">Bobot</label>
                                      <input 
                                        className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-on-surface font-body-sm focus:outline-none focus:border-primary transition-all"
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={inlineMapWeight}
                                        onChange={e => setInlineMapWeight(Number(e.target.value))}
                                      />
                                    </div>
                                    <button 
                                      className="flex items-center gap-xs bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold glow-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                      onClick={handleAddInlineMapping}
                                      disabled={!inlineMapCplId || inlineMapWeight <= 0}
                                    >
                                      <span className="material-symbols-outlined text-[18px]">add</span>
                                      Simpan
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data mata kuliah.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'cpl' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Data Capaian Pembelajaran Lulusan (CPL)</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola standar CPL dan nilai target kelulusan.</p>
              </div>
              <div className="flex items-center gap-md">
                <button 
                  className="flex items-center gap-sm bg-white/5 border border-white/10 text-on-surface hover:bg-white/10 px-lg py-md rounded-xl font-label-sm text-label-sm font-bold transition-all"
                  onClick={downloadCplTemplate}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh Template
                </button>
                <button 
                  className="flex items-center gap-sm bg-secondary text-on-secondary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-secondary transition-all"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="material-symbols-outlined text-[20px]">upload</span>
                  Impor Excel
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportExcel} 
                />
                <button 
                  className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                  onClick={() => openAddModal('cpl')}
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  Tambah CPL
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kode CPL</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kategori</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Deskripsi</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Target Nilai</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {cpls.length > 0 ? (
                        cpls.map((cpl, index) => (
                          <tr key={cpl.id} className="hover-row transition-colors">
                            <td className="px-lg py-md font-body-sm">{index + 1}</td>
                            <td className="px-lg py-md font-body-sm font-bold text-primary">{cpl.code}</td>
                            <td className="px-lg py-md">
                              <span className="inline-block px-sm py-[2px] rounded text-label-xs font-bold bg-white/5 border border-white/10 text-on-surface-variant">
                                {cpl.category}
                              </span>
                            </td>
                            <td className="px-lg py-md font-body-sm text-on-surface-variant max-w-sm">{cpl.description}</td>
                            <td className="px-lg py-md font-body-sm text-center font-bold text-tertiary">{cpl.targetValue}</td>
                            <td className="px-lg py-md">
                              <div className="flex items-center justify-center gap-sm">
                                <button 
                                  className="p-xs text-on-surface-variant hover:text-secondary transition-colors"
                                  onClick={() => openEditModal('cpl', cpl)}
                                >
                                  <span className="material-symbols-outlined text-[20px]">edit</span>
                                </button>
                                <button 
                                  className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                  onClick={() => openDeleteConfirm('cpl', cpl.id, cpl.code)}
                                >
                                  <span className="material-symbols-outlined text-[20px]">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data CPL.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'mapping' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Pemetaan Bobot Mata Kuliah ke CPL</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Petakan bobot pengaruh mata kuliah terhadap pencapaian CPL.</p>
              </div>
              <button 
                className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                onClick={() => openAddModal('mapping')}
              >
                <span className="material-symbols-outlined">add_link</span>
                Petakan Bobot
              </button>
            </div>

            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Mata Kuliah</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">CPL</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kategori CPL</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Bobot</th>
                      <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {mappings.length > 0 ? (
                      mappings.map((map, index) => (
                        <tr key={map.id} className="hover-row transition-colors">
                          <td className="px-lg py-md font-body-sm">{index + 1}</td>
                          <td className="px-lg py-md font-body-sm font-medium text-on-surface">
                            {map.courseName} <span className="text-primary font-bold text-[12px]">[{map.courseCode}]</span>
                          </td>
                          <td className="px-lg py-md font-body-sm font-bold text-secondary">{map.cplCode}</td>
                          <td className="px-lg py-md font-body-sm text-on-surface-variant">{map.cplCategory}</td>
                          <td className="px-lg py-md font-body-sm text-center font-bold text-tertiary">{map.weight}</td>
                          <td className="px-lg py-md">
                            <div className="flex items-center justify-center gap-sm">
                              <button 
                                className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                onClick={() => openDeleteConfirm('mapping', map.id, `${map.courseCode} -> ${map.cplCode}`)}
                              >
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-lg py-xl text-center text-on-surface-variant">Belum ada pemetaan bobot.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'nilai' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-md">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Input Nilai Mahasiswa</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola lembar nilai mata kuliah mahasiswa untuk perhitungan CPL.</p>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-md">
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportGradeExcel} 
                  ref={gradeFileInputRef} 
                />
                <button 
                  className="flex items-center gap-sm bg-surface text-on-surface border border-outline-variant px-lg py-md rounded-xl font-label-sm text-label-sm font-bold hover:bg-surface-variant transition-colors"
                  onClick={downloadGradeTemplate}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Unduh Data Nilai
                </button>
                <button 
                  className="flex items-center gap-sm bg-surface text-on-surface border border-outline-variant px-lg py-md rounded-xl font-label-sm text-label-sm font-bold hover:bg-surface-variant transition-colors"
                  onClick={() => gradeFileInputRef.current?.click()}
                >
                  <span className="material-symbols-outlined text-[20px]">upload</span>
                  Impor Nilai
                </button>
                {selectedStudentId && (
                  <button 
                    className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                    onClick={() => openAddModal('grade')}
                  >
                    <span className="material-symbols-outlined">edit_square</span>
                    Input Nilai Baru
                  </button>
                )}
              </div>
            </div>

            {selectedStudentId ? (
              <div className="space-y-lg">
                <button 
                  className="flex items-center gap-sm text-primary hover:underline font-label-md font-bold transition-all"
                  onClick={() => handleSelectStudentForGrades('')}
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                  Kembali ke Daftar Mahasiswa
                </button>

                <div className="glass-panel p-xl rounded-2xl flex flex-wrap gap-xl items-center shadow-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                  <div className="flex-1 relative z-10">
                    <h4 className="font-display-2xl text-display-2xl font-bold text-on-surface mb-2">
                      {students.find(s => s.id === selectedStudentId)?.name}
                    </h4>
                    <div className="flex flex-wrap gap-md font-body-md text-on-surface-variant">
                      <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[18px]">badge</span> {students.find(s => s.id === selectedStudentId)?.nim}</span>
                      <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[18px]">calendar_today</span> Angkatan {students.find(s => s.id === selectedStudentId)?.angkatan}</span>
                      <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[18px]">class</span> Kelas {students.find(s => s.id === selectedStudentId)?.kelas}</span>
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
                  <div className="bg-surface-variant/30 p-md border-b border-outline-variant/30 flex justify-between items-center">
                    <div>
                      <div className="font-label-lg font-bold text-on-surface">Kumpulan Nilai / Enrolled Courses</div>
                      <div className="font-body-sm text-on-surface-variant">Daftar mata kuliah yang telah dinilai untuk mahasiswa ini.</div>
                    </div>
                    <button 
                      className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                      onClick={() => openAddModal('grade')}
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      Input Nilai
                    </button>
                  </div>
                  {dataLoading ? (
                    <div className="p-xl text-center text-on-surface-variant">Memuat lembar nilai...</div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">No</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kode MK</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Nama Mata Kuliah</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">SKS</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Semester</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">T.A</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Nilai Angka</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {grades.length > 0 ? (
                          grades.map((grade, index) => (
                            <tr key={grade.id} className="hover-row transition-colors">
                              <td className="px-lg py-md font-body-sm">{index + 1}</td>
                              <td className="px-lg py-md font-body-sm font-bold text-primary">{grade.courseCode}</td>
                              <td className="px-lg py-md font-body-sm font-medium text-on-surface">{grade.courseName}</td>
                              <td className="px-lg py-md font-body-sm text-center font-medium">{grade.sks}</td>
                              <td className="px-lg py-md font-body-sm text-center">{grade.semester}</td>
                              <td className="px-lg py-md font-body-sm text-center">{grade.academicYear}</td>
                              <td className="px-lg py-md text-center">
                                <span className="inline-block px-sm py-[2px] rounded font-bold text-label-xs bg-primary/15 text-primary">
                                  {grade.score !== null && grade.score !== undefined ? grade.score : '-'}
                                </span>
                              </td>
                              <td className="px-lg py-md">
                                <div className="flex items-center justify-center gap-sm">
                                  <button 
                                    className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                    onClick={() => openDeleteConfirm('grade', grade.id, `${grade.courseName}`)}
                                  >
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data nilai. Silakan tambahkan.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-lg">
                <div className="glass-panel p-lg rounded-2xl flex flex-wrap gap-md items-center justify-between shadow-sm">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Cari Mahasiswa</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                      <input 
                        type="text" 
                        placeholder="Nama atau NIM..." 
                        className="w-full bg-surface-container border border-outline-variant rounded-lg pl-xl pr-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                        value={gradeStudentSearch}
                        onChange={(e) => setGradeStudentSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-[200px]">
                    <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Filter Angkatan</label>
                    <select 
                      className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                      value={gradeStudentAngkatan}
                      onChange={(e) => setGradeStudentAngkatan(e.target.value)}
                    >
                      <option value="">Semua Angkatan</option>
                      {Array.from(new Set(students.map(s => s.angkatan))).sort().map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full md:w-[150px]">
                    <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Filter Kelas</label>
                    <select 
                      className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                      value={gradeStudentKelas}
                      onChange={(e) => setGradeStudentKelas(e.target.value)}
                    >
                      <option value="">Semua Kelas</option>
                      {Array.from(new Set(students.map(s => s.kelas))).sort().map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
                  {(() => {
                    const filtered = students.filter(s => {
                      const matchSearch = gradeStudentSearch === '' || s.name.toLowerCase().includes(gradeStudentSearch.toLowerCase()) || s.nim.includes(gradeStudentSearch);
                      const matchAngkatan = gradeStudentAngkatan === '' || s.angkatan === gradeStudentAngkatan;
                      const matchKelas = gradeStudentKelas === '' || s.kelas === gradeStudentKelas;
                      return matchSearch && matchAngkatan && matchKelas;
                    });

                    if (filtered.length === 0) {
                      return <div className="text-on-surface-variant p-xl text-center">Tidak ada mahasiswa yang cocok.</div>;
                    }

                    return (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                            <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider w-16">No</th>
                            <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">NIM</th>
                            <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Nama Lengkap</th>
                            <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Angkatan</th>
                            <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Kelas</th>
                            <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/50">
                          {filtered.map((s, index) => (
                            <tr 
                              key={s.id} 
                              className="hover-row transition-colors cursor-pointer group"
                              onClick={() => handleSelectStudentForGrades(s.id)}
                            >
                              <td className="px-lg py-md font-body-sm text-on-surface-variant">{index + 1}</td>
                              <td className="px-lg py-md font-body-sm font-bold text-on-surface">{s.nim}</td>
                              <td className="px-lg py-md font-body-sm font-medium text-primary">{s.name}</td>
                              <td className="px-lg py-md font-body-sm text-on-surface-variant">{s.angkatan}</td>
                              <td className="px-lg py-md font-body-sm text-on-surface-variant">{s.kelas}</td>
                              <td className="px-lg py-md text-right">
                                <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'hasil_cpl' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Matriks Capaian CPL Kelas</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Laporan rata-rata capaian CPL per Angkatan dan Kelas.</p>
              </div>

              <div className="flex gap-md flex-wrap items-center justify-end">
                <button 
                  className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-label-sm glow-primary hover:scale-105 transition-transform duration-200"
                  onClick={() => handlePrintReport('laporan-hasil-cpl-print-template', 'Laporan_Capaian_CPL_' + (cplMatrixAngkatan || 'Semua'), true)}
                >
                  <span className="material-symbols-outlined">download</span>
                  Cetak Laporan
                </button>
                <div className="glass-panel px-xl py-md rounded-2xl flex items-center gap-lg border border-primary/20 bg-surface/40 shadow-sm min-w-[240px]">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                    <span className="material-symbols-outlined text-[28px]">school</span>
                  </div>
                  <div>
                    <div className="font-label-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Rata-rata IPK</div>
                    <div className="font-display-md font-bold text-primary">
                      {cplMatrixAverageIpk !== null ? cplMatrixAverageIpk.toFixed(2) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Box */}
            <div className="glass-panel p-lg rounded-2xl flex flex-wrap gap-md items-center shadow-sm">
              <div className="flex-1 min-w-[200px]">
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Filter Angkatan</label>
                <select 
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={cplMatrixAngkatan}
                  onChange={(e) => setCplMatrixAngkatan(e.target.value)}
                >
                  <option value="">Semua Angkatan</option>
                  {uniqueAngkatanList.map(angkatan => (
                    <option key={angkatan} value={angkatan}>{angkatan}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Filter Kelas</label>
                <select 
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={cplMatrixKelas}
                  onChange={(e) => setCplMatrixKelas(e.target.value)}
                >
                  <option value="">Semua Kelas</option>
                  {uniqueKelasList.map(kelas => (
                    <option key={kelas} value={kelas}>{kelas}</option>
                  ))}
                </select>
              </div>
            </div>

            <div id="laporan-hasil-cpl-content" className="space-y-lg p-md sm:p-0 rounded-2xl">
              {/* Header Khusus Print (tersembunyi secara visual kecuali untuk pdf/print) */}
              <div className="hidden print:block bg-surface-container rounded-xl p-lg border border-outline-variant/30 mb-lg">
                <div className="flex justify-between items-center border-b border-outline-variant/20 pb-md mb-md">
                  <div>
                    <h2 className="font-display-2xl text-display-2xl font-bold text-on-surface">Laporan Ketercapaian CPL</h2>
                    <p className="font-body-sm text-on-surface-variant mt-1">Politeknik Negeri Bali - Jurusan Akuntansi</p>
                  </div>
                  <div className="text-right">
                    <p className="font-label-sm text-outline uppercase tracking-wider mb-1">Rata-Rata IPK</p>
                    <p className="font-display-3xl text-primary font-bold">{cplMatrixAverageIpk !== null ? cplMatrixAverageIpk.toFixed(2) : '-'}</p>
                  </div>
                </div>
                <div className="flex gap-xl">
                  <div>
                    <p className="font-label-xs text-outline uppercase mb-1">Angkatan</p>
                    <p className="font-headline-lg text-on-surface font-semibold">{cplMatrixAngkatan || 'Semua Angkatan'}</p>
                  </div>
                  <div>
                    <p className="font-label-xs text-outline uppercase mb-1">Kelas</p>
                    <p className="font-headline-lg text-on-surface font-semibold">{cplMatrixKelas || 'Semua Kelas'}</p>
                  </div>
                </div>
              </div>

              {cplAverages.length > 0 ? (
              <div className="grid grid-cols-12 gap-lg animate-fade-in">
                {/* Charts */}
                <div className="col-span-12 flex flex-col gap-lg">
                  {/* Bar Chart (Top) */}
                  <BarChart measuredCpls={measuredCpls} cplFormTarget={cplFormTarget} />

                  {/* Radar Chart (Bottom) */}
                  <div className="glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
                    <div className="flex items-center justify-between mb-lg">
                      <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Profil Kompetensi Kelas</h4>
                      <span className="material-symbols-outlined text-outline">radar</span>
                    </div>
                    <div className="h-[400px] flex items-center justify-center relative bg-white/[0.01] rounded-xl border border-slate-200 shadow-inner overflow-hidden">
                      <RadarChart
                        avgSikap={avgSikap}
                        avgPengetahuan={avgPengetahuan}
                        avgKtmpUmum={avgKtmpUmum}
                        avgKtmpKhusus={avgKtmpKhusus}
                      />
                    </div>
                  </div>
                </div>

                {/* Achievements Table */}
                <section className="col-span-12 glass-panel rounded-xl overflow-hidden shadow-xl">
                  <div className="p-lg border-b border-slate-200 flex flex-wrap items-center justify-between bg-white/5 gap-md">
                    <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Rincian Rata-rata Capaian</h4>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-highest/30">
                          <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider">CPL</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider">Deskripsi Kompetensi</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider text-center">Rata-rata Nilai</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-outline uppercase tracking-wider text-center">Status Keseluruhan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {cplAverages.length > 0 ? (
                          cplAverages.map((cpl) => {
                            const status = cpl.value === 0 ? 'Belum Diukur' : (cpl.value >= cplFormTarget ? 'Tercapai' : 'Tidak Tercapai');
                            return (
                              <tr key={cpl.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-lg py-lg font-bold text-primary">{cpl.code}</td>
                                <td className="px-lg py-lg text-body-sm text-on-surface-variant max-w-md">{cpl.description}</td>
                                <td className="px-lg py-lg text-center font-bold text-headline-lg">{cpl.value === 0 ? '—' : cpl.value}</td>
                                <td className="px-lg py-lg text-center">
                                  <span className={`inline-flex items-center gap-1.5 px-sm py-1 rounded-md text-label-xs font-bold ${
                                    status === 'Tercapai' ? 'bg-tertiary/20 text-tertiary' :
                                    status === 'Tidak Tercapai' ? 'bg-error/20 text-error' :
                                    'bg-outline/20 text-outline'
                                  }`}>
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-lg py-xl text-center text-outline font-body-sm">
                              Tidak ada rincian CPL.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Kesimpulan Ketercapaian */}
                <section className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-md">
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-tertiary">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">CPL Tercapai</p>
                    <p className="font-display-3xl font-bold text-tertiary">{cplAverages.filter(c => c.value >= cplFormTarget).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Memenuhi target ≥ {cplFormTarget}%</p>
                  </div>
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-error">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Belum Tercapai</p>
                    <p className="font-display-3xl font-bold text-error">{cplAverages.filter(c => c.value > 0 && c.value < cplFormTarget).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Dibawah target {cplFormTarget}%</p>
                  </div>
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-outline-variant">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Belum Terukur</p>
                    <p className="font-display-3xl font-bold text-outline">{cplAverages.filter(c => c.value === 0).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Nilai masih 0%</p>
                  </div>
                </section>
              </div>
            ) : (
              <div className="p-xl text-center text-on-surface-variant bg-white/5 rounded-2xl border border-slate-200">
                Belum ada data CPL terukur.
              </div>
            )}
            </div>

            {/* Template Cetak Laporan CPL (Off-screen / Print-ready) */}
            <CplPrintTemplate
              cplMatrixAngkatan={cplMatrixAngkatan}
              cplMatrixKelas={cplMatrixKelas}
              cplFormTarget={cplFormTarget}
              cplAverages={cplAverages}
              cplMatrixAverageIpk={cplMatrixAverageIpk}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="mt-auto px-gutter py-lg border-t border-slate-200 flex justify-between items-center opacity-60 bg-surface/20">
          <p className="font-label-xs text-label-xs text-on-surface-variant">© 2024 Politeknik Negeri Bali. All rights reserved.</p>
          <div className="flex gap-lg">
            <a className="font-label-xs text-label-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Pusat Bantuan</a>
            <a className="font-label-xs text-label-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Kebijakan Privasi</a>
          </div>
        </footer>
          </div>
        </main>
      </div>

      {/* ================= CRUD MODALS ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="glass-panel w-full max-w-[480px] rounded-2xl shadow-2xl overflow-hidden flex flex-col scale-100 transition-all">
            <div className="px-xl py-lg border-b border-outline-variant/30 flex justify-between items-center bg-white/[0.02]">
              <h3 className="font-headline-xl text-headline-xl text-white font-bold">
                {modalAction === 'add' ? 'Tambah Data Baru' : 'Perbarui Data'}
              </h3>
              <button className="text-on-surface-variant hover:text-white transition-colors p-xs" onClick={() => setIsModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveData} className="p-xl flex flex-col gap-lg overflow-y-auto max-h-[500px] custom-scrollbar">
              {modalError && (
                <div className="bg-error-container/30 border border-error/50 rounded-lg p-md text-error text-body-sm text-center">
                  {modalError}
                </div>
              )}

              {/* Department Form Fields */}
              {modalType === 'department' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nama Jurusan</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="e.g. Manajemen Informatika"
                      type="text"
                      value={deptFormName}
                      onChange={(e) => setDeptFormName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Kode Jurusan</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="e.g. MI"
                      type="text"
                      value={deptFormCode}
                      onChange={(e) => setDeptFormCode(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Admin User Form Fields */}
              {modalType === 'admin' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nama Lengkap</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="Nama Admin"
                      type="text"
                      value={adminFormName}
                      onChange={(e) => setAdminFormName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Email</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="email@pnb.ac.id"
                      type="email"
                      value={adminFormEmail}
                      onChange={(e) => setAdminFormEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">
                      Password {modalAction === 'edit' && '(Kosongkan jika tidak ingin diubah)'}
                    </label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="••••••••"
                      type="password"
                      value={adminFormPassword}
                      onChange={(e) => setAdminFormPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Pilih Jurusan</label>
                    <select 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all cursor-pointer"
                      value={adminFormDeptId}
                      onChange={(e) => setAdminFormDeptId(e.target.value)}
                    >
                      <option value="">-- Pilih Jurusan --</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Student Form Fields */}
              {modalType === 'student' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">NIM</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="Masukkan NIM Mahasiswa"
                      type="text"
                      value={studentFormNim}
                      onChange={(e) => setStudentFormNim(e.target.value)}
                      disabled={modalAction === 'edit'}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nama Lengkap</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="Nama Lengkap"
                      type="text"
                      value={studentFormName}
                      onChange={(e) => setStudentFormName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-md">
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Angkatan</label>
                      <select 
                        className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        value={studentFormAngkatan}
                        onChange={(e) => setStudentFormAngkatan(e.target.value)}
                      >
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                        <option value="2023">2023</option>
                        <option value="2022">2022</option>
                        <option value="2021">2021</option>
                        <option value="2020">2020</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Kelas</label>
                      <input 
                        type="text"
                        className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        placeholder="Contoh: A, B, C, atau 2A"
                        value={studentFormKelas}
                        onChange={(e) => setStudentFormKelas(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Status Akademik</label>
                    <div className="flex gap-md">
                      {(['Aktif', 'Cuti', 'Lulus'] as const).map(opt => (
                        <label 
                          key={opt}
                          className={`flex-1 flex items-center justify-center py-md rounded-lg border border-outline-variant bg-surface-dim/30 cursor-pointer hover:border-primary transition-colors ${
                            studentFormStatus === opt ? 'border-primary bg-primary/10 text-primary font-semibold' : ''
                          }`}
                        >
                          <input 
                            type="radio" 
                            className="sr-only" 
                            name="studentStatus" 
                            checked={studentFormStatus === opt} 
                            onChange={() => setStudentFormStatus(opt)}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Course Form Fields */}
              {modalType === 'course' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Kode Mata Kuliah</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="e.g. MKK201"
                      type="text"
                      value={courseFormCode}
                      onChange={(e) => setCourseFormCode(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nama Mata Kuliah</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="e.g. Algoritma & Pemrograman"
                      type="text"
                      value={courseFormName}
                      onChange={(e) => setCourseFormName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">SKS</label>
                    <select 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      value={courseFormSks}
                      onChange={(e) => setCourseFormSks(Number(e.target.value))}
                    >
                      <option value="1">1 SKS</option>
                      <option value="2">2 SKS</option>
                      <option value="3">3 SKS</option>
                      <option value="4">4 SKS</option>
                      <option value="5">5 SKS</option>
                      <option value="6">6 SKS</option>
                    </select>
                  </div>
                </>
              )}

              {/* CPL Form Fields */}
              {modalType === 'cpl' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Kode CPL</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      placeholder="e.g. CPL-01"
                      type="text"
                      value={cplFormCode}
                      onChange={(e) => setCplFormCode(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Kategori CPL</label>
                    <select 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      value={cplFormCat}
                      onChange={(e: any) => setCplFormCat(e.target.value)}
                    >
                      <option value="Sikap">Sikap</option>
                      <option value="Pengetahuan">Pengetahuan</option>
                      <option value="Keterampilan Umum">Keterampilan Umum</option>
                      <option value="Keterampilan Khusus">Keterampilan Khusus</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Deskripsi CPL</label>
                    <textarea 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all min-h-[80px]"
                      placeholder="Deskripsi Capaian Kompetensi..."
                      value={cplFormDesc}
                      onChange={(e) => setCplFormDesc(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Target Nilai Kelulusan</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      type="number"
                      value={cplFormTarget}
                      onChange={(e) => setCplFormTarget(Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              {/* Mapping Link Form Fields Removed */}


              {/* Grade Form Fields */}
              {modalType === 'grade' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Mata Kuliah</label>
                    <select 
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      value={gradeFormCourseId}
                      onChange={(e) => setGradeFormCourseId(e.target.value)}
                    >
                      <option value="">-- Pilih Mata Kuliah --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-md">
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nilai Huruf</label>
                      <select 
                        className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        value={gradeFormLetter}
                        onChange={(e) => setGradeFormLetter(e.target.value)}
                      >
                        <option value="A">A</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B">B</option>
                        <option value="B-">B-</option>
                        <option value="C+">C+</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E/F">E/F</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Semester</label>
                      <input 
                        className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        placeholder="e.g. IV"
                        type="text"
                        value={gradeFormSemester}
                        onChange={(e) => setGradeFormSemester(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Tahun Akademik</label>
                      <input 
                        className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        placeholder="e.g. 2024/2025"
                        type="text"
                        value={gradeFormYear}
                        onChange={(e) => setGradeFormYear(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-md mt-lg border-t border-outline-variant/30 pt-lg">
                <button 
                  type="button" 
                  className="bg-surface-bright text-on-surface px-lg py-md rounded-xl font-label-sm text-label-sm hover:bg-surface-container-highest transition-colors cursor-pointer"
                  onClick={() => setIsModalOpen(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  className="bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold btn-glow transition-all cursor-pointer"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-[400px] rounded-2xl shadow-2xl p-xl flex flex-col gap-lg text-center">
            <span className="material-symbols-outlined text-[48px] text-error mx-auto bg-error/10 p-md rounded-full w-fit">
              warning
            </span>
            <div>
              <h3 className="font-headline-xl text-headline-xl text-white font-bold mb-xs">
                {deleteTarget?.type === 'student-bulk' ? 'Hapus Massal Mahasiswa?' : deleteTarget?.type === 'course-bulk' ? 'Hapus Massal Mata Kuliah?' : `Hapus Data ${deleteTarget?.type.toUpperCase()}?`}
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Tindakan ini tidak dapat dibatalkan. Data <strong>{deleteTarget?.name}</strong> akan dihapus secara permanen dari sistem.
              </p>
            </div>

            <div className="flex gap-md border-t border-outline-variant/30 pt-lg">
              <button 
                className="flex-1 bg-surface-bright text-on-surface px-md py-sm rounded-xl font-label-sm text-label-sm hover:bg-surface-container-highest transition-colors cursor-pointer"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Batal
              </button>
              <button 
                className="flex-1 bg-error text-white px-md py-sm rounded-xl font-label-sm text-label-sm font-bold hover:bg-error/85 transition-all cursor-pointer"
                onClick={handleDeleteConfirm}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT CPL COURSE DETAIL MAPPING MODAL */}
      {selectedCplForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-[800px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-xl py-lg border-b border-outline-variant/30 flex justify-between items-center bg-white/[0.02] shrink-0">
              <div>
                <h3 className="font-headline-xl text-headline-xl text-white font-bold">
                  Detail Pemetaan Mata Kuliah
                </h3>
                <p className="font-label-xs text-label-xs text-primary font-bold">{selectedCplForDetail}</p>
              </div>
              <button className="text-on-surface-variant hover:text-white transition-colors p-xs" onClick={() => setSelectedCplForDetail(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-xl flex flex-col gap-md overflow-y-auto">
              <div className="bg-white/5 p-md rounded-lg border border-slate-200 mb-sm shrink-0">
                <p className="font-label-xs text-label-xs text-outline uppercase font-semibold mb-xs">Deskripsi CPL</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  {selectedStudentAchievements.find(c => c.code === selectedCplForDetail)?.description}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-outline-variant/30 bg-surface-dim/40">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-outline-variant/30">
                      <th className="px-md py-sm font-label-xs text-label-xs text-outline uppercase">Kode MK</th>
                      <th className="px-md py-sm font-label-xs text-label-xs text-outline uppercase">Nama Mata Kuliah</th>
                      <th className="px-md py-sm font-label-xs text-label-xs text-outline uppercase text-center">SKS</th>
                      <th className="px-md py-sm font-label-xs text-label-xs text-outline uppercase text-center">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {cplDetailMappingCourses.map((course) => (
                      <tr key={course.code} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-md py-md font-body-sm text-primary font-bold">
                          {course.code}
                        </td>
                        <td className="px-md py-md font-body-sm text-on-surface font-medium">
                          {course.name}
                        </td>
                        <td className="px-md py-md font-body-sm text-on-surface-variant text-center">
                          {course.sks}
                        </td>
                        <td className="px-md py-md font-body-sm text-center">
                          <span className={`inline-flex items-center justify-center min-w-[40px] px-sm py-[2px] rounded font-bold text-label-xs ${
                            course.grade === 'Belum Diambil' ? 'bg-outline/10 text-outline' :
                            (course.score && course.score < 65) ? 'bg-error/10 text-error' :
                            'bg-tertiary/10 text-tertiary'
                          }`}>
                            {course.grade === 'Belum Diambil' ? 'Belum Diambil' : course.score}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-xl py-lg border-t border-outline-variant/30 bg-white/[0.02] flex justify-end shrink-0">
              <button 
                className="bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold btn-glow transition-all cursor-pointer"
                onClick={() => setSelectedCplForDetail(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
