// node src/util.test.mjs
import assert from 'node:assert/strict'
import { addDays, stopOffsets, walkMinutes, cleanDays, moveItem, renumber, joinLegs, routeUpTo, placeTags } from './util.js'

assert.equal(addDays('2026-12-30', 3), '2027-01-02')
assert.deepEqual(stopOffsets({ stops: [{ nights: 2 }, { nights: 3 }, { nights: 1 }] }), [0, 2, 5])

console.log('ok')

// walkMinutes: Duomo di Milano -> Castello Sforzesco is ~1.0 km straight line
const w = walkMinutes({ lat: 45.4642, lng: 9.1916 }, { lat: 45.4705, lng: 9.1794 })
assert.ok(w >= 14 && w <= 20, `walk ${w}`)
assert.equal(walkMinutes({ lat: 1, lng: 1 }, { lat: null, lng: null }), null)

const { days, dropped } = cleanDays([
  { items: [{ place_index: 1, transfer: { walk_min: 3 } }, { place_index: null, place: 'Pranzo' }, { place_index: 2 }] },
  { items: [{ place_index: 1 }, { place_index: 3, transfer: { walk_min: 9 } }, { place_index: 99 }] },
], 3)
assert.equal(dropped, 1)
assert.deepEqual(days[0].items.map(i => i.placeIdx), [0, null, 1])
assert.equal(days[0].items[0].transfer, null) // first of the day never has a transfer
assert.deepEqual(days[1].items.map(i => i.placeIdx), [2, null]) // repeat of place 1 dropped, 99 out of range
assert.equal(days[1].items[0].transfer, null) // became first after the drop
console.log('ok 2')

{
  const A = { time: '09:00', place: 'A', transfer: null }, B = { time: '11:00', place: 'B', transfer: { car_min: 1 } }
  const C = { time: '14:00', place: 'C', transfer: { car_min: 2 } }, D = { time: '10:00', place: 'D', transfer: null }
  const days = [{ items: [A, B, C], route: {} }, { items: [D], route: {} }]
  // reorder inside day 1: C to the top
  let r = moveItem(days, { d: 0, i: 2 }, { d: 0, i: 0 })
  assert.deepEqual(r[0].items.map(x => x.place + x.time), ['C09:00', 'A11:00', 'B14:00'])
  assert.equal(r[0].items[2].transfer.car_min, 1) // B still follows A: estimate kept
  assert.equal(r[0].items[0].transfer, null) // C is now first of the day
  assert.equal(r[0].route, undefined)
  assert.ok(r[1].route) // untouched day keeps its route
  // drag B down past C (insert index 3 = after C)
  r = moveItem(days, { d: 0, i: 1 }, { d: 0, i: 3 })
  assert.deepEqual(r[0].items.map(x => x.place), ['A', 'C', 'B'])
  // move A to day 2 end: day 1 loses the 09:00 slot, day 2 gains it
  r = moveItem(days, { d: 0, i: 0 }, { d: 1, i: 1 })
  assert.deepEqual(r[0].items.map(x => x.place + x.time), ['B11:00', 'C14:00'])
  assert.deepEqual(r[1].items.map(x => x.place + x.time), ['D09:00', 'A10:00'])
  assert.equal(r[0].items[1].transfer.car_min, 2) // C still follows B: estimate kept
  // dropping onto itself is a no-op
  assert.equal(moveItem(days, { d: 0, i: 1 }, { d: 0, i: 2 }), days)
  console.log('ok 3')
}

{
  const P = ['A', 'B', 'C', 'D'].map(name => ({ name }))
  const days = [{ items: [{ placeIdx: 2 }, { placeIdx: null, place: 'Pranzo' }, { placeIdx: 0 }] }, { items: [{ place: 'D' }] }] // D: old plan, by name
  const r = renumber(P, days)
  assert.deepEqual(r.places.map(p => p.name), ['C', 'A', 'D', 'B']) // itinerary order, unvisited B last
  assert.deepEqual(r.days.map(d => d.items.map(it => it.placeIdx)), [[0, null, 1], [2]])
  console.log('ok 4')
}

{
  const step = (...pts) => ({ geometry: { coordinates: pts } })
  // hotel H -> A -> B -> H, each leg made of steps
  const r = joinLegs([{ steps: [step([0, 0], [1, 0]), step([1, 0], [1, 1])] }, { steps: [step([1, 1], [2, 1])] }, { steps: [step([2, 1], [0, 0])] }])
  assert.deepEqual(r.cuts, [3, 5, 7])
  assert.deepEqual(routeUpTo(r, 0), []) // the start: no line yet
  assert.deepEqual(routeUpTo(r, 1).at(-1), [1, 1]) // up to A
  assert.deepEqual(routeUpTo(r, 2).at(-1), [2, 1]) // up to B, not back to the hotel
  console.log('ok 5')
}

{
  const stop = { places: ['A', 'B', 'C', 'D'].map(name => ({ name })), days: [
    { items: [{ placeIdx: 0 }, { placeIdx: null, place: 'Pranzo' }, { placeIdx: 1 }] },
    { items: [{ place: 'C' }] }, // old plan: by name
  ] }
  assert.deepEqual(placeTags(stop), [{ day: 0, n: 1 }, { day: 0, n: 2 }, { day: 1, n: 1 }]) // day 2 restarts at 1; D unvisited
  console.log('ok 6')
}
