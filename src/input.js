// Teclado + táctil -> controles RocketSim (convención del baseline: steer<0 = derecha, pitch = -throttle)
export function createInput() {
  const keys = new Set(), mob = { jx: 0, jy: 0, joy: false, jump: false, boost: false, slide: false, rl: false, rr: false };
  let camToggle = false, resetReq = false;
  addEventListener('keydown', e => {
    if (e.repeat) return; keys.add(e.code);
    if (e.code === 'KeyC') camToggle = true;
    if (e.code === 'KeyR') resetReq = true;
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  if (matchMedia('(pointer:coarse)').matches) {
    document.getElementById('mobile').style.display = 'block';
    const joy = document.getElementById('joy'), knob = document.getElementById('knob');
    const setJ = t => {
      const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (t.clientX - cx) / 70, dy = (cy - t.clientY) / 70, l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      mob.jx = dx; mob.jy = dy; mob.joy = true;
      knob.style.transform = `translate(${dx * 45}px,${-dy * 45}px)`;
    };
    joy.addEventListener('touchstart', e => { setJ(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
    joy.addEventListener('touchmove', e => { setJ(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
    joy.addEventListener('touchend', () => { mob.jx = mob.jy = 0; mob.joy = false; knob.style.transform = ''; });
    document.querySelectorAll('.btn').forEach(b => {
      const k = b.dataset.k, on = e => { mob[k] = true; e.preventDefault(); }, off = () => { mob[k] = false; };
      b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('touchcancel', off);
    });
  }
  const ctl = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false };
  return {
    ctl,
    poll() {
      let th = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      let st = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      let roll = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
      if (mob.joy) { const dz = v => Math.abs(v) < .12 ? 0 : v; st = -dz(mob.jx); th = dz(mob.jy); }
      if (mob.rl) roll = -1; if (mob.rr) roll = 1;
      ctl.throttle = th; ctl.steer = st; ctl.yaw = st; ctl.pitch = -th; ctl.roll = roll;
      ctl.jump = keys.has('Space') || mob.jump;
      ctl.boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || mob.boost;
      ctl.handbrake = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyX') || mob.slide;
      return ctl;
    },
    takeCamToggle() { const v = camToggle; camToggle = false; return v; },
    takeReset() { const v = resetReq; resetReq = false; return v; },
  };
}
