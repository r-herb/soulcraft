// Hidden developer panel (?dev=1): god mode, kits, time, boss teleports.
import { t, onLangChange } from '../i18n/index.js';
import { BOSS_ORDER } from '../bosses/bosses.js';
import { ARENAS } from '../world/structures.js';
import { Boss } from '../bosses/base.js';

export function initDevPanel(app, ui) {
  const panel = document.createElement('div');
  panel.className = 'dev-panel hidden';
  panel.dataset.dev = '1';
  const toggle = document.createElement('button');
  toggle.className = 'btn small violet dev-toggle';
  toggle.textContent = 'DEV';
  toggle.dataset.dev = 'toggle';
  document.getElementById('app').append(panel, toggle);
  toggle.addEventListener('click', () => panel.classList.toggle('hidden'));
  const G = () => app.game;
  const btn = (label, fn, key) => {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = label;
    if (key) b.dataset.dev = key;
    b.addEventListener('click', (e) => { e.stopPropagation(); const g = G(); if (!g || !g.running) return; fn(g); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.appendChild(b);
  };
  const render = () => {
    panel.innerHTML = `<b style="font-size:11px">${t('dev.title')}</b>`;
    btn(t('dev.god'), (g) => { g.player.god = !g.player.god; ui.toast(t('toast.devGod', { state: t(g.player.god ? 'common.on' : 'common.off') })); }, 'god');
    btn(t('dev.give'), (g) => {
      for (const [k, n] of [['emberite_sword', 1], ['gold_sword', 1], ['iron_pickaxe', 1], ['bow', 1], ['arrow', 64], ['spear', 1], ['wind_charge', 16], ['roast', 16], ['soul_heart', 4], ['void_lantern', 1], ['torch', 32], ['planks', 64]]) g.giveItem(k, n);
      g.meta.hasLantern = true;
    }, 'give');
    btn(t('dev.crystals'), (g) => g.addCrystals(100), 'crystals');
    btn(t('dev.day'), (g) => { g.meta.time = 0.1; }, 'day');
    btn(t('dev.night'), (g) => { g.meta.time = 0.6; }, 'night');
    btn(t('dev.unlock'), (g) => { g.meta.hasLantern = true; for (const id of BOSS_ORDER.slice(0, -1)) g.meta.bosses[id] = g.meta.bosses[id] || false; g.meta.devUnlock = true; }, 'unlock');
    for (const id of BOSS_ORDER) {
      btn(t('dev.tp') + ': ' + t('boss.' + id), (g) => { g.meta.devUnlock = true; g.travel(ARENAS[id].dim, id === 'whirlwindKing' ? 'chamber' : id); }, 'tp-' + id);
    }
    btn(t('dev.kill'), (g) => { const b = g.bosses.active; if (b) Boss.prototype.hurt.call(b, Math.ceil(b.maxHp * 0.25), 'dev'); }, 'kill');
  };
  render();
  onLangChange(render);
}
