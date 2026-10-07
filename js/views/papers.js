import { html, useState, useMemo, useRef } from '../../vendor/preact.js';
import { actions } from '../store.js';
import { Icon, Rich, Chem, Section, Segmented, Sheet, Field, Empty, TagEditor, DangerButton, PageHead, toast, downloadFile, copyText } from '../ui.js';
import { XP } from '../lib/xp.js';
import { lookupPaper, parseIdentifier, authorShort, authorsLong, journalLine, paperLinks, toBibtex, splitName, yearFromArxivId, bibKey, isArxivId } from '../lib/papers.js';
import { normalize, sameTag, matchesKeyword } from '../lib/text.js';
import { startOfWeek, startOfMonth, startOfYear, fmtAgo, fmtLong, todayISO, DAY } from '../lib/dates.js';

export const STATUS = [
  { id: 'reading', label: 'Reading' },
  { id: 'toread', label: 'To read' },
  { id: 'read', label: 'Read' },
];
const statusLabel = (s) => (STATUS.find((x) => x.id === s) || STATUS[1]).label;

export function setPaperStatus(p, status) {
  if (p.status === status) return;
  const patch = { status };
  if (status === 'reading' && !p.startedAt) patch.startedAt = Date.now();
  patch.readAt = status === 'read' ? Date.now() : null;
  actions.update('papers', p.id, patch);
  if (status === 'read') toast('Marked as read', { xp: XP.paper });
}

export function readingStats(papers, now = new Date()) {
  const wk = startOfWeek(now).getTime();
  const mo = startOfMonth(now).getTime();
  const yr = startOfYear(now).getTime();
  const read = papers.filter((p) => p.status === 'read' && p.readAt);
  const weeks = new Array(12).fill(0);
  for (const p of read) {
    const idx = 11 - Math.floor((wk - startOfWeek(new Date(p.readAt)).getTime() + DAY / 2) / (7 * DAY));
    if (idx >= 0 && idx < 12) weeks[idx]++;
  }
  return {
    week: read.filter((p) => p.readAt >= wk).length,
    month: read.filter((p) => p.readAt >= mo).length,
    year: read.filter((p) => p.readAt >= yr).length,
    weeks,
    reading: papers.filter((p) => p.status === 'reading').sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)),
    toread: papers.filter((p) => p.status === 'toread').length,
  };
}

export function Histogram({ counts }) {
  const W = 300;
  const H = 48;
  const gap = 4;
  const n = counts.length;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(3, ...counts);
  return html`<svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label=${`Papers read per week, last ${n} weeks: ${counts.join(', ')}`}>
    ${counts.map((c, i) => {
      const h = c ? Math.max(4, (c / max) * (H - 2)) : 2;
      return html`<rect key=${i} x=${i * (bw + gap)} y=${H - h} width=${bw} height=${h} rx="2"
        fill=${c ? (i === n - 1 ? 'var(--accent)' : 'var(--ink)') : 'var(--surface-3)'} />`;
    })}
  </svg>`;
}

export function ReadingStats({ papers, compact = false }) {
  const s = readingStats(papers);
  return html`<div>
    <div class="stats">
      <div class="stat"><div class="stat__value">${s.week}</div><div class="stat__label">This week</div></div>
      <div class="stat"><div class="stat__value">${s.month}</div><div class="stat__label">This month</div></div>
      <div class="stat"><div class="stat__value">${s.year}</div><div class="stat__label">This year</div></div>
    </div>
    <div class="hist">
      <${Histogram} counts=${s.weeks} />
      <div class="hist__caption"><span>12 weeks ago</span><span>${compact ? `${s.toread} waiting to be read` : 'This week'}</span></div>
    </div>
  </div>`;
}

function PaperMeta({ p }) {
  const j = journalLine(p);
  return html`<div class="paper__meta">
    <span>${authorShort(p) || 'Unknown authors'}</span>
    ${p.year && html`<span class="num">${p.year}</span>`}
    ${(j.journal || j.rest) && html`<span>${j.journal && html`<span class="paper__journal">${j.journal}</span>`}${j.rest}</span>`}
  </div>`;
}

export function PaperRow({ paper, onOpen, showStatus = true }) {
  return html`<div class="row row--button paper" role="button" tabindex="0" onClick=${() => onOpen(paper)} onKeyDown=${(e) => e.key === 'Enter' && onOpen(paper)}>
    <div class="row__main">
      <div class="paper__title"><${Rich} text=${paper.title} /></div>
      <${PaperMeta} p=${paper} />
      ${paper.tags && paper.tags.length > 0 && html`<div class="chips paper__tags">${paper.tags.map((t) => html`<span key=${t} class="chip chip--tag"><${Chem} text=${t} /></span>`)}</div>`}
    </div>
    ${showStatus && html`<span class=${'pill paper__status' + (paper.status === 'reading' ? ' pill--accent' : '')}>${statusLabel(paper.status)}</span>`}
  </div>`;
}

function findDuplicate(papers, draft) {
  const doi = (draft.doi || '').toLowerCase();
  return papers.find((p) => (doi && (p.doi || '').toLowerCase() === doi) || (draft.arxiv && p.arxiv === draft.arxiv));
}

function AddPaper({ papers, settings, onOpen }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState({ phase: 'idle' });
  const [tags, setTags] = useState([]);
  const run = async (value) => {
    const v = (value ?? q).trim();
    if (!v) return;
    setSt({ phase: 'loading' });
    try {
      const draft = await lookupPaper(v);
      setTags([]);
      setSt({ phase: 'found', draft, dup: findDuplicate(papers, draft) });
    } catch (err) {
      setSt({ phase: 'error', message: err.message });
    }
  };
  const add = (status) => {
    const now = Date.now();
    actions.add('papers', {
      ...st.draft, tags, status, addedAt: now,
      startedAt: status === 'reading' ? now : null,
      readAt: status === 'read' ? now : null,
      notes: '',
    });
    toast(status === 'read' ? 'Added and counted as read' : 'Added to your library', status === 'read' ? { xp: XP.paper } : {});
    setQ('');
    setSt({ phase: 'idle' });
  };
  const d = st.draft;
  return html`<div class="group" style="margin-bottom:22px">
    <form class="quickadd" onSubmit=${(e) => { e.preventDefault(); run(); }}>
      <${Icon} name="plus" size="sm" cls="faint" />
      <input class="quickadd__input" value=${q} placeholder="Paste a DOI or arXiv ID" aria-label="DOI or arXiv ID"
        onInput=${(e) => { setQ(e.currentTarget.value); if (st.phase === 'error') setSt({ phase: 'idle' }); }}
        onPaste=${(e) => { const text = e.clipboardData && e.clipboardData.getData('text'); if (text && parseIdentifier(text)) { setTimeout(() => run(text), 0); } }} />
      ${q && html`<button class="btn btn--primary btn--sm" type="submit" disabled=${st.phase === 'loading'}>${st.phase === 'loading' ? 'Looking up' : 'Look up'}</button>`}
    </form>
    ${st.phase === 'error' && html`<div class="lookup">
      <p class="muted">${st.message}</p>
      <div class="lookup__actions"><button class="btn btn--sm" onClick=${() => onOpen({ isNew: true, title: '', authors: [], doi: (parseIdentifier(q) || {}).type === 'doi' ? parseIdentifier(q).value : '', arxiv: (parseIdentifier(q) || {}).type === 'arxiv' ? parseIdentifier(q).value : '', status: 'toread', tags: [] })}>Add by hand</button></div>
    </div>`}
    ${st.phase === 'found' && html`<div class="lookup">
      <div class="lookup__title"><${Rich} text=${d.title} /></div>
      <div class="lookup__meta">${authorShort(d)}${d.year ? `, ${d.year}` : ''}${journalLine(d).journal ? html`, <i>${journalLine(d).journal}</i>${journalLine(d).rest}` : journalLine(d).rest ? `, ${journalLine(d).rest}` : ''}</div>
      ${st.dup ? html`<div class="lookup__actions">
          <span class="pill pill--accent">Already in your library</span>
          <button class="btn btn--sm" onClick=${() => { onOpen(st.dup); setSt({ phase: 'idle' }); setQ(''); }}>Open it</button>
        </div>`
        : html`<div style="margin-top:12px"><${TagEditor} value=${tags} onChange=${setTags} suggestions=${settings.tags || []} placeholder="Tags (optional)" /></div>
        <div class="lookup__actions">
          <button class="btn btn--primary btn--sm" onClick=${() => add('toread')}>Add to read</button>
          <button class="btn btn--sm" onClick=${() => add('reading')}>Start reading</button>
          <button class="btn btn--sm" onClick=${() => add('read')}>Already read</button>
          <button class="btn btn--quiet btn--sm" onClick=${() => setSt({ phase: 'idle' })}>Cancel</button>
        </div>`}
    </div>`}
    ${st.phase === 'idle' && !q && html`<div class="quickadd__opts">
      <button class="link-btn" onClick=${() => onOpen({ isNew: true, title: '', authors: [], status: 'toread', tags: [] })}>Add by hand</button>
    </div>`}
  </div>`;
}

const authorsToText = (authors) => (authors || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).join('\n');
const textToAuthors = (text) => String(text || '').split(/\n|;/).map((s) => s.trim()).filter(Boolean).map(splitName);

export function PaperSheet({ paper, settings, onClose }) {
  const isNew = !!paper.isNew;
  const [editing, setEditing] = useState(isNew);
  const [showAbs, setShowAbs] = useState(false);
  const [form, setForm] = useState(() => ({
    title: paper.title || '', authors: authorsToText(paper.authors), year: paper.year || '', journal: paper.journal || '',
    journalShort: paper.journalShort || '', volume: paper.volume || '', pages: paper.pages || '', doi: paper.doi || '', arxiv: paper.arxiv || '', abstract: paper.abstract || '',
  }));
  const [notes, setNotes] = useState(paper.notes || '');
  const [tags, setTags] = useState(paper.tags || []);
  const [status, setStatus] = useState(paper.status || 'toread');
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });

  const details = () => ({
    title: form.title.trim(), authors: textToAuthors(form.authors), year: form.year ? Number(form.year) : (form.arxiv ? yearFromArxivId(form.arxiv) : null),
    journal: form.journal.trim(), journalShort: form.journalShort.trim(), volume: String(form.volume).trim(), pages: String(form.pages).trim(),
    doi: form.doi.trim(), arxiv: form.arxiv.trim(), abstract: form.abstract.trim(),
    kind: form.journal.trim() ? 'article' : (form.arxiv.trim() ? 'preprint' : 'article'),
  });
  const live = { ...paper, ...(editing ? details() : {}), tags, status, notes };

  const saveNew = () => {
    const d = details();
    if (!d.title) { toast('Add a title first'); return; }
    const now = Date.now();
    actions.add('papers', { ...d, tags, status, notes, addedAt: now, startedAt: status === 'reading' ? now : null, readAt: status === 'read' ? now : null });
    toast('Added to your library');
    onClose();
  };
  const saveDetails = () => {
    const d = details();
    if (!d.title) { toast('The title cannot be empty'); return; }
    actions.update('papers', paper.id, d);
    setEditing(false);
  };
  const changeStatus = (s) => {
    setStatus(s);
    if (!isNew) setPaperStatus(paper, s);
  };
  const changeTags = (t) => {
    setTags(t);
    if (!isNew) actions.update('papers', paper.id, { tags: t });
  };
  const saveNotes = () => {
    if (!isNew && notes !== (paper.notes || '')) actions.update('papers', paper.id, { notes });
  };
  const del = () => {
    actions.remove('papers', paper.id);
    toast('Paper deleted');
    onClose();
  };
  const copyBib = async () => {
    const ok = await copyText(toBibtex([live]));
    toast(ok ? 'BibTeX copied' : 'Copy failed. Use the BibTeX export instead.');
  };
  const links = paperLinks(live);
  const j = journalLine(live);

  return html`<${Sheet} title=${isNew ? 'Add a paper' : 'Paper'} onClose=${() => { saveNotes(); onClose(); }} actions=${isNew
      ? html`<button class="btn btn--quiet" onClick=${onClose}>Cancel</button><button class="btn btn--primary" onClick=${saveNew}>Add paper</button>`
      : editing
        ? html`<button class="btn btn--quiet" onClick=${() => setEditing(false)}>Cancel</button><button class="btn btn--primary" onClick=${saveDetails}>Save details</button>`
        : html`<${DangerButton} onConfirm=${del} />
          <button class="btn btn--ghost" style="margin-left:auto" onClick=${copyBib}><${Icon} name="copy" size="sm" />BibTeX</button>`}>
    ${!editing && html`<div>
      <div class="paper__title" style="font-size:21px"><${Rich} text=${live.title} /></div>
      <p class="muted" style="margin-top:8px;font-size:14px">${authorsLong(live) || 'Unknown authors'}</p>
      <p class="muted" style="margin-top:4px;font-size:14px">${j.journal && html`<i>${j.journal}</i>`}${j.rest}${live.year ? ` (${live.year})` : ''}</p>
      <div class="chips" style="margin-top:12px">
        ${links.doi && html`<a class="chip" href=${links.doi} target="_blank" rel="noopener"><${Icon} name="external" size="xs" />DOI</a>`}
        ${links.arxiv && html`<a class="chip" href=${links.arxiv} target="_blank" rel="noopener"><${Icon} name="external" size="xs" />arXiv</a>`}
        ${links.pdf && html`<a class="chip" href=${links.pdf} target="_blank" rel="noopener"><${Icon} name="external" size="xs" />PDF</a>`}
        ${links.url && html`<a class="chip" href=${links.url} target="_blank" rel="noopener"><${Icon} name="external" size="xs" />Link</a>`}
        <button class="chip" onClick=${() => setEditing(true)}><${Icon} name="edit" size="xs" />Edit details</button>
      </div>
    </div>`}
    ${editing && html`<div>
      <${Field} label="Title" hint="LaTeX works: MnBi$_2$Te$_4$ shows with subscripts."><textarea class="textarea" style="min-height:72px" data-autofocus value=${form.title} onInput=${set('title')}></textarea></${Field}>
      <${Field} label="Authors" hint="One per line, given name first."><textarea class="textarea" value=${form.authors} onInput=${set('authors')}></textarea></${Field}>
      <div class="fields-2" style="margin-top:14px">
        <${Field} label="Year"><input class="input" inputmode="numeric" value=${form.year} onInput=${set('year')} /></${Field}>
        <${Field} label="Journal abbreviation"><input class="input" value=${form.journalShort} placeholder="Phys. Rev. B" onInput=${set('journalShort')} /></${Field}>
      </div>
      <${Field} label="Journal"><input class="input" value=${form.journal} placeholder="Physical Review B" onInput=${set('journal')} /></${Field}>
      <div class="fields-2" style="margin-top:14px">
        <${Field} label="Volume"><input class="input" value=${form.volume} onInput=${set('volume')} /></${Field}>
        <${Field} label="Pages or article number"><input class="input" value=${form.pages} onInput=${set('pages')} /></${Field}>
      </div>
      <div class="fields-2" style="margin-top:14px">
        <${Field} label="DOI"><input class="input" value=${form.doi} autocapitalize="off" onInput=${set('doi')} /></${Field}>
        <${Field} label="arXiv ID"><input class="input" value=${form.arxiv} autocapitalize="off" onInput=${set('arxiv')} /></${Field}>
      </div>
      <${Field} label="Abstract"><textarea class="textarea" value=${form.abstract} onInput=${set('abstract')}></textarea></${Field}>
    </div>`}
    <div class="field" style="margin-top:20px">
      <span class="field__label">Status</span>
      <${Segmented} label="Reading status" value=${status} onChange=${changeStatus} items=${STATUS} />
    </div>
    <div class="field" style="margin-top:16px">
      <span class="field__label">Tags</span>
      <${TagEditor} value=${tags} onChange=${changeTags} suggestions=${settings.tags || []} />
    </div>
    <div class="field" style="margin-top:16px">
      <span class="field__label">Notes</span>
      <textarea class="textarea" value=${notes} placeholder="Key result, figures to reuse, questions" onInput=${(e) => setNotes(e.currentTarget.value)} onBlur=${saveNotes}></textarea>
    </div>
    ${!editing && live.abstract && html`<div class="field" style="margin-top:16px">
      <span class="field__label">Abstract</span>
      <p class=${'abstract' + (showAbs ? '' : ' abstract--clamp')}><${Rich} text=${live.abstract} /></p>
      <button class="link-btn" style="align-self:flex-start" onClick=${() => setShowAbs(!showAbs)}>${showAbs ? 'Show less' : 'Show the full abstract'}</button>
    </div>`}
    ${!isNew && !editing && html`<p class="faint" style="font-size:12.5px;margin-top:16px">Citation key ${live.bibkey || bibKey(live)}</p>`}
  </${Sheet}>`;
}

function BibtexSheet({ papers, scopeLabel, onClose }) {
  const text = useMemo(() => toBibtex(papers), [papers]);
  const copy = async () => toast((await copyText(text)) ? `Copied ${papers.length} entries` : 'Copy failed. Use Download instead.');
  return html`<${Sheet} title="Export BibTeX" onClose=${onClose} actions=${html`
      <button class="btn btn--ghost" onClick=${copy}><${Icon} name="copy" size="sm" />Copy</button>
      <button class="btn btn--primary" onClick=${() => { downloadFile(`papers-${todayISO()}.bib`, text, 'application/x-bibtex'); toast('Download started'); }}><${Icon} name="download" size="sm" />Download .bib</button>`}>
    <p class="muted" style="margin-bottom:12px">${papers.length} ${papers.length === 1 ? 'entry' : 'entries'} from ${scopeLabel}. Keys follow the pattern Author, year, first word of the title.</p>
    <pre class="code" style="max-height:320px;overflow:auto;margin:0">${text}</pre>
  </${Sheet}>`;
}

function Library({ state, onOpen }) {
  const { papers, settings } = state.data;
  const [status, setStatusF] = useState(() => (papers.some((p) => p.status === 'reading') ? 'reading' : 'toread'));
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const [bib, setBib] = useState(false);
  const counts = { all: papers.length };
  for (const s of STATUS) counts[s.id] = papers.filter((p) => p.status === s.id).length;
  const allTags = useMemo(() => {
    const out = [...(settings.tags || [])];
    for (const p of papers) for (const t of p.tags || []) if (!out.some((x) => sameTag(x, t))) out.push(t);
    return out;
  }, [papers, settings.tags]);
  const index = useMemo(() => new Map(papers.map((p) => [p.id, normalize([p.title, authorsLong(p, 50), p.journal, p.journalShort, p.year, p.doi, p.arxiv, (p.tags || []).join(' '), p.notes].join(' '))])), [papers]);
  const qn = normalize(q);
  const shown = papers
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => !tag || (p.tags || []).some((t) => sameTag(t, tag)))
    .filter((p) => !qn || qn.split(' ').every((w) => index.get(p.id).includes(w)))
    .sort((a, b) => status === 'read' ? (b.readAt || 0) - (a.readAt || 0) : (b.startedAt || b.addedAt || 0) - (a.startedAt || a.addedAt || 0));
  const scopeLabel = [status === 'all' ? 'all papers' : statusLabel(status).toLowerCase(), tag && `tagged ${tag}`, q && `matching "${q}"`].filter(Boolean).join(', ');

  return html`<div>
    <${AddPaper} papers=${papers} settings=${settings} onOpen=${onOpen} />
    <div class="grid-2">
      <div>
        <div class="toolbar">
          <${Segmented} label="Reading status" value=${status} onChange=${setStatusF} items=${[...STATUS.map((s) => ({ ...s, count: counts[s.id] })), { id: 'all', label: 'All', count: counts.all }]} />
        </div>
        <div class="toolbar">
          <div class="toolbar__grow" style="position:relative">
            <input class="input" type="search" value=${q} placeholder="Search papers" aria-label="Search titles, authors, tags and notes" onInput=${(e) => setQ(e.currentTarget.value)} style="padding-left:38px" />
            <span style="position:absolute;left:12px;top:12px;color:var(--ink-3);display:flex"><${Icon} name="search" size="sm" /></span>
          </div>
          <button class="btn btn--ghost" onClick=${() => setBib(true)} disabled=${!shown.length}><${Icon} name="download" size="sm" />BibTeX</button>
        </div>
        <div class="chips" style="margin-bottom:16px">
          ${allTags.map((t) => html`<button key=${t} class="chip chip--tag" aria-pressed=${tag && sameTag(tag, t) ? 'true' : 'false'} onClick=${() => setTag(tag && sameTag(tag, t) ? '' : t)}><${Chem} text=${t} /></button>`)}
        </div>
        <div class="group">
          ${shown.length ? shown.map((p) => html`<${PaperRow} key=${p.id} paper=${p} onOpen=${onOpen} showStatus=${status === 'all'} />`)
            : html`<${Empty} title=${papers.length ? 'Nothing here' : 'Your library is empty'}>${papers.length ? 'Try another status, tag or search.' : 'Paste a DOI or arXiv ID above to add your first paper.'}</${Empty}>`}
        </div>
      </div>
      <${Section} title="Reading">
        <div class="group"><${ReadingStats} papers=${papers} /></div>
      </${Section}>
    </div>
    ${bib && html`<${BibtexSheet} papers=${shown} scopeLabel=${scopeLabel} onClose=${() => setBib(false)} />`}
  </div>`;
}

export function addFromArxiv(item, settings) {
  const tags = (item.matched || []).filter((k) => (settings.tags || []).some((t) => sameTag(t, k)))
    .map((k) => (settings.tags || []).find((t) => sameTag(t, k)));
  const paperId = actions.add('papers', {
    title: item.title,
    authors: (item.authors || []).map((n) => (typeof n === 'string' ? splitName(n) : n)),
    year: Number(String(item.published || '').slice(0, 4)) || yearFromArxivId(item.arxivId),
    arxiv: item.arxivId,
    primaryClass: (item.categories || [])[0] || '',
    doi: item.doi || '',
    journalRef: item.journalRef || '',
    abstract: item.abstract || '',
    kind: 'preprint',
    status: 'toread',
    tags,
    notes: '',
    addedAt: Date.now(),
  });
  actions.update('arxiv', item.id, { status: 'added', paperId });
  toast('Added to your reading list', {
    action: 'Undo',
    onAction: () => {
      actions.remove('papers', paperId);
      actions.update('arxiv', item.id, { status: 'new', paperId: null });
    },
  });
}

function WatchItem({ item, settings }) {
  const [open, setOpen] = useState(false);
  const names = (item.authors || []).map((a) => (typeof a === 'string' ? a : [a.given, a.family].join(' ')));
  const authors = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  return html`<div class="watch-item">
    <div class="paper__title"><${Rich} text=${item.title} /></div>
    <div class="paper__meta"><span>${authors}</span></div>
    <div class="match-kw">
      ${(item.categories || []).slice(0, 2).map((c) => html`<span key=${c} class="pill">${c}</span>`)}
      ${(item.matched || []).map((k) => html`<span key=${k} class="pill pill--accent"><${Chem} text=${k} /></span>`)}
    </div>
    ${item.abstract && html`<p class=${'abstract' + (open ? '' : ' abstract--clamp')} style="margin-top:10px;font-size:15px;color:var(--ink-2)" onClick=${() => setOpen(!open)}><${Rich} text=${item.abstract} /></p>`}
    <div class="watch-item__actions">
      ${item.status === 'added'
        ? html`<span class="pill pill--accent"><${Icon} name="check" size="xs" />In your reading list</span>`
        : html`<button class="btn btn--primary btn--sm" onClick=${() => addFromArxiv(item, settings)}><${Icon} name="plus" size="xs" />Add to reading list</button>
          <button class="btn btn--quiet btn--sm" onClick=${() => actions.update('arxiv', item.id, { status: 'dismissed' })}>Dismiss</button>`}
      ${isArxivId(item.arxivId) && html`<a class="btn btn--quiet btn--sm" style="margin-left:auto" href=${`https://arxiv.org/abs/${item.arxivId}`} target="_blank" rel="noopener">arXiv<${Icon} name="external" size="xs" /></a>`}
    </div>
  </div>`;
}

function Watch({ state }) {
  const { arxiv, settings, arxivStatus } = state.data;
  const [showAll, setShowAll] = useState(false);
  const keywords = settings.arxivKeywords || [];
  const visible = arxiv.filter((x) => x.status !== 'dismissed' && (showAll || x.status === 'new' || (x.fetchedAt || 0) > Date.now() - 3 * DAY));
  const byDay = new Map();
  for (const it of visible.sort((a, b) => (b.published || '').localeCompare(a.published || '') || (b.fetchedAt || 0) - (a.fetchedAt || 0))) {
    const k = it.published || 'Undated';
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(it);
  }
  const newCount = arxiv.filter((x) => x.status === 'new').length;
  return html`<div class="grid-2">
    <div>
      ${byDay.size === 0 && html`<div class="group"><${Empty} title="No new matches">${arxivStatus ? 'Nothing matched your keywords in the latest arXiv mailing. New papers are checked every weekday morning.' : 'Matches appear here once the daily GitHub workflow has run. The README explains the two-minute setup.'}</${Empty}></div>`}
      ${[...byDay].map(([day, items]) => html`<div key=${day}>
        <h3 class="watch-day">${day === todayISO() ? 'Today' : /^\d{4}-/.test(day) ? fmtLong(day) : day}</h3>
        <div class="group">${items.map((it) => html`<${WatchItem} key=${it.id} item=${it} settings=${settings} />`)}</div>
      </div>`)}
      ${!showAll && arxiv.some((x) => x.status !== 'dismissed' && !visible.includes(x)) && html`<p style="margin-top:14px"><button class="link-btn" onClick=${() => setShowAll(true)}>Show older matches</button></p>`}
    </div>
    <${Section} title="Keywords">
      <div class="group group--pad">
        <${TagEditor} value=${keywords} onChange=${(k) => actions.saveSettings({ arxivKeywords: k })} placeholder="Add a keyword" />
        <p class="field__hint" style="margin-top:10px">All words must appear in the title or abstract, in any order. Use quotes for an exact phrase, and author:Name to follow a person. Accents and LaTeX are ignored, so MnBi2Te4 also finds titles written as <code>MnBi$_2$Te$_4$</code>.</p>
        <p class="field__hint" style="margin-top:10px">Categories: ${(settings.arxivCategories || ['cond-mat']).join(', ')}. Change them in Settings.</p>
      </div>
      <p class="faint" style="font-size:13px;margin:10px 2px 0">${arxivStatus && arxivStatus.lastRun
        ? `Last check ${fmtAgo(arxivStatus.lastRun)}: ${arxivStatus.scanned ?? 0} new papers scanned, ${arxivStatus.lastNew ?? 0} matched.`
        : 'Not checked yet.'}</p>
      ${keywords.length > 0 && arxiv.length > 0 && html`<p class="faint" style="font-size:13px;margin:6px 2px 0">${arxiv.filter((x) => keywords.some((k) => matchesKeyword(k, normalize(`${x.title} ${x.abstract}`)))).length} of ${arxiv.length} stored matches fit your current keywords.</p>`}
    </${Section}>
  </div>`;
}

export function PapersView({ state, sub, go }) {
  const [open, setOpen] = useState(null);
  const tab = sub === 'watch' ? 'watch' : 'library';
  const newCount = state.data.arxiv.filter((x) => x.status === 'new').length;
  const current = open && !open.isNew ? state.data.papers.find((p) => p.id === open.id) || open : open;
  const s = readingStats(state.data.papers);
  return html`<div>
    <${PageHead} over=${`${s.week} read this week · ${s.toread} to read`} title="Papers" />
    <div class="toolbar">
      <${Segmented} label="Papers" value=${tab} onChange=${(t) => go(t === 'watch' ? 'papers/watch' : 'papers')} items=${[
        { id: 'library', label: 'Library', count: state.data.papers.length },
        { id: 'watch', label: 'arXiv watch', count: newCount || null },
      ]} />
    </div>
    ${tab === 'library' ? html`<${Library} state=${state} onOpen=${setOpen} />` : html`<${Watch} state=${state} />`}
    ${current && html`<${PaperSheet} key=${current.id || 'new'} paper=${current} settings=${state.data.settings} onClose=${() => setOpen(null)} />`}
  </div>`;
}
