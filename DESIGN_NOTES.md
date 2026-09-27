# Soulcraft design notes

## Status of the design reference

The brief points to a Claude Design template (`Soulcraft Design.dc.html` and
`support.js`) on the author's Mac. Those files were **not available** to the
build environment: they are not in this repository, and nothing matching them
turned up in the connected Google Drive or the published artifacts. The
`./design` folder is therefore empty for now.

Until the template arrives, the game uses the original design system below.
Every visual value lives in `src/ui/tokens.css`, so matching the template
later is mostly a matter of changing token values. Markup is also easy to
replace, because each screen is one function in `src/ui/ui.js` or
`src/ui/panels.js`.

**To do when the files arrive:** copy them into `soulcraft/design/`, extract
their palette, fonts and spacing into `tokens.css`, reuse their markup for the
menus and HUD, and compare screenshots at 844x390.

## Palette

| Token | Value | Use |
|---|---|---|
| `--c-night-900` ... `--c-night-500` | `#07061a` ... `#332d75` | Backgrounds, panels, buttons |
| `--c-soul-300/400/500/600` | `#b6fbff` `#7ff3ff` `#44d6e8` `#1f9fb8` | Primary accent: soul glow, primary buttons, focus, selection |
| `--c-violet-400/500/600` | `#b98bff` `#9a6bff` `#6d45d6` | Secondary accent: New World button, section labels, logo shadow |
| `--c-ember-400/500/600` | `#ffb14a` `#ff7a2e` `#d24a24` | Danger and fire: quit button, attack ring, Emberdeep |
| `--c-gold-400/500` | `#ffe08a` `#f6c667` | Rewards: boss names, result slot, friendship |
| `--c-heart` / `--c-food` | `#ff4d6d` / `#e0a24a` | Health and hunger |
| `--c-text` / `-dim` / `-faint` | `#eef4ff` `#a9b3d6` `#6f78a3` | Text levels |

The page background is a radial night-sky gradient (`--bg-page`).

## Type

- **Press Start 2P** (display): logo, panel titles, boss title cards, section labels.
- **Pixelify Sans** (body, 400/700): everything else.

Both fonts are self-hosted from `public/fonts`, with Latin and Cyrillic subsets
(OFL licensed, from @fontsource). Sizes are the `--fs-*` tokens. The logo
scales with the viewport (`--fs-logo: clamp(26px, 6.4vw, 54px)`).

## Shape and depth

- 3px "pixel" borders (`--px`) in near-black ink (`--c-ink`), small radii (4/8/12px).
- Buttons have a light inner top edge, a dark inner bottom edge and a 3px drop.
  Pressing one moves it down 2px.
- Glows: `--glow-soul`, `--glow-violet`, `--glow-ember`, `--glow-gold`.
- Panels are dark translucent (`--surface-panel`) with a violet border and a
  large soft shadow. In-game overlays sit on a blurred scrim.

## Components

Buttons (`.btn`, plus the `primary`, `violet`, `ember`, `gold`, `ghost` and
`small` variants), panels, segmented toggles (`.seg`), pixel sliders
(`.range`), inventory slots (`.slot`, `.selected`, `.picked`, `.result`), the
hotbar, heart and hunger sprites, the crystal chip, toasts, the tutorial
bubble, the boss bar, the boss title card, map nodes, skin cards and the stats
grid.

## Screens

1. Rotate your phone (portrait on touch devices)
2. WebGL unavailable (translated error)
3. Loading, with progress bar and tips
4. Title: floating souls, logo mark, Continue, New World, Skins, Settings, EN/RU switch
5. New world: name, seed, difficulty
6. Settings (sections: General, Graphics, Audio, Controls)
7. Gameplay HUD: hearts, hunger, crystals, day, map/fullscreen/pause, crosshair, hotbar, joystick, action buttons
8. Inventory and crafting, with the recipe book
9. Villager trading, with the friendship bar
10. Soul Shop and skin selector
11. Pause
12. Death, with respawn
13. Tutorial hints, save toasts
14. Boss title card and boss HUD
15. Soul Map (boss progression)
16. Victory, with stats

## Art direction (in code)

- Block textures: 16x16 procedural pixel art in `src/engine/atlas.js`. There are
  two styles, Classic and Soul Glow (cooler, higher contrast, glowing ore specks).
- Item icons: 16x16 procedural sprites in `src/ui/icons.js`, with a 1px ink
  outline. Blocks are drawn as small isometric cubes.
- Mobs, villagers, skins and bosses: box-built voxel models in
  `src/entities/models.js` and `src/bosses/`, with tiny canvas face textures.
- Logo mark and app icons: a pixel soul flame (`scripts/make-icons.mjs`
  generates the PNG icons).

All names, textures and characters are original.

## Open questions

- Waiting on the Claude Design template (see above).
- Does the template use the same pixel-font pairing? If it uses others,
  they need Cyrillic coverage too.
