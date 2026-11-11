// DOM user interface: menus, HUD, settings, minimap.
import { CRYSTAL_TOTAL } from './level.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['loading', 'menu', 'howto', 'settings', 'pause', 'gameover', 'victory'];
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class UI {
  constructor(game) {
    this.game = game;
    this.current = 'loading';
    this.backTo = 'menu';
    this.map = $('minimap').getContext('2d');
    const row = $('crystal-row');
    for (let i = 0; i < CRYSTAL_TOTAL; i++) row.appendChild(document.createElement('i'));

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      game.audio.ensure(); game.audio.click();
      const a = b.dataset.action;
      if (a === 'start') game.start();
      else if (a === 'restart') game.start();
      else if (a === 'resume') game.resume();
      else if (a === 'quit') game.toMenu();
      else if (a === 'howto' || a === 'settings') { this.backTo = this.current; this.show(a); }
      else if (a === 'back') this.show(this.backTo);
    });
    this.bindSettings();
  }

  bindSettings() {
    const s = this.game.settings;
    const sens = $('set-sens'), vol = $('set-vol'), q = $('set-quality'), music = $('set-music'), inv = $('set-invert');
    const refresh = () => {
      sens.value = s.sensitivity; vol.value = s.volume; q.value = s.quality; music.checked = s.music; inv.checked = s.invertY;
      $('out-sens').textContent = Number(s.sensitivity).toFixed(2); $('out-vol').textContent = Math.round(s.volume * 100) + '%';
    };
    const commit = () => { refresh(); this.game.applySettings(); };
    sens.addEventListener('input', () => { s.sensitivity = +sens.value; commit(); });
    vol.addEventListener('input', () => { s.volume = +vol.value; commit(); });
    vol.addEventListener('change', () => { this.game.audio.ensure(); this.game.audio.coin(); });
    q.addEventListener('change', () => { s.quality = q.value; commit(); });
    music.addEventListener('change', () => { s.music = music.checked; commit(); });
    inv.addEventListener('change', () => { s.invertY = inv.checked; commit(); });
    refresh();
  }

  show(name) {
    this.current = name;
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    if (name) $(name).querySelector('.btn.primary')?.focus({ preventScroll: true });
  }
  hud(on) { $('hud').classList.toggle('hidden', !on); if (!on) $('vignette').className = ''; }
  loading(f, text) { $('load-fill').style.width = Math.round(f * 100) + '%'; if (text) $('load-text').textContent = text; }
  best(v) { $('best').textContent = v > 0 ? `Best score: ${v}` : ''; }

  async fade(fn) {
    const f = $('fade');
    f.classList.add('on');
    await new Promise((r) => setTimeout(r, 420));
    fn();
    requestAnimationFrame(() => f.classList.remove('on'));
  }

  setHealth(h, stamina, exhausted) {
    $('health-fill').style.width = h + '%'; $('health-ghost').style.width = h + '%';
    $('health-text').textContent = Math.ceil(h);
    $('health-fill').classList.toggle('low', h <= 30);
    $('stamina-fill').style.width = stamina * 100 + '%';
    $('stamina-fill').classList.toggle('tired', exhausted);
    $('vignette').classList.toggle('low', h > 0 && h <= 30);
  }
  setScore(v, bump) {
    const el = $('score'); el.textContent = v;
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  setTime(s) { $('time').textContent = fmtTime(s); }
  setCrystals(n) { [...$('crystal-row').children].forEach((el, i) => el.classList.toggle('on', i < n)); }
  setObjective(text, done = false) { const o = $('objective'); o.textContent = text; o.classList.toggle('done', done); }
  setPrompt(label, hint) {
    $('prompt').classList.toggle('hidden', !label); if (label) $('prompt-text').textContent = label;
    $('hint').classList.toggle('hidden', !hint || !!label); if (hint) $('hint').textContent = hint;
  }
  hurtFlash() { const v = $('vignette'); v.classList.add('hit'); setTimeout(() => v.classList.remove('hit'), 90); }
  toast(text, cls = '') {
    const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = text;
    const box = $('toasts'); box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 2400);
  }

  gameOver(score, crystals) { $('go-score').textContent = score; $('go-crystals').textContent = `${crystals}/${CRYSTAL_TOTAL}`; this.show('gameover'); }
  victory(score, bonus, time, isBest) {
    $('v-score').textContent = score; $('v-bonus').textContent = '+' + bonus; $('v-time').textContent = fmtTime(time);
    $('v-best').textContent = isBest ? 'New best score!' : '';
    this.show('victory');
  }

  /** Circular radar, rotated so "up" is where the camera looks. */
  drawMinimap(game) {
    const g = this.map, S = 170, R = S / 2, range = 62;
    const { player, level, enemies, camYaw } = game;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    const bg = g.createRadialGradient(R, R, 10, R, R, R);
    bg.addColorStop(0, 'rgba(30,70,60,0.82)'); bg.addColorStop(1, 'rgba(8,20,30,0.86)');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    for (const r of [0.33, 0.66]) { g.beginPath(); g.arc(R, R, R * r, 0, Math.PI * 2); g.stroke(); }
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const dot = (x, z, color, size, clamp) => {
      const ox = x - player.pos.x, oz = z - player.pos.z;
      let sx = (ox * rx + oz * rz) / range, sy = -(ox * fx + oz * fz) / range;
      const d = Math.hypot(sx, sy);
      if (d > 0.92) { if (!clamp) return; sx *= 0.92 / d; sy *= 0.92 / d; }
      g.fillStyle = color; g.beginPath(); g.arc(R + sx * R, R + sy * R, size, 0, Math.PI * 2); g.fill();
    };
    for (const c of level.coins) if (!c.taken) dot(c.pos.x, c.pos.z, 'rgba(255,205,70,0.8)', 1.6, false);
    for (const h of level.hearts) if (!h.taken) dot(h.pos.x, h.pos.z, '#ff5577', 3, false);
    for (const c of level.chests) if (!c.open) dot(c.pos.x, c.pos.z, '#ffb030', 3.4, false);
    for (const e of enemies.list) if (!e.dead) dot(e.pos.x, e.pos.z, e.state === 'chase' ? '#ff3020' : '#ff8a50', 3.6, false);
    for (const c of level.crystals) if (!c.taken) dot(c.pos.x, c.pos.z, '#55e8ff', 4.6, true);
    const pulse = level.portal.active ? 5.5 + Math.sin(performance.now() / 150) * 1.5 : 4.5;
    dot(level.portal.pos.x, level.portal.pos.z, level.portal.active ? '#ffffff' : '#a58bff', pulse, true);
    // player arrow (relative to camera)
    const rel = player.heading - (camYaw + Math.PI);
    g.translate(R, R); g.rotate(-rel);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
  }
}
