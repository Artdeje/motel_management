const TOKEN_KEY = 'motel_auth_token';

// Dynamic API base: supports split deployment via VITE_API_URL, otherwise same-origin (fullstack)
// Fullstack (Railway/Render/Single container): frontend and /api served by same Express server -> relative path is correct
// Split (Netlify frontend + Railway backend): set VITE_API_URL=https://your-backend.up.railway.app
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

function resolveUrl(endpoint: string): string {
  if (API_BASE) {
    // endpoint always starts with /api
    return `${API_BASE}${endpoint}`;
  }
  return endpoint;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = resolveUrl(endpoint);
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: any) {
    // Network failure — server not reachable, CORS blocked, or offline
    const hint = API_BASE ? ` (API_BASE=${API_BASE})` : ' — is the server running? `npm run dev` should be on http://localhost:3000';
    throw new Error(`Cannot reach server at ${url}${hint}. Details: ${err?.message || 'Failed to fetch'}`);
  }

  if (!response.ok) {
    // Try to extract JSON error message, fallback to raw text
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
      // text is not JSON, use as-is; strip HTML if needed
      if (text.includes('<!DOCTYPE')) message = `Server error ${response.status}: ${response.statusText}`;
    }
    throw new Error(message || `Request failed (${response.status})`);
  }

  // Successful response — parse JSON, handle empty body
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await response.json()) as T;
  }
  const text = await response.text();
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

export const api = {
  // Auth
  login: (credentials: any) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  verifyOtp: (payload: { userId: string; otpCode: string; purpose?: string }) =>
    request('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify(payload) }),
  resendOtp: (payload: { userId: string; purpose?: string }) =>
    request('/api/auth/resend-otp', { method: 'POST', body: JSON.stringify(payload) }),
  forgotPassword: (email: string) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (payload: { userId: string; otpCode: string; newPassword: string }) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  getMe: () => request('/api/auth/me'),
  getUsers: () => request('/api/auth/users'),
  createUser: (user: any) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id: string, user: any) => request(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(user) }),
  deleteUser: (id: string) => request(`/api/auth/users/${id}`, { method: 'DELETE' }),

  // Rooms & Reservations
  getRooms: () => request('/api/rooms'),
  createRoom: (room: any) => request('/api/rooms', { method: 'POST', body: JSON.stringify(room) }),
  updateRoom: (id: string, room: any) => request(`/api/rooms/${id}`, { method: 'PUT', body: JSON.stringify(room) }),
  updateRoomStatus: (id: string, payload: any) => request(`/api/rooms/${id}/status`, { method: 'PUT', body: JSON.stringify(payload) }),
  createRoomType: (roomType: any) => request('/api/room-types', { method: 'POST', body: JSON.stringify(roomType) }),
  updateRoomType: (id: string, roomType: any) => request(`/api/room-types/${id}`, { method: 'PUT', body: JSON.stringify(roomType) }),
  deleteRoomType: (id: string) => request(`/api/room-types/${id}`, { method: 'DELETE' }),
  getReservations: () => request('/api/reservations'),
  createReservation: (res: any) => request('/api/reservations', { method: 'POST', body: JSON.stringify(res) }),
  cancelReservation: (id: string) => request(`/api/reservations/${id}/cancel`, { method: 'POST' }),
  checkIn: (payload: any) => request('/api/check-in', { method: 'POST', body: JSON.stringify(payload) }),
  checkOut: (payload: any) => request('/api/check-out', { method: 'POST', body: JSON.stringify(payload) }),

  // Guests
  getGuests: (query?: string) => request(`/api/guests${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  createGuest: (guest: any) => request('/api/guests', { method: 'POST', body: JSON.stringify(guest) }),
  updateGuest: (id: string, guest: any) => request(`/api/guests/${id}`, { method: 'PUT', body: JSON.stringify(guest) }),
  getGuestHistory: (id: string) => request(`/api/guests/${id}/history`),

  // Inventory
  getInventoryItems: () => request('/api/inventory/items'),
  getInventoryAnalytics: (period: string = 'month') => request(`/api/inventory/analytics?period=${period}`),
  createInventoryItem: (item: any) => request('/api/inventory/items', { method: 'POST', body: JSON.stringify(item) }),
  updateInventoryItem: (id: string, item: any) => request(`/api/inventory/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  deleteInventoryItem: (id: string) => request(`/api/inventory/items/${id}`, { method: 'DELETE' }),
  recordInventoryTransaction: (tx: any) => request('/api/inventory/transactions', { method: 'POST', body: JSON.stringify(tx) }),
  getInventoryTransactions: () => request('/api/inventory/transactions'),
  getStockRequests: () => request('/api/inventory/requests'),
  createStockRequest: (req: any) => request('/api/inventory/requests', { method: 'POST', body: JSON.stringify(req) }),
  reviewStockRequest: (id: string, review: any) => request(`/api/inventory/requests/${id}/review`, { method: 'PUT', body: JSON.stringify(review) }),

  // Menu & Kitchen Chef
  getMenuItems: () => request('/api/menu/items'),
  createMenuItem: (item: any) => request('/api/menu/items', { method: 'POST', body: JSON.stringify(item) }),
  updateMenuItem: (id: string, item: any) => request(`/api/menu/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  deleteMenuItem: (id: string) => request(`/api/menu/items/${id}`, { method: 'DELETE' }),
  updateMenuAvailability: (id: string, payload: { is_available: boolean; deactivation_reason?: string }) =>
    request(`/api/menu/items/${id}/availability`, { method: 'PUT', body: JSON.stringify(payload) }),
  getMenuCategories: () => request('/api/menu/categories'),
  createMenuCategory: (cat: any) => request('/api/menu/categories', { method: 'POST', body: JSON.stringify(cat) }),

  // Orders & Waiter POS
  getOrders: (params?: any) => {
    const query = new URLSearchParams(params || {}).toString();
    return request(`/api/orders${query ? `?${query}` : ''}`);
  },
  getOrder: (id: string) => request(`/api/orders/${id}`),
  createOrder: (order: any) => request('/api/orders', { method: 'POST', body: JSON.stringify(order) }),
  updateOrder: (id: string, order: any) => request(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),
  editOrder: (id: string, order: any) => request(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),
  updateOrderStatus: (id: string, status: string) => request(`/api/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  payOrder: (id: string, payload: any) => request(`/api/orders/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),

  // Kitchen operations
  getKitchenDashboard: () => request('/api/kitchen/dashboard'),
  getKitchenStats: () => request('/api/kitchen/stats'),
  getKitchenOrdersChart: (period: string = 'daily') => request(`/api/kitchen/orders-chart?period=${period}`),
  recordKitchenWaste: (waste: any) => request('/api/kitchen/waste', { method: 'POST', body: JSON.stringify(waste) }),
  getKitchenWaste: () => request('/api/kitchen/waste'),
  recordKitchenUsage: (usage: any) => request('/api/kitchen/usage', { method: 'POST', body: JSON.stringify(usage) }),

  // Housekeeping & Maintenance
  getHousekeepingRooms: () => request('/api/housekeeping/rooms'),
  startCleaning: (roomId: string) => request(`/api/housekeeping/start-cleaning/${roomId}`, { method: 'POST' }),
  completeCleaning: (roomId: string) => request(`/api/housekeeping/complete-cleaning/${roomId}`, { method: 'POST' }),
  markRoomAvailable: (roomId: string) => request(`/api/housekeeping/mark-available/${roomId}`, { method: 'POST' }),
  getMaintenanceTickets: () => request('/api/housekeeping/maintenance'),
  createMaintenanceTicket: (ticket: any) => request('/api/housekeeping/maintenance', { method: 'POST', body: JSON.stringify(ticket) }),
  updateMaintenanceTicket: (id: string, update: any) => request(`/api/housekeeping/maintenance/${id}`, { method: 'PUT', body: JSON.stringify(update) }),

  // Staff & Attendance
  getEmployees: () => request('/api/staff/employees'),
  getShifts: (params?: any) => {
    const query = new URLSearchParams(params || {}).toString();
    return request(`/api/staff/shifts${query ? `?${query}` : ''}`);
  },
  createShift: (shift: any) => request('/api/staff/shifts', { method: 'POST', body: JSON.stringify(shift) }),
  deleteShift: (id: string) => request(`/api/staff/shifts/${id}`, { method: 'DELETE' }),
  getShiftSwaps: () => request('/api/staff/shift-swaps'),
  requestShiftSwap: (swap: any) => request('/api/staff/shift-swaps', { method: 'POST', body: JSON.stringify(swap) }),
  respondShiftSwapTarget: (id: string, action: string) => request(`/api/staff/shift-swaps/${id}/target-respond`, { method: 'PUT', body: JSON.stringify({ action }) }),
  reviewShiftSwapManager: (id: string, action: string) => request(`/api/staff/shift-swaps/${id}/manager-review`, { method: 'PUT', body: JSON.stringify({ action }) }),
  getAttendance: (params?: any) => {
    const query = new URLSearchParams(params || {}).toString();
    return request(`/api/staff/attendance${query ? `?${query}` : ''}`);
  },
  clockIn: (payload?: any) => request('/api/staff/attendance/clock-in', { method: 'POST', body: JSON.stringify(payload || {}) }),
  clockOut: (payload: any) => request('/api/staff/attendance/clock-out', { method: 'POST', body: JSON.stringify(payload) }),

  // Finance & Invoicing
  getFinanceOverview: (period?: string) => request(`/api/finance/overview${period ? `?period=${period}` : ''}`),
  getFinancialOverview: (period?: string) => request(`/api/finance/overview${period ? `?period=${period}` : ''}`),
  getFinanceTrend: (period?: string) => request(`/api/finance/trend${period ? `?period=${period}` : ''}`),
  getInvoices: () => request('/api/finance/invoices'),
  getPayments: () => request('/api/finance/payments'),
  createPayment: (payment: any) => request('/api/finance/payments', { method: 'POST', body: JSON.stringify(payment) }),
  getExpenses: () => request('/api/finance/expenses'),
  createExpense: (expense: any) => request('/api/finance/expenses', { method: 'POST', body: JSON.stringify(expense) }),

  // Reports
  getReportsSummary: (period?: any) => {
    const p = typeof period === 'object' && period ? period.timeframe || period.period : period;
    return request(`/api/reports/summary${p ? `?period=${p}` : ''}`);
  },
  getWaiterDailySummary: () => request('/api/reports/waiter-daily'),
  getReportData: (period?: any) => {
    const p = typeof period === 'object' && period ? period.timeframe || period.period : period;
    return request(`/api/reports/summary${p ? `?period=${p}` : ''}`);
  },

  // Inventory aliases
  adjustStock: (payload: any) => request('/api/inventory/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  updateStockRequestStatus: (id: string, payloadOrStatus: any, notes?: string) => {
    const payload = typeof payloadOrStatus === 'object' ? payloadOrStatus : { status: payloadOrStatus, notes };
    return request(`/api/inventory/requests/${id}/review`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  // Orders aliases
  processOrderPayment: (id: string, payload: any) => request(`/api/orders/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),

  // Staff & Shifts aliases
  updateShiftSwap: (id: string, payloadOrAction: any, notes?: string) => {
    const payload = typeof payloadOrAction === 'object' ? payloadOrAction : { action: payloadOrAction, notes };
    return request(`/api/staff/shift-swaps/${id}/manager-review`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  // System & Logs
  getAuditLogs: (params?: any) => {
    const query = new URLSearchParams(params || {}).toString();
    return request(`/api/system/audit-logs${query ? `?${query}` : ''}`);
  },
  getNotifications: () => request('/api/system/notifications'),
  markNotificationRead: (id: string) => request(`/api/system/notifications/${id}/read`, { method: 'PUT' }),
  markAllNotificationsRead: () => request('/api/system/notifications/mark-all-read', { method: 'PUT' }),
  getSchemaInfo: () => request('/api/system/schema-info'),

  // CMS Settings
  getSettings: () => request('/api/cms/settings'),
  updateSettings: (settings: Record<string, { value: string; description?: string }>) =>
    request('/api/cms/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  deleteSetting: (key: string) =>
    request(`/api/cms/settings/${key}`, { method: 'DELETE' }),
};
