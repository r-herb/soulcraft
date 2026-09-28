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

## Performance

Weak phones are limited by pixels (the GPU), not by JavaScript, so the
game adapts its resolution:

- **Settings > Quality > Auto** (the default) starts a little under the
  screen's density, lowers the resolution when frames run slow and raises
  it again when there is headroom. At the lowest resolution it also trims
  the view distance until frames recover. **Fast** fixes a low resolution
  and a short view distance; **Sharp** always renders at full density.
- Player physics runs in fixed steps of at most 1/60 s, so jumps carry the
  same distance at 20 fps as at 60 fps, and a jump pressed a moment after
  running off an edge still counts ("coyote time", 0.12 s), which keeps
  parkour fair when frames are slow.
- Chunks are generated and meshed in a Web Worker (greedy meshing), with a
  per-frame budget for new meshes.
- The FPS counter (Settings) also shows the current resolution scale.

`scripts/perf-probe.mjs` measures a simulated weak phone: a landscape phone
at DPR 3 with software WebGL and the CPU slowed down 4x. With the adaptive
resolution it went from 20.6 fps (p95 frame 83 ms) to 34.1 fps (p95 50 ms).

```bash
npm run build && npm run preview &
node scripts/perf-probe.mjs 4 30   # CPU slowdown, seconds
```

## Testing the bosses with ?dev=1

Open https://soulcraft.8nomads.com/?dev=1 and start or continue a world. A
**DEV** button on the left opens the developer panel:

- **God mode**: no damage.
- **Give kit**: the best swords, a bow with arrows, a spear, wind charges,
  food, soul hearts, the Void Lantern, torches and planks.
- **+100 crystals**, **Set day**, **Set night**.
- **Unlock all realms**: opens every realm on the Soul Map.
- **Teleport: <boss>**: travels straight to that guardian's arena (Void
  Dragon, Shell King, Whirlwind King, Ember Warden, Soul Storm).
- **Damage boss**: takes 25% of the current boss's health, to check phase
  changes and the defeat and reward flow quickly.
- **Quest: skip level**: inside the Treasure Quest, jumps ahead one level.

A quick check of one boss: God mode, Give kit, Teleport to the boss, then
press Damage boss four times. The CI job `bosses` plays all five fights
for real, in order, through the Soul Map.

## Known limitations

- Single player only; there is no multiplayer or shared world.
- Worlds are procedurally generated per seed, but only edits are saved, so
  a changed generator would reshape unedited terrain in old worlds.
- Cloud saves keep one world, one quest run and the profile per account;
  the newest copy wins if two devices play offline at the same time.
- There is no self-service sign-up or "forgot password": the admin creates
  accounts and resets passwords in /admin.
- Portrait orientation is not supported on phones (the game asks to rotate).
- Sound effects and music are synthesised in code, so they are simple.
- On very weak devices the Auto quality mode trades sharpness for frame
  rate, so the picture can look soft.

## Ideas for next steps

- Co-op multiplayer through Cloudflare Durable Objects (one room per world).
- More biomes and blocks (desert, snow, caves with ores and lava lakes).
- Pets or tamed creatures that follow the player and help in fights.
- Daily quests and seasonal events that reward soul crystals.
- A creative mode with flying and unlimited blocks.
- Several world slots per account, and sharing a world with a friend.
- A second Treasure Quest chapter with new mechanics (moving platforms,
  switches that change gravity).
- Admin panel extras: activity charts, bulk user import, password reset
  links by email.

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

## Worlds and creative mode

Title screen > **Worlds** lists up to six worlds (newest first) with Play and
Delete; **Continue** opens the most recent one. Signed-in players get every
world in the cloud. **New World** asks for a mode:

- **Survival**: gather, craft, survive the nights, earn soul crystals.
- **Creative**: no damage or hunger, instant mining, endless blocks, and a
  **Blocks** catalog in the inventory. Double-tap jump (or the wing button
  on touch) to fly; jump rises, Shift/C (or the down button) descends.
  Creative worlds give no soul crystals, so the shop stays fair.

## Accounts and the admin panel

Playing needs no account: guests keep their worlds in the browser. Players
the admin has added can sign in on the title screen with their **email or
phone number** and password. Signed-in players get:

- cloud saves (the world, the Treasure Quest and the profile), so progress
  follows them to any device; the newest copy wins,
- "Keep me signed in" (a 90-day HttpOnly session cookie),
- a profile with a photo, name, email and phone, and a password change form.

The admin panel is at **https://soulcraft.8nomads.com/admin** (English only).
The superadmin signs in with the `SUPERADMIN_LOGIN` / `SUPERADMIN_PASSWORD`
GitHub secrets and can add, edit, disable and delete users, set their
passwords, upload a photo, and see each user's saves.

The API is a Cloudflare Pages Function (`functions/api/[[path]].js`, helpers
in `server/lib.js`) backed by a D1 database (`migrations/`). Passwords are
stored as PBKDF2-SHA256 hashes, sessions as SHA-256 token hashes, and
repeated failed sign-ins are throttled.

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
npm test                          # smoke tests: mobile landscape (844x390, touch) + desktop, and accounts
```

The accounts tests start `wrangler pages dev` with a throwaway local D1
database (superadmin `admin` / `admin-pass-123`, local only).

What the tests cover:

- `tests/smoke.spec.js` (mobile 844x390 with touch, and desktop): the page
  loads with no console errors, the title screen appears, EN/RU switching
  changes the text, a new world starts and renders, the joystick and keyboard
  move the player, a block can be broken and placed, the inventory and recipe
  book work, pause and settings work, and a saved world reloads with its progress.
- `tests/survival.spec.js`: a night enemy chases and hurts the player and
  dies to the sword; eating works; death leads to respawn; villagers trade
  and friendship grows; the shop sells and equips a skin; the Russian UI fits.
- `tests/accounts.spec.js`: the superadmin adds, edits, searches, disables
  and deletes users; a player signs in with a phone number, edits the
  profile, uploads a photo and changes the password; saves move to a second
  device; "keep me signed in" survives a reload; the admin resets a password.
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

1. Runs `npm ci`, a production build, then the Playwright tests (smoke,
   survival and accounts; the boss progression and the Treasure Quest run
   as parallel jobs).
2. Makes sure the D1 database **soulcraft** exists (`scripts/cloudflare-d1.mjs`
   writes its id into `wrangler.toml`), applies `migrations/`, and copies the
   superadmin login into the Pages project secrets.
3. If the tests pass, deploys that exact `dist/` plus `functions/` to the Cloudflare Pages
   project **soulcraft** with `cloudflare/wrangler-action` (the project is
   created with `wrangler pages project create soulcraft --production-branch main`
   if it does not exist yet).
4. Runs `scripts/cloudflare-domain.mjs`, which attaches **soulcraft.8nomads.com**
   to the project and creates a proxied CNAME in the `8nomads.com` zone. It
   waits until the domain is active with HTTPS.
5. Waits until the live site serves the new build, prints the cache and
   security headers, and runs a Playwright check against the live URL.

Pull requests run the tests but do not deploy.

### Repository secrets

Set these under Settings > Secrets and variables > Actions:

| Secret | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account that holds the `8nomads.com` zone |
| `CLOUDFLARE_API_TOKEN` | A custom API token with **Account > Cloudflare Pages > Edit**, **Account > D1 > Edit**, **Zone > DNS > Edit** and **Zone > Zone > Read** (zone: 8nomads.com) |
| `SUPERADMIN_LOGIN` | The admin panel username |
| `SUPERADMIN_PASSWORD` | The admin panel password |

If a permission is missing, the deploy scripts name it in the job log.

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
src/save/            IndexedDB saves, settings, account + cloud sync
src/admin/           the /admin panel (admin.html)
functions/api/       accounts API (Cloudflare Pages Function)
server/              API helpers: hashing, sessions, validation
migrations/          D1 schema
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
**Панель разработчика:** добавь `?dev=1` к адресу. Там есть режим бога,
набор предметов, телепорт к каждому стражу и кнопка, отнимающая 25%
здоровья босса.

**Производительность:** настройка «Качество» (Авто / Быстро / Чётко). В
режиме «Авто» игра сама снижает разрешение на слабых телефонах и
повышает его, когда есть запас.

**Аккаунты:** играть можно и без входа. Игроки, которых добавил администратор,
входят по email или телефону и паролю: сохранения хранятся в облаке и
переходят на другие устройства, есть профиль с фото и смена пароля. Панель
администратора: https://soulcraft.8nomads.com/admin (на английском).
