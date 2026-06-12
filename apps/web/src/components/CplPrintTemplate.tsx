import React from 'react';

interface CplPrintTemplateProps {
  cplMatrixAngkatan: string;
  cplMatrixKelas: string;
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
  cplAverages,
  cplMatrixAverageIpk,
}) => {
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
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '25px', borderBottom: '2px solid #000000', paddingBottom: '15px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 5px 0', textTransform: 'uppercase', color: '#000000', letterSpacing: '0.5px' }}>
          TABEL KETERCAPAIAN CAPAIAN PEMBELAJARAN LULUSAN (CPL)
        </h1>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0', color: '#000000' }}>
          Angkatan {cplMatrixAngkatan || 'Semua'} | {cplMatrixKelas || 'Semua Kelas'}
        </h2>
      </div>

      <p style={{ fontSize: '12px', margin: '0 0 25px 0', textAlign: 'justify', color: '#111111' }}>
        Dokumen ini disusun berdasarkan tampilan dashboard Matriks Capaian CPL Kelas. Ketercapaian CPL dikelompokkan ke dalam kategori: Sangat kompeten (Exemplary: 85 - 100), Kompeten (Competent: 75 - 84.99), Berkembang (Developing: 60 - 74.99), dan Tidak memuaskan (Unsatisfactory: 0 - 59.99). Apabila nilai belum tersedia pada dashboard, status dicatat sebagai "Belum Diukur".
      </p>

      {/* Ringkasan Ketercapaian */}
      <div style={{ marginBottom: '30px' }}>
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

      {/* Rincian Rata-rata Capaian CPL */}
      <div style={{ marginBottom: '30px' }}>
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
              const sorted = [...cplAverages].sort((a, b) => 
                a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
              );
              return sorted.map((cpl, index) => {
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
      <div style={{ pageBreakInside: 'avoid' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Catatan Interpretasi
        </h3>
        <ul style={{ fontSize: '12px', margin: '0', paddingLeft: '20px', color: '#000000' }}>
          {(() => {
            const bullets = [];
            const sorted = [...cplAverages].sort((a, b) => 
              a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
            );
            
            const exemplaryCount = sorted.filter(c => c.value >= 85).length;
            const competentCount = sorted.filter(c => c.value >= 75 && c.value < 85).length;
            const developingCount = sorted.filter(c => c.value >= 60 && c.value < 75).length;
            const unsatisfactoryCount = sorted.filter(c => c.value > 0 && c.value < 60).length;
            const unmeasured = sorted.filter(c => c.value === 0).map(c => c.code);

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
