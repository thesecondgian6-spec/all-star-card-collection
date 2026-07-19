export const RARITIES = [
  { id: 'common',    name: 'Common',    hex: '#8b8fa3' },
  { id: 'uncommon',  name: 'Uncommon',  hex: '#4ade80' },
  { id: 'rare',      name: 'Rare',      hex: '#38bdf8' },
  { id: 'epic',      name: 'Epic',      hex: '#a78bfa' },
  { id: 'legendary', name: 'Legendary', hex: '#f5b642' },
  { id: 'mythic',    name: 'Mythic',    hex: '#f4568c' },
];
export const RARITY_MAP = Object.fromEntries(RARITIES.map((r) => [r.id, r]));
export const RARITY_ORDER = RARITIES.map((r) => r.id);

export function fmt(n) {
  n = Math.floor(Number(n) || 0);
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 1e9) return sign + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return sign + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return sign + (n / 1e3).toFixed(1) + 'K';
  return sign + n.toLocaleString();
}

/**
 * Client-side ESTIMATE only, used to render the live "pending" counter on each
 * card so it feels alive between collects. The server (collect_card / collect_all
 * RPCs) always recomputes the authoritative amount from last_tick at collection
 * time, so a player can never gain more than the real capped total by fiddling
 * with the client.
 */
export function estimatePending({ earnRate, count, lastTick, capHours, capacityBonusHours = 0, multiplier = 1 }) {
  if (!count) return 0;
  const elapsedSec = Math.max(0, (Date.now() - new Date(lastTick).getTime()) / 1000);
  const capSec = (Number(capHours) + Number(capacityBonusHours)) * 3600;
  const effectiveSec = Math.min(elapsedSec, capSec);
  return effectiveSec * Number(earnRate) * Number(count) * Number(multiplier);
}

export function upgradeCost(upgrade, currentLevel) {
  return Math.ceil(Number(upgrade.base_cost_gems) * Math.pow(Number(upgrade.cost_growth), currentLevel));
}

export function timeAgo(dateStr) {
  const sec = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}
