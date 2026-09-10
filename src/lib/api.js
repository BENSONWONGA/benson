const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function buildUrl(path) {
  if (!API_BASE_URL) {
    return path
  }

  return `${API_BASE_URL}${path}`
}

export async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed')
  }

  return payload
}

export async function createCheckoutSession(payload) {
  return request('/api/checkout/session', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchProducts() {
  return request('/api/products')
}
