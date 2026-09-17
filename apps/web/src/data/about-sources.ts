// Every citation on /about resolves to one of these — the literal source
// register from the evidence review (cut off 16 September 2026). `locked`
// marks a FILKOM subpage that was password-protected at review time: it's
// rendered as a sealed record on the page, not hidden.
export type Source = {
  id: string;
  title: string;
  url: string;
  locked?: boolean;
};

export const SOURCES: Source[] = [
  {
    id: "S01",
    title: "FILKOM UB, Laboratorium Media Game dan Mobile",
    url: "https://filkom.ub.ac.id/lab-mgm/",
  },
  {
    id: "S02",
    title: "MGM Laboratory, Research",
    url: "https://mgm.ub.ac.id/index.php/mgm/home/research",
  },
  {
    id: "S03",
    title: "MGM Laboratory, Lab Members",
    url: "https://mgm.ub.ac.id/index.php/mgm/home/members",
  },
  {
    id: "S04",
    title: "MGM Laboratory, Publication",
    url: "https://mgm.ub.ac.id/index.php/mgm/home/publication",
  },
  {
    id: "S05",
    title: "MGM Laboratory, Intellectual Property Rights",
    url: "https://mgm.ub.ac.id/index.php/mgm/home/rights",
  },
  {
    id: "S06",
    title: "FILKOM UB, profil Herman Tolle",
    url: "https://filkom.ub.ac.id/profile/dosen/herman.tolle",
  },
  {
    id: "S07",
    title: "FILKOM UB, peluncuran Jagoan Indonesia, 20 Mei 2016",
    url: "https://filkom.ub.ac.id/2016/05/20/filkom-ub-luncurkan-aplikasi-edukasi-kebudayaan-dan-kekayaan-indonesia/",
  },
  {
    id: "S08",
    title: "FILKOM UB, expo riset mobile dan robotika, 19 Januari 2017",
    url: "https://filkom.ub.ac.id/2017/01/19/filkom-perkenalkan-hasil-penelitian-bidang-aplikasi-mobile-dan-robotika-pada-siswa-sma-sederajat/",
  },
  {
    id: "S09",
    title: "FILKOM UB, rekrutmen student employee MGM, 13 November 2017",
    url: "https://filkom.ub.ac.id/2017/11/13/rekrutmen-student-employee-grup-riset-mgm-2017/",
  },
  {
    id: "S10",
    title: "FILKOM UB, kuliah tamu riset asistif, 23 Oktober 2018",
    url: "https://filkom.ub.ac.id/2018/10/23/kuliah-tamu-introduction-of-assistive-research-for-disabled-and-elderly/",
  },
  {
    id: "S11",
    title: "FILKOM UB, Best Paper ICETAS, 28 November 2018",
    url: "https://filkom.ub.ac.id/2018/11/28/mahasiswa-magister-ilmu-komputer-raih-best-paper-award-di-5th-ieee-icetas-2018-thailand/",
  },
  {
    id: "S12",
    title: "FILKOM UB, rekrutmen student employee MGM, 2 Januari 2019",
    url: "https://filkom.ub.ac.id/2019/01/02/grup-riset-mgm-student-employee-2019-recruitment/",
  },
  {
    id: "S13",
    title: "Prasetya UB, kunjungan CAVR NTU, 16 April 2019",
    url: "https://prasetya.ub.ac.id/en/kepala-grup-riset-filkom-kunjungi-laboratorium-cavr-ntu-singapura/",
  },
  {
    id: "S14",
    title: "Fakultas Teknik UB, aplikasi UB Tanggap, 13 April 2020",
    url: "https://teknik.ub.ac.id/id/track-the-civitas-condition-ub-launches-ub-tanggap-application/",
  },
  {
    id: "S15",
    title: "FILKOM UB, penawaran topik skripsi MGM, 31 Agustus 2022",
    url: "https://filkom.ub.ac.id/2022/08/31/penawaran-topik-skripsi-laboratorium-media-game-dan-mobile/",
  },
  {
    id: "S16",
    title: "FILKOM UB, kunjungan fxMedia dan CAVR NTU, 22 Desember 2022",
    url: "https://filkom.ub.ac.id/2022/12/22/inisiasi-kerjasama-dan-perbaikan-kurikulum-filkom-ub-kunjungi-cavr-ntu-dan-fxmedia-singapura/",
  },
  {
    id: "S17",
    title: "FILKOM UB, peresmian Game Corner, 6 September 2023",
    url: "https://filkom.ub.ac.id/2023/09/06/peresmian-game-corner-filkom-ub-mahasiswa-semakin-dibuat-betah-di-kampus/",
  },
  {
    id: "S18",
    title: "FILKOM UB, daftar laboratorium dan grup riset",
    url: "https://filkom.ub.ac.id/penelitian-dan-pengabdian/laboratorium-dan-grup-riset/",
  },
  {
    id: "S19",
    title: "FILKOM UB, kontak fakultas",
    url: "https://filkom.ub.ac.id/alamat-dan-narahubung/",
  },
  {
    id: "S20",
    title: "FILKOM UB, halaman profil MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/tentang/",
    locked: true,
  },
  {
    id: "S21",
    title: "FILKOM UB, organisasi dan tata kelola MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/sotk/",
    locked: true,
  },
  {
    id: "S22",
    title: "FILKOM UB, fasilitas MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/fasilitas/",
    locked: true,
  },
  {
    id: "S23",
    title: "FILKOM UB, informasi layanan MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/informasi-layanan/",
    locked: true,
  },
  {
    id: "S24",
    title: "FILKOM UB, penelitian dan publikasi MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/penelitian-dan-publikasi/",
    locked: true,
  },
  {
    id: "S25",
    title: "FILKOM UB, SDM MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/sdm/",
    locked: true,
  },
  {
    id: "S26",
    title: "FILKOM UB, program kerja MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/program-kerja/",
    locked: true,
  },
  {
    id: "S27",
    title: "FILKOM UB, jaminan mutu MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/jaminan-mutu/",
    locked: true,
  },
  {
    id: "S28",
    title: "FILKOM UB, kontak MGM",
    url: "https://filkom.ub.ac.id/lab-mgm/kontak/",
    locked: true,
  },
];

export const SOURCES_BY_ID: Record<string, Source> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
);

export const LOCKED_SOURCES = SOURCES.filter((s) => s.locked);
