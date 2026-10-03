/**
 * Public-demo switch. Set VITE_DEMO_MODE=true at build time to turn the app
 * into a try-it-out showcase: sign-up and password recovery are replaced by
 * one-click guest logins. The server enforces the same restrictions on its own
 * (DEMO_MODE), so this only changes what the UI offers.
 *
 * The guest password is deliberately not in the source: it is public by design
 * (it is printed on the login page) but is supplied at build time so the repo
 * does not publish the live one.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

const password = import.meta.env.VITE_DEMO_PASSWORD || 'demo12345'

export const DEMO_ACCOUNTS = {
  citizen: {
    label: 'Citizen',
    blurb: 'File a grievance, see the AI routing, track it',
    email: 'citizen@demo.in',
    password,
  },
  official: {
    label: 'Government official',
    blurb: 'Review the queue, advance status, add notes',
    email: 'officer@gov.in',
    password,
  },
}
