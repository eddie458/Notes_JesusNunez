const API = import.meta.env.VITE_API_URL || '/api'
let csrfToken = ''
let sessionRevision = 0

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
    cache: 'no-store',
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

function rememberSession(payload, revision) {
  if (revision === sessionRevision) csrfToken = payload.csrf_token || ''
  return payload.user
}

export const authApi = {
  me: () => {
    const revision = ++sessionRevision
    return request('/auth/me').then(payload => rememberSession(payload, revision))
  },
  login: (email, password) => {
    const revision = ++sessionRevision
    return request('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }).then(payload => rememberSession(payload, revision))
  },
  logout: () => {
    const revision = ++sessionRevision
    return request('/auth/logout', { method: 'POST' }).finally(() => {
      if (revision === sessionRevision) csrfToken = ''
    })
  },
}

export const notesApi = {
  list: (workspaceId) => request(`/notes?workspace_id=${encodeURIComponent(workspaceId)}`),
  create: (note) => request('/notes', { method: 'POST', body: JSON.stringify(note) }),
  update: (id, note) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(note) }),
  remove: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
  move: (id, workspaceId) => request(`/notes/${id}/move`, { method: 'POST', body: JSON.stringify({ workspace_id: workspaceId }) }),
}

export const categoriesApi = {
  list: (workspaceId) => request(`/categories?workspace_id=${encodeURIComponent(workspaceId)}`),
  create: (name, workspaceId) => request('/categories', { method: 'POST', body: JSON.stringify({ name, workspace_id: workspaceId }) }),
  update: (id, name) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  remove: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
}

export const workspacesApi = {
  list: () => request('/workspaces'),
  create: (name) => request('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id, name) => request(`/workspaces/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
}

export const adminApi = {
  users: () => request('/admin/users'),
  createUser: (user) => request('/admin/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id, user) => request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(user) }),
  deleteUserData: (id) => request(`/admin/users/${id}/data`, { method: 'DELETE' }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
}
