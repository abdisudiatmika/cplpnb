import React from 'react';

interface LandingPageProps {
  onLoginClick: (role: 'admin' | 'dosen') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-[#12449E] to-[#0A265A] text-white pt-24 pb-32 px-6 flex flex-col items-center text-center overflow-hidden">
        {/* Abstract Background Shapes (Optional for depth) */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] bg-indigo-500/20 rounded-full blur-[100px]"></div>

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <div className="border border-white/20 bg-white/10 backdrop-blur-md rounded-full px-6 py-2 text-sm font-semibold tracking-wider text-blue-100 mb-8 inline-block shadow-sm">
            POLITEKNIK NEGERI BALI
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Sistem Informasi <span className="text-[#FFC107]">Capaian Pembelajaran Lulusan</span>
          </h1>

          <p className="text-lg md:text-xl text-blue-100 max-w-2xl mb-12 leading-relaxed">
            Platform pengelolaan dan pemantauan CPL berbasis mata kuliah untuk mendukung akreditasi dan mutu akademik PNB.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
            <button 
              onClick={() => onLoginClick('admin')}
              className="flex items-center justify-center gap-2 bg-[#FFC107] hover:bg-[#FFB300] text-gray-900 font-bold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
              <span className="material-symbols-outlined font-bold text-xl">admin_panel_settings</span>
              Login Admin
            </button>
            <button 
              onClick={() => onLoginClick('dosen')}
              className="flex items-center justify-center gap-2 bg-transparent border-2 border-white hover:bg-white/10 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
            >
              <span className="material-symbols-outlined text-xl">school</span>
              Login Dosen
            </button>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="flex-1 max-w-6xl mx-auto px-6 py-20 w-full relative z-20 -mt-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Fitur Utama</h2>
          <p className="text-gray-600 text-lg">Semua yang dibutuhkan untuk mengelola CPL secara efektif</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">bar_chart</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Pemantauan Capaian CPL</h3>
            <p className="text-gray-600 leading-relaxed">
              Pantau capaian CPL setiap mahasiswa per semester secara otomatis berdasarkan nilai mata kuliah.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">menu_book</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Manajemen Mata Kuliah & CPL</h3>
            <p className="text-gray-600 leading-relaxed">
              Kelola pemetaan mata kuliah terhadap CPL program studi dengan bobot penilaian yang fleksibel.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">badge</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Input Nilai oleh Dosen</h3>
            <p className="text-gray-600 leading-relaxed">
              Dosen dapat menginput nilai mahasiswa secara langsung melalui portal khusus yang terintegrasi.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-yellow-100 text-yellow-600 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">table_view</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Import & Ekspor Data</h3>
            <p className="text-gray-600 leading-relaxed">
              Impor data nilai mahasiswa dari template Excel dan ekspor laporan CPL secara mudah.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">check_circle</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Perhitungan Otomatis</h3>
            <p className="text-gray-600 leading-relaxed">
              Sistem menghitung bobot CPL secara otomatis berdasarkan komponen penilaian yang telah dikonfigurasi.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">group</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Multi-peran Pengguna</h3>
            <p className="text-gray-600 leading-relaxed">
              Dukungan peran Admin dan Dosen dengan hak akses yang terpisah dan aman.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0C2D6B] text-blue-100 py-6 px-6 md:px-12 w-full mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
          <div className="font-bold tracking-wide">Politeknik Negeri Bali</div>
          <div className="text-blue-200">Sistem Informasi Capaian Pembelajaran Lulusan — © 2026</div>
          <div className="hover:text-white transition-colors cursor-pointer">www.pnb.ac.id</div>
        </div>
      </footer>
    </div>
  );
};
