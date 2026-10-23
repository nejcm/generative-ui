import products from './fixtures/products.json'
import projects from './fixtures/projects.json'
import rows from './fixtures/rows.json'
import sales from './fixtures/sales.json'

export const fixtures: Record<string, unknown> = { sales, products, projects, rows }

export type Preset = { id: string; label: string; prompt: string; fixtureId?: string }

export const presets: Preset[] = [
  { id: 'login', label: 'Login form', prompt: 'A login form with email, password, a "remember me" option and a sign-in button.' },
  { id: 'dashboard', label: 'Analytics dashboard', prompt: 'An analytics dashboard for this quarter: headline stats, a weekly revenue chart, revenue by channel and a top products table.', fixtureId: 'sales' },
  { id: 'pricing', label: 'Pricing page', prompt: 'A pricing page with three plans (Free, Pro, Team), their features and a call to action for each.' },
  { id: 'settings', label: 'Settings panel', prompt: 'An account settings panel with profile, notifications and privacy sections.' },
  { id: 'comparison', label: 'Product comparison', prompt: 'A side-by-side comparison of these laptops that helps pick one.', fixtureId: 'products' },
  { id: 'portfolio', label: 'Portfolio landing', prompt: 'A portfolio landing page for this person, featuring their projects.', fixtureId: 'projects' },
  { id: 'table', label: 'Data table with filters', prompt: 'An orders table with a search field and a status filter above it.', fixtureId: 'rows' },
  { id: 'onboarding', label: 'Onboarding wizard', prompt: 'A three-step onboarding wizard: account, preferences, done. Show the current step and next/back buttons.' },
  { id: 'profile', label: 'Profile card', prompt: 'A user profile card with avatar, name, role, short bio, a few stats and a follow button.' },
  { id: 'states', label: 'Empty and error states', prompt: 'Two states for a file list: an empty state with an upload call to action, and an error state with a retry button.' },
]
