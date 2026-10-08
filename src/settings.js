// Panel de ajustes: proveedor, API key, ubicación y calidad. Se guarda solo en este dispositivo (localStorage).
const KEY = 'rw.settings.v1';
export const PRESETS = {
  'Málaga': [36.7213, -4.4214], 'Barcelona': [41.3874, 2.1686], 'Valencia': [39.4699, -0.3763], 'Mónaco': [43.7384, 7.4246],
  'Dubrovnik': [42.6507, 18.0944], 'Santorini (Fira)': [36.4166, 25.4313], 'Nueva York': [40.758, -73.9855], 'Dubái': [25.1972, 55.2744],
};
export function initSettings(onApply, coarse) {
  const s = { provider: 'google', key: '', asset: '', lat: 36.7213, lon: -4.4214, sse: coarse ? 24 : 16, follow: true, maxTex: coarse ? 120 : 260, sseDyn: 48 };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const $ = id => document.getElementById(id);
  $('sPreset').innerHTML = '<option value="">Ubicación personalizada</option>' + Object.keys(PRESETS).map(k => `<option>${k}</option>`).join('');
  const fill = () => { $('sProvider').value = s.provider; $('sKey').value = s.key; $('sAsset').value = s.asset; $('sLat').value = s.lat; $('sLon').value = s.lon; $('sSse').value = s.sse; $('sFollow').checked = s.follow; $('sTex').value = s.maxTex; $('sSseDyn').value = s.sseDyn; sync(); };
  const sync = () => { $('sAssetRow').style.display = $('sProvider').value === 'ion-custom' ? 'block' : 'none'; $('sSseVal').textContent = $('sSse').value + ' px'; $('sTexVal').textContent = $('sTex').value; $('sSseDynVal').textContent = $('sSseDyn').value + ' px'; };
  const status = (msg, err) => { $('sStatus').textContent = msg; $('sStatus').style.color = err ? '#ff8a80' : '#9fe0a8'; };
  $('sProvider').onchange = sync; $('sSse').oninput = sync; $('sTex').oninput = sync; $('sSseDyn').oninput = sync;
  $('sPreset').onchange = e => { const p = PRESETS[e.target.value]; if (p) { $('sLat').value = p[0]; $('sLon').value = p[1]; } };
  $('gear').onclick = () => { $('settings').style.display = $('settings').style.display === 'block' ? 'none' : 'block'; };
  $('sClose').onclick = () => { $('settings').style.display = 'none'; };
  $('sClear').onclick = () => { s.key = ''; $('sKey').value = ''; try { localStorage.removeItem(KEY); } catch (_) {} onApply({ ...s, key: '' }); status('Clave borrada de este dispositivo. Modo procedural.'); };
  $('sApply').onclick = () => {
    s.provider = $('sProvider').value; s.key = $('sKey').value.trim(); s.asset = $('sAsset').value.trim();
    s.lat = Math.max(-85, Math.min(85, parseFloat($('sLat').value) || 0)); s.lon = parseFloat($('sLon').value) || 0;
    s.sse = parseInt($('sSse').value, 10); s.follow = $('sFollow').checked; s.maxTex = parseInt($('sTex').value, 10); s.sseDyn = parseInt($('sSseDyn').value, 10);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
    status(s.key ? 'Conectando…' : 'Sin clave: modo procedural.'); onApply({ ...s });
  };
  fill();
  return { get: () => ({ ...s }), status };
}
