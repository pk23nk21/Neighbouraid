import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 20000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Auto-logout on any 401 (expired or revoked token). We listen for this
    // event in AuthContext so the user state clears and the router bounces
    // them to /login without individual pages having to care.
    if (err?.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('name')
      window.dispatchEvent(new Event('auth:logout'))
    }
    return Promise.reject(err)
  }
)

export default api
