import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '');
const api = axios.create({ baseURL: apiBaseUrl });
api.interceptors.request.use(config => {
  if (!apiBaseUrl) {
    return Promise.reject(new Error('API URL is not configured. Set VITE_API_URL to your Render API URL ending in /api, then redeploy the frontend.'));
  }
  const token = localStorage.getItem('payroll_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export function getError(error) { return error.response?.data?.error || error.message || 'Something went wrong.'; }
export default api;
