import React from 'react';

interface CplPrintTemplateProps {
  cplMatrixAngkatan: string;
  cplMatrixKelas: string;
  cplFormTarget: number;
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
  cplFormTarget,
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
          Angkatan {cplMatrixAngkatan || 'Semua'} | {cplMatrixKelas || 'Semua Kelas'} | Target Ketercapaian &gt;= {cplFormTarget}%
        </h2>
      </div>

      <p style={{ fontSize: '12px', margin: '0 0 25px 0', textAlign: 'justify', color: '#111111' }}>
        Dokumen ini disusun berdasarkan tampilan dashboard Matriks Capaian CPL Kelas. Status "Tercapai" diberikan untuk CPL dengan nilai rata-rata minimal {cplFormTarget}. Apabila nilai belum tersedia pada dashboard, status dicatat sebagai "Belum Terukur".
      </p>

      {/* Ringkasan Ketercapaian */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0', textTransform: 'uppercase', borderBottom: '1px solid #000000', paddingBottom: '3px', color: '#000000' }}>
          Ringkasan Ketercapaian
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#000000' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #000000', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', width: '50%' }}>Indikator</th>
              <th style={{ border: '1px solid #000000', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', width: '50%' }}>Nilai/Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>Total CPL</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold' }}>{cplAverages.length}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>CPL Tercapai</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold' }}>
                {cplAverages.filter(c => c.value >= cplFormTarget).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>CPL Belum Tercapai</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px', fontWeight: 'bold' }}>
                {cplAverages.filter(c => c.value > 0 && c.value < cplFormTarget).length}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>CPL Belum Terukur</td>
              <td style={{ border: '1px solid #000000', padding: '8px 12px' }}>
                {(() => {
                  const unmeasured = [...cplAverages]
                    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }))
                    .filter(c => c.value === 0)
                    .map(c => c.code);
                  return unmeasured.length > 0 ? `${unmeasured.length} (${unmeasured.join(', ')})` : '0';
                })()}
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
              <th style={{ border: '1px solid #000000', padding: '6px 6px', textAlign: 'left', fontWeight: 'bold', width: '20%' }}>Kategori</th>
              <th style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', width: '8%' }}>CPL</th>
              <th style={{ border: '1px solid #000000', padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', width: '42%' }}>Deskripsi Kompetensi</th>
              <th style={{ border: '1px solid #000000', padding: '6px 4px', textAlign: 'center', fontWeight: 'bold', width: '8%' }}>Rata-rata Nilai</th>
              <th style={{ border: '1px solid #000000', padding: '6px 6px', textAlign: 'center', fontWeight: 'bold', width: '10%' }}>Status</th>
              <th style={{ border: '1px solid #000000', padding: '6px 6px', textAlign: 'left', fontWeight: 'bold', width: '7%' }}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const sorted = [...cplAverages].sort((a, b) => 
                a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
              );
              return sorted.map((cpl, index) => {
                const status = cpl.value === 0 ? 'Belum Terukur' : (cpl.value >= cplFormTarget ? 'Tercapai' : 'Belum Tercapai');
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
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 6px', fontSize: '9px' }}>
                      {status === 'Tercapai' ? `Memenuhi target >= ${cplFormTarget}%` : 
                       status === 'Belum Tercapai' ? `Di bawah target < ${cplFormTarget}%` : 
                       'Nilai belum tersedia/belum diukur pada dashboard'}
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
            
            // 1. CPL status examples
            const tercapaiCpls = sorted.filter(c => c.value >= cplFormTarget);
            const s1Cpl = sorted.find(c => c.code === 'S1');
            if (s1Cpl) {
              const s1Status = s1Cpl.value === 0 ? 'Belum Terukur' : (s1Cpl.value >= cplFormTarget ? 'Tercapai' : 'Belum Tercapai');
              bullets.push(`CPL S1 memiliki nilai rata-rata ${s1Cpl.value === 0 ? '-' : s1Cpl.value} dan berstatus ${s1Status}.`);
            } else if (tercapaiCpls.length > 0) {
              bullets.push(`CPL ${tercapaiCpls[0].code} memiliki nilai rata-rata ${tercapaiCpls[0].value} dan berstatus Tercapai.`);
            }

            // 2. Unmeasured CPLs
            const unmeasured = sorted.filter(c => c.value === 0).map(c => c.code);
            if (unmeasured.length > 0) {
              bullets.push(
                `CPL ${unmeasured.join(', ')} belum memiliki nilai pada dashboard sehingga dinyatakan Belum Terukur.`
              );
            } else {
              bullets.push(`Seluruh CPL telah memiliki nilai pada dashboard (tidak ada yang Belum Terukur).`);
            }

            // 3. Under target CPLs
            const underTarget = sorted.filter(c => c.value > 0 && c.value < cplFormTarget).map(c => c.code);
            if (underTarget.length > 0) {
              bullets.push(
                `CPL ${underTarget.join(', ')} belum mencapai target minimal ${cplFormTarget}% sehingga berstatus Belum Tercapai.`
              );
            } else {
              bullets.push(
                `Seluruh CPL yang telah memiliki nilai berada di atas target minimal ${cplFormTarget}%, sehingga tidak ada CPL yang berstatus Belum Tercapai.`
              );
            }

            // 4. Recommendation
            bullets.push(
              `CPL yang belum terukur perlu ditindaklanjuti melalui pemetaan mata kuliah, instrumen asesmen, rubrik, atau input nilai yang relevan agar capaian dapat dihitung pada periode berikutnya.`
            );

            return bullets.map((text, idx) => (
              <li key={idx} style={{ marginBottom: '6px', textAlign: 'justify' }}>{text}</li>
            ));
          })()}
        </ul>
      </div>
    </div>
  );
};
