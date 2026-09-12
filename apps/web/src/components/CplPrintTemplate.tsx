import React from 'react';

interface CplPrintTemplateProps {
  cplMatrixAngkatan: string;
  cplMatrixKelas: string;
  cplMatrixSemesterLabel: string;
  cplMatrixAcademicYear: string;
  departmentName?: string | null;
  departmentCode?: string | null;
  cplAverages: Array<{
    id: string;
    code: string;
    description: string;
    category: string;
    value: number;
  }>;
  cplMatrixAverageIpk: number | null;
}

export const CplPrintTemplate: React.FC<CplPrintTemplateProps> = ({
  cplMatrixAngkatan,
  cplMatrixKelas,
  cplMatrixSemesterLabel,
  cplMatrixAcademicYear,
  departmentName,
  departmentCode,
  cplAverages,
  cplMatrixAverageIpk,
}) => {
  const criteria = [
    {
      label: 'Sangat kompeten',
      english: 'Exemplary',
      range: '85 - 100',
      description: 'CPL tercapai sangat baik dan melampaui standar kompetensi minimum.',
      color: '#047857',
      backgroundColor: '#ecfdf5',
    },
    {
      label: 'Kompeten',
      english: 'Competent',
      range: '75 - 84.99',
      description: 'CPL tercapai sesuai standar kompetensi yang diharapkan.',
      color: '#1d4ed8',
      backgroundColor: '#eff6ff',
    },
    {
      label: 'Berkembang',
      english: 'Developing',
      range: '60 - 74.99',
      description: 'CPL mulai tercapai, namun masih membutuhkan penguatan pembelajaran.',
      color: '#b45309',
      backgroundColor: '#fffbeb',
    },
    {
      label: 'Tidak memuaskan',
      english: 'Unsatisfactory',
      range: '0 - 59.99',
      description: 'CPL belum tercapai dan membutuhkan evaluasi pembelajaran lebih lanjut.',
      color: '#b91c1c',
      backgroundColor: '#fef2f2',
    },
    {
      label: 'Belum Diukur',
      english: '-',
      range: '-',
      description: 'Belum terdapat nilai yang dapat digunakan untuk menghitung CPL.',
      color: '#475569',
      backgroundColor: '#f8fafc',
    },
  ];

  const sortedCpls = [...cplAverages].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
  );

  const chartCpls = sortedCpls.filter(cpl => cpl.value > 0);
  const maxChartValue = Math.max(100, ...chartCpls.map(cpl => cpl.value));
  const groupedCpls = sortedCpls.reduce<Record<string, typeof sortedCpls>>((groups, cpl) => {
    const category = cpl.category || 'Lainnya';
    groups[category] = groups[category] || [];
    groups[category].push(cpl);
    return groups;
  }, {});
  const categoryOrder = ['Sikap', 'Pengetahuan', 'Keterampilan Umum', 'Keterampilan Khusus'];
  const orderedCategories = [
    ...categoryOrder.filter(category => groupedCpls[category]?.length),
    ...Object.keys(groupedCpls).filter(category => !categoryOrder.includes(category)),
  ];
  const reportDepartmentName = departmentName || 'Program Studi';
  const reportDepartmentCode = departmentCode ? ` (${departmentCode})` : '';
  const reportAcademicYear = cplMatrixAcademicYear || 'Semua Tahun Ajaran';

  return (
    <div 
      id="laporan-hasil-cpl-print-template" 
      style={{ 
        position: 'absolute', 
        left: '-9999px', 
        top: '0', 
        width: '800px', 
        backgroundColor: '#ffffff', 
        color: '#000000', 
        padding: '40px 50px',
        fontFamily: '"Times New Roman", Georgia, serif',
        lineHeight: '1.6'
      }}
    >
      {/* Cover */}
      <div
        data-pdf-block
        style={{
          minHeight: '900px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          border: '2px solid #000000',
          padding: '42px',
          marginBottom: '30px',
        }}
      >
        <img
          crossOrigin="anonymous"
          src="https://upload.wikimedia.org/wikipedia/id/e/ed/Logo_Politeknik_Negeri_Bali.png"
          alt="Logo Politeknik Negeri Bali"
          style={{
            width: '110px',
            height: '110px',
            objectFit: 'contain',
            marginBottom: '34px',
          }}
        />
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 18px 0', textTransform: 'uppercase', lineHeight: '1.35' }}>
          Laporan Evaluasi
        </h1>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 34px 0', textTransform: 'uppercase', lineHeight: '1.35' }}>
          Capaian Pembelajaran Lulusan (CPL)
        </h2>
        <div style={{ width: '120px', height: '3px', backgroundColor: '#000000', marginBottom: '34px' }} />
        <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase' }}>
          {reportDepartmentName}{reportDepartmentCode}
        </p>
        <p style={{ fontSize: '14px', margin: '0 0 8px 0' }}>
          Angkatan {cplMatrixAngkatan || 'Semua'} | {cplMatrixKelas || 'Semua Kelas'}
        </p>
        <p style={{ fontSize: '14px', margin: '0 0 8px 0' }}>
          Periode AMI {cplMatrixSemesterLabel} | Tahun Ajaran {reportAcademicYear}
        </p>
        <p style={{ fontSize: '14px', margin: '0 0 62px 0' }}>
          Politeknik Negeri Bali
        </p>
        <p style={{ fontSize: '12px', margin: '0', color: '#333333' }}>
          Dokumen ini disusun berdasarkan data CPL, mata kuliah, dan nilai mahasiswa yang tersimpan pada sistem.
        </p>
      </div>

      {/* Standar CPL */}
      <div style={{ marginBottom: '30px' }}>
        <div data-pdf-block data-pdf-page-break="before">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#000000' }}>
            1. CPL - Standar Kompetensi Lulusan
          </h3>
          <p style={{ fontSize: '12px', margin: '0 0 16px 0', textAlign: 'justify', color: '#111111' }}>
            Daftar Capaian Pembelajaran Lulusan berikut diambil dari database untuk {reportDepartmentName}{reportDepartmentCode}. Setiap jurusan atau program studi dapat memiliki daftar CPL yang berbeda sesuai data yang dikelola pada sistem.
          </p>
        </div>

        {orderedCategories.length > 0 ? orderedCategories.map((category) => (
          <div key={category} data-pdf-block style={{ marginBottom: '16px', pageBreakInside: 'avoid' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 6px 0', textTransform: 'uppercase', color: '#000000' }}>
              {category}
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', color: '#000000' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'center', fontWeight: 'bold', width: '12%' }}>Kode</th>
                  <th style={{ border: '1px solid #000000', padding: '5px 8px', textAlign: 'left', fontWeight: 'bold', width: '88%' }}>Capaian Pembelajaran Lulusan</th>
                </tr>
              </thead>
              <tbody>
                {groupedCpls[category].map((cpl, index) => (
                  <tr key={cpl.id} style={{ backgroundColor: index % 2 === 1 ? '#fafafa' : '#ffffff' }}>
                    <td style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'center', fontWeight: 'bold' }}>{cpl.code}</td>
                    <td style={{ border: '1px solid #000000', padding: '5px 8px', textAlign: 'justify' }}>{cpl.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : (
          <div style={{ border: '1px solid #000000', padding: '12px', fontSize: '12px', textAlign: 'center' }}>
            Belum ada data CPL pada database untuk jurusan ini.
          </div>
        )}
      </div>

      {/* Header */}
      <div data-pdf-block data-pdf-page-break="before" style={{ textAlign: 'center', marginBottom: '25px', borderBottom: '2px solid #000000', paddingBottom: '15px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 5px 0', textTransform: 'uppercase', color: '#000000', letterSpacing: '0.5px' }}>
          TABEL KETERCAPAIAN CAPAIAN PEMBELAJARAN LULUSAN (CPL)
        </h1>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0', color: '#000000' }}>
          Angkatan {cplMatrixAngkatan || 'Semua'} | {cplMatrixKelas || 'Semua Kelas'}
        </h2>
        <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '6px 0 0 0', color: '#000000' }}>
          Periode AMI {cplMatrixSemesterLabel} | Tahun Ajaran {reportAcademicYear}
        </p>
      </div>

      <p data-pdf-block style={{ fontSize: '12px', margin: '0 0 25px 0', textAlign: 'justify', color: '#111111' }}>
        Dokumen ini disusun berdasarkan tampilan dashboard Matriks Capaian CPL Kelas dengan filter periode AMI dan tahun ajaran yang dipilih. Ketercapaian CPL dikelompokkan ke dalam kategori: Sangat kompeten (Exemplary: 85 - 100), Kompeten (Competent: 75 - 84.99), Berkembang (Developing: 60 - 74.99), dan Tidak memuaskan (Unsatisfactory: 0 - 59.99). Apabila nilai belum tersedia pada dashboard, status dicatat sebagai "Belum Diukur".
      </p>

      {/* Kriteria Ketercapaian CPL */}
      <div data-pdf-block data-pdf-page-break="before" style={{ marginBottom: '30px', pageBreakInside: 'avoid' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Kriteria Ketercapaian CPL
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: '#000000' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', width: '27%' }}>Kategori</th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', width: '18%' }}>Rentang Nilai</th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', width: '55%' }}>Interpretasi</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((item) => (
              <tr key={item.label} style={{ backgroundColor: item.backgroundColor }}>
                <td style={{ border: '1px solid #000000', padding: '6px 8px', fontWeight: 'bold', color: item.color }}>
                  {item.label}
                  {item.english !== '-' && <span style={{ display: 'block', fontSize: '9px', fontWeight: 'normal', color: '#444444' }}>{item.english}</span>}
                </td>
                <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.range}</td>
                <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'justify' }}>{item.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ringkasan Ketercapaian */}
      <div data-pdf-block data-pdf-page-break="before" style={{ marginBottom: '30px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Ringkasan Ketercapaian
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#000000' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #000000', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', width: '50%' }}>Kategori Ketercapaian</th>
              <th style={{ border: '1px solid #000000', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', width: '50%' }}>Jumlah CPL / Nilai</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Total CPL</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold' }}>{cplAverages.length}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Sangat kompeten (Exemplary)</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold', color: '#047857' }}>
                {cplAverages.filter(c => c.value >= 85).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Kompeten (Competent)</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold', color: '#1d4ed8' }}>
                {cplAverages.filter(c => c.value >= 75 && c.value < 85).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Berkembang (Developing)</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold', color: '#b45309' }}>
                {cplAverages.filter(c => c.value >= 60 && c.value < 75).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Tidak memuaskan (Unsatisfactory)</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold', color: '#b91c1c' }}>
                {cplAverages.filter(c => c.value > 0 && c.value < 60).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Belum Diukur</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>
                {cplAverages.filter(c => c.value === 0).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Rata-rata IPK</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold' }}>
                {cplMatrixAverageIpk !== null ? cplMatrixAverageIpk.toFixed(2) : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Grafik Ketercapaian */}
      <div data-pdf-block data-pdf-page-break="before" style={{ marginBottom: '30px', pageBreakInside: 'avoid' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Grafik Ketercapaian CPL
        </h3>
        {chartCpls.length > 0 ? (
          <div style={{ border: '1px solid #000000', padding: '14px 12px 10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '220px' }}>
              <div style={{ width: '34px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: '24px', fontSize: '9px', color: '#333333', textAlign: 'right', paddingRight: '6px' }}>
                <span>100</span>
                <span>75</span>
                <span>50</span>
                <span>25</span>
                <span>0</span>
              </div>
              <div style={{ position: 'relative', flex: 1, borderLeft: '1px solid #000000', borderBottom: '1px solid #000000', padding: '0 8px 24px 8px', display: 'flex', alignItems: 'flex-end', gap: chartCpls.length > 12 ? '5px' : '10px' }}>
                {[0, 25, 50, 75, 100].map((value) => (
                  <div
                    key={value}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: `${24 + (value / maxChartValue) * 196}px`,
                      borderTop: value === 0 ? 'none' : '1px solid #d9d9d9',
                      height: 0,
                    }}
                  />
                ))}
                {chartCpls.map((cpl) => {
                  const matchedCriteria = criteria.find((item) => {
                    if (item.label === 'Sangat kompeten') return cpl.value >= 85;
                    if (item.label === 'Kompeten') return cpl.value >= 75 && cpl.value < 85;
                    if (item.label === 'Berkembang') return cpl.value >= 60 && cpl.value < 75;
                    if (item.label === 'Tidak memuaskan') return cpl.value > 0 && cpl.value < 60;
                    return false;
                  });
                  const barHeight = Math.max(4, (cpl.value / maxChartValue) * 196);

                  return (
                    <div key={cpl.id} style={{ flex: '1 1 0', minWidth: '18px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                      <div style={{ fontSize: '8px', lineHeight: '10px', marginBottom: '3px', color: '#111111', fontWeight: 'bold' }}>{cpl.value}</div>
                      <div style={{ width: '100%', maxWidth: '26px', height: `${barHeight}px`, backgroundColor: matchedCriteria?.color || '#475569', border: '1px solid rgba(0,0,0,0.18)' }} />
                      <div style={{ position: 'absolute', bottom: '-22px', fontSize: '8px', fontWeight: 'bold', color: '#111111', whiteSpace: 'nowrap' }}>{cpl.code}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: '18px', display: 'flex', flexWrap: 'wrap', gap: '8px 14px', fontSize: '9px' }}>
              {criteria.filter(item => item.label !== 'Belum Diukur').map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: item.color, border: '1px solid #000000' }} />
                  <span>{item.label} ({item.range})</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ border: '1px solid #000000', padding: '12px', fontSize: '12px', textAlign: 'center' }}>
            Belum ada nilai CPL yang dapat divisualisasikan.
          </div>
        )}
      </div>

      {/* Rincian Rata-rata Capaian CPL */}
      <div data-pdf-block data-pdf-page-break="before" style={{ marginBottom: '30px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Rincian Rata-rata Capaian CPL
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: '#000000' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', width: '5%' }}>No.</th>
              <th style={{ border: '1px solid #000000', padding: '6px 6px', textAlign: 'left', fontWeight: 'bold', width: '20%' }}>Kategori CPL</th>
              <th style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', width: '8%' }}>CPL</th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', width: '42%' }}>Deskripsi Kompetensi</th>
              <th style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', width: '8%' }}>Rata-rata Nilai</th>
              <th style={{ border: '1px solid #000000', padding: '6px 6px', textAlign: 'center', fontWeight: 'bold', width: '17%' }}>Kategori Ketercapaian CPL</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              return sortedCpls.map((cpl, index) => {
                let status = 'Belum Diukur';
                let keterangan = 'Nilai belum tersedia';
                if (cpl.value > 0) {
                  if (cpl.value >= 85) {
                    status = 'Sangat kompeten (Exemplary)';
                    keterangan = 'Skor 85 - 100';
                  } else if (cpl.value >= 75) {
                    status = 'Kompeten (Competent)';
                    keterangan = 'Skor 75 - 84.99';
                  } else if (cpl.value >= 60) {
                    status = 'Berkembang (Developing)';
                    keterangan = 'Skor 60 - 74.99';
                  } else {
                    status = 'Tidak memuaskan (Unsatisfactory)';
                    keterangan = 'Skor 0 - 59.99';
                  }
                }
                const rowBg = index % 2 === 1 ? '#fafafa' : '#ffffff';
                return (
                  <tr key={cpl.id} style={{ backgroundColor: rowBg }}>
                    <td style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ border: '1px solid #000000', padding: '6px 6px' }}>{cpl.category || '-'}</td>
                    <td style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold' }}>{cpl.code}</td>
                    <td style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'justify' }}>{cpl.description}</td>
                    <td style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold' }}>
                      {cpl.value === 0 ? '-' : cpl.value}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                      {status}
                      <span style={{ display: 'block', fontSize: '9px', fontWeight: 'normal', color: '#666666' }}>{keterangan}</span>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Catatan Interpretasi */}
      <div data-pdf-block data-pdf-page-break="before" style={{ pageBreakInside: 'avoid' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Catatan Interpretasi
        </h3>
        <ul style={{ fontSize: '12px', margin: '0', paddingLeft: '20px', color: '#000000' }}>
          {(() => {
            const bullets = [];
            
            const exemplaryCount = sortedCpls.filter(c => c.value >= 85).length;
            const competentCount = sortedCpls.filter(c => c.value >= 75 && c.value < 85).length;
            const developingCount = sortedCpls.filter(c => c.value >= 60 && c.value < 75).length;
            const unsatisfactoryCount = sortedCpls.filter(c => c.value > 0 && c.value < 60).length;
            const unmeasured = sortedCpls.filter(c => c.value === 0).map(c => c.code);

            bullets.push(`Terdapat ${exemplaryCount} CPL berstatus Sangat kompeten (Exemplary) dan ${competentCount} CPL berstatus Kompeten (Competent).`);
            
            if (developingCount > 0) {
              bullets.push(`Terdapat ${developingCount} CPL berstatus Berkembang (Developing) yang memerlukan perhatian untuk peningkatan proses pembelajaran.`);
            }
            if (unsatisfactoryCount > 0) {
              bullets.push(`Terdapat ${unsatisfactoryCount} CPL berstatus Tidak memuaskan (Unsatisfactory) yang memerlukan evaluasi kurikulum dan metode asesmen secara mendalam.`);
            }
            if (unmeasured.length > 0) {
              bullets.push(`CPL ${unmeasured.join(', ')} belum memiliki nilai rata-rata pada periode ini sehingga berstatus Belum Diukur.`);
            } else {
              bullets.push(`Seluruh CPL telah memiliki nilai pada dashboard (tidak ada CPL yang Belum Diukur).`);
            }
            bullets.push(`Hasil evaluasi ini direkomendasikan sebagai bahan tinjauan kurikulum program studi secara berkala untuk menjaga dan meningkatkan kualitas lulusan.`);

            return bullets.map((text, idx) => (
              <li key={idx} style={{ marginBottom: '6px', textAlign: 'justify' }}>{text}</li>
            ));
          })()}
        </ul>
      </div>
    </div>
  );
};
