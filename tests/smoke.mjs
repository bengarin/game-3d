// End-to-end gameplay test. Drives the real game in headless Chromium with real key/mouse
// events and steps the simulation deterministically.
//   1) npm run dev      2) npm test            (GAME_URL overrides http://localhost:5173/)
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.GAME_URL || 'http://localhost:5173/';
const SHOTS = new globalThis.URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };
const step = (n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__game.step(1 / 60); }, n);
const get = (fn, arg) => page.evaluate(fn, arg);
const visible = (id) => get((id) => !document.getElementById(id).classList.contains('hidden'), id);
const shot = async (name) => { await get(() => { const g = window.__game; g.step(0); g.composer.render(0); }); for (let i = 0; i < 3; i++) { try { await page.screenshot({ path: `${SHOTS}${name}.png`, timeout: 20000 }); return; } catch { /* software GL can stall a capture; retry */ } } };
const tp = (x, z, yaw = 0, y = null) => get(([x, z, yaw, y]) => {
  const g = window.__game, p = g.player;
  p.pos.set(x, y ?? g.world.groundAt(x, z, 100), z); p.vel.set(0, 0, 0); p.grounded = y === null; p.invuln = 0;
  g.camYaw = yaw; g.camPitch = 0.3; p.heading = yaw + Math.PI; g.camTarget.copy(p.pos).y += 1.5; g.camSmoothDist = undefined;
}, [x, z, yaw, y]);
const clearEnemies = () => get(() => window.__game.enemies.list.forEach((e) => { e.home.set(500, 500); e.pos.set(500, 0, 500); e.way.set(500, 500); e.state = 'patrol'; }));
const startGame = async (selector) => {
  await page.click(selector);
  await page.waitForFunction(() => window.__game.state === 'playing');
  await get(() => window.__game.renderer.setAnimationLoop(null)); // the test owns the clock from here
  await step(2);
};

await page.goto(URL);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}01-menu.png` });

// ---------- menus ----------
check('main menu is shown', await visible('menu'));
await page.click('#menu [data-action=howto]');
check('How to Play opens', await visible('howto'));
await page.screenshot({ path: `${SHOTS}02-howto.png` });
await page.click('#howto [data-action=back]');
await page.click('#menu [data-action=settings]');
check('Settings opens', await visible('settings'));
await page.selectOption('#set-quality', 'low');
check('quality "low" disables shadows + bloom', await get(() => !window.__game.world.sun.castShadow && !window.__game.useComposer));
await page.selectOption('#set-quality', 'high');
check('quality "high" restores them', await get(() => window.__game.world.sun.castShadow && window.__game.useComposer));
await page.fill('#set-sens', '1.5');
check('sensitivity slider applies', await get(() => window.__game.settings.sensitivity === 1.5));
await page.fill('#set-sens', '1');
await page.screenshot({ path: `${SHOTS}03-settings.png` });
await page.click('#settings [data-action=back]');
check('Settings closes back to menu', await visible('menu'));

// ---------- start ----------
await startGame('#menu [data-action=start]');
check('Start Game begins play, HUD visible', (await visible('hud')) && !(await visible('menu')));
await clearEnemies();
await step(30);
await shot('04-spawn');

// ---------- movement ----------
let a = await get(() => window.__game.player.pos.toArray());
await page.keyboard.down('w'); await step(60);
let b = await get(() => ({ p: window.__game.player.pos.toArray(), anim: window.__game.player.current }));
check('W walks forward', a[2] - b.p[2] > 3 && a[2] - b.p[2] < 5.5, `moved ${(a[2] - b.p[2]).toFixed(2)}m, anim=${b.anim}`);
check('walk animation plays', b.anim === 'Walking');
await page.keyboard.down('Shift'); await step(60);
let c = await get(() => ({ p: window.__game.player.pos.toArray(), anim: window.__game.player.current, st: window.__game.player.stamina }));
check('SHIFT runs faster and drains stamina', b.p[2] - c.p[2] > 6.5 && c.st < 0.9 && c.anim === 'Running', `moved ${(b.p[2] - c.p[2]).toFixed(2)}m, stamina=${c.st.toFixed(2)}`);
await shot('05-running');
await page.keyboard.up('Shift'); await page.keyboard.up('w'); await step(30);
await page.keyboard.down('ArrowRight'); await step(40); await page.keyboard.up('ArrowRight');
let d = await get(() => window.__game.player.pos.toArray());
check('arrow keys strafe', d[0] - c.p[0] > 1.5, `dx=${(d[0] - c.p[0]).toFixed(2)}`);
await step(20);
check('idle animation when stopped', (await get(() => window.__game.player.current)) === 'Idle');

// ---------- jump / crouch ----------
await tp(4, 4);
await step(5);
const y0 = await get(() => window.__game.player.pos.y);
await page.keyboard.press('Space'); await step(12);
let j = await get(() => ({ y: window.__game.player.pos.y, g: window.__game.player.grounded, anim: window.__game.player.current }));
check('SPACE jumps', j.y - y0 > 1 && !j.g && j.anim === 'Jump', `height so far ${(j.y - y0).toFixed(2)}m`);
await shot('06-jump');
await step(60);
check('lands again', await get(() => window.__game.player.grounded));
await page.keyboard.down('c'); await step(20);
check('C crouches (lower hitbox)', await get(() => window.__game.player.crouching && window.__game.player.height === 1));
await page.keyboard.up('c'); await step(10);

// ---------- mouse camera ----------
const yaw0 = await get(() => window.__game.camYaw);
await page.waitForTimeout(250);
await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await page.mouse.move(740, 380, { steps: 5 }); await page.mouse.up({ button: 'right' });
await step(1);
const cam = await get(() => ({ yaw: window.__game.camYaw, pitch: window.__game.camPitch }));
check('mouse rotates the camera', Math.abs(cam.yaw - yaw0) > 0.05, `yaw ${yaw0.toFixed(2)} -> ${cam.yaw.toFixed(2)}`);

// ---------- collisions ----------
const tree = await get(() => window.__game.world.circles.find((c) => Math.hypot(c.x, c.z) < 60 && c.r < 0.6));
await tp(tree.x, tree.z + 3, 0);
await page.keyboard.down('w'); await step(120); await page.keyboard.up('w');
const pd = await get((t) => { const p = window.__game.player.pos; return Math.hypot(p.x - t.x, p.z - t.z); }, tree);
check('trees block the player', pd >= tree.r + 0.44, `distance ${pd.toFixed(2)} >= ${(tree.r + 0.45).toFixed(2)}`);

const isl = await get(() => window.__game.world.skySteps.map((v) => v.toArray()));
await tp(isl[0][0], isl[0][2], 0, isl[0][1] + 3);
await step(60);
const onIsl = await get(() => ({ y: window.__game.player.pos.y, g: window.__game.player.grounded }));
check('player lands on floating platforms', onIsl.g && Math.abs(onIsl.y - isl[0][1]) < 0.05, `y=${onIsl.y.toFixed(2)} top=${isl[0][1].toFixed(2)}`);
// hop from step 1 to step 2 with real inputs
const dirYaw = Math.atan2(-(isl[1][0] - isl[0][0]), -(isl[1][2] - isl[0][2]));
await get((yaw) => { window.__game.camYaw = yaw; }, dirYaw);
await page.keyboard.down('w'); await step(8); await page.keyboard.press('Space'); await step(45); await page.keyboard.up('w'); await step(20);
const hop = await get(() => ({ y: window.__game.player.pos.y, g: window.__game.player.grounded }));
check('can jump between platforms', hop.g && Math.abs(hop.y - isl[1][1]) < 0.05, `y=${hop.y.toFixed(2)} target=${isl[1][1].toFixed(2)}`);
await shot('07-sky-path');

// ---------- collectibles ----------
let s0 = await get(() => window.__game.score);
const coin = await get(() => { const c = window.__game.level.coins.find((c) => !c.taken); return [c.pos.x, c.pos.z]; });
await tp(coin[0] + 2, coin[1]); await step(40);
check('coins are collected (+10)', (await get(() => window.__game.score)) >= s0 + 10);

await get(() => { window.__game.player.health = 50; });
const heart = await get(() => { const h = window.__game.level.hearts[0]; return [h.pos.x, h.pos.z]; });
await tp(heart[0], heart[1]); await step(5);
check('hearts heal', (await get(() => window.__game.player.health)) === 80);

const chest = await get(() => { const c = window.__game.level.chests[0]; return [c.pos.x, c.pos.z]; });
await tp(chest[0] + 1.6, chest[1]); await step(3);
check('interact prompt appears at chest', await visible('prompt'));
s0 = await get(() => window.__game.score);
await page.keyboard.press('e'); await step(90);
check('E opens the chest (+50 and coins)', await get((s0) => window.__game.level.chests[0].open && window.__game.score >= s0 + 50, s0));
await shot('08-chest');

// ---------- laser vaults ----------
const vault = await get(() => { const g = window.__game; const c = g.level.crystals[2]; return [c.pos.x, c.pos.z]; });
await tp(vault[0], vault[1] + 7, 0); await step(3);
await shot('09-laser-vault');
let h0 = await get(() => window.__game.player.health);
await page.keyboard.down('w'); await step(80); await page.keyboard.up('w');
let lz = await get(() => ({ h: window.__game.player.health, z: window.__game.player.pos.z, n: window.__game.level.collected }));
check('lasers hurt and block a standing player', lz.h < h0 && lz.z > vault[1] + 4.2 && lz.n === 0, `health ${h0} -> ${lz.h}`);
await tp(vault[0], vault[1] + 7, 0); await step(70);
h0 = await get(() => window.__game.player.health);
await page.keyboard.down('c'); await page.keyboard.down('w'); await step(220); await page.keyboard.up('w'); await page.keyboard.up('c');
lz = await get(() => ({ h: window.__game.player.health, n: window.__game.level.collected }));
check('crouching slips under the lasers to the crystal', lz.h === h0 && lz.n === 1, `health ${lz.h}, crystals ${lz.n}`);

// ---------- enemies ----------
const placeEnemy = (i, x, z) => get(([i, x, z]) => { const e = window.__game.enemies.list[i]; e.home.set(x, z); e.pos.set(x, 0, z); e.way.set(x, z); e.state = 'patrol'; e.wait = 5; e.cooldown = 0; e.place(0); }, [i, x, z]);
await tp(10, 10, 0); await get(() => { window.__game.player.health = 100; });
await placeEnemy(0, 10, -2);
await step(2);
check('sentinel spots the player and chases', (await get(() => window.__game.enemies.list[0].state)) === 'chase');
await shot('10-sentinel');
await step(150);
const eh = await get(() => window.__game.player.health);
check('sentinel contact damages the player', eh < 100, `health ${eh}`);

await tp(-10, 10, 0); await placeEnemy(1, -10, -3);
await page.keyboard.down('c'); await step(60);
check('crouching avoids detection', (await get(() => window.__game.enemies.list[1].state)) === 'patrol');
await page.keyboard.up('c');
await placeEnemy(0, 500, 500);
await tp(-10, -1.2, 0); await get(() => { window.__game.enemies.list[1].wait = 9; });
s0 = await get(() => window.__game.score);
for (let n = 0; n < 6 && !(await get(() => window.__game.enemies.list[1].dead)); n++) {
  // wait until the sentinel is back in reach, then punch
  for (let i = 0; i < 40; i++) { if (await get(() => { const g = window.__game, e = g.enemies.list[1]; g.player.invuln = 1; return Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z) < 2.2; })) break; await step(3); }
  await get(() => { const g = window.__game, e = g.enemies.list[1]; g.player.heading = Math.atan2(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z); });
  await page.keyboard.press('f'); await step(30);
}
check('two punches destroy a sentinel (+50)', await get((s0) => window.__game.enemies.list[1].dead && window.__game.score >= s0 + 50, s0));

await placeEnemy(2, 20, 20);
const ey = await get(() => window.__game.enemies.list[2].pos.y);
await tp(20, 20, 0, ey + 3); await step(40);
check('stomping a sentinel destroys it', await get(() => window.__game.enemies.list[2].dead));
await clearEnemies();

// ---------- pause ----------
await page.keyboard.press('Escape'); await step(1);
check('ESC pauses', (await get(() => window.__game.state)) === 'paused' && (await visible('pause')));
const t0 = await get(() => window.__game.playTime); await step(30);
check('simulation is frozen while paused', (await get(() => window.__game.playTime)) === t0);
await page.screenshot({ path: `${SHOTS}11-pause.png` });
await page.click('#pause [data-action=resume]');
check('Resume continues', (await get(() => window.__game.state)) === 'playing' && !(await visible('pause')));

// ---------- win ----------
await tp(0, -18, 0); await step(3);
check('portal is locked until all crystals are found', await get(() => !window.__game.level.portal.active && !document.getElementById('hint').classList.contains('hidden')));
const crystals = await get(() => window.__game.level.crystals.filter((c) => !c.taken).map((c) => [c.pos.x, c.pos.z, c.baseY - 1.3]));
for (const [x, z, y] of crystals) { await tp(x, z, 0, y + 0.01); await step(3); }
check('all 7 crystals collected -> portal wakes', await get(() => window.__game.level.collected === 7 && window.__game.level.portal.active));
await tp(0, -18.5, 0); await step(120);
await shot('12-portal');
check('portal prompt shown', await visible('prompt'));
await page.keyboard.press('e'); await step(30);
check('E at the portal wins the game', (await get(() => window.__game.state)) === 'victory' && (await get(() => window.__game.player.current)) === 'Dance');
await shot('13-victory-dance');
await step(200);
check('victory screen with score', (await visible('victory')) && (await get(() => +document.getElementById('v-score').textContent > 700)));
await page.screenshot({ path: `${SHOTS}14-victory.png` });

// ---------- restart + lose ----------
await startGame('#victory [data-action=restart]');
const fresh = await get(() => { const g = window.__game; return g.score === 0 && g.level.collected === 0 && g.player.health === 100 && g.enemies.alive === g.enemies.list.length; });
check('Play Again fully resets the run', fresh);
await get(() => { window.__game.player.health = 10; });
await tp(30, 5, 0); await placeEnemy(0, 30, 3); await step(60);
check('health 0 -> death animation', await get(() => window.__game.player.dead && window.__game.player.current === 'Death'));
await step(170);
check('game over screen', await visible('gameover'));
await page.screenshot({ path: `${SHOTS}15-gameover.png` });
await startGame('#gameover [data-action=restart]');
check('Try Again restarts', await get(() => window.__game.player.health === 100 && !window.__game.player.dead));
await page.keyboard.press('Escape'); await step(1);
await page.click('#pause [data-action=quit]');
await page.waitForFunction(() => window.__game.state === 'menu');
check('Main Menu button returns to menu', await visible('menu'));

// ---------- responsive ----------
await page.setViewportSize({ width: 420, height: 800 });
await page.waitForTimeout(200);
const sz = await get(() => { const c = document.getElementById('game'); return [c.clientWidth, c.clientHeight, window.__game.camera.aspect]; });
check('canvas follows the window size', sz[0] === 420 && sz[1] === 800 && Math.abs(sz[2] - 420 / 800) < 0.01);
await page.screenshot({ path: `${SHOTS}16-mobile-menu.png` });

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
