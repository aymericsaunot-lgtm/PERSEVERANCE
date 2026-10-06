// Text helpers: LaTeX and HTML titles to safe display segments, search normalisation,
// chemical formula subscripts. Nothing here produces raw HTML, so it is safe to render.

const COMBINING = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃',
  '=': '̄', '.': '̇', u: '̆', v: '̌', H: '̋',
  c: '̧', r: '̊', k: '̨', b: '̱', d: '̣',
};

const TEXT_SYMBOLS = {
  ss: 'ß', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ',
  l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', dh: 'ð', DH: 'Ð', th: 'þ', TH: 'Þ',
};

const MATH_SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  ell: 'ℓ', hbar: 'ℏ', nabla: '∇', partial: '∂', infty: '∞', times: '×', cdot: '⋅', pm: '±', mp: '∓',
  sim: '∼', simeq: '≃', approx: '≈', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', uparrow: '↑',
  downarrow: '↓', propto: '∝', circ: '∘', degree: '°', prime: '′', dagger: '†', star: '⋆', ast: '∗',
  langle: '⟨', rangle: '⟩', parallel: '∥', perp: '⊥', in: '∈', AA: 'Å', sqrt: '√', lesssim: '≲',
  gtrsim: '≳', ll: '≪', gg: '≫', equiv: '≡', otimes: '⊗', oplus: '⊕', cdots: '⋯', ldots: '…',
  Uparrow: '⇑', hookrightarrow: '↪', mapsto: '↦', div: '÷',
};

const BLACKBOARD = { Z: 'ℤ', R: 'ℝ', C: 'ℂ', N: 'ℕ', Q: 'ℚ', H: 'ℍ', P: 'ℙ' };
const WRAPPERS = new Set(['mathrm', 'text', 'textrm', 'mathbf', 'textbf', 'mathit', 'mathsf', 'mathtt', 'operatorname', 'boldsymbol', 'bm', 'mathcal', 'mathscr', 'mathfrak', 'textnormal', 'textup', 'texttt', 'textsc', 'textsf', 'mbox', 'rm', 'bf', 'it', 'sf', 'tt', 'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle']);
const ITALIC_WRAPPERS = new Set(['textit', 'emph', 'textsl']);
const ACCENT_MATH = { hat: '̂', bar: '̄', tilde: '̃', vec: '⃗', dot: '̇', ddot: '̈', check: '̌', breve: '̆', overline: '̅' };

// Replace text-mode accents and special letters (outside math only).
function textAccents(s) {
  return s
    .replace(/\\([`'^"~=.])\s*(?:\{\s*\\?([a-zA-Z])\s*\}|\\?([a-zA-Z]))/g, (_, acc, a, b) => ((a || b) + COMBINING[acc]).normalize('NFC'))
    .replace(/\\([uvHcrkbd])\s*\{\s*\\?([a-zA-Z])\s*\}/g, (_, acc, ch) => (ch + COMBINING[acc]).normalize('NFC'))
    .replace(/\{\\(ss|o|O|aa|AA|ae|AE|oe|OE|l|L|i|j)\}/g, (_, k) => TEXT_SYMBOLS[k])
    .replace(/\\(ss|aa|AA|ae|AE|oe|OE)(?![a-zA-Z])/g, (_, k) => TEXT_SYMBOLS[k])
    .replace(/\\([oOlL])(?![a-zA-Z])\s?/g, (_, k) => TEXT_SYMBOLS[k])
    .replace(/---?/g, '-')
    .replace(/``|''/g, '"')
    .replace(/\\([&%#_$])/g, '$1')
    .replace(/~/g, ' ');
}

// Tokenise LaTeX into segments: {t: 'text'|'sub'|'sup'|'i', s}.
export function latexToSegments(input) {
  if (!input) return [];
  const src = String(input).replace(/\s+/g, ' ').trim();
  const out = [];
  const push = (t, s) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s;
    else out.push({ t, s });
  };

  // Split into text and math chunks on unescaped $ (and \( \) pairs).
  const chunks = [];
  let buf = '';
  let inMath = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && (src[i + 1] === '$')) { buf += '\\$'; i++; continue; }
    if (ch === '\\' && (src[i + 1] === '(' || src[i + 1] === ')')) {
      chunks.push({ math: inMath, s: buf }); buf = ''; inMath = src[i + 1] === '('; i++; continue;
    }
    if (ch === '$') {
      chunks.push({ math: inMath, s: buf }); buf = ''; inMath = !inMath; continue;
    }
    buf += ch;
  }
  chunks.push({ math: inMath, s: buf });

  for (const chunk of chunks) {
    if (!chunk.s) continue;
    if (chunk.math) parseMath(chunk.s, push, 'text');
    else parseText(chunk.s, push);
  }
  return out;
}

function parseText(s, push) {
  s = textAccents(s);
  // Handle \textit{...}, \emph{...} and drop unknown commands, keep their arguments.
  let i = 0;
  let plain = '';
  const flush = () => { push('text', plain.replace(/[{}]/g, '')); plain = ''; };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)\s*/.exec(s.slice(i));
      if (m) {
        const name = m[1];
        i += m[0].length;
        if (s[i] === '{') {
          const end = matchBrace(s, i);
          const inner = s.slice(i + 1, end);
          i = end + 1;
          if (ITALIC_WRAPPERS.has(name)) { flush(); push('i', textAccents(inner).replace(/[{}]/g, '')); }
          else if (name === 'textsubscript') { flush(); push('sub', inner); }
          else if (name === 'textsuperscript') { flush(); push('sup', inner); }
          else plain += inner;
        }
        continue;
      }
      i += 2;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
}

function matchBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return s.length - 1;
}

// Read one math "atom" starting at i: a group, a command or a character. Returns [text, nextIndex].
function readAtom(s, i) {
  while (s[i] === ' ') i++;
  if (i >= s.length) return ['', i];
  if (s[i] === '{') {
    const end = matchBrace(s, i);
    return [mathToPlain(s.slice(i + 1, end)), end + 1];
  }
  if (s[i] === '\\') {
    const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
    if (!m) return ['', i + 1];
    const name = m[1];
    let j = i + m[0].length;
    if (WRAPPERS.has(name) || ACCENT_MATH[name] || name === 'mathbb') {
      const [arg, k] = readAtom(s, j);
      if (name === 'mathbb') return [arg.split('').map((c) => BLACKBOARD[c] || c).join(''), k];
      if (ACCENT_MATH[name]) return [(arg + ACCENT_MATH[name]).normalize('NFC'), k];
      return [arg, k];
    }
    return [MATH_SYMBOLS[name] ?? (/[a-zA-Z]/.test(name) ? '' : name === ',' || name === ';' || name === ' ' ? ' ' : name === '!' ? '' : name), j];
  }
  return [s[i], i + 1];
}

function mathToPlain(s) {
  const parts = [];
  parseMath(s, (t, x) => parts.push(x), 'text');
  return parts.join('');
}

function parseMath(s, push, base) {
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '_' || ch === '^') {
      const [atom, next] = readAtom(s, i + 1);
      if (ch === '^' && atom === '∘') push(base, '°');
      else push(ch === '_' ? 'sub' : 'sup', atom);
      i = next;
      continue;
    }
    if (ch === '\\' && /^\\frac\s*\{/.test(s.slice(i))) {
      const j = i + 5;
      const [a, k] = readAtom(s, j);
      const [b, l] = readAtom(s, k);
      push(base, `${a}/${b}`);
      i = l;
      continue;
    }
    if (ch === '\\') {
      // Font and sizing wrappers keep their content's own subscripts: \mathrm{BaCo_2}.
      const m = /^\\([a-zA-Z]+)\s*/.exec(s.slice(i));
      if (m && WRAPPERS.has(m[1])) {
        const j = i + m[0].length;
        if (s[j] === '{') {
          const end = matchBrace(s, j);
          parseMath(s.slice(j + 1, end), push, base);
          i = end + 1;
        } else {
          i = j;
        }
        continue;
      }
      const [atom, next] = readAtom(s, i);
      push(base, atom);
      i = next;
      continue;
    }
    if (ch === '{') {
      const end = matchBrace(s, i);
      parseMath(s.slice(i + 1, end), push, base);
      i = end + 1;
      continue;
    }
    if (ch === '}') { i++; continue; }
    push(base, ch);
    i++;
  }
}

export function latexToPlain(s) {
  return latexToSegments(s).map((x) => x.s).join('');
}

const SUB_DIGITS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-' };
const SUP_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

// Lowercase, accent-free, markup-free text for matching and search.
export function normalize(s) {
  if (!s) return '';
  const plain = latexToPlain(String(s))
    .replace(/[₀-₉₊₋]/g, (c) => SUB_DIGITS[c])
    .replace(/[⁰¹²³⁴-⁹⁺⁻]/g, (c) => SUP_DIGITS[c] || c);
  return plain
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keyword matching shared with the arXiv script:
// words must all appear, "quoted text" must appear as a phrase, author:Name matches authors.
export function matchesKeyword(keyword, haystackNorm, authorsNorm = '') {
  const kw = String(keyword || '').trim();
  if (!kw) return false;
  const authorM = /^(?:author|au):\s*(.+)$/i.exec(kw);
  if (authorM) return authorsNorm.includes(normalize(authorM[1]));
  const phrases = [];
  const rest = kw.replace(/"([^"]+)"/g, (_, p) => { phrases.push(normalize(p)); return ' '; });
  const words = normalize(rest).split(' ').filter(Boolean);
  return phrases.every((p) => haystackNorm.includes(p)) && words.every((w) => haystackNorm.includes(w));
}

// Crossref and publishers send titles with <sub>, <i>, MathML. Convert to the LaTeX-ish
// form used everywhere in the app (so display and BibTeX share one representation).
export function htmlToLatex(s) {
  if (!s) return '';
  let t = String(s);
  t = t.replace(/<mml:math[\s\S]*?<\/mml:math>/gi, (m) => m.replace(/<mml:msub>\s*<mml:mi>([^<]*)<\/mml:mi>\s*<mml:mn>([^<]*)<\/mml:mn>\s*<\/mml:msub>/gi, '$1<sub>$2</sub>'));
  t = t.replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, x) => `$_{${stripTags(x)}}$`);
  t = t.replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, x) => `$^{${stripTags(x)}}$`);
  t = t.replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, (_, __, x) => `\\textit{${stripTags(x)}}`);
  t = stripTags(t);
  t = decodeEntities(t);
  t = t.replace(/\$\$/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '…' };
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[\u2013\u2014]/g, '-');
}

// "MnBi2Te4" -> segments with subscripts; used for tags and keywords.
export function chemSegments(s) {
  const str = String(s || '');
  if (/[$\\_^]/.test(str)) return latexToSegments(str);
  const out = [];
  const re = /([A-Za-z\)\]])(\d+(?:\.\d+)?)/g;
  let last = 0;
  let m;
  while ((m = re.exec(str))) {
    const start = m.index + m[1].length;
    out.push({ t: 'text', s: str.slice(last, start) });
    out.push({ t: 'sub', s: m[2] });
    last = start + m[2].length;
  }
  out.push({ t: 'text', s: str.slice(last) });
  return out.filter((x) => x.s);
}

export function sameTag(a, b) {
  return normalize(a).replace(/\s/g, '') === normalize(b).replace(/\s/g, '');
}

export function truncate(s, n) {
  if (!s || s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 20);
}
