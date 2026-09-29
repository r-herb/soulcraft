// Quests done count toward the city's monthly salary (signed-in players,
// not in creative mode); the server counts each quest once a month.
import { account, econ } from '../save/account.js';

export function reportQuest(game, kind, ref) {
  if (!account.user || !account.available || (game && game.creative)) return;
  econ.quest(kind, ref).catch(() => { /* offline: not counted */ });
}
