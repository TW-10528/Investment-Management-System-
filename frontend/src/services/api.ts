import axios from 'axios';
import type { AxiosInstance } from 'axios';

// Use Vite proxy (/api → localhost:8001) in dev; absolute URL in production
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only auto-redirect on 401 when NOT already on an auth page.
    // Redirecting while on /login would silently reload the page and swallow error messages.
    const onAuthPage = ['/login', '/signup', '/forgot-password'].some(p =>
      window.location.pathname.startsWith(p)
    );
    if (err.response?.status === 401 && !onAuthPage) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:  (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  signup: (data: { full_name: string; email: string; password: string; role?: string }) =>
    api.post('/auth/signup', data),
  me:     () => api.get('/auth/me'),
};

// ── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  summary: () => api.get('/dashboard/summary'),
};

// ── Funds ────────────────────────────────────────────────────────────────────
export const fundsAPI = {
  list:       ()                         => api.get('/funds'),
  get:        (id: string)               => api.get(`/funds/${id}`),
  ledger:     (id: string)               => api.get(`/funds/${id}/ledger`),
  create:     (data: any)                => api.post('/funds', data),
  update:     (id: string, data: any)    => api.put(`/funds/${id}`, data),
  deactivate:  (id: string)              => api.delete(`/funds/${id}`),
  reactivate:  (id: string)              => api.patch(`/funds/${id}/reactivate`),
  // Capital calls
  getCalls:       (id: string)           => api.get(`/funds/${id}/capital-calls`),
  createCall:     (id: string, d: any)   => api.post(`/funds/${id}/capital-calls`, d),
  updateCall:     (id: string, cId: string, d: any) => api.patch(`/funds/${id}/capital-calls/${cId}`, d),
  deleteCall:     (id: string, cId: string)         => api.delete(`/funds/${id}/capital-calls/${cId}`),
  // Distributions
  getDists:       (id: string)           => api.get(`/funds/${id}/distributions`),
  createDist:     (id: string, d: any)   => api.post(`/funds/${id}/distributions`, d),
  updateDist:     (id: string, dId: string, d: any) => api.patch(`/funds/${id}/distributions/${dId}`, d),
  deleteDist:     (id: string, dId: string)         => api.delete(`/funds/${id}/distributions/${dId}`),
  // NAV records
  getNavRecords:  (id: string)           => api.get(`/funds/${id}/nav-records`),
  createNavRecord:(id: string, d: any)   => api.post(`/funds/${id}/nav-records`, d),
  updateNavRecord:(id: string, nId: string, d: any) => api.patch(`/funds/${id}/nav-records/${nId}`, d),
  deleteNavRecord:(id: string, nId: string)         => api.delete(`/funds/${id}/nav-records/${nId}`),
  // Commitments (per-fund sub-grouping — e.g. SDG)
  getCommitments:   (id: string)         => api.get(`/funds/${id}/commitments`),
  createCommitment: (id: string, d: any) => api.post(`/funds/${id}/commitments`, d),
  updateCommitment: (id: string, cid: string, d: any) => api.patch(`/funds/${id}/commitments/${cid}`, d),
  deleteCommitment: (id: string, cid: string)         => api.delete(`/funds/${id}/commitments/${cid}`),
  commitmentLedger: (id: string, cid: string)         => api.get(`/funds/${id}/commitments/${cid}/ledger`),
};

// ── Capital Calls ─────────────────────────────────────────────────────────────
export const capitalCallsAPI = {
  list:     (fundId?: string, status?: string) => {
    const p = new URLSearchParams();
    if (fundId) p.append('fund_id', fundId);
    if (status) p.append('status', status);
    return api.get(`/capital-calls?${p}`);
  },
  get:      (id: string)  => api.get(`/capital-calls/${id}`),
  create:   (data: any)   => api.post('/capital-calls', data),
  approve:  (id: string)  => api.patch(`/capital-calls/${id}/approve`),
  markPaid: (id: string, data?: any) => api.patch(`/capital-calls/${id}/mark-paid`, data),
};

// ── Distributions ─────────────────────────────────────────────────────────────
export const distributionsAPI = {
  list:   (fundId?: string) => {
    const p = fundId ? `?fund_id=${fundId}` : '';
    return api.get(`/distributions${p}`);
  },
  create: (data: any)   => api.post('/distributions', data),
  delete: (id: string)  => api.delete(`/distributions/${id}`),
};

// ── FX Rates ─────────────────────────────────────────────────────────────────
export const fxRatesAPI = {
  list:       ()                                    => api.get('/fx-rates'),
  latest:     ()                                    => api.get('/fx-rates/latest'),
  live:       ()                                    => api.get('/fx-rates/live'),
  history:    (days?: number)                       => api.get(`/fx-rates/history${days ? `?days=${days}` : ''}`),
  create:     (data: any)                           => api.post('/fx-rates', data),
  cross:      (from: string, to: string)            => api.get(`/fx-rates/cross?from=${from}&to=${to}`),
  historical: (date: string, from: string, to: string) => api.get(`/fx-rates/historical?date=${date}&from=${from}&to=${to}`),
  monthly:    (year?: number)                          => api.get(`/fx-rates/monthly${year ? `?year=${year}` : ''}`),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersAPI = {
  list:         ()                      => api.get('/users'),
  pendingCount: ()                      => api.get('/users/pending-count'),
  create:       (data: any)             => api.post('/users', data),
  approve:      (id: string, role?: string) => api.post(`/users/${id}/approve`, null, {
    params: role ? { role } : {},
  }),
  reject:       (id: string)            => api.post(`/users/${id}/reject`),
  update:       (id: string, data: any) => api.put(`/users/${id}`, data),
  deactivate:   (id: string)            => api.delete(`/users/${id}`),
};

// ── Auth extras ───────────────────────────────────────────────────────────────
export const authExtAPI = {
  forgotPassword:  (email: string)                       => api.post('/auth/forgot-password', { email }),
  verifyOtp:       (email: string, otp: string)          => api.post('/auth/verify-otp',      { email, otp }),
  resetPassword:   (email: string, otp: string, new_password: string) =>
                     api.post('/auth/reset-password', { email, otp, new_password }),
};

// ── Notices (PDF upload & processing) ────────────────────────────────────────
export const noticesAPI = {
  list:            (params?: { notice_type?: string; status?: string; fund_id?: string }) => {
    const p = new URLSearchParams();
    if (params?.notice_type) p.append('notice_type', params.notice_type);
    if (params?.status)      p.append('status',      params.status);
    if (params?.fund_id)     p.append('fund_id',     params.fund_id);
    return api.get(`/notices?${p}`);
  },
  pendingCount:    ()                        => api.get('/notices/pending-count'),
  get:             (id: string)              => api.get(`/notices/${id}`),
  upload:          (formData: FormData)      =>
    api.post('/notices/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadExcel:     (formData: FormData)      =>
    api.post('/notices/upload-excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  approveExcel:    (id: string, fund_id: string, notes?: string) =>
    api.post(`/notices/excel/${id}/approve`, null, {
      params: { fund_id, ...(notes ? { admin_notes: notes } : {}) },
    }),
  approve:         (id: string, fund_id?: string, notes?: string) =>
    api.post(`/notices/${id}/approve`, null, {
      params: { ...(fund_id ? { fund_id } : {}), ...(notes ? { admin_notes: notes } : {}) },
    }),
  reject:          (id: string, notes?: string) =>
    api.post(`/notices/${id}/reject`, null, {
      params: notes ? { admin_notes: notes } : {},
    }),
  updateExtracted: (id: string, data: Record<string, unknown>) =>
    api.put(`/notices/${id}/extracted`, data),
  deleteNote:      (id: string) => api.delete(`/notices/${id}/notes`),
  recentInvestments: (limit?: number) =>
    api.get('/notices/investments/recent', { params: limit ? { limit } : {} }),
  allInvestments: (params?: { fund_id?: string; sector?: string; geography?: string }) =>
    api.get('/notices/investments/all', { params }),
  latestNav:       () => api.get('/notices/nav/latest'),
};

// ── Fund Reports (per-fund PDF upload → auto-parse → auto-calculate) ─────────
export const fundReportsAPI = {
  list:   (fundId: string)                  => api.get('/fund-reports', { params: { fund_id: fundId } }),
  get:    (id: string)                      => api.get(`/fund-reports/${id}`),
  upload: (fundId: string, formData: FormData, noticeType?: string, commitmentId?: string) =>
    api.post('/fund-reports/upload', formData, {
      params:  { fund_id: fundId, ...(noticeType ? { notice_type: noticeType } : {}), ...(commitmentId ? { commitment_id: commitmentId } : {}) },
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (id: string)                      => api.delete(`/fund-reports/${id}`),
};

// ── Calculation Rules ─────────────────────────────────────────────────────────
export const rulesAPI = {
  list:        ()                              => api.get('/rules/'),
  attributes:  ()                              => api.get('/rules/attributes'),
  dashboard:   ()                              => api.get('/rules/dashboard'),
  results:     (noticeId: string)              => api.get(`/rules/results/${noticeId}`),
  create:      (data: any)                     => api.post('/rules/', data),
  update:      (id: string, data: any)         => api.put(`/rules/${id}`, data),
  delete:      (id: string)                    => api.delete(`/rules/${id}`),
  run:         (noticeId: string)              => api.post(`/rules/run/${noticeId}`),
  preview:     (data: any)                     => api.post('/rules/preview', data),
  exportExcel: (noticeId: string)              =>
    api.get(`/notices/${noticeId}/export-excel`, { responseType: 'blob' }),
  // AttributeExtractors
  listExtractors:   ()                              => api.get('/rules/extractors'),
  createExtractor:  (data: any)                     => api.post('/rules/extractors', data),
  updateExtractor:  (id: string, data: any)         => api.put(`/rules/extractors/${id}`, data),
  deleteExtractor:  (id: string)                    => api.delete(`/rules/extractors/${id}`),
  testExtractor:    (data: any)                     => api.post('/rules/extractors/test', data),
};

// ── Fund PDF — generic upload + per-fund analysis ────────────────────────────
export const fundPdfAPI = {
  registered:   ()                => api.get('/fund-reports'),
  upload:       (file: File)      => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/fund-reports/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsAPI = {
  list:    (unreadOnly?: boolean) => api.get(unreadOnly ? '/notifications?unread=true' : '/notifications'),
  markRead:(id: string)           => api.patch(`/notifications/${id}/read`),
  markAll: ()                     => api.patch('/notifications/read-all'),
};

export default api;
