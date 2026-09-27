# Soulcraft

A mobile-first 3D voxel sandbox game (first-person building and survival)
that runs in the browser. Mine and build, survive the nights, trade with
villagers, unlock skins, and defeat five guardians to free the souls.

**Play:** https://soulcraft.8nomads.com (phone in landscape, or desktop)

All art, names, characters and sounds are original and generated in code.

## Treasure Quest

A separate adventure mode (title screen → **Treasure Quest**) with its own
save slot. Find the treasure map in the ruins, then clear 12 levels:

1. Map Ruins: a maze hiding the map
2. Sky Steps: parkour over the void
3. Arrow Hall: dodge wall traps that glow before they fire
4. Monster Den: the gate locks behind you until every monster is down
5. Lever Riddle: each lever flips its lamp and its neighbours
6. Crumbling Bridge: blocks fall away over magma
7. Key Grove: three hidden golden keys (a hedge maze, a pond, a tower)
8. Memory Tiles: repeat the light sequence
9. Shadow Maze: a dark maze with monsters
10. Jump Pads: fly across the gaps
11. Builder's Gap: build your own plank bridge (look down past the edge
    and tap to place)
12. Hoard Golem: the final boss (dodge the charge, then hit the exposed core)

The vault's chest gives the Treasure Hunter skin, the Starfall Blade and
250 soul crystals. The skin and the blade also show up in every normal world.
Levels have checkpoints, and falling just sends you back to the last one.
With `?dev=1`, **Quest: skip level** jumps ahead one level.

## Controls

| | Touch (landscape) | Desktop |
|---|---|---|
| Move | Drag the left side (virtual joystick) | W A S D |
| Look | Drag the right side | Mouse (click the game to capture it) |
| Jump / swim up | Arrow button | Space |
| Break / attack | Hold the hammer button | Left mouse button |
| Place / use / eat / trade | Cube button | Right mouse button (or F) |
| Hotbar | Tap a slot or swipe the hotbar | 1-9, mouse wheel |
| Inventory and crafting | Grid button | E |
| Soul Map | Map button | M |
| Pause | Pause button | Esc |
| Drop the held item | - | Q |
| FPS counter | Settings | F3 |

Control size, opacity, look sensitivity, auto-jump and vibration are all in
Settings.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build at http://localhost:4173
```

## Tests

```bash
npm run build
npx playwright install chromium   # first time only
npm test                          # smoke tests: mobile landscape (844x390, touch) + desktop
```

What the tests cover:

- `tests/smoke.spec.js` (mobile 844x390 with touch, and desktop): the page
  loads with no console errors, the title screen appears, EN/RU switching
  changes the text, a new world starts and renders, the joystick and keyboard
  move the player, a block can be broken and placed, the inventory and recipe
  book work, pause and settings work, and a saved world reloads with its progress.
- `tests/survival.spec.js`: a night enemy chases and hurts the player and
  dies to the sword; eating works; death leads to respawn; villagers trade
  and friendship grows; the shop sells and equips a skin; the Russian UI fits.
- `tests/quest.spec.js` (desktop): plays the Treasure Quest from the camp
  to the chest with an autopilot (`tests/questpilot.js`) that uses the normal
  controls, then checks that the rewards carry over into a normal world.
- `tests/bosses.spec.js` (desktop): plays the whole guardian progression
  through the real Soul Map, from the Void Dragon to the Soul Storm and the
  victory screen. A bot (`tests/bot.js`) aims, leads its shots, parries
  glowing shells and throws wind charges, with god mode on.

`npm run test:live` runs a check against the live site.

The developer panel opens with `?dev=1` (for example
`https://soulcraft.8nomads.com/?dev=1`). It has god mode, an item kit,
+100 crystals, day/night, unlock-all, a teleport to each boss, and a
button that takes 25% of the current boss's health.

## Deployment

This repository deploys itself with GitHub Actions and Cloudflare Pages
(`.github/workflows/deploy.yml`). Every push to `main`:

1. Runs `npm ci`, a production build, then the Playwright smoke tests.
2. If the tests pass, deploys that exact `dist/` to the Cloudflare Pages
   project **soulcraft** with `cloudflare/wrangler-action` (the project is
   created with `wrangler pages project create soulcraft --production-branch main`
   if it does not exist yet).
3. Runs `scripts/cloudflare-domain.mjs`, which attaches **soulcraft.8nomads.com**
   to the project and creates a proxied CNAME in the `8nomads.com` zone. It
   waits until the domain is active with HTTPS.
4. Waits until the live site serves the new build, prints the cache and
   security headers, and runs a Playwright check against the live URL.

Pull requests run the tests but do not deploy.

### Repository secrets

Set these under Settings > Secrets and variables > Actions:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account that holds the `8nomads.com` zone |
| `CLOUDFLARE_API_TOKEN` | A custom API token with **Account > Cloudflare Pages > Edit**, **Zone > DNS > Edit** and **Zone > Zone > Read** (zone: 8nomads.com) |

If a permission is missing, the domain script names it in the job log.

### Caching

`public/_headers` sets long-lived caching for hashed assets, `no-cache` for
the HTML and the service worker, and basic security headers. The service
worker (generated at build time from `src/sw-template.js`) uses a versioned
cache per deploy and fetches HTML network-first, so a new deploy is never
hidden behind a stale copy. The game still works offline once it has been
loaded.

## Project layout

```
src/main.js          boot, settings, service worker
src/game.js          game loop, interaction, health, travel, saving
src/engine/          renderer pieces: atlas, chunk shader, sky, world/chunks, mesher (worker)
src/world/           blocks, noise, terrain + structures, generator
src/player/          input, physics, inventory, items, crafting, held item
src/entities/        mobs, villagers, projectiles, drops, models
src/bosses/          the five guardian fights
src/ui/              tokens.css, styles.css, screens, HUD, panels, icons, dev panel
src/i18n/            en.json, ru.json, t() helper
src/audio/           Web Audio sound effects and generative music
src/save/            IndexedDB saves, settings
public/              manifest, icons, fonts, _headers
tests/               Playwright tests
```

---

## Коротко по-русски

**Soulcraft** - воксельная песочница для телефона и компьютера прямо в
браузере. Добывай ресурсы, строй, переживи ночь, торгуй с жителями, открывай
скины и победи пятерых стражей: Дракона Бездны, Короля Раковин, Короля
Вихрей, Стража Углей и Шторм Душ.

**Играть:** https://soulcraft.8nomads.com. На телефоне держи его
горизонтально.

**Управление на телефоне:** левая часть экрана - движение, правая - обзор.
Кнопки: прыжок, ломать/бить (удерживать), ставить/использовать, инвентарь.
Хотбар можно листать свайпом. **На компьютере:** WASD, мышь, ЛКМ - ломать,
ПКМ - ставить, E - инвентарь, Esc - пауза.

**Запуск:** `npm install && npm run dev`.
**Тесты:** `npm run build && npm test`.
**Панель разработчика:** добавь `?dev=1` к адресу.
