// node src/util.test.mjs
import assert from 'node:assert/strict'
import { nextSlot } from './util.js'
import { addDays, stopOffsets, walkMinutes, cleanDays, moveItem, renumber, joinLegs, routeUpTo, placeTags, dayNumbers, removeItem, insertBreak, dropUnlocated, sameName, dayTone, contrast } from './util.js'

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

{
  const P = [{ name: 'A', lat: 1 }, { name: 'X', lat: null }, { name: 'B', lat: 2 }, { name: 'C', lat: 3 }] // C unvisited
  const days = [{ items: [{ placeIdx: 1, transfer: null }, { placeIdx: 0, transfer: { car_min: 4 } }, { placeIdx: null, place: 'Pranzo' }, { placeIdx: 2 }] }]
  const r = dropUnlocated(P, days)
  assert.deepEqual(r.dropped, ['X'])
  assert.deepEqual(r.places.map(p => p.name), ['A', 'B', 'C'])
  assert.deepEqual(r.days[0].items.map(it => it.placeIdx), [0, null, 1])
  assert.equal(r.days[0].items[0].transfer, null) // A became first of the day
  assert.equal(dropUnlocated(r.places, r.days).places, r.places) // nothing missing: unchanged
  console.log('ok 7')
}

assert.ok(sameName('Chiesa di San Michele Arcangelo', 'Chiesa di San Michele'))
assert.ok(!sameName('Chiesa di San Giovanni Battista', 'Chiesa dei Santi Pietro e Paolo Apostoli'))
assert.ok(!sameName('Palazzo Francesconi', 'Palazzo Ducale'))
assert.ok(sameName('Basilica di Santa Croce', 'Santa Croce'))
assert.ok(sameName('Real Alcázar', 'Real Alcazar de Sevilla')) // accents ignored
console.log('ok 8')

{
  const ink = { bg: '#c8402a', fg: '#ffffff' }
  assert.equal(dayTone(ink, 0, 3), ink) // day 1 is the stop's ink
  const days = Array.from({ length: 6 }, (_, d) => dayTone(ink, d).bg)
  assert.equal(new Set(days).size, 6) // six days, six different inks
  assert.equal(dayTone(ink, 1).bg, '#e3a72b') // the palette order after vermilion
  assert.equal(dayTone({ bg: '#1d6f78', fg: '#fff' }, 1).bg, '#c8402a') // wraps around
  const d7 = dayTone(ink, 6)
  assert.ok(!days.includes(d7.bg)) // seventh day: same ink as day 1, lighter
  for (let d = 0; d < 12; d++) { const x = dayTone(ink, d); assert.ok(contrast(x.bg, x.fg) >= 3, `${d} ${x.bg}`) } // pin numbers stay readable
  console.log('ok 9')
}

{
  const stop = { places: ['A', 'B'].map(name => ({ name })), days: [
    { items: [{ placeIdx: 0 }, { placeIdx: null, place: 'Pranzo', venue: { name: 'Casa Morales' } }, { placeIdx: null, place: 'Pausa' }, { placeIdx: 1 }] },
  ] }
  const r = dayNumbers(stop)
  assert.deepEqual(r.places, [{ day: 0, n: 1 }, { day: 0, n: 3 }]) // the venue takes 2, so B follows it
  assert.deepEqual(r.venues, { '0:1': { day: 0, n: 2 } }) // a break without a venue takes no number
  console.log('ok 10')
}

{
  const days = [{ route: {}, items: [{ place: 'A' }, { place: 'Caffè', transfer: { car_min: 2 } }, { place: 'B', transfer: { car_min: 3 }, go: 'car' }] }, { route: {}, items: [{ place: 'C' }] }]
  const r = removeItem(days, { d: 0, i: 1 })
  assert.deepEqual(r[0].items.map(x => x.place), ['A', 'B'])
  assert.equal(r[0].items[1].transfer, null) // B now comes from A: the old estimate is gone
  assert.equal(r[0].items[1].go, undefined)
  assert.equal(r[0].route, undefined)
  assert.ok(r[1].route) // other days untouched
  console.log('ok 11')
}

{
  const days = [{ route: {}, items: [{ time: '09:30', place: 'A' }, { time: '12:00', place: 'B' }] }]
  let r = insertBreak(days, { d: 0, i: 0 }, 'Pausa caffè')
  assert.deepEqual(r[0].items.map(x => x.place + x.time), ['A09:30', 'Pausa caffè10:45', 'B12:00']) // halfway, on 5 minutes
  assert.ok(r[0].route) // a break without a venue does not change the walk
  r = insertBreak(days, { d: 0, i: 1 }, 'Cena')
  assert.equal(r[0].items[2].time, '13:00') // after the last item: one hour later
  console.log('ok 12')
}

{
  const { cleanSettings, mergeTrips } = await import('./sync.js')
  assert.deepEqual(cleanSettings({ lang: 'it', geminiKey: 'g', provider: 'gemini', openrouterModel: 'x', customUrl: 'u', currency: 'EUR' }), { lang: 'it', currency: 'EUR' })
  const m = mergeTrips([{ id: 'a', updatedAt: 5, v: 'local' }, { id: 'b', updatedAt: 1 }], [{ id: 'a', updatedAt: 3, v: 'remote' }, { id: 'c', updatedAt: 9 }])
  assert.deepEqual(m.map(t => t.id + (t.v || '')), ['c', 'alocal', 'b'])
  console.log('ok sync')
}

assert.equal(nextSlot([]), '10:00')
assert.equal(nextSlot([{ time: '09:30' }, { time: '15:15' }]), '16:45')
assert.equal(nextSlot([{ time: '22:50' }]), '23:00') // never past 23:00
console.log('ok slot')

{
  const { dayTimes, legMinutes, dayStart } = await import('./util.js')
  assert.equal(dayStart({ items: [{ time: '11:00' }, { time: '9:30' }, { time: '' }] }), '9:30') // earliest, not first
  assert.equal(dayStart({ start: '08:15', items: [{ time: '9:30' }] }), '08:15')
  assert.equal(dayStart({ items: [] }), '09:00')
  assert.equal(legMinutes({ walk: 12, drive: { min: 5 }, tr: { metro: { min: 7 } }, go: 'metro' }), 7)
  assert.equal(legMinutes({ walk: 12, drive: { min: 5 }, go: 'car' }), 5)
  assert.equal(legMinutes({ walk: 12, tr: { bus: null }, go: 'bus' }), 12) // no bus time: walking
  const stop = {
    hotel: { name: 'H', lat: 45.0, lng: 9.0 },
    places: [{ name: 'A', minutes: 90, lat: 45.001, lng: 9.0 }, { name: 'B', minutes: 60, lat: 45.002, lng: 9.0 }],
  }
  const day = {
    route: { legs: [10, 15, 20] }, // hotel->A, A->B, B->hotel
    items: [
      { place: 'A', placeIdx: 0 },
      { place: 'Pranzo', placeIdx: null },
      { place: 'B', placeIdx: 1, go: 'metro', transfer: { metro: { min: 6 } } },
    ],
  }
  // 08:30 + 10 walk = 08:40 at A; +90 = 10:10 lunch, held to 12:30; +60 = 13:30, +6 metro = 13:36 -> 13:40 at B; +60 +20 back
  assert.deepEqual(dayTimes(stop, day, '08:30'), { times: ['08:40', '12:30', '13:40'], back: '15:00' })
  assert.equal(dayTimes(stop, day, ''), null)
  const st = { places: [{ name: 'A', minutes: 60, lat: 45, lng: 9 }] }
  const brk = name => dayTimes(st, { items: [{ place: 'A', placeIdx: 0 }, { place: name, placeIdx: null }, { place: 'Dopo', placeIdx: null }] }, '10:00').times[2]
  assert.equal(brk('Pausa tè'), '11:20') // tea: 20 min
  assert.equal(brk('Tea break'), '11:20')
  assert.equal(brk('Pausa caffè'), '11:20')
  assert.equal(brk('Teatro alla Scala'), '11:45') // not a tea: default 45 min
  console.log('ok times')
}

{
  const { regionCurrency, convert } = await import('./util.js')
  assert.equal(regionCurrency('it-IT'), 'EUR')
  assert.equal(regionCurrency('it'), 'EUR')
  assert.equal(regionCurrency('en-GB'), 'GBP')
  assert.equal(regionCurrency('en'), 'USD') // en -> US
  assert.equal(regionCurrency('de-CH'), 'CHF')
  assert.equal(regionCurrency('xx-QQ'), 'EUR') // unknown region: euro
  const rates = { EUR: 1, GBP: 0.85, TRY: 55 }
  assert.equal(convert(20, 'EUR', 'EUR', rates), 20)
  assert.ok(Math.abs(convert(20, 'EUR', 'GBP', rates) - 17) < 1e-9)
  assert.ok(Math.abs(convert(550, 'TRY', 'EUR', rates) - 10) < 1e-9)
  assert.equal(convert(10, 'XYZ', 'EUR', rates), null)
  console.log('ok currency')
}

{
  const { toAmount, keepTicket } = await import('./util.js')
  assert.equal(toAmount(20), 20)
  assert.equal(toAmount('2.750 TRY'), 2750)
  assert.equal(toAmount('€ 20,50'), 20.5)
  assert.equal(toAmount('1,250.00'), 1250)
  assert.equal(toAmount('3.000'), 3000)
  assert.equal(toAmount('gratis'), null)
  assert.equal(keepTicket({ prices: [{ amount: 1 }] }, { prices: [], needed: null }), true) // a worse search keeps the old prices
  assert.equal(keepTicket({ prices: [{ amount: 1 }] }, { prices: [], needed: false }), false) // now free: take it
  assert.equal(keepTicket({ prices: [] }, { prices: [] }), false)
  console.log('ok ticket')
}
