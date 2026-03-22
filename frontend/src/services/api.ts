import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach JWT token automatically
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (org_name: string, email: string, password: string) =>
    api.post('/auth/register', { org_name, email, password }),

  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.access_token)
    return data
  },

  logout: () => localStorage.removeItem('token'),
}

// ─── Connectors ───────────────────────────────────────────────────────────────

export const connectorsApi = {
  list: () => api.get('/connectors').then(r => r.data),
  create: (payload: object) => api.post('/connectors', payload).then(r => r.data),
  test: (id: string) => api.post(`/connectors/${id}/test`).then(r => r.data),
  getSchema: (id: string) => api.post(`/connectors/${id}/schema`).then(r => r.data),
  delete: (id: string) => api.delete(`/connectors/${id}`).then(r => r.data),
  types: () => api.get('/connector-types').then(r => r.data),
}

// ─── Migrations ───────────────────────────────────────────────────────────────

export const migrationsApi = {
  list: () => api.get('/migrations').then(r => r.data),
  get: (id: string) => api.get(`/migrations/${id}`).then(r => r.data),
  create: (payload: object) => api.post('/migrations', payload).then(r => r.data),
  generateMapping: (jobId: string, sourceEntity: string, targetEntity: string) =>
    api.post(`/migrations/${jobId}/generate-mapping`, {
      source_entity: sourceEntity,
      target_entity: targetEntity,
    }).then(r => r.data),
  start: (jobId: string) => api.post(`/migrations/${jobId}/start`).then(r => r.data),
  getAudit: (jobId: string) => api.get(`/migrations/${jobId}/audit`).then(r => r.data),
}

// ─── Automation ───────────────────────────────────────────────────────────────

export const automationApi = {
  list: () => api.get('/automation').then(r => r.data),
  get: (id: string) => api.get(`/automation/${id}`).then(r => r.data),
  create: (payload: object) => api.post('/automation', payload).then(r => r.data),
  run: (id: string, triggerData: object = {}) =>
    api.post(`/automation/${id}/run`, triggerData).then(r => r.data),
  getRuns: (id: string) => api.get(`/automation/${id}/runs`).then(r => r.data),
  setStatus: (id: string, status: string) =>
    api.patch(`/automation/${id}/status`, null, { params: { status } }).then(r => r.data),
}

export default api
