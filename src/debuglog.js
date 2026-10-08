// Log de depuración en vivo: 1 registro por frame (anillo de 30 s) + eventos + resumen con anomalías, copiable con un botón.
const COLS = [['t', 0], ['dt', 1], ['fps', 0], ['x', 1], ['y', 1], ['z', 1], ['kmh', 0], ['gnd', 0], ['ox', 1], ['oz', 1], ['AO', 0],
  ['cx', 1], ['cy', 1], ['cz', 1], ['loaded', 0], ['tex', 0], ['sel', 0], ['pend', 0], ['act', 0], ['fail', 0], ['sse', 0], ['vOff', 1], ['g', 1],
  ['cand', 0], ['MB', 0], ['evict', 0], ['calls', 0], ['tris', 0], ['rtex', 0], ['rgeo', 0], ['heap', 0], ['hasG', 0], ['res', 1], ['h', 1], ['hS', 1]];
const C = Object.fromEntries(COLS.map(([n], i) => [n, i]));
const MAXF = 1800, MAXE = 500;
export const redact = k => (k ? k.slice(0, 4) + '…(' + k.length + ' car.)' : '(vacío)');
const fmt = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? '-' : (+v).toFixed(d));

export function createLog() {
  const ring = new Array(MAXF); let n = 0; const events = []; const t0 = performance.now(); let env = '';
  const ev = (type, msg) => { events.push(`+${(performance.now() - t0).toFixed(0)}ms [${type}] ${msg}`); if (events.length > MAXE) events.shift(); };
  const args = a => a.map(x => (x instanceof Error ? x.message : typeof x === 'object' ? (() => { try { return JSON.stringify(x).slice(0, 200); } catch (_) { return String(x); } })() : String(x))).join(' ').slice(0, 300);
  for (const k of ['warn', 'error']) { const o = console[k]; console[k] = (...a) => { ev('console.' + k, args(a)); o.apply(console, a); }; }
  addEventListener('error', e => ev('JS-ERROR', `${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
  addEventListener('unhandledrejection', e => ev('PROMISE', args([e.reason])));
  document.addEventListener('visibilitychange', () => ev('visibilidad', document.visibilityState));
  addEventListener('pagehide', () => ev('pagehide', 'la página se descarga/oculta'));
  document.addEventListener('freeze', () => ev('freeze', 'Chrome congeló la pestaña'));
  addEventListener('resize', () => ev('resize', `${innerWidth}x${innerHeight}`));

  const frame = row => { ring[n % MAXF] = row; n++; };
  const rows = secs => {
    const count = Math.min(n, MAXF); if (!count) return [];
    const last = ring[(n - 1) % MAXF], tMin = last[0] - secs * 1000, out = [];
    for (let k = n - count; k < n; k++) { const r = ring[k % MAXF]; if (r[0] >= tMin) out.push(r); }
    return out;
  };
  function summary(R) {
    if (!R.length) return ['sin frames'];
    const col = nm => R.map(r => r[C[nm]]).filter(v => v !== null && v !== undefined && !Number.isNaN(v));
    const mm = nm => { const a = col(nm); return a.length ? [Math.min(...a), Math.max(...a)] : null; };
    const L = [], warn = [], dts = col('dt'), avg = dts.reduce((a, b) => a + b, 0) / dts.length;
    L.push(`ventana: ${R.length} frames, ${((R[R.length - 1][0] - R[0][0]) / 1000).toFixed(1)} s`);
    L.push(`fps medio ${(1000 / avg).toFixed(0)} · peor frame ${Math.max(...dts).toFixed(0)} ms · frames >50ms: ${dts.filter(d => d > 50).length}`);
    if (Math.max(...dts) > 100) warn.push(`parón(es) de hasta ${Math.max(...dts).toFixed(0)} ms (¿subida de texturas / GC?)`);
    const sel = R.map(r => r[C.sel]);
    if (sel.some(v => v !== null)) {
      let best = 0, cur = 0, bestMs = 0, st = 0;
      R.forEach((r, i) => { if (r[C.sel] === 0) { if (!cur) st = r[0]; cur++; if (cur > best) { best = cur; bestMs = r[0] - st; } } else cur = 0; });
      L.push(`tiles visibles: ${mm('sel')[0]}..${mm('sel')[1]} · racha máx. con 0 visibles: ${best} frames (~${bestMs.toFixed(0)} ms)`);
      if (best > 20) warn.push(`MAPA INVISIBLE ${best} frames seguidos (sel=0): mira vOff/g/cand/loaded en esas filas`);
      const t = mm('tex'), lo = mm('loaded'), v = col('vOff'), g = col('g');
      L.push(`tex ${t[0]}..${t[1]} · cargados ${lo[0]}..${lo[1]} · fallos acumulados Δ${col('fail').slice(-1)[0] - col('fail')[0]} · evictados Δ${col('evict').slice(-1)[0] - col('evict')[0]} · MB ${mm('MB')[0]}..${mm('MB')[1]} · sse ${mm('sse')[0]}..${mm('sse')[1]}`);
      let step = 0; for (let i = 1; i < v.length; i++) step = Math.max(step, Math.abs(v[i] - v[i - 1]));
      const vr = mm('vOff'); L.push(`vOff ${vr[0].toFixed(1)}..${vr[1].toFixed(1)} m (mayor salto/frame ${step.toFixed(1)} m) · g ${g.length ? Math.min(...g).toFixed(1) + '..' + Math.max(...g).toFixed(1) : 'sin medida'}`);
      if (step > 3) warn.push(`vOff da saltos de ${step.toFixed(1)} m: la alineación vertical oscila`);
      if (!g.length) warn.push('nunca se midió suelo (g vacío): el mapa no se puede alinear con el coche');
      const hh = col('h'), hs = col('hS'); if (hh.length) L.push(`suelo h (bruto) ${Math.min(...hh).toFixed(0)}..${Math.max(...hh).toFixed(0)} m · estable ${hs.length ? Math.min(...hs).toFixed(0) + '..' + Math.max(...hs).toFixed(0) : '-'} m · muestras atípicas registradas: ${events.filter(e => e.includes('g-atipico')).length}`);
      const cy = mm('cy'); L.push(`cámara y local ${cy[0].toFixed(1)}..${cy[1].toFixed(1)} m`);
    }
    const cy = mm('y'); L.push(`coche y ${cy[0].toFixed(1)}..${cy[1].toFixed(1)} m · velocidad máx ${mm('kmh')[1].toFixed(0)} km/h · AO ${mm('AO')[0]}..${mm('AO')[1]} uu`);
    const hp = mm('heap'); if (hp) L.push(`heap JS ${hp[0]}..${hp[1]} MB · llamadas ${mm('calls')[0]}..${mm('calls')[1]} · triángulos ${mm('tris')[0]}..${mm('tris')[1]} · texturas GPU ${mm('rtex')[0]}..${mm('rtex')[1]}`);
    if (mm('fps')[1] < 30) warn.push('fps bajo (<30)');
    if (events.some(e => e.includes('CONTEXTO'))) warn.push('se perdió el contexto WebGL');
    return L.concat(warn.length ? ['', ...warn.map(w => '⚠ ' + w)] : ['', 'sin anomalías detectadas en la ventana']);
  }
  const text = secs => {
    const R = rows(secs), head = COLS.map(c => c[0]).join(' ');
    const lines = R.map(r => COLS.map(([, d], i) => fmt(r[i], d)).join(' '));
    return ['=== ROCKETWORLD DEBUG LOG ===', new Date().toISOString(), '', '--- ENTORNO ---', env, '', '--- RESUMEN ---', ...summary(R), '',
      `--- EVENTOS (últimos ${Math.min(events.length, 120)}) ---`, ...events.slice(-120), '', `--- FRAMES (${lines.length}, 1 por frame; unidades: m, uu en AO, ms) ---`, head, ...lines].join('\n');
  };
  return { frame, ev, text, rows, setEnv: s => { env = s; }, last: k => { const r = ring[(n - 1) % MAXF]; return r ? fmt(r[C[k]], 1) : '-'; },
    tail: (k = 8) => { const out = []; for (let i = Math.max(0, n - k); i < n; i++) out.push(COLS.map(([, d], j) => fmt(ring[i % MAXF][j], d)).join(' ')); return out; },
    recentEvents: (k = 5) => events.slice(-k), clear: () => { n = 0; events.length = 0; }, COLS };
}

// Botones: copiar (con respaldo manual si el portapapeles falla), borrar y overlay en vivo.
export function bindLogUI(log) {
  const $ = id => document.getElementById(id), win = () => parseInt($('sLogWin').value, 10) || 10;
  async function copy(btn) {
    const txt = log.text(win()), kb = (txt.length / 1024).toFixed(0), lines = txt.split('\n').length;
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; }
    catch (_) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.appendChild(ta); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (__) {} }
    const old = btn.dataset.l || (btn.dataset.l = btn.textContent);
    if (ok) btn.textContent = `✔ Copiado (${lines} líneas, ${kb} KB)`;
    else { btn.textContent = '⚠ Copia manual abajo'; $('logBox').style.display = 'flex'; $('logTa').value = txt; $('logTa').focus(); $('logTa').select(); }
    setTimeout(() => { btn.textContent = old; }, 2500);
  }
  $('sLogCopy').onclick = () => copy($('sLogCopy')); $('logBtn').onclick = () => copy($('logBtn'));
  $('sLogClear').onclick = () => log.clear(); $('logClose').onclick = () => { $('logBox').style.display = 'none'; };
  setInterval(() => {
    const live = $('logLive'); if (!$('sLogLive').checked) { live.style.display = 'none'; return; }
    live.style.display = 'block'; live.textContent = [log.COLS.map(c => c[0]).join(' '), ...log.tail(9), '— eventos —', ...log.recentEvents(5)].join('\n');
  }, 250);
}
