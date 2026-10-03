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

### Chapter 2: the Frozen Spire

Once the first vault is open, a back door in it leads to eight more levels:

1. Ice Slide: build up speed on the ice and jump the gaps
2. Blink Bridge: pads that shine and fade in turn
3. Updraft Tower: ride the frost vents up and step onto the walls
4. Frost Plates: light all four plates before the first ones fade
5. Frost Jets: pass each row of jets right after it fires
6. Orb Race: collect six frost orbs against the clock
7. Frost Den: frost spirits and monsters between ice pillars
8. Frost Warden: the chapter boss (step out of the leap ring; while its
   feet are frozen your hits count double)

The crystal vault gives the Frost Monarch skin, the Frostbrand sword and
300 soul crystals.

## Play with friends

Signed-in players can share a world with up to 3 friends. **Play with
friends** on the title screen lists the friends whose worlds are open (Join)
and starts a world of one's own together: a new Malaga, a new world or the
last one. That world opens to friends at once and the friends list comes up
with **Invite** next to each friend; an invited friend gets a card with
**Join** in their game (with a sound), and a notification if their game is
closed. A world can also be opened from the pause menu (**Play with friends
> Open to friends**) and joined with its 6-character room code.

- **Malaga together**: the missions and the big mission (El Gran Golpe) are
  the team's. The host's game keeps the shared progress; what a guest does
  (eating out, a bus ride, meeting an informant, a piece of the plan put
  in, the diamond taken) is sent to the host and counts for all, and every
  player gets the crystals and coins of each mission the team finishes. A
  meeting counts for whoever of the team gets there; an informant who asks
  for something takes it from the player who brings it. When the diamond is
  traded, the whole team becomes Malaga's mayors (each paid on their own
  account once their twelve tasks are recorded).

- The host's game is the authority: it saves the world (everyone's block
  edits), runs the monsters and the time of day, and keeps each guest's
  inventory and position in its save, so guests find their things again.
- Guests build the same world from the seed plus the host's edits, see the
  host's monsters, and send their hits to the host (a guest's kill drops
  its loot for that guest). Daily tasks and soul crystals count for
  everyone.
- The world keeps going while a player is in a menu. Guardians and the
  other realms stay closed while a room is open.
- Rooms run in a small Worker (`mp/room.js`, one Durable Object per room)
  that the Pages API reaches through the `ROOMS` binding after checking
  the player's session, so only signed-in players get in.

## Languages

The game speaks English, Russian, Spanish and Latvian (`src/i18n/*.json`,
one flat file per language with the same keys). It starts in the browser's
language when it has it, and the language can be changed on the title
screen or in Settings. The admin panel is in English.

## World map and lives

**M**, the map button or the minimap in the corner opens the world map in the
overworld and in cities: the terrain (or the city, with its landmarks), the
player, villages, friends and the respawn point. Tap a place and confirm to
travel there; it becomes the respawn point. In survival a trip costs one of
3 lives, and a life comes back each new day; in creative mode trips are free.
The Soul Map is one button away (and the Void Lantern still opens it).

## Malaga: a real city

**Malaga** on the title screen opens a world built from the real centre of
Malaga: the whole city inside the ring road, from the airport and the
Guadalhorce to El Palo (about 15.6 x 10.9 km, 135,000 buildings, 860 bus
stops), at 1 block = 1 metre:
the hills (the Alcazaba and Gibralfaro), the streets, squares, parks and
beach, and every building with its footprint and height. It can be played
in creative mode (flying, all blocks) or in survival, and shared with
friends like any other world.

- Map data from [OpenStreetMap](https://www.openstreetmap.org/copyright)
  (c) OpenStreetMap contributors, under the Open Database License (ODbL
  1.0). Elevation from the Mapzen/AWS Terrain Tiles (open data). The city
  file `public/city/malaga.bin.gz` is a derived database under the ODbL.
- The **City data** workflow (Actions) downloads the OpenStreetMap extract
  with the Overpass API in parts (`data/city/<city>-osm/`) and commits it
  to the `city-data` branch. `node --max-old-space-size=12000
  scripts/city/build-city.mjs malaga` turns it into the city: an index,
  tiles of 512 x 512 blocks and an overview image for the maps
  (`public/city/malaga/`). `scripts/city/proj.mjs` holds the projection: a
  city keeps its first area's origin, so a bigger area never moves the
  places of older worlds. `CITY_BBOX='[s,w,n,e]'` builds a smaller area.
- The game loads the index, then the tiles around the player (a chunk is
  generated once its tiles are here); the worker builds each chunk from
  its slice (`src/world/city.js`). Heights are scaled by 0.82, and above
  84 blocks pressed further, so the hills fit under the build limit.
- Street names (from OpenStreetMap, with the Spanish abbreviations C/,
  AV., PZA.) are painted on the roads in big block letters that read from
  above, and houses with an address carry blue number plaques over a door.
- The city lives: fish in the sea, the port and ponds, swimmers in the
  pools, sunbathers with parasols on the beach and people walking in the
  pedestrian streets (by day). They are scenery only.
- City buses: the EMT lines that run through the area (from OpenStreetMap
  route relations, `scripts/city/build-bus.mjs` -> `public/city/malaga-bus.json`)
  drive their real routes on Malaga's clock (Europe/Madrid), with the real
  timetable when the city data has the EMT GTFS feed and every 15 minutes
  otherwise. Blue stop signs stand at the stops; using one shows the next
  buses of each line and the lines on the map, and sells tickets (a single
  ride for 2 coins, a bonobús of 10 rides for 13). The buses are open-top
  double-deckers: at a stop the doors open and a player can step in; inside,
  the driver and an inspector wait by the yellow validator, where the ticket
  is validated with a beep (or bought from the driver). Validated, the rider
  may go up to the open top deck and ride with the view over the city;
  without a ticket the inspector puts the rider out when the doors close.
  STOP (X) gets off at the next stop, and from the top deck one can jump off.
  Guests and creative players ride free.
- Creative flight has four speeds (V or the gear button): 1x, 2.5x, 5x, 10x.
- **Missions** (pause menu > Malaga missions; the HUD follows one, with an
  arrow and the distance to its next place, and the minimap shows a star):
  the tourist route (Plaza de la Constitucion, the Cathedral, the Alcazaba,
  Gibralfaro, La Malagueta), a bus ride of two stops or more to the beach,
  the paella master (buy rice, cook a paella, eat it on the beach), the
  restaurant critic (three different restaurants) and a first bank deposit.
  Progress is kept in the player's profile; each pays soul crystals in
  survival, and the city pays coins once per mission to signed-in players
  (`missions_done`, migration 0012).
- Other cities can be added in `scripts/city/cities.mjs`.

## Friends

Signed-in players add friends by username (**Friends** on the title screen
or in the pause menu). The other player accepts or declines the request.
The friends list shows who is online and in which world, and when a
friend's world is open to friends a **Join** button takes you straight in,
without typing the room code. Only friends see where a player is.

## Chat

**Chat** (title screen, pause menu and the chat button in the corner) has
private conversations with friends and public channels: the **Lobby** and
any channel an admin creates. A player sees a channel only after an admin
lets them in (admin panel > Chats). Messages arrive live through a chat hub
(the rooms Worker's Durable Object `~hub`), unread counts show on the
buttons, and a friend's message pops up while playing.

Players report a message with "!". Admins see every channel and, in the
game or in the admin panel (Reports), delete messages and mute players
for a while; everything goes to the Log. Messages are at most 300
characters, and a player can send at most five in ten seconds.

## Calls

Friends can call each other: **Call** in the friends list or at the top of
a private chat. On a computer a call has video and sound, on a phone or
tablet sound only. **+ Friend** invites more online friends into the same
call (everyone connects to everyone, so it suits a few friends). The call
window floats in the corner above the game, with mute, camera and hang up.

A ringing call rings (and buzzes a phone) until answered. If the friend's
game is hidden it shows a system notification; if it is closed, **Web
Push** wakes the phone or computer: "Turn on" in the friends list asks the
browser once (on an iPhone the game has to be added to the home screen).
The server makes its own push key on first use (kept in D1, nothing to set
up), sends an empty push to the friend's push service, and the service
worker fetches what is waiting (`/api/push/pending`: the call for a minute,
an invite to play for ten) and shows it; opening the game then rings or
offers Join.

Calls go straight between the players' browsers (WebRTC, with public STUN
servers); only the set-up messages pass through the chat hub, and only
between accepted friends. On some strict networks (some mobile operators
or school networks) a direct connection is not possible and the call does
not connect; a TURN relay (for example Cloudflare's) would fix that.

## Armor and shields

As in the classic game: a **helmet, chestplate, leggings and boots** of
leather (cows drop it), gold, iron, diamond or emberite, crafted in the
usual shapes, worn in the four armor slots of the inventory screen (or put
on with "use" while held). Each piece gives armor points (iron: 2, 6, 5, 2;
diamond and emberite: 3, 8, 6, 3; 20 at most), shown as a row of chestplates
over the hearts. Every point takes 4% off a blow from a monster, a guard or
a cactus (less against very big hits, up to 80%); falls, lava and hunger go
through. Each blow wears every piece a little and a worn-out piece breaks
(leather lasts 55 to 80 hits, diamond 363 to 528; emberite a little longer
and tougher against big hits). A **shield** (planks and an iron ingot) held
and raised (hold use) stops a blow from the front completely, not from the
side or behind, slows the player while raised, and wears out after 336
blocks.

## Roblox-style avatars

The world stays voxel, but players can swap the classic pixel figure for a
**3D avatar** in the style of Roblox: a big round head with a smooth face,
a two-part torso, and arms and legs that bend at the elbows and knees. It
walks with bent knees and swinging forearms, breathes when idle, throws its
arms up when it jumps, and can **wave, dance and cheer** (emotes, G or the
smiley button; moving ends them). Other players see the avatar and its
emotes; the look travels as one short string ('av:' and a character per
slot) in the player's state message.

The avatar is unlocked with **150 soul crystals**, or for free with any
achievement. The **wardrobe** (Shop > Avatar) shows the figure turning in
3D (drag to turn it, try the emotes) beside a catalog in tabs: skin tone,
face, hair (and its color), hats, tops (and their color), pants, glasses
and things worn on the back. Tapping an item tries it on; free and owned
items are worn at once, the others are bought with soul crystals (20 to 300)
or come only from an **achievement**, never for real money:

| Achievement | How | Unlocks |
|---|---|---|
| Malaga guide | 5 Malaga missions | straw hat |
| Treasure hunter | the Treasure Quest's chest | explorer hat and shirt |
| Frost monarch | Treasure Quest chapter 2 | frost crown, ice wings |
| Survivor | day 30 in a survival world | angel wings |
| Realm knight | all 5 bosses (any survival worlds) | knight's helmet and armor |
| El Gran Golpe | robbing the bank's vault | robber's mask and shirt |
| Mayor of Malaga | trading the Gran Diamante | mayor's crown and suit |

The bosses beaten and the best day follow the player between worlds (in the
profile); a new achievement is announced once. "Play as my avatar" switches
between the avatar and the classic skin; equipping a classic skin in the
shop switches the avatar off.

**F5** (or the figure button) switches the camera: first person, behind the
player, and in front looking back at them; the camera stops short of walls.

## Shaders and animations

With **Settings > Shaders** on (the default): leaves, grass and crops sway
in the wind, water ripples and glints in the sun, and the light turns golden
at sunrise and sunset and cool blue at night. Monsters breathe, turn their
heads to a player nearby, swing their arms down when they strike, flinch
back when hit, and fall over and sink away when they die.

## Farm: crops and livestock

- **Crops**: wheat and tomato seeds (and carrots) from a market stall. Use
  them on the top of grass, dirt or farmland: the soil turns into farmland
  and the crop grows through four stages while the world is played (about
  7.5 minutes to ripe). Breaking a ripe crop gives the harvest (wheat,
  tomatoes, carrots) and seeds back; an unripe one gives its seed back.
  Three wheat make bread, two make flour.
- **Livestock**: chickens, sheep and cows wander the overworld's grass in
  small groups by day, and a market stall sells them in crates (use the
  crate on the ground; the only way to get animals in a city). Hold their
  food (seeds for chickens, wheat for sheep and cows) and they follow you;
  feed two adults of a kind and a young one is born (it grows up in five
  minutes; a pair can breed again after five). Hens lay eggs. Sheep give
  wool, all of them meat, which roasts over charcoal at the workbench.
  Animals flee when hit and are never attacked by pets. Animals you walk
  away from (over 64 blocks) are kept in the save and come back when you
  return.
- **Oranges**: breaking the leaves of a tree drops an orange pip now and
  then. Planted, it grows into an orange bush (four stages); "use" on a ripe
  bush picks two to four oranges and it fruits again a stage later, so a
  grove keeps giving. Breaking a ripe bush gives oranges and the pip back.
- **Chicken coop**: a nest box (five planks and a wheat) gathers the eggs of
  the hens within six blocks; "use" on it collects them. Chickens also peck
  about the parks of Malaga by day.
- **Incubator** (glass, charcoal and planks): "use" with an egg in hand puts
  it in (up to four); after three minutes of play each egg hatches into a
  chick beside it, so a flock grows without buying crates.
- Wheat, tomatoes, carrots, oranges, eggs, wool and raw meat sell on the
  exchange; keeping the seeds, pips and eggs grows the next harvest instead.
- The world owner's game grows the crops and runs the animals; in a shared
  world guests see them through the room like the monsters.

## El Gran Golpe: Malaga's big mission

Twelve tasks, picked at random for each player from eighteen, send the
player all over Malaga to meet informants (a figure in a dark coat and hat
with a gold "!" over the head): the airport, La Rosaleda, the university,
the station (by bus), the Atarazanas market (buy sardines), El Palo (eat at
a restaurant), Pedregalejo (pan for gold), Huelin (open a gem cache), the
beaches, the castles, the cathedral, Muelle Uno, El Limonar, Ciudad Jardín,
the Plaza de la Merced, Calle Larios and the Paseo del Parque; some ask for
a gem or an egg first. Each task pays 25 coins and gives a **piece of the
bank's plan**. The pieces make a **puzzle** (pause menu > missions > the
bank plan): tap a piece, then its square; a wrong square shakes. The whole
plan (also an item) shows the **weak spot** in the vault's back wall and the
**guards' rounds**.

The final mission: round the back of the Banco de España, break the weak
wall (an iron pickaxe, the rest of the bank cannot be broken), get into the
vault past the three guards (one behind the counter, one before the vault
door, one inside the vault) and take the **Gran Diamante** from its
pedestal. A guard who sees the player behind the counter, in the vault or
with the diamond (11 blocks, a wide cone, nothing in between) shoots
(survival) or walks the player out and puts the diamond back (creative).
Carried 60 blocks away, the diamond is traded at the bank's counter for the
biggest sum the game pays, **1,000,000 coins** (once per account; the server
pays only after the twelve tasks were recorded, at least 15 minutes apart
from the first), and the city elects the player its **mayor**: a ceremony
with fireworks over the bank, and the mayors of Malaga listed in the bank's
city tab.

## Gems and gold

Gems are ranked as in the real world, from cheap to precious: **quartz,
amethyst, topaz, emerald, sapphire, ruby, diamond** (the exchange pays 3,
6, 12, 35, 45, 60 and 80 coins). Their ores grow in the stone underground,
the precious ones rarer and deeper (amethyst and topaz need a stone pickaxe,
emerald, sapphire, ruby and diamond an iron one); the stone under Malaga
holds them too. About one chunk in eight of Malaga hides a **gem cache**, a
stone lid with coloured stones flush with a park, a garden, a beach or a
square: using it gives two to four gems and often gold nuggets, once. A
**gold pan** (three iron ingots) used in water (a river, the sea, a
fountain) turns up a gold nugget about one time in four, now and then a
small gem; nine nuggets make a gold ingot.

## Money: the bank and the exchange

Signed-in players have a wallet: 20 coins to start, coins in hand and
coins in the bank. In Malaga a **cash machine** (by each real bank and cash
machine) only pays out and takes in coins (quick 10, 20, 50, 100 or any
amount); everything else is at the **counter of the central bank**, the
Banco de España: a stone building of its own on a marble square by the
Paseo del Parque, with a wide door on the street, a hall with columns and
lamps, tellers behind the counter and the vault at the back behind a steel
door (its walls cannot be broken). In the overworld the cash machine by
every village well opens the whole bank:

- **Exchange**: sell what you gather (food, wood, stone, glass, ingots,
  diamonds) for coins, or buy it. Prices move with supply: every unit
  players sell makes that good cheaper for everyone, every unit bought makes
  it dearer (buy price is above sell price, so flipping loses money).
- **Bank**: deposit and withdraw coins, with your last operations.
- **Central bank**: the city's gold reserve, the gold price, the coins in
  circulation and how much of them the gold covers. Gold ingots sold to the
  exchange go into the reserve; bought ones come out of it.

A bus ride in Malaga needs a ticket: 2 coins for one ride or 13 for a
bonobús of ten, bought at a stop sign or from the driver. Diamonds are a
new ore deep underground (below y 20, needs an iron pickaxe).

**Food.** Market stalls (in every village and at Malaga's 449 real food
shops) sell ingredients: tomatoes, oranges, rice, sardines, olive oil,
flour, bread and charcoal. Cook them at the workbench (charcoal is the fire):
espetos (sardine, stick, charcoal), gazpacho (three tomatoes and olive oil),
paella (rice, sardine, tomatoes, olive oil, charcoal; two portions) and
churros (flour, olive oil, charcoal; two). Restaurants (a village tavern,
and Malaga's 1,151 restaurants, cafes and bars) serve the same dishes to eat
on the spot: faster and more filling, but two to three times dearer.

**The city.** Soulcraft has its own calendar: time runs 24 times faster, so
a Soulcraft day is one real hour and a month is one real day (it ends at
midnight UTC); the date shows in the bank's City tab. The city pays a
monthly salary for quests done that month: 6 coins per daily task, 40 per
guardian, 8 per Treasure Quest level, up to 300 (not in creative mode).
It is paid when the month ends, the next time the player opens the bank
or the game.

**Lottery.** Tickets cost 5 coins, at most 10 a month; when the month ends
one ticket wins the pot, less the tenth the city keeps. The winner gets a
message if online.

**Players' market.** Offer goods from the backpack for a price in coins; the
goods wait at the market (they leave the backpack) until another player
buys them, and the coins go to the seller, who is told if online. The
seller can take the goods back while they are unsold.

The wallet lives on the server (D1: `wallets`, `market`, `ledger`,
`econ_state`, and `quest_log`, `salaries`, `lottery_tickets`,
`lottery_draws`, `offers`); the backpack is still the player's own save, so the server
trusts what the game says it sells.

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

- Multiplayer is for up to 4 signed-in players, in the overworld only;
  guardian fights and the other realms are single player.
- Worlds are procedurally generated per seed, but only edits are saved, so
  a changed generator would reshape unedited terrain in old worlds.
- Cloud saves keep one world, one quest run and the profile per account;
  the newest copy wins if two devices play offline at the same time.
- There is no self-service sign-up: the admin creates accounts in /admin.
  Players sign in with a username (optional, set by the admin), an email
  or a phone number.
- Portrait orientation is not supported on phones (the game asks to rotate).
- Sound effects and music are synthesised in code, so they are simple.
- On very weak devices the Auto quality mode trades sharpness for frame
  rate, so the picture can look soft.

## Ideas for next steps

- Guardian fights with friends (a shared boss run by the host).
- Text or emote chat in shared worlds.
- More pets, and pets that learn new tricks.
- A third Treasure Quest chapter.
- Admin panel extras: bulk user import, per-player activity.

## Controls

| | Touch (landscape) | Desktop |
|---|---|---|
| Move | Drag the left side (virtual joystick) | W A S D |
| Look | Drag the right side | Mouse or trackpad (click the game to capture it, Esc frees it); arrow keys |
| Jump / swim up | Arrow button | Space |
| Break / attack | Hold the hammer button | Left mouse button |
| Place / use / eat / trade | Cube button | Right mouse button, two-finger click on a Mac trackpad, F, or Ctrl+click on a Mac |
| Hotbar | Tap a slot or swipe the hotbar | 1-9, mouse wheel (one notch or one trackpad swipe = one slot) |
| Inventory and crafting | Grid button | E |
| Soul Map | Map button | M |
| Pause | Pause button | Esc |
| Drop the held item | - | Q |
| How to play, replay the tutorial | ? button | H, ? button, or the pause menu |
| FPS counter | Settings | F3 |
| Camera: first person, behind, in front | Figure button | F5 |
| Emotes (wave, dance, cheer) | Smiley button | G |

Control size, opacity, look sensitivity, auto-jump, vibration, the control
type (Auto, Touch, Mouse) and whether scrolling changes the item are all in
Settings. On Auto, a laptop with a touch screen switches to mouse and
keyboard on the first mouse click or WASD key, and back on a finger tap.

## Worlds and creative mode

Title screen > **Worlds** lists up to six worlds (newest first) with Play and
Delete; **Continue** opens the most recent one. Signed-in players get every
world in the cloud. **New World** asks for a mode:

- **Survival**: gather, craft, survive the nights, earn soul crystals.
- **Creative**: no damage or hunger, instant mining, endless blocks, and a
  **Blocks** catalog in the inventory. Double-tap jump (or the wing button
  on touch) to fly; jump rises, Shift/C (or the down button) descends.
  Creative worlds give no soul crystals, so the shop stays fair.

## Biomes, companions, daily tasks and events

- **Biomes**: away from spawn the land turns into **deserts** (dunes,
  sandstone, cacti that prickle, dry bushes) or **snowfields** (snow cover,
  frozen lakes, snowy pines). Big caverns have ore-rich walls and lava
  pools, and **glow crystals** grow on cave floors.
- **Companions** (Soul Shop > Companions): the **Ember Fox** (60 crystals)
  bites, the **Frost Owl** (120) flies and shoots ice shards, the **Moss
  Golem** (200) punches monsters away. One comes along at a time; it fights
  monsters near you and the guardians, and rests 30 s when knocked out.
- **Daily tasks** (pause menu): three tasks a day with crystal rewards and
  a bonus for all three, in survival worlds.
- **Seasonal events**: Bloom Days (April 1-20, double task rewards),
  Harvest Glow (October 15 - November 5, monsters drop crystals three
  times as often) and Frostfall (December 10 - January 6, a daily villager
  gift), each with its own particles. `?event=bloom|harvest|frost` forces
  one for testing.

## Superadmin: analytics, playing, the godmode badge

- **Analytics** (superadmin only): every player with whether they are
  online and what they are playing now, their last sign-in or visit (a new
  visit is counted after half an hour away), the device (system, browser,
  phone / tablet / computer, from the user agent), the screen (size and
  pixel ratio), the IP address and the place Cloudflare finds for it (city,
  region, country), and play time over the last 30 days. A click shows the
  player's details: play time per mode (survival, creative, Malaga,
  Treasure Quest, a friend's world), per world and per day, the missions
  done, coins, the last 40 sign-ins and visits, and the cloud saves. Play
  time is counted from the game's presence pings while it is open and
  signed in. Visits are kept for 120 days.
- **Play**: the superadmin's button in the admin panel signs into the game
  with the superadmin's own player account (an admin, made on first use,
  with its own worlds, friends and coins); **Admin** at the bottom of the
  game's title screen goes back to the panel. Admins signed in as players
  also get the **Admin** button.
- **Godmode badge**: other players see a golden halo turning over an
  admin's head, a small gold shield with a white star above it, and the
  name in gold.

## Ideas, problems and game statistics

- **Ideas & bugs** in the pause menu sends a short message (an idea or a
  problem) with the game version, device, screen, world mode, frame rate
  and the last few errors. The admin reads them in the **Feedback** tab of
  /admin, marks them done or deletes them.
- The **Statistics** tab also shows how the game is played, read from the
  cloud saves: time played, blocks placed and broken, monsters defeated,
  which Treasure Quest levels players clear (and how often they fall or die
  on each), what ends a life, and a table per player.

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

Players who forget their password tap **Forgot password?** on the sign-in
screen and get a one-time link by email (valid for an hour; it signs out
their other devices). The admin panel's **Statistics** tab shows players,
active players per day (last 14 days, with a table view), worlds in the
cloud, Treasure Quest progress and the top players.

The API is a Cloudflare Pages Function (`functions/api/[[path]].js`, helpers
in `server/lib.js`) backed by a D1 database (`migrations/`). Passwords are
stored as PBKDF2-SHA256 hashes, sessions as SHA-256 token hashes, and
repeated failed sign-ins are throttled.


### Admins

The superadmin can make any player an **admin** (Users > Make admin). An
admin signs in to `/admin` with their own player account (the game's
profile shows an Admin panel button) and can add and edit players, reset
passwords, disable players and **ban** them for an hour, a day, a week,
30 days or until lifted, with a reason the player sees when signing in.
Only the superadmin deletes accounts and gives or takes admin rights, and
admins cannot change other admins. Every admin action is kept in the
**Log** tab.

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
database (superadmin `admin` / `admin-pass-123`, local only), plus
`wrangler dev` for the rooms Worker in `mp/`.

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
  and deletes users, and makes a player an admin who adds and bans players
  within an admin's limits (with the log); a player signs in with a phone number, edits the
  profile, uploads a photo and changes the password; saves move to a second
  device; "keep me signed in" survives a reload; the admin resets a password.
- `tests/quest.spec.js` (desktop): plays the Treasure Quest from the camp
  to the chest with an autopilot (`tests/questpilot.js`) that uses the normal
  controls, then checks that the rewards carry over into a normal world.
- `tests/quest2.spec.js` (desktop): plays chapter 2 from the vault's back
  door to the crystal vault, the Frost Warden included.
- `tests/multiplayer.spec.js`: two players in two browsers share a world:
  the room code, avatars, block edits both ways, a host monster killed by
  the guest, a monster hurting the guest, the guest's saved things after
  leaving and rejoining, a wrong code, and the host closing the room.
- `tests/languages.spec.js`: English, Russian, Spanish and Latvian have
  every text with the same placeholders; each language's title, inventory,
  pause and settings screens fit on a phone and a desktop; the browser's
  language picks the game's.
- `tests/worldmap.spec.js`: a trip costs a life and sets the respawn point,
  no lives means no trip, a new day gives a life back, creative trips are
  free, and in Malaga the map takes the player up to Gibralfaro.
- `tests/avatar.spec.js`: the avatar unlocked for crystals in the wardrobe,
  free hair and a hair color worn at once, a hat tried on and bought, the
  mayor's crown locked until the achievement, the achievements tab, being
  mayor and robbing the bank unlocking their items, the classic skin and
  back, the third-person views showing the player's own avatar, and an
  emote from the picker.
- `tests/armor.spec.js` (desktop): a piece put on from the hand and the
  rest in their slots (boots refused in the head slot), 15 points take
  about half a blow off, each piece wears, a fall goes through, a worn-out
  piece breaks; a raised shield stops a blow from the front but not one
  from behind.
- `tests/farm2.spec.js` (desktop): an orange pip grows into a bush whose
  fruit is picked and grows again; a hen lays into a nest box; an incubator
  hatches two eggs into chicks.
- `tests/call.spec.js` (accounts) also: a call and an invite to play wait on
  the server for a friend whose game was closed; opening it rings, declining
  stops it; an invite card with Join; push subscriptions only to real push
  services.
- `tests/multiplayer.spec.js` (accounts) also: Malaga together, a guest's
  restaurants finish the team's mission, a guest meeting an informant gives
  the team a piece of the plan, and a piece the guest puts in the puzzle is
  in the host's plan.
- `tests/accounts.spec.js` (accounts) also: analytics record a sign-in with
  the device, screen and place, and play time from presence pings; players
  cannot see analytics; the panel's analytics tab and a player's details;
  Play takes the superadmin into the game as an admin player and Admin
  brings them back; the badge endpoint names the admins.
- `tests/heist.spec.js` (desktop): twelve tasks with twelve squares of the
  plan, all done; the puzzle (a wrong square, the right one, the rest); the
  weak wall breaks; a guard who sees the player in the vault takes the
  diamond back; unseen, the diamond is taken and carried away; traded at the
  counter, the player is mayor.
- `tests/gems.spec.js` (desktop): the exchange prices gems in the order of
  their real value; gem ores lie underground, a ruby ore drops a ruby,
  panning finds gold only in water; Malaga hides gem caches that open once,
  and gems lie under the city.
- `tests/bank.spec.js` (desktop): the Banco de España building has its
  door on the street, the counter with tellers and the vault door; the
  counter opens the whole bank and a city cash machine only the account.
- `tests/bus.spec.js` (desktop): with the clock fixed, a stop shows its next
  buses and sells tickets, the doors open at a stop, a bus is boarded, the
  ticket is validated (no ticket: the inspector puts the player out), the
  top deck is reached, STOP gets off at the next stop, a jump from the top
  deck lands in the street, and the top deck of a driving bus carries a
  player.
- `tests/city.spec.js` (desktop): a Malaga world starts on the Plaza de la
  Constitucion and its buildings stand where the city file says.
- `tests/friends.spec.js`: a friend request by username, accepting it, the
  friend shown online in a world, and joining that world from the list.
- `tests/chat.spec.js`: friends chat live with unread counts, the Lobby is
  only for players an admin let in, an admin deletes a message (it goes
  away live) and mutes a player, and a report reaches the admin.
- `tests/call.spec.js`: a friend calls with video (the browser's fake
  camera), the other answers, both connect, mute works and hanging up ends
  the call for both; strangers cannot ring anyone.
- `tests/missions.spec.js` (desktop): the HUD follows the tourist route with
  an arrow and a distance; the landmarks, the bus ride (getting off early
  starts over), the paella (eaten on the beach only), the critic (the same
  restaurant counts once) and the deposit each complete their mission.
- `tests/farm.spec.js`: seeds planted on grass grow into ripe wheat and
  tomatoes and give a harvest, two cows fed wheat have a calf, a hen lays
  an egg, a sheep gives wool, and animals are parked in the save and come
  back.
- `tests/econ.spec.js`: quests count once toward the salary, lottery
  tickets and their limit, offering, buying and taking back goods on the
  players' market, and (with a test clock) the month end paying the salary
  once and drawing the lottery; selling lowers a good's price, buying needs coins,
  deposits and withdrawals, gold goes into the central bank's reserve, bus
  fares, groceries and meals; and in the game a cash machine opens the bank,
  selling and buying move items and coins, the HUD shows the new balance, a
  market stall sells ingredients that cook into gazpacho, and a restaurant
  serves only hungry players.
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
   superadmin login into the Pages project secrets. It deploys the rooms
   Worker **soulcraft-mp** from `mp/` and binds its Durable Object to the
   Pages project as `ROOMS` (if the token cannot deploy Workers, the game
   goes live without "Play with friends").
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
| `CLOUDFLARE_API_TOKEN` | A custom API token with **Account > Cloudflare Pages > Edit**, **Account > D1 > Edit**, **Account > Workers Scripts > Edit** (for the multiplayer rooms Worker), **Zone > DNS > Edit** and **Zone > Zone > Read** (zone: 8nomads.com) |
| `SUPERADMIN_LOGIN` | The admin panel username |
| `SUPERADMIN_PASSWORD` | The admin panel password |
| `RESEND_API_KEY` | Optional. A [Resend](https://resend.com) API key with full access, for password reset emails. The deploy registers `soulcraft.8nomads.com` as the sending domain and adds its DKIM/SPF records in Cloudflare. |

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
src/net/             play with friends: room connection, other players, host monsters
src/quest/           Treasure Quest manager, daily tasks and events
src/admin/           the /admin panel (admin.html)
functions/api/       accounts and rooms API (Cloudflare Pages Function)
mp/                  the rooms Worker (Durable Objects) for multiplayer
server/              API helpers: hashing, sessions, validation
migrations/          D1 schema
scripts/city/        real-city builder: OpenStreetMap download, elevation, raster
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

**Игра с друзьями:** до 4 игроков с аккаунтами в одном мире. Хозяин мира
открывает его в меню паузы («Игра с друзьями») и получает код комнаты из 6
знаков, друзья вводят его на главном экране («К другу»).

**Малага:** кнопка «Малага» на главном экране открывает настоящий центр
всей Малаги (от аэропорта до Эль-Пало) в масштабе 1 блок = 1 метр: холмы,
улицы, площади, пляж и все дома по данным OpenStreetMap (c) участники
OpenStreetMap, ODbL. Можно играть в творческом режиме или на выживание.

**Поиск сокровищ, глава 2:** после первой сокровищницы задняя дверь ведёт в
Ледяной шпиль: 8 новых уровней и Ледяной страж.
