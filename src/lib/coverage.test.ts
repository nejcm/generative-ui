import { expect, test } from 'vitest'
import { fixtures } from '../prompts'
import { coverage } from './coverage'

test('coverage counts nested string and number leaves, including repeated values', () => {
  const fixture = { title: 'Sales', rows: [{ name: 'Web', revenue: 1234.5 }, { name: 'Web', share: 0.42 }], active: true, note: null }
  expect(coverage(fixture, 'Sales Web $1,234.50')).toBe(4 / 5)
  expect(coverage(fixture, 'Sales Web $1,234.50 42%')).toBe(1)
  expect(coverage(fixture, '')).toBe(0)
  expect(coverage({}, '')).toBe(1)
})

test.each(['184200', '184,200', '184,200.00', '184.2K'])('coverage recognizes the numeric format %s', (text) => {
  expect(coverage({ revenue: 184200 }, text)).toBe(1)
})

test('coverage does not find a number inside a larger number', () => {
  expect(coverage({ orders: 12 }, '312 orders, 12.5 average')).toBe(0)
  expect(coverage({ orders: 12 }, '12 orders')).toBe(1)
})

test('real fixture strings can also appear JSON-escaped in output', () => {
  expect(coverage(fixtures.products, JSON.stringify(fixtures.products))).toBe(1)
})

test('coverage matches fixture strings regardless of display capitalization', () => {
  expect(coverage({ stock: 'in stock', screen: '14" OLED' }, 'In Stock · 14\\" oled')).toBe(1)
})

test('coverage excludes CSS units but retains displayed hardware units and percentages', () => {
  expect(coverage({ ram: 16, battery: 9, rating: 4.4, growth: 0.2 }, '16px 9px 4.4rem 0.2s')).toBe(0)
  expect(coverage({ ram: 16, battery: 9, rating: 4.4, growth: 0.2 }, '16GB · 9h · 4.4 stars · 20%')).toBe(1)
})

test('HTML coverage retains script data while excluding style blocks and attributes', () => {
  const fixture = { name: 'Aero 14', price: 1299, ram: 16, battery: 9 }
  const html = '<style>.card{font-size:16px}/* Aero 14 */</style><script>const price=1299</script><div style="margin:9px" data-name="Aero 14">Aero 14</div>'
  expect(coverage(fixture, html)).toBe(2 / 4)
  expect(coverage({ value: 1299 }, '<div STYLE = \'--value:1299\'></div><p style=--value:1299></p>')).toBe(0)
})

test('coverage retains spec state and script data used by bound tables and charts', () => {
  const fixture = { name: 'Aero 14', ram: 16, channel: 'Web', revenue: 1299 }
  const spec = { root: 'main', elements: {
    main: { type: 'Card', props: {}, children: ['table', 'chart'] },
    table: { type: 'Table', props: { columns: ['Laptop', 'RAM'], rows: { $state: '/rows' } } },
    chart: { type: 'Chart', props: { data: { $state: '/revenue' } } },
  }, state: { rows: [['Aero 14', 16]], revenue: [{ label: 'Web', value: 1299 }] } }
  const html = `<table id="laptops"></table><script>const data = ${JSON.stringify(fixture)}; render(data)</script>`
  expect(coverage(fixture, JSON.stringify(spec))).toBe(1)
  expect(coverage(fixture, html)).toBe(1)
})
