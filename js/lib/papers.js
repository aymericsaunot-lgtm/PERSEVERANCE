// Paper identifiers, metadata lookup (Crossref, arXiv, DataCite) and BibTeX export.
import { htmlToLatex, latexToPlain, decodeEntities, normalize } from './text.js';

const TIMEOUT_MS = 12000;
const PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'del', 'della', 'di', 'da', 'dos', 'das', 'du', 'le', 'la', 'ter', 'ten', 'zu', 'bin', 'al', 'el', 'st.', 'saint']);
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);

export function parseIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const axDoi = /10\.48550\/arxiv\.([^\s?#]+)/i.exec(s);
  if (axDoi) return { type: 'arxiv', value: cleanArxivId(axDoi[1]) };
  const looksArxiv = /arxiv/i.test(s);
  const axNew = /(?:^|[^\d.])(\d{4}\.\d{4,5})(?:v\d+)?(?![\d])/.exec(s);
  const axOld = /([a-z][a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i.exec(s);
  const doi = /(10\.\d{4,9}\/[^\s"<>]+)/i.exec(s);
  if (doi && !looksArxiv) return { type: 'doi', value: cleanDoi(doi[1]) };
  if (axNew) return { type: 'arxiv', value: axNew[1] };
  if (axOld && (looksArxiv || /^[a-z-]+(\.[A-Z]{2})?\/\d{7}/i.test(s))) return { type: 'arxiv', value: axOld[1] };
  if (doi) return { type: 'doi', value: cleanDoi(doi[1]) };
  return null;
}

function cleanDoi(d) {
  let x = decodeURIComponent(d).replace(/[.,;:]+$/, '');
  if (x.endsWith(')') && (x.match(/\(/g) || []).length < (x.match(/\)/g) || []).length) x = x.slice(0, -1);
  return x.replace(/\/(abstract|full|pdf|epdf)$/i, '');
}

function cleanArxivId(id) {
  return id.replace(/v\d+$/i, '').replace(/[.,;]+$/, '');
}

export function splitName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n) return { given: '', family: '' };
  if (n.includes(',')) {
    const [family, ...rest] = n.split(',');
    return { given: rest.join(',').trim(), family: family.trim() };
  }
  const parts = n.split(' ');
  if (parts.length === 1) return { given: '', family: parts[0] };
  let end = parts.length;
  let suffix = '';
  if (SUFFIXES.has(parts[end - 1].toLowerCase()) && end > 2) { suffix = ' ' + parts[end - 1]; end--; }
  let i = end - 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return { given: parts.slice(0, i).join(' '), family: parts.slice(i, end).join(' ') + suffix };
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) throw Object.assign(new Error('not-found'), { code: 404 });
    if (!res.ok) throw Object.assign(new Error('http-' + res.status), { code: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error('http-' + res.status), { code: res.status });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const encodeDoi = (doi) => doi.split('/').map(encodeURIComponent).join('/');

async function fromCrossref(doi) {
  const json = await getJSON(`https://api.crossref.org/works/${encodeDoi(doi)}`);
  const m = json.message || {};
  const dateParts = (m.issued || m['published-print'] || m['published-online'] || m.created || {})['date-parts'];
  const pages = m.page || m['article-number'] || '';
  return {
    title: htmlToLatex((m.title || [])[0] || ''),
    authors: (m.author || [])
      .map((a) => (a.family ? { given: decodeEntities(a.given || ''), family: decodeEntities(a.family) } : splitName(a.name || '')))
      .filter((a) => a.family),
    year: dateParts && dateParts[0] && dateParts[0][0] ? Number(dateParts[0][0]) : null,
    journal: decodeEntities(htmlToLatex((m['container-title'] || [])[0] || '')),
    journalShort: decodeEntities((m['short-container-title'] || [])[0] || ''),
    volume: m.volume || '',
    number: m.issue || '',
    pages,
    doi: m.DOI || doi,
    url: m.URL || `https://doi.org/${doi}`,
    abstract: m.abstract ? htmlToLatex(String(m.abstract).replace(/<jats:title>[\s\S]*?<\/jats:title>/gi, '')) : '',
    kind: m.type === 'posted-content' ? 'preprint' : 'article',
  };
}

async function fromDataCite(doi) {
  const json = await getJSON(`https://api.datacite.org/dois/${encodeDoi(doi)}`);
  const a = (json.data && json.data.attributes) || {};
  const ax = /^10\.48550\/arxiv\.(.+)$/i.exec(a.doi || doi);
  const publisher = typeof a.publisher === 'object' && a.publisher ? a.publisher.name : a.publisher;
  return {
    title: (a.titles && a.titles[0] && a.titles[0].title) || '',
    authors: (a.creators || [])
      .map((c) => (c.familyName ? { given: c.givenName || '', family: c.familyName } : splitName(c.name || '')))
      .filter((x) => x.family),
    year: a.publicationYear ? Number(a.publicationYear) : null,
    abstract: ((a.descriptions || []).find((d) => d.descriptionType === 'Abstract') || {}).description || '',
    doi: ax ? '' : (a.doi || doi),
    arxiv: ax ? ax[1] : '',
    journal: ax ? '' : (publisher || ''),
    url: ax ? `https://arxiv.org/abs/${ax[1]}` : `https://doi.org/${a.doi || doi}`,
    kind: ax ? 'preprint' : 'article',
  };
}

async function fromArxivApi(id) {
  const xml = await getText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entry = doc.getElementsByTagName('entry')[0];
  const get = (el, tag) => (el.getElementsByTagName(tag)[0] || {}).textContent || '';
  if (!entry || /api\/errors/.test(get(entry, 'id')) || !get(entry, 'title')) throw new Error('not-found');
  const NS = 'http://arxiv.org/schemas/atom';
  const nsGet = (tag) => (entry.getElementsByTagNameNS(NS, tag)[0] || {}).textContent || '';
  const primary = entry.getElementsByTagNameNS(NS, 'primary_category')[0];
  const published = get(entry, 'published');
  return {
    title: get(entry, 'title').replace(/\s+/g, ' ').trim(),
    authors: [...entry.getElementsByTagName('author')].map((a) => splitName(latexToPlain(get(a, 'name')))).filter((x) => x.family),
    year: published ? Number(published.slice(0, 4)) : yearFromArxivId(id),
    abstract: get(entry, 'summary').replace(/\s+/g, ' ').trim(),
    arxiv: id,
    primaryClass: primary ? primary.getAttribute('term') : '',
    doi: nsGet('doi').trim(),
    journalRef: nsGet('journal_ref').trim(),
    url: `https://arxiv.org/abs/${id}`,
    kind: 'preprint',
  };
}

export function yearFromArxivId(id) {
  const m = /^(\d{2})(\d{2})\./.exec(id) || /\/(\d{2})(\d{2})\d{3}/.exec(id);
  if (!m) return null;
  const yy = Number(m[1]);
  return yy > 90 ? 1900 + yy : 2000 + yy;
}

// Returns a paper draft (no id, no status) or throws an Error with a readable message.
export async function lookupPaper(input) {
  const id = parseIdentifier(input);
  if (!id) throw new Error('Paste a DOI like 10.1103/PhysRevB.110.115101 or an arXiv ID like 2401.12345.');
  if (id.type === 'arxiv') {
    let paper;
    try {
      paper = await fromArxivApi(id.value);
    } catch (e) {
      try {
        paper = await fromDataCite(`10.48550/arXiv.${id.value}`);
      } catch (e2) {
        throw new Error(friendly(e2, `No arXiv record found for ${id.value}.`));
      }
    }
    if (paper.doi) {
      try {
        const pub = await fromCrossref(paper.doi);
        paper = { ...paper, journal: pub.journal, journalShort: pub.journalShort, volume: pub.volume, number: pub.number, pages: pub.pages, year: pub.year || paper.year, kind: 'article' };
      } catch (e) { /* keep the preprint record */ }
    }
    return paper;
  }
  try {
    return await fromCrossref(id.value);
  } catch (e) {
    try {
      return await fromDataCite(id.value);
    } catch (e2) {
      throw new Error(friendly(e.code === 404 ? e2 : e, `No record found for DOI ${id.value}.`));
    }
  }
}

function friendly(err, notFound) {
  if (err && (err.code === 404 || err.message === 'not-found')) return notFound;
  if (err && err.name === 'AbortError') return 'The lookup took too long. Try again in a moment.';
  if (!navigator.onLine) return 'You are offline. Connect to look up papers, or add the details by hand.';
  return 'The lookup service did not answer. Try again, or add the details by hand.';
}

// Display helpers
export function authorShort(p) {
  const a = p.authors || [];
  if (!a.length) return '';
  if (a.length === 1) return a[0].family;
  if (a.length === 2) return `${a[0].family} and ${a[1].family}`;
  return `${a[0].family} et al.`;
}

export function authorsLong(p, max = 12) {
  const a = (p.authors || []).map((x) => [x.given, x.family].filter(Boolean).join(' '));
  if (a.length <= max) return a.join(', ');
  return `${a.slice(0, max).join(', ')} and ${a.length - max} more`;
}

export function journalLine(p) {
  if (p.kind !== 'preprint' && (p.journalShort || p.journal)) {
    const j = p.journalShort || p.journal;
    const vol = p.volume ? ` ${p.volume}` : '';
    const pages = p.pages ? `, ${p.pages}` : '';
    return { journal: j, rest: `${vol}${pages}` };
  }
  if (p.arxiv) return { journal: '', rest: `arXiv:${p.arxiv}` };
  if (p.journalRef) return { journal: p.journalRef, rest: '' };
  return { journal: p.journal || '', rest: '' };
}

// Real arXiv identifiers only: 2401.12345, 2401.12345v2 or cond-mat/0601001.
export function isArxivId(id) {
  const s = String(id || '').trim();
  return /^\d{4}\.\d{4,5}(v\d+)?$/.test(s) || /^[a-z][a-z-]*(\.[A-Z]{2})?\/\d{7}(v\d+)?$/i.test(s);
}

const isDoi = (d) => /^10\.\d{4,9}\/\S+$/.test(String(d || '').trim());

// Links are only offered when the identifier is well formed, so a typo never opens a dead page.
export function paperLinks(p) {
  const ax = isArxivId(p.arxiv) ? p.arxiv.trim() : '';
  const doi = isDoi(p.doi) ? p.doi.trim() : '';
  return {
    doi: doi ? `https://doi.org/${doi}` : '',
    arxiv: ax ? `https://arxiv.org/abs/${ax}` : '',
    pdf: ax ? `https://arxiv.org/pdf/${ax}` : '',
    url: !doi && !ax && /^https?:\/\//.test(p.url || '') ? p.url : '',
  };
}

// BibTeX
const STOP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'at', 'by', 'from', 'via', 'its', 'is', 'are', 'as', 'toward', 'towards', 'into', 'how', 'what', 'why', 'do', 'does', 'new']);
const GREEK_TEX = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'varepsilon', 'ϵ': 'epsilon', 'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'φ': 'varphi', 'ϕ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega', 'Γ': 'Gamma', 'Δ': 'Delta', 'Θ': 'Theta', 'Λ': 'Lambda', 'Π': 'Pi', 'Σ': 'Sigma', 'Φ': 'Phi', 'Ψ': 'Psi', 'Ω': 'Omega' };
const SUB_MAP = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

const ascii = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/[^A-Za-z]/g, '');

export function bibKey(p) {
  const first = (p.authors && p.authors[0] && p.authors[0].family) || 'Anon';
  const family = ascii(first.split(' ').pop()) || 'Anon';
  const words = normalize(latexToPlain(p.title || '')).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  const word = words[0] ? ascii(words[0]) : '';
  const w = word ? word[0].toUpperCase() + word.slice(1) : '';
  return `${family}${p.year || ''}${w}`;
}

function escapeOutsideMath(s, fn) {
  return String(s).split(/(\$[^$]*\$)/g).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

function bibText(s) {
  let t = String(s || '');
  t = t.replace(/([₀-₉]+)/g, (m) => `$_{${m.split('').map((c) => SUB_MAP[c]).join('')}}$`);
  t = escapeOutsideMath(t, (x) => x
    .replace(/(^|[^\\])([&%#])/g, '$1\\$2')
    .replace(/[αβγδεϵζηθκλμνξπρστφϕχψωΓΔΘΛΠΣΦΨΩ]/g, (c) => `$\\${GREEK_TEX[c]}$`));
  return t.replace(/\$\$/g, '');
}

export function toBibtex(papers) {
  const used = new Map();
  const entries = papers.map((p) => {
    let key = p.bibkey || bibKey(p);
    const n = used.get(key) || 0;
    used.set(key, n + 1);
    if (n > 0) key = key + String.fromCharCode(96 + n + 1);
    const isArticle = p.kind !== 'preprint' && !!(p.journal || p.journalShort);
    const fields = [
      ['author', (p.authors || []).map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join(' and ')],
      ['title', `{${bibText(p.title)}}`],
    ];
    if (isArticle) {
      fields.push(['journal', bibText(p.journalShort || p.journal)]);
      fields.push(['volume', p.volume]);
      fields.push(['number', p.number]);
      fields.push(['pages', String(p.pages || '').replace(/\s*[-\u2013]\s*/g, '--')]);
    }
    fields.push(['year', p.year ? String(p.year) : '']);
    fields.push(['doi', p.doi]);
    if (isArxivId(p.arxiv)) {
      fields.push(['eprint', p.arxiv.trim()]);
      fields.push(['archivePrefix', 'arXiv']);
      fields.push(['primaryClass', p.primaryClass]);
    }
    if (!p.doi && !p.arxiv) fields.push(['url', p.url]);
    const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
    return `@${isArticle ? 'article' : 'misc'}{${key},\n${body}\n}`;
  });
  return entries.join('\n\n') + '\n';
}
