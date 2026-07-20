const API = import.meta.env.VITE_API_URL || '/api'
let csrfToken = ''

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request(path, options = {}) {
  const method = options.method || 'GET'
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  })
  const text = response.status === 204 ? '' : await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(
        'The PHP API returned an invalid response. Check the PHP terminal for the underlying error.',
        response.status,
        'INVALID_RESPONSE',
      )
    }
  }
  if (!response.ok) {
    throw new ApiError(payload?.error || 'Something went wrong', response.status, payload?.code)
  }
  if (response.status === 204) return null
  return payload
}

function rememberSession(payload) {
  csrfToken = payload.csrf_token || ''
  return payload.user
}

export const authApi = {
  me: () => request('/auth/me').then(rememberSession),
  login: (email, password) => request('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }).then(rememberSession),
  logout: () => request('/auth/logout', { method: 'POST' }).finally(() => { csrfToken = '' }),
}

export const notesApi = {
  list: () => request('/notes'),
  create: (note) => request('/notes', { method: 'POST', body: JSON.stringify(note) }),
  update: (id, note) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(note) }),
  remove: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
}

export const categoriesApi = {
  list: () => request('/categories'),
  create: (name) => request('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id, name) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  remove: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
}

export const adminApi = {
  users: () => request('/admin/users'),
  createUser: (user) => request('/admin/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id, user) => request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(user) }),
  deleteUserData: (id) => request(`/admin/users/${id}/data`, { method: 'DELETE' }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
}
