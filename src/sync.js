// Settings saved by older versions carry the user's own AI setup (provider, model, *Key): drop it, the app has its own.
export const cleanSettings = s =>
  Object.fromEntries(Object.entries(s || {}).filter(([k]) => !/Key$|Model$|^provider$|^customUrl$/.test(k)))

// Union of two trip lists by id; when both sides have a trip, the one edited last wins.
export function mergeTrips(local, remote) {
  const byId = new Map(local.map(t => [t.id, t]))
  for (const r of remote) {
    const l = byId.get(r.id)
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) byId.set(r.id, r)
  }
  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
