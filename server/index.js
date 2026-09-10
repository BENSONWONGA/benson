import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const distDir = path.join(workspaceRoot, 'dist')
const distIndexFile = path.join(distDir, 'index.html')
const rootAssetsDir = path.join(workspaceRoot, 'assets')
const rootIndexFile = path.join(workspaceRoot, 'index.html')
const rootFaviconFile = path.join(workspaceRoot, 'favicon.svg')

const app = express()
const port = Number(process.env.PORT || 3000)
const siteUrl = process.env.SITE_URL || 'http://localhost:5173'
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-media'
const rawCorsOrigins = process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()).filter(Boolean)
const supportedImageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

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

const adminProductUpdateSchema = adminProductSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one product field is required')

const adminOrderUpdateSchema = z
  .object({
    status: z.enum(['pending', 'paid', 'cancelled', 'fulfilled']).optional(),
    payment_status: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
    notes: z.string().max(1000).optional().nullable(),
    shipping_carrier: z.string().max(120).optional().nullable(),
    tracking_number: z.string().max(120).optional().nullable(),
    shipped_at: z.string().datetime().optional().nullable(),
    fulfilled_at: z.string().datetime().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one order field is required')

const adminVariantSchema = z.object({
  sku: z.string().min(2),
  color: z.string().min(1),
  size: z.string().min(1),
  price: z.number().int().positive(),
  stock_quantity: z.number().int().min(0).default(0),
  stripe_price_id: z.string().optional().nullable(),
})

const adminVariantUpdateSchema = adminVariantSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one variant field is required')

const adminMediaUploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataUrl: z.string().min(50),
})

let storageBucketReadyPromise = null

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
    is_active: row.is_active,
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

async function ensureStorageBucket() {
  assertService('Supabase', supabase)

  if (!storageBucketReadyPromise) {
    storageBucketReadyPromise = (async () => {
      const { data, error } = await supabase.storage.listBuckets()
      if (error) {
        throw error
      }

      const exists = data?.some((bucket) => bucket.name === storageBucket)
      if (exists) {
        return
      }

      const { error: createError } = await supabase.storage.createBucket(storageBucket, {
        public: true,
        fileSizeLimit: '5MB',
        allowedMimeTypes: Object.keys(supportedImageTypes),
      })

      if (createError) {
        throw createError
      }
    })().catch((error) => {
      storageBucketReadyPromise = null
      throw error
    })
  }

  return storageBucketReadyPromise
}

function parseDataUrl(dataUrl, contentType) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw Object.assign(new Error('Invalid image payload'), { statusCode: 400 })
  }

  const [, declaredType, encoded] = match
  if (declaredType !== contentType || !(contentType in supportedImageTypes)) {
    throw Object.assign(new Error('Unsupported image format'), { statusCode: 400 })
  }

  const buffer = Buffer.from(encoded, 'base64')
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw Object.assign(new Error('Image must be smaller than 5MB'), { statusCode: 400 })
  }

  return buffer
}

function normalizeStripeAddress(details, fallbackEmail = null) {
  const address = details?.address
  const normalized = {
    name: details?.name ?? null,
    phone: details?.phone ?? null,
    email: details?.email ?? fallbackEmail ?? null,
    line1: address?.line1 ?? null,
    line2: address?.line2 ?? null,
    city: address?.city ?? null,
    state: address?.state ?? null,
    postal_code: address?.postal_code ?? null,
    country: address?.country ?? null,
  }

  return Object.values(normalized).some(Boolean) ? normalized : null
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
    assertService('Supabase', supabase)

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
        const shippingAddress = normalizeStripeAddress(
          session.shipping_details,
          session.customer_details?.email ?? session.customer_email ?? null,
        )
        const billingAddress = normalizeStripeAddress(
          session.customer_details,
          session.customer_email ?? null,
        )

        const { error } = await supabase.rpc('mark_order_paid', {
          order_uuid: orderId,
          checkout_session_id_input: session.id,
          payment_intent_id_input: String(session.payment_intent ?? ''),
          shipping_address_input: shippingAddress,
          billing_address_input: billingAddress,
        })

        if (error) {
          throw error
        }
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
          .neq('payment_status', 'paid')
      }
    }

    response.json({ received: true })
  } catch (error) {
    response.status(error.statusCode || 400).json({
      error: error.message || 'Webhook handling failed',
    })
  }
})

app.use(express.json({ limit: '10mb' }))

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
          shipping_carrier,
          tracking_number,
          shipped_at,
          fulfilled_at,
          shipping_address,
          billing_address,
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
          shipping_carrier,
          tracking_number,
          shipped_at,
          fulfilled_at,
          shipping_address,
          billing_address,
          subtotal,
          shipping,
          total,
          created_at,
          shipping_carrier,
          tracking_number,
          shipped_at,
          fulfilled_at,
          notes,
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

app.patch('/api/admin/products/:productId', async (request, response) => {
  try {
    await requireAdmin(request)

    const productId = z.string().uuid().parse(request.params.productId)
    const payload = adminProductUpdateSchema.parse(request.body)
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', productId)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    response.json({ product: data })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to update product',
    })
  }
})

app.patch('/api/admin/orders/:orderId', async (request, response) => {
  try {
    await requireAdmin(request)

    const orderId = z.string().uuid().parse(request.params.orderId)
    const payload = adminOrderUpdateSchema.parse(request.body)
    const { data, error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId)
      .select(
        'id, status, payment_status, notes, shipping_carrier, tracking_number, shipped_at, fulfilled_at, updated_at',
      )
      .single()

    if (error) {
      throw error
    }

    response.json({ order: data })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to update order',
    })
  }
})

app.post('/api/admin/products/:productId/variants', async (request, response) => {
  try {
    await requireAdmin(request)

    const productId = z.string().uuid().parse(request.params.productId)
    const payload = adminVariantSchema.parse(request.body)
    const { data, error } = await supabase
      .from('product_variants')
      .insert({
        product_id: productId,
        ...payload,
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    response.status(201).json({ variant: data })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to create product variant',
    })
  }
})

app.patch('/api/admin/variants/:variantId', async (request, response) => {
  try {
    await requireAdmin(request)

    const variantId = z.string().uuid().parse(request.params.variantId)
    const payload = adminVariantUpdateSchema.parse(request.body)
    const { data, error } = await supabase
      .from('product_variants')
      .update(payload)
      .eq('id', variantId)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    response.json({ variant: data })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to update product variant',
    })
  }
})

app.post('/api/admin/media/upload', async (request, response) => {
  try {
    await requireAdmin(request)

    const payload = adminMediaUploadSchema.parse(request.body)
    await ensureStorageBucket()

    const buffer = parseDataUrl(payload.dataUrl, payload.contentType)
    const extension = supportedImageTypes[payload.contentType]
    const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '-')
    const stem = safeName.replace(/\.[^.]+$/, '') || 'product-image'
    const filePath = `products/${new Date().toISOString().slice(0, 10)}/${stem}-${randomUUID()}.${extension}`

    const { error } = await supabase.storage.from(storageBucket).upload(filePath, buffer, {
      contentType: payload.contentType,
      cacheControl: '3600',
      upsert: false,
    })

    if (error) {
      throw error
    }

    const { data } = supabase.storage.from(storageBucket).getPublicUrl(filePath)

    response.status(201).json({
      url: data.publicUrl,
      bucket: storageBucket,
      path: filePath,
    })
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || 'Failed to upload product image',
    })
  }
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/.*/, (_request, response, next) => {
    if (!fs.existsSync(distIndexFile)) {
      next()
      return
    }

    response.sendFile(distIndexFile)
  })
} else if (fs.existsSync(rootIndexFile)) {
  if (fs.existsSync(rootAssetsDir)) {
    app.use('/assets', express.static(rootAssetsDir))
  }

  if (fs.existsSync(rootFaviconFile)) {
    app.get('/favicon.svg', (_request, response) => {
      response.sendFile(rootFaviconFile)
    })
  }

  app.get(/.*/, (_request, response) => {
    response.sendFile(rootIndexFile)
  })
}

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`)
})
