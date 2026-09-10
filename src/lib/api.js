const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function buildUrl(path) {
  if (!API_BASE_URL) {
    return path
  }

  return `${API_BASE_URL}${path}`
}

function createHeaders(options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }

  return headers
}

export async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    ...options,
    headers: createHeaders(options),
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed')
  }

  return payload
}

export async function createCheckoutSession(payload, accessToken) {
  return request('/api/checkout/session', {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  })
}

export async function fetchProducts() {
  return request('/api/products')
}

export async function fetchAccountProfile(accessToken) {
  return request('/api/account/profile', {
    accessToken,
  })
}

export async function fetchAccountOrders(accessToken) {
  return request('/api/account/orders', {
    accessToken,
  })
}

export async function fetchAdminProducts(accessToken) {
  return request('/api/admin/products', {
    accessToken,
  })
}

export async function fetchAdminOrders(accessToken) {
  return request('/api/admin/orders', {
    accessToken,
  })
}

export async function createAdminProduct(payload, accessToken) {
  return request('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  })
}

export async function updateAdminProduct(productId, payload, accessToken) {
  return request(`/api/admin/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    accessToken,
  })
}

export async function updateAdminOrder(orderId, payload, accessToken) {
  return request(`/api/admin/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    accessToken,
  })
}

export async function createAdminVariant(productId, payload, accessToken) {
  return request(`/api/admin/products/${productId}/variants`, {
    method: 'POST',
    body: JSON.stringify(payload),
    accessToken,
  })
}

export async function updateAdminVariant(variantId, payload, accessToken) {
  return request(`/api/admin/variants/${variantId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    accessToken,
  })
}
