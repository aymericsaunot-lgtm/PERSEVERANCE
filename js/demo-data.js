// Sample content for the preview. Dates are relative to today so the demo always looks current.
import { todayISO, addDays, DAY } from './lib/dates.js';
import { DEFAULT_SETTINGS } from './store.js';

const A = (given, family) => ({ given, family });

export function seedData() {
  const t = todayISO();
  const d = (n) => addDays(t, n);
  const ago = (days, hour = 10) => {
    const x = new Date();
    x.setDate(x.getDate() - days);
    x.setHours(hour, 0, 0, 0);
    return x.getTime();
  };
  const map = (rows) => new Map(rows.map((r) => [r.id, r]));

  const tasks = [
    { id: 't1', title: 'Fit the SnSe2 EDC stack with the Shirley background', area: 'PhD', due: t, starred: true, done: false },
    { id: 't2', title: 'Send the sample list to the beamline scientist', area: 'PhD', due: d(1), done: false },
    { id: 't3', title: 'Upload the winter mockups to Printify', area: 'EigenMode', due: d(3), done: false },
    { id: 't4', title: 'Send the updated board layout', area: 'Freelance', due: d(2), done: false },
    { id: 't5', title: 'Fix the collision bug in level 2', area: 'Games', due: '', done: false },
    { id: 't6', title: 'Renew the travel insurance', area: 'Life', due: d(-2), done: false },
    { id: 't7', title: 'Book the train for the beamtime', area: 'PhD', due: d(6), done: false },
    { id: 't8', title: 'Draft the workshop abstract', area: 'PhD', due: d(-1), done: true, doneAt: ago(1, 17) },
    { id: 't9', title: 'Calibrate the analyser work function', area: 'PhD', due: '', done: true, doneAt: ago(0, 9), starred: true },
    { id: 't10', title: 'Reply to the print supplier', area: 'EigenMode', due: '', done: true, doneAt: ago(0, 11) },
    { id: 't11', title: 'Plot the XPS core levels for ReO3', area: 'PhD', due: '', done: true, doneAt: ago(2, 15) },
    { id: 't12', title: 'Invoice for the October sprint', area: 'Freelance', due: '', done: true, doneAt: ago(3, 10) },
    { id: 't13', title: 'Clean the sample transfer arm', area: 'PhD', due: '', done: true, doneAt: ago(4, 16), starred: true },
    { id: 't14', title: 'Sketch the boss fight for level 3', area: 'Games', due: '', done: true, doneAt: ago(6, 21) },
    { id: 't15', title: 'Book the dentist', area: 'Life', due: '', done: true, doneAt: ago(8, 9) },
    { id: 't16', title: 'Read the BESSY safety training', area: 'PhD', due: '', done: true, doneAt: ago(11, 14) },
    { id: 't17', title: 'Fix the Shopify shipping zones', area: 'EigenMode', due: '', done: true, doneAt: ago(13, 18) },
  ].map((x, i) => ({ createdAt: ago(14 - (i % 10)), ...x }));

  const papers = [
    { id: 'p1', title: 'Angle-resolved photoemission studies of quantum materials', authors: [A('Jonathan A.', 'Sobota'), A('Yu', 'He'), A('Zhi-Xun', 'Shen')], year: 2021, journal: 'Reviews of Modern Physics', journalShort: 'Rev. Mod. Phys.', volume: '93', pages: '025006', doi: '10.1103/RevModPhys.93.025006', status: 'reading', tags: [], addedAt: ago(20), startedAt: ago(3) },
    { id: 'p2', title: 'Giant Rashba-type spin splitting in bulk BiTeI', authors: [A('K.', 'Ishizaka'), A('M. S.', 'Bahramy'), A('H.', 'Murakawa'), A('M.', 'Sakano'), A('T.', 'Shimojima')], year: 2011, journal: 'Nature Materials', journalShort: 'Nat. Mater.', volume: '10', pages: '521', doi: '10.1038/nmat3051', status: 'read', tags: ['BiTeX'], addedAt: ago(30), readAt: ago(2) },
    { id: 'p3', title: 'Prediction and observation of an antiferromagnetic topological insulator', authors: [A('M. M.', 'Otrokov'), A('I. I.', 'Klimovskikh'), A('H.', 'Bentmann')], year: 2019, journal: 'Nature', journalShort: 'Nature', volume: '576', pages: '416', doi: '10.1038/s41586-019-1840-9', status: 'toread', tags: ['MnBi2Te4'], addedAt: ago(4) },
    { id: 'p4', title: 'Unconventional superconductivity in magic-angle graphene superlattices', authors: [A('Yuan', 'Cao'), A('Valla', 'Fatemi'), A('Shiang', 'Fang'), A('Kenji', 'Watanabe'), A('Takashi', 'Taniguchi'), A('Efthimios', 'Kaxiras'), A('Pablo', 'Jarillo-Herrero')], year: 2018, journal: 'Nature', journalShort: 'Nature', volume: '556', pages: '43', doi: '10.1038/nature26160', status: 'toread', tags: ['moiré'], addedAt: ago(6) },
    { id: 'p5', title: 'Angle-resolved photoemission studies of the cuprate superconductors', authors: [A('Andrea', 'Damascelli'), A('Zahid', 'Hussain'), A('Zhi-Xun', 'Shen')], year: 2003, journal: 'Reviews of Modern Physics', journalShort: 'Rev. Mod. Phys.', volume: '75', pages: '473', doi: '10.1103/RevModPhys.75.473', status: 'read', tags: [], addedAt: ago(40), readAt: ago(9) },
    { id: 'p6', title: 'Colloquium: Topological insulators', authors: [A('M. Z.', 'Hasan'), A('C. L.', 'Kane')], year: 2010, journal: 'Reviews of Modern Physics', journalShort: 'Rev. Mod. Phys.', volume: '82', pages: '3045', doi: '10.1103/RevModPhys.82.3045', status: 'read', tags: [], addedAt: ago(60), readAt: ago(16) },
    { id: 'p7', title: 'Electric field effect in atomically thin carbon films', authors: [A('K. S.', 'Novoselov'), A('A. K.', 'Geim'), A('S. V.', 'Morozov')], year: 2004, journal: 'Science', journalShort: 'Science', volume: '306', pages: '666', doi: '10.1126/science.1102896', status: 'read', tags: [], addedAt: ago(70), readAt: ago(24) },
    { id: 'p8', title: 'Electronics and optoelectronics of two-dimensional transition metal dichalcogenides', authors: [A('Qing Hua', 'Wang'), A('Kourosh', 'Kalantar-Zadeh'), A('Andras', 'Kis'), A('Jonathan N.', 'Coleman'), A('Michael S.', 'Strano')], year: 2012, journal: 'Nature Nanotechnology', journalShort: 'Nat. Nanotechnol.', volume: '7', pages: '699', doi: '10.1038/nnano.2012.193', status: 'read', tags: ['TMDs'], addedAt: ago(80), readAt: ago(38) },
    { id: 'p9', title: 'New perspectives for Rashba spin-orbit coupling', authors: [A('A.', 'Manchon'), A('H. C.', 'Koo'), A('J.', 'Nitta'), A('S. M.', 'Frolov'), A('R. A.', 'Duine')], year: 2015, journal: 'Nature Materials', journalShort: 'Nat. Mater.', volume: '14', pages: '871', doi: '10.1038/nmat4360', status: 'read', tags: ['BiTeX'], addedAt: ago(90), readAt: ago(52) },
  ];

  const arxiv = [
    { id: 'demo-1', arxivId: 'sample-1', title: 'Sample match: Rashba splitting at the polar surface of a layered BiTeX crystal', authors: ['A. Example', 'B. Example', 'C. Example'], abstract: 'This is placeholder text for the preview. Once the daily workflow runs, new cond-mat papers that match your keywords appear here every weekday morning, with their real abstracts.', categories: ['cond-mat.mtrl-sci'], matched: ['Rashba crystal'], published: t, fetchedAt: ago(0, 7), status: 'new' },
    { id: 'demo-2', arxivId: 'sample-2', title: 'Sample match: Gap opening at the Dirac point of MnBi$_2$Te$_4$ thin films', authors: ['D. Example', 'E. Example'], abstract: 'Placeholder abstract. Titles keep their LaTeX, so formulas such as MnBi$_2$Te$_4$ show real subscripts and still match a keyword typed as MnBi2Te4.', categories: ['cond-mat.mes-hall', 'cond-mat.str-el'], matched: ['MnBi2Te4'], published: t, fetchedAt: ago(0, 7), status: 'new' },
    { id: 'demo-3', arxivId: 'sample-3', title: 'Sample match: Flat bands in a twisted moir\\\'e heterostructure', authors: ['F. Example'], abstract: 'Placeholder abstract. Accents are normalised, so the keyword moiré also matches moire and the LaTeX spelling.', categories: ['cond-mat.str-el'], matched: ['moiré'], published: d(-1), fetchedAt: ago(1, 7), status: 'new' },
  ];

  const beamtimes = [
    { id: 'b1', facility: 'BESSY II', beamline: 'ARPES end station', start: d(23), end: d(28), notes: 'Bring the SnSe2 and ReO3 samples.' },
    { id: 'b2', facility: 'MAX IV', beamline: 'BLOCH', start: d(68), end: d(73), notes: '' },
    { id: 'b3', facility: 'Diamond', beamline: 'I05', start: d(-41), end: d(-36), notes: '' },
  ];

  const deadlines = [
    { id: 'd1', title: 'MAX IV proposal call', facility: 'MAX IV', kind: 'proposal', date: d(9), done: false },
    { id: 'd2', title: 'Thesis committee report', facility: '', kind: 'admin', date: d(16), done: false },
    { id: 'd3', title: 'Diamond proposal round', facility: 'Diamond', kind: 'proposal', date: d(31), done: false },
    { id: 'd4', title: 'Conference abstract', facility: '', kind: 'conference', date: d(45), done: false },
  ];

  const chapters = [
    { id: 'c1', title: 'Introduction', order: 1, progress: 40, gains: { [d(-9)]: 5 } },
    { id: 'c2', title: 'Methods: ARPES and XPS', order: 2, progress: 75, gains: { [d(-3)]: 10 } },
    { id: 'c3', title: 'SnSe2', order: 3, progress: 60, gains: { [d(-1)]: 5 } },
    { id: 'c4', title: 'BiTeX', order: 4, progress: 25 },
    { id: 'c5', title: 'ReO3', order: 5, progress: 10 },
    { id: 'c6', title: 'Conclusion and outlook', order: 6, progress: 0 },
  ];

  const sessions = [
    { id: 's1', type: 'Surf', date: d(-1), minutes: 90, note: 'Clean and glassy at dawn' },
    { id: 's2', type: 'Table tennis', date: d(-3), minutes: 60, note: '' },
    { id: 's3', type: 'Surf', date: d(-5), minutes: 75, note: '' },
    { id: 's4', type: 'Run', date: d(-6), minutes: 35, note: '' },
    { id: 's5', type: 'Surf', date: d(-9), minutes: 120, note: 'Long period swell' },
    { id: 's6', type: 'Gym', date: d(-10), minutes: 50, note: '' },
    { id: 's7', type: 'Surf', date: d(-16), minutes: 100, note: '' },
    { id: 's8', type: 'Run', date: d(-19), minutes: 40, note: '' },
    { id: 's9', type: 'Surf', date: d(-24), minutes: 110, note: 'Overhead sets' },
    { id: 's10', type: 'Gym', date: d(-31), minutes: 45, note: '' },
    { id: 's11', type: 'Surf', date: d(-38), minutes: 80, note: '' },
    { id: 's12', type: 'Table tennis', date: d(-45), minutes: 60, note: '' },
  ];

  const days = (pattern) => pattern.map((n) => d(-n));
  const habits = [
    { id: 'h1', name: 'Read 30 min', order: 1, days: days([1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 15, 16, 19, 20, 22, 23, 26, 27, 29, 33, 34, 36, 40, 41, 43, 47, 50, 54]) },
    { id: 'h2', name: 'Stretch', order: 2, days: days([0, 1, 2, 4, 5, 8, 9, 10, 14, 15, 17, 22, 24, 30, 31, 38, 45]) },
    { id: 'h3', name: 'Write 300 words', order: 3, days: days([1, 2, 3, 6, 9, 10, 13, 17, 20, 24, 27, 31, 35, 41, 48]) },
  ];

  const memories = [
    { id: 'm1', text: 'Surfs at Hendaye; prefers dawn sessions before the wind turns onshore.', at: ago(12) },
    { id: 'm2', text: 'Wants to finish the BiTeX chapter draft before the BESSY II beamtime.', at: ago(5) },
  ];

  return {
    tasks: map(tasks),
    papers: map(papers),
    arxiv: map(arxiv),
    beamtimes: map(beamtimes),
    deadlines: map(deadlines),
    chapters: map(chapters),
    sessions: map(sessions),
    habits: map(habits),
    memories: map(memories),
    settings: { ...DEFAULT_SETTINGS, thesis: { title: 'PhD thesis', target: d(290) } },
    meta: { progress: null, briefing: null },
    arxivStatus: { lastRun: ago(0, 7) + 23 * 60000, lastNew: 3, scanned: 412, categories: ['cond-mat'] },
  };
}

export const DEMO_DAY = DAY;
