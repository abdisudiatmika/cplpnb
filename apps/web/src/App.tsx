import './polyfills';
import React, { useState, useEffect, useRef } from 'react';
// Removed unused branding
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { CourseRadarChart } from './components/CourseRadarChart';
import { BarChart } from './components/BarChart';
import { CplPrintTemplate } from './components/CplPrintTemplate';
import { LandingPage } from './components/LandingPage';
import { AdminGradeInput } from './components/AdminGradeInput';

// API Configuration
const API_BASE = import.meta.env.PROD 
  ? '/api' 
  : (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000/api`);

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Kurikulum yang sedang dikelola admin prodi; dikirim ke API lewat header X-Curriculum-Id.
let activeCurriculumId: string | null = null;
const curriculumStorageKey = (userId?: string | null) => `sicpl.curriculum.${userId || 'anon'}`;

async function apiCall(path: string, method: string = 'GET', body: any = null) {
  const options: RequestInit = {
    method,
    credentials: 'include',
  };
  
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (activeCurriculumId) {
    headers['X-Curriculum-Id'] = activeCurriculumId;
  }

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
    throw new ApiError(localizeApiMessage(msg, res.status), res.status);
  }
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await res.json();
  }
  return null;
}

function getActiveAcademicPeriod(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const isOddSemesterPeriod = month >= 8 || month <= 1;
  const academicStartYear = month >= 8 ? year : year - 1;

  return {
    academicYear: `${academicStartYear}/${academicStartYear + 1}`,
    semesterType: isOddSemesterPeriod ? 'ganjil' : 'genap',
    isOddSemesterPeriod,
    academicStartYear,
  };
}

function getCurrentStudentSemester(angkatan?: string) {
  const cohortYear = Number(angkatan);
  const period = getActiveAcademicPeriod();

  if (!cohortYear || cohortYear > period.academicStartYear) {
    return 1;
  }

  const semester = (period.academicStartYear - cohortYear) * 2 + (period.isOddSemesterPeriod ? 1 : 2);
  return Math.max(1, semester);
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

interface Lecturer {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'dosen';
  employeeNumber: string;
  status: 'Aktif' | 'Nonaktif';
  departmentId: string;
  departmentName: string | null;
  departmentCode: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeachingAssignment {
  id: string;
  courseOfferingId: string;
  role: 'member';
  status: 'Aktif' | 'Nonaktif';
  lecturerId: string;
  lecturerName: string;
  employeeNumber: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  className: string;
  cohortYear: number;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  offeringStatus: string;
  periodStatus?: 'Draft' | 'Aktif' | 'Selesai';
  gradeStatus: 'Draft' | 'Submitted' | 'Approved' | 'Locked' | null;
}

interface CurriculumSummary {
  id: string;
  code: string;
  name: string;
  cohortFrom: number | null;
  cohortTo: number | null;
  status: 'Aktif' | 'Nonaktif';
  isDefault: boolean;
  notes: string | null;
  coursesCount: number | null;
  cplsCount: number | null;
  graduateProfilesCount: number | null;
}

const emptyCurriculumForm = { code: '', name: '', cohortFrom: '', cohortTo: '', status: 'Aktif', notes: '', copyFromId: '' };

const curriculumCohortLabel = (curriculum: Pick<CurriculumSummary, 'cohortFrom' | 'cohortTo'>) => {
  if (!curriculum.cohortFrom && !curriculum.cohortTo) return 'Semua angkatan';
  if (curriculum.cohortFrom && !curriculum.cohortTo) return `Angkatan ${curriculum.cohortFrom} dst.`;
  if (!curriculum.cohortFrom && curriculum.cohortTo) return `s.d. angkatan ${curriculum.cohortTo}`;
  return curriculum.cohortFrom === curriculum.cohortTo ? `Angkatan ${curriculum.cohortFrom}` : `Angkatan ${curriculum.cohortFrom}–${curriculum.cohortTo}`;
};

interface AcademicPeriodSummary {
  id: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  status: 'Draft' | 'Aktif' | 'Selesai';
  offeringCount: number;
}

interface CpmkMaster {
  id: string;
  code: string;
  description: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  cplCode: string;
  curriculumVersion: string | null;
  contributionWeight: number;
  status: 'Aktif' | 'Nonaktif';
}

interface GraduateProfile {
  id: string;
  code: string;
  name: string;
  englishName: string | null;
  summary: string;
  curriculumVersion: string;
  status: 'Aktif' | 'Nonaktif';
  sequence: number;
  cplMappings: Array<{ cplId: string; cplCode: string; type: 'core' | 'supporting' }>;
}

interface AssessmentItemDraft {
  id?: string;
  cpmkId: string;
  cpmkCode?: string;
  cplCode?: string;
  category: 'assignment' | 'quiz' | 'midterm' | 'final' | 'project' | 'practice' | 'presentation' | 'other';
  name: string;
  weight: number;
  sequence: number;
  isRequired: boolean;
}

interface AssessmentPlan {
  id: string;
  courseOfferingId: string;
  version: number;
  status: 'Draft' | 'Published' | 'Archived';
  courseCode: string;
  courseName: string;
  className: string;
  cohortYear: number;
  academicYear: string;
  semester: string;
  totalWeight: number;
  items: AssessmentItemDraft[];
}

interface GradebookScoreDraft {
  score: string;
  eligibilityStatus: 'eligible' | 'not_eligible_attendance' | 'excused' | 'absent' | 'makeup_exam';
  note: string;
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
  semester?: number | string | null;
}

interface Cpl {
  id: string;
  code: string;
  description: string;
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
  value: number;
  status: string;
  target?: number;
}

interface ReportSettings {
  headName: string;
  headNip: string;
  signatureData: string;
}

type DialogTone = 'primary' | 'warning' | 'danger';

interface AppDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: DialogTone;
  showCancel: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputMinLength?: number;
}

const TAB_ROUTES: Record<string, string> = {
  dashboard: 'dashboard',
  departments: 'jurusan',
  admins: 'admin-jurusan',
  mahasiswa: 'mahasiswa',
  curricula: 'kurikulum',
  matakuliah: 'mata-kuliah',
  graduate_profiles: 'profil-lulusan',
  cpl: 'cpl',
  nilai: 'nilai',
  hasil_cpl: 'hasil-cpl',
  report_settings: 'pengaturan-laporan',
  lecturers: 'dosen',
  teaching_assignments: 'penugasan-dosen',
  assessment_plans: 'rencana-asesmen',
  gradebook: 'input-nilai',
};

const tabFromHash = () => {
  const route = window.location.hash.replace(/^#\/?/, '').split(/[?&]/)[0];
  return Object.entries(TAB_ROUTES).find(([, value]) => value === route)?.[0] || '';
};

const localizeApiMessage = (message: string, status?: number) => {
  if (status === 401 || message === 'Unauthenticated.') return 'Sesi Anda telah berakhir. Silakan masuk kembali.';
  if (/email field must be a valid email address/i.test(message)) return 'Format email tidak valid.';
  if (/email field is required/i.test(message)) return 'Email wajib diisi.';
  if (/password field is required/i.test(message)) return 'Kata sandi wajib diisi.';
  if (/code field format is invalid/i.test(message)) return 'Format kode CPMK tidak valid. Gunakan format seperti CPMK03-01.';
  return message;
};

const gradeStatusLabel = (status?: string | null) => {
  if (!status) return 'Belum ada rencana';
  return ({
    Draft: 'Draf',
    Submitted: 'Diajukan',
    Approved: 'Disetujui',
    Locked: 'Dikunci',
    Published: 'Dipublikasikan',
    Archived: 'Diarsipkan',
  } as Record<string, string>)[status] || status;
};

const modalTypeLabel: Record<string, string> = {
  department: 'Jurusan',
  admin: 'Admin Jurusan',
  lecturer: 'Dosen',
  assignment: 'Penugasan Dosen',
  student: 'Mahasiswa',
  course: 'Mata Kuliah',
  cpl: 'CPL',
  mapping: 'Pemetaan CPL',
  grade: 'Nilai',
};

interface SearchPickerOption {
  value: string;
  label: string;
  meta?: string;
  searchText?: string;
}

function SearchablePicker({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  initiallyOpen = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchPickerOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  const selected = options.find(option => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase('id-ID');
  const matchingOptions = options.filter(option => {
    const searchable = `${option.label} ${option.meta || ''} ${option.searchText || ''}`.toLocaleLowerCase('id-ID');
    return !normalizedQuery || searchable.includes(normalizedQuery);
  });
  const visibleOptions = matchingOptions.slice(0, 8);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center rounded-lg border bg-surface-container transition-colors ${open ? 'border-primary ring-2 ring-primary/10' : 'border-outline-variant/60'}`}>
        <span className="material-symbols-outlined ml-md text-[20px] text-on-surface-variant">search</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-sm py-md text-on-surface outline-none"
          value={open ? query : selected?.label || ''}
          placeholder={open ? searchPlaceholder : placeholder}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={event => { setOpen(true); setQuery(event.target.value); }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
              event.currentTarget.blur();
            }
          }}
        />
        <span className="material-symbols-outlined mr-md text-[20px] text-on-surface-variant">{open ? 'expand_less' : 'expand_more'}</span>
      </div>
      {selected?.meta && !open && <p className="mt-xs px-xs font-label-xs text-on-surface-variant">{selected.meta}</p>}
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-30 mt-xs w-full overflow-hidden rounded-lg border border-outline-variant bg-white shadow-xl">
          <div className="max-h-[288px] overflow-y-auto p-xs">
            {visibleOptions.length > 0 ? visibleOptions.map(option => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                className={`flex w-full items-center gap-sm rounded-md px-md py-sm text-left hover:bg-primary/5 ${option.value === value ? 'bg-primary/10 text-primary' : 'text-on-surface'}`}
                onClick={() => { onChange(option.value); setOpen(false); setQuery(''); }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body-sm font-medium">{option.label}</span>
                  {option.meta && <span className="block truncate font-label-xs text-on-surface-variant">{option.meta}</span>}
                </span>
                {option.value === value && <span className="material-symbols-outlined text-[18px]">check</span>}
              </button>
            )) : <p className="px-md py-lg text-center font-body-sm text-on-surface-variant">{emptyText}</p>}
          </div>
          {matchingOptions.length > visibleOptions.length && (
            <p className="border-t border-outline-variant/60 px-md py-sm font-label-xs text-on-surface-variant">
              Menampilkan 8 dari {matchingOptions.length} hasil. Ketik kata kunci agar lebih spesifik.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Authentication & Session
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [appLoading, setAppLoading] = useState(true);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<string>(() => tabFromHash() || 'dashboard');

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
    window.history.pushState({ loginPage: true }, '', '#/login');
    setShowLanding(false);
  };

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState('');
  const [appDialog, setAppDialog] = useState<AppDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Lanjutkan',
    cancelLabel: 'Batal',
    tone: 'primary',
    showCancel: true,
  });
  const [appDialogInput, setAppDialogInput] = useState('');
  const appDialogResolverRef = useRef<((value: boolean | string | null) => void) | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);

  // General Loading State for Data Fetching
  const [dataLoading, setDataLoading] = useState(false);

  // Lists & States depending on Role
  // Super Admin
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [lecturerProfile, setLecturerProfile] = useState<Lecturer | null>(null);
  const [teachingAssignments, setTeachingAssignments] = useState<TeachingAssignment[]>([]);
  const [assignmentPeriods, setAssignmentPeriods] = useState<AcademicPeriodSummary[]>([]);
  const [curricula, setCurricula] = useState<CurriculumSummary[]>([]);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string | null>(null);
  const [showCurriculumModal, setShowCurriculumModal] = useState(false);
  const [editingCurriculumId, setEditingCurriculumId] = useState<string | null>(null);
  const [curriculumForm, setCurriculumForm] = useState(emptyCurriculumForm);
  const [curriculumSaving, setCurriculumSaving] = useState(false);
  const [curriculumFormError, setCurriculumFormError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', password: '', passwordConfirmation: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [selectedAssignmentPeriod, setSelectedAssignmentPeriod] = useState(() => ({
    academicYear: getActiveAcademicPeriod().academicYear,
    semester: (getActiveAcademicPeriod().isOddSemesterPeriod ? 'Ganjil' : 'Genap') as 'Ganjil' | 'Genap',
  }));
  const [assignmentPeriodSaving, setAssignmentPeriodSaving] = useState(false);
  const [expandedAssignmentLecturerId, setExpandedAssignmentLecturerId] = useState<string | null>(null);
  const [cpmkMasters, setCpmkMasters] = useState<CpmkMaster[]>([]);
  const [graduateProfiles, setGraduateProfiles] = useState<GraduateProfile[]>([]);
  const [editingGraduateProfileId, setEditingGraduateProfileId] = useState<string | null>(null);
  const [showGraduateProfileModal, setShowGraduateProfileModal] = useState(false);
  const [selectedGraduateProfileId, setSelectedGraduateProfileId] = useState<string | null>(null);
  const [graduateProfileMappingDraft, setGraduateProfileMappingDraft] = useState({ coreCplIds: [] as string[], supportingCplIds: [] as string[] });
  const [graduateProfileSaving, setGraduateProfileSaving] = useState(false);
  const [graduateProfileForm, setGraduateProfileForm] = useState({ code: '', name: '', englishName: '', summary: '', curriculumVersion: '2026', status: 'Aktif', sequence: '1' });
  const [editingCpmkId, setEditingCpmkId] = useState<string | null>(null);
  const [showCpmkModal, setShowCpmkModal] = useState(false);
  const [cpmkSaving, setCpmkSaving] = useState(false);
  const [cpmkFormError, setCpmkFormError] = useState('');
  const [cpmkForm, setCpmkForm] = useState({ courseId: '', code: '', description: '', cplCode: '', curriculumVersion: '2026', contributionWeight: '100', status: 'Aktif' });
  const [assessmentPlans, setAssessmentPlans] = useState<AssessmentPlan[]>([]);
  const [selectedAssessmentOfferingId, setSelectedAssessmentOfferingId] = useState('');
  const [assessmentDraftItems, setAssessmentDraftItems] = useState<AssessmentItemDraft[]>([]);
  const [editingAssessmentPlanId, setEditingAssessmentPlanId] = useState<string | null>(null);
  const [assessmentSaving, setAssessmentSaving] = useState(false);
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState('');
  const [assessmentPage, setAssessmentPage] = useState(1);
  const [gradebookAssignments, setGradebookAssignments] = useState<any[]>([]);
  const [selectedGradebookAssignmentId, setSelectedGradebookAssignmentId] = useState('');
  const [gradebookData, setGradebookData] = useState<any | null>(null);
  // Nilai bisa diubah dosen hanya saat masih Draf dan periodenya belum diarsipkan.
  const gradebookEditable = gradebookData?.submission?.status === 'Draft' && !gradebookData?.assignment?.periodArchived;
  const [gradebookScoreDrafts, setGradebookScoreDrafts] = useState<Record<string, GradebookScoreDraft>>({});
  const [gradebookSaving, setGradebookSaving] = useState(false);
  const [gradebookBottomTab, setGradebookBottomTab] = useState<'analysis' | 'statistics'>('analysis');
  const [gradebookAnalysis, setGradebookAnalysis] = useState('');
  const gradebookImportInputRef = useRef<HTMLInputElement>(null);

  // Department Admin
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cpls, setCpls] = useState<Cpl[]>([]);
  const [mappings, setMappings] = useState<CourseMapping[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [reportSettings, setReportSettings] = useState<ReportSettings>({
    headName: '',
    headNip: '',
    signatureData: '',
  });
  const [reportSettingsSaving, setReportSettingsSaving] = useState(false);
  const signatureFileInputRef = useRef<HTMLInputElement>(null);

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
  // Bawaan: capaian CPL kumulatif (semua periode); filter per semester tetap bisa dipilih.
  const [studentCplSemesterType, setStudentCplSemesterType] = useState('');
  const [studentCplAcademicYear, setStudentCplAcademicYear] = useState('');
  const [studentCplAcademicYears, setStudentCplAcademicYears] = useState<string[]>([]);
  const [studentPage, setStudentPage] = useState(1);
  const [studentItemsPerPage, setStudentItemsPerPage] = useState(25);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseSortConfig, setCourseSortConfig] = useState<{ key: 'code' | 'name' | 'sks', direction: 'asc' | 'desc' } | null>(null);

  // Pagination states for courses and grades-student list
  const [coursePage, setCoursePage] = useState(1);
  const [courseItemsPerPage, setCourseItemsPerPage] = useState(25);
  const [gradeStudentPage, setGradeStudentPage] = useState(1);
  const [gradeStudentItemsPerPage, setGradeStudentItemsPerPage] = useState(25);

  // Selected entities for specific views
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentAchievements, setSelectedStudentAchievements] = useState<CplAchievement[]>([]);
  const measuredStudentAchievements = React.useMemo(
    () => selectedStudentAchievements.filter(cpl => cpl.status !== 'Belum Diukur'),
    [selectedStudentAchievements],
  );
  // Removed unused cpl search/filter states
  const [cplMatrixAngkatan, setCplMatrixAngkatan] = useState('');
  const [cplMatrixKelas, setCplMatrixKelas] = useState('');
  const [cplMatrixSemesterType, setCplMatrixSemesterType] = useState('');
  const [cplMatrixAcademicYear, setCplMatrixAcademicYear] = useState('');
  const [cplMatrixAcademicYears, setCplMatrixAcademicYears] = useState<string[]>([]);
  const [cplMatrixAverageIpk, setCplMatrixAverageIpk] = useState<number | null>(null);
  const [selectedStudentForCpl, setSelectedStudentForCpl] = useState<string | null>(null);
  const [studentAcademicSummary, setStudentAcademicSummary] = useState<{ ips: number | null; ipk: number | null; totalSks: number; passedSks: number } | null>(null);

  // Course CPL report modal states
  const [isCourseReportModalOpen, setIsCourseReportModalOpen] = useState(false);
  const [courseReportAngkatan, setCourseReportAngkatan] = useState('');
  const [courseReportKelas, setCourseReportKelas] = useState('');
  const [courseReportSearch, setCourseReportSearch] = useState('');
  const [courseReportLoading, setCourseReportLoading] = useState(false);
  const [courseSummaries, setCourseSummaries] = useState<any[]>([]);
  const [expandedSummaryCourseId, setExpandedSummaryCourseId] = useState<string | null>(null);

  const [selectedCplForDetail, setSelectedCplForDetail] = useState<string | null>(null);
  const [cplDetailMappingCourses, setCplDetailMappingCourses] = useState<any[]>([]);

  // Expanded CPL in Rincian Rata-rata Capaian table
  const [expandedAvgCplId, setExpandedAvgCplId] = useState<string | null>(null);
  const [expandedAvgCplCourses, setExpandedAvgCplCourses] = useState<any[]>([]);
  const [expandedAvgCplLoading, setExpandedAvgCplLoading] = useState(false);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'department' | 'admin' | 'lecturer' | 'assignment' | 'student' | 'course' | 'cpl' | 'mapping' | 'grade'>('student');
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

  // Lecturer form
  const [lecturerFormName, setLecturerFormName] = useState('');
  const [lecturerFormEmail, setLecturerFormEmail] = useState('');
  const [lecturerFormPassword, setLecturerFormPassword] = useState('');
  const [lecturerFormEmployeeNumber, setLecturerFormEmployeeNumber] = useState('');
  const [lecturerFormDeptId, setLecturerFormDeptId] = useState('');
  const [lecturerFormStatus, setLecturerFormStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [assignmentLecturerId, setAssignmentLecturerId] = useState('');
  const [assignmentCourseId, setAssignmentCourseId] = useState('');
  const [assignmentClassName, setAssignmentClassName] = useState('');
  const [assignmentCohortYear, setAssignmentCohortYear] = useState(String(new Date().getFullYear()));
  const [assignmentAcademicYear, setAssignmentAcademicYear] = useState(`${new Date().getFullYear()}/${new Date().getFullYear() + 1}`);
  const [assignmentSemester, setAssignmentSemester] = useState<'Ganjil' | 'Genap'>('Ganjil');
  const [assignmentStatus, setAssignmentStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [assignmentStep, setAssignmentStep] = useState<1 | 2 | 3>(1);
  const [assignmentContextLocked, setAssignmentContextLocked] = useState(false);

  // Student form
  const [studentFormNim, setStudentFormNim] = useState('');
  const [studentFormName, setStudentFormName] = useState('');
  const [studentFormAngkatan, setStudentFormAngkatan] = useState('2024');
  const [studentFormKelas, setStudentFormKelas] = useState('');
  const [studentFormStatus, setStudentFormStatus] = useState<'Aktif' | 'Lulus' | 'Cuti'>('Aktif');

  // Course form
  const [courseFormCode, setCourseFormCode] = useState('');
  const [courseFormName, setCourseFormName] = useState('');
  const [courseFormSks, setCourseFormSks] = useState(3);
  const [courseFormSemester, setCourseFormSemester] = useState(1);

  // CPL form
  const [cplFormCode, setCplFormCode] = useState('');
  const [cplFormDesc, setCplFormDesc] = useState('');
  const [cplFormTarget, setCplFormTarget] = useState(75);

  // Slide panel for course detail & mapping
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  // Bulk CPL PDF download state
  const [bulkDownloadLoading, setBulkDownloadLoading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState(0);
  const [bulkDownloadTotal, setBulkDownloadTotal] = useState(0);

  // Grade form
  const [gradeFormCourseId, setGradeFormCourseId] = useState('');
  const [gradeFormLetter, setGradeFormLetter] = useState('AB');
  const [gradeFormScore, setGradeFormScore] = useState('80');
  const [gradeFormSemester, setGradeFormSemester] = useState('1');
  const [gradeFormYear, setGradeFormYear] = useState(getActiveAcademicPeriod().academicYear);

  // Mouse tracking gradient effect ref
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // File input ref for Excel import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const courseFileInputRef = useRef<HTMLInputElement>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const gradeFileInputRef = useRef<HTMLInputElement>(null);
  const [gradeInputMode, setGradeInputMode] = useState<'cpmk' | 'single' | 'student'>('cpmk');

  const requestConfirmation = (options: Partial<AppDialogState> & Pick<AppDialogState, 'title' | 'message'>) => new Promise<boolean>((resolve) => {
    appDialogResolverRef.current = value => resolve(value === true);
    setAppDialogInput('');
    setAppDialog({
      open: true,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || 'Lanjutkan',
      cancelLabel: options.cancelLabel || 'Batal',
      tone: options.tone || 'primary',
      showCancel: true,
    });
  });

  const requestTextInput = (options: Partial<AppDialogState> & Pick<AppDialogState, 'title' | 'message'>) => new Promise<string | null>((resolve) => {
    appDialogResolverRef.current = value => resolve(typeof value === 'string' ? value : null);
    setAppDialogInput('');
    setAppDialog({
      open: true,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || 'Simpan',
      cancelLabel: options.cancelLabel || 'Batal',
      tone: options.tone || 'primary',
      showCancel: true,
      inputLabel: options.inputLabel,
      inputPlaceholder: options.inputPlaceholder,
      inputMinLength: options.inputMinLength,
    });
  });

  const showNotice = (title: string, message: string, tone: DialogTone = 'warning') => {
    appDialogResolverRef.current = null;
    setAppDialogInput('');
    setAppDialog({
      open: true,
      title,
      message,
      confirmLabel: 'Tutup',
      cancelLabel: 'Batal',
      tone,
      showCancel: false,
    });
  };

  const closeAppDialog = (confirmed: boolean) => {
    const resolver = appDialogResolverRef.current;
    appDialogResolverRef.current = null;
    const value = confirmed
      ? (appDialog.inputLabel ? appDialogInput.trim() : true)
      : null;
    setAppDialog(current => ({ ...current, open: false }));
    resolver?.(value);
  };

  const resetTabDrilldown = (tab: string) => {
    if (tab === 'mahasiswa') {
      setSelectedStudentForCpl(null);
      setSelectedStudentAchievements([]);
    }
    if (tab === 'matakuliah') setExpandedCourseId(null);
    if (tab === 'graduate_profiles') setSelectedGraduateProfileId(null);
    if (tab === 'cpl') setSelectedCplForDetail(null);
    if (tab === 'assessment_plans') {
      setSelectedAssessmentOfferingId('');
      setEditingAssessmentPlanId(null);
      setAssessmentDraftItems([]);
    }
    if (tab === 'gradebook') closeGradebookAssignment();
  };

  const navigateToTab = (tab: string) => {
    resetTabDrilldown(tab);
    setActiveTab(tab);
    const route = TAB_ROUTES[tab] || 'dashboard';
    if (window.location.hash !== `#/${route}`) window.history.pushState({ tab }, '', `#/${route}`);
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    const syncFromLocation = () => {
      const routeTab = tabFromHash();
      if (routeTab) {
        resetTabDrilldown(routeTab);
        setActiveTab(routeTab);
      }
    };
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, [isLoggedIn]);

  useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview?.url]);

  // Verification on mount
  const checkSession = async () => {
    try {
      const data = await apiCall('/me');
      if (data && data.user) {
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        const requestedTab = tabFromHash();
        const defaultTab = data.user.role === 'super_admin' ? 'departments' : 'dashboard';
        const roleTabs = data.user.role === 'super_admin'
          ? ['departments', 'admins', 'lecturers']
          : data.user.role === 'dosen'
            ? ['dashboard', 'gradebook']
            : Object.keys(TAB_ROUTES).filter(tab => !['departments', 'admins', 'gradebook'].includes(tab));
        const nextTab = roleTabs.includes(requestedTab) ? requestedTab : defaultTab;
        setActiveTab(nextTab);
        window.history.replaceState({ tab: nextTab }, '', `#/${TAB_ROUTES[nextTab]}`);
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

  // Download CPL Excel template
  const downloadCplTemplate = () => {
    const sampleData = [
      {
        "kode_cpl": "CPL-1",
        "deskripsi": "Deskripsi CPL terintegrasi pertama.",
        "target_nilai": 75
      },
      {
        "kode_cpl": "CPL-2",
        "deskripsi": "Deskripsi CPL terintegrasi kedua.",
        "target_nilai": 75
      },
      {
        "kode_cpl": "CPL-3",
        "deskripsi": "Deskripsi CPL terintegrasi ketiga.",
        "target_nilai": 75
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    // Set custom column widths for visual aesthetics
    worksheet['!cols'] = [
      { wch: 12 }, // kode_cpl
      { wch: 80 }, // deskripsi
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
          cell.includes('description')
        );

        let codeIdx = 0;
        let descIdx = 1;
        let targetIdx = 2;
        let startRow = 0;

        if (isHeader) {
          codeIdx = firstRow.findIndex((h: string) => h.includes('kode') || h.includes('code'));
          descIdx = firstRow.findIndex((h: string) => h.includes('deskripsi') || h.includes('description') || h.includes('desc'));
          targetIdx = firstRow.findIndex((h: string) => h.includes('target') || h.includes('nilai'));
          startRow = 1;
        }

        if (codeIdx === -1 || descIdx === -1) {
          showToast('Kolom kode_cpl atau deskripsi tidak ditemukan.');
          return;
        }

        const itemsToImport: any[] = [];
        const errors: string[] = [];

        for (let i = startRow; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          if (!row || row.length === 0) continue;

          const rawCode = String(row[codeIdx] || '').trim();
          const rawDesc = String(row[descIdx] || '').trim();
          const rawTarget = targetIdx !== -1 && row[targetIdx] !== undefined ? String(row[targetIdx]).trim() : '75';

          // Skip completely empty rows
          if (!rawCode && !rawDesc) continue;

          if (!rawCode) {
            errors.push(`Baris ${i + 1}: Kode CPL kosong.`);
            continue;
          }
          if (!rawDesc) {
            errors.push(`Baris ${i + 1}: Deskripsi CPL kosong.`);
            continue;
          }
          if (!/^CPL-[1-9][0-9]*$/i.test(rawCode)) {
            errors.push(`Baris ${i + 1}: Kode "${rawCode}" tidak valid. Gunakan format CPL-1, CPL-2, dan seterusnya.`);
            continue;
          }

          const targetValue = Number(rawTarget) || 75;

          itemsToImport.push({
            code: rawCode,
            description: rawDesc,
            targetValue,
          });
        }

        if (errors.length > 0) {
          showNotice('Kesalahan pada berkas', `Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nHarap perbaiki file Anda.`);
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
        let semesterIdx = -1;
        let startRow = 0;

        if (isHeader) {
          codeIdx = firstRow.findIndex((h: string) => h.includes('kode') || h.includes('code'));
          nameIdx = firstRow.findIndex((h: string) => h.includes('nama') || h.includes('name') || h === 'mk' || h.includes('mata kuliah') || h.includes('matakuliah'));
          sksIdx = firstRow.findIndex((h: string) => h.includes('sks'));
          semesterIdx = firstRow.findIndex((h: string) => h.includes('semester'));
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
          const rawSemester = semesterIdx !== -1 && row[semesterIdx] !== undefined ? String(row[semesterIdx]).trim() : '';

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
            sks: Number(rawSks),
            semester: rawSemester && !isNaN(Number(rawSemester)) ? Number(rawSemester) : null,
          });
        }

        if (errors.length > 0) {
          showNotice('Kesalahan pada berkas', `Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nHarap perbaiki file Anda.`);
          return;
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/courses/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} Mata Kuliah berhasil diproses.`);

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
        const nimRows = new Map<string, number>();

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
          if (nimRows.has(rawNim)) {
            errors.push(`Baris ${i + 1}: NIM ${rawNim} duplikat dengan baris ${nimRows.get(rawNim)}.`);
            continue;
          }
          nimRows.set(rawNim, i + 1);

          itemsToImport.push({
            nim: rawNim,
            name: rawName,
            kelas: rawKelas,
            angkatan: rawAngkatan,
            status: 'Aktif'
          });
        }

        if (errors.length > 0) {
          showNotice('Kesalahan pada berkas', `Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nHarap perbaiki file Anda.`);
          return;
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        const result = await apiCall('/students/bulk', 'POST', { items: itemsToImport });
        showToast(`${result.length} Mahasiswa berhasil diproses.`);

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

      const selectedStudents = filteredGradeStudents.length > 0 ? filteredGradeStudents : students;
      const activePeriod = getActiveAcademicPeriod();
      const activeSemester = gradeStudentAngkatan
        ? getCurrentStudentSemester(gradeStudentAngkatan)
        : undefined;
      const selectedCourses = [...courses]
        .filter(course => !activeSemester || Number(course.semester) === activeSemester)
        .sort((a, b) => {
          const semesterCompare = Number(a.semester || 0) - Number(b.semester || 0);
          if (semesterCompare !== 0) return semesterCompare;
          return a.code.localeCompare(b.code);
        });

      const coursesForTemplate = selectedCourses.length > 0 ? selectedCourses : [...courses].sort((a, b) => a.code.localeCompare(b.code));

      const headerRow = ['NIM', 'Nama'];
      const subHeaderRow = ['', ''];

      coursesForTemplate.forEach(course => {
        headerRow.push(course.code, course.code);
        subHeaderRow.push('Nilai Angka', 'Nilai Huruf');
      });

      const dataRows: any[][] = [
        headerRow,
        subHeaderRow,
        ...selectedStudents.map((student) => {
          const row = [student.nim, student.name];
          coursesForTemplate.forEach(() => row.push('', ''));
          return row;
        }),
      ];

      const guideRows: any[][] = [
        ['Panduan Pengisian'],
        ['1', 'Jangan ubah NIM, Nama, atau kode mata kuliah pada header.'],
        ['2', 'Isi hanya kolom Nilai Angka. Nilai Huruf hanya referensi dan akan dihitung ulang oleh sistem saat import.'],
        ['3', 'Kosongkan kolom mata kuliah jika mahasiswa belum memiliki nilai pada mata kuliah tersebut.'],
        ['4', 'Gunakan sheet Template_Nilai untuk import utama. Sheet Format_Panjang adalah alternatif jika ingin satu baris per nilai.'],
        [],
        ['Daftar Mata Kuliah'],
        ['KodeMK', 'Nama_MK', 'SKS', 'Semester Kurikulum'],
        ...coursesForTemplate.map(course => [course.code, course.name, course.sks, course.semester || '']),
      ];

      const configRows: any[][] = [
        ['Field', 'Nilai'],
        ['Jurusan', currentUser?.departmentName || ''],
        ['Tahun Ajaran', activePeriod.academicYear],
        ['Periode', activePeriod.semesterType === 'ganjil' ? 'Ganjil' : 'Genap'],
        ['Angkatan', gradeStudentAngkatan || 'Semua'],
        ['Kelas', gradeStudentKelas || 'Semua'],
      ];

      const longFormatRows: any[][] = [
        ['NIM', 'KodeMK', 'Nilai_Angka'],
        [selectedStudents[0]?.nim || '2515623001', coursesForTemplate[0]?.code || 'MBB2462401217', ''],
        [],
        ['Daftar Mata Kuliah'],
        ['KodeMK', 'Nama_MK', 'SKS', 'Semester Kurikulum'],
        ...coursesForTemplate.map(course => [course.code, course.name, course.sks, course.semester || '']),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();

      worksheet['!cols'] = [
        { wch: 16 },
        { wch: 34 },
        ...coursesForTemplate.flatMap(() => [{ wch: 13 }, { wch: 12 }]),
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, "Template_Nilai");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(configRows), "Konfigurasi");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(guideRows), "Panduan");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(longFormatRows), "Format_Panjang");

      const labelParts = [
        'Template_Nilai',
        gradeStudentAngkatan || 'Semua_Angkatan',
        gradeStudentKelas || 'Semua_Kelas',
        activePeriod.academicYear.replace('/', '-'),
        activePeriod.semesterType,
      ];
      XLSX.writeFile(workbook, `${labelParts.join('_')}.xlsx`);
      showToast('Berhasil mengunduh template Excel nilai.');
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunduh template nilai.');
    } finally {
      setDataLoading(false);
    }
  };

  // Helper function to convert score to grade (0-100 to A, B, etc.)
  const getGradeLetter = (score: number) => {
    if (score === null || score === undefined || isNaN(score)) return 'E';
    const s = score <= 10 ? score * 10 : score;
    if (s >= 81) return 'A';
    if (s >= 76) return 'AB';
    if (s >= 66) return 'B';
    if (s >= 61) return 'BC';
    if (s >= 56) return 'C';
    if (s >= 41) return 'D';
    return 'E';
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
          return;
        }

        reject(new Error('Gagal membaca file PDF.'));
      };
      reader.onerror = () => reject(new Error('Gagal membaca file PDF.'));
      reader.readAsArrayBuffer(file);
    });
  };

  const extractPdfText = async (file: File) => {
    const buffer = await readFileAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; transform?: number[] }>;
      const lines = new Map<number, Array<{ x: number; text: string }>>();

      items.forEach((item) => {
        const text = item.str?.trim();
        if (!text || !item.transform) return;

        const x = item.transform[4] || 0;
        const y = Math.round((item.transform[5] || 0) * 10) / 10;
        const line = lines.get(y) || [];
        line.push({ x, text });
        lines.set(y, line);
      });

      const pageText = Array.from(lines.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, line]) => line.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
        .join('\n');

      pageTexts.push(pageText);
    }

    return pageTexts.join('\n');
  };

  const parseYudisiumPdfGrades = (text: string) => {
    const normalized = text
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();

    const courseCodes = Array.from(new Set(normalized.match(/\b[A-Z]{3}\d{10}\b/g) || []));
    if (courseCodes.length === 0) {
      throw new Error('Kode mata kuliah tidak ditemukan di PDF.');
    }

    const studentRows = normalized.match(/(?:^|\n)\s*\d+\s+\d{10}\s+.+?(?=\n\s*\d+\s+\d{10}\s+|$)/gs) || [];
    if (studentRows.length === 0) {
      throw new Error('Baris data mahasiswa tidak ditemukan di PDF.');
    }

    const gradeLetters = new Set(['A', 'AB', 'B', 'BC', 'C', 'D', 'E']);
    const parsedItems: Array<{ nim: string; courseCode: string; score: number }> = [];
    const errors: string[] = [];

    studentRows.forEach((row, rowIndex) => {
      const tokens = row.trim().split(/\s+/);
      const nim = tokens[1];
      const firstGradeIdx = tokens.findIndex((token, idx) => (
        idx > 1 &&
        !Number.isNaN(Number(token)) &&
        gradeLetters.has(tokens[idx + 1]) &&
        !Number.isNaN(Number(tokens[idx + 2]))
      ));

      if (!nim || firstGradeIdx === -1) {
        errors.push(`Baris PDF ${rowIndex + 1}: data nilai tidak terbaca.`);
        return;
      }

      let tokenIdx = firstGradeIdx;
      for (const courseCode of courseCodes) {
        let rawScore = tokens[tokenIdx];
        let rawGrade = tokens[tokenIdx + 1];
        let rawWeight = tokens[tokenIdx + 2];
        let step = 3;

        if (
          rawScore &&
          /^\d+(?:\.\d+)?$/.test(rawScore) &&
          /^\d+$/.test(rawGrade || '') &&
          gradeLetters.has(tokens[tokenIdx + 2]) &&
          !Number.isNaN(Number(tokens[tokenIdx + 3]))
        ) {
          rawScore = `${rawScore}${rawGrade}`;
          rawGrade = tokens[tokenIdx + 2];
          rawWeight = tokens[tokenIdx + 3];
          step = 4;
        }

        const score = Number(rawScore);

        if (rawScore === undefined || rawGrade === undefined || rawWeight === undefined) break;
        if (Number.isNaN(score) || !gradeLetters.has(rawGrade) || Number.isNaN(Number(rawWeight))) break;

        parsedItems.push({ nim, courseCode, score });
        tokenIdx += step;
      }
    });

    const expectedItems = courseCodes.length * studentRows.length;
    if (parsedItems.length > 0 && parsedItems.length < expectedItems) {
      errors.push(`PDF terbaca sebagian: ${parsedItems.length} dari ${expectedItems} nilai. Periksa apakah semua nilai berhasil masuk.`);
    }

    return { courseCodes, parsedItems, errors };
  };

  const importGradeItems = async (itemsToImport: any[]) => {
    setDataLoading(true);
    const result = await apiCall('/grades/bulk', 'POST', { items: itemsToImport });
    showToast(`${result.length} Nilai berhasil diimpor.`);

    if (selectedStudentId) {
      handleSelectStudentForGrades(selectedStudentId);
    }
  };

  const getExcelCellText = (value: any) => String(value ?? '').trim();

  const extractAcademicYearFromRows = (rows: any[][]) => {
    const preview = rows.slice(0, 12).flat().map(getExcelCellText).join(' ');
    return preview.match(/\b20\d{2}\/20\d{2}\b/)?.[0] || getActiveAcademicPeriod().academicYear;
  };

  const buildGradeImportItem = (
    rawNim: string,
    rawMkCode: string,
    rawScore: any,
    rowNumber: number,
    academicYear: string,
    errors: string[],
    rawGrade?: any,
  ) => {
    const nim = getExcelCellText(rawNim);
    const mkCode = getExcelCellText(rawMkCode).replace(/\*$/, '');
    const score = Number(rawScore);
    const gradeFromFile = getExcelCellText(rawGrade).toUpperCase();
    const allowedGrades = new Set(['A', 'AB', 'B', 'BC', 'C', 'D', 'E']);

    if (!nim || !mkCode || rawScore === undefined || rawScore === null || rawScore === '') return null;

    if (Number.isNaN(score)) {
      errors.push(`Baris ${rowNumber}: Nilai Angka tidak valid untuk NIM ${nim}.`);
      return null;
    }

    const student = students.find(s => s.nim === nim);
    if (!student) {
      errors.push(`Baris ${rowNumber}: Mahasiswa NIM ${nim} tidak ditemukan.`);
      return null;
    }

    const course = courses.find(c => c.code.toLowerCase() === mkCode.toLowerCase());
    if (!course) {
      errors.push(`Baris ${rowNumber}: Mata Kuliah ${mkCode} tidak ditemukan.`);
      return null;
    }

    const calculatedGrade = getGradeLetter(score);
    if (gradeFromFile && allowedGrades.has(gradeFromFile) && gradeFromFile !== calculatedGrade) {
      errors.push(`Baris ${rowNumber}: Nilai Huruf ${gradeFromFile} tidak sesuai Nilai Angka ${score}; sistem memakai ${calculatedGrade}.`);
    }

    return {
      studentId: student.id,
      courseId: course.id,
      score,
      grade: calculatedGrade,
      semester: course.semester || getCurrentStudentSemester(student.angkatan),
      academicYear,
    };
  };

  const parseLongGradeExcel = (parsedRows: any[][], academicYear: string) => {
    const headersRow = parsedRows[0].map((h: any) => getExcelCellText(h).toLowerCase());

    const nimIdx = headersRow.findIndex((h: string) => h === 'nim');
    const mkCodeIdx = headersRow.findIndex((h: string) => h === 'kodemk' || h === 'kode mk' || h === 'kode_mk');
    const scoreIdx = headersRow.findIndex((h: string) => h.includes('nilai_angka') || h.includes('nilai angka') || h === 'nilai');

    if (nimIdx === -1 || mkCodeIdx === -1 || scoreIdx === -1) return null;

    const itemsToImport: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (!row || row.length === 0) continue;

      const item = buildGradeImportItem(row[nimIdx], row[mkCodeIdx], row[scoreIdx], i + 1, academicYear, errors);
      if (item) itemsToImport.push(item);
    }

    return { itemsToImport, errors, format: 'panjang' };
  };

  const parseWideGradeExcel = (parsedRows: any[][], academicYear: string) => {
    const courseCodePattern = /^[A-Z]{3}\d{10}\*?$/;
    let headerRowIndex = -1;
    let courseColumns: Array<{ code: string; scoreColumn: number; gradeColumn?: number }> = [];

    parsedRows.slice(0, 12).forEach((row, rowIndex) => {
      const found = row
        .map((cell, colIndex) => ({ text: getExcelCellText(cell).toUpperCase(), colIndex }))
        .filter(cell => courseCodePattern.test(cell.text));

      if (found.length > courseColumns.length) {
        headerRowIndex = rowIndex;
        const groupedColumns: Array<{ code: string; startColumn: number; endColumn?: number }> = [];

        found.forEach((cell) => {
          const code = cell.text.replace(/\*$/, '');
          const lastGroup = groupedColumns[groupedColumns.length - 1];

          if (lastGroup && lastGroup.code === code) {
            return;
          }

          groupedColumns.push({ code, startColumn: cell.colIndex });
        });

        courseColumns = groupedColumns.map((group, index) => ({
          code: group.code,
          scoreColumn: group.startColumn,
          gradeColumn: undefined,
          endColumn: groupedColumns[index + 1]?.startColumn,
        })) as Array<{ code: string; scoreColumn: number; gradeColumn?: number; endColumn?: number }>;
      }
    });

    if (headerRowIndex === -1 || courseColumns.length === 0) {
      return null;
    }

    const subHeaderRows = parsedRows.slice(headerRowIndex + 1, Math.min(parsedRows.length, headerRowIndex + 5));
    courseColumns = courseColumns.map((course) => {
      let scoreColumn = course.scoreColumn;
      let gradeColumn: number | undefined;
      const endColumn = (course as typeof course & { endColumn?: number }).endColumn ?? course.scoreColumn + 3;

      for (const subRow of subHeaderRows) {
        for (let colIndex = course.scoreColumn; colIndex < endColumn; colIndex++) {
          const subHeader = getExcelCellText(subRow[colIndex]).toLowerCase();
          if (subHeader === 'na' || subHeader.includes('nilai angka')) {
            scoreColumn = colIndex;
          }
          if (subHeader === 'nh' || subHeader.includes('nilai huruf')) {
            gradeColumn = colIndex;
          }
        }
      }

      return { ...course, scoreColumn, gradeColumn };
    });

    const nimHeaderRowIndex = parsedRows
      .slice(0, Math.min(parsedRows.length, headerRowIndex + 5))
      .findIndex(row => row.some(cell => getExcelCellText(cell).toLowerCase() === 'nim'));
    const nimHeaderRow = nimHeaderRowIndex >= 0 ? parsedRows[nimHeaderRowIndex] : [];
    let nimIdx = nimHeaderRow.findIndex(cell => getExcelCellText(cell).toLowerCase() === 'nim');

    if (nimIdx === -1) {
      const candidates = new Map<number, number>();
      parsedRows.forEach(row => {
        row.forEach((cell, colIndex) => {
          if (/^\d{10}$/.test(getExcelCellText(cell))) {
            candidates.set(colIndex, (candidates.get(colIndex) || 0) + 1);
          }
        });
      });
      nimIdx = Array.from(candidates.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    }

    if (nimIdx === -1) return null;

    const firstStudentRowIndex = parsedRows.findIndex((row, index) => (
      index > headerRowIndex && /^\d{10}$/.test(getExcelCellText(row[nimIdx]))
    ));
    if (firstStudentRowIndex === -1) return null;

    const itemsToImport: any[] = [];
    const errors: string[] = [];

    for (let i = firstStudentRowIndex; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const rawNim = getExcelCellText(row[nimIdx]);
      if (!/^\d{10}$/.test(rawNim)) continue;

      courseColumns.forEach((course) => {
        const item = buildGradeImportItem(
          rawNim,
          course.code,
          row[course.scoreColumn],
          i + 1,
          academicYear,
          errors,
          course.gradeColumn !== undefined ? row[course.gradeColumn] : undefined,
        );
        if (item) itemsToImport.push(item);
      });
    }

    return { itemsToImport, errors, format: 'rapor panjang' };
  };

  const handleImportGradePdf = async (file: File) => {
    try {
      const text = await extractPdfText(file);
      const { courseCodes, parsedItems, errors } = parseYudisiumPdfGrades(text);
      const itemsToImport: any[] = [];

      parsedItems.forEach((item) => {
        const student = students.find(s => s.nim === item.nim);
        if (!student) {
          errors.push(`Mahasiswa NIM ${item.nim} tidak ditemukan.`);
          return;
        }

        const course = courses.find(c => c.code.toLowerCase() === item.courseCode.toLowerCase());
        if (!course) {
          errors.push(`Mata Kuliah ${item.courseCode} tidak ditemukan.`);
          return;
        }

        itemsToImport.push({
          studentId: student.id,
          courseId: course.id,
          score: item.score,
          grade: getGradeLetter(item.score),
          semester: course.semester || getCurrentStudentSemester(student.angkatan),
          academicYear: getActiveAcademicPeriod().academicYear,
        });
      });

      if (errors.length > 0) {
        showNotice('Sebagian nilai perlu diperiksa', `Ditemukan kesalahan:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n...dan ${errors.length - 8} kesalahan lainnya` : ''}\n\nNilai yang valid tetap akan diimpor.`);
      }

      if (itemsToImport.length === 0) {
        showToast(`Tidak ada nilai valid untuk diimpor. Pastikan ${courseCodes.length} kode MK di PDF sudah ada di sistem.`);
        return;
      }

      await importGradeItems(itemsToImport);
    } catch (err: any) {
      showToast(err.message || 'Gagal membaca file PDF.');
    } finally {
      setDataLoading(false);
      if (gradeFileInputRef.current) gradeFileInputRef.current.value = '';
    }
  };

  // Import Grade from Excel or yudisium PDF
  const handleImportGradeExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      handleImportGradePdf(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const preferredSheetNames = [
          ...workbook.SheetNames.filter(name => name.toLowerCase() === 'template_nilai'),
          ...workbook.SheetNames.filter(name => name.toLowerCase() !== 'template_nilai'),
        ];
        const workbookRows = preferredSheetNames.map(name => ({
          name,
          rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as any[][],
        }));
        const allRows: any[][] = workbook.SheetNames.flatMap((name) => (
          XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as any[][]
        ));

        if (!workbookRows.some(sheet => sheet.rows.length > 1)) {
          showToast('File Excel kosong atau tidak memiliki baris data.');
          return;
        }

        const academicYear = extractAcademicYearFromRows(allRows.length > 0 ? allRows : workbookRows[0]?.rows || []);
        const parsedImport = workbookRows
          .map(sheet => parseLongGradeExcel(sheet.rows, academicYear) || parseWideGradeExcel(sheet.rows, academicYear))
          .find(result => result && result.itemsToImport.length > 0)
          || workbookRows
            .map(sheet => parseLongGradeExcel(sheet.rows, academicYear) || parseWideGradeExcel(sheet.rows, academicYear))
            .find(Boolean);

        if (!parsedImport) {
          showToast('Format Excel tidak dikenali. Gunakan Template_Nilai atau format NIM-KodeMK-Nilai_Angka.');
          return;
        }

        const { itemsToImport, errors, format } = parsedImport;

        if (errors.length > 0) {
          showNotice('Sebagian nilai perlu diperiksa', `Ditemukan kesalahan:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...dan ${errors.length - 5} baris lainnya` : ''}\n\nNilai yang valid tetap akan diimpor.`);
        }

        if (itemsToImport.length === 0) {
          showToast('Tidak ada data nilai valid untuk diimpor.');
          return;
        }

        setDataLoading(true);
        await importGradeItems(itemsToImport);
        showToast(`Import Excel format ${format} selesai.`);
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

  useEffect(() => {
    if (!isLoggedIn || currentUser?.role !== 'admin_jurusan') return;

    apiCall('/report-settings')
      .then((settings) => {
        setReportSettings({
          headName: settings?.headName || '',
          headNip: settings?.headNip || '',
          signatureData: settings?.signatureData || '',
        });
      })
      .catch((error) => showToast(error.message || 'Gagal memuat pengaturan laporan.'));
  }, [isLoggedIn, currentUser?.role]);

  const handleSignatureFile = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      showToast('Tanda tangan harus berupa PNG atau JPG.');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      showToast('Ukuran gambar tanda tangan maksimal 1,5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReportSettings(current => ({ ...current, signatureData: String(reader.result || '') }));
    };
    reader.onerror = () => showToast('Gagal membaca gambar tanda tangan.');
    reader.readAsDataURL(file);
  };

  const handleSaveReportSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportSettings.headName.trim() || !reportSettings.headNip.trim()) {
      showToast('Nama Kaprodi dan NIP wajib diisi.');
      return;
    }

    setReportSettingsSaving(true);
    try {
      const saved = await apiCall('/report-settings', 'PUT', {
        headName: reportSettings.headName.trim(),
        headNip: reportSettings.headNip.trim(),
        signatureData: reportSettings.signatureData || null,
      });
      setReportSettings({
        headName: saved?.headName || '',
        headNip: saved?.headNip || '',
        signatureData: saved?.signatureData || '',
      });
      showToast('Pengaturan laporan berhasil disimpan.');
    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan pengaturan laporan.');
    } finally {
      setReportSettingsSaving(false);
    }
  };

  // Fetch Data trigger depending on role & active tab
  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;

    const loadData = async () => {
      setDataLoading(true);
      if (activeTab === 'matakuliah') setCpmkMasters([]);
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
          } else if (activeTab === 'lecturers') {
            const [lecturerList, deptList] = await Promise.all([
              apiCall('/lecturers'),
              apiCall('/departments'),
            ]);
            setLecturers(lecturerList);
            setDepartments(deptList);
          }
        } else if (currentUser.role === 'admin_jurusan') {
          if (activeTab === 'dashboard') {
            const dashboardParams = new URLSearchParams();
            if (dashboardAngkatan) dashboardParams.append('angkatan', dashboardAngkatan);
            if (dashboardKelas) dashboardParams.append('kelas', dashboardKelas);
            const summaryUrl = `/dashboard/obe-summary${dashboardParams.toString() ? `?${dashboardParams.toString()}` : ''}`;
            const [list, stats, courseList, obeSummary, profileList] = await Promise.all([
              apiCall('/students'),
              apiCall('/students/stats'),
              apiCall('/courses'),
              apiCall(summaryUrl),
              apiCall('/graduate-profiles'),
            ]);
            setStudents(list);
            setStudentStats(stats);
            setCourses(courseList);
            setCplAverages(obeSummary.cpls || []);
            setGraduateProfiles(profileList);
          } else if (activeTab === 'mahasiswa') {
            const [list, periodData, profileList] = await Promise.all([
              apiCall('/students'),
              apiCall('/grades/periods'),
              apiCall('/graduate-profiles'),
            ]);
            setStudents(list);
            setGraduateProfiles(profileList);
            const years = Array.isArray(periodData.academicYears) ? periodData.academicYears : [];
            setStudentCplAcademicYears(years);
            if (studentCplAcademicYear && years.length > 0 && !years.includes(studentCplAcademicYear)) {
              setStudentCplAcademicYear('');
            }
          } else if (activeTab === 'matakuliah') {
            const [courseList, cplList, mappingList, cpmkList] = await Promise.all([
              apiCall('/courses'),
              apiCall('/cpl'),
              apiCall('/mappings'),
              apiCall('/cpmks'),
            ]);
            setCourses(courseList);
            setCpls(cplList);
            setMappings(mappingList);
            setCpmkMasters(cpmkList);
          } else if (activeTab === 'cpl') {
            const list = await apiCall('/cpl');
            setCpls(list);
          } else if (activeTab === 'graduate_profiles') {
            const [profileList, cplList] = await Promise.all([apiCall('/graduate-profiles'), apiCall('/cpl')]);
            setGraduateProfiles(profileList);
            setCpls(cplList);
          } else if (activeTab === 'cpmks') {
            const [cpmkList, courseList, cplList] = await Promise.all([
              apiCall('/cpmks'),
              apiCall('/courses'),
              apiCall('/cpl'),
            ]);
            setCpmkMasters(cpmkList);
            setCourses(courseList);
            setCpls(cplList);
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
            if (cplMatrixSemesterType) params.append('semesterType', cplMatrixSemesterType);
            if (cplMatrixAcademicYear) params.append('academicYear', cplMatrixAcademicYear);
            if (params.toString()) url += `?${params.toString()}`;

            let ipkUrl = '/students/ipk-average';
            if (params.toString()) ipkUrl += `?${params.toString()}`;

            let courseSummaryUrl = '/cpl/course-summary';
            if (params.toString()) courseSummaryUrl += `?${params.toString()}`;

            const [studentList, averages, ipkData, periodData, courseSummaryData] = await Promise.all([
              apiCall('/students'),
              apiCall(url),
              apiCall(ipkUrl),
              apiCall('/grades/periods'),
              apiCall(courseSummaryUrl)
            ]);
            
            setStudents(studentList);
            setCplAverages(averages);
            setCplMatrixAverageIpk(ipkData.averageIpk);
            setCplMatrixAcademicYears(Array.isArray(periodData.academicYears) ? periodData.academicYears : []);
            setCourseSummaries(Array.isArray(courseSummaryData) ? courseSummaryData : []);
          } else if (activeTab === 'curricula') {
            const list: CurriculumSummary[] = await apiCall('/curricula');
            setCurricula(list);
          } else if (activeTab === 'lecturers') {
            const lecturerList = await apiCall('/lecturers');
            setLecturers(lecturerList);
          } else if (activeTab === 'teaching_assignments') {
            const [assignmentList, lecturerList, courseList, periodList, studentList] = await Promise.all([
              apiCall('/teaching-assignments'),
              apiCall('/lecturers'),
              apiCall('/courses'),
              apiCall('/teaching-assignment-periods'),
              apiCall('/students'),
            ]);
            setTeachingAssignments(assignmentList);
            setLecturers(lecturerList);
            setCourses(courseList);
            setAssignmentPeriods(periodList);
            setStudents(studentList);
            const activePeriod = periodList.find((period: AcademicPeriodSummary) => period.status === 'Aktif');
            if (activePeriod) {
              setSelectedAssignmentPeriod({ academicYear: activePeriod.academicYear, semester: activePeriod.semester });
            }
          } else if (activeTab === 'assessment_plans') {
            const [assignmentList, planList, cpmkList] = await Promise.all([
              apiCall('/teaching-assignments'),
              apiCall('/assessment-plans'),
              apiCall('/cpmks'),
            ]);
            setTeachingAssignments(assignmentList);
            setAssessmentPlans(planList);
            setCpmkMasters(cpmkList);
          }
          
          if (activeTab === 'mahasiswa' && selectedStudentForCpl) {
            const params = new URLSearchParams();
            if (studentCplSemesterType) params.append('semesterType', studentCplSemesterType);
            if (studentCplAcademicYear) params.append('academicYear', studentCplAcademicYear);
            const query = params.toString() ? `?${params.toString()}` : '';
            const achs = await apiCall(`/cpl/achievements/${selectedStudentForCpl}${query}`);
            setSelectedStudentAchievements(achs);
            setStudentAcademicSummary(await apiCall(`/students/${selectedStudentForCpl}/academic-summary`));
          }
        } else if (currentUser.role === 'dosen' && activeTab === 'dashboard') {
          const [profile, assignmentList] = await Promise.all([
            apiCall('/lecturers/me'),
            apiCall('/teaching-assignments/me'),
          ]);
          setLecturerProfile(profile);
          setTeachingAssignments(assignmentList);
        } else if (currentUser.role === 'dosen' && activeTab === 'gradebook') {
          const assignmentList = await apiCall('/lecturer-gradebooks');
          setGradebookAssignments(assignmentList);
          const assignmentId = selectedGradebookAssignmentId;
          if (assignmentId) {
            const detail = await apiCall(`/lecturer-gradebooks/${assignmentId}`);
            setGradebookData(detail);
            const drafts: Record<string, GradebookScoreDraft> = {};
            detail.students.forEach((student: any) => detail.plan.items.forEach((item: any) => {
              const stored = student.scores[item.id] || {};
              drafts[`${student.enrollmentId}:${item.id}`] = {
                score: stored.score === null || stored.score === undefined ? '' : String(stored.score),
                eligibilityStatus: 'eligible',
                note: stored.note || '',
              };
            }));
            setGradebookScoreDrafts(drafts);
            setGradebookAnalysis(detail.submission?.cpmkAnalysis || '');
          } else {
            setGradebookData(null);
          }
        }
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 401) {
          setIsLoggedIn(false);
          setCurrentUser(null);
          setShowLanding(false);
          setLoginError('Sesi Anda telah berakhir. Silakan masuk kembali.');
          window.history.replaceState({}, '', '#/');
          return;
        }
        showToast(e.message || 'Error loading data');
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
  }, [isLoggedIn, currentUser, activeTab, selectedCurriculumId, selectedStudentId, cplMatrixAngkatan, cplMatrixKelas, cplMatrixSemesterType, cplMatrixAcademicYear, selectedStudentForCpl, studentCplSemesterType, studentCplAcademicYear, dashboardAngkatan, dashboardKelas, selectedGradebookAssignmentId]);

  // Fetch course summary when course report modal is open
  useEffect(() => {
    if (!isCourseReportModalOpen) return;

    const fetchCourseSummaries = async () => {
      setCourseReportLoading(true);
      try {
        let url = '/cpl/course-summary';
        const params = new URLSearchParams();
        if (courseReportAngkatan) params.append('angkatan', courseReportAngkatan);
        if (courseReportKelas) params.append('kelas', courseReportKelas);
        if (params.toString()) url += `?${params.toString()}`;

        const data = await apiCall(url);
        setCourseSummaries(data);
      } catch (e: any) {
        showToast(e.message || 'Gagal memuat laporan capaian mata kuliah.');
      } finally {
        setCourseReportLoading(false);
      }
    };

    fetchCourseSummaries();
  }, [isCourseReportModalOpen, courseReportAngkatan, courseReportKelas]);

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
          const nextTab = result.user.role === 'super_admin' ? 'departments' : 'dashboard';
          setActiveTab(nextTab);
          window.history.replaceState({ tab: nextTab }, '', `#/${TAB_ROUTES[nextTab]}`);
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
  };

  // Konteks kerja admin prodi: kurikulum yang dikelola dan periode akademik.
  useEffect(() => {
    if (!isLoggedIn || currentUser?.role !== 'admin_jurusan') {
      activeCurriculumId = null;
      setCurricula([]);
      setSelectedCurriculumId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [list, periods] = await Promise.all([apiCall('/curricula'), apiCall('/teaching-assignment-periods')]);
        if (cancelled) return;
        setCurricula(list);
        applyCurriculumSelection(list);
        setAssignmentPeriods(periods);
        const activePeriod = (periods as AcademicPeriodSummary[]).find(period => period.status === 'Aktif');
        if (activePeriod) setSelectedAssignmentPeriod({ academicYear: activePeriod.academicYear, semester: activePeriod.semester });
      } catch (error) {
        console.error('Gagal memuat konteks kurikulum/periode:', error);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, currentUser?.id, currentUser?.role]);

  // Logout handler
  const handleLogout = async () => {
    const confirmed = await requestConfirmation({
      title: 'Keluar dari aplikasi?',
      message: 'Sesi Anda akan diakhiri dan Anda perlu masuk kembali untuk mengakses sistem.',
      confirmLabel: 'Keluar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiCall('/logout', 'POST');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoggedIn(false);
      setCurrentUser(null);
      activeCurriculumId = null;
      setCurricula([]);
      setSelectedCurriculumId(null);
      setSelectedStudentId('');
      setSelectedStudentAchievements([]);
      setShowLanding(true);
      window.history.replaceState({}, '', '#/');
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

      if (_isPrintTemplate) {
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pdfWidth - margin * 2;
        const contentHeight = pageHeight - margin * 2;
        const blocks = Array.from(input.querySelectorAll<HTMLElement>('[data-pdf-block]'));
        let currentY = margin;

        await Promise.all(Array.from(input.querySelectorAll<HTMLImageElement>('img')).map(async (img) => {
          if (img.complete) return;
          if (typeof img.decode === 'function') {
            await img.decode().catch(() => undefined);
            return;
          }
          await new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));

        const addCanvasToPdf = (canvas: HTMLCanvasElement) => {
          const imgData = canvas.toDataURL('image/png');
          const imgHeight = (canvas.height * contentWidth) / canvas.width;

          if (currentY > margin && currentY + imgHeight > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }

          if (imgHeight <= contentHeight) {
            pdf.addImage(imgData, 'PNG', margin, currentY, contentWidth, imgHeight);
            currentY += imgHeight + 5;
            return;
          }

          let sourceY = 0;
          const pageCanvas = document.createElement('canvas');
          const pageCtx = pageCanvas.getContext('2d');
          const sourcePageHeight = Math.floor((contentHeight * canvas.width) / contentWidth);

          pageCanvas.width = canvas.width;
          pageCanvas.height = sourcePageHeight;

          while (sourceY < canvas.height && pageCtx) {
            if (currentY !== margin) {
              pdf.addPage();
              currentY = margin;
            }

            const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
            pageCanvas.height = sliceHeight;
            pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
            pageCtx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

            const sliceImgData = pageCanvas.toDataURL('image/png');
            const slicePdfHeight = (sliceHeight * contentWidth) / canvas.width;
            pdf.addImage(sliceImgData, 'PNG', margin, margin, contentWidth, slicePdfHeight);

            sourceY += sliceHeight;
            if (sourceY < canvas.height) {
              pdf.addPage();
              currentY = margin;
            } else {
              currentY = margin + slicePdfHeight + 5;
            }
          }
        };

        for (const block of blocks) {
          const shouldStartNewPage = block.dataset.pdfPageBreak === 'before' && currentY > margin;
          if (shouldStartNewPage) {
            pdf.addPage();
            currentY = margin;
          }

          const canvas = await html2canvas(block, {
            scale: 2,
            backgroundColor: '#FFFFFF',
            useCORS: true,
            logging: false,
          });

          addCanvasToPdf(canvas);
        }

        pdf.save(`${filename}.pdf`);
        showToast('Unduhan PDF berhasil!');
        return;
      }

      const canvas = await html2canvas(input, {
        scale: 2, 
        backgroundColor: '#FFFFFF', 
        useCORS: true,
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

  const formatIndonesianDate = () => {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const date = new Date();
    const day = date.getDate();
    const monthIdx = date.getMonth();
    const year = date.getFullYear();
    return `${day} ${months[monthIdx]} ${year}`;
  };

  const drawStudentCplPage = (pdf: any, student: any, achievements: any[], documentTitle = 'LAPORAN CAPAIAN PEMBELAJARAN LULUSAN (CPL) MAHASISWA', transcriptData: any = null) => {
    // Kop Surat
    pdf.setFont("times", "bold");
    pdf.setFontSize(10);
    pdf.text("KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI", 105, 15, { align: "center" });
    pdf.setFontSize(13);
    pdf.text("POLITEKNIK NEGERI BALI", 105, 21, { align: "center" });
    pdf.setFontSize(11);
    pdf.text(`JURUSAN AKUNTANSI / ${currentUser?.departmentName?.toUpperCase() || 'D3 AKUNTANSI'}`, 105, 27, { align: "center" });
    pdf.setFont("times", "normal");
    pdf.setFontSize(8.5);
    pdf.text("Jalan Raya Uluwatu, Jimbaran, Badung, Bali. Telp: (0361) 701981", 105, 31, { align: "center" });
    
    // Lines under Kop
    pdf.setLineWidth(0.6);
    pdf.line(15, 34, 195, 34);
    pdf.setLineWidth(0.2);
    pdf.line(15, 35.5, 195, 35.5);

    // Title
    pdf.setFont("times", "bold");
    pdf.setFontSize(11);
    pdf.text(documentTitle, 105, 44, { align: "center" });

    // Student Info Block
    pdf.setLineWidth(0.2);
    pdf.rect(15, 49, 180, 30);
    
    pdf.setFont("times", "bold");
    pdf.setFontSize(9);
    pdf.text("Nama Mahasiswa", 18, 54);
    pdf.setFont("times", "normal");
    pdf.text(`: ${student.name}`, 48, 54);
    
    pdf.setFont("times", "bold");
    pdf.text("NIM", 18, 60);
    pdf.setFont("times", "normal");
    pdf.text(`: ${student.nim}`, 48, 60);
    
    pdf.setFont("times", "bold");
    pdf.text("Program Studi", 18, 66);
    pdf.setFont("times", "normal");
    pdf.text(`: ${currentUser?.departmentName || 'D3 Akuntansi'}`, 48, 66);

    pdf.setFont("times", "bold");
    pdf.text("Angkatan", 110, 54);
    pdf.setFont("times", "normal");
    pdf.text(`: ${student.angkatan}`, 138, 54);
    
    pdf.setFont("times", "bold");
    pdf.text("Kelas", 110, 60);
    pdf.setFont("times", "normal");
    pdf.text(`: ${student.kelas}`, 138, 60);
    
    pdf.setFont("times", "bold");
    pdf.text("Status Akademik", 110, 66);
    pdf.setFont("times", "normal");
    pdf.text(`: ${student.status}`, 138, 66);

    pdf.setFont("times", "bold");
    pdf.text("Periode CPL", 18, 72);
    pdf.setFont("times", "normal");
    pdf.text(`: ${studentCplSemesterType ? studentCplSemesterType.charAt(0).toUpperCase() + studentCplSemesterType.slice(1) : 'Semua Periode'}`, 48, 72);

    pdf.setFont("times", "bold");
    pdf.text("Tahun Ajaran", 110, 72);
    pdf.setFont("times", "normal");
    pdf.text(`: ${studentCplAcademicYear || 'Semua Tahun'}`, 138, 72);

    let currentY = 86;

    if (documentTitle.startsWith('TRANSKRIP')) {
      const measured = achievements.filter(item => Number(item.value) > 0);
      const highest = measured.reduce((best, item) => !best || Number(item.value) > Number(best.value) ? item : best, null);
      const lowest = measured.reduce((worst, item) => !worst || Number(item.value) < Number(worst.value) ? item : worst, null);
      const average = measured.length ? measured.reduce((total, item) => total + Number(item.value), 0) / measured.length : null;

      pdf.setFillColor(245, 248, 252);
      pdf.roundedRect(15, currentY, 180, 22, 2, 2, 'F');
      pdf.setFont('times', 'bold');
      pdf.setFontSize(9);
      pdf.text('RINGKASAN KINERJA OBE', 19, currentY + 5);
      pdf.setFontSize(8);
      pdf.setFont('times', 'normal');
      pdf.text('CPL Tertinggi', 19, currentY + 11);
      pdf.text('CPL Terendah', 78, currentY + 11);
      pdf.text('Rata-rata CPL', 137, currentY + 11);
      pdf.setFont('times', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(25, 118, 80);
      pdf.text(highest ? `${Number(highest.value).toFixed(2)} (${highest.code})` : '-', 19, currentY + 17);
      pdf.setTextColor(190, 55, 45);
      pdf.text(lowest ? `${Number(lowest.value).toFixed(2)} (${lowest.code})` : '-', 78, currentY + 17);
      pdf.setTextColor(35, 80, 160);
      pdf.text(average === null ? '-' : average.toFixed(2), 137, currentY + 17);
      pdf.setTextColor(0, 0, 0);
      currentY += 28;

      const achievementByCode = new Map(measured.map(item => [item.code, Number(item.value)]));
      const profileRows = graduateProfiles
        .filter(profile => profile.status === 'Aktif')
        .sort((a, b) => a.sequence - b.sequence)
        .map(profile => {
          const coreCodes = profile.cplMappings.filter(mapping => mapping.type === 'core').map(mapping => mapping.cplCode);
          const mappedCodes = Array.from(new Set(profile.cplMappings.map(mapping => mapping.cplCode)));
          const values = mappedCodes.map(code => achievementByCode.get(code)).filter((value): value is number => value !== undefined);
          const score = values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
          const status = score === null ? 'Belum Diukur' : values.length < mappedCodes.length ? 'Belum Lengkap' : score >= 75 ? 'Tercapai' : 'Belum Tercapai';
          return { profile, coreCodes, mappedCodes, values, score, status };
        });

      if (profileRows.length > 0) {
        pdf.setFont('times', 'bold');
        pdf.setFontSize(9);
        pdf.text('KETERCAPAIAN PROFIL LULUSAN', 15, currentY);
        currentY += 3;
        pdf.setFillColor(31, 78, 145);
        pdf.rect(15, currentY, 180, 7, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7.5);
        pdf.text('Profil Lulusan', 18, currentY + 4.7);
        pdf.text('CPL Inti', 105, currentY + 4.7);
        pdf.text('Capaian', 145, currentY + 4.7, { align: 'center' });
        pdf.text('Status', 173, currentY + 4.7, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        currentY += 7;

        profileRows.forEach(({ profile, coreCodes, mappedCodes, values, score, status }, index) => {
          if (index % 2 === 0) {
            pdf.setFillColor(248, 250, 253);
            pdf.rect(15, currentY, 180, 7, 'F');
          }
          pdf.rect(15, currentY, 180, 7);
          pdf.setFont('times', 'bold');
          pdf.setFontSize(7.5);
          const profileLabel = `${profile.code} - ${profile.name}`;
          pdf.text(profileLabel.length > 58 ? `${profileLabel.slice(0, 55)}...` : profileLabel, 18, currentY + 4.7);
          pdf.setFont('times', 'normal');
          pdf.text(coreCodes.join(', ') || '-', 105, currentY + 4.7);
          pdf.setFont('times', 'bold');
          pdf.text(score === null ? '-' : score.toFixed(2), 145, currentY + 4.7, { align: 'center' });
          pdf.setFont('times', 'normal');
          pdf.text(`${status} (${values.length}/${mappedCodes.length})`, 173, currentY + 4.7, { align: 'center' });
          pdf.line(100, currentY, 100, currentY + 7);
          pdf.line(130, currentY, 130, currentY + 7);
          pdf.line(158, currentY, 158, currentY + 7);
          currentY += 7;
        });
        currentY += 7;
      }
    }
    
    // Table Header
    pdf.setFillColor(240, 240, 240);
    pdf.rect(15, currentY, 180, 8, 'F');
    pdf.rect(15, currentY, 180, 8);
    
    pdf.setFont("times", "bold");
    pdf.setFontSize(8.5);
    pdf.text("No", 19, currentY + 5.5, { align: "center" });
    pdf.text("CPL", 30, currentY + 5.5, { align: "center" });
    pdf.text("Deskripsi Kompetensi", 39, currentY + 5.5);
    pdf.text("Nilai", 139.5, currentY + 5.5, { align: "center" });
    pdf.text("Kategori Ketercapaian CPL", 171, currentY + 5.5, { align: "center" });

    // Column lines
    pdf.line(23, currentY, 23, currentY + 8);
    pdf.line(37, currentY, 37, currentY + 8);
    pdf.line(132, currentY, 132, currentY + 8);
    pdf.line(147, currentY, 147, currentY + 8);

    currentY += 8;

    pdf.setFont("times", "normal");
    const sortedAchs = [...achievements].sort((a, b) => 
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    );

    if (sortedAchs.length === 0) {
      pdf.rect(15, currentY, 180, 10);
      pdf.text("Belum ada data capaian CPL atau nilai mahasiswa.", 105, currentY + 6.5, { align: "center" });
      currentY += 10;
    } else {
      sortedAchs.forEach((cpl, index) => {
        const descLines = pdf.splitTextToSize(cpl.description, 90);
        const rowHeight = Math.max(7, 3.8 * descLines.length + 3);
        
        if (currentY + rowHeight > 248) {
          pdf.line(15, currentY, 195, currentY);
          pdf.addPage();
          currentY = 20;
          
          pdf.setFillColor(240, 240, 240);
          pdf.rect(15, currentY, 180, 8, 'F');
          pdf.rect(15, currentY, 180, 8);
          
          pdf.setFont("times", "bold");
          pdf.text("No", 19, currentY + 5.5, { align: "center" });
          pdf.text("CPL", 30, currentY + 5.5, { align: "center" });
          pdf.text("Deskripsi Kompetensi", 39, currentY + 5.5);
          pdf.text("Nilai", 139.5, currentY + 5.5, { align: "center" });
          pdf.text("Kategori Ketercapaian CPL", 171, currentY + 5.5, { align: "center" });
          
          pdf.line(23, currentY, 23, currentY + 8);
          pdf.line(37, currentY, 37, currentY + 8);
          pdf.line(132, currentY, 132, currentY + 8);
          pdf.line(147, currentY, 147, currentY + 8);
          
          currentY += 8;
          pdf.setFont("times", "normal");
        }

        // Draw border
        pdf.rect(15, currentY, 180, rowHeight);
        
        pdf.text(String(index + 1), 19, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "bold");
        pdf.text(cpl.code, 30, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "normal");
        descLines.forEach((line: string, lineIdx: number) => {
          pdf.text(line, 39, currentY + 4.8 + (lineIdx * 3.8));
        });
        
        pdf.setFont("times", "bold");
        pdf.text(cpl.value === 0 ? '-' : String(cpl.value), 139.5, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "normal");
        
        let statusText = 'Belum Diukur';
        if (cpl.value > 0) {
          if (cpl.value >= 85) {
            statusText = 'Sangat kompeten (Exemplary)';
          } else if (cpl.value >= 75) {
            statusText = 'Kompeten (Competent)';
          } else if (cpl.value >= 60) {
            statusText = 'Berkembang (Developing)';
          } else {
            statusText = 'Tidak memuaskan (Unsatisfactory)';
          }
        }
        
        pdf.setFont("times", "bold");
        if (statusText.includes('Sangat kompeten') || statusText.includes('Kompeten')) {
          pdf.setTextColor(20, 120, 60);
        } else if (statusText.includes('Berkembang')) {
          pdf.setTextColor(230, 120, 0);
        } else if (statusText.includes('Tidak memuaskan')) {
          pdf.setTextColor(200, 30, 30);
        } else {
          pdf.setTextColor(100, 100, 100);
        }
        pdf.text(statusText, 171, currentY + 4.8, { align: "center" });
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("times", "normal");

        pdf.line(23, currentY, 23, currentY + rowHeight);
        pdf.line(37, currentY, 37, currentY + rowHeight);
        pdf.line(72, currentY, 72, currentY + rowHeight);
        pdf.line(132, currentY, 132, currentY + rowHeight);
        pdf.line(147, currentY, 147, currentY + rowHeight);

        currentY += rowHeight;
      });
    }

    if (documentTitle.startsWith('TRANSKRIP') && transcriptData?.cpmks?.length) {
      pdf.addPage();
      let detailY = 20;
      pdf.setFont('times', 'bold');
      pdf.setFontSize(11);
      pdf.text('LAMPIRAN RINCIAN CAPAIAN CPMK', 105, detailY, { align: 'center' });
      detailY += 8;
      pdf.setFontSize(8);
      pdf.setFillColor(31, 78, 145);
      pdf.rect(15, detailY, 180, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.text('CPMK', 19, detailY + 5.5);
      pdf.text('Mata Kuliah', 48, detailY + 5.5);
      pdf.text('CPL', 105, detailY + 5.5);
      pdf.text('Nilai', 145, detailY + 5.5, { align: 'center' });
      pdf.text('Status', 174, detailY + 5.5, { align: 'center' });
      pdf.setTextColor(0, 0, 0);
      detailY += 8;
      transcriptData.cpmks.forEach((item: any, index: number) => {
        if (detailY > 270) { pdf.addPage(); detailY = 20; }
        if (index % 2 === 0) { pdf.setFillColor(248, 250, 253); pdf.rect(15, detailY, 180, 8, 'F'); }
        pdf.rect(15, detailY, 180, 8);
        pdf.setFont('times', 'bold'); pdf.text(item.cpmkCode || '-', 19, detailY + 5.5);
        pdf.setFont('times', 'normal'); pdf.text((item.courseName || '-').slice(0, 30), 48, detailY + 5.5);
        pdf.text((item.cpls || []).map((cpl: any) => cpl.code).join(', ') || '-', 105, detailY + 5.5);
        pdf.setFont('times', 'bold'); pdf.text(Number(item.score).toFixed(2), 145, detailY + 5.5, { align: 'center' });
        pdf.setFont('times', 'normal'); pdf.text(item.status || '-', 174, detailY + 5.5, { align: 'center' });
        detailY += 8;
      });
    }

    // Signature Box
    const signY = 252;
    pdf.setFontSize(9.5);
    pdf.text("Jimbaran, " + formatIndonesianDate(), 142, signY);
    pdf.text("Koordinator Program Studi,", 142, signY + 5);

    if (reportSettings.signatureData) {
      const signatureFormat = reportSettings.signatureData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(reportSettings.signatureData, signatureFormat, 148, signY + 7, 34, 13);
    }

    pdf.setFont("times", "bold");
    pdf.text(reportSettings.headName || 'Nama Kaprodi belum diatur', 165, signY + 23, { align: "center" });
    pdf.setFont("times", "normal");
    pdf.line(142, signY + 24, 188, signY + 24);
    pdf.text(`NIP. ${reportSettings.headNip || '-'}`, 165, signY + 28, { align: "center" });
  };

  const handleDownloadSingleStudentCplReport = async (student: any) => {
    showToast(`Mempersiapkan Laporan CPL untuk ${student.name}...`);
    try {
      const params = new URLSearchParams();
      if (studentCplSemesterType) params.append('semesterType', studentCplSemesterType);
      if (studentCplAcademicYear) params.append('academicYear', studentCplAcademicYear);
      const query = params.toString() ? `?${params.toString()}` : '';
      const achs = await apiCall(`/cpl/achievements/${student.id}${query}`);
      const pdf = new jsPDF('p', 'mm', 'a4');
      drawStudentCplPage(pdf, student, achs);
      const periodLabel = [studentCplSemesterType || 'semua-periode', studentCplAcademicYear?.replace('/', '-') || 'semua-tahun'].join('_');
      pdf.save(`Laporan_CPL_${student.nim}_${student.name.replace(/\s+/g, '_')}_${periodLabel}.pdf`);
      showToast('Unduhan laporan CPL berhasil!');
    } catch (e: any) {
      console.error(e);
      showToast('Gagal memproses laporan CPL.');
    }
  };

  const handleDownloadStudentObeTranscript = async (student: Student) => {
    showToast(`Mempersiapkan Transkrip OBE untuk ${student.name}...`);
    try {
      const params = new URLSearchParams();
      if (studentCplSemesterType) params.append('semesterType', studentCplSemesterType);
      if (studentCplAcademicYear) params.append('academicYear', studentCplAcademicYear);
      const query = params.toString() ? `?${params.toString()}` : '';
      const transcript = await apiCall(`/cpl/transcript/${student.id}${query}`);
      const achievements = transcript.cpls || [];
      const pdf = new jsPDF('p', 'mm', 'a4');
      drawStudentCplPage(pdf, student, achievements, 'TRANSKRIP CAPAIAN PEMBELAJARAN BERBASIS OBE', transcript);
      const periodLabel = [studentCplSemesterType || 'semua-periode', studentCplAcademicYear?.replace('/', '-') || 'semua-tahun'].join('_');
      const filename = `Transkrip_OBE_${student.nim}_${student.name.replace(/\s+/g, '_')}_${periodLabel}.pdf`;
      const previewUrl = URL.createObjectURL(pdf.output('blob'));
      setPdfPreview(current => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { url: previewUrl, filename };
      });
      showToast('Pratinjau Transkrip OBE siap.');
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || 'Gagal memproses Transkrip OBE.');
    }
  };

  const handleDownloadAllCplReports = async () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      showToast('Tidak ada data mahasiswa untuk diekspor.');
      return;
    }

    if (!await requestConfirmation({
      title: 'Unduh data CPL?',
      message: `${filteredStudents.length} mahasiswa akan dimasukkan ke dalam satu berkas Excel.`,
      confirmLabel: 'Unduh Excel',
    })) return;

    setBulkDownloadTotal(filteredStudents.length);
    setBulkDownloadProgress(0);
    setBulkDownloadLoading(true);

    try {
      const params = new URLSearchParams();
      if (studentFilterAngkatan) params.append('angkatan', studentFilterAngkatan);
      if (studentFilterKelas) params.append('kelas', studentFilterKelas);
      if (studentSearch.trim()) params.append('search', studentSearch.trim());
      if (studentCplSemesterType) params.append('semesterType', studentCplSemesterType);
      if (studentCplAcademicYear) params.append('academicYear', studentCplAcademicYear);

      const query = params.toString() ? `?${params.toString()}` : '';
      const bulkData = await apiCall(`/cpl/achievements-bulk${query}`);
      const exportStudents = Array.isArray(bulkData?.students) ? bulkData.students : [];

      if (exportStudents.length === 0) {
        throw new Error('Tidak ada data CPL mahasiswa untuk filter yang dipilih.');
      }

      setBulkDownloadTotal(exportStudents.length);
      setBulkDownloadProgress(exportStudents.length);
      const allResults = exportStudents.map((student: any) => student.achievements || []);

      const cplColumns = Array.from(
        new Map(
          allResults.flatMap((result: any[]) => (result || []).map((cpl: any) => [cpl.code, cpl]))
        ).values()
      ).sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

      const summaryRows: any[][] = [
        ['NIM', 'Nama Mahasiswa', 'Angkatan', 'Kelas', ...cplColumns.map((cpl: any) => cpl.code)],
      ];
      const detailRows: any[][] = [[
        'NIM', 'Nama Mahasiswa', 'Angkatan', 'Kelas', 'Kode CPL',
        'Deskripsi Kompetensi', 'Nilai', 'Status', 'Target',
      ]];

      exportStudents.forEach((student: any, index: number) => {
        const achievements = allResults[index] || [];
        const byCode = new Map(achievements.map((cpl: any) => [cpl.code, cpl]));
        summaryRows.push([
          student.nim,
          student.name,
          student.angkatan,
          student.kelas,
          ...cplColumns.map((column: any) => {
            const cpl: any = byCode.get(column.code);
            return cpl && Number(cpl.value) > 0 ? Number(cpl.value) : '';
          }),
        ]);

        achievements
          .sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }))
          .forEach((cpl: any) => {
            detailRows.push([
              student.nim,
              student.name,
              student.angkatan,
              student.kelas,
              cpl.code,
              cpl.description || '',
              Number(cpl.value) > 0 ? Number(cpl.value) : '',
              cpl.status || (Number(cpl.value) > 0 ? 'Terukur' : 'Belum Diukur'),
              cpl.target ?? 75,
            ]);
          });
      });

      const infoRows = [
        ['Informasi Laporan', ''],
        ['Jurusan', currentUser?.departmentName || ''],
        ['Angkatan', studentFilterAngkatan || 'Semua Angkatan'],
        ['Kelas', studentFilterKelas || 'Semua Kelas'],
        ['Periode', studentCplSemesterType ? studentCplSemesterType.charAt(0).toUpperCase() + studentCplSemesterType.slice(1) : 'Semua Periode'],
        ['Tahun Ajaran', studentCplAcademicYear || 'Semua Tahun Ajaran'],
        ['Jumlah Mahasiswa', exportStudents.length],
        ['Tanggal Ekspor', new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())],
      ];

      const workbook = XLSX.utils.book_new();
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
      const infoSheet = XLSX.utils.aoa_to_sheet(infoRows);

      summarySheet['!cols'] = [
        { wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 10 },
        ...cplColumns.map(() => ({ wch: 11 })),
      ];
      detailSheet['!cols'] = [
        { wch: 16 }, { wch: 34 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
        { wch: 24 }, { wch: 70 }, { wch: 10 }, { wch: 32 }, { wch: 10 },
      ];
      infoSheet['!cols'] = [{ wch: 22 }, { wch: 32 }];

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan');
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detail_CPL');
      XLSX.utils.book_append_sheet(workbook, infoSheet, 'Informasi');

      const fileLabel = [
        studentFilterAngkatan || 'Semua',
        studentFilterKelas || 'Semua',
        studentCplSemesterType || 'Semua-Periode',
        studentCplAcademicYear?.replace('/', '-') || 'Semua-Tahun',
      ].join('_');
      XLSX.writeFile(workbook, `Laporan_CPL_Mahasiswa_${fileLabel}.xlsx`);
      showToast('Berhasil mengunduh laporan CPL dalam Excel!');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Gagal memproses laporan CPL Excel.');
    } finally {
      setBulkDownloadLoading(false);
    }
  };

  const drawCourseCplPage = (pdf: any, course: any, angkatan: string, kelas: string) => {
    // Kop Surat
    pdf.setFont("times", "bold");
    pdf.setFontSize(10);
    pdf.text("KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI", 105, 15, { align: "center" });
    pdf.setFontSize(13);
    pdf.text("POLITEKNIK NEGERI BALI", 105, 21, { align: "center" });
    pdf.setFontSize(11);
    pdf.text(`JURUSAN AKUNTANSI / ${currentUser?.departmentName?.toUpperCase() || 'D3 AKUNTANSI'}`, 105, 27, { align: "center" });
    pdf.setFont("times", "normal");
    pdf.setFontSize(8.5);
    pdf.text("Jalan Raya Uluwatu, Jimbaran, Badung, Bali. Telp: (0361) 701981", 105, 31, { align: "center" });
    
    // Lines under Kop
    pdf.setLineWidth(0.6);
    pdf.line(15, 34, 195, 34);
    pdf.setLineWidth(0.2);
    pdf.line(15, 35.5, 195, 35.5);

    // Title
    pdf.setFont("times", "bold");
    pdf.setFontSize(11);
    pdf.text("LAPORAN CAPAIAN PEMBELAJARAN LULUSAN (CPL) PER MATA KULIAH", 105, 44, { align: "center" });

    // Course Info Block
    pdf.setLineWidth(0.2);
    pdf.rect(15, 49, 180, 24);
    
    pdf.setFont("times", "bold");
    pdf.setFontSize(9);
    pdf.text("Nama Mata Kuliah", 18, 54);
    pdf.setFont("times", "normal");
    pdf.text(`: ${course.name}`, 48, 54);
    
    pdf.setFont("times", "bold");
    pdf.text("Kode Mata Kuliah", 18, 60);
    pdf.setFont("times", "normal");
    pdf.text(`: ${course.code}`, 48, 60);
    
    pdf.setFont("times", "bold");
    pdf.text("SKS", 18, 66);
    pdf.setFont("times", "normal");
    pdf.text(`: ${course.sks} SKS`, 48, 66);

    pdf.setFont("times", "bold");
    pdf.text("Angkatan", 110, 54);
    pdf.setFont("times", "normal");
    pdf.text(`: ${angkatan || 'Semua Angkatan'}`, 138, 54);
    
    pdf.setFont("times", "bold");
    pdf.text("Kelas", 110, 60);
    pdf.setFont("times", "normal");
    pdf.text(`: ${kelas || 'Semua Kelas'}`, 138, 60);
    
    pdf.setFont("times", "bold");
    pdf.text("Rata-rata Nilai MK", 110, 66);
    pdf.setFont("times", "normal");
    pdf.text(`: ${course.average_grade !== null && course.average_grade !== undefined ? Number(course.average_grade).toFixed(2) : '0.00'} (dari ${course.grades_count || 0} mahasiswa)`, 138, 66);

    let currentY = 80;
    
    // Table Header
    pdf.setFillColor(240, 240, 240);
    pdf.rect(15, currentY, 180, 8, 'F');
    pdf.rect(15, currentY, 180, 8);
    
    pdf.setFont("times", "bold");
    pdf.setFontSize(8.5);
    pdf.text("No", 19, currentY + 5.5, { align: "center" });
    pdf.text("CPL", 30.5, currentY + 5.5, { align: "center" });
    pdf.text("Deskripsi Kompetensi CPL", 40, currentY + 5.5);
    pdf.text("Bobot", 124, currentY + 5.5, { align: "center" });
    pdf.text("Rerata (%)", 137.5, currentY + 5.5, { align: "center" });
    pdf.text("Kategori Ketercapaian CPL", 170, currentY + 5.5, { align: "center" });

    // Column borders
    pdf.line(23, currentY, 23, currentY + 8);
    pdf.line(38, currentY, 38, currentY + 8);
    pdf.line(118, currentY, 118, currentY + 8);
    pdf.line(130, currentY, 130, currentY + 8);
    pdf.line(145, currentY, 145, currentY + 8);

    currentY += 8;
    pdf.setFont("times", "normal");

    const mappings = course.mappings || [];
    if (mappings.length === 0) {
      pdf.rect(15, currentY, 180, 10);
      pdf.text("Belum ada CPL terpetakan untuk mata kuliah ini.", 105, currentY + 6.5, { align: "center" });
      currentY += 10;
    } else {
      mappings.forEach((map: any, index: number) => {
        const descLines = pdf.splitTextToSize(map.cpl_desc || '-', 76);
        const rowHeight = Math.max(7, 3.8 * descLines.length + 3);

        if (currentY + rowHeight > 248) {
          pdf.line(15, currentY, 195, currentY);
          pdf.addPage();
          currentY = 20;

          pdf.setFillColor(240, 240, 240);
          pdf.rect(15, currentY, 180, 8, 'F');
          pdf.rect(15, currentY, 180, 8);
          
          pdf.setFont("times", "bold");
          pdf.text("No", 19, currentY + 5.5, { align: "center" });
          pdf.text("CPL", 30.5, currentY + 5.5, { align: "center" });
          pdf.text("Deskripsi Kompetensi CPL", 40, currentY + 5.5);
          pdf.text("Bobot", 124, currentY + 5.5, { align: "center" });
          pdf.text("Rerata (%)", 137.5, currentY + 5.5, { align: "center" });
          pdf.text("Kategori Ketercapaian CPL", 170, currentY + 5.5, { align: "center" });

          pdf.line(23, currentY, 23, currentY + 8);
          pdf.line(38, currentY, 38, currentY + 8);
          pdf.line(118, currentY, 118, currentY + 8);
          pdf.line(130, currentY, 130, currentY + 8);
          pdf.line(145, currentY, 145, currentY + 8);

          currentY += 8;
          pdf.setFont("times", "normal");
        }

        pdf.rect(15, currentY, 180, rowHeight);
        pdf.text(String(index + 1), 19, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "bold");
        pdf.text(map.cpl_code || '-', 30.5, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "normal");

        descLines.forEach((line: string, lineIdx: number) => {
          pdf.text(line, 40, currentY + 4.8 + (lineIdx * 3.8));
        });

        pdf.text(String(map.weight || '-'), 124, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "bold");
        pdf.text(String(map.cpl_average || '0'), 137.5, currentY + 4.8, { align: "center" });
        pdf.setFont("times", "normal");

        const statusText = map.cpl_status || 'Belum Terukur';
        pdf.setFont("times", "bold");
        if (statusText.includes('Sangat kompeten') || statusText.includes('Kompeten')) {
          pdf.setTextColor(20, 120, 60);
        } else if (statusText.includes('Berkembang')) {
          pdf.setTextColor(230, 120, 0);
        } else if (statusText.includes('Tidak memuaskan')) {
          pdf.setTextColor(200, 30, 30);
        } else {
          pdf.setTextColor(100, 100, 100);
        }
        pdf.text(statusText, 170, currentY + 4.8, { align: "center" });
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("times", "normal");

        pdf.line(23, currentY, 23, currentY + rowHeight);
        pdf.line(38, currentY, 38, currentY + rowHeight);
        pdf.line(118, currentY, 118, currentY + rowHeight);
        pdf.line(130, currentY, 130, currentY + rowHeight);
        pdf.line(145, currentY, 145, currentY + rowHeight);

        currentY += rowHeight;
      });
    }

    if (mappings.length > 0) {
      if (currentY + 70 > 248) {
        pdf.addPage();
        currentY = 20;
      }

      // Draw Chart Header
      pdf.setFont("times", "bold");
      pdf.setFontSize(10);
      pdf.text("Grafik Ketercapaian CPL Mata Kuliah", 15, currentY + 6);
      pdf.line(15, currentY + 8, 195, currentY + 8);
      currentY += 12;

      const N = mappings.length;
      if (N >= 3) {
        const cx = 105;
        const cy = currentY + 28;
        const radius = 22;

        const angles = Array.from({ length: N }, (_, i) => (2 * Math.PI * i) / N - Math.PI / 2);
        const getPt = (r: number, angle: number) => {
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          return { x, y };
        };

        // Grid concentric polygons
        const gridScales = [0.25, 0.5, 0.75, 1];
        gridScales.forEach((scale) => {
          const r = radius * scale;
          for (let i = 0; i < N; i++) {
            const pt1 = getPt(r, angles[i]);
            const pt2 = getPt(r, angles[(i + 1) % N]);
            pdf.setLineWidth(0.1);
            pdf.setDrawColor(200, 200, 200);
            pdf.line(pt1.x, pt1.y, pt2.x, pt2.y);
          }
        });

        // Axis lines
        for (let i = 0; i < N; i++) {
          const outer = getPt(radius, angles[i]);
          pdf.setLineWidth(0.1);
          pdf.setDrawColor(180, 180, 180);
          pdf.line(cx, cy, outer.x, outer.y);
        }

        // Realisation shape (Indigo line)
        pdf.setLineWidth(0.5);
        pdf.setDrawColor(99, 102, 241);
        for (let i = 0; i < N; i++) {
          const a1 = mappings[i].cpl_average || 0;
          const a2 = mappings[(i + 1) % N].cpl_average || 0;
          const pt1 = getPt(radius * (a1 / 100), angles[i]);
          const pt2 = getPt(radius * (a2 / 100), angles[(i + 1) % N]);
          pdf.line(pt1.x, pt1.y, pt2.x, pt2.y);
        }

        pdf.setDrawColor(0, 0, 0); // reset

        // Draw dots at achievement points
        for (let i = 0; i < N; i++) {
          const a = mappings[i].cpl_average || 0;
          const pt = getPt(radius * (a / 100), angles[i]);
          pdf.setFillColor(99, 102, 241);
          pdf.circle(pt.x, pt.y, 0.7, 'F');
        }

        // Draw Labels text around the radar chart
        pdf.setFont("times", "bold");
        pdf.setFontSize(7.5);
        for (let i = 0; i < N; i++) {
          const outer = getPt(radius + 5, angles[i]);
          const code = mappings[i].cpl_code || '-';
          const val = mappings[i].cpl_average || 0;
          const labelText = `${code} (${val}%)`;

          const cos = Math.cos(angles[i]);
          let alignOpt = "center";
          if (cos > 0.15) {
            alignOpt = "left";
          } else if (cos < -0.15) {
            alignOpt = "right";
          }
          pdf.text(labelText, outer.x, outer.y + 1, { align: alignOpt as any });
        }

        // Draw legend
        pdf.setFont("times", "normal");
        pdf.setFontSize(7.5);
        pdf.setDrawColor(99, 102, 241);
        pdf.setLineWidth(0.8);
        pdf.line(15, cy + 26, 22, cy + 26);
        pdf.text("Capaian Rata-rata MK", 24, cy + 27);

        pdf.setDrawColor(0, 0, 0); // reset

        currentY = cy + 32;
      } else {
        // Draw horizontal progress bars
        pdf.setFont("times", "bold");
        pdf.setFontSize(8.5);

        mappings.forEach((map: any, i: number) => {
          const barY = currentY + 3 + (i * 12);
          pdf.text(`${map.cpl_code}: ${map.cpl_average}%`, 15, barY);
          
          pdf.setFillColor(235, 235, 235);
          pdf.rect(15, barY + 1.5, 120, 3.5, 'F');
          
          pdf.setFillColor(99, 102, 241);
          pdf.rect(15, barY + 1.5, 120 * ((map.cpl_average || 0) / 100), 3.5, 'F');
        });

        // Draw legend
        const legendY = currentY + 5 + (N * 12);
        pdf.setFont("times", "normal");
        pdf.setFontSize(7.5);
        pdf.setFillColor(99, 102, 241);
        pdf.rect(15, legendY, 5, 2.5, 'F');
        pdf.text("Capaian Rata-rata MK", 22, legendY + 2);

        pdf.setDrawColor(0, 0, 0); // reset

        currentY = legendY + 8;
      }
    }

    // Signature Box
    const signY = 252;
    pdf.setFontSize(9.5);
    pdf.text("Jimbaran, " + formatIndonesianDate(), 142, signY);
    pdf.text("Koordinator Program Studi,", 142, signY + 5);

    if (reportSettings.signatureData) {
      const signatureFormat = reportSettings.signatureData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(reportSettings.signatureData, signatureFormat, 148, signY + 7, 34, 13);
    }

    pdf.setFont("times", "bold");
    pdf.text(reportSettings.headName || 'Nama Kaprodi belum diatur', 165, signY + 23, { align: "center" });
    pdf.setFont("times", "normal");
    pdf.line(142, signY + 24, 188, signY + 24);
    pdf.text(`NIP. ${reportSettings.headNip || '-'}`, 165, signY + 28, { align: "center" });
  };

  const handleDownloadSingleCourseCplReport = (course: any) => {
    showToast(`Mempersiapkan Laporan CPL Mata Kuliah ${course.name}...`);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      drawCourseCplPage(pdf, course, courseReportAngkatan, courseReportKelas);
      pdf.save(`Laporan_CPL_MK_${course.code}_${course.name.replace(/\s+/g, '_')}.pdf`);
      showToast('Unduhan laporan CPL Mata Kuliah berhasil!');
    } catch (e: any) {
      console.error(e);
      showToast('Gagal memproses laporan CPL Mata Kuliah.');
    }
  };

  const handleDownloadAllCourseCplReports = async () => {
    const searchVal = courseReportSearch.trim().toLowerCase();
    const filteredCourses = courseSummaries.filter(c => {
      if (!searchVal) return true;
      return c.code.toLowerCase().includes(searchVal) || c.name.toLowerCase().includes(searchVal);
    });

    if (!filteredCourses || filteredCourses.length === 0) {
      showToast('Tidak ada data mata kuliah untuk dicetak.');
      return;
    }

    if (!await requestConfirmation({
      title: 'Unduh laporan mata kuliah?',
      message: `${filteredCourses.length} laporan mata kuliah akan digabungkan ke dalam satu berkas PDF.`,
      confirmLabel: 'Unduh PDF',
    })) return;

    setBulkDownloadTotal(filteredCourses.length);
    setBulkDownloadProgress(0);
    setBulkDownloadLoading(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      let isFirst = true;

      for (let i = 0; i < filteredCourses.length; i++) {
        const course = filteredCourses[i];
        setBulkDownloadProgress(i + 1);

        if (!isFirst) {
          pdf.addPage();
        }
        isFirst = false;

        drawCourseCplPage(pdf, course, courseReportAngkatan, courseReportKelas);
      }

      const fileLabel = (courseReportAngkatan || 'Semua') + '_' + (courseReportKelas || 'Semua');
      pdf.save(`Laporan_CPL_Semua_Mata_Kuliah_${fileLabel}.pdf`);
      showToast('Berhasil mengunduh semua laporan CPL Mata Kuliah!');
    } catch (e: any) {
      console.error(e);
      showToast('Gagal memproses laporan CPL massal.');
    } finally {
      setBulkDownloadLoading(false);
    }
  };

  const startAssessmentDraft = (offeringId = selectedAssessmentOfferingId) => {
    const assignment = teachingAssignments.find(item => item.courseOfferingId === offeringId);
    if (!assignment) {
      showToast('Pilih penawaran mata kuliah terlebih dahulu.');
      return;
    }
    setSelectedAssessmentOfferingId(offeringId);
    const existingDraft = assessmentPlans.find(plan => plan.courseOfferingId === offeringId && plan.status === 'Draft');
    if (existingDraft) {
      editAssessmentPlan(existingDraft);
      return;
    }
    const courseCpmks = cpmkMasters.filter(cpmk => cpmk.courseId === assignment.courseId);
    if (courseCpmks.length === 0) {
      showToast('Mata kuliah ini belum memiliki CPMK.');
      return;
    }
    const baseWeight = Math.floor((100 / courseCpmks.length) * 100) / 100;
    let assignedWeight = 0;
    const items = courseCpmks.map((cpmk, index) => {
      const weight = index === courseCpmks.length - 1 ? Number((100 - assignedWeight).toFixed(2)) : baseWeight;
      assignedWeight += weight;
      return {
        cpmkId: cpmk.id,
        cpmkCode: cpmk.code,
        cplCode: cpmk.cplCode,
        category: 'assignment' as const,
        name: `Asesmen ${cpmk.code}`,
        weight,
        sequence: index + 1,
        isRequired: true,
      };
    });
    setEditingAssessmentPlanId(null);
    setAssessmentDraftItems(items);
  };

  const editAssessmentPlan = (plan: AssessmentPlan) => {
    if (plan.status !== 'Draft') {
      showToast('Rencana yang sudah dipublikasikan tidak dapat diedit.');
      return;
    }
    setSelectedAssessmentOfferingId(plan.courseOfferingId);
    setEditingAssessmentPlanId(plan.id);
    setAssessmentDraftItems(plan.items.map((item, index) => ({ ...item, sequence: index + 1 })));
  };

  const createAssessmentVersion = (plan: AssessmentPlan) => {
    if (assessmentPlans.some(item => item.courseOfferingId === plan.courseOfferingId && item.status === 'Draft')) {
      showToast('Masih ada versi Draf untuk kelas ini. Lanjutkan atau hapus draf tersebut terlebih dahulu.');
      return;
    }
    setSelectedAssessmentOfferingId(plan.courseOfferingId);
    setEditingAssessmentPlanId(null);
    setAssessmentDraftItems(plan.items.map((item, index) => ({ ...item, id: undefined, sequence: index + 1 })));
    showToast('Versi baru dibuat sebagai Draf. Silakan ubah komponennya lalu simpan.');
  };

  const updateAssessmentDraftItem = (index: number, changes: Partial<AssessmentItemDraft>) => {
    setAssessmentDraftItems(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  };

  const saveAssessmentDraft = async () => {
    if (!selectedAssessmentOfferingId || assessmentDraftItems.length === 0) {
      showToast('Rencana asesmen belum memiliki komponen.');
      return;
    }
    setAssessmentSaving(true);
    try {
      const payload = { items: assessmentDraftItems.map((item, index) => ({ ...item, sequence: index + 1 })) };
      if (editingAssessmentPlanId) {
        await apiCall(`/assessment-plans/${editingAssessmentPlanId}`, 'PUT', payload);
      } else {
        await apiCall('/assessment-plans', 'POST', { courseOfferingId: selectedAssessmentOfferingId, ...payload });
      }
      const plans = await apiCall('/assessment-plans');
      setAssessmentPlans(plans);
      setAssessmentDraftItems([]);
      setEditingAssessmentPlanId(null);
      showToast('Draft rencana asesmen berhasil disimpan.');
    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan draft rencana asesmen.');
    } finally {
      setAssessmentSaving(false);
    }
  };

  const publishAssessmentPlan = async (planId: string) => {
    if (!await requestConfirmation({
      title: 'Publikasikan rencana asesmen?',
      message: 'Rencana yang dipublikasikan menjadi acuan input nilai dan tidak dapat diedit langsung. Anda tetap dapat membuat versi baru bila diperlukan.',
      confirmLabel: 'Publikasikan',
    })) return;
    try {
      await apiCall(`/assessment-plans/${planId}/publish`, 'POST');
      setAssessmentPlans(await apiCall('/assessment-plans'));
      showToast('Rencana asesmen berhasil dipublikasikan.');
    } catch (error: any) {
      showToast(error.message || 'Rencana asesmen belum memenuhi aturan publikasi.');
    }
  };

  const syncAssignmentEnrollments = async (assignmentId: string) => {
    try {
      const result = await apiCall(`/teaching-assignments/${assignmentId}/sync-enrollments`, 'POST');
      showToast(`${result.matchedStudents} mahasiswa cocok; ${result.enrollments} peserta terdaftar.`);
    } catch (error: any) {
      showToast(error.message || 'Gagal menyinkronkan peserta kelas.');
    }
  };

  const updateAssignmentPeriodStatus = async (action: 'activate' | 'archive') => {
    const periodLabel = `${selectedAssignmentPeriod.semester} ${selectedAssignmentPeriod.academicYear}`;
    const confirmed = await requestConfirmation({
      title: action === 'activate' ? `Aktifkan ${periodLabel}?` : `Arsipkan ${periodLabel}?`,
      message: action === 'activate'
        ? 'Periode aktif sebelumnya akan ditutup. Dashboard dosen hanya menampilkan kelas dari periode yang baru diaktifkan.'
        : 'Mata kuliah periode ini tidak lagi muncul pada dashboard dosen. Penugasan, nilai, dan laporan tetap tersimpan.',
      confirmLabel: action === 'activate' ? 'Aktifkan Periode' : 'Arsipkan Periode',
      tone: action === 'activate' ? 'primary' : 'warning',
    });
    if (!confirmed) return;

    setAssignmentPeriodSaving(true);
    try {
      const periods = await apiCall(`/teaching-assignment-periods/${action}`, 'POST', selectedAssignmentPeriod);
      setAssignmentPeriods(periods);
      setTeachingAssignments(await apiCall('/teaching-assignments'));
      setExpandedAssignmentLecturerId(null);
      showToast(action === 'activate' ? 'Periode berhasil diaktifkan.' : 'Periode berhasil diarsipkan.');
    } catch (error: any) {
      showToast(error.message || 'Gagal memperbarui periode akademik.');
    } finally {
      setAssignmentPeriodSaving(false);
    }
  };

  const openAssignmentForLecturer = (lecturer: Lecturer) => {
    openAddModal('assignment');
    setAssignmentContextLocked(true);
    setAssignmentStep(3);
    setAssignmentLecturerId(lecturer.id);
    setAssignmentAcademicYear(selectedAssignmentPeriod.academicYear);
    setAssignmentSemester(selectedAssignmentPeriod.semester);
    setAssignmentCohortYear(selectedAssignmentPeriod.academicYear.split('/')[0]);
  };

  const runAdminGradebookWorkflow = async (assignment: TeachingAssignment, action: 'approve' | 'lock' | 'reopen') => {
    let body: Record<string, string> | undefined;
    if (action === 'reopen') {
      const reason = await requestTextInput({
        title: 'Buka kembali buku nilai?',
        message: 'Nilai akan kembali berstatus Draf dan dapat diedit oleh dosen. Alasan dicatat pada riwayat audit.',
        confirmLabel: 'Buka Kembali',
        tone: 'warning',
        inputLabel: 'Alasan pembukaan',
        inputPlaceholder: 'Tuliskan alasan minimal 10 karakter',
        inputMinLength: 10,
      });
      if (!reason) return;
      body = { reason };
    } else {
      const confirmed = await requestConfirmation({
        title: action === 'approve' ? 'Setujui nilai?' : 'Kunci nilai?',
        message: action === 'approve'
          ? 'Nilai yang diajukan dosen akan masuk ke tahap persetujuan sebelum dikunci.'
          : 'Setelah dikunci, dosen tidak dapat mengubah nilai. Admin tetap dapat menggunakan Buka Kembali dengan alasan yang tercatat pada riwayat audit.',
        confirmLabel: action === 'approve' ? 'Setujui' : 'Kunci Nilai',
        tone: action === 'approve' ? 'primary' : 'warning',
      });
      if (!confirmed) return;
    }
    try {
      await apiCall(`/lecturer-gradebooks/${assignment.id}/${action}`, 'POST', body);
      setTeachingAssignments(await apiCall('/teaching-assignments'));
      showToast(action === 'approve' ? 'Nilai disetujui.' : action === 'lock' ? 'Nilai dikunci.' : 'Nilai dibuka kembali menjadi draf.');
    } catch (error: any) {
      showToast(error.message || 'Gagal memproses status nilai.');
    }
  };

  const resetCpmkForm = (courseId = '') => {
    setEditingCpmkId(null);
    setCpmkFormError('');
    setCpmkForm({ courseId, code: '', description: '', cplCode: '', curriculumVersion: selectedCurriculum?.code || '2026', contributionWeight: '', status: 'Aktif' });
  };

  const addCpmkForCourse = (courseId: string) => {
    resetCpmkForm(courseId);
    setShowCpmkModal(true);
  };

  const resetGraduateProfileForm = () => {
    setEditingGraduateProfileId(null);
    setGraduateProfileForm({ code: '', name: '', englishName: '', summary: '', curriculumVersion: selectedCurriculum?.code || '2026', status: 'Aktif', sequence: String(graduateProfiles.length + 1) });
  };

  const editGraduateProfile = (profile: GraduateProfile) => {
    setEditingGraduateProfileId(profile.id);
    setGraduateProfileForm({
      code: profile.code, name: profile.name, englishName: profile.englishName || '', summary: profile.summary,
      curriculumVersion: profile.curriculumVersion, status: profile.status, sequence: String(profile.sequence),
    });
    setShowGraduateProfileModal(true);
  };

  const selectGraduateProfile = (profile: GraduateProfile) => {
    setSelectedGraduateProfileId(profile.id);
    setGraduateProfileMappingDraft({
      coreCplIds: profile.cplMappings.filter(mapping => mapping.type === 'core').map(mapping => mapping.cplId),
      supportingCplIds: profile.cplMappings.filter(mapping => mapping.type === 'supporting').map(mapping => mapping.cplId),
    });
  };

  const saveGraduateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!graduateProfileForm.code || !graduateProfileForm.name || !graduateProfileForm.summary) {
      showToast('Kode, nama, dan ringkasan kemampuan wajib diisi.'); return;
    }
    setGraduateProfileSaving(true);
    try {
      const payload = { ...graduateProfileForm, sequence: Number(graduateProfileForm.sequence) };
      if (editingGraduateProfileId) await apiCall(`/graduate-profiles/${editingGraduateProfileId}`, 'PUT', payload);
      else await apiCall('/graduate-profiles', 'POST', payload);
      setGraduateProfiles(await apiCall('/graduate-profiles'));
      resetGraduateProfileForm();
      setShowGraduateProfileModal(false);
      showToast('Profil lulusan berhasil disimpan.');
    } catch (error: any) { showToast(error.message || 'Gagal menyimpan profil lulusan.'); }
    finally { setGraduateProfileSaving(false); }
  };

  const saveGraduateProfileMapping = async () => {
    const profile = graduateProfiles.find(item => item.id === selectedGraduateProfileId);
    if (!profile) return;
    const cplMappings = [...graduateProfileMappingDraft.coreCplIds.map(cplId => ({ cplId, type: 'core' })), ...graduateProfileMappingDraft.supportingCplIds.map(cplId => ({ cplId, type: 'supporting' }))];
    if (cplMappings.length === 0) { showToast('Pilih minimal satu CPL inti atau pendukung.'); return; }
    setGraduateProfileSaving(true);
    try {
      await apiCall(`/graduate-profiles/${profile.id}`, 'PUT', { code: profile.code, name: profile.name, englishName: profile.englishName, summary: profile.summary, curriculumVersion: profile.curriculumVersion, status: profile.status, sequence: profile.sequence, cplMappings });
      const refreshed = await apiCall('/graduate-profiles');
      setGraduateProfiles(refreshed);
      const updated = refreshed.find((item: GraduateProfile) => item.id === profile.id);
      if (updated) selectGraduateProfile(updated);
      showToast(`Pemetaan ${profile.code} berhasil disimpan.`);
    } catch (error: any) { showToast(error.message || 'Gagal menyimpan pemetaan CPL.'); }
    finally { setGraduateProfileSaving(false); }
  };

  const deleteGraduateProfile = async (profile: GraduateProfile) => {
    if (!await requestConfirmation({ title: 'Hapus profil lulusan?', message: `${profile.code} - ${profile.name} akan dihapus beserta pemetaannya.`, confirmLabel: 'Hapus', tone: 'danger' })) return;
    try { await apiCall(`/graduate-profiles/${profile.id}`, 'DELETE'); setGraduateProfiles(current => current.filter(item => item.id !== profile.id)); showToast('Profil lulusan dihapus.'); }
    catch (error: any) { showToast(error.message || 'Profil lulusan tidak dapat dihapus.'); }
  };

  // ================= GANTI KATA SANDI =================
  const openPasswordModal = () => {
    setPasswordForm({ currentPassword: '', password: '', passwordConfirmation: '' });
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    if (passwordForm.password.length < 10) { setPasswordError('Kata sandi baru minimal 10 karakter.'); return; }
    if (passwordForm.password !== passwordForm.passwordConfirmation) { setPasswordError('Konfirmasi kata sandi baru tidak sama.'); return; }
    setPasswordSaving(true);
    try {
      await apiCall('/me/password', 'PUT', {
        currentPassword: passwordForm.currentPassword,
        password: passwordForm.password,
        password_confirmation: passwordForm.passwordConfirmation,
      });
      setShowPasswordModal(false);
      showToast('Kata sandi berhasil diganti.');
    } catch (error: any) {
      setPasswordError(error.message || 'Kata sandi gagal diganti.');
    } finally {
      setPasswordSaving(false);
    }
  };

  // ================= KURIKULUM =================
  const selectedCurriculum = curricula.find(item => item.id === selectedCurriculumId) || null;

  const applyCurriculumSelection = (list: CurriculumSummary[], preferredId?: string | null) => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(curriculumStorageKey(currentUser?.id)); } catch { stored = null; }
    const candidate = [preferredId, stored].find(id => id && list.some(item => item.id === id));
    const chosen = candidate || list.find(item => item.isDefault)?.id || list[0]?.id || null;
    activeCurriculumId = chosen;
    setSelectedCurriculumId(chosen);
    return chosen;
  };

  const loadCurricula = async (preferredId?: string | null) => {
    const list: CurriculumSummary[] = await apiCall('/curricula');
    setCurricula(list);
    applyCurriculumSelection(list, preferredId ?? selectedCurriculumId);
    return list;
  };

  const changeCurriculum = (curriculumId: string) => {
    activeCurriculumId = curriculumId || null;
    try { window.localStorage.setItem(curriculumStorageKey(currentUser?.id), curriculumId); } catch { /* penyimpanan lokal opsional */ }
    setSelectedCurriculumId(curriculumId || null);
    const chosen = curricula.find(item => item.id === curriculumId);
    if (chosen) showToast(`Sekarang mengelola ${chosen.name}.`);
  };

  const openCurriculumModal = (curriculum?: CurriculumSummary) => {
    setEditingCurriculumId(curriculum?.id || null);
    setCurriculumForm(curriculum ? {
      code: curriculum.code,
      name: curriculum.name,
      cohortFrom: curriculum.cohortFrom ? String(curriculum.cohortFrom) : '',
      cohortTo: curriculum.cohortTo ? String(curriculum.cohortTo) : '',
      status: curriculum.status,
      notes: curriculum.notes || '',
      copyFromId: '',
    } : { ...emptyCurriculumForm, copyFromId: selectedCurriculumId || '' });
    setCurriculumFormError('');
    setShowCurriculumModal(true);
  };

  const saveCurriculum = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!curriculumForm.code.trim() || !curriculumForm.name.trim()) { setCurriculumFormError('Kode dan nama kurikulum wajib diisi.'); return; }
    setCurriculumFormError('');
    setCurriculumSaving(true);
    try {
      const payload = {
        code: curriculumForm.code.trim().toUpperCase(),
        name: curriculumForm.name.trim(),
        cohortFrom: curriculumForm.cohortFrom ? Number(curriculumForm.cohortFrom) : null,
        cohortTo: curriculumForm.cohortTo ? Number(curriculumForm.cohortTo) : null,
        status: curriculumForm.status,
        notes: curriculumForm.notes.trim() || null,
      };
      if (editingCurriculumId) {
        await apiCall(`/curricula/${editingCurriculumId}`, 'PUT', payload);
        await loadCurricula();
        showToast('Kurikulum diperbarui.');
      } else {
        const created = await apiCall('/curricula', 'POST', { ...payload, copyFromId: curriculumForm.copyFromId || null });
        await loadCurricula(created.id);
        try { window.localStorage.setItem(curriculumStorageKey(currentUser?.id), created.id); } catch { /* opsional */ }
        showToast(curriculumForm.copyFromId ? `${created.name} dibuat dan struktur kurikulum lama disalin.` : `${created.name} dibuat.`);
      }
      setShowCurriculumModal(false);
    } catch (error: any) {
      // Ditampilkan di dalam formulir supaya tidak tertutup jendela formulir.
      setCurriculumFormError(error.message || 'Kurikulum gagal disimpan.');
    } finally {
      setCurriculumSaving(false);
    }
  };

  const activateCurriculum = async (curriculum: CurriculumSummary) => {
    if (!await requestConfirmation({
      title: 'Jadikan kurikulum aktif?',
      message: `${curriculum.name} akan menjadi kurikulum aktif prodi. Kurikulum ini otomatis terpilih saat admin prodi masuk.`,
      confirmLabel: 'Jadikan Aktif',
    })) return;
    try {
      const list: CurriculumSummary[] = await apiCall(`/curricula/${curriculum.id}/activate`, 'POST');
      setCurricula(list);
      changeCurriculum(curriculum.id);
    } catch (error: any) { showToast(error.message || 'Kurikulum gagal diaktifkan.'); }
  };

  const deleteCurriculum = async (curriculum: CurriculumSummary) => {
    if (!await requestConfirmation({ title: 'Hapus kurikulum?', message: `${curriculum.name} akan dihapus. Hanya kurikulum yang belum berisi mata kuliah, CPL, atau profil lulusan yang dapat dihapus.`, confirmLabel: 'Hapus', tone: 'danger' })) return;
    try {
      await apiCall(`/curricula/${curriculum.id}`, 'DELETE');
      await loadCurricula(selectedCurriculumId === curriculum.id ? null : selectedCurriculumId);
      showToast('Kurikulum dihapus.');
    } catch (error: any) { showToast(error.message || 'Kurikulum tidak dapat dihapus.'); }
  };

  const periodOptions = React.useMemo(() => {
    const options = [...assignmentPeriods];
    if (!options.some(period => period.academicYear === selectedAssignmentPeriod.academicYear && period.semester === selectedAssignmentPeriod.semester)) {
      options.push({ id: 'baru', academicYear: selectedAssignmentPeriod.academicYear, semester: selectedAssignmentPeriod.semester, status: 'Draft', offeringCount: 0 });
    }
    return options.sort((first, second) => second.academicYear.localeCompare(first.academicYear) || (first.semester === 'Genap' ? -1 : 1));
  }, [assignmentPeriods, selectedAssignmentPeriod]);

  const loadAccountingGraduateProfiles = async () => {
    if (graduateProfiles.length > 0 && !await requestConfirmation({ title: 'Tambahkan profil contoh?', message: 'Profil lulusan sudah tersedia. Sistem hanya akan menambahkan profil contoh yang belum ada.', confirmLabel: 'Tambahkan' })) return;
    const definitions = [
      ['PL-1', 'Staf Akuntansi dan Keuangan', 'Accounting and Finance Officer', 'Mengelola pelaporan keuangan perusahaan jasa, dagang, dan manufaktur (entitas tunggal maupun dengan anak perusahaan), menyajikan informasi laporan keuangan, serta menerapkan akuntansi sektor publik dengan dukungan TIK', ['CPL-4'], ['CPL-1','CPL-2','CPL-3','CPL-7','CPL-8','CPL-10']],
      ['PL-2', 'Staf Pajak', 'Tax Officer', 'Menguasai pemeriksaan, keberatan, dan banding perpajakan serta menghitung, menyetor, dan melaporkan kewajiban pajak perusahaan (PPh Pasal 21-26, PPN, PPnBM)', ['CPL-5'], ['CPL-1','CPL-2','CPL-7','CPL-8']],
      ['PL-3', 'Staf Anggaran', 'Budgeting Officer', 'Menyiapkan, menyusun, dan mengevaluasi anggaran operasional dan keuangan, menganalisis data, dan memilih metode yang sesuai', ['CPL-3'], ['CPL-1','CPL-2','CPL-7','CPL-8','CPL-10']],
      ['PL-4', 'Junior Auditor', 'Anggota/Asisten Pemeriksa', 'Menguasai prosedur audit laporan keuangan dan pengendalian internal, bekerja sama dan berkomunikasi efektif di bawah supervisi senior auditor', ['CPL-6'], ['CPL-1','CPL-2','CPL-7','CPL-8','CPL-9']],
      ['PL-5', 'Staf Akuntan Biaya dan Akuntan Manajemen', 'Cost and Management Accountant Officer', 'Menghitung, menjurnal, menyajikan, dan menganalisis harga pokok produksi dengan metode harga pokok pesanan dan harga pokok proses', ['CPL-3'], ['CPL-1','CPL-2','CPL-4','CPL-7','CPL-8']],
      ['PL-6', 'Staf Analis Sistem', 'System Analyst Officer', 'Menguasai sistem informasi akuntansi dan perangkat lunak akuntansi, serta mengoperasikan aplikasi untuk penyusunan laporan keuangan, anggaran, administrasi perpajakan, dan pengauditan', ['CPL-6','CPL-7'], ['CPL-1','CPL-2','CPL-3','CPL-4','CPL-5','CPL-8','CPL-9']],
    ] as const;
    const byCode = new Map(cpls.map(cpl => [cpl.code, cpl.id]));
    const missing = Array.from(new Set(definitions.flatMap(item => [...item[4], ...item[5]]))).filter(code => !byCode.has(code));
    if (missing.length) { showToast(`CPL belum tersedia: ${missing.join(', ')}.`); return; }
    setGraduateProfileSaving(true);
    try {
      const existingCodes = new Set(graduateProfiles.map(profile => profile.code));
      for (let index = 0; index < definitions.length; index += 1) {
        const [code, name, englishName, summary, coreCodes, supportingCodes] = definitions[index];
        if (existingCodes.has(code)) continue;
        await apiCall('/graduate-profiles', 'POST', { code, name, englishName, summary, curriculumVersion: selectedCurriculum?.code || '2026', status: 'Aktif', sequence: index + 1, cplMappings: [...coreCodes.map(cplCode => ({ cplId: byCode.get(cplCode), type: 'core' })), ...supportingCodes.map(cplCode => ({ cplId: byCode.get(cplCode), type: 'supporting' }))] });
      }
      setGraduateProfiles(await apiCall('/graduate-profiles')); showToast('Enam Profil Lulusan D3 Akuntansi berhasil dimuat.');
    } catch (error: any) { showToast(error.message || 'Gagal memuat data Profil Lulusan.'); }
    finally { setGraduateProfileSaving(false); }
  };

  const editCpmk = (cpmk: CpmkMaster) => {
    setCpmkFormError('');
    setEditingCpmkId(cpmk.id);
    setCpmkForm({
      courseId: cpmk.courseId,
      code: cpmk.code,
      description: cpmk.description,
      cplCode: cpmk.cplCode,
      curriculumVersion: cpmk.curriculumVersion || '',
      contributionWeight: String(cpmk.contributionWeight || 100),
      status: cpmk.status,
    });
    setShowCpmkModal(true);
  };

  const generateCpmkCode = (courseId: string, cplCode: string) => {
    if (!courseId || !cplCode) return '';
    const cplNumber = Number(cplCode.replace('CPL-', ''));
    if (!Number.isInteger(cplNumber) || cplNumber < 1 || cplNumber > 99) return '';

    const editingCpmk = cpmkMasters.find(item => item.id === editingCpmkId);
    if (editingCpmk && editingCpmk.courseId === courseId && editingCpmk.cplCode === cplCode) {
      return editingCpmk.code;
    }

    const prefix = `CPMK${String(cplNumber).padStart(2, '0')}-`;
    const lastSequence = cpmkMasters
      .filter(item => item.courseId === courseId && item.id !== editingCpmkId && item.code.startsWith(prefix))
      .reduce((highest, item) => {
        const sequence = Number(item.code.slice(prefix.length));
        return Number.isInteger(sequence) ? Math.max(highest, sequence) : highest;
      }, 0);

    return `${prefix}${String(lastSequence + 1).padStart(2, '0')}`;
  };

  const selectCplForCpmk = (cplCode: string) => {
    setCpmkFormError('');
    setCpmkForm(current => ({
      ...current,
      cplCode,
      code: generateCpmkCode(current.courseId, cplCode),
    }));
  };

  const selectCourseForCpmk = (courseId: string) => {
    setCpmkFormError('');
    setCpmkForm(current => ({
      ...current,
      courseId,
      code: generateCpmkCode(courseId, current.cplCode),
    }));
  };

  const saveCpmk = async (event: React.FormEvent) => {
    event.preventDefault();
    setCpmkFormError('');
    const course = courses.find(item => item.id === cpmkForm.courseId);
    if (!course || !cpmkForm.code.trim() || !cpmkForm.description.trim() || !cpmkForm.cplCode) {
      setCpmkFormError('Kode CPMK, CPL terkait, dan deskripsi wajib diisi.');
      return;
    }
    const normalizedCode = cpmkForm.code.trim().toUpperCase();
    if (!/^CPMK[0-9]{2}-[0-9]{2}$/.test(normalizedCode)) {
      setCpmkFormError('Format kode belum tepat. Gunakan CPMK diikuti dua digit CPL dan dua digit urutan, misalnya CPMK03-01.');
      return;
    }
    const codeCplNumber = Number(normalizedCode.slice(4, 6));
    const selectedCplNumber = Number(cpmkForm.cplCode.replace('CPL-', ''));
    if (codeCplNumber !== selectedCplNumber) {
      setCpmkFormError(`Kode ${normalizedCode} menunjukkan CPL-${codeCplNumber}. Untuk ${cpmkForm.cplCode}, gunakan kode yang diawali CPMK${String(selectedCplNumber).padStart(2, '0')}, misalnya CPMK${String(selectedCplNumber).padStart(2, '0')}-01.`);
      return;
    }
    setCpmkSaving(true);
    try {
      const payload = {
        courseId: course.id,
        courseCode: course.code,
        code: normalizedCode,
        description: cpmkForm.description.trim(),
        cplCode: cpmkForm.cplCode,
        curriculumVersion: cpmkForm.curriculumVersion.trim() || null,
        status: cpmkForm.status,
      };
      if (editingCpmkId) await apiCall(`/cpmks/${editingCpmkId}`, 'PUT', payload);
      else await apiCall('/cpmks', 'POST', payload);
      setCpmkMasters(await apiCall('/cpmks'));
      resetCpmkForm();
      setShowCpmkModal(false);
      showToast(editingCpmkId ? 'CPMK berhasil diperbarui.' : 'CPMK berhasil ditambahkan.');
    } catch (error: any) {
      setCpmkFormError(error.message || 'Gagal menyimpan CPMK.');
    } finally {
      setCpmkSaving(false);
    }
  };

  const deleteCpmk = async (cpmk: CpmkMaster) => {
    if (!await requestConfirmation({ title: 'Hapus CPMK?', message: `${cpmk.code} akan dihapus dari ${cpmk.courseName}.`, confirmLabel: 'Hapus', tone: 'danger' })) return;
    try {
      await apiCall(`/cpmks/${cpmk.id}`, 'DELETE');
      setCpmkMasters(current => current.filter(item => item.id !== cpmk.id));
      if (editingCpmkId === cpmk.id) resetCpmkForm();
      showToast('CPMK berhasil dihapus.');
    } catch (error: any) {
      showToast(error.message || 'CPMK tidak dapat dihapus karena sudah digunakan.');
    }
  };

  const updateGradebookDraft = (enrollmentId: string, itemId: string, changes: Partial<GradebookScoreDraft>) => {
    const key = `${enrollmentId}:${itemId}`;
    setGradebookScoreDrafts(current => {
      const previous = current[key] || { score: '', eligibilityStatus: 'eligible' as const, note: '' };
      return { ...current, [key]: { ...previous, ...changes } };
    });
  };

  const openGradebookAssignment = (assignmentId: string) => {
    setGradebookData(null);
    setGradebookScoreDrafts({});
    setSelectedGradebookAssignmentId(assignmentId);
  };

  const closeGradebookAssignment = () => {
    setSelectedGradebookAssignmentId('');
    setGradebookData(null);
    setGradebookScoreDrafts({});
  };

  const downloadGradebookTemplate = () => {
    if (!gradebookData) return;
    const items = gradebookData.plan.items as any[];
    const headerRows: any[][] = [
      ['', '', '', ...items.map(item => item.id), '', ''],
      ['NO', 'NIM', 'NAMA MAHASISWA', ...items.map(item => item.cplCode || 'CPL'), 'NILAI AKHIR', 'NH'],
      ['', '', '', ...items.map(item => item.cpmkCode || 'CPMK'), '', ''],
      ['', '', '', ...items.map(item => `${item.name} (${Number(item.weight)}%)`), '', ''],
    ];
    const dataRows = gradebookData.students.map((student: any, index: number) => {
      const scoreCells = items.map(item => {
        const draft = gradebookScoreDrafts[`${student.enrollmentId}:${item.id}`];
        return draft?.score === '' || draft?.score === undefined ? null : Number(draft.score);
      });
      const excelRow = index + 5;
      const weightedFormula = items.map((item, itemIndex) => `${XLSX.utils.encode_col(3 + itemIndex)}${excelRow}*${Number(item.weight) / 100}`).join('+');
      return [index + 1, student.nim, student.name, ...scoreCells, { f: weightedFormula || '0' }, ''];
    });
    const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);
    const merges: any[] = [
      { s: { r: 1, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 1, c: 1 }, e: { r: 3, c: 1 } },
      { s: { r: 1, c: 2 }, e: { r: 3, c: 2 } },
      { s: { r: 1, c: 3 + items.length }, e: { r: 3, c: 3 + items.length } },
      { s: { r: 1, c: 4 + items.length }, e: { r: 3, c: 4 + items.length } },
    ];
    const addGroupedMerges = (row: number, key: (item: any) => string) => {
      let start = 0;
      while (start < items.length) {
        let end = start;
        while (end + 1 < items.length && key(items[end + 1]) === key(items[start])) end += 1;
        if (end > start) merges.push({ s: { r: row, c: 3 + start }, e: { r: row, c: 3 + end } });
        start = end + 1;
      }
    };
    addGroupedMerges(1, item => item.cplCode || 'CPL');
    addGroupedMerges(2, item => item.cpmkId || item.cpmkCode || 'CPMK');
    worksheet['!merges'] = merges;
    worksheet['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 34 }, ...items.map(() => ({ wch: 18 })), { wch: 14 }, { wch: 8 }];
    worksheet['!rows'] = [{ hidden: true }, { hpt: 28 }, { hpt: 24 }, { hpt: 36 }];

    const metadata = [
      ['templateVersion', '1'],
      ['assignmentId', gradebookData.assignment.id],
      ['assessmentPlanId', gradebookData.plan.id],
      ['assessmentPlanVersion', gradebookData.plan.version],
      [],
      ['column', 'assessmentItemId', 'cpmkCode', 'cplCode', 'weight'],
      ...items.map((item, index) => [index + 4, item.id, item.cpmkCode, item.cplCode, item.weight]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'NILAI');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadata), '__META');
    workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] } as any;
    const safeName = `${gradebookData.assignment.courseCode}_${gradebookData.assignment.className}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
    XLSX.writeFile(workbook, `Template_Nilai_OBE_${safeName}.xlsx`);
  };

  const importGradebookTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !gradebookData) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const metadataSheet = workbook.Sheets.__META;
      const scoreSheet = workbook.Sheets.NILAI;
      if (!metadataSheet || !scoreSheet) throw new Error('File bukan template nilai yang dihasilkan sistem.');
      const metadata = XLSX.utils.sheet_to_json(metadataSheet, { header: 1, raw: false }) as any[][];
      const assignmentId = metadata.find(row => row[0] === 'assignmentId')?.[1];
      const planId = metadata.find(row => row[0] === 'assessmentPlanId')?.[1];
      if (assignmentId !== gradebookData.assignment.id || planId !== gradebookData.plan.id) {
        throw new Error('Template berasal dari kelas atau versi rencana asesmen yang berbeda.');
      }
      const itemColumns = new Map<string, string>();
      metadata.slice(6).forEach(row => {
        if (row[0] && row[1]) itemColumns.set(String(row[0]), String(row[1]));
      });
      const rows = XLSX.utils.sheet_to_json(scoreSheet, { header: 1, raw: true, defval: null }) as any[][];
      const studentsByNim = new Map(gradebookData.students.map((student: any) => [String(student.nim).trim(), student]));
      let importedScores = 0;
      let unmatchedStudents = 0;
      const nextDrafts = { ...gradebookScoreDrafts };
      rows.slice(4).forEach(row => {
        const student: any = studentsByNim.get(String(row[1] ?? '').trim());
        if (!student) {
          if (row[1]) unmatchedStudents += 1;
          return;
        }
        itemColumns.forEach((itemId, oneBasedColumn) => {
          const value = row[Number(oneBasedColumn) - 1];
          if (value === null || value === undefined || String(value).trim() === '') return;
          const score = Number(value);
          if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error(`Nilai ${value} untuk NIM ${student.nim} harus berada pada rentang 0-100.`);
          const key = `${student.enrollmentId}:${itemId}`;
          nextDrafts[key] = { ...(nextDrafts[key] || { eligibilityStatus: 'eligible', note: '' }), score: String(score) };
          importedScores += 1;
        });
      });
      setGradebookScoreDrafts(nextDrafts);
      showToast(`${importedScores} nilai dimuat ke draf${unmatchedStudents ? `; ${unmatchedStudents} NIM tidak ditemukan` : ''}. Periksa lalu klik Simpan Draf.`);
    } catch (error: any) {
      showToast(error.message || 'Template Excel tidak dapat diproses.');
    }
  };

  const getGradebookCpmkStatistics = () => {
    if (!gradebookData) return [];
    const groups = new Map<string, any[]>();
    gradebookData.plan.items.forEach((item: any) => {
      const group = groups.get(item.cpmkCode) || [];
      group.push(item);
      groups.set(item.cpmkCode, group);
    });
    return Array.from(groups.entries()).map(([code, items]) => {
      const scores = gradebookData.students.flatMap((student: any) => {
        const values = items.map(item => gradebookScoreDrafts[`${student.enrollmentId}:${item.id}`]?.score ?? '');
        if (values.some(value => String(value).trim() === '')) return [];
        const totalWeight = items.reduce((sum, item) => sum + Number(item.weight), 0);
        const score = totalWeight > 0
          ? items.reduce((sum, item, index) => sum + Number(values[index]) * Number(item.weight), 0) / totalWeight
          : 0;
        return [score];
      });
      const average = scores.length ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length : null;
      return { code, cplCode: items[0]?.cplCode, measured: scores.length, passed: scores.filter((score: number) => score >= 65).length, average };
    });
  };

  const getLiveStudentFinalScore = (student: any) => {
    if (!gradebookData) return { value: null as number | null, complete: false };
    const items = gradebookData.plan.items as any[];
    const values = items.map(item => gradebookScoreDrafts[`${student.enrollmentId}:${item.id}`]?.score ?? '');
    const hasAnyValue = values.some(value => String(value).trim() !== '');
    if (!hasAnyValue) return { value: null as number | null, complete: false };
    const weightedScore = items.reduce((sum, item, index) => {
      const rawValue = String(values[index]).trim();
      return sum + (rawValue === '' ? 0 : Number(rawValue)) * Number(item.weight) / 100;
    }, 0);
    return {
      value: Math.round(weightedScore * 100) / 100,
      complete: values.every(value => String(value).trim() !== ''),
    };
  };

  const saveGradebookAnalysis = async () => {
    if (!selectedGradebookAssignmentId) return;
    setGradebookSaving(true);
    try {
      const detail = await apiCall(`/lecturer-gradebooks/${selectedGradebookAssignmentId}/analysis`, 'PUT', { analysis: gradebookAnalysis.trim() || null });
      setGradebookData(detail);
      showToast('Analisis CPMK berhasil disimpan.');
    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan analisis CPMK.');
    } finally {
      setGradebookSaving(false);
    }
  };

  const saveGradebookScores = async () => {
    if (!gradebookData || !selectedGradebookAssignmentId) return;
    setGradebookSaving(true);
    try {
      const scores = gradebookData.students.flatMap((student: any) => gradebookData.plan.items.map((item: any) => {
        const draft = gradebookScoreDrafts[`${student.enrollmentId}:${item.id}`] || { score: '', eligibilityStatus: 'eligible', note: '' };
        return {
          enrollmentId: student.enrollmentId,
          assessmentItemId: item.id,
          score: draft.score.trim() === '' ? null : Number(draft.score),
          eligibilityStatus: 'eligible',
          note: draft.note || null,
        };
      }));
      const detail = await apiCall(`/lecturer-gradebooks/${selectedGradebookAssignmentId}/scores`, 'PUT', { scores });
      setGradebookData(detail);
      setGradebookAssignments(await apiCall('/lecturer-gradebooks'));
      showToast('Nilai berhasil disimpan sebagai draft.');
    } catch (error: any) {
      showToast(error.message || 'Gagal menyimpan nilai.');
    } finally {
      setGradebookSaving(false);
    }
  };

  const runGradebookWorkflow = async (action: 'submit' | 'approve') => {
    if (!selectedGradebookAssignmentId) return;
    const label = action === 'submit' ? 'mengajukan nilai' : 'menyetujui nilai';
    if (!await requestConfirmation({
      title: action === 'submit' ? 'Ajukan nilai?' : 'Setujui nilai?',
      message: action === 'submit' ? 'Pastikan seluruh nilai dan analisis CPMK sudah lengkap sebelum diajukan.' : 'Nilai akan diteruskan ke tahap penguncian.',
      confirmLabel: action === 'submit' ? 'Ajukan Nilai' : 'Setujui',
    })) return;
    setGradebookSaving(true);
    try {
      const detail = await apiCall(`/lecturer-gradebooks/${selectedGradebookAssignmentId}/${action}`, 'POST');
      setGradebookData(detail);
      setGradebookAssignments(await apiCall('/lecturer-gradebooks'));
      showToast(action === 'submit' ? 'Nilai berhasil diajukan kepada admin jurusan.' : 'Nilai berhasil disetujui.');
    } catch (error: any) {
      showToast(error.message || `Gagal ${label}.`);
    } finally {
      setGradebookSaving(false);
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
      } else if (modalType === 'lecturer') {
        if (!lecturerFormName.trim() || !lecturerFormEmail.trim() || !lecturerFormEmployeeNumber.trim() || (!editingId && !lecturerFormPassword)) {
          setModalError('Nama, email, NIP/NIDN, dan password wajib diisi.');
          return;
        }
        const departmentId = currentUser?.role === 'super_admin'
          ? lecturerFormDeptId
          : currentUser?.department_id || currentUser?.departmentId;
        if (!departmentId) {
          setModalError('Pilih jurusan untuk dosen.');
          return;
        }

        const payload = {
          name: lecturerFormName.trim(),
          email: lecturerFormEmail.trim(),
          password: lecturerFormPassword || undefined,
          employee_number: lecturerFormEmployeeNumber.trim(),
          departmentId,
          status: lecturerFormStatus,
        };

        if (modalAction === 'add') {
          await apiCall('/lecturers', 'POST', payload);
          showToast('Akun dosen berhasil dibuat.');
        } else {
          await apiCall(`/lecturers/${editingId}`, 'PUT', payload);
          showToast('Data dosen berhasil diperbarui.');
        }

        const list = await apiCall('/lecturers');
        setLecturers(list);
      } else if (modalType === 'assignment') {
        if (modalAction === 'add') {
          if (!assignmentLecturerId || !assignmentCourseId || !assignmentClassName.trim() || !assignmentCohortYear || !assignmentAcademicYear) {
            setModalError('Dosen, mata kuliah, kelas, angkatan, dan tahun ajaran wajib diisi.');
            return;
          }
          await apiCall('/teaching-assignments', 'POST', {
            lecturerId: assignmentLecturerId,
            courseId: assignmentCourseId,
            className: assignmentClassName.trim(),
            cohortYear: Number(assignmentCohortYear),
            academicYear: assignmentAcademicYear.trim(),
            semester: assignmentSemester,
            status: assignmentStatus,
          });
          showToast('Penugasan dosen berhasil dibuat.');
        } else {
          await apiCall(`/teaching-assignments/${editingId}`, 'PUT', {
            status: assignmentStatus,
          });
          showToast('Penugasan dosen berhasil diperbarui.');
        }
        const list = await apiCall('/teaching-assignments');
        setTeachingAssignments(list);
        setAssignmentPeriods(await apiCall('/teaching-assignment-periods'));
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
        if (!courseFormCode.trim() || !courseFormName.trim() || !courseFormSks || !courseFormSemester) {
          setModalError('Harap isi semua kolom.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/courses', 'POST', {
            code: courseFormCode,
            name: courseFormName,
            sks: courseFormSks,
            semester: courseFormSemester,
          });
          showToast('Mata kuliah berhasil ditambahkan.');
        } else {
          await apiCall(`/courses/${editingId}`, 'PUT', {
            code: courseFormCode,
            name: courseFormName,
            sks: courseFormSks,
            semester: courseFormSemester,
          });
          showToast('Mata kuliah berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/courses');
        setCourses(list);
      } else if (modalType === 'cpl') {
        if (!cplFormCode.trim() || !cplFormDesc.trim()) {
          setModalError('Harap isi semua kolom.');
          return;
        }
        if (!/^CPL-[1-9][0-9]*$/i.test(cplFormCode.trim())) {
          setModalError('Kode CPL harus menggunakan format CPL-1, CPL-2, dan seterusnya.');
          return;
        }
        if (modalAction === 'add') {
          await apiCall('/cpl', 'POST', {
            code: cplFormCode.toUpperCase(),
            description: cplFormDesc,
            targetValue: 75,
          });
          showToast('CPL berhasil ditambahkan.');
        } else {
          await apiCall(`/cpl/${editingId}`, 'PUT', {
            code: cplFormCode.toUpperCase(),
            description: cplFormDesc,
            targetValue: 75,
          });
          showToast('CPL berhasil diperbarui.');
        }
        // Refresh
        const list = await apiCall('/cpl');
        setCpls(list);
      } else if (modalType === 'grade') {
        if (!gradeFormCourseId || !gradeFormScore || !gradeFormLetter || !gradeFormSemester || !gradeFormYear) {
          setModalError('Pilih mata kuliah, masukkan nilai angka, nilai huruf, semester, dan tahun akademik.');
          return;
        }
        const score = Number(String(gradeFormScore).replace(',', '.'));
        if (isNaN(score) || score < 0 || score > 100) {
          setModalError('Nilai angka harus di antara 0 dan 100.');
          return;
        }

        if (modalAction === 'add') {
          await apiCall('/grades', 'POST', {
            studentId: selectedStudentId,
            courseId: gradeFormCourseId,
            grade: gradeFormLetter,
            score: score,
            semester: gradeFormSemester,
            academicYear: gradeFormYear,
          });
          showToast('Data nilai berhasil disimpan.');
        } else {
          await apiCall(`/grades/${editingId}`, 'PUT', {
            studentId: selectedStudentId,
            courseId: gradeFormCourseId,
            grade: gradeFormLetter,
            score: score,
            semester: gradeFormSemester,
            academicYear: gradeFormYear,
          });
          showToast('Data nilai berhasil diperbarui.');
        }
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
      } else if (type === 'lecturer') {
        await apiCall(`/lecturers/${id}`, 'DELETE');
        showToast('Akun dosen berhasil dihapus.');
        setLecturers(lecturers.filter(lecturer => lecturer.id !== id));
      } else if (type === 'assignment') {
        await apiCall(`/teaching-assignments/${id}`, 'DELETE');
        showToast('Penugasan dosen berhasil dihapus.');
        setTeachingAssignments(teachingAssignments.filter(assignment => assignment.id !== id));
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
    } else if (type === 'lecturer') {
      setLecturerFormName('');
      setLecturerFormEmail('');
      setLecturerFormPassword('');
      setLecturerFormEmployeeNumber('');
      setLecturerFormDeptId(currentUser?.role === 'admin_jurusan'
        ? currentUser?.department_id || currentUser?.departmentId || ''
        : departments[0]?.id || '');
      setLecturerFormStatus('Aktif');
    } else if (type === 'assignment') {
      setAssignmentContextLocked(false);
      setAssignmentStep(1);
      setAssignmentLecturerId('');
      setAssignmentCourseId('');
      setAssignmentClassName('');
      setAssignmentCohortYear(String(new Date().getFullYear()));
      setAssignmentAcademicYear(`${new Date().getFullYear()}/${new Date().getFullYear() + 1}`);
      setAssignmentSemester('Ganjil');
      setAssignmentStatus('Aktif');
    } else if (type === 'student') {
      setStudentFormNim('');
      setStudentFormName('');
      setStudentFormAngkatan('2024');
      setStudentFormKelas('');
      setStudentFormStatus('Aktif');
    } else if (type === 'course') {
      setCourseFormCode('');
      setCourseFormName('');
      setCourseFormSks(3);
      setCourseFormSemester(1);
    } else if (type === 'cpl') {
      setCplFormCode('');
      setCplFormDesc('');
      setCplFormTarget(75);
    } else if (type === 'grade') {
      const defaultCourseId = courses[0]?.id || '';
      setGradeFormCourseId(defaultCourseId);
      setGradeFormScore('80');
      setGradeFormLetter('AB');
      setGradeFormSemester(getDefaultGradeSemester(defaultCourseId));
      setGradeFormYear(getActiveAcademicPeriod().academicYear);
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
      setAdminFormDeptId(item.department_id || item.departmentId || '');
    } else if (type === 'lecturer') {
      setLecturerFormName(item.name);
      setLecturerFormEmail(item.email);
      setLecturerFormPassword('');
      setLecturerFormEmployeeNumber(item.employeeNumber || item.employee_number || '');
      setLecturerFormDeptId(item.departmentId || item.department_id || '');
      setLecturerFormStatus(item.status || 'Aktif');
    } else if (type === 'assignment') {
      setAssignmentContextLocked(false);
      setAssignmentStep(3);
      setAssignmentLecturerId(item.lecturerId);
      setAssignmentCourseId(item.courseId);
      setAssignmentClassName(item.className);
      setAssignmentCohortYear(String(item.cohortYear));
      setAssignmentAcademicYear(item.academicYear);
      setAssignmentSemester(item.semester);
      setAssignmentStatus(item.status);
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
      setCourseFormSemester(Number(item.semester || 1));
    } else if (type === 'cpl') {
      setCplFormCode(item.code);
      setCplFormDesc(item.description);
      setCplFormTarget(item.targetValue);
    } else if (type === 'grade') {
      setGradeFormCourseId(item.course_id || item.courseId || '');
      setGradeFormScore(String(item.score !== null && item.score !== undefined ? (item.score <= 10 ? item.score * 10 : item.score) : '80'));
      setGradeFormLetter(item.grade || 'AB');
      setGradeFormSemester(item.semester || 'IV');
      setGradeFormYear(item.academicYear || item.academic_year || '2024/2025');
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

  const availableClassNames = React.useMemo(() => Array.from(new Set([
    'A', 'B', 'C', 'D',
    ...uniqueKelasList,
    ...teachingAssignments.map(item => item.className).filter(Boolean),
  ])).sort(), [uniqueKelasList, teachingAssignments]);

  const selectedAssignmentPeriodRecord = assignmentPeriods.find(period =>
    period.academicYear === selectedAssignmentPeriod.academicYear
    && period.semester === selectedAssignmentPeriod.semester
  );
  const periodTeachingAssignments = teachingAssignments.filter(assignment =>
    assignment.academicYear === selectedAssignmentPeriod.academicYear
    && assignment.semester === selectedAssignmentPeriod.semester
  );
  const assignmentAcademicYearOptions = React.useMemo(() => Array.from(new Set([
    ...assignmentPeriods.map(period => period.academicYear),
    ...Array.from({ length: 7 }, (_, index) => {
      const year = getActiveAcademicPeriod().academicStartYear - 2 + index;
      return `${year}/${year + 1}`;
    }),
  ])).sort().reverse(), [assignmentPeriods]);
  const activeAssignmentLecturers = React.useMemo(() => lecturers
    .filter(lecturer => lecturer.status === 'Aktif')
    .sort((first, second) => first.name.localeCompare(second.name, 'id')), [lecturers]);

  // Get unique Angkatan values dynamically from students
  const uniqueAngkatanList = React.useMemo(() => {
    if (!Array.isArray(students)) return [];
    const list = students.map(s => s ? s.angkatan : '').filter(Boolean);
    return Array.from(new Set(list)).sort((a, b) => Number(b) - Number(a)); // Sort descending
  }, [students]);

  const getDefaultGradeSemester = (courseId?: string) => {
    const selectedCourse = courses.find(course => course.id === courseId);
    if (selectedCourse?.semester) {
      return String(selectedCourse.semester);
    }

    const selectedStudent = students.find(student => student.id === selectedStudentId);
    return String(getCurrentStudentSemester(selectedStudent?.angkatan));
  };

  const cplMatrixSemesterLabel = cplMatrixSemesterType
    ? cplMatrixSemesterType.charAt(0).toUpperCase() + cplMatrixSemesterType.slice(1)
    : 'Semua Periode';

  const cplMatrixReportFileName = React.useMemo(() => {
    const parts = [
      'Laporan_Capaian_CPL',
      cplMatrixAngkatan || 'Semua_Angkatan',
      cplMatrixKelas || 'Semua_Kelas',
      cplMatrixSemesterType || 'Semua_Periode',
      cplMatrixAcademicYear || 'Semua_Tahun',
    ];

    return parts.join('_').replace(/[^\w-]+/g, '_');
  }, [cplMatrixAngkatan, cplMatrixKelas, cplMatrixSemesterType, cplMatrixAcademicYear]);

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

  // Pagination calculations for courses
  const totalCourses = filteredCourses.length;
  const totalCoursePages = Math.ceil(totalCourses / courseItemsPerPage) || 1;
  const indexOfLastCourse = coursePage * courseItemsPerPage;
  const indexOfFirstCourse = indexOfLastCourse - courseItemsPerPage;
  const currentCourses = filteredCourses.slice(indexOfFirstCourse, indexOfLastCourse);

  // Pagination and filtering calculations for student list inside input nilai
  const filteredGradeStudents = React.useMemo(() => {
    return students.filter(s => {
      const matchSearch = gradeStudentSearch === '' || s.name.toLowerCase().includes(gradeStudentSearch.toLowerCase()) || s.nim.includes(gradeStudentSearch);
      const matchAngkatan = gradeStudentAngkatan === '' || s.angkatan === gradeStudentAngkatan;
      const matchKelas = gradeStudentKelas === '' || s.kelas === gradeStudentKelas;
      return matchSearch && matchAngkatan && matchKelas;
    });
  }, [students, gradeStudentSearch, gradeStudentAngkatan, gradeStudentKelas]);

  const totalGradeStudents = filteredGradeStudents.length;
  const totalGradeStudentPages = Math.ceil(totalGradeStudents / gradeStudentItemsPerPage) || 1;
  const indexOfLastGradeStudent = gradeStudentPage * gradeStudentItemsPerPage;
  const indexOfFirstGradeStudent = indexOfLastGradeStudent - gradeStudentItemsPerPage;
  const currentGradeStudents = filteredGradeStudents.slice(indexOfFirstGradeStudent, indexOfLastGradeStudent);

  useEffect(() => {
    setStudentPage(1);
    setSelectedStudentIds([]);
  }, [studentSearch, studentFilterAngkatan, studentFilterKelas]);

  useEffect(() => {
    setCoursePage(1);
    setSelectedCourseIds([]);
  }, [courseSearch]);

  useEffect(() => {
    setGradeStudentPage(1);
  }, [gradeStudentSearch, gradeStudentAngkatan, gradeStudentKelas]);

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
    return cplAverages.filter(c => c.status !== 'Belum Diukur');
  }, [cplAverages]);
  const achievedCpls = measuredCpls.filter(c => c.value >= 75);
  const cplTerpenuhiPct = measuredCpls.length > 0 ? Math.round((achievedCpls.length / measuredCpls.length) * 100) : 0;
  const averageCplValue = measuredCpls.length > 0 ? (measuredCpls.reduce((acc, curr) => acc + curr.value, 0) / measuredCpls.length).toFixed(1) : '0.0';
  const graduateProfileAchievements = React.useMemo(() => {
    const valuesByCode = new Map(cplAverages.filter(cpl => cpl.status !== 'Belum Diukur').map(cpl => [cpl.code, Number(cpl.value)]));
    const average = (codes: string[]) => {
      const values = codes.map(code => valuesByCode.get(code)).filter((value): value is number => value !== undefined && Number.isFinite(value));
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    };

    return graduateProfiles
      .filter(profile => profile.status === 'Aktif')
      .sort((a, b) => a.sequence - b.sequence)
      .map(profile => {
        const coreCodes = profile.cplMappings.filter(mapping => mapping.type === 'core').map(mapping => mapping.cplCode);
        const supportingCodes = profile.cplMappings.filter(mapping => mapping.type === 'supporting').map(mapping => mapping.cplCode);
        const allCodes = Array.from(new Set([...coreCodes, ...supportingCodes]));
        const value = average(allCodes);
        const measuredCount = allCodes.filter(code => valuesByCode.has(code)).length;
        return {
          ...profile,
          value,
          coreValue: average(coreCodes),
          supportingValue: average(supportingCodes),
          measuredCount,
          mappedCount: allCodes.length,
          status: value === null ? 'Belum Diukur' : measuredCount < allCodes.length ? 'Belum Lengkap' : value >= 75 ? 'Tercapai' : 'Belum Tercapai',
        };
      });
  }, [cplAverages, graduateProfiles]);
  const assessmentOfferings = React.useMemo(() => {
    const uniqueOfferings = Array.from(new Map(teachingAssignments.map(item => [item.courseOfferingId, item])).values());
    const query = assessmentSearch.trim().toLowerCase();
    return uniqueOfferings
      .map(offering => {
        const plans = assessmentPlans.filter(plan => plan.courseOfferingId === offering.courseOfferingId).sort((a, b) => b.version - a.version);
        const currentPlan = plans.find(plan => plan.status === 'Draft') || plans[0] || null;
        const status: string = currentPlan ? currentPlan.status : 'Belum Dibuat';
        return { ...offering, currentPlan, status, planCount: plans.length };
      })
      .filter(offering => !query || `${offering.courseCode} ${offering.courseName} ${offering.className} ${offering.lecturerName}`.toLowerCase().includes(query))
      .filter(offering => !assessmentStatusFilter || offering.status === assessmentStatusFilter)
      .sort((a, b) => {
        const priority = { 'Belum Dibuat': 0, Draft: 1, Published: 2, Archived: 3 } as Record<string, number>;
        return (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || a.courseName.localeCompare(b.courseName);
      });
  }, [teachingAssignments, assessmentPlans, assessmentSearch, assessmentStatusFilter]);
  const assessmentPageSize = 20;
  const assessmentPageCount = Math.max(1, Math.ceil(assessmentOfferings.length / assessmentPageSize));
  const pagedAssessmentOfferings = assessmentOfferings.slice((assessmentPage - 1) * assessmentPageSize, assessmentPage * assessmentPageSize);

  // Radar categories average computation
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
                    Email
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-[22px]">
                      person
                    </span>
                    <input 
                      className="w-full bg-[#F1F5F9] border-none rounded-full py-[18px] pl-[52px] pr-5 text-gray-800 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0d2a6a]/30 transition-all" 
                      id="email" 
                      placeholder="nama@pnb.ac.id"
                      type="email"
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
                  © {new Date().getFullYear()} <span className="text-[#0d2a6a]">Politeknik Negeri Bali</span>. Hak cipta dilindungi.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // MAIN LAYOUT (LOGGED IN)
  // Bobot CPMK dibagi rata otomatis per mata kuliah (100% / jumlah CPMK aktif); dihitung ulang di server.
  const cpmkActiveCount = cpmkMasters.filter(item => item.courseId === cpmkForm.courseId && item.id !== editingCpmkId && item.status === 'Aktif').length
    + (cpmkForm.status === 'Aktif' ? 1 : 0);
  const cpmkEqualShare = cpmkActiveCount > 0 ? 100 / cpmkActiveCount : 0;
  const cpmkWeightNote = cpmkForm.status === 'Aktif'
    ? `${cpmkActiveCount} CPMK aktif pada mata kuliah ini, masing-masing ${cpmkEqualShare.toFixed(2).replace(/\.00$/, '')}% (total 100%).`
    : `CPMK nonaktif tidak mendapat bobot; ${cpmkActiveCount} CPMK aktif lain dibagi rata.`;

  return (
    <div className="app-shell font-body-base text-body-base selection:bg-primary/30 min-h-screen flex flex-col bg-[#F5F7FB]">
      {/* Topbar */}
      <header className="sticky top-0 z-40 w-full h-[64px] bg-white/95 backdrop-blur-sm flex items-center justify-between px-md lg:px-xl border-b border-outline shadow-sm">
        <div className="flex items-center gap-md">
          <img 
            alt="PNB Logo" 
            className="w-10 h-10 bg-white rounded-lg border border-outline p-1"
            src="https://upload.wikimedia.org/wikipedia/id/e/ed/Logo_Politeknik_Negeri_Bali.png"
          />
          <div>
            <h1 className="font-headline-lg text-on-surface font-bold leading-tight">SI-CPL Terintegrasi</h1>
            <p className="font-label-xs text-on-surface-variant leading-tight hidden sm:block">Politeknik Negeri Bali</p>
          </div>
        </div>
        <div className="flex items-center gap-sm lg:gap-md">
          {currentUser?.role === 'admin_jurusan' && (
            <div className="hidden md:flex items-center gap-sm" aria-label="Konteks kerja">
              <label className="flex items-center gap-xs rounded-lg border border-outline-variant bg-surface-container-low px-sm py-[3px]" title={selectedCurriculum ? `${selectedCurriculum.name} · ${curriculumCohortLabel(selectedCurriculum)}` : 'Kurikulum yang sedang dikelola'}>
                <span className="material-symbols-outlined text-[18px] text-primary">menu_book</span>
                <span className="flex flex-col leading-tight">
                  <span className="font-label-xs text-on-surface-variant">Kurikulum</span>
                  <select aria-label="Pilih kurikulum yang dikelola" className="max-w-[170px] bg-transparent font-label-sm font-bold text-on-surface focus:outline-none" value={selectedCurriculumId || ''} onChange={event => changeCurriculum(event.target.value)} disabled={curricula.length === 0}>
                    {curricula.length === 0 && <option value="">Belum ada</option>}
                    {curricula.map(curriculum => <option key={curriculum.id} value={curriculum.id}>{curriculum.name}{curriculum.isDefault ? ' (aktif)' : ''}{curriculum.status === 'Nonaktif' ? ' – nonaktif' : ''}</option>)}
                  </select>
                </span>
              </label>
              <label className="flex items-center gap-xs rounded-lg border border-outline-variant bg-surface-container-low px-sm py-[3px]" title="Periode akademik untuk penugasan dosen dan penilaian">
                <span className="material-symbols-outlined text-[18px] text-primary">calendar_month</span>
                <span className="flex flex-col leading-tight">
                  <span className="font-label-xs text-on-surface-variant">Periode</span>
                  <select aria-label="Pilih periode akademik" className="max-w-[170px] bg-transparent font-label-sm font-bold text-on-surface focus:outline-none" value={`${selectedAssignmentPeriod.academicYear}|${selectedAssignmentPeriod.semester}`} onChange={event => {
                    const [academicYear, semester] = event.target.value.split('|');
                    setSelectedAssignmentPeriod({ academicYear, semester: semester as 'Ganjil' | 'Genap' });
                    setExpandedAssignmentLecturerId(null);
                  }}>
                    {periodOptions.map(period => <option key={`${period.academicYear}|${period.semester}`} value={`${period.academicYear}|${period.semester}`}>{period.semester} {period.academicYear}{period.status === 'Aktif' ? ' • aktif' : period.status === 'Selesai' ? ' • arsip' : period.id === 'baru' ? ' • belum dibuat' : ''}</option>)}
                  </select>
                </span>
              </label>
            </div>
          )}
          <div className="hidden md:flex items-center gap-sm px-sm py-xs rounded-lg bg-surface-container-low">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><span className="material-symbols-outlined text-[18px]">person</span></div>
            <div className="leading-tight"><p className="font-label-sm font-bold text-on-surface">{currentUser?.name}</p><p className="font-label-xs text-on-surface-variant">{currentUser?.role === 'admin_jurusan' ? 'Admin Jurusan' : currentUser?.role === 'dosen' ? 'Dosen' : 'Super Admin'}</p></div>
          </div>
          <button
            onClick={openPasswordModal}
            title="Ganti kata sandi"
            aria-label="Ganti kata sandi"
            className="w-9 h-9 grid place-items-center border border-outline rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[19px]">key</span>
          </button>
          <button 
            onClick={handleLogout} 
            title="Keluar"
            className="w-9 h-9 grid place-items-center border border-outline rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container transition-colors"
          >
            <span className="material-symbols-outlined text-[19px]">logout</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* SideNavBar */}
        <aside className="sticky top-[64px] h-[calc(100vh-64px)] w-[248px] bg-white border-r border-outline overflow-y-auto flex flex-col py-md z-30 shrink-0">
          <div className="px-md pb-sm mb-sm border-b border-outline/70"><p className="font-label-xs text-on-surface-variant font-bold uppercase">Menu Utama</p></div>
          <nav className="flex-1 px-sm space-y-unit custom-scrollbar">
            {currentUser?.role === 'super_admin' ? (
              <>
                {/* Departments CRUD */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'departments' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => navigateToTab('departments')}
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
                  onClick={() => navigateToTab('admins')}
                >
                  <span className="material-symbols-outlined">admin_panel_settings</span>
                  <span>Admin Jurusan</span>
                </button>

                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'lecturers'
                      ? 'text-primary font-bold bg-primary/5'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => navigateToTab('lecturers')}
                >
                  <span className="material-symbols-outlined">school</span>
                  <span>Dosen</span>
                </button>

              </>
            ) : currentUser?.role === 'admin_jurusan' ? (
              <>
                {/* Dashboard Tab */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'dashboard' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => navigateToTab('dashboard')}
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
                  onClick={() => navigateToTab('mahasiswa')}
                >
                  <span className="material-symbols-outlined">group</span>
                  <span>Mahasiswa</span>
                </button>

                {/* Kurikulum */}
                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${activeTab === 'curricula' ? 'text-primary font-bold bg-primary/5' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
                  onClick={() => navigateToTab('curricula')}
                >
                  <span className="material-symbols-outlined">menu_book</span>
                  <span>Kurikulum</span>
                </button>

                {/* Mata Kuliah */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'matakuliah' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => navigateToTab('matakuliah')}
                >
                  <span className="material-symbols-outlined">book</span>
                  <span>Mata Kuliah</span>
                </button>

                {/* CPL */}
                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${activeTab === 'graduate_profiles' ? 'text-primary font-bold bg-primary/5' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
                  onClick={() => navigateToTab('graduate_profiles')}
                >
                  <span className="material-symbols-outlined">badge</span>
                  <span>Profil Lulusan</span>
                </button>

                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'cpl' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => navigateToTab('cpl')}
                >
                  <span className="material-symbols-outlined">verified</span>
                  <span>CPL</span>
                </button>

                {/* Input Nilai (admin) */}
                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'nilai'
                      ? 'text-primary font-bold bg-primary/5'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => navigateToTab('nilai')}
                >
                  <span className="material-symbols-outlined">edit_square</span>
                  <span>Input Nilai</span>
                </button>

                {/* Hasil CPL */}
                <button 
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'hasil_cpl' 
                      ? 'text-primary font-bold bg-primary/5' 
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`} 
                  onClick={() => navigateToTab('hasil_cpl')}
                >
                  <span className="material-symbols-outlined">analytics</span>
                  <span>Hasil CPL</span>
                </button>

                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'report_settings'
                      ? 'text-primary font-bold bg-primary/5'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => navigateToTab('report_settings')}
                >
                  <span className="material-symbols-outlined">settings</span>
                  <span>Pengaturan Laporan</span>
                </button>

                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'lecturers'
                      ? 'text-primary font-bold bg-primary/5'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => navigateToTab('lecturers')}
                >
                  <span className="material-symbols-outlined">school</span>
                  <span>Dosen</span>
                </button>

                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'teaching_assignments'
                      ? 'text-primary font-bold bg-primary/5'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => navigateToTab('teaching_assignments')}
                >
                  <span className="material-symbols-outlined">assignment_ind</span>
                  <span>Penugasan Dosen</span>
                </button>

                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ease-in-out font-label-sm text-label-sm ${
                    activeTab === 'assessment_plans'
                      ? 'text-primary font-bold bg-primary/5'
                      : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
                  }`}
                  onClick={() => navigateToTab('assessment_plans')}
                >
                  <span className="material-symbols-outlined">fact_check</span>
                  <span>Rencana Asesmen</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left font-label-sm text-label-sm ${activeTab === 'dashboard' ? 'text-primary font-bold bg-primary/5' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                  onClick={() => navigateToTab('dashboard')}
                >
                  <span className="material-symbols-outlined">dashboard</span>
                  <span>Dashboard Dosen</span>
                </button>
                <button
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left font-label-sm text-label-sm ${activeTab === 'gradebook' ? 'text-primary font-bold bg-primary/5' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                  onClick={() => navigateToTab('gradebook')}
                >
                  <span className="material-symbols-outlined">edit_square</span>
                  <span>Input Nilai CPMK</span>
                </button>
              </>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 h-[calc(100vh-64px)] relative flex flex-col overflow-y-auto bg-[#F5F7FB]">
          <div className="flex-1 max-w-[1440px] mx-auto w-full p-md lg:p-xl flex flex-col gap-lg">
        {/* Toast alert popup */}
        {toastMessage && (
          <div role="status" className="fixed top-20 right-6 z-[200] max-w-md bg-primary-container text-on-primary-container px-lg py-md rounded-xl shadow-2xl border border-primary/20 flex items-center gap-sm animate-bounce">
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

        {currentUser?.role === 'admin_jurusan' && activeTab === 'curricula' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Kurikulum</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Mata kuliah, CPL, CPMK, dan profil lulusan disimpan per kurikulum. Pilih kurikulum yang dikelola di bilah atas.</p>
              </div>
              <button type="button" onClick={() => openCurriculumModal()} className="inline-flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-md font-label-sm font-bold"><span className="material-symbols-outlined text-[18px]">add</span>Tambah Kurikulum</button>
            </div>

            {selectedCurriculum && (
              <section className="app-card p-lg flex flex-col md:flex-row md:items-center justify-between gap-md">
                <div className="flex items-center gap-md">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined">menu_book</span></div>
                  <div>
                    <p className="font-label-xs text-on-surface-variant">Sedang dikelola</p>
                    <p className="font-headline-lg font-bold text-on-surface">{selectedCurriculum.name}</p>
                    <p className="font-label-sm text-on-surface-variant">{curriculumCohortLabel(selectedCurriculum)}{selectedCurriculum.isDefault ? ' · Kurikulum aktif prodi' : ''}</p>
                  </div>
                </div>
                <label className="md:hidden font-label-sm font-bold text-on-surface">Ganti kurikulum
                  <select className="mt-xs w-full rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm font-body-sm" value={selectedCurriculumId || ''} onChange={event => changeCurriculum(event.target.value)}>
                    {curricula.map(curriculum => <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>)}
                  </select>
                </label>
              </section>
            )}

            <section className="app-card overflow-hidden">
              {dataLoading && curricula.length === 0 ? <div className="p-xl text-center text-on-surface-variant">Memuat kurikulum...</div> : curricula.length === 0 ? (
                <div className="p-xl text-center text-on-surface-variant">Belum ada kurikulum. Tambahkan kurikulum pertama untuk prodi ini.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left">
                    <thead><tr className="bg-surface-container border-b border-outline-variant">
                      <th className="px-md py-sm font-label-xs uppercase">Kurikulum</th>
                      <th className="px-md py-sm font-label-xs uppercase">Berlaku</th>
                      <th className="px-md py-sm font-label-xs uppercase">Isi</th>
                      <th className="px-md py-sm font-label-xs uppercase">Status</th>
                      <th className="px-md py-sm font-label-xs uppercase text-right">Aksi</th>
                    </tr></thead>
                    <tbody className="divide-y divide-outline-variant/60">
                      {curricula.map(curriculum => (
                        <tr key={curriculum.id} className={curriculum.id === selectedCurriculumId ? 'bg-primary/[0.04]' : ''}>
                          <td className="px-md py-sm"><p className="font-body-sm font-bold text-on-surface">{curriculum.name}</p><p className="font-label-xs text-primary">{curriculum.code}</p>{curriculum.notes && <p className="font-label-xs text-on-surface-variant mt-[2px] max-w-[280px] truncate" title={curriculum.notes}>{curriculum.notes}</p>}</td>
                          <td className="px-md py-sm font-body-sm">{curriculumCohortLabel(curriculum)}</td>
                          <td className="px-md py-sm font-label-sm text-on-surface-variant">{curriculum.coursesCount ?? 0} MK · {curriculum.cplsCount ?? 0} CPL · {curriculum.graduateProfilesCount ?? 0} PL</td>
                          <td className="px-md py-sm">
                            <div className="flex flex-wrap gap-xs">
                              {curriculum.isDefault && <span className="rounded-full bg-primary/10 px-sm py-[2px] font-label-xs font-bold text-primary">Kurikulum aktif</span>}
                              <span className={`rounded-full px-sm py-[2px] font-label-xs font-bold ${curriculum.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-container text-on-surface-variant'}`}>{curriculum.status === 'Aktif' ? 'Berlaku' : 'Nonaktif'}</span>
                            </div>
                          </td>
                          <td className="px-md py-sm">
                            <div className="flex flex-wrap justify-end gap-xs">
                              <button type="button" disabled={curriculum.id === selectedCurriculumId} onClick={() => changeCurriculum(curriculum.id)} className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-sm py-xs font-label-xs font-bold text-primary disabled:cursor-default disabled:opacity-40"><span className="material-symbols-outlined text-[17px]">edit_note</span>{curriculum.id === selectedCurriculumId ? 'Sedang dikelola' : 'Kelola'}</button>
                              {!curriculum.isDefault && <button type="button" onClick={() => activateCurriculum(curriculum)} className="inline-flex items-center gap-1 rounded-md border border-outline-variant px-sm py-xs font-label-xs font-bold text-on-surface"><span className="material-symbols-outlined text-[17px]">check_circle</span>Jadikan aktif</button>}
                              <button type="button" title="Ubah kurikulum" onClick={() => openCurriculumModal(curriculum)} className="p-xs text-on-surface-variant hover:text-secondary"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                              {!curriculum.isDefault && <button type="button" title="Hapus kurikulum" onClick={() => deleteCurriculum(curriculum)} className="p-xs text-on-surface-variant hover:text-error"><span className="material-symbols-outlined text-[20px]">delete</span></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="font-label-xs text-on-surface-variant">Capaian CPL mahasiswa otomatis dihitung dengan kurikulum yang berlaku untuk angkatannya. Kurikulum aktif adalah kurikulum yang terpilih otomatis saat admin prodi masuk.</p>

            {showCurriculumModal && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" role="dialog" aria-modal="true" aria-labelledby="curriculum-modal-title" onMouseDown={event => { if (event.target === event.currentTarget && !curriculumSaving) setShowCurriculumModal(false); }}>
              <form onSubmit={saveCurriculum} className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-surface rounded-lg shadow-xl border border-outline">
                <div className="sticky top-0 z-10 flex items-center justify-between px-lg py-md bg-surface border-b border-outline"><div><p className="font-label-xs text-primary font-bold">KURIKULUM</p><h4 id="curriculum-modal-title" className="font-headline-xl font-bold text-on-surface">{editingCurriculumId ? 'Ubah Kurikulum' : 'Tambah Kurikulum'}</h4></div><button type="button" disabled={curriculumSaving} onClick={() => setShowCurriculumModal(false)} className="w-8 h-8 grid place-items-center rounded-md text-on-surface-variant hover:bg-surface-container" aria-label="Tutup"><span className="material-symbols-outlined text-[20px]">close</span></button></div>
                <div className="p-lg space-y-md">
                  <div className="grid grid-cols-[130px_1fr] gap-md">
                    <label className="font-label-sm text-on-surface">Kode<input autoFocus className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={curriculumForm.code} placeholder="2026" maxLength={20} onChange={event => setCurriculumForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} /></label>
                    <label className="font-label-sm text-on-surface">Nama Kurikulum<input className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={curriculumForm.name} placeholder="Kurikulum 2026" maxLength={100} onChange={event => setCurriculumForm(current => ({ ...current, name: event.target.value }))} /></label>
                  </div>
                  <div className="grid grid-cols-2 gap-md">
                    <label className="font-label-sm text-on-surface">Berlaku mulai angkatan<input type="number" min="1990" max="2100" className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={curriculumForm.cohortFrom} placeholder="2026" onChange={event => setCurriculumForm(current => ({ ...current, cohortFrom: event.target.value }))} /></label>
                    <label className="font-label-sm text-on-surface">Sampai angkatan<input type="number" min="1990" max="2100" className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={curriculumForm.cohortTo} placeholder="Kosongkan bila masih berlaku" onChange={event => setCurriculumForm(current => ({ ...current, cohortTo: event.target.value }))} /></label>
                  </div>
                  <p className="font-label-xs text-on-surface-variant">Rentang angkatan kurikulum aktif tidak boleh tumpang tindih. Kosongkan keduanya untuk kurikulum yang berlaku bagi angkatan yang belum tercakup kurikulum lain (hanya satu).</p>
                  {curriculumFormError && <div role="alert" className="flex items-start gap-sm rounded-md border border-error/40 bg-error/10 px-md py-sm text-error"><span className="material-symbols-outlined text-[18px]">error</span><p className="font-body-sm font-bold">{curriculumFormError}</p></div>}
                  {editingCurriculumId ? (
                    <label className="block font-label-sm text-on-surface">Status<select className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={curriculumForm.status} onChange={event => setCurriculumForm(current => ({ ...current, status: event.target.value }))}><option value="Aktif">Berlaku</option><option value="Nonaktif">Nonaktif</option></select></label>
                  ) : (
                    <label className="block font-label-sm text-on-surface">Salin struktur dari
                      <select className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={curriculumForm.copyFromId} onChange={event => setCurriculumForm(current => ({ ...current, copyFromId: event.target.value }))}>
                        <option value="">Tidak menyalin (kurikulum kosong)</option>
                        {curricula.map(curriculum => <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>)}
                      </select>
                      <span className="mt-xs block font-label-xs text-on-surface-variant">Menyalin mata kuliah, CPL, pemetaan MK–CPL, CPMK, dan profil lulusan. Nilai dan penugasan tidak ikut disalin.</span>
                    </label>
                  )}
                  <label className="block font-label-sm text-on-surface">Catatan<textarea className="mt-xs w-full min-h-[80px] border border-outline-variant rounded-md px-sm py-sm resize-y" value={curriculumForm.notes} maxLength={2000} onChange={event => setCurriculumForm(current => ({ ...current, notes: event.target.value }))} /></label>
                </div>
                <div className="sticky bottom-0 flex justify-end gap-sm px-lg py-md bg-surface border-t border-outline"><button type="button" disabled={curriculumSaving} onClick={() => setShowCurriculumModal(false)} className="px-lg py-sm text-on-surface-variant font-label-sm font-bold">Batal</button><button disabled={curriculumSaving} className="bg-primary text-on-primary px-lg py-sm rounded-md font-label-sm font-bold disabled:opacity-50">{curriculumSaving ? 'Menyimpan...' : 'Simpan Kurikulum'}</button></div>
              </form>
            </div>}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'graduate_profiles' && (
          <div className="p-gutter space-y-md flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md border-b border-outline pb-md">
              <div><h3 className="font-display-2xl text-display-2xl font-bold text-on-surface">Profil Lulusan</h3><p className="font-body-sm text-on-surface-variant">Kelola profil profesi dan pemetaan CPL inti maupun pendukung.</p></div>
              <div className="flex items-center gap-sm"><button type="button" disabled={graduateProfileSaving} onClick={loadAccountingGraduateProfiles} className="inline-flex items-center gap-xs border border-primary text-primary px-md py-sm rounded-md font-label-sm font-bold disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">playlist_add</span>Isi Data D3 Akuntansi</button><button type="button" onClick={() => { resetGraduateProfileForm(); setShowGraduateProfileModal(true); }} className="inline-flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-md font-label-sm font-bold"><span className="material-symbols-outlined text-[18px]">add</span>Tambah Profil</button></div>
            </div>
            <div className="border border-outline rounded-lg bg-surface overflow-x-auto">
                <table className="w-full min-w-[820px] text-left"><thead><tr className="bg-surface-container border-b border-outline"><th className="px-md py-sm font-label-xs uppercase">Profil Lulusan</th><th className="px-md py-sm font-label-xs uppercase">Ringkasan Kemampuan</th><th className="px-md py-sm font-label-xs uppercase">CPL Inti</th><th className="px-md py-sm font-label-xs uppercase">CPL Pendukung</th><th className="px-md py-sm font-label-xs uppercase text-right">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-outline">{graduateProfiles.map(profile => <tr key={profile.id} onClick={() => selectGraduateProfile(profile)} className={`cursor-pointer border-l-4 border-primary hover:bg-surface-container-low ${selectedGraduateProfileId === profile.id ? 'bg-primary/5' : ''}`}><td className="px-md py-sm align-top"><p className="font-body-sm font-bold text-primary">{profile.code} · {profile.name}</p>{profile.englishName && <p className="font-label-xs text-on-surface-variant">{profile.englishName}</p>}</td><td className="px-md py-sm align-top font-body-sm max-w-[420px]">{profile.summary}</td><td className="px-md py-sm align-top"><div className="flex flex-wrap gap-xs">{profile.cplMappings.filter(mapping => mapping.type === 'core').map(mapping => <span key={mapping.cplId} className="px-sm py-xs rounded-full bg-primary text-white font-label-xs font-bold">{mapping.cplCode}</span>)}</div></td><td className="px-md py-sm align-top"><div className="flex flex-wrap gap-xs">{profile.cplMappings.filter(mapping => mapping.type === 'supporting').map(mapping => <span key={mapping.cplId} className="px-sm py-xs rounded-full bg-secondary/10 text-[#03658c] border border-secondary/20 font-label-xs font-bold">{mapping.cplCode}</span>)}</div></td><td className="px-md py-sm align-top"><div className="flex justify-end gap-xs"><button title="Atur pemetaan CPL" onClick={event => { event.stopPropagation(); selectGraduateProfile(profile); }} className="w-8 h-8 grid place-items-center text-secondary"><span className="material-symbols-outlined text-[18px]">account_tree</span></button><button title="Edit profil" onClick={event => { event.stopPropagation(); editGraduateProfile(profile); }} className="w-8 h-8 grid place-items-center text-primary"><span className="material-symbols-outlined text-[18px]">edit</span></button><button title="Hapus profil" onClick={event => { event.stopPropagation(); deleteGraduateProfile(profile); }} className="w-8 h-8 grid place-items-center text-error"><span className="material-symbols-outlined text-[18px]">delete</span></button></div></td></tr>)}</tbody>
                </table>
                {!dataLoading && graduateProfiles.length === 0 && <div className="p-xl text-center text-on-surface-variant">Belum ada Profil Lulusan. Gunakan formulir atau isi data D3 Akuntansi.</div>}
            </div>
            {selectedGraduateProfileId && (() => {
              const profile = graduateProfiles.find(item => item.id === selectedGraduateProfileId);
              if (!profile) return null;
              return <section className="border border-outline rounded-lg bg-surface overflow-hidden">
                <div className="px-md py-sm bg-primary text-white flex items-center justify-between"><div><p className="font-label-xs text-white/80">PEMETAAN CPL</p><h4 className="font-headline-lg font-bold">{profile.code} · {profile.name}</h4></div><button type="button" className="w-8 h-8 grid place-items-center rounded-md bg-white/15" onClick={() => setSelectedGraduateProfileId(null)}><span className="material-symbols-outlined text-[18px]">close</span></button></div>
                <div className="p-md"><p className="font-body-sm text-on-surface-variant mb-md">Pilih peran setiap CPL. Klik satu kali untuk <b>Inti</b>, sekali lagi untuk <b>Pendukung</b>, dan sekali lagi untuk mengosongkan.</p><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-sm">{cpls.slice().sort((a,b) => Number(a.code.split('-')[1]) - Number(b.code.split('-')[1])).map(cpl => {
                  const type = graduateProfileMappingDraft.coreCplIds.includes(cpl.id) ? 'core' : graduateProfileMappingDraft.supportingCplIds.includes(cpl.id) ? 'supporting' : null;
                  return <button type="button" key={cpl.id} className={`min-h-[58px] rounded-md border-2 px-sm py-xs text-left transition-colors ${type === 'core' ? 'bg-primary text-white border-primary' : type === 'supporting' ? 'bg-secondary/10 border-secondary text-[#03658c]' : 'bg-surface-container-low border-outline text-on-surface-variant'}`} onClick={() => setGraduateProfileMappingDraft(current => ({ coreCplIds: type === null ? [...current.coreCplIds, cpl.id] : current.coreCplIds.filter(id => id !== cpl.id), supportingCplIds: type === 'core' ? [...current.supportingCplIds, cpl.id] : current.supportingCplIds.filter(id => id !== cpl.id) }))}><span className="block font-label-sm font-bold">{cpl.code}</span><span className="block font-label-xs mt-xs">{type === 'core' ? 'CPL Inti' : type === 'supporting' ? 'Pendukung' : 'Belum dipilih'}</span></button>;
                })}</div><div className="mt-md flex justify-end"><button type="button" disabled={graduateProfileSaving} onClick={saveGraduateProfileMapping} className="bg-primary text-on-primary px-lg py-sm rounded-md font-label-sm font-bold disabled:opacity-50">Simpan Pemetaan CPL</button></div></div>
              </section>;
            })()}
            {showGraduateProfileModal && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" role="dialog" aria-modal="true" aria-labelledby="graduate-profile-modal-title" onMouseDown={event => { if (event.target === event.currentTarget && !graduateProfileSaving) setShowGraduateProfileModal(false); }}>
              <form onSubmit={saveGraduateProfile} className="w-full max-w-[580px] max-h-[90vh] overflow-y-auto bg-surface rounded-lg shadow-xl border border-outline">
                <div className="sticky top-0 z-10 flex items-center justify-between px-lg py-md bg-surface border-b border-outline"><div><p className="font-label-xs text-primary font-bold">PROFIL LULUSAN</p><h4 id="graduate-profile-modal-title" className="font-headline-xl font-bold text-on-surface">{editingGraduateProfileId ? 'Edit Profil' : 'Tambah Profil'}</h4></div><button type="button" disabled={graduateProfileSaving} onClick={() => setShowGraduateProfileModal(false)} className="w-8 h-8 grid place-items-center rounded-md text-on-surface-variant hover:bg-surface-container"><span className="material-symbols-outlined text-[20px]">close</span></button></div>
                <div className="p-lg space-y-md">
                  <div className="grid grid-cols-[110px_1fr] gap-md"><label className="font-label-sm text-on-surface">Kode<input autoFocus className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={graduateProfileForm.code} placeholder="PL-1" onChange={event => setGraduateProfileForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} /></label><label className="font-label-sm text-on-surface">Nama Profil<input className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={graduateProfileForm.name} onChange={event => setGraduateProfileForm(current => ({ ...current, name: event.target.value }))} /></label></div>
                  <label className="block font-label-sm text-on-surface">Nama Inggris<input className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={graduateProfileForm.englishName} onChange={event => setGraduateProfileForm(current => ({ ...current, englishName: event.target.value }))} /></label>
                  <label className="block font-label-sm text-on-surface">Ringkasan Kemampuan Kerja<textarea className="mt-xs w-full min-h-[120px] border border-outline-variant rounded-md px-sm py-sm resize-y" value={graduateProfileForm.summary} onChange={event => setGraduateProfileForm(current => ({ ...current, summary: event.target.value }))} /></label>
                  <div className="grid grid-cols-3 gap-md"><label className="font-label-sm text-on-surface">Kurikulum<input className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={graduateProfileForm.curriculumVersion} onChange={event => setGraduateProfileForm(current => ({ ...current, curriculumVersion: event.target.value }))} /></label><label className="font-label-sm text-on-surface">Urutan<input type="number" min="1" className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={graduateProfileForm.sequence} onChange={event => setGraduateProfileForm(current => ({ ...current, sequence: event.target.value }))} /></label><label className="font-label-sm text-on-surface">Status<select className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={graduateProfileForm.status} onChange={event => setGraduateProfileForm(current => ({ ...current, status: event.target.value }))}><option>Aktif</option><option>Nonaktif</option></select></label></div>
                </div>
                <div className="sticky bottom-0 flex justify-end gap-sm px-lg py-md bg-surface border-t border-outline"><button type="button" disabled={graduateProfileSaving} onClick={() => setShowGraduateProfileModal(false)} className="px-lg py-sm text-on-surface-variant font-label-sm font-bold">Batal</button><button disabled={graduateProfileSaving} className="bg-primary text-on-primary px-lg py-sm rounded-md font-label-sm font-bold disabled:opacity-50">{graduateProfileSaving ? 'Menyimpan...' : 'Simpan Profil'}</button></div>
              </form>
            </div>}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'cpmks' && (
          <div className="p-gutter space-y-md flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md border-b border-outline pb-md">
              <div><h3 className="font-display-2xl text-display-2xl font-bold text-on-surface">Master CPMK</h3><p className="font-body-sm text-on-surface-variant">Tetapkan CPMK setiap mata kuliah dan hubungkan dengan CPL terintegrasi.</p></div>
              <button type="button" onClick={() => { resetCpmkForm(); setShowCpmkModal(true); }} className="inline-flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-md font-label-sm font-bold"><span className="material-symbols-outlined text-[18px]">add</span>Tambah CPMK</button>
            </div>

            <div className="border border-outline rounded-lg bg-surface overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead><tr className="bg-surface-container border-b border-outline-variant">
                  <th className="px-md py-sm font-label-xs uppercase">Kode</th><th className="px-md py-sm font-label-xs uppercase">Mata Kuliah</th><th className="px-md py-sm font-label-xs uppercase">Deskripsi</th><th className="px-md py-sm font-label-xs uppercase">CPL</th><th className="px-md py-sm font-label-xs uppercase">Bobot</th><th className="px-md py-sm font-label-xs uppercase text-center">Aksi</th>
                </tr></thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {cpmkMasters.length ? cpmkMasters.map(cpmk => <tr key={cpmk.id}>
                    <td className="px-md py-sm font-bold text-primary">{cpmk.code}</td>
                    <td className="px-md py-sm"><p className="font-body-sm font-bold">{cpmk.courseName}</p><p className="font-label-xs text-on-surface-variant">{cpmk.courseCode}</p></td>
                    <td className="px-md py-sm font-body-sm max-w-[420px]">{cpmk.description}</td>
                    <td className="px-md py-sm font-bold">{cpmk.cplCode}</td><td className="px-md py-sm">{cpmk.contributionWeight}%</td>
                    <td className="px-md py-sm"><div className="flex justify-center gap-sm"><button type="button" title="Ubah CPMK" className="p-xs text-primary" onClick={() => editCpmk(cpmk)}><span className="material-symbols-outlined">edit</span></button><button type="button" title="Hapus CPMK" className="p-xs text-error" onClick={() => deleteCpmk(cpmk)}><span className="material-symbols-outlined">delete</span></button></div></td>
                  </tr>) : <tr><td colSpan={6} className="px-lg py-xl text-center text-on-surface-variant">Belum ada CPMK.</td></tr>}
                </tbody>
              </table>
            </div>

            {showCpmkModal && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" role="dialog" aria-modal="true" aria-labelledby="cpmk-modal-title" onMouseDown={event => { if (event.target === event.currentTarget && !cpmkSaving) setShowCpmkModal(false); }}>
              <form noValidate onSubmit={saveCpmk} className="w-full max-w-[680px] max-h-[90vh] overflow-y-auto bg-surface rounded-lg shadow-xl border border-outline">
                <div className="sticky top-0 z-10 flex items-center justify-between px-lg py-md bg-surface border-b border-outline">
                  <div><p className="font-label-xs text-primary font-bold">MASTER CPMK</p><h4 id="cpmk-modal-title" className="font-headline-xl font-bold text-on-surface">{editingCpmkId ? 'Edit CPMK' : 'Tambah CPMK'}</h4></div>
                  <button type="button" disabled={cpmkSaving} onClick={() => setShowCpmkModal(false)} className="w-8 h-8 grid place-items-center rounded-md text-on-surface-variant hover:bg-surface-container"><span className="material-symbols-outlined text-[20px]">close</span></button>
                </div>
                <div className="p-lg space-y-md">
                  {cpmkFormError && <div role="alert" className="flex gap-sm rounded-md border border-error/25 bg-error/5 px-md py-sm text-error"><span className="material-symbols-outlined text-[20px]">error</span><p className="font-body-sm">{cpmkFormError}</p></div>}
                  <label className="block font-label-sm text-on-surface">Mata Kuliah<select autoFocus className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm bg-surface" value={cpmkForm.courseId} onChange={event => selectCourseForCpmk(event.target.value)}><option value="">Pilih mata kuliah</option>{courses.map(course => <option key={course.id} value={course.id}>{course.code} - {course.name}</option>)}</select></label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <label className="font-label-sm text-on-surface">CPL Terkait<select className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm bg-surface" value={cpmkForm.cplCode} onChange={event => selectCplForCpmk(event.target.value)}><option value="">Pilih CPL</option>{cpls.map(cpl => <option key={cpl.id} value={cpl.code}>{cpl.code}</option>)}</select><span className="mt-xs block font-label-xs text-on-surface-variant">Pilih CPL untuk membentuk kode CPMK otomatis.</span></label>
                    <label className="font-label-sm text-on-surface">Kode CPMK<input readOnly className="mt-xs w-full cursor-not-allowed border border-outline-variant rounded-md bg-surface-container px-sm py-sm font-bold text-primary" value={cpmkForm.code} placeholder="Terbentuk otomatis" /><span className="mt-xs block font-label-xs text-on-surface-variant">Urutan mengikuti CPMK yang sudah ada pada mata kuliah ini.</span></label>
                  </div>
                  <label className="block font-label-sm text-on-surface">Deskripsi CPMK<textarea className="mt-xs w-full min-h-[120px] border border-outline-variant rounded-md px-sm py-sm resize-y" value={cpmkForm.description} placeholder="Kemampuan yang diharapkan setelah menyelesaikan mata kuliah..." onChange={event => setCpmkForm(current => ({ ...current, description: event.target.value }))} /></label>
                  <div className="flex items-start gap-sm rounded-md border border-primary/15 bg-primary/5 px-md py-sm font-label-sm text-on-surface-variant"><span className="material-symbols-outlined text-[18px] text-primary">balance</span><span>Bobot kontribusi dibagi rata otomatis: {cpmkWeightNote}</span></div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                    <label className="font-label-sm text-on-surface">Kurikulum<input className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={cpmkForm.curriculumVersion} placeholder="2026" onChange={event => setCpmkForm(current => ({ ...current, curriculumVersion: event.target.value }))} /></label>
                    <label className="font-label-sm text-on-surface">Bobot Kontribusi<input readOnly className="mt-xs w-full cursor-not-allowed border border-outline-variant rounded-md bg-surface-container px-sm py-sm font-bold text-on-surface" value={cpmkForm.status === 'Aktif' ? `${cpmkEqualShare.toFixed(2)}%` : '0% (nonaktif)'} /><span className="mt-xs block font-label-xs text-on-surface-variant">Otomatis: 100% ÷ jumlah CPMK aktif.</span></label>
                    <label className="font-label-sm text-on-surface">Status<select className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm bg-surface" value={cpmkForm.status} onChange={event => setCpmkForm(current => ({ ...current, status: event.target.value }))}><option>Aktif</option><option>Nonaktif</option></select></label>
                  </div>
                </div>
                <div className="sticky bottom-0 flex justify-end gap-sm px-lg py-md bg-surface border-t border-outline"><button type="button" disabled={cpmkSaving} onClick={() => setShowCpmkModal(false)} className="px-lg py-sm text-on-surface-variant font-label-sm font-bold">Batal</button><button disabled={cpmkSaving} className="bg-primary text-on-primary px-lg py-sm rounded-md font-label-sm font-bold disabled:opacity-50">{cpmkSaving ? 'Menyimpan...' : editingCpmkId ? 'Simpan Perubahan' : 'Simpan CPMK'}</button></div>
              </form>
            </div>}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab !== 'cpmks' && showCpmkModal && (() => {
          const selectedCourse = courses.find(course => course.id === cpmkForm.courseId);
          return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-md" role="dialog" aria-modal="true" aria-labelledby="course-cpmk-modal-title" onMouseDown={event => { if (event.target === event.currentTarget && !cpmkSaving) setShowCpmkModal(false); }}>
            <form noValidate onSubmit={saveCpmk} className="w-full max-w-[680px] max-h-[90vh] overflow-y-auto bg-surface rounded-lg shadow-xl border border-outline">
              <div className="sticky top-0 z-10 flex items-center justify-between px-lg py-md bg-surface border-b border-outline">
                <div><p className="font-label-xs text-primary font-bold">{selectedCourse?.code || 'MATA KULIAH'}</p><h4 id="course-cpmk-modal-title" className="font-headline-xl font-bold text-on-surface">{editingCpmkId ? 'Edit CPMK' : 'Tambah CPMK'}</h4><p className="font-body-sm text-on-surface-variant mt-xs">{selectedCourse?.name || 'Mata kuliah tidak ditemukan'}</p></div>
                <button type="button" disabled={cpmkSaving} onClick={() => setShowCpmkModal(false)} className="w-8 h-8 grid place-items-center rounded-md text-on-surface-variant hover:bg-surface-container"><span className="material-symbols-outlined text-[20px]">close</span></button>
              </div>
              <div className="p-lg space-y-md">
                {cpmkFormError && <div role="alert" className="flex gap-sm rounded-md border border-error/25 bg-error/5 px-md py-sm text-error"><span className="material-symbols-outlined text-[20px]">error</span><p className="font-body-sm">{cpmkFormError}</p></div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                  <label className="font-label-sm text-on-surface">CPL Terkait<select autoFocus className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm bg-surface" value={cpmkForm.cplCode} onChange={event => selectCplForCpmk(event.target.value)}><option value="">Pilih CPL</option>{cpls.map(cpl => <option key={cpl.id} value={cpl.code}>{cpl.code}</option>)}</select><span className="mt-xs block font-label-xs text-on-surface-variant">Pilih CPL untuk membentuk kode CPMK otomatis.</span></label>
                  <label className="font-label-sm text-on-surface">Kode CPMK<input readOnly className="mt-xs w-full cursor-not-allowed border border-outline-variant rounded-md bg-surface-container px-sm py-sm font-bold text-primary" value={cpmkForm.code} placeholder="Terbentuk otomatis" /><span className="mt-xs block font-label-xs text-on-surface-variant">Urutan mengikuti CPMK yang sudah ada pada mata kuliah ini.</span></label>
                </div>
                <label className="block font-label-sm text-on-surface">Deskripsi CPMK<textarea className="mt-xs w-full min-h-[120px] border border-outline-variant rounded-md px-sm py-sm resize-y" value={cpmkForm.description} placeholder="Kemampuan yang diharapkan setelah menyelesaikan mata kuliah..." onChange={event => setCpmkForm(current => ({ ...current, description: event.target.value }))} /></label>
                <div className="flex items-start gap-sm rounded-md border border-primary/15 bg-primary/5 px-md py-sm font-label-sm text-on-surface-variant"><span className="material-symbols-outlined text-[18px] text-primary">balance</span><span>Bobot kontribusi dibagi rata otomatis: {cpmkWeightNote}</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                  <label className="font-label-sm text-on-surface">Kurikulum<input className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={cpmkForm.curriculumVersion} placeholder="2026" onChange={event => setCpmkForm(current => ({ ...current, curriculumVersion: event.target.value }))} /></label>
                  <label className="font-label-sm text-on-surface">Bobot Kontribusi<input readOnly className="mt-xs w-full cursor-not-allowed border border-outline-variant rounded-md bg-surface-container px-sm py-sm font-bold text-on-surface" value={cpmkForm.status === 'Aktif' ? `${cpmkEqualShare.toFixed(2)}%` : '0% (nonaktif)'} /><span className="mt-xs block font-label-xs text-on-surface-variant">Otomatis: 100% ÷ jumlah CPMK aktif.</span></label>
                  <label className="font-label-sm text-on-surface">Status<select className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm bg-surface" value={cpmkForm.status} onChange={event => setCpmkForm(current => ({ ...current, status: event.target.value }))}><option>Aktif</option><option>Nonaktif</option></select></label>
                </div>
              </div>
              <div className="sticky bottom-0 flex justify-end gap-sm px-lg py-md bg-surface border-t border-outline"><button type="button" disabled={cpmkSaving} onClick={() => setShowCpmkModal(false)} className="px-lg py-sm text-on-surface-variant font-label-sm font-bold">Batal</button><button disabled={cpmkSaving || !selectedCourse} className="bg-primary text-on-primary px-lg py-sm rounded-md font-label-sm font-bold disabled:opacity-50">{cpmkSaving ? 'Menyimpan...' : editingCpmkId ? 'Simpan Perubahan' : 'Simpan CPMK'}</button></div>
            </form>
          </div>;
        })()}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'assessment_plans' && (
          <div className="p-gutter space-y-lg flex-1">
            <div>
              <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Rencana Asesmen</h3>
              <p className="font-body-sm text-on-surface-variant">Susun komponen penilaian dan bobot CPMK sebelum dosen mengisi skor.</p>
            </div>

            {!selectedAssessmentOfferingId ? <section className="app-card overflow-hidden">
              <div className="p-md border-b border-outline-variant flex flex-col lg:flex-row gap-md">
                <div className="relative flex-1 min-w-[260px]"><span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">search</span><input className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-xl pr-md py-sm font-body-sm outline-none focus:border-primary" value={assessmentSearch} onChange={event => { setAssessmentSearch(event.target.value); setAssessmentPage(1); }} placeholder="Cari kode, mata kuliah, kelas, atau dosen..." /></div>
                <select className="bg-surface-container-low border border-outline-variant rounded-lg px-md py-sm font-body-sm" value={assessmentStatusFilter} onChange={event => { setAssessmentStatusFilter(event.target.value); setAssessmentPage(1); }}><option value="">Semua Status</option><option value="Belum Dibuat">Belum Dibuat</option><option value="Draft">Draf</option><option value="Published">Dipublikasikan</option><option value="Archived">Diarsipkan</option></select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead><tr className="bg-surface-container border-b border-outline-variant"><th className="px-md py-sm font-label-xs uppercase">Mata Kuliah</th><th className="px-md py-sm font-label-xs uppercase">Kelas</th><th className="px-md py-sm font-label-xs uppercase">Periode</th><th className="px-md py-sm font-label-xs uppercase">Dosen</th><th className="px-md py-sm font-label-xs uppercase text-center">CPMK</th><th className="px-md py-sm font-label-xs uppercase text-center">Bobot</th><th className="px-md py-sm font-label-xs uppercase text-center">Status</th><th className="px-md py-sm font-label-xs uppercase text-right">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-outline-variant/50">{pagedAssessmentOfferings.map(offering => {
                    const cpmkCount = cpmkMasters.filter(cpmk => cpmk.courseId === offering.courseId && cpmk.status === 'Aktif').length;
                    const statusClass = offering.status === 'Published' ? 'bg-success/10 text-success' : offering.status === 'Draft' ? 'bg-[#fff4ce] text-[#9a6700]' : offering.status === 'Archived' ? 'bg-surface-container text-on-surface-variant' : 'bg-error/10 text-error';
                    return <tr key={offering.courseOfferingId} className="hover:bg-primary/[0.03]"><td className="px-md py-md"><p className="font-body-sm font-bold text-on-surface">{offering.courseCode}</p><p className="font-body-sm text-on-surface-variant">{offering.courseName}</p></td><td className="px-md py-md font-body-sm">{offering.className}</td><td className="px-md py-md font-body-sm">{offering.semester} {offering.academicYear}</td><td className="px-md py-md font-body-sm">{offering.lecturerName}</td><td className="px-md py-md text-center font-bold">{cpmkCount}</td><td className="px-md py-md text-center font-bold">{offering.currentPlan ? `${offering.currentPlan.totalWeight}%` : '—'}</td><td className="px-md py-md text-center"><span className={`inline-flex px-sm py-xs rounded-full font-label-xs font-bold ${statusClass}`}>{gradeStatusLabel(offering.status)}</span></td><td className="px-md py-md text-right"><button type="button" className={`px-md py-sm rounded-md font-label-sm font-bold ${offering.status === 'Belum Dibuat' ? 'bg-primary text-on-primary' : 'border border-primary text-primary'}`} onClick={() => offering.currentPlan?.status === 'Draft' ? editAssessmentPlan(offering.currentPlan) : offering.status === 'Belum Dibuat' ? startAssessmentDraft(offering.courseOfferingId) : setSelectedAssessmentOfferingId(offering.courseOfferingId)}>{offering.status === 'Belum Dibuat' ? 'Susun Rencana' : offering.status === 'Draft' ? 'Lanjutkan' : 'Lihat Rencana'}</button></td></tr>;
                  })}{pagedAssessmentOfferings.length === 0 && <tr><td colSpan={8} className="px-lg py-xl text-center text-on-surface-variant">Tidak ada penawaran mata kuliah yang sesuai.</td></tr>}</tbody>
                </table>
              </div>
              <div className="px-md py-sm border-t border-outline-variant flex items-center justify-between"><p className="font-label-sm text-on-surface-variant">Menampilkan {pagedAssessmentOfferings.length} dari {assessmentOfferings.length} penawaran</p><div className="flex items-center gap-xs"><button type="button" className="w-9 h-9 grid place-items-center border border-outline-variant rounded-md disabled:opacity-40" disabled={assessmentPage <= 1} onClick={() => setAssessmentPage(page => page - 1)}><span className="material-symbols-outlined">chevron_left</span></button><span className="px-sm font-label-sm">{assessmentPage} / {assessmentPageCount}</span><button type="button" className="w-9 h-9 grid place-items-center border border-outline-variant rounded-md disabled:opacity-40" disabled={assessmentPage >= assessmentPageCount} onClick={() => setAssessmentPage(page => page + 1)}><span className="material-symbols-outlined">chevron_right</span></button></div></div>
            </section> : <section className="app-card p-md flex flex-col sm:flex-row sm:items-center justify-between gap-md">
              {(() => { const offering = teachingAssignments.find(item => item.courseOfferingId === selectedAssessmentOfferingId); return <div><button type="button" className="inline-flex items-center gap-xs text-primary font-label-sm font-bold mb-xs" onClick={() => { setSelectedAssessmentOfferingId(''); setAssessmentDraftItems([]); setEditingAssessmentPlanId(null); }}><span className="material-symbols-outlined text-[18px]">arrow_back</span>Daftar Mata Kuliah</button><h4 className="font-headline-lg font-bold text-on-surface">{offering?.courseCode} · {offering?.courseName}</h4><p className="font-body-sm text-on-surface-variant">Kelas {offering?.className} · {offering?.semester} {offering?.academicYear}</p></div>; })()}
              {assessmentDraftItems.length === 0 && !assessmentPlans.some(plan => plan.courseOfferingId === selectedAssessmentOfferingId && plan.status === 'Published') && <button type="button" className="bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold" onClick={() => startAssessmentDraft()}>Buat Pembagian Awal</button>}
            </section>}

            {assessmentDraftItems.length > 0 && (
              <section className="space-y-md">
                <div className="flex flex-wrap justify-between items-center gap-md">
                  <div>
                    <h4 className="font-headline-lg font-bold text-on-surface">{editingAssessmentPlanId ? 'Ubah Draft' : 'Draft Baru'}</h4>
                    <p className={`font-label-sm font-bold ${Math.abs(assessmentDraftItems.reduce((sum, item) => sum + Number(item.weight || 0), 0) - 100) < 0.001 ? 'text-success' : 'text-error'}`}>
                      Total bobot: {assessmentDraftItems.reduce((sum, item) => sum + Number(item.weight || 0), 0).toFixed(2)}%
                    </p>
                  </div>
                  <button type="button" className="bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold disabled:opacity-50" disabled={assessmentSaving} onClick={saveAssessmentDraft}>{assessmentSaving ? 'Menyimpan...' : 'Simpan Draft'}</button>
                </div>
                <div className="overflow-x-auto border border-outline-variant rounded-lg">
                  <table className="w-full min-w-[900px] text-left">
                    <thead><tr className="bg-surface-container border-b border-outline-variant">
                      <th className="px-md py-sm font-label-xs uppercase">CPMK</th><th className="px-md py-sm font-label-xs uppercase">Nama Komponen</th><th className="px-md py-sm font-label-xs uppercase">Jenis</th><th className="px-md py-sm font-label-xs uppercase">Bobot</th><th className="px-md py-sm font-label-xs uppercase text-center">Aksi</th>
                    </tr></thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {assessmentDraftItems.map((item, index) => <tr key={`${item.cpmkId}-${index}`}>
                        <td className="px-md py-sm"><p className="font-body-sm font-bold">{item.cpmkCode || cpmkMasters.find(cpmk => cpmk.id === item.cpmkId)?.code}</p><p className="font-label-xs text-primary">{item.cplCode || cpmkMasters.find(cpmk => cpmk.id === item.cpmkId)?.cplCode}</p></td>
                        <td className="px-md py-sm"><input className="w-full bg-surface-container border border-outline-variant rounded-md px-sm py-xs" value={item.name} onChange={(e) => updateAssessmentDraftItem(index, { name: e.target.value })} /></td>
                        <td className="px-md py-sm"><select className="w-full bg-surface-container border border-outline-variant rounded-md px-sm py-xs" value={item.category} onChange={(e) => updateAssessmentDraftItem(index, { category: e.target.value as AssessmentItemDraft['category'] })}><option value="assignment">Tugas</option><option value="quiz">Kuis</option><option value="midterm">UTS</option><option value="final">UAS</option><option value="project">Proyek</option><option value="practice">Praktik</option><option value="presentation">Presentasi</option><option value="other">Lainnya</option></select></td>
                        <td className="px-md py-sm"><input className="w-24 bg-surface-container border border-outline-variant rounded-md px-sm py-xs" type="number" min="0.01" max="100" step="0.01" value={item.weight} onChange={(e) => updateAssessmentDraftItem(index, { weight: Number(e.target.value) })} /></td>
                        <td className="px-md py-sm"><div className="flex justify-center gap-xs">
                          <button type="button" className="p-xs text-primary" title="Tambah komponen untuk CPMK yang sama" onClick={() => setAssessmentDraftItems(items => [...items.slice(0, index + 1), { ...item, id: undefined, name: `${item.name} Lanjutan`, weight: 0, sequence: index + 2 }, ...items.slice(index + 1)].map((entry, i) => ({ ...entry, sequence: i + 1 })))}><span className="material-symbols-outlined">add</span></button>
                          <button type="button" className="p-xs text-error" title="Hapus komponen" onClick={() => setAssessmentDraftItems(items => items.filter((_, i) => i !== index).map((entry, i) => ({ ...entry, sequence: i + 1 })))}><span className="material-symbols-outlined">delete</span></button>
                        </div></td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {selectedAssessmentOfferingId && <section className="space-y-md">
              <h4 className="font-headline-lg font-bold text-on-surface">Riwayat Rencana</h4>
              <div className="overflow-x-auto border border-outline-variant rounded-lg">
                <table className="w-full min-w-[820px] text-left"><thead><tr className="bg-surface-container border-b border-outline-variant"><th className="px-md py-sm">Versi</th><th className="px-md py-sm">Mata Kuliah</th><th className="px-md py-sm">Kelas dan Periode</th><th className="px-md py-sm">Bobot</th><th className="px-md py-sm">Status</th><th className="px-md py-sm text-center">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-outline-variant/50">{assessmentPlans.filter(plan => plan.courseOfferingId === selectedAssessmentOfferingId).map(plan => <tr key={plan.id}><td className="px-md py-md">v{plan.version}</td><td className="px-md py-md"><b>{plan.courseCode}</b> · {plan.courseName}</td><td className="px-md py-md">{plan.className} · {plan.semester} {plan.academicYear}</td><td className="px-md py-md">{plan.totalWeight}%</td><td className="px-md py-md font-bold">{gradeStatusLabel(plan.status)}</td><td className="px-md py-md"><div className="flex justify-center gap-sm">{plan.status === 'Draft' && <><button type="button" className="text-secondary" onClick={() => editAssessmentPlan(plan)}>Ubah</button><button type="button" className="text-primary font-bold" onClick={() => publishAssessmentPlan(plan.id)}>Publikasikan</button></>}{plan.status === 'Published' && <button type="button" className="text-primary font-bold" onClick={() => createAssessmentVersion(plan)}>Buat Versi Baru</button>}</div></td></tr>)}</tbody>
                </table>
              </div>
              {(() => {
                const publishedPlan = assessmentPlans.filter(plan => plan.courseOfferingId === selectedAssessmentOfferingId && plan.status === 'Published').sort((a, b) => b.version - a.version)[0];
                if (!publishedPlan?.items?.length) return null;
                return <div className="app-card overflow-hidden">
                  <div className="p-md border-b border-outline-variant"><h4 className="font-headline-lg font-bold text-on-surface">Rincian Komponen Penilaian</h4><p className="font-body-sm text-on-surface-variant">Komponen berikut digunakan dosen saat menginput nilai.</p></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="bg-surface-container border-b border-outline-variant"><th className="px-md py-sm font-label-xs uppercase">CPMK</th><th className="px-md py-sm font-label-xs uppercase">Komponen</th><th className="px-md py-sm font-label-xs uppercase">Jenis</th><th className="px-md py-sm font-label-xs uppercase text-center">Bobot</th><th className="px-md py-sm font-label-xs uppercase text-center">Wajib</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{publishedPlan.items.map(item => <tr key={item.id || `${item.cpmkId}-${item.sequence}`}><td className="px-md py-sm font-bold text-primary">{item.cpmkCode || cpmkMasters.find(cpmk => cpmk.id === item.cpmkId)?.code || '—'}<span className="block font-label-xs text-on-surface-variant">{item.cplCode || cpmkMasters.find(cpmk => cpmk.id === item.cpmkId)?.cplCode || ''}</span></td><td className="px-md py-sm">{item.name}</td><td className="px-md py-sm">{{ assignment: 'Tugas', quiz: 'Kuis', midterm: 'UTS', final: 'UAS', project: 'Proyek', practice: 'Praktik', presentation: 'Presentasi', other: 'Lainnya' }[item.category] || item.category}</td><td className="px-md py-sm text-center font-bold">{Number(item.weight).toFixed(2)}%</td><td className="px-md py-sm text-center">{item.isRequired ? 'Ya' : 'Tidak'}</td></tr>)}</tbody></table></div>
                </div>;
              })()}
            </section>}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'teaching_assignments' && (
          <div className="p-gutter space-y-lg flex-1">
            <div>
              <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Penugasan Dosen</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Aktifkan periode, lalu tentukan mata kuliah dan kelas ajar pada masing-masing dosen.</p>
            </div>

            <section className="app-card p-lg space-y-md">
              <div className="flex flex-col lg:flex-row lg:items-end gap-md">
                <label className="flex-1 font-label-sm font-bold text-on-surface">Tahun Ajaran
                  <select className="mt-xs w-full rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm font-body-sm" value={selectedAssignmentPeriod.academicYear} onChange={event => {
                    setSelectedAssignmentPeriod(current => ({ ...current, academicYear: event.target.value }));
                    setExpandedAssignmentLecturerId(null);
                  }}>
                    {assignmentAcademicYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
                <div className="flex-1">
                  <p className="mb-xs font-label-sm font-bold text-on-surface">Semester</p>
                  <div className="grid grid-cols-2 gap-xs rounded-lg bg-surface-container p-xs">
                    {(['Ganjil', 'Genap'] as const).map(semester => <button key={semester} type="button" className={`rounded-md px-md py-sm font-label-sm font-bold ${selectedAssignmentPeriod.semester === semester ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'}`} onClick={() => {
                      setSelectedAssignmentPeriod(current => ({ ...current, semester }));
                      setExpandedAssignmentLecturerId(null);
                    }}>{semester}</button>)}
                  </div>
                </div>
                <div className="flex min-w-[250px] items-center justify-between gap-md rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm">
                  <div>
                    <p className="font-label-xs text-on-surface-variant">Status periode</p>
                    <p className={`font-body-sm font-bold ${selectedAssignmentPeriodRecord?.status === 'Aktif' ? 'text-success' : 'text-on-surface-variant'}`}>{selectedAssignmentPeriodRecord?.status === 'Selesai' ? 'Diarsipkan' : selectedAssignmentPeriodRecord?.status || 'Belum dibuat'}</p>
                  </div>
                  {selectedAssignmentPeriodRecord?.status === 'Aktif' ? (
                    <button type="button" disabled={assignmentPeriodSaving} className="inline-flex items-center gap-xs rounded-lg border border-amber-500/40 px-md py-sm font-label-sm font-bold text-amber-700 disabled:opacity-40" onClick={() => updateAssignmentPeriodStatus('archive')}><span className="material-symbols-outlined text-[18px]">archive</span>Arsipkan</button>
                  ) : (
                    <button type="button" disabled={assignmentPeriodSaving} className="inline-flex items-center gap-xs rounded-lg bg-primary px-md py-sm font-label-sm font-bold text-white disabled:opacity-40" onClick={() => updateAssignmentPeriodStatus('activate')}><span className="material-symbols-outlined text-[18px]">event_available</span>Aktifkan</button>
                  )}
                </div>
              </div>
              <p className="font-label-xs text-on-surface-variant">Hanya satu periode yang aktif. Untuk menugaskan dosen di periode lain, aktifkan periode tersebut terlebih dahulu. Mengarsipkan periode menyembunyikan kelas dari dashboard dosen tanpa menghapus nilai atau riwayat; dosen masih dapat melihat buku nilainya tanpa bisa mengubah.</p>
            </section>

            <section className="app-card overflow-hidden">
              <div className="flex items-center justify-between gap-md border-b border-outline-variant px-lg py-md">
                <div><h4 className="font-headline-lg font-bold text-on-surface">Daftar Dosen</h4><p className="font-body-sm text-on-surface-variant">{selectedAssignmentPeriod.semester} {selectedAssignmentPeriod.academicYear} · {periodTeachingAssignments.length} kelas ajar</p></div>
                <span className="rounded-full bg-primary/10 px-md py-xs font-label-sm font-bold text-primary">{activeAssignmentLecturers.length} dosen aktif</span>
              </div>
              {dataLoading ? <div className="p-xl text-center text-on-surface-variant">Memuat penugasan...</div> : activeAssignmentLecturers.length > 0 ? (
                <div className="divide-y divide-outline-variant">
                  {activeAssignmentLecturers.map(lecturer => {
                    const lecturerAssignments = periodTeachingAssignments.filter(assignment => assignment.lecturerId === lecturer.id);
                    const isExpanded = expandedAssignmentLecturerId === lecturer.id;
                    return <div key={lecturer.id} className="px-lg py-md">
                      <div className="flex flex-col gap-md lg:flex-row lg:items-center lg:justify-between">
                        <button type="button" aria-expanded={isExpanded} className="flex min-w-0 flex-1 items-center gap-md rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => setExpandedAssignmentLecturerId(current => current === lecturer.id ? null : lecturer.id)}>
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 font-bold text-primary">{lecturer.name.charAt(0)}</div>
                          <div className="min-w-0 flex-1"><p className="truncate font-body-sm font-bold text-on-surface">{lecturer.name}</p><p className="font-label-xs text-on-surface-variant">{lecturer.employeeNumber} · {lecturerAssignments.length} kelas ajar</p></div>
                          <span className="material-symbols-outlined shrink-0 text-on-surface-variant">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                        </button>
                        {isExpanded && <button type="button" disabled={selectedAssignmentPeriodRecord?.status !== 'Aktif'} className="inline-flex items-center justify-center gap-xs rounded-lg border border-primary px-md py-sm font-label-sm font-bold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40" title={selectedAssignmentPeriodRecord?.status === 'Aktif' ? 'Tambahkan mata kuliah dan kelas untuk dosen ini' : 'Aktifkan periode terlebih dahulu'} onClick={() => openAssignmentForLecturer(lecturer)}><span className="material-symbols-outlined text-[18px]">add</span>Tambah Kelas Ajar</button>}
                      </div>
                      {isExpanded && (lecturerAssignments.length > 0 ? <div className="mt-md overflow-x-auto rounded-lg border border-outline-variant">
                        <table className="w-full min-w-[900px] text-left"><thead><tr className="bg-surface-container"><th className="px-md py-sm font-label-xs uppercase">Mata Kuliah</th><th className="px-md py-sm font-label-xs uppercase">Kelas</th><th className="px-md py-sm font-label-xs uppercase">Status Nilai</th><th className="px-md py-sm font-label-xs uppercase text-right">Aksi</th></tr></thead><tbody className="divide-y divide-outline-variant/60">
                          {lecturerAssignments.map(assignment => <tr key={assignment.id}>
                            <td className="px-md py-sm"><p className="font-body-sm font-bold">{assignment.courseName}</p><p className="font-label-xs text-primary">{assignment.courseCode}</p></td>
                            <td className="px-md py-sm font-body-sm">{assignment.className} · Angkatan {assignment.cohortYear}</td>
                            <td className="px-md py-sm"><span className="font-label-xs font-bold text-primary">{gradeStatusLabel(assignment.gradeStatus)}</span></td>
                            <td className="px-md py-sm"><div className="flex flex-wrap justify-end gap-xs">
                              <button type="button" className="p-xs text-primary" title="Sinkronkan mahasiswa sesuai kelas dan angkatan" onClick={() => syncAssignmentEnrollments(assignment.id)}><span className="material-symbols-outlined text-[20px]">group_add</span></button>
                              <button type="button" disabled={assignment.gradeStatus !== 'Submitted'} className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-sm py-xs font-label-xs font-bold text-primary disabled:cursor-not-allowed disabled:opacity-35" onClick={() => runAdminGradebookWorkflow(assignment, 'approve')}><span className="material-symbols-outlined text-[17px]">task_alt</span>Setujui</button>
                              <button type="button" disabled={assignment.gradeStatus !== 'Approved'} className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-sm py-xs font-label-xs font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-35" onClick={() => runAdminGradebookWorkflow(assignment, 'lock')}><span className="material-symbols-outlined text-[17px]">lock</span>Kunci</button>
                              <button type="button" disabled={assignment.gradeStatus !== 'Locked'} className="inline-flex items-center gap-1 rounded-md border border-red-500/35 px-sm py-xs font-label-xs font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-35" onClick={() => runAdminGradebookWorkflow(assignment, 'reopen')}><span className="material-symbols-outlined text-[17px]">restart_alt</span>Buka</button>
                              <button type="button" className="p-xs text-on-surface-variant hover:text-secondary" title="Ubah status penugasan" onClick={() => openEditModal('assignment', assignment)}><span className="material-symbols-outlined text-[20px]">edit</span></button>
                            </div></td>
                          </tr>)}
                        </tbody></table>
                      </div> : <p className="mt-md rounded-lg bg-surface-container-low px-md py-sm font-body-sm text-on-surface-variant">Belum ada mata kuliah dan kelas yang ditugaskan pada periode ini.{selectedAssignmentPeriodRecord?.status !== 'Aktif' && ' Tekan "Aktifkan" pada status periode di atas untuk mulai menambah kelas ajar.'}</p>)}
                    </div>;
                  })}
                </div>
              ) : <div className="p-xl text-center text-on-surface-variant">Belum ada dosen aktif. Tambahkan dosen melalui menu Dosen.</div>}
            </section>
          </div>
        )}

        {['super_admin', 'admin_jurusan'].includes(currentUser?.role || '') && activeTab === 'lecturers' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Dosen</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {currentUser?.role === 'super_admin' ? 'Kelola akun dosen pada seluruh jurusan.' : 'Kelola akun dosen pada jurusan Anda.'}
                </p>
              </div>
              <button className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary" onClick={() => openAddModal('lecturer')}>
                <span className="material-symbols-outlined">person_add</span>
                Tambah Dosen
              </button>
            </div>

            <div className="glass-panel rounded-xl overflow-x-auto shadow-xl">
              {dataLoading ? (
                <div className="p-xl text-center text-on-surface-variant">Memuat data...</div>
              ) : (
                <table className="w-full min-w-[860px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-white/[0.02]">
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase">No</th>
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase">NIP/NIDN</th>
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase">Nama</th>
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase">Email</th>
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase">Jurusan</th>
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase">Status</th>
                      <th className="px-lg py-md font-label-xs text-on-surface-variant font-bold uppercase text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {lecturers.length > 0 ? lecturers.map((lecturer, index) => (
                      <tr key={lecturer.id} className="hover-row transition-colors">
                        <td className="px-lg py-md font-body-sm">{index + 1}</td>
                        <td className="px-lg py-md font-body-sm font-bold text-primary">{lecturer.employeeNumber}</td>
                        <td className="px-lg py-md font-body-sm font-medium text-on-surface">{lecturer.name}</td>
                        <td className="px-lg py-md font-body-sm text-on-surface-variant">{lecturer.email}</td>
                        <td className="px-lg py-md font-body-sm text-on-surface-variant">
                          {lecturer.departmentName ? `${lecturer.departmentName}${lecturer.departmentCode ? ` (${lecturer.departmentCode})` : ''}` : '—'}
                        </td>
                        <td className="px-lg py-md">
                          <span className={`inline-flex px-sm py-xs rounded-full font-label-xs font-bold ${lecturer.status === 'Aktif' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                            {lecturer.status}
                          </span>
                        </td>
                        <td className="px-lg py-md">
                          <div className="flex items-center justify-center gap-sm">
                            <button className="p-xs text-on-surface-variant hover:text-secondary transition-colors" onClick={() => openEditModal('lecturer', lecturer)} title="Ubah dosen">
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button className="p-xs text-on-surface-variant hover:text-error transition-colors" onClick={() => openDeleteConfirm('lecturer', lecturer.id, lecturer.name)} title="Hapus dosen">
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} className="px-lg py-xl text-center text-on-surface-variant">Belum ada akun dosen pada lingkup jurusan ini.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === 'dosen' && activeTab === 'dashboard' && (
          <div className="p-gutter space-y-lg flex-1">
            <div>
              <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Dashboard Dosen</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Informasi akun dan kesiapan penugasan mengajar.</p>
            </div>
            {dataLoading ? (
              <div className="glass-panel rounded-xl p-xl text-center text-on-surface-variant">Memuat profil dosen...</div>
            ) : lecturerProfile ? (
              <>
                <section className="glass-panel rounded-xl p-lg shadow-md">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-lg">
                    <div><p className="font-label-xs text-on-surface-variant uppercase mb-xs">Nama Dosen</p><p className="font-body-base font-bold text-on-surface">{lecturerProfile.name}</p></div>
                    <div><p className="font-label-xs text-on-surface-variant uppercase mb-xs">NIP/NIDN</p><p className="font-body-base font-bold text-on-surface">{lecturerProfile.employeeNumber}</p></div>
                    <div><p className="font-label-xs text-on-surface-variant uppercase mb-xs">Jurusan</p><p className="font-body-base font-bold text-on-surface">{lecturerProfile.departmentName || '—'}</p></div>
                    <div><p className="font-label-xs text-on-surface-variant uppercase mb-xs">Status Akun</p><p className="font-body-base font-bold text-success">{lecturerProfile.status}</p></div>
                  </div>
                </section>
                <section className="border-t border-outline-variant pt-lg">
                  <h4 className="font-headline-lg font-bold text-on-surface mb-md">Penugasan Mengajar</h4>
                  {teachingAssignments.length > 0 ? (
                    <div className="overflow-x-auto border border-outline-variant rounded-lg">
                      <table className="w-full min-w-[720px] text-left">
                        <thead><tr className="bg-surface-container border-b border-outline-variant">
                          <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Mata Kuliah</th>
                          <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Kelas</th>
                          <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Periode</th>
                        </tr></thead>
                        <tbody className="divide-y divide-outline-variant/50">
                          {teachingAssignments.map(assignment => <tr key={assignment.id}>
                            <td className="px-md py-md"><p className="font-body-sm font-bold">{assignment.courseName}</p><p className="font-label-xs text-primary">{assignment.courseCode}</p></td>
                            <td className="px-md py-md font-body-sm">{assignment.className} · {assignment.cohortYear}</td>
                            <td className="px-md py-md font-body-sm">{assignment.semester} {assignment.academicYear}</td>
                          </tr>)}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-start gap-md max-w-3xl">
                      <span className="material-symbols-outlined text-primary mt-xs">assignment_late</span>
                      <div><p className="font-body-sm text-on-surface-variant">Belum ada mata kuliah dan kelas yang ditugaskan kepada akun Anda.</p></div>
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="glass-panel rounded-xl p-xl text-center text-error">Profil dosen tidak dapat dimuat.</div>
            )}
          </div>
        )}

        {currentUser?.role === 'dosen' && activeTab === 'gradebook' && (
          <div className="gradebook-page p-gutter space-y-lg flex-1 min-w-0">
            <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-md">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">{gradebookData ? `${gradebookData.assignment.courseName} · Kelas ${gradebookData.assignment.className}` : 'Daftar Kelas Ajar'}</h3>
                <p className="font-body-sm text-on-surface-variant">{gradebookData ? 'Isi langsung atau gunakan template Excel yang dibuat khusus untuk CPMK dan peserta kelas ini.' : 'Pilih mata kuliah dan kelas sebelum mengisi nilai CPMK.'}</p>
              </div>
              {gradebookData && <div className="gradebook-toolbar flex flex-wrap items-center gap-sm xl:justify-end">
                <button type="button" className="border border-outline-variant text-on-surface px-md py-sm rounded-lg font-label-sm font-bold" onClick={closeGradebookAssignment}><span className="material-symbols-outlined align-middle text-[18px] mr-xs">arrow_back</span>Kembali</button>
                <span className="px-md py-sm rounded-lg bg-surface-container-high font-label-xs font-bold">Status: {gradeStatusLabel(gradebookData.submission?.status || 'Draft')}</span>
                <button type="button" className="border border-primary text-primary px-md py-sm rounded-lg font-label-sm font-bold" onClick={downloadGradebookTemplate}><span className="material-symbols-outlined align-middle text-[18px] mr-xs">download</span>Unduh Template</button>
                {gradebookEditable && <button type="button" className="border border-primary text-primary px-md py-sm rounded-lg font-label-sm font-bold" onClick={() => gradebookImportInputRef.current?.click()}><span className="material-symbols-outlined align-middle text-[18px] mr-xs">upload</span>Impor Excel</button>}
                <input ref={gradebookImportInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importGradebookTemplate} />
                {gradebookEditable && <>
                  <button type="button" className="border border-primary text-primary px-lg py-sm rounded-lg font-label-sm font-bold disabled:opacity-50" disabled={gradebookSaving} onClick={saveGradebookScores}>{gradebookSaving ? 'Memproses...' : 'Simpan Draf'}</button>
                  <button type="button" className="bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold disabled:opacity-50" disabled={gradebookSaving} onClick={() => runGradebookWorkflow('submit')}>Ajukan Nilai</button>
                </>}
              </div>}
            </div>

            {gradebookData?.assignment?.periodArchived && <div className="flex items-start gap-sm rounded-lg border border-amber-500/40 bg-amber-50 px-md py-sm text-amber-800"><span className="material-symbols-outlined text-[20px]">inventory_2</span><p className="font-body-sm">Periode {gradebookData.assignment.semester} {gradebookData.assignment.academicYear} sudah diarsipkan. Buku nilai ini hanya dapat dilihat dan diunduh.</p></div>}

            {!selectedGradebookAssignmentId && !dataLoading && <section className="border border-outline-variant rounded-xl overflow-hidden bg-surface shadow-md">
              {gradebookAssignments.length === 0 ? <div className="p-xl text-center text-on-surface-variant">Belum ada kelas dengan rencana asesmen terpublikasi. Hubungi admin jurusan.</div> : <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead><tr className="bg-surface-container border-b border-outline-variant">
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Kode</th>
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Mata Kuliah</th>
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Kelas</th>
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Periode</th>
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Progres Nilai</th>
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant">Status</th>
                    <th className="px-md py-sm font-label-xs uppercase text-on-surface-variant text-right">Aksi</th>
                  </tr></thead>
                  <tbody className="divide-y divide-outline-variant/50">{gradebookAssignments.map(assignment => {
                    const complete = Number(assignment.completedStudents || 0);
                    const total = Number(assignment.studentCount || 0);
                    return <tr key={assignment.id}>
                      <td className="px-md py-md font-body-sm font-bold text-primary">{assignment.courseCode}</td>
                      <td className="px-md py-md font-body-sm font-bold">{assignment.courseName}</td>
                      <td className="px-md py-md font-body-sm">{assignment.className} · {assignment.cohortYear}</td>
                      <td className="px-md py-md font-body-sm">{assignment.semester} {assignment.academicYear}{assignment.periodArchived && <span className="ml-xs inline-flex px-sm py-xs rounded-full bg-surface-container-high font-label-xs font-bold text-on-surface-variant">Diarsipkan</span>}</td>
                      <td className="px-md py-md"><p className="font-body-sm font-bold">{complete} dari {total} lengkap</p><div className="mt-xs h-1.5 w-32 bg-surface-container-high rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${total ? Math.round(complete / total * 100) : 0}%` }} /></div></td>
                      <td className="px-md py-md"><span className={`inline-flex px-sm py-xs rounded-full font-label-xs font-bold ${assignment.gradeStatus === 'Locked' ? 'bg-success/10 text-success' : assignment.gradeStatus === 'Submitted' || assignment.gradeStatus === 'Approved' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>{gradeStatusLabel(assignment.gradeStatus)}</span></td>
                      <td className="px-md py-md text-right"><button type="button" className="inline-flex items-center gap-xs border border-primary text-primary px-md py-sm rounded-lg font-label-sm font-bold hover:bg-primary/5" onClick={() => openGradebookAssignment(assignment.id)}><span className="material-symbols-outlined text-[18px]">{assignment.gradeStatus === 'Locked' || assignment.periodArchived ? 'visibility' : 'edit'}</span>{assignment.gradeStatus === 'Locked' || assignment.periodArchived ? 'Lihat Nilai' : 'Input Nilai'}</button></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>}
            </section>}

            {dataLoading ? (
              <div className="p-xl text-center text-on-surface-variant">Memuat buku nilai...</div>
            ) : !selectedGradebookAssignmentId ? null : !gradebookData ? (
              <div className="glass-panel rounded-xl p-xl text-center text-on-surface-variant">Buku nilai tidak dapat dimuat.</div>
            ) : gradebookData.students.length === 0 ? (
              <div className="glass-panel rounded-xl p-xl text-center text-on-surface-variant">Belum ada peserta kelas. Hubungi admin jurusan untuk menyinkronkan mahasiswa sesuai kelas dan angkatan.</div>
            ) : (
              <div className="gradebook-grid border border-outline-variant rounded-lg overflow-auto bg-surface shadow-sm">
                <table className="gradebook-table min-w-max w-full text-left border-collapse">
                  <thead className="sticky top-0 z-20">
                    <tr className="border-b border-outline-variant">
                      <th className="gradebook-nim sticky left-0 z-30 min-w-[110px]">NIM</th>
                      <th className="gradebook-name sticky left-[110px] z-30 min-w-[190px]">Nama Mahasiswa</th>
                      {gradebookData.plan.items.map((item: any) => <th key={item.id} className="gradebook-assessment-head min-w-[136px] text-center" title={`${item.cpmkCode} - ${item.name} - ${item.cplCode} (${item.weight}%)`}>
                        <span className="block text-[9px] leading-[12px] font-bold text-primary">{item.cpmkCode}</span>
                        <span className="block mt-[2px] text-[11px] leading-[14px] font-bold text-on-surface normal-case">{item.name}</span>
                        <span className="inline-flex mt-xs px-xs py-[2px] rounded-md bg-primary/10 text-primary text-[9px] leading-[12px] font-bold normal-case">{item.cplCode} · {item.weight}%</span>
                      </th>)}
                      <th className="px-md py-md min-w-[110px] text-center">Nilai Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {gradebookData.students.map((student: any) => <tr key={student.enrollmentId}>
                      <td className="gradebook-nim sticky left-0 z-10 bg-surface font-body-sm font-bold">{student.nim}</td>
                      <td className="gradebook-name sticky left-[110px] z-10 bg-surface font-body-sm">{student.name}</td>
                      {gradebookData.plan.items.map((item: any) => {
                        const key = `${student.enrollmentId}:${item.id}`;
                        const draft = gradebookScoreDrafts[key] || { score: '', eligibilityStatus: 'eligible', note: '' };
                        return <td key={item.id} className="align-middle text-center">
                          <input disabled={!gradebookEditable} className="gradebook-score-input w-full bg-white border border-outline-variant px-sm py-xs text-center disabled:opacity-60" type="number" min="0" max="100" step="0.01" value={draft.score} placeholder="0-100" onChange={(e) => updateGradebookDraft(student.enrollmentId, item.id, { score: e.target.value, eligibilityStatus: 'eligible' })} />
                        </td>;
                      })}
                      <td className="px-md py-md text-center font-bold">
                        {(() => {
                          const liveScore = getLiveStudentFinalScore(student);
                          return <><p>{liveScore.value === null ? '—' : liveScore.value.toFixed(2)}</p><p className={`font-label-xs font-normal ${liveScore.complete ? 'text-success' : 'text-amber-600'}`}>{liveScore.value === null ? 'Belum diisi' : liveScore.complete ? 'Lengkap' : 'Sementara'}</p></>;
                        })()}
                      </td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}

            {gradebookData && gradebookData.students.length > 0 && <section className="border border-outline-variant rounded-xl bg-surface shadow-md overflow-hidden">
              <div className="flex border-b border-outline-variant bg-surface-container-low">
                <button type="button" className={`flex items-center gap-xs px-lg py-md font-label-sm font-bold border-b-2 ${gradebookBottomTab === 'analysis' ? 'border-primary text-primary bg-surface' : 'border-transparent text-on-surface-variant'}`} onClick={() => setGradebookBottomTab('analysis')}><span className="material-symbols-outlined text-[19px]">edit_note</span>Analisis CPMK</button>
                <button type="button" className={`flex items-center gap-xs px-lg py-md font-label-sm font-bold border-b-2 ${gradebookBottomTab === 'statistics' ? 'border-primary text-primary bg-surface' : 'border-transparent text-on-surface-variant'}`} onClick={() => setGradebookBottomTab('statistics')}><span className="material-symbols-outlined text-[19px]">bar_chart</span>Statistik CPMK</button>
              </div>
              {gradebookBottomTab === 'analysis' ? <div className="p-lg">
                <label className="block font-label-sm font-bold text-on-surface mb-sm">Catatan evaluasi ketercapaian CPMK</label>
                <textarea disabled={!gradebookEditable} className="w-full min-h-[140px] resize-y bg-surface-container-low border border-outline-variant rounded-lg p-md text-on-surface disabled:opacity-60" value={gradebookAnalysis} onChange={(event) => setGradebookAnalysis(event.target.value)} placeholder="Tuliskan CPMK yang belum tercapai, kemungkinan penyebab, dan tindak lanjut pembelajaran..." />
                <div className="mt-md flex items-center justify-between gap-md">
                  <p className="font-label-xs text-on-surface-variant">Catatan dapat diperbarui selama status nilai masih Draf.</p>
                  {gradebookEditable && <button type="button" disabled={gradebookSaving} className="bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold disabled:opacity-50" onClick={saveGradebookAnalysis}>Simpan Analisis</button>}
                </div>
              </div> : <div className="p-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">{getGradebookCpmkStatistics().map(stat => <div key={stat.code} className="border border-outline-variant rounded-lg p-md">
                  <div className="flex items-start justify-between gap-md"><div><p className="font-headline-lg font-bold text-on-surface">{stat.code}</p><p className="font-label-xs text-primary">{stat.cplCode || 'CPL belum dipetakan'}</p></div><p className="font-display-xl font-bold text-primary">{stat.average === null ? '—' : stat.average.toFixed(2)}</p></div>
                  <div className="mt-md h-2 bg-surface-container-high rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${stat.average === null ? 0 : Math.min(100, stat.average)}%` }} /></div>
                  <p className="mt-sm font-body-sm text-on-surface-variant">{stat.passed} dari {stat.measured} mahasiswa terukur mencapai nilai minimal 65.</p>
                </div>)}</div>
                <p className="mt-md font-label-xs text-on-surface-variant">Statistik dihitung dari nilai yang sedang tampil, termasuk perubahan draf yang belum disimpan.</p>
              </div>}
            </section>}
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
            <section className="app-card p-md flex flex-wrap gap-md items-end">
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
              <div className="metric-card">
                <div className="metric-icon bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[20px]">group</span>
                </div>
                <div>
                  <p className="font-label-xs text-on-surface-variant mb-1 uppercase">Total Mahasiswa</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{studentStats.total}</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon bg-secondary/10 text-secondary">
                  <span className="material-symbols-outlined text-[20px]">book</span>
                </div>
                <div>
                  <p className="font-label-xs text-on-surface-variant mb-1 uppercase">Mata Kuliah</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{courses.length}</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon bg-tertiary/10 text-tertiary">
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                </div>
                <div>
                  <p className="font-label-xs text-on-surface-variant mb-1 uppercase">CPL Kompeten</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{cplTerpenuhiPct}%</p>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon bg-surface-tint/10 text-surface-tint">
                  <span className="material-symbols-outlined text-[20px]">analytics</span>
                </div>
                <div>
                  <p className="font-label-xs text-on-surface-variant mb-1 uppercase">Rata-rata Capaian</p>
                  <p className="font-display-2xl text-display-2xl font-bold text-on-surface">{averageCplValue}</p>
                </div>
              </div>
            </section>

            {/* Status Kelulusan Donut Chart (Moved to top) */}
            <section className="app-card p-lg flex flex-col md:flex-row items-center justify-between gap-xl">
              <div className="w-full md:w-auto text-left">
                <h4 className="font-headline-lg text-headline-lg font-bold text-on-surface mb-xs">Ketercapaian CPL (Skor &gt;= 75)</h4>
                <p className="text-on-surface-variant text-body-sm">Persentase capaian CPL dengan predikat Kompeten atau Sangat Kompeten.</p>
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
                    <span className="font-label-2xs text-label-2xs text-on-surface-variant">Kompeten</span>
                  </div>
                </div>

                <div className="w-full sm:w-auto space-y-md min-w-[220px]">
                  <div className="flex justify-between items-center p-sm bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-md">
                      <span className="w-3 h-3 rounded-full bg-primary"></span>
                      <span className="font-label-sm text-label-sm text-on-surface">Kompeten</span>
                    </div>
                    <span className="font-label-sm font-bold text-tertiary">{achievedCpls.length} CPL</span>
                  </div>
                  <div className="flex justify-between items-center p-sm bg-surface-container-low rounded-lg">
                    <div className="flex items-center gap-md">
                      <span className="w-3 h-3 rounded-full bg-error"></span>
                      <span className="font-label-sm text-label-sm text-on-surface">Belum Kompeten</span>
                    </div>
                    <span className="font-label-sm font-bold text-error">{measuredCpls.length - achievedCpls.length} CPL</span>
                  </div>
                </div>
              </div>
            </section>

            <BarChart measuredCpls={measuredCpls} title="Capaian Per CPL" />

            <section className="app-card p-lg space-y-lg">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-sm">
                <div>
                  <h4 className="font-headline-lg font-bold text-on-surface">Ketercapaian Profil Lulusan</h4>
                  <p className="font-body-sm text-on-surface-variant">Capaian profil dihitung dari rata-rata seluruh CPL inti dan pendukung yang telah diukur.</p>
                </div>
                <button type="button" className="text-primary font-label-sm font-bold" onClick={() => navigateToTab('graduate_profiles')}>Kelola Profil Lulusan</button>
              </div>

              {graduateProfileAchievements.length > 0 ? <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
                  {graduateProfileAchievements.map(profile => {
                    const value = profile.value === null ? 0 : Math.min(profile.value, 100);
                    const statusClass = profile.status === 'Tercapai' ? 'text-success bg-success/10' : profile.status === 'Belum Tercapai' ? 'text-error bg-error/10' : profile.status === 'Belum Lengkap' ? 'text-[#9a6700] bg-[#fff4ce]' : 'text-on-surface-variant bg-surface-container';
                    return <article key={profile.id} className="border border-outline-variant rounded-lg p-md bg-surface-container-lowest">
                      <div className="flex items-start justify-between gap-md">
                        <div className="min-w-0"><p className="font-label-xs font-bold text-primary">{profile.code}</p><h5 className="font-headline-md font-bold text-on-surface mt-xs truncate" title={profile.name}>{profile.name}</h5></div>
                        <span className={`shrink-0 px-sm py-xs rounded-full font-label-xs font-bold ${statusClass}`}>{profile.status}</span>
                      </div>
                      <div className="flex items-end justify-between mt-lg mb-sm"><p className="font-display-2xl font-bold text-on-surface">{profile.value === null ? '—' : profile.value.toFixed(1)}</p><p className="font-label-xs text-on-surface-variant">{profile.measuredCount}/{profile.mappedCount} CPL terukur</p></div>
                      <div className="h-2 rounded-full bg-surface-container overflow-hidden"><div className={`h-full rounded-full ${profile.status === 'Tercapai' ? 'bg-success' : 'bg-primary'}`} style={{ width: `${value}%` }} /></div>
                      <div className="grid grid-cols-2 gap-sm mt-md pt-md border-t border-outline-variant/60">
                        <div><p className="font-label-xs text-on-surface-variant">CPL Inti</p><p className="font-body-sm font-bold text-on-surface">{profile.coreValue === null ? 'Belum diukur' : profile.coreValue.toFixed(1)}</p></div>
                        <div><p className="font-label-xs text-on-surface-variant">CPL Pendukung</p><p className="font-body-sm font-bold text-on-surface">{profile.supportingValue === null ? 'Belum diukur' : profile.supportingValue.toFixed(1)}</p></div>
                      </div>
                    </article>;
                  })}
                </div>

                <div className="border border-outline-variant rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left">
                    <thead><tr className="bg-surface-container border-b border-outline-variant"><th className="px-md py-sm font-label-xs uppercase">Profil Lulusan</th><th className="px-md py-sm font-label-xs uppercase">CPL Inti</th><th className="px-md py-sm font-label-xs uppercase">CPL Pendukung</th><th className="px-md py-sm font-label-xs uppercase text-center">Capaian</th><th className="px-md py-sm font-label-xs uppercase text-center">Status</th></tr></thead>
                    <tbody className="divide-y divide-outline-variant/50">{graduateProfileAchievements.map(profile => <tr key={profile.id}><td className="px-md py-sm"><p className="font-body-sm font-bold text-on-surface">{profile.code} · {profile.name}</p><p className="font-label-xs text-on-surface-variant">{profile.englishName}</p></td><td className="px-md py-sm font-body-sm">{profile.cplMappings.filter(mapping => mapping.type === 'core').map(mapping => mapping.cplCode).join(', ') || '—'}</td><td className="px-md py-sm font-body-sm text-on-surface-variant">{profile.cplMappings.filter(mapping => mapping.type === 'supporting').map(mapping => mapping.cplCode).join(', ') || '—'}</td><td className="px-md py-sm text-center font-bold">{profile.value === null ? '—' : profile.value.toFixed(1)}</td><td className="px-md py-sm text-center font-label-xs font-bold">{profile.status}</td></tr>)}</tbody>
                  </table>
                </div>
              </> : <div className="py-xl text-center text-on-surface-variant"><span className="material-symbols-outlined text-[32px] mb-sm">badge</span><p className="font-body-sm">Belum ada Profil Lulusan aktif. Tambahkan profil dan petakan CPL terlebih dahulu.</p></div>}
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
                <button 
                  className="flex items-center gap-sm bg-tertiary text-on-tertiary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-tertiary transition-all cursor-pointer"
                  onClick={handleDownloadAllCplReports}
                >
                  <span className="material-symbols-outlined text-[20px]">table_view</span>
                  Unduh Excel CPL
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
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
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

                <select
                  aria-label="Periode CPL mahasiswa"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                  value={studentCplSemesterType}
                  onChange={(e) => setStudentCplSemesterType(e.target.value)}
                >
                  <option value="">Semua Periode</option>
                  <option value="ganjil">Ganjil</option>
                  <option value="genap">Genap</option>
                </select>

                <select
                  aria-label="Tahun ajaran CPL mahasiswa"
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                  value={studentCplAcademicYear}
                  onChange={(e) => setStudentCplAcademicYear(e.target.value)}
                >
                  <option value="">Semua Tahun Ajaran</option>
                  {studentCplAcademicYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>

                <button 
                  className="bg-surface-bright text-on-surface px-md py-sm rounded-lg font-label-sm text-label-sm flex items-center gap-xs hover:bg-surface-container-highest transition-colors cursor-pointer"
                  onClick={() => {
                    setStudentSearch('');
                    setStudentFilterAngkatan('');
                    setStudentFilterKelas('');
                    setStudentCplSemesterType(getActiveAcademicPeriod().semesterType);
                    setStudentCplAcademicYear(getActiveAcademicPeriod().academicYear);
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
                <div className="flex justify-between items-center gap-md flex-wrap">
                  <button 
                    className="self-start flex items-center gap-xs text-on-surface-variant hover:text-primary font-label-sm font-bold transition-colors"
                    onClick={() => setSelectedStudentForCpl(null)}
                  >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Kembali ke Daftar Mahasiswa
                  </button>
                  <div className="flex items-center gap-sm flex-wrap">
                    <button
                      className="flex items-center gap-sm border border-primary text-primary bg-surface px-lg py-sm rounded-lg font-label-sm font-bold hover:bg-primary/5 transition-colors"
                      onClick={() => {
                        const student = students.find(s => s.id === selectedStudentForCpl);
                        if (student) handleDownloadSingleStudentCplReport(student);
                      }}
                    >
                      <span className="material-symbols-outlined text-[19px]">description</span>
                      Laporan CPL
                    </button>
                    <button
                      className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold btn-glow transition-colors"
                      onClick={() => {
                        const student = students.find(s => s.id === selectedStudentForCpl);
                        if (student) handleDownloadStudentObeTranscript(student);
                      }}
                    >
                      <span className="material-symbols-outlined text-[19px]">workspace_premium</span>
                      Transkrip OBE
                    </button>
                  </div>
                </div>
                
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
                        <div className="grid grid-cols-2 gap-sm border-t border-slate-200 pt-md">
                          {[['IPS', studentAcademicSummary?.ips], ['IPK', studentAcademicSummary?.ipk], ['Total SKS', studentAcademicSummary?.totalSks], ['SKS Lulus', studentAcademicSummary?.passedSks]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-primary/5 px-sm py-sm"><p className="font-label-xs text-on-surface-variant">{label}</p><p className="font-headline-sm font-bold text-primary">{value === null || value === undefined ? '—' : value}</p></div>)}
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
                      <div className="h-[420px] flex items-center justify-center relative bg-white rounded-xl border border-slate-200 shadow-inner">
                        {measuredStudentAchievements.length > 0 ? (
                          <svg className="w-[390px] h-[390px] max-w-full" viewBox="0 0 300 300" aria-label="Radar profil kompetensi mahasiswa">
                          {/* Concentric Grid Circles */}
                          {[20, 40, 60, 80, 100].map((rValue) => (
                            <circle key={rValue} cx="150" cy="150" r={rValue} fill="none" stroke="#dbe3ef" strokeWidth="1" />
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
                                <line x1="150" y1="150" x2={lineX} y2={lineY} stroke="#dbe3ef" strokeWidth="1" />
                                <text x={labelX} y={labelY + 4} fill="#64748b" fontSize="9" fontWeight="bold" textAnchor={textAnchor}>
                                  {cpl.code}
                                </text>
                              </g>
                            );
                          })}

                          <circle cx="150" cy="150" r="75" fill="none" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="5 4" />
                          <text x="227" y="143" fill="#dc2626" fontSize="8" fontWeight="bold">Target 75</text>

                          {/* Student Radar Polygon */}
                          <polygon 
                            fill="rgba(37, 99, 235, 0.18)"
                            points={measuredStudentAchievements.map((cpl, i) => {
                              const angle = (i * 2 * Math.PI) / measuredStudentAchievements.length - Math.PI / 2;
                              const r = (cpl.value / 100) * 100;
                              const x = 150 + r * Math.cos(angle);
                              const y = 150 + r * Math.sin(angle);
                              return `${x},${y}`;
                            }).join(' ')} 
                            stroke="#2563eb"
                            strokeWidth="2.5"
                          />
                          </svg>
                        ) : (
                          <div className="max-w-sm text-center px-lg">
                            <span className="material-symbols-outlined text-[42px] text-outline mb-sm">query_stats</span>
                            <p className="font-headline-sm font-bold text-on-surface mb-xs">Belum ada CPL terukur</p>
                            <p className="font-body-sm text-on-surface-variant">Nilai akan tampil setelah dosen melengkapi penilaian dan admin jurusan mengunci buku nilai.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bar Chart */}
                    <div className="col-span-12 glass-panel rounded-xl p-lg flex flex-col justify-between shadow-md">
                      <div className="flex items-center justify-between mb-lg">
                        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Nilai per CPL</h4>
                        <span className="material-symbols-outlined text-outline">bar_chart</span>
                      </div>
                      
                      <div className="h-[300px] w-full flex items-center justify-center relative bg-white/[0.01] rounded-xl border border-slate-200 shadow-inner px-lg">
                        {measuredStudentAchievements.length > 0 ? (
                          <svg className="w-full h-[260px]" viewBox="0 -35 800 335" preserveAspectRatio="none">
                          {/* Grid Lines */}
                          {[20, 80, 140, 200, 260].map((yVal, idx) => (
                            <g key={yVal}>
                              <line x1="40" y1={yVal} x2="780" y2={yVal} stroke="#e2e8f0" strokeWidth="1" />
                              <text x="10" y={yVal + 4} fill="#64748b" fontSize="12" textAnchor="start">
                                {100 - idx * 25}
                              </text>
                            </g>
                          ))}

                          {/* Bars */}
                          {measuredStudentAchievements.map((cpl, i) => {
                            const barWidth = Math.max(16, Math.min(56, 500 / measuredStudentAchievements.length));
                            const spacing = 720 / measuredStudentAchievements.length;
                            const barX = 50 + i * spacing + (spacing / 2) - (barWidth / 2);
                            const barHeight = (cpl.value / 100) * 240;
                            const barY = 260 - barHeight;
                            
                            let fillCol = '#22c55e';
                            if (cpl.value < cplFormTarget) fillCol = '#ef4444';

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
                                <text x={barX + barWidth / 2} y="280" fill="#64748b" fontSize="12" fontWeight="bold" textAnchor="middle">
                                  {cpl.code}
                                </text>
                                
                                {/* Custom Hover Tooltip */}
                                <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                                  <rect
                                    x={barX + barWidth / 2 - 22}
                                    y={barY - 26}
                                    width="44"
                                    height="18"
                                    rx="4"
                                    fill="#1E293B"
                                  />
                                  <text
                                    x={barX + barWidth / 2}
                                    y={barY - 13}
                                    fill="#FFFFFF"
                                    fontSize="10"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                  >
                                    {cpl.value}%
                                  </text>
                                </g>

                                <title>{`${cpl.code}: ${cpl.value}%`}</title>
                              </g>
                            );
                          })}
                          </svg>
                        ) : (
                          <div className="max-w-md text-center px-lg">
                            <span className="material-symbols-outlined text-[42px] text-outline mb-sm">bar_chart_off</span>
                            <p className="font-headline-sm font-bold text-on-surface mb-xs">Nilai CPL belum tersedia</p>
                            <p className="font-body-sm text-on-surface-variant">Mahasiswa ini belum memiliki nilai dari buku nilai OBE yang sudah dikunci.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <section className="col-span-12 glass-panel rounded-xl p-lg shadow-md">
                      <div className="flex items-center justify-between mb-md"><div><h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Profil Lulusan Mahasiswa</h4><p className="font-body-sm text-on-surface-variant">Capaian profil dihitung dari CPL inti dan pendukung yang sudah terukur.</p></div><span className="material-symbols-outlined text-primary">badge</span></div>
                      {graduateProfiles.filter(profile => profile.status === 'Aktif').length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">{graduateProfiles.filter(profile => profile.status === 'Aktif').sort((a, b) => a.sequence - b.sequence).map(profile => {
                        const codes = profile.cplMappings.map(mapping => mapping.cplCode);
                        const values = codes.map(code => selectedStudentAchievements.find(cpl => cpl.code === code)).filter(cpl => cpl && cpl.status !== 'Belum Diukur').map(cpl => Number(cpl!.value));
                        const score = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
                        const status = score === null ? 'Belum Diukur' : values.length < codes.length ? 'Belum Lengkap' : score >= 75 ? 'Tercapai' : 'Belum Tercapai';
                        return <article key={profile.id} className="border border-slate-200 rounded-lg p-md bg-white"><div className="flex items-start justify-between gap-sm"><div><p className="font-label-xs font-bold text-primary">{profile.code}</p><h5 className="font-headline-md font-bold text-on-surface">{profile.name}</h5></div><span className="font-label-xs font-bold text-on-surface-variant">{status}</span></div><p className="font-display-xl font-bold text-primary mt-md">{score === null ? '—' : score.toFixed(1)}</p><p className="font-label-xs text-on-surface-variant">CPL terukur {values.length}/{codes.length}</p><div className="h-2 mt-sm rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(score ?? 0, 100)}%` }} /></div><p className="font-label-xs text-on-surface-variant mt-sm">CPL: {codes.join(', ') || '—'}</p></article>;
                      })}</div> : <p className="py-lg text-center text-on-surface-variant">Belum ada profil lulusan aktif.</p>}
                    </section>

                    {/* Achievements Table */}
                    <section className="col-span-12 glass-panel rounded-xl overflow-hidden shadow-xl">
                      <div className="p-lg border-b border-slate-200 flex flex-wrap items-center justify-between bg-white/5 gap-md">
                        <h4 className="font-headline-lg text-headline-lg text-on-surface font-bold">Rincian Capaian per Dimensi</h4>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-highest/30">
                              <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider">CPL</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider">Deskripsi Kompetensi</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-center">Nilai</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider">Status</th>
                              <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-right">Detail MK</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {selectedStudentAchievements.length > 0 ? (
                              selectedStudentAchievements.map((cpl) => (
                                <tr key={cpl.id} className="hover:bg-white/5 transition-colors group">
                                  <td className="px-lg py-lg font-bold text-primary">{cpl.code}</td>
                                  <td className="px-lg py-lg text-body-sm text-on-surface-variant max-w-md">{cpl.description}</td>
                                  <td className="px-lg py-lg text-center font-bold text-headline-lg">{cpl.status === 'Belum Diukur' ? '—' : cpl.value}</td>
                                  <td className="px-lg py-lg">
                                    <span className={`inline-flex items-center gap-1.5 px-sm py-1 rounded-md text-label-xs font-bold border ${
                                      cpl.status.includes('Sangat kompeten') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                      cpl.status.includes('Kompeten') ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                      cpl.status.includes('Berkembang') ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                      cpl.status.includes('Tidak memuaskan') ? 'bg-error/20 text-error border-error/30' :
                                      'bg-slate-500/20 text-slate-400 border-slate-500/30'
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-md">
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
                  className="flex items-center gap-sm bg-secondary text-on-secondary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-secondary hover:scale-105 transition-all duration-200 cursor-pointer"
                  onClick={() => setIsCourseReportModalOpen(true)}
                >
                  <span className="material-symbols-outlined text-[20px]">analytics</span>
                  Laporan Capaian MK
                </button>
                <button 
                  className="flex items-center gap-sm bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold glow-primary"
                  onClick={() => openAddModal('course')}
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  Tambah Mata Kuliah
                </button>
              </div>
            </div>

            <div className="glass-panel p-md rounded-xl flex flex-col lg:flex-row gap-md items-stretch lg:items-center shadow-md">
              <div className="relative flex-1 min-w-[240px] rounded-lg">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
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

              <div className="flex flex-wrap items-center gap-sm">
                <span className="text-label-xs font-bold text-slate-600 uppercase mr-xs hidden sm:inline">Mata Kuliah:</span>
                <button 
                  title="Unduh Template Excel Mata Kuliah"
                  className="flex items-center justify-center p-sm bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 rounded-xl transition-all"
                  onClick={downloadCourseTemplate}
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                </button>
                <button 
                  className="flex items-center gap-xs bg-secondary hover:bg-secondary/90 text-white px-lg py-md rounded-xl font-label-sm text-label-sm font-bold shadow-sm transition-all"
                  onClick={() => courseFileInputRef.current?.click()}
                >
                  <span className="material-symbols-outlined text-[18px]">upload</span>
                  Impor MK
                </button>
                <input 
                  type="file" 
                  ref={courseFileInputRef} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportCourseExcel} 
                />
              </div>
            </div>

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
                              checked={currentCourses.length > 0 && currentCourses.every(course => selectedCourseIds.includes(course.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCourseIds(currentCourses.map(c => c.id));
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
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Semester</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">CPL dari CPMK</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/50">
                        {currentCourses.length > 0 ? (
                          currentCourses.map((course, index) => (
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
                              <td className="px-lg py-md font-body-sm">{indexOfFirstCourse + index + 1}</td>
                              <td className="px-lg py-md font-body-sm font-bold text-primary">{course.code}</td>
                              <td className="px-lg py-md font-body-sm font-medium text-on-surface">{course.name}</td>
                              <td className="px-lg py-md font-body-sm text-center font-semibold text-on-surface-variant">{course.sks}</td>
                              <td className="px-lg py-md font-body-sm text-center font-semibold text-on-surface-variant">{course.semester || '-'}</td>
                              <td className="px-lg py-md">
                                <div className="flex flex-wrap gap-xs items-center">
                                  {Array.from(new Set(cpmkMasters.filter(cpmk => cpmk.courseId === course.id && cpmk.status === 'Aktif').map(cpmk => cpmk.cplCode))).filter(Boolean).length > 0 ? (
                                    Array.from(new Set(cpmkMasters.filter(cpmk => cpmk.courseId === course.id && cpmk.status === 'Aktif').map(cpmk => cpmk.cplCode))).filter(Boolean).slice(0, 5).map(code => (
                                      <span key={code} className="inline-flex px-sm py-xs rounded-full bg-primary/10 text-primary border border-primary/15 text-[10px] font-bold">
                                        {code}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[11px] text-on-surface-variant/50 italic">-</span>
                                  )}
                                  {Array.from(new Set(cpmkMasters.filter(cpmk => cpmk.courseId === course.id && cpmk.status === 'Aktif').map(cpmk => cpmk.cplCode))).filter(Boolean).length > 5 && (
                                    <span className="inline-flex px-sm py-xs rounded-full bg-surface-container text-on-surface-variant text-[10px] font-bold">
                                      +{Array.from(new Set(cpmkMasters.filter(cpmk => cpmk.courseId === course.id && cpmk.status === 'Aktif').map(cpmk => cpmk.cplCode))).filter(Boolean).length - 5}
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
                                <td colSpan={8} className="p-0 border-b border-outline-variant/10">
                                  <div className="p-xl slide-panel-overlay">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-sm mb-md">
                                      <div><h4 className="font-headline-lg font-bold text-on-surface">Pemetaan CPMK dan CPL</h4><p className="font-body-sm text-on-surface-variant">{course.code} · {course.name}</p></div>
                                      <button type="button" className="inline-flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-md font-label-sm font-bold" onClick={() => addCpmkForCourse(course.id)}><span className="material-symbols-outlined text-[18px]">add</span>Tambah CPMK</button>
                                    </div>
                                    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/30 overflow-hidden">
                                        <table className="w-full text-left border-collapse">
                                          <thead>
                                            <tr className="bg-white/[0.02] border-b border-outline-variant/20">
                                              <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase">Kode CPMK</th>
                                              <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase">Kode CPL</th>
                                              <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase">Deskripsi CPMK</th>
                                              <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase text-center">Kontribusi</th>
                                              <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase text-center">Status</th>
                                              <th className="px-lg py-sm font-label-xs text-on-surface-variant uppercase text-center">Aksi</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-outline-variant/50">
                                            {cpmkMasters.filter(cpmk => cpmk.courseId === course.id).length > 0 ? (
                                              cpmkMasters.filter(cpmk => cpmk.courseId === course.id).map(cpmk => (
                                                <tr key={cpmk.id}>
                                                  <td className="px-lg py-sm font-body-sm font-bold text-primary">{cpmk.code}</td>
                                                  <td className="px-lg py-sm"><span className="inline-flex px-sm py-xs rounded-full bg-primary/10 text-primary border border-primary/15 font-label-xs font-bold">{cpmk.cplCode}</span></td>
                                                  <td className="px-lg py-sm font-body-sm text-on-surface-variant max-w-md">{cpmk.description}</td>
                                                  <td className="px-lg py-sm font-body-sm text-center font-bold text-on-surface">{cpmk.contributionWeight}%</td>
                                                  <td className="px-lg py-sm text-center"><span className={`inline-flex px-sm py-xs rounded-full font-label-xs font-bold ${cpmk.status === 'Aktif' ? 'bg-success/10 text-success' : 'bg-surface-container text-on-surface-variant'}`}>{cpmk.status}</span></td>
                                                  <td className="px-lg py-sm"><div className="flex justify-center gap-xs"><button type="button" title="Ubah CPMK" className="p-xs text-primary" onClick={() => editCpmk(cpmk)}><span className="material-symbols-outlined text-[19px]">edit</span></button><button type="button" title="Hapus CPMK" className="p-xs text-error" onClick={() => deleteCpmk(cpmk)}><span className="material-symbols-outlined text-[19px]">delete</span></button></div></td>
                                                </tr>
                                              ))
                                            ) : (
                                              <tr>
                                                <td colSpan={6} className="px-lg py-lg text-center text-on-surface-variant font-body-sm">Belum ada CPMK. Gunakan tombol Tambah CPMK untuk menentukan CPL mata kuliah ini.</td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data mata kuliah.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="p-lg flex items-center justify-between border-t border-outline-variant/30 bg-white/[0.02] flex-wrap gap-md">
                    <div className="flex items-center gap-md flex-wrap">
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Menampilkan {currentCourses.length} dari {totalCourses} Mata Kuliah
                      </p>
                      <div className="flex items-center gap-xs">
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Tampilkan:</span>
                        <select 
                          value={courseItemsPerPage}
                          onChange={(e) => {
                            setCourseItemsPerPage(Number(e.target.value));
                            setCoursePage(1);
                          }}
                          className="bg-surface-container-lowest border border-outline-variant rounded-lg px-sm py-xs font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-xs flex-wrap">
                      <button 
                        className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-50"
                        onClick={() => coursePage > 1 && setCoursePage(coursePage - 1)}
                        disabled={coursePage === 1}
                      >
                        <span className="material-symbols-outlined">chevron_left</span>
                      </button>
                      {Array.from({ length: totalCoursePages }).map((_, pIdx) => {
                        // Limit visible pages to prevent UI break if there are too many pages
                        if (totalPages > 6 && Math.abs(coursePage - (pIdx + 1)) > 2 && pIdx + 1 !== 1 && pIdx + 1 !== totalCoursePages) {
                          if (pIdx + 1 === 2 || pIdx + 1 === totalCoursePages - 1) {
                            return <span key={pIdx} className="px-xs text-outline select-none">...</span>;
                          }
                          return null;
                        }
                        return (
                          <button 
                            key={pIdx}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-all ${
                              coursePage === pIdx + 1 ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-bright'
                            }`}
                            onClick={() => setCoursePage(pIdx + 1)}
                          >
                            {pIdx + 1}
                          </button>
                        );
                      })}
                      <button 
                        className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-50"
                        onClick={() => coursePage < totalCoursePages && setCoursePage(coursePage + 1)}
                        disabled={coursePage === totalCoursePages}
                      >
                        <span className="material-symbols-outlined">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'cpl' && (
          <div className="p-gutter space-y-lg flex-1">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Data Capaian Pembelajaran Lulusan (CPL)</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Kelola standar CPL.</p>
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
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider">Deskripsi</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-on-surface-variant font-bold uppercase tracking-wider text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/50">
                      {cpls.length > 0 ? (
                        cpls.map((cpl, index) => (
                          <tr key={cpl.id} className="hover-row transition-colors">
                            <td className="px-lg py-md font-body-sm">{index + 1}</td>
                            <td className="px-lg py-md font-body-sm font-bold text-primary">{cpl.code}</td>
                            <td className="px-lg py-md font-body-sm text-on-surface-variant max-w-sm">{cpl.description}</td>
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
                          <td colSpan={4} className="px-lg py-xl text-center text-on-surface-variant">Belum ada data CPL.</td>
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
                          <td colSpan={5} className="px-lg py-xl text-center text-on-surface-variant">Belum ada pemetaan bobot.</td>
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
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {gradeInputMode === 'cpmk' && 'Isi nilai setiap CPMK per mata kuliah dan angkatan.'}
                  {gradeInputMode === 'single' && 'Isi satu nilai mata kuliah per mahasiswa; sistem membagikannya ke setiap CPMK mata kuliah.'}
                  {gradeInputMode === 'student' && 'Lihat dan ubah nilai mata kuliah per mahasiswa.'}
                </p>
              </div>
              {gradeInputMode === 'student' && <div className="flex flex-col md:flex-row items-center gap-md">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .pdf, application/pdf"
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
              </div>}
            </div>

            <div role="tablist" aria-label="Cara input nilai" className="inline-flex flex-wrap gap-xs rounded-xl border border-outline-variant bg-surface-container p-xs">
              {([
                ['cpmk', 'grid_on', 'Input per CPMK'],
                ['single', 'edit_note', 'Input Nilai Satuan'],
                ['student', 'person_search', 'Per Mahasiswa'],
              ] as const).map(([mode, icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={gradeInputMode === mode}
                  className={`flex items-center gap-xs rounded-lg px-lg py-sm font-label-sm font-bold transition-colors ${gradeInputMode === mode ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                  onClick={() => setGradeInputMode(mode)}
                >
                  <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
                </button>
              ))}
            </div>

            <div className={gradeInputMode === 'student' ? 'hidden' : ''}>
              <AdminGradeInput
                mode={gradeInputMode === 'single' ? 'single' : 'cpmk'}
                courses={courses}
                students={students}
                apiCall={apiCall}
                showToast={showToast}
                showNotice={showNotice}
                requestConfirmation={requestConfirmation}
                renderCoursePicker={(value, onChange, options) => (
                  <SearchablePicker
                    value={value}
                    onChange={onChange}
                    options={options}
                    placeholder="Pilih mata kuliah"
                    searchPlaceholder="Cari kode atau nama mata kuliah..."
                    emptyText="Mata kuliah tidak ditemukan."
                  />
                )}
              />
            </div>

            {gradeInputMode !== 'student' ? null : selectedStudentId ? (
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
                      <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[18px]">school</span> Semester aktif {getCurrentStudentSemester(students.find(s => s.id === selectedStudentId)?.angkatan)}</span>
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
                                  {grade.score !== null && grade.score !== undefined ? (grade.score > 10 ? grade.score : grade.score * 10) : '-'}
                                </span>
                              </td>
                              <td className="px-lg py-md">
                                <div className="flex items-center justify-center gap-sm">
                                  <button 
                                    className="p-xs text-on-surface-variant hover:text-primary transition-colors"
                                    onClick={() => openEditModal('grade', grade)}
                                    title="Ubah Nilai"
                                  >
                                    <span className="material-symbols-outlined text-[20px]">edit</span>
                                  </button>
                                  <button 
                                    className="p-xs text-on-surface-variant hover:text-error transition-colors"
                                    onClick={() => openDeleteConfirm('grade', grade.id, `${grade.courseName}`)}
                                    title="Hapus Nilai"
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
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                      <input 
                        type="text" 
                        placeholder="Nama atau NIM..." 
                        className="w-full bg-surface-container border border-outline-variant rounded-lg pl-[48px] pr-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
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
                    if (filteredGradeStudents.length === 0) {
                      return <div className="text-on-surface-variant p-xl text-center">Tidak ada mahasiswa yang cocok.</div>;
                    }

                    return (
                      <>
                        <div className="overflow-x-auto">
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
                              {currentGradeStudents.map((s, index) => (
                                <tr 
                                  key={s.id} 
                                  className="hover-row transition-colors cursor-pointer group"
                                  onClick={() => handleSelectStudentForGrades(s.id)}
                                >
                                  <td className="px-lg py-md font-body-sm text-on-surface-variant">{indexOfFirstGradeStudent + index + 1}</td>
                                  <td className="px-lg py-md font-body-sm font-bold text-on-surface">{s.nim}</td>
                                  <td className="px-lg py-md font-body-sm font-medium text-primary">{s.name}</td>
                                  <td className="px-lg py-md font-body-sm text-on-surface-variant">{s.angkatan}</td>
                                  <td className="px-lg py-md font-body-sm text-on-surface-variant">{s.kelas}</td>
                                  <td className="px-lg py-md text-right">
                                    <span className="material-symbols-outlined text-primary/70 group-hover:text-primary transition-colors">chevron_right</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        <div className="p-lg flex items-center justify-between border-t border-outline-variant/30 bg-white/[0.02] flex-wrap gap-md">
                          <div className="flex items-center gap-md flex-wrap">
                            <p className="font-body-sm text-body-sm text-on-surface-variant">
                              Menampilkan {currentGradeStudents.length} dari {totalGradeStudents} Mahasiswa
                            </p>
                            <div className="flex items-center gap-xs">
                              <span className="font-body-sm text-body-sm text-on-surface-variant">Tampilkan:</span>
                              <select 
                                value={gradeStudentItemsPerPage}
                                onChange={(e) => {
                                  setGradeStudentItemsPerPage(Number(e.target.value));
                                  setGradeStudentPage(1);
                                }}
                                className="bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-body-sm text-body-sm text-on-surface outline-none focus:border-primary cursor-pointer"
                              >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-xs flex-wrap">
                            <button 
                              className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-50"
                              onClick={() => gradeStudentPage > 1 && setGradeStudentPage(gradeStudentPage - 1)}
                              disabled={gradeStudentPage === 1}
                            >
                              <span className="material-symbols-outlined">chevron_left</span>
                            </button>
                            {Array.from({ length: totalGradeStudentPages }).map((_, pIdx) => {
                              if (totalGradeStudentPages > 6 && Math.abs(gradeStudentPage - (pIdx + 1)) > 2 && pIdx + 1 !== 1 && pIdx + 1 !== totalGradeStudentPages) {
                                if (pIdx + 1 === 2 || pIdx + 1 === totalGradeStudentPages - 1) {
                                  return <span key={pIdx} className="px-xs text-outline select-none">...</span>;
                                }
                                return null;
                              }
                              return (
                                <button 
                                  key={pIdx}
                                  className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-all ${
                                    gradeStudentPage === pIdx + 1 ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-bright'
                                  }`}
                                  onClick={() => setGradeStudentPage(pIdx + 1)}
                                >
                                  {pIdx + 1}
                                </button>
                              );
                            })}
                            <button 
                              className="w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-bright transition-colors disabled:opacity-50"
                              onClick={() => gradeStudentPage < totalGradeStudentPages && setGradeStudentPage(gradeStudentPage + 1)}
                              disabled={gradeStudentPage === totalGradeStudentPages}
                            >
                              <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {currentUser?.role === 'admin_jurusan' && activeTab === 'report_settings' && (
          <div className="p-gutter space-y-lg flex-1">
            <div>
              <h3 className="font-display-3xl text-display-3xl font-bold text-on-surface">Pengaturan Laporan</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Identitas penandatangan yang digunakan pada laporan CPL mahasiswa.</p>
            </div>

            <form onSubmit={handleSaveReportSettings} className="glass-panel p-xl rounded-xl max-w-3xl space-y-lg shadow-md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                <label className="space-y-xs">
                  <span className="block font-label-sm text-label-sm font-bold text-on-surface">Nama Kaprodi</span>
                  <input
                    type="text"
                    value={reportSettings.headName}
                    onChange={(event) => setReportSettings(current => ({ ...current, headName: event.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-on-surface outline-none focus:border-primary"
                    placeholder="Nama lengkap Kaprodi"
                    maxLength={255}
                    required
                  />
                </label>
                <label className="space-y-xs">
                  <span className="block font-label-sm text-label-sm font-bold text-on-surface">NIP</span>
                  <input
                    type="text"
                    value={reportSettings.headNip}
                    onChange={(event) => setReportSettings(current => ({ ...current, headNip: event.target.value }))}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-on-surface outline-none focus:border-primary"
                    placeholder="Nomor Induk Pegawai"
                    maxLength={100}
                    required
                  />
                </label>
              </div>

              <div className="space-y-sm">
                <span className="block font-label-sm text-label-sm font-bold text-on-surface">Tanda Tangan Kaprodi</span>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-lg">
                  <div className="w-56 h-32 border border-dashed border-outline-variant bg-white rounded-lg flex items-center justify-center overflow-hidden">
                    {reportSettings.signatureData ? (
                      <img src={reportSettings.signatureData} alt="Pratinjau tanda tangan Kaprodi" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-on-surface-variant text-center text-sm px-md">Belum ada tanda tangan</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-sm">
                    <button
                      type="button"
                      onClick={() => signatureFileInputRef.current?.click()}
                      className="inline-flex items-center gap-xs bg-secondary text-on-secondary px-md py-sm rounded-lg font-label-sm font-bold"
                    >
                      <span className="material-symbols-outlined text-[20px]">upload</span>
                      Pilih Gambar
                    </button>
                    {reportSettings.signatureData && (
                      <button
                        type="button"
                        onClick={() => setReportSettings(current => ({ ...current, signatureData: '' }))}
                        className="inline-flex items-center gap-xs border border-error text-error px-md py-sm rounded-lg font-label-sm font-bold"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                        Hapus
                      </button>
                    )}
                  </div>
                  <input
                    ref={signatureFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => {
                      handleSignatureFile(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Gunakan PNG transparan agar hasil cetak terlihat rapi. Ukuran maksimal 1,5 MB.</p>
              </div>

              <button
                type="submit"
                disabled={reportSettingsSaving}
                className="inline-flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-lg font-label-sm font-bold disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                {reportSettingsSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </form>
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
                  onClick={() => handlePrintReport('laporan-hasil-cpl-print-template', cplMatrixReportFileName, true)}
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
              <div className="flex-1 min-w-[200px]">
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Periode AMI</label>
                <select
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={cplMatrixSemesterType}
                  onChange={(e) => setCplMatrixSemesterType(e.target.value)}
                >
                  <option value="">Semua Periode</option>
                  <option value="ganjil">Ganjil</option>
                  <option value="genap">Genap</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block font-label-xs text-label-xs text-on-surface-variant mb-xs ml-1 uppercase">Tahun Ajaran</label>
                <select
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-md py-sm font-label-sm text-on-surface focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={cplMatrixAcademicYear}
                  onChange={(e) => setCplMatrixAcademicYear(e.target.value)}
                >
                  <option value="">Semua Tahun Ajaran</option>
                  {cplMatrixAcademicYears.map(year => (
                    <option key={year} value={year}>{year}</option>
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
                  <div>
                    <p className="font-label-xs text-outline uppercase mb-1">Periode AMI</p>
                    <p className="font-headline-lg text-on-surface font-semibold">{cplMatrixSemesterLabel}</p>
                  </div>
                  <div>
                    <p className="font-label-xs text-outline uppercase mb-1">Tahun Ajaran</p>
                    <p className="font-headline-lg text-on-surface font-semibold">{cplMatrixAcademicYear || 'Semua Tahun'}</p>
                  </div>
                </div>
              </div>

              {cplAverages.length > 0 ? (
              <div className="grid grid-cols-12 gap-lg animate-fade-in">
                {/* Charts */}
                <div className="col-span-12 flex flex-col gap-lg">
                  {/* Bar Chart (Top) */}
                  <BarChart measuredCpls={measuredCpls} />

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
                          <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider">CPL</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider">Deskripsi Kompetensi</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-center">Rata-rata Nilai</th>
                          <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-center">Status Keseluruhan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {cplAverages.length > 0 ? (
                          cplAverages.map((cpl) => {
                            const status = cpl.status || 'Belum Diukur';
                            const isExpanded = expandedAvgCplId === cpl.id;
                            return (
                              <React.Fragment key={cpl.id}>
                                <tr 
                                  className="hover:bg-primary/[0.03] transition-colors group cursor-pointer"
                                  onClick={async () => {
                                    if (isExpanded) {
                                      setExpandedAvgCplId(null);
                                      setExpandedAvgCplCourses([]);
                                      return;
                                    }
                                    setExpandedAvgCplId(cpl.id);
                                    setExpandedAvgCplLoading(true);
                                    try {
                                      let url = `/cpl/course-breakdown/${cpl.id}`;
                                      const params = new URLSearchParams();
                                      if (cplMatrixAngkatan) params.append('angkatan', cplMatrixAngkatan);
                                      if (cplMatrixKelas) params.append('kelas', cplMatrixKelas);
                                      if (cplMatrixSemesterType) params.append('semesterType', cplMatrixSemesterType);
                                      if (cplMatrixAcademicYear) params.append('academicYear', cplMatrixAcademicYear);
                                      if (params.toString()) url += `?${params.toString()}`;
                                      const data = await apiCall(url);
                                      setExpandedAvgCplCourses(data);
                                    } catch (e: any) {
                                      showToast(e.message || 'Gagal memuat detail matakuliah.');
                                      setExpandedAvgCplCourses([]);
                                    } finally {
                                      setExpandedAvgCplLoading(false);
                                    }
                                  }}
                                >
                                  <td className="px-lg py-lg font-bold text-primary">
                                    <div className="flex items-center gap-sm">
                                      <span className={`material-symbols-outlined text-[18px] text-primary/60 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                                      {cpl.code}
                                    </div>
                                  </td>
                                  <td className="px-lg py-lg text-body-sm text-on-surface-variant max-w-md">{cpl.description}</td>
                                  <td className="px-lg py-lg text-center font-bold text-headline-lg">{cpl.value === 0 ? '—' : cpl.value}</td>
                                  <td className="px-lg py-lg text-center">
                                    <span className={`inline-flex items-center gap-1.5 px-sm py-1 rounded-md text-label-xs font-bold border ${
                                      status.includes('Sangat kompeten') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                      status.includes('Kompeten') ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                      status.includes('Berkembang') ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                      status.includes('Tidak memuaskan') ? 'bg-error/20 text-error border-error/30' :
                                      'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                    }`}>
                                      {status}
                                    </span>
                                  </td>
                                </tr>
                                {/* Expanded sub-rows: course breakdown */}
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={4} className="p-0">
                                      <div className="bg-gradient-to-b from-primary/[0.03] to-transparent border-l-4 border-primary/30 mx-md my-sm rounded-lg overflow-hidden animate-fade-in">
                                        {expandedAvgCplLoading ? (
                                          <div className="px-xl py-lg text-center text-on-surface-variant font-body-sm flex items-center justify-center gap-sm">
                                            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                                            Memuat detail matakuliah...
                                          </div>
                                        ) : expandedAvgCplCourses.length === 0 ? (
                                          <div className="px-xl py-lg text-center text-on-surface-variant font-body-sm">
                                            Tidak ada matakuliah penyusun yang terpetakan.
                                          </div>
                                        ) : (
                                          <table className="w-full text-left border-collapse">
                                            <thead>
                                              <tr className="bg-primary/[0.05]">
                                                <th className="px-lg py-sm font-label-xs text-label-xs text-primary/80 font-bold uppercase tracking-wider">Kode MK</th>
                                                <th className="px-lg py-sm font-label-xs text-label-xs text-primary/80 font-bold uppercase tracking-wider">Nama Matakuliah</th>
                                                <th className="px-lg py-sm font-label-xs text-label-xs text-primary/80 font-bold uppercase tracking-wider text-center">SKS</th>
                                                <th className="px-lg py-sm font-label-xs text-label-xs text-primary/80 font-bold uppercase tracking-wider text-center">Bobot</th>
                                                <th className="px-lg py-sm font-label-xs text-label-xs text-primary/80 font-bold uppercase tracking-wider text-center">Rata-rata Nilai</th>
                                                <th className="px-lg py-sm font-label-xs text-label-xs text-primary/80 font-bold uppercase tracking-wider text-center">Mahasiswa Dinilai</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-primary/[0.08]">
                                              {expandedAvgCplCourses.map((course: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-primary/[0.02] transition-colors">
                                                  <td className="px-lg py-md font-body-sm text-primary font-bold">{course.course_code}</td>
                                                  <td className="px-lg py-md font-body-sm text-on-surface font-medium">{course.course_name}</td>
                                                  <td className="px-lg py-md font-body-sm text-on-surface-variant text-center">{course.sks}</td>
                                                  <td className="px-lg py-md font-body-sm text-on-surface-variant text-center">{course.weight}</td>
                                                  <td className="px-lg py-md text-center">
                                                    <span className={`inline-flex items-center justify-center min-w-[48px] px-sm py-[3px] rounded-md font-bold text-label-sm ${
                                                      course.average_score === 0 ? 'bg-slate-100 text-slate-500' :
                                                      course.average_score >= cplFormTarget ? 'bg-tertiary/15 text-tertiary' :
                                                      'bg-error/15 text-error'
                                                    }`}>
                                                      {course.average_score === 0 ? '—' : course.average_score}
                                                    </span>
                                                  </td>
                                                  <td className="px-lg py-md font-body-sm text-on-surface-variant text-center">
                                                    <span className="inline-flex items-center gap-1 text-label-xs">
                                                      <span className="material-symbols-outlined text-[14px]">group</span>
                                                      {course.students_graded}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
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
                <section className="col-span-12 grid grid-cols-2 lg:grid-cols-5 gap-md">
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-emerald-500">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Sangat Kompeten</p>
                    <p className="font-display-3xl font-bold text-emerald-500">{cplAverages.filter(c => c.value >= 85).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Skor 85 - 100 (Exemplary)</p>
                  </div>
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-blue-500">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Kompeten</p>
                    <p className="font-display-3xl font-bold text-blue-500">{cplAverages.filter(c => c.value >= 75 && c.value < 85).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Skor 75 - 84.99 (Competent)</p>
                  </div>
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-orange-500">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Berkembang</p>
                    <p className="font-display-3xl font-bold text-orange-500">{cplAverages.filter(c => c.value >= 60 && c.value < 75).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Skor 60 - 74.99 (Developing)</p>
                  </div>
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-red-500">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Tidak Memuaskan</p>
                    <p className="font-display-3xl font-bold text-red-500">{cplAverages.filter(c => c.value > 0 && c.value < 60).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Skor 0 - 59.99 (Unsatisfactory)</p>
                  </div>
                  <div className="glass-panel p-lg rounded-2xl flex flex-col justify-center border-l-4 border-outline-variant">
                    <p className="font-label-xs text-on-surface-variant uppercase mb-xs font-semibold">Belum Diukur</p>
                    <p className="font-display-3xl font-bold text-outline">{cplAverages.filter(c => c.value === 0).length}</p>
                    <p className="font-body-sm text-on-surface-variant mt-sm">Belum ada nilai</p>
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
              cplMatrixSemesterLabel={cplMatrixSemesterLabel}
              cplMatrixAcademicYear={cplMatrixAcademicYear}
              departmentName={currentUser?.departmentName}
              departmentCode={currentUser?.departmentCode}
              cplAverages={cplAverages}
              cplMatrixAverageIpk={cplMatrixAverageIpk}
              courseSummaries={courseSummaries}
              headName={reportSettings.headName}
              headNip={reportSettings.headNip}
              signatureData={reportSettings.signatureData}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="mt-auto px-gutter py-lg border-t border-slate-200 flex justify-between items-center opacity-60 bg-surface/20">
          <p className="font-label-xs text-label-xs text-on-surface-variant">© {new Date().getFullYear()} Politeknik Negeri Bali. Hak cipta dilindungi.</p>
          <div className="flex gap-lg">
            <a className="font-label-xs text-label-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Pusat Bantuan</a>
            <a className="font-label-xs text-label-xs text-on-surface-variant hover:text-primary transition-colors" href="#">Kebijakan Privasi</a>
          </div>
        </footer>
          </div>
        </main>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-md" role="dialog" aria-modal="true" aria-labelledby="password-modal-title" onMouseDown={event => { if (event.target === event.currentTarget && !passwordSaving) setShowPasswordModal(false); }}>
          <form onSubmit={savePassword} className="w-full max-w-[440px] bg-surface rounded-lg shadow-xl border border-outline">
            <div className="flex items-center justify-between px-lg py-md border-b border-outline"><div><p className="font-label-xs text-primary font-bold">AKUN</p><h4 id="password-modal-title" className="font-headline-xl font-bold text-on-surface">Ganti Kata Sandi</h4></div><button type="button" disabled={passwordSaving} onClick={() => setShowPasswordModal(false)} className="w-8 h-8 grid place-items-center rounded-md text-on-surface-variant hover:bg-surface-container" aria-label="Tutup"><span className="material-symbols-outlined text-[20px]">close</span></button></div>
            <div className="p-lg space-y-md">
              <label className="block font-label-sm text-on-surface">Kata sandi lama<input type="password" autoComplete="current-password" autoFocus required className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={passwordForm.currentPassword} onChange={event => setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))} /></label>
              <label className="block font-label-sm text-on-surface">Kata sandi baru<input type="password" autoComplete="new-password" required minLength={10} className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={passwordForm.password} onChange={event => setPasswordForm(current => ({ ...current, password: event.target.value }))} /><span className="mt-xs block font-label-xs text-on-surface-variant">Minimal 10 karakter; gunakan gabungan huruf, angka, dan simbol.</span></label>
              <label className="block font-label-sm text-on-surface">Ulangi kata sandi baru<input type="password" autoComplete="new-password" required className="mt-xs w-full border border-outline-variant rounded-md px-sm py-sm" value={passwordForm.passwordConfirmation} onChange={event => setPasswordForm(current => ({ ...current, passwordConfirmation: event.target.value }))} /></label>
              {passwordError && <p role="alert" className="rounded-md bg-error-container px-sm py-xs font-label-sm text-error">{passwordError}</p>}
            </div>
            <div className="flex justify-end gap-sm px-lg py-md border-t border-outline"><button type="button" disabled={passwordSaving} onClick={() => setShowPasswordModal(false)} className="px-lg py-sm text-on-surface-variant font-label-sm font-bold">Batal</button><button disabled={passwordSaving} className="bg-primary text-on-primary px-lg py-sm rounded-md font-label-sm font-bold disabled:opacity-50">{passwordSaving ? 'Menyimpan...' : 'Simpan Kata Sandi'}</button></div>
          </form>
        </div>
      )}

      {/* ================= APPLICATION DIALOG ================= */}
      {appDialog.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-gutter bg-slate-950/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
          <div className="w-full max-w-[520px] rounded-xl bg-white border border-outline-variant shadow-2xl overflow-hidden">
            <div className="flex items-start gap-md p-xl border-b border-outline-variant">
              <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${appDialog.tone === 'danger' ? 'bg-red-50 text-red-600' : appDialog.tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                <span className="material-symbols-outlined">{appDialog.tone === 'danger' ? 'warning' : appDialog.tone === 'warning' ? 'info' : 'help'}</span>
              </div>
              <div className="min-w-0">
                <h3 id="app-dialog-title" className="font-headline-xl font-bold text-on-surface">{appDialog.title}</h3>
                <p className="mt-xs whitespace-pre-line font-body-sm leading-relaxed text-on-surface-variant">{appDialog.message}</p>
              </div>
            </div>
            {appDialog.inputLabel && (
              <div className="px-xl pt-lg">
                <label className="block mb-xs font-label-sm font-bold text-on-surface">{appDialog.inputLabel}</label>
                <textarea
                  autoFocus
                  value={appDialogInput}
                  onChange={event => setAppDialogInput(event.target.value)}
                  placeholder={appDialog.inputPlaceholder}
                  className="w-full min-h-[110px] resize-y rounded-lg border border-outline-variant bg-surface-container-low px-md py-sm text-on-surface outline-none focus:border-primary"
                />
                {appDialog.inputMinLength && <p className="mt-xs font-label-xs text-on-surface-variant">Minimal {appDialog.inputMinLength} karakter.</p>}
              </div>
            )}
            <div className="flex justify-end gap-sm p-xl">
              {appDialog.showCancel && <button type="button" className="px-lg py-sm rounded-lg border border-outline-variant text-on-surface font-label-sm font-bold hover:bg-surface-container" onClick={() => closeAppDialog(false)}>{appDialog.cancelLabel}</button>}
              <button
                type="button"
                disabled={Boolean(appDialog.inputMinLength && appDialogInput.trim().length < appDialog.inputMinLength)}
                className={`px-lg py-sm rounded-lg font-label-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed ${appDialog.tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : appDialog.tone === 'warning' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:bg-primary/90'}`}
                onClick={() => closeAppDialog(true)}
              >{appDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PDF PREVIEW ================= */}
      {pdfPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-md lg:p-xl bg-slate-950/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title">
          <div className="w-full h-full max-w-[1100px] max-h-[92vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-lg py-md border-b border-outline-variant flex items-center justify-between gap-md">
              <div><h3 id="pdf-preview-title" className="font-headline-lg font-bold text-on-surface">Pratinjau Transkrip OBE</h3><p className="font-label-xs text-on-surface-variant">Periksa dokumen sebelum mengunduh.</p></div>
              <div className="flex items-center gap-sm">
                <a href={pdfPreview.url} download={pdfPreview.filename} className="inline-flex items-center gap-xs bg-primary text-on-primary px-md py-sm rounded-lg font-label-sm font-bold"><span className="material-symbols-outlined text-[18px]">download</span>Unduh PDF</a>
                <button type="button" title="Tutup pratinjau" className="w-9 h-9 grid place-items-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container" onClick={() => setPdfPreview(null)}><span className="material-symbols-outlined">close</span></button>
              </div>
            </div>
            <iframe title="Pratinjau Transkrip OBE" src={pdfPreview.url} className="flex-1 w-full bg-surface-container-low" />
          </div>
        </div>
      )}

      {/* ================= BULK DOWNLOAD LOADING MODAL ================= */}
      {bulkDownloadLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-gutter bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="glass-panel w-full max-w-[400px] rounded-2xl shadow-2xl overflow-hidden flex flex-col p-xl items-center text-center gap-lg">
            <span className="material-symbols-outlined text-[48px] text-primary animate-spin">progress_activity</span>
            <div>
              <h3 className="font-headline-lg text-headline-lg text-white font-bold mb-xs">Mempersiapkan Excel CPL</h3>
              <p className="text-body-sm text-on-surface-variant">
                Sedang memproses data mahasiswa...
              </p>
            </div>
            {/* Progress Bar Container */}
            <div className="w-full bg-surface-container rounded-full h-3 overflow-hidden border border-outline-variant/30">
              <div 
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${(bulkDownloadProgress / bulkDownloadTotal) * 100}%` }}
              ></div>
            </div>
            <p className="font-bold text-primary text-label-md">
              {bulkDownloadProgress} dari {bulkDownloadTotal} Mahasiswa
            </p>
          </div>
        </div>
      )}

      {/* ================= CRUD MODALS ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter bg-black/60 backdrop-blur-sm transition-opacity">
          <div className={`glass-panel w-full ${modalType === 'assignment' ? 'max-w-[900px]' : 'max-w-[560px]'} max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col scale-100 transition-all`}>
            <div className="px-xl py-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <h3 className="font-headline-xl text-headline-xl text-on-surface font-bold">
                {modalType === 'assignment' && modalAction === 'add' && assignmentStep === 3
                  ? 'Tambah Kelas Ajar Dosen'
                  : modalAction === 'add' ? `Tambah ${modalTypeLabel[modalType]}` : `Perbarui ${modalTypeLabel[modalType]}`}
              </h3>
              <button className="text-on-surface-variant hover:text-on-surface transition-colors p-xs" onClick={() => setIsModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveData} className="p-xl flex min-h-0 flex-col gap-lg overflow-y-auto custom-scrollbar">
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

              {/* Lecturer Form Fields */}
              {modalType === 'lecturer' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nama Lengkap</label>
                    <input className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all" placeholder="Nama dosen" type="text" value={lecturerFormName} onChange={(e) => setLecturerFormName(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">NIP/NIDN</label>
                    <input className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all" placeholder="Nomor identitas dosen" type="text" value={lecturerFormEmployeeNumber} onChange={(e) => setLecturerFormEmployeeNumber(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Email</label>
                    <input className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all" placeholder="dosen@pnb.ac.id" type="email" value={lecturerFormEmail} onChange={(e) => setLecturerFormEmail(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Password {modalAction === 'edit' && '(Kosongkan jika tidak ingin diubah)'}</label>
                    <input className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all" placeholder="••••••••" type="password" value={lecturerFormPassword} onChange={(e) => setLecturerFormPassword(e.target.value)} />
                  </div>
                  {currentUser?.role === 'super_admin' ? (
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Jurusan</label>
                      <select className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all cursor-pointer" value={lecturerFormDeptId} onChange={(e) => setLecturerFormDeptId(e.target.value)}>
                        <option value="">-- Pilih Jurusan --</option>
                        {departments.map(department => <option key={department.id} value={department.id}>{department.name} ({department.code})</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-sm">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Jurusan</label>
                      <div className="w-full bg-surface-container-low border border-outline-variant/40 rounded-lg py-md px-md text-on-surface-variant">{currentUser?.departmentName || 'Jurusan akun admin'}</div>
                    </div>
                  )}
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Status</label>
                    <div className="grid grid-cols-2 gap-sm">
                      {(['Aktif', 'Nonaktif'] as const).map(status => (
                        <button key={status} type="button" className={`py-sm px-md rounded-lg border font-label-sm font-bold transition-colors ${lecturerFormStatus === status ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`} onClick={() => setLecturerFormStatus(status)}>{status}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Teaching Assignment Form Fields */}
              {modalType === 'assignment' && (
                <>
                  {modalAction === 'add' && (
                    <>
                      {!assignmentContextLocked && <div className="grid grid-cols-3 gap-xs" aria-label={`Langkah ${assignmentStep} dari 3`}>
                        {[
                          { step: 1, label: 'Periode' },
                          { step: 2, label: 'Dosen' },
                          { step: 3, label: 'Kelas Ajar' },
                        ].map(item => (
                          <div key={item.step} className="text-center">
                            <div className={`h-1.5 rounded-full ${assignmentStep >= item.step ? 'bg-primary' : 'bg-outline-variant'}`} />
                            <span className={`mt-xs block font-label-xs font-bold ${assignmentStep === item.step ? 'text-primary' : 'text-on-surface-variant'}`}>{item.step}. {item.label}</span>
                          </div>
                        ))}
                      </div>}

                      {assignmentStep === 1 && (
                        <div className="flex flex-col gap-lg">
                          <div>
                            <h4 className="font-headline-lg font-bold text-on-surface">Pilih periode akademik</h4>
                            <p className="font-body-sm text-on-surface-variant">Penugasan dosen akan dikelompokkan berdasarkan periode ini.</p>
                          </div>
                          <div className="flex flex-col gap-sm">
                            <label className="font-label-sm text-on-surface-variant ml-xs">Tahun Ajaran</label>
                            <select
                              className="w-full bg-surface-container border border-outline-variant/60 rounded-lg py-md px-md text-on-surface"
                              value={assignmentAcademicYear}
                              onChange={(event) => {
                                const academicYear = event.target.value;
                                setAssignmentAcademicYear(academicYear);
                                setAssignmentCohortYear(academicYear.split('/')[0]);
                              }}
                            >
                              {Array.from({ length: 7 }, (_, index) => getActiveAcademicPeriod().academicStartYear - 2 + index).map(year => (
                                <option key={year} value={`${year}/${year + 1}`}>{year}/{year + 1}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-sm">
                            <label className="font-label-sm text-on-surface-variant ml-xs">Semester</label>
                            <div className="grid grid-cols-2 gap-sm">
                              {(['Ganjil', 'Genap'] as const).map(semester => (
                                <button key={semester} type="button" className={`rounded-lg border px-md py-md font-label-sm font-bold ${assignmentSemester === semester ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-surface-container text-on-surface-variant'}`} onClick={() => { setAssignmentSemester(semester); setAssignmentCourseId(''); }}>{semester}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {assignmentStep === 2 && (
                        <div className="flex flex-col gap-md">
                          <div className="rounded-lg border border-primary/20 bg-primary/5 px-md py-sm">
                            <span className="font-label-xs text-on-surface-variant">Periode dipilih</span>
                            <p className="font-body-sm font-bold text-primary">{assignmentSemester} · {assignmentAcademicYear}</p>
                          </div>
                          <div>
                            <h4 className="font-headline-lg font-bold text-on-surface">Pilih dosen pengampu</h4>
                            <p className="font-body-sm text-on-surface-variant">Cari berdasarkan nama, NIP/NIDN, atau email.</p>
                          </div>
                          <SearchablePicker
                            value={assignmentLecturerId}
                            onChange={setAssignmentLecturerId}
                            options={lecturers
                              .filter(lecturer => lecturer.status === 'Aktif')
                              .sort((first, second) => first.name.localeCompare(second.name, 'id'))
                              .map(lecturer => ({
                                value: lecturer.id,
                                label: lecturer.name,
                                meta: `NIP/NIDN: ${lecturer.employeeNumber}`,
                                searchText: `${lecturer.email} ${lecturer.departmentName || ''}`,
                              }))}
                            placeholder="Pilih dosen aktif"
                            searchPlaceholder="Cari nama, NIP/NIDN, atau email..."
                            emptyText="Dosen tidak ditemukan."
                            initiallyOpen
                          />
                        </div>
                      )}

                      {assignmentStep === 3 && (
                        <div className="flex flex-col gap-lg">
                          <div className="grid grid-cols-2 gap-sm">
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-md py-sm">
                              <span className="font-label-xs text-on-surface-variant">Periode</span>
                              <p className="truncate font-body-sm font-bold text-primary">{assignmentSemester} · {assignmentAcademicYear}</p>
                            </div>
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-md py-sm">
                              <span className="font-label-xs text-on-surface-variant">Dosen</span>
                              <p className="truncate font-body-sm font-bold text-primary">{lecturers.find(lecturer => lecturer.id === assignmentLecturerId)?.name || 'Belum dipilih'}</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-sm">
                            <label className="font-label-sm text-on-surface-variant ml-xs">Mata Kuliah</label>
                            <SearchablePicker
                              value={assignmentCourseId}
                              onChange={setAssignmentCourseId}
                              options={courses
                                .filter(course => {
                                  const courseSemester = Number(course.semester);
                                  return !courseSemester || (assignmentSemester === 'Ganjil' ? courseSemester % 2 === 1 : courseSemester % 2 === 0);
                                })
                                .sort((first, second) => first.code.localeCompare(second.code, 'id'))
                                .map(course => ({
                                  value: course.id,
                                  label: course.name,
                                  meta: `${course.code} · ${course.sks} SKS${course.semester ? ` · Semester ${course.semester}` : ''}`,
                                  searchText: course.code,
                                }))}
                              placeholder="Pilih mata kuliah"
                              searchPlaceholder="Cari kode atau nama mata kuliah..."
                              emptyText={`Tidak ada mata kuliah semester ${assignmentSemester.toLowerCase()} yang ditemukan.`}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-md">
                            <div className="flex flex-col gap-sm">
                              <label className="font-label-sm text-on-surface-variant ml-xs">Kelas</label>
                              <select className="w-full bg-surface-container border border-outline-variant/60 rounded-lg py-md px-md text-on-surface" value={assignmentClassName} onChange={(e) => setAssignmentClassName(e.target.value)}>
                                <option value="">-- Pilih Kelas --</option>
                                {availableClassNames.map(className => <option key={className} value={className}>{className}</option>)}
                              </select>
                              <p className="font-label-xs text-on-surface-variant">Pilihan kelas mengikuti kelas pada Data Mahasiswa.</p>
                            </div>
                            <div className="flex flex-col gap-sm">
                              <label className="font-label-sm text-on-surface-variant ml-xs">Angkatan</label>
                              <input className="w-full bg-surface-container border border-outline-variant/60 rounded-lg py-md px-md text-on-surface" type="number" min="2000" max="2100" value={assignmentCohortYear} onChange={(e) => setAssignmentCohortYear(e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {modalAction === 'edit' && (
                    <div className="bg-surface-container-low border border-outline-variant/40 rounded-lg p-md text-body-sm text-on-surface-variant">
                      Mata kuliah, dosen, kelas, dan periode tidak diubah pada penugasan yang sudah dibuat. Hapus lalu buat penugasan baru jika struktur tersebut keliru.
                    </div>
                  )}
                  {(modalAction === 'edit' || assignmentStep === 3) && <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-on-surface-variant ml-xs">Status Penugasan</label>
                    <div className="grid grid-cols-2 gap-sm">
                      {(['Aktif', 'Nonaktif'] as const).map(status => <button key={status} type="button" className={`py-sm px-md rounded-lg border font-label-sm font-bold ${assignmentStatus === status ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`} onClick={() => setAssignmentStatus(status)}>{status}</button>)}
                    </div>
                  </div>}
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
                      <select
                        className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        value={studentFormKelas}
                        onChange={(e) => setStudentFormKelas(e.target.value)}
                      >
                        <option value="">-- Pilih Kelas --</option>
                        {availableClassNames.map(className => <option key={className} value={className}>{className}</option>)}
                      </select>
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
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Semester Kurikulum</label>
                    <select
                      className="w-full bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm py-md px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                      value={courseFormSemester}
                      onChange={(e) => setCourseFormSemester(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(semester => (
                        <option key={semester} value={semester}>Semester {semester}</option>
                      ))}
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
                      placeholder="Contoh: CPL-1"
                      type="text"
                      value={cplFormCode}
                      onChange={(e) => setCplFormCode(e.target.value)}
                    />
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
                </>
              )}

              {/* Mapping Link Form Fields Removed */}


              {/* Grade Form Fields */}
              {modalType === 'grade' && (
                <>
                  <div className="flex flex-col gap-sm">
                    <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Mata Kuliah</label>
                    <select 
                      disabled={modalAction === 'edit'}
                      className={`w-full h-[46px] border border-outline-variant/60 rounded-lg shadow-sm px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all ${
                        modalAction === 'edit' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-surface-container'
                      }`}
                      value={gradeFormCourseId}
                      onChange={(e) => {
                        const courseId = e.target.value;
                        setGradeFormCourseId(courseId);
                        setGradeFormSemester(getDefaultGradeSemester(courseId));
                      }}
                    >
                      <option value="">-- Pilih Mata Kuliah --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code}){c.semester ? ` - Semester ${c.semester}` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-12 gap-md">
                    <div className="flex flex-col gap-sm col-span-3">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nilai Angka</label>
                      <input 
                        className="w-full h-[46px] bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        placeholder="e.g. 80"
                        type="text"
                        value={gradeFormScore}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGradeFormScore(val);
                          const num = Number(val.replace(',', '.'));
                          if (!isNaN(num) && num >= 0 && num <= 100) {
                            setGradeFormLetter(getGradeLetter(num));
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-sm col-span-3">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Nilai Huruf</label>
                      <select 
                        disabled
                        className="w-full h-[46px] bg-slate-50 border border-outline-variant/60 rounded-lg shadow-sm px-md text-slate-500 font-body-base cursor-not-allowed focus:outline-none"
                        value={gradeFormLetter}
                        onChange={(e) => setGradeFormLetter(e.target.value)}
                      >
                        <option value="A">A</option>
                        <option value="AB">AB</option>
                        <option value="B">B</option>
                        <option value="BC">BC</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-sm col-span-2">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs">Semester</label>
                      <input 
                        className="w-full h-[46px] bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        placeholder="e.g. IV"
                        type="text"
                        value={gradeFormSemester}
                        onChange={(e) => setGradeFormSemester(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-sm col-span-4">
                      <label className="font-label-sm text-label-sm text-on-surface-variant ml-xs whitespace-nowrap">Tahun Akademik</label>
                      <input 
                        className="w-full h-[46px] bg-surface-container border border-outline-variant/60 rounded-lg shadow-sm px-md text-on-surface font-body-base focus:outline-none focus:border-primary transition-all"
                        placeholder="e.g. 2024/2025"
                        type="text"
                        value={gradeFormYear}
                        onChange={(e) => setGradeFormYear(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="sticky -bottom-xl z-20 -mx-xl -mb-xl mt-lg flex justify-end gap-md border-t border-outline-variant bg-white px-xl py-lg shadow-[0_-8px_20px_rgba(15,23,42,0.06)]">
                <button 
                  type="button" 
                  className="bg-surface-bright text-on-surface px-lg py-md rounded-xl font-label-sm text-label-sm hover:bg-surface-container-highest transition-colors cursor-pointer"
                  onClick={() => setIsModalOpen(false)}
                >
                  Batal
                </button>
                {modalType === 'assignment' && modalAction === 'add' && assignmentStep > 1 && !assignmentContextLocked && (
                  <button
                    key="assignment-next"
                    type="button"
                    className="inline-flex items-center gap-xs rounded-xl border border-primary px-lg py-md font-label-sm font-bold text-primary hover:bg-primary/5"
                    onClick={() => { setModalError(''); setAssignmentStep(current => (current === 3 ? 2 : 1)); }}
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>Kembali
                  </button>
                )}
                {modalType === 'assignment' && modalAction === 'add' && assignmentStep < 3 ? (
                  <button
                    type="button"
                    disabled={assignmentStep === 1 ? !assignmentAcademicYear || !assignmentSemester : !assignmentLecturerId}
                    className="inline-flex items-center gap-xs rounded-xl bg-primary px-lg py-md font-label-sm font-bold text-on-primary btn-glow disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => { setModalError(''); setAssignmentStep(current => (current === 1 ? 2 : 3)); }}
                  >
                    Lanjutkan<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                ) : (
                  <button
                    key="modal-submit"
                    type="submit"
                    className="bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold btn-glow transition-all cursor-pointer"
                  >
                    {modalType === 'assignment' && modalAction === 'add' ? 'Simpan Penugasan' : 'Simpan Data'}
                  </button>
                )}
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
          <div className="glass-panel w-full max-w-[800px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-white">
            <div className="px-xl py-lg border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="font-headline-xl text-headline-xl text-slate-900 font-bold">
                  Detail Pemetaan Mata Kuliah
                </h3>
                <p className="font-label-xs text-label-xs text-primary font-bold">{selectedCplForDetail}</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600 transition-colors p-xs" onClick={() => setSelectedCplForDetail(null)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-xl flex flex-col gap-md overflow-y-auto bg-white">
              <div className="bg-slate-50 p-md rounded-lg border border-slate-200 mb-sm shrink-0">
                <p className="font-label-xs text-label-xs text-slate-500 uppercase font-bold mb-xs">Deskripsi CPL</p>
                <p className="font-body-sm text-body-sm text-slate-800 font-medium leading-relaxed">
                  {selectedStudentAchievements.find(c => c.code === selectedCplForDetail)?.description}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-md py-sm font-label-xs text-label-xs text-slate-600 font-bold uppercase">Kode MK</th>
                      <th className="px-md py-sm font-label-xs text-label-xs text-slate-600 font-bold uppercase">Nama Mata Kuliah</th>
                      <th className="px-md py-sm font-label-xs text-label-xs text-slate-600 font-bold uppercase text-center">SKS</th>
                      <th className="px-md py-sm font-label-xs text-label-xs text-slate-600 font-bold uppercase text-center">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cplDetailMappingCourses.map((course) => {
                      const cplAchievement = selectedStudentAchievements.find(cpl => cpl.code === selectedCplForDetail);
                      const obeMeasured = cplAchievement && cplAchievement.status !== 'Belum Diukur' && Number(cplAchievement.value) > 0;
                      return <tr key={course.code} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-md py-md font-body-sm text-primary font-bold">
                          {course.code}
                        </td>
                        <td className="px-md py-md font-body-sm text-slate-800 font-semibold">
                          {course.name}
                        </td>
                        <td className="px-md py-md font-body-sm text-slate-700 text-center font-medium">
                          {course.sks}
                        </td>
                        <td className="px-md py-md font-body-sm text-center">
                          <span className={`inline-flex items-center justify-center min-w-[40px] px-sm py-[2px] rounded font-bold text-label-xs ${
                            obeMeasured ? 'bg-tertiary/10 text-tertiary' : course.grade === 'Belum Diambil' ? 'bg-slate-100 text-slate-500' :
                            (course.score && (course.score > 10 ? course.score : course.score * 10) < 65) ? 'bg-error/10 text-error' :
                            'bg-tertiary/10 text-tertiary'
                          }`}>
                            {obeMeasured ? `OBE ${Number(cplAchievement.value).toFixed(2)}` : course.grade === 'Belum Diambil' ? 'Belum Diambil' : `${course.grade} (${course.score !== null && course.score !== undefined ? (course.score > 10 ? course.score : course.score * 10) : '-'})`}
                          </span>
                        </td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-xl py-lg border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
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

      {/* COURSE CPL ACHIEVEMENTS REPORT MODAL */}
      {isCourseReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-[1100px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-white">
            {/* Modal Header */}
            <div className="px-xl py-lg border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h3 className="font-headline-xl text-headline-xl text-slate-900 font-bold flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary text-[28px]">analytics</span>
                  Laporan Capaian CPL per Mata Kuliah
                </h3>
                <p className="font-label-xs text-label-xs text-slate-500">
                  Analisis pemetaan CPL dan rata-rata ketercapaian per Mata Kuliah untuk Kelas/Angkatan.
                </p>
              </div>
              <div className="flex items-center gap-md">
                <button 
                  className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-label-xs text-label-xs font-bold glow-primary hover:scale-105 transition-transform duration-200 cursor-pointer"
                  onClick={handleDownloadAllCourseCplReports}
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Cetak Semua Laporan
                </button>
                <button className="text-slate-400 hover:text-slate-600 transition-colors p-xs cursor-pointer" onClick={() => setIsCourseReportModalOpen(false)}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            {/* Modal Filters & Search */}
            <div className="p-lg bg-slate-50 border-b border-slate-200 flex flex-wrap gap-md items-center shrink-0">
              <div className="flex-1 min-w-[240px] relative rounded-lg">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  search
                </span>
                <input 
                  className="w-full bg-white border border-slate-300 rounded-lg pl-[36px] pr-md py-sm font-body-sm text-body-sm text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none" 
                  placeholder="Cari Mata Kuliah..." 
                  type="text"
                  value={courseReportSearch}
                  onChange={(e) => setCourseReportSearch(e.target.value)}
                />
              </div>

              <div className="w-[180px]">
                <select 
                  className="w-full bg-white border border-slate-300 rounded-lg px-md py-sm font-label-sm text-slate-800 focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={courseReportAngkatan}
                  onChange={(e) => setCourseReportAngkatan(e.target.value)}
                >
                  <option value="">Semua Angkatan</option>
                  {uniqueAngkatanList.map(angkatan => (
                    <option key={angkatan} value={angkatan}>{angkatan}</option>
                  ))}
                </select>
              </div>

              <div className="w-[180px]">
                <select 
                  className="w-full bg-white border border-slate-300 rounded-lg px-md py-sm font-label-sm text-slate-800 focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
                  value={courseReportKelas}
                  onChange={(e) => setCourseReportKelas(e.target.value)}
                >
                  <option value="">Semua Kelas</option>
                  {uniqueKelasList.map(kelas => (
                    <option key={kelas} value={kelas}>{kelas}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal Body / Table */}
            <div className="p-xl overflow-y-auto flex-1 bg-slate-50">
              {courseReportLoading ? (
                <div className="flex flex-col items-center justify-center py-2xl text-slate-500 font-body-base gap-md">
                  <span className="material-symbols-outlined animate-spin text-primary text-[36px]">progress_activity</span>
                  Memuat analisis mata kuliah...
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider w-[60px]">No</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider w-[120px]">Kode MK</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider">Nama Mata Kuliah</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-center w-[80px]">SKS</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-center w-[160px]">Rata-rata Nilai</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider w-[240px]">CPL Penyusun</th>
                        <th className="px-lg py-md font-label-xs text-label-xs text-slate-600 font-bold uppercase tracking-wider text-center w-[180px]">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const searchVal = courseReportSearch.trim().toLowerCase();
                        const filtered = courseSummaries.filter(c => {
                          if (!searchVal) return true;
                          return c.code.toLowerCase().includes(searchVal) || c.name.toLowerCase().includes(searchVal);
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={7} className="px-lg py-xl text-center text-slate-400 font-body-sm">
                                Tidak ada data mata kuliah.
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map((course, idx) => {
                          const isExpanded = expandedSummaryCourseId === course.id;
                          return (
                            <React.Fragment key={course.id}>
                              <tr 
                                className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                                onClick={() => setExpandedSummaryCourseId(isExpanded ? null : course.id)}
                              >
                                <td className="px-lg py-lg font-body-sm text-slate-500">{idx + 1}</td>
                                <td className="px-lg py-lg font-body-sm text-primary font-bold">{course.code}</td>
                                <td className="px-lg py-lg font-body-sm text-slate-800 font-semibold">{course.name}</td>
                                <td className="px-lg py-lg font-body-sm text-slate-600 text-center">{course.sks}</td>
                                <td className="px-lg py-lg text-center font-bold text-slate-800">
                                  {course.average_grade ? Number(course.average_grade).toFixed(2) : '0.00'}
                                  <span className="block text-[10px] text-slate-400 font-normal">
                                    {course.grades_count} mhs dinilai
                                  </span>
                                </td>
                                <td className="px-lg py-lg">
                                  <div className="flex flex-wrap gap-xs">
                                    {course.mappings && course.mappings.length > 0 ? (
                                      course.mappings.map((m: any) => (
                                        <span 
                                          key={m.cpl_id} 
                                          title={`${m.cpl_code}: ${m.cpl_status}`}
                                          className={`inline-flex items-center px-sm py-[2px] rounded text-[10px] font-bold ${
                                            (m.cpl_status || '').includes('Sangat kompeten') ? 'bg-emerald-500/10 text-emerald-600' :
                                            (m.cpl_status || '').includes('Kompeten') ? 'bg-blue-500/10 text-blue-600' :
                                            (m.cpl_status || '').includes('Berkembang') ? 'bg-amber-500/10 text-amber-600' :
                                            (m.cpl_status || '').includes('Tidak memuaskan') ? 'bg-error/10 text-error' :
                                            'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {m.cpl_code}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-[10px] text-slate-400">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-lg py-lg text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-sm">
                                    <button 
                                      className="flex items-center gap-xs text-primary hover:text-primary-dark font-label-xs text-label-xs font-bold cursor-pointer"
                                      onClick={() => setExpandedSummaryCourseId(isExpanded ? null : course.id)}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">
                                        {isExpanded ? 'expand_less' : 'expand_more'}
                                      </span>
                                      {isExpanded ? 'Tutup' : 'Detail'}
                                    </button>
                                    <button 
                                      className="flex items-center gap-xs text-secondary hover:text-secondary-dark font-label-xs text-label-xs font-bold cursor-pointer"
                                      onClick={() => handleDownloadSingleCourseCplReport(course)}
                                    >
                                      <span className="material-symbols-outlined text-[16px]">download</span>
                                      PDF
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Expanding Row Detail */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} className="p-lg bg-slate-50/50">
                                    <div className="bg-white border border-slate-200 rounded-xl p-lg shadow-sm flex flex-col md:flex-row gap-lg animate-fade-in">
                                      {/* Left side: Constituent CPL Table */}
                                      <div className="flex-1 space-y-md">
                                        <h4 className="font-headline-sm text-headline-sm font-bold text-slate-800">
                                          Pemetaan dan Capaian CPL Penyusun
                                        </h4>
                                        <div className="overflow-x-auto rounded-lg border border-slate-100">
                                          <table className="w-full text-left border-collapse">
                                            <thead>
                                              <tr className="bg-slate-50 border-b border-slate-100">
                                                <th className="px-md py-sm font-label-xs text-label-xs text-slate-500 font-bold uppercase w-[60px]">CPL</th>
                                                <th className="px-md py-sm font-label-xs text-label-xs text-slate-500 font-bold uppercase">Deskripsi</th>
                                                <th className="px-md py-sm font-label-xs text-label-xs text-slate-500 font-bold uppercase text-center w-[70px]">Bobot</th>
                                                <th className="px-md py-sm font-label-xs text-label-xs text-slate-500 font-bold uppercase text-center w-[90px]">Capaian Kelas</th>
                                                <th className="px-md py-sm font-label-xs text-label-xs text-slate-500 font-bold uppercase text-center w-[90px]">Status</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                              {course.mappings && course.mappings.length > 0 ? (
                                                course.mappings.map((m: any) => (
                                                  <tr key={m.cpl_id} className="hover:bg-slate-50/40">
                                                    <td className="px-md py-md font-body-sm text-primary font-bold">{m.cpl_code}</td>
                                                    <td className="px-md py-md font-body-sm text-slate-600 leading-relaxed">{m.cpl_desc}</td>
                                                    <td className="px-md py-md font-body-sm text-slate-700 text-center font-medium">{m.weight}</td>
                                                    <td className="px-md py-md font-body-sm text-slate-900 text-center font-bold">{m.cpl_average}%</td>
                                                    <td className="px-md py-md text-center">
                                                      <span className={`inline-flex items-center px-sm py-[2px] rounded text-label-xs font-bold ${
                                                        (m.cpl_status || '').includes('Sangat kompeten') ? 'bg-emerald-500/10 text-emerald-600' :
                                                        (m.cpl_status || '').includes('Kompeten') ? 'bg-blue-500/10 text-blue-600' :
                                                        (m.cpl_status || '').includes('Berkembang') ? 'bg-amber-500/10 text-amber-600' :
                                                        (m.cpl_status || '').includes('Tidak memuaskan') ? 'bg-error/10 text-error' :
                                                        'bg-slate-100 text-slate-500'
                                                      }`}>
                                                        {m.cpl_status}
                                                      </span>
                                                    </td>
                                                  </tr>
                                                ))
                                              ) : (
                                                <tr>
                                                  <td colSpan={5} className="px-md py-lg text-center text-slate-400 font-body-sm">
                                                    Belum ada CPL yang terpetakan untuk mata kuliah ini.
                                                  </td>
                                                </tr>
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>

                                      {/* Right side: SVG Chart */}
                                      <div className="w-full md:w-[380px] shrink-0 border-t md:border-t-0 md:border-l border-slate-100 pt-md md:pt-0 md:pl-lg flex flex-col items-center justify-center">
                                        <h4 className="font-label-sm text-label-sm font-bold text-slate-500 uppercase tracking-wider mb-sm">
                                          Visualisasi Capaian
                                        </h4>
                                        {course.mappings && course.mappings.length >= 3 ? (
                                          <div className="w-full">
                                            <CourseRadarChart mappings={course.mappings} />
                                          </div>
                                        ) : course.mappings && course.mappings.length > 0 ? (
                                          <div className="w-full space-y-md py-sm">
                                            {course.mappings.map((m: any) => (
                                              <div key={m.cpl_id} className="space-y-xs">
                                                <div className="flex justify-between font-label-xs text-label-xs font-bold text-slate-600">
                                                  <span>{m.cpl_code}</span>
                                                  <span>{m.cpl_average}% / Target {m.cpl_target || cplFormTarget}%</span>
                                                </div>
                                                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
                                                  <div 
                                                    className="h-full bg-primary rounded-full transition-all duration-500" 
                                                    style={{ width: `${m.cpl_average}%` }}
                                                  />
                                                  <div 
                                                    className="absolute top-0 bottom-0 w-[2px] bg-cyan-500"
                                                    style={{ left: `${m.cpl_target || cplFormTarget}%` }}
                                                    title={`Target: ${m.cpl_target || cplFormTarget}%`}
                                                  />
                                                </div>
                                              </div>
                                            ))}
                                            <div className="flex justify-start gap-md pt-sm border-t border-slate-100 text-[10px] text-slate-400">
                                              <div className="flex items-center gap-xs">
                                                <span className="w-2.5 h-2.5 bg-primary rounded" />
                                                <span>Capaian</span>
                                              </div>
                                              <div className="flex items-center gap-xs">
                                                <span className="w-[2px] h-2.5 bg-cyan-500" />
                                                <span>Target</span>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-center text-slate-400 font-body-sm py-xl flex flex-col items-center gap-sm">
                                            <span className="material-symbols-outlined text-[32px]">warning</span>
                                            Tidak ada grafik (Belum ada CPL terpetakan)
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-xl py-lg border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
              <button 
                className="bg-primary text-on-primary px-lg py-md rounded-xl font-label-sm text-label-sm font-bold btn-glow transition-all cursor-pointer"
                onClick={() => setIsCourseReportModalOpen(false)}
              >
                Tutup Laporan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
