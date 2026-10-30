// Exercise CSRF renewal when returning to a tab overlaps login or logout.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('../src/api.js', import.meta.url), 'utf8'))
  .replace('import.meta.env.VITE_API_URL', "''")
const { authApi, notesApi } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = (url, options) => new Promise(resolve => requests.push({
  url, options,
  reply: (payload, status = 200) => resolve({ ok: status < 400, status, text: async () => payload === null ? '' : JSON.stringify(payload) }),
}))

let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks += 1 }
try {
  const oldCheck = authApi.me()
  const login = authApi.login('session-test@example.test', 'test-only')
  requests[1].reply({ user: { id: 1 }, csrf_token: 'new-login-token' })
  await login
  requests[0].reply({ user: { id: 1 }, csrf_token: 'stale-tab-token' })
  await oldCheck
  let save = notesApi.create({ title: 'CSRF test' })
  check(requests[2].options.headers['X-CSRF-Token'] === 'new-login-token', 'An old tab check must not overwrite the new login token.')
  check(requests.every(request => request.options.credentials === 'include'), 'Requests must send the HTTP session cookie.')
  check(requests.every(request => request.options.cache === 'no-store'), 'Session and notes responses must not be served from cache.')
  requests[2].reply({ id: 1 })
  await save

  const logout = authApi.logout()
  const nextLogin = authApi.login('session-test@example.test', 'test-only')
  requests[4].reply({ user: { id: 2 }, csrf_token: 'latest-login-token' })
  await nextLogin
  requests[3].reply(null, 204)
  await logout
  save = notesApi.create({ title: 'New account test' })
  check(requests[5].options.headers['X-CSRF-Token'] === 'latest-login-token', 'A late logout response must not clear a newer login token.')
  requests[5].reply({ id: 2 })
  await save

  const returned = authApi.me()
  requests[6].reply({ user: { id: 2 }, csrf_token: 'refreshed-token' })
  await returned
  save = notesApi.create({ title: 'Returned tab test' })
  check(requests[7].options.headers['X-CSRF-Token'] === 'refreshed-token', 'A successful session check must refresh the CSRF token.')
  requests[7].reply({ id: 3 })
  await save

  const unavailable = authApi.me()
  requests[8].reply({ error: 'Temporarily unavailable', code: 'SESSION_UNAVAILABLE' }, 503)
  await assert.rejects(unavailable, error => error.status === 503)
  save = notesApi.create({ title: 'Retry after temporary outage' })
  check(requests[9].options.headers['X-CSRF-Token'] === 'refreshed-token', 'A temporary connection failure must not discard the last valid token.')
  requests[9].reply({ id: 4 })
  await save
  console.log(`Passed ${checks} session client checks.`)
} finally {
  globalThis.fetch = originalFetch
}
