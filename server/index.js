import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const distDir = path.join(workspaceRoot, 'dist')
const indexFile = path.join(distDir, 'index.html')

const app = express()
const port = Number(process.env.PORT || 3000)
const siteUrl = process.env.SITE_URL || 'http://localhost:5173'
const rawCorsOrigins = process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()).filter(Boolean)

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
    })
  : null

const checkoutSchema = z.object({
  customerEmail: z.string().email().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive().max(10),
        size: z.string().min(1),
        color: z.string().min(1),
      }),
    )
    .min(1),
})

const adminProductSchema = z.object({
  frontend_key: z.number().int().positive(),
  slug: z.string().min(2),
  name: z.string().min(2),
  category: z.string().min(2),
  base_price: z.number().int().positive(),
  rating: z.number().min(0).max(5).default(5),
  pace: z.string().optional().nullable(),
  drop_label: z.string().optional().nullable(),
  detail: z.string().optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  is_active: z.boolean().default(true),
})

function corsOrigin(origin, callback) {
  if (!origin || !rawCorsOrigins?.length || rawCorsOrigins.includes(origin)) {
    callback(null, true)
    return
  }

  callback(new Error(`Origin ${origin} is not allowed`))
}

function assertService(name, service) {
  if (!service) {
    const error = new Error(`${name} is not configured`)
    error.statusCode = 503
    throw error
  }
}

function getBearerToken(request) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length)
}

async function getAuthenticatedUser(request) {
  assertService('Supabase', supabase)

  const token = getBearerToken(request)
  if (!token) {
    return null
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error) {
    error.statusCode = 401
    throw error
  }

  return data.user ?? null
}

async function requireAdmin(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    const error = new Error('Authentication required')
    error.statusCode = 401
    throw error
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error) {
    error.statusCode = 403
    throw error
  }

  if (data.role !== 'admin') {
    const forbidden = new Error('Admin permission required')
    forbidden.statusCode = 403
    throw forbidden
  }

  return user
}

function normalizeProducts(rows) {
  return rows.map((row) => ({
    id: row.frontend_key,
    dbId: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    price: row.base_price / 100,
    price_in_cents: row.base_price,
    rating: Number(row.rating),
    pace: row.pace,
    drop: row.drop_label,
    detail: row.detail,
    image: row.image_url,
    variants:
      row.product_variants?.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        price: variant.price,
        stock_quantity: variant.stock_quantity,
        stripe_price_id: variant.stripe_price_id,
      })) ?? [],
  }))
}

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
)

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  try {
    assertService('Stripe', stripe)

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw Object.assign(new Error('Stripe webhook secret is missing'), { statusCode: 503 })
    }

    const signature = request.headers['stripe-signature']
    const event = stripe.webhooks.constructEvent(
      request.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    )

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const orderId = session.metadata?.order_id

      if (orderId) {
        await supabase
          .from('orders')
          .update({
            status: 'paid',
            payment_status: 'paid',
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: String(session.payment_intent ?? ''),
          })
          .eq('id', orderId)
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object

      if (session.metadata?.order_id) {
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            payment_status: 'failed',
            stripe_checkout_session_id: session.id,
          })
          .eq('id', session.metadata.order_id)
      }
    }

    response.json({ received: true })
  } catch (error) {
    response.status(error.statusCode || 400).json({
      error: error.message || 'Webhook handling failed',
    })
  }
})

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    supabase: Boolean(supabase),
    stripe: Boolean(stripe),
    time: new Date().toISOString(),
  })
})

app.get('/api/products', async (_request, response) => {
  try {
    assertService('Supabase', supabase)

    const { data, error } = await supabase
      .from('products')
      .select(
        `
          id,
          frontend_key,
          slug,
          name,
          category,
          base_price,
          currency,
          rating,
          pace,
          drop_label,
          detail,
          image_url,
          product_variants (
            id,
            sku,
            color,
            size,
            price,
            stock_quantity,
            stripe_price_id
          )
        `,
      )
      .eq('is_active', true)
      .order('frontend_key')

    if (error) {
      throw error
    }

    response.json({
      products: normalizeProducts(data ?? []),
    })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch products',
    })
  }
})

app.get('/api/account/profile', async (request, response) => {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      response.status(401).json({
        error: 'Authentication required',
      })
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at, updated_at')
      .eq('id', user.id)
      .single()

    if (error) {
      throw error
    }

    response.json({ profile: data })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch profile',
    })
  }
})

app.get('/api/account/orders', async (request, response) => {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      response.status(401).json({
        error: 'Authentication required',
      })
      return
    }

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
          id,
          customer_email,
          status,
          payment_status,
          subtotal,
          shipping,
          total,
          created_at,
          order_items (
            product_name,
            sku,
            color,
            size,
            quantity,
            unit_price,
            line_total
          )
        `,
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    response.json({ orders: data ?? [] })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch account orders',
    })
  }
})

app.post('/api/checkout/session', async (request, response) => {
  try {
    assertService('Supabase', supabase)
    assertService('Stripe', stripe)

    const payload = checkoutSchema.parse(request.body)
    const user = await getAuthenticatedUser(request)

    const productIds = [...new Set(payload.items.map((item) => item.productId))]
    const { data, error } = await supabase
      .from('products')
      .select(
        `
          id,
          frontend_key,
          name,
          category,
          base_price,
          product_variants (
            id,
            sku,
            color,
            size,
            price,
            stock_quantity
          )
        `,
      )
      .in('frontend_key', productIds)
      .eq('is_active', true)

    if (error) {
      throw error
    }

    const productMap = new Map((data ?? []).map((item) => [item.frontend_key, item]))
    const lineItems = payload.items.map((item) => {
      const product = productMap.get(item.productId)
      if (!product) {
        throw Object.assign(new Error(`Product ${item.productId} does not exist`), { statusCode: 400 })
      }

      const variant = product.product_variants.find(
        (entry) => entry.size === item.size && entry.color === item.color,
      )

      if (!variant) {
        throw Object.assign(
          new Error(`Variant ${item.productId}/${item.color}/${item.size} does not exist`),
          { statusCode: 400 },
        )
      }

      if (variant.stock_quantity < item.quantity) {
        throw Object.assign(new Error(`Insufficient stock for ${product.name}`), { statusCode: 400 })
      }

      return {
        quantity: item.quantity,
        product,
        variant,
        lineTotal: variant.price * item.quantity,
      }
    })

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
    const shipping = subtotal >= 69900 ? 0 : 2400
    const total = subtotal + shipping
    const customerEmail = payload.customerEmail || user?.email

    if (!customerEmail) {
      throw Object.assign(new Error('Customer email is required to create a checkout session'), {
        statusCode: 400,
      })
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user?.id ?? null,
        customer_email: customerEmail,
        subtotal,
        shipping,
        total,
        currency: 'cny',
      })
      .select('id')
      .single()

    if (orderError) {
      throw orderError
    }

    const { error: itemsError } = await supabase.from('order_items').insert(
      lineItems.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        variant_id: item.variant.id,
        product_name: item.product.name,
        sku: item.variant.sku,
        color: item.variant.color,
        size: item.variant.size,
        unit_price: item.variant.price,
        quantity: item.quantity,
        line_total: item.lineTotal,
      })),
    )

    if (itemsError) {
      throw itemsError
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      success_url: `${siteUrl}/?checkout=success&order=${order.id}`,
      cancel_url: `${siteUrl}/?checkout=cancelled&order=${order.id}`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'SG', 'JP'],
      },
      metadata: {
        order_id: order.id,
      },
      line_items: lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'cny',
          unit_amount: item.variant.price,
          product_data: {
            name: item.product.name,
            metadata: {
              product_id: item.product.id,
              variant_id: item.variant.id,
              size: item.variant.size,
              color: item.variant.color,
            },
          },
        },
      })),
    })

    await supabase
      .from('orders')
      .update({
        stripe_checkout_session_id: session.id,
      })
      .eq('id', order.id)

    response.json({
      orderId: order.id,
      url: session.url,
    })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to create checkout session',
    })
  }
})

app.get('/api/admin/orders', async (request, response) => {
  try {
    await requireAdmin(request)

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
          id,
          customer_email,
          status,
          payment_status,
          subtotal,
          shipping,
          total,
          created_at,
          order_items (
            product_name,
            sku,
            color,
            size,
            quantity,
            unit_price,
            line_total
          )
        `,
      )
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    response.json({ orders: data ?? [] })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch orders',
    })
  }
})

app.get('/api/admin/products', async (request, response) => {
  try {
    await requireAdmin(request)

    const { data, error } = await supabase
      .from('products')
      .select(
        `
          id,
          frontend_key,
          slug,
          name,
          category,
          base_price,
          rating,
          pace,
          drop_label,
          detail,
          image_url,
          is_active,
          product_variants (
            id,
            sku,
            color,
            size,
            price,
            stock_quantity,
            stripe_price_id
          )
        `,
      )
      .order('frontend_key')

    if (error) {
      throw error
    }

    response.json({ products: normalizeProducts(data ?? []) })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to fetch admin products',
    })
  }
})

app.post('/api/admin/products', async (request, response) => {
  try {
    await requireAdmin(request)

    const payload = adminProductSchema.parse(request.body)
    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    response.status(201).json({ product: data })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to create product',
    })
  }
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/.*/, (_request, response, next) => {
    if (!fs.existsSync(indexFile)) {
      next()
      return
    }

    response.sendFile(indexFile)
  })
}

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`)
})
