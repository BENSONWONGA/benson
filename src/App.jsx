import { useEffect, useMemo, useState } from 'react'
import {
  createAdminProduct,
  createAdminVariant,
  createCheckoutSession,
  fetchAccountOrders,
  fetchAccountProfile,
  fetchAdminOrders,
  fetchAdminProducts,
  fetchProducts,
  updateAdminOrder,
  updateAdminProduct,
  updateAdminVariant,
} from './lib/api'
import { supabase } from './lib/supabase'

const imageUrl = (prompt, imageSize = 'landscape_16_9') =>
  `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt,
  )}&image_size=${imageSize}`

const fallbackPalettes = {
  heroLeft: {
    start: '#171717',
    end: '#3d3d3d',
    accent: '#ff7a3d',
    accentSoft: '#ffb489',
    line: 'rgba(255,255,255,0.08)',
  },
  heroRight: {
    start: '#d9d5ce',
    end: '#bab2a5',
    accent: '#1f1f1f',
    accentSoft: '#ff7a3d',
    line: 'rgba(0,0,0,0.08)',
  },
  category: {
    start: '#ece7de',
    end: '#d7d1c6',
    accent: '#111111',
    accentSoft: '#ff7a3d',
    line: 'rgba(0,0,0,0.08)',
  },
  product: {
    start: '#f4f4f4',
    end: '#e8e8e8',
    accent: '#101010',
    accentSoft: '#cfcfcf',
    line: 'rgba(0,0,0,0.08)',
  },
  editorial: {
    start: '#e5e0d8',
    end: '#cec7bc',
    accent: '#151515',
    accentSoft: '#ff7a3d',
    line: 'rgba(0,0,0,0.08)',
  },
  social: {
    start: '#efefef',
    end: '#dfdfdf',
    accent: '#111111',
    accentSoft: '#bcbcbc',
    line: 'rgba(0,0,0,0.08)',
  },
}

const fallbackCache = new Map()

function createFallbackImage(title, variant = 'product') {
  const cacheKey = `${variant}:${title}`
  const cached = fallbackCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const palette = fallbackPalettes[variant] ?? fallbackPalettes.product
  const safeTitle = String(title)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const subtitle =
    variant === 'heroLeft'
      ? 'WORK BOOT EDITORIAL'
      : variant === 'heroRight'
        ? 'LIFESTYLE SCENE'
        : variant === 'category'
          ? 'COLLECTION'
          : variant === 'editorial'
            ? 'FIELD NOTES'
            : variant === 'social'
              ? 'COMMUNITY'
              : 'PRODUCT PREVIEW'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="${safeTitle}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" />
      <g opacity="0.85">
        <circle cx="960" cy="168" r="130" fill="${palette.accentSoft}" opacity="0.22" />
        <circle cx="170" cy="720" r="160" fill="${palette.accentSoft}" opacity="0.14" />
      </g>
      <g stroke="${palette.line}" stroke-width="2" fill="none">
        <path d="M0 160h1200M0 510h1200M240 0v900M780 0v900" />
        <path d="M0 760c160-70 318-100 478-92c147 7 285 44 442 114c85 38 178 63 280 74" />
      </g>
      <g transform="translate(144 188)">
        <rect x="0" y="0" width="440" height="300" rx="30" fill="rgba(255,255,255,0.06)" />
        <path d="M48 228c52-8 118-16 179-9c66 7 124 27 174 54h112v45H32c-6-41 5-73 16-90z" fill="${palette.accent}" opacity="0.92" />
        <path d="M187 166c58-34 125-52 170-45c39 6 56 26 58 58c2 25-9 49-32 71l-32-20c14-17 18-34 11-50c-7-16-26-24-59-23c-37 1-86 15-139 40l23-31z" fill="${palette.accentSoft}" opacity="0.74" />
        <rect x="246" y="238" width="34" height="46" rx="12" fill="${palette.end}" opacity="0.86" />
        <rect x="314" y="244" width="34" height="40" rx="12" fill="${palette.end}" opacity="0.86" />
      </g>
      <g transform="translate(144 664)">
        <text x="0" y="0" fill="${palette.accent}" font-size="28" font-family="Arial, Helvetica, sans-serif" letter-spacing="5">${subtitle}</text>
        <text x="0" y="62" fill="${palette.accent}" font-size="76" font-weight="700" font-family="Arial, Helvetica, sans-serif">${safeTitle}</text>
      </g>
    </svg>
  `

  const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  fallbackCache.set(cacheKey, dataUri)
  return dataUri
}

function SmartImage({ src, alt, variant = 'product', className }) {
  const [currentSrc, setCurrentSrc] = useState(src)

  useEffect(() => {
    setCurrentSrc(src)
  }, [src])

  const fallbackSrc = useMemo(() => createFallbackImage(alt, variant), [alt, variant])

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        setCurrentSrc((value) => (value === fallbackSrc ? value : fallbackSrc))
      }}
    />
  )
}

const heroSlides = [
  {
    id: 1,
    eyebrow: 'EARLY BIRD OFFER',
    title: 'GEOPILOT WORKNANO STEP',
    subtitle:
      'MORE GRIP, MORE CUSHION, AND MORE SUPPORT FOR LONG SHIFTS ON HARD INDOOR FLOORS.',
    body: 'EARLY BIRD OFFER. SHOP NOW.',
    cta: 'SHOP NOW',
    leftImage: imageUrl(
      'premium ecommerce hero photo of two rugged black and orange work boots placed on an auto repair shop floor, full boots clearly visible, gritty industrial garage lighting, realistic product campaign photography, no text',
      'landscape_16_9',
    ),
    rightImage: imageUrl(
      'realistic mechanic sitting in an auto repair workshop tying rugged black and orange work boots, wider scene with tool wall and fluorescent shop lights, authentic industrial ecommerce campaign photo, no text',
      'landscape_16_9',
    ),
  },
  {
    id: 2,
    eyebrow: 'HOT PICKS',
    title: 'CITY HIKE ESSENTIALS',
    subtitle: 'LIGHTWEIGHT TRACTION FOR WEEKEND TRAILS, DAILY COMMUTES, AND SUMMER ESCAPES.',
    body: 'Explore trail-ready shoes with a cleaner iOS-like interface layered onto a familiar commerce skeleton.',
    cta: 'EXPLORE NOW',
    leftImage: imageUrl(
      'premium hiking shoe closeup on rock surface, black and tan outdoor sneaker product campaign, crisp daylight, no text',
      'landscape_16_9',
    ),
    rightImage: imageUrl(
      'woman and man walking outdoors in premium hiking shoes, modern adventure fashion editorial, bright summer day, no text',
      'landscape_16_9',
    ),
  },
  {
    id: 3,
    eyebrow: 'ALL TERRAIN',
    title: 'FIELD READY TACTICAL',
    subtitle: 'STABLE, LIGHTWEIGHT, AND READY FOR FAST MOVEMENT ACROSS MIXED TERRAIN.',
    body: 'A more faithful nortiv8-style homepage rhythm, refined with restrained translucent UI touches.',
    cta: 'VIEW COLLECTION',
    leftImage: imageUrl(
      'premium tactical boot product photo on dark textured surface, black outdoor boot with subtle orange accents, no text',
      'landscape_16_9',
    ),
    rightImage: imageUrl(
      'man outdoors crouching in tactical boots on rocky terrain, premium rugged footwear lifestyle campaign, no text',
      'landscape_16_9',
    ),
  },
]

const categories = [
  {
    title: 'WORK BOOTS',
    caption: 'Hard work starts here',
    image: imageUrl(
      'premium work boot lifestyle image, delivery worker stepping off truck in clean urban scene, stylish rugged boots, editorial ecommerce photo',
      'portrait_4_3',
    ),
  },
  {
    title: 'MILITARY BOOTS',
    caption: 'Everyday. Tactical. Ready',
    image: imageUrl(
      'premium tactical boots lifestyle image, athletic person climbing rope outdoors, modern military boots, crisp adventure fashion campaign',
      'portrait_4_3',
    ),
  },
  {
    title: 'HIKING BOOTS',
    caption: 'Trail-ready support',
    image: imageUrl(
      'premium hiking boots lifestyle image, man and woman walking in city to trail transition, elevated outdoor fashion photography',
      'portrait_4_3',
    ),
  },
  {
    title: 'HIKING SHOES',
    caption: 'Lightweight all-day wear',
    image: imageUrl(
      'premium hiking shoes lifestyle image, photographer crouching on alpine overlook, sleek outdoor shoes, refined retail editorial style',
      'portrait_4_3',
    ),
  },
]

const pressMentions = [
  {
    outlet: 'BUZZFEED',
    quote: '"If you do not know about these boots yet, let this be your wake-up call."',
  },
  {
    outlet: 'TRAVEL + LEISURE',
    quote: '"I pack these waterproof boots for the comfort and durability."',
  },
  {
    outlet: "MEN'S JOURNAL",
    quote: '"Thousands of five-star ratings make them easy to shortlist."',
  },
  {
    outlet: 'HUFFPOST',
    quote: '"They last as long and feel as reliable as options priced much higher."',
  },
]

const storyCards = [
  {
    title: 'Hard Work Starts Here',
    body: 'Built for long shifts and all-day comfort.',
    cta: 'SHOP NOW',
    image: imageUrl(
      'realistic worker standing beside truck wearing rugged work boots, street level ecommerce lifestyle photo, no text',
      'landscape_4_3',
    ),
  },
  {
    title: 'Everyday. Tactical. Ready',
    body: 'Fast movement, everyday support, and tactical wear.',
    cta: 'SHOP NOW',
    image: imageUrl(
      'realistic person climbing rope in tactical boots, outdoor training lifestyle image, no text',
      'landscape_4_3',
    ),
  },
]

const categoryRail = ['WORKING', 'TACTICAL', 'HIKING', 'HIKING SUMMER', 'MEN', 'WOMEN']

const membershipOffers = [
  {
    title: 'SAVE UP TO 20% OFF',
    body: 'Join us for free and unlock exclusive benefits.',
    cta: 'SIGN UP NOW',
  },
  {
    title: 'GET UP TO 20% OFF',
    body: 'Member-exclusive styles and early access to new drops.',
    cta: 'GET REWARDS',
  },
]

const defaultSizeOptions = ['40', '41', '42', '43', '44']

const seedProducts = [
  {
    id: 1,
    name: 'Aether Ridge GTX',
    category: 'HIKING BOOTS',
    price: 899,
    rating: 4.9,
    pace: '防水山地',
    drop: 'Vibram Lite',
    colors: ['冰川银', '玄岩黑', '沙岩灰'],
    image: imageUrl(
      'premium hiking boot product render, silver gray waterproof boot with sculpted sole, isolated on translucent frosted background, luxury ecommerce lighting',
      'square_hd',
    ),
    detail: '面向高频徒步与城市通勤的混合型靴款，兼顾防护、轻量和利落轮廓。',
  },
  {
    id: 2,
    name: 'Urban Traverse Lite',
    category: 'HIKING SHOES',
    price: 769,
    rating: 4.8,
    pace: '轻徒步 / 通勤',
    drop: 'Flex Shell',
    colors: ['雾蓝灰', '星云白', '夜幕黑'],
    image: imageUrl(
      'premium outdoor sneaker product render, sleek pale blue hiking shoe with translucent sole details, isolated ecommerce image, clean luxury lighting',
      'square_hd',
    ),
    detail: '更适合城市移动与周末短途，鞋型更轻，更符合 iOS 风格页面里的精致表达。',
  },
  {
    id: 3,
    name: 'Worknova Shield',
    category: 'WORK BOOTS',
    price: 999,
    rating: 4.7,
    pace: '工装稳定',
    drop: 'Shock Guard',
    colors: ['棕褐', '黑曜', '雾卡其'],
    image: imageUrl(
      'premium work boot product render, structured tan utility boot with high ankle support, isolated on soft frosted glass background, high end ecommerce photo',
      'square_hd',
    ),
    detail: '强调全天稳定与抗冲击表现，适合把功能型鞋款做成更高级的品牌展示。',
  },
  {
    id: 4,
    name: 'Vapor Trail Shell',
    category: 'MILITARY BOOTS',
    price: 859,
    rating: 4.8,
    pace: '机能训练',
    drop: 'Grip Core',
    colors: ['曜石黑', '军绿灰', '风暴棕'],
    image: imageUrl(
      'premium tactical boot product render, modern black lightweight combat boot with refined design, isolated on elegant translucent background, premium retail style',
      'square_hd',
    ),
    detail: '更偏机能审美的户外战术靴，用于强化品牌辨识度和男装线条感。',
  },
]

const seedProductMap = new Map(seedProducts.map((product) => [product.id, product]))

const blogPosts = [
  {
    tag: 'CAMPING GUIDE',
    title: '6 Best Shoes For Camping',
    body: 'Comfort, traction, and weather-ready support for long days outdoors.',
    image: imageUrl(
      'realistic camping footwear editorial image, rugged boots beside tent and outdoor gear, ecommerce blog style, no text',
      'landscape_4_3',
    ),
  },
  {
    tag: 'FIT GUIDE',
    title: 'How To Choose Hiking Boots',
    body: 'What to look for in weight, protection, waterproofing, and grip.',
    image: imageUrl(
      'realistic hiking boot guide editorial image, outdoor boots on trail map and gear, ecommerce blog style, no text',
      'landscape_4_3',
    ),
  },
  {
    tag: 'TACTICAL EDIT',
    title: '7 Black Tactical Boots For Men',
    body: 'Extra protection, comfort, and durability for hard-use situations.',
    image: imageUrl(
      'realistic tactical boot editorial image, black boots with outdoor field gear, ecommerce blog style, no text',
      'landscape_4_3',
    ),
  },
]

const socialGallery = [
  {
    id: 1,
    handle: '@NORTIV8',
    caption: 'Trail crew',
    image: imageUrl(
      'premium footwear social media lifestyle image 1, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography',
      'square',
    ),
  },
  {
    id: 2,
    handle: '@NORTIV8',
    caption: 'Camp tested',
    image: imageUrl(
      'premium footwear social media lifestyle image 2, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography',
      'square',
    ),
  },
  {
    id: 3,
    handle: '@NORTIV8',
    caption: 'Daily miles',
    image: imageUrl(
      'premium footwear social media lifestyle image 3, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography',
      'square',
    ),
  },
  {
    id: 4,
    handle: '@NORTIV8',
    caption: 'Field ready',
    image: imageUrl(
      'premium footwear social media lifestyle image 4, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography',
      'square',
    ),
  },
  {
    id: 5,
    handle: '@NORTIV8',
    caption: 'Weekend hike',
    image: imageUrl(
      'premium footwear social media lifestyle image 5, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography',
      'square',
    ),
  },
  {
    id: 6,
    handle: '@NORTIV8',
    caption: 'New drop',
    image: imageUrl(
      'premium footwear social media lifestyle image 6, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography',
      'square',
    ),
  },
]

const navItems = ['WORKING', 'TACTICAL', 'HIKING', 'SUMMER', 'MEN', 'WOMEN']
const adminOrderStatusOptions = ['pending', 'paid', 'cancelled', 'fulfilled']
const adminPaymentStatusOptions = ['pending', 'paid', 'failed', 'refunded']
const emptyAdminProductForm = {
  frontend_key: '',
  slug: '',
  name: '',
  category: '',
  base_price: '',
  rating: '5',
  pace: '',
  drop_label: '',
  detail: '',
  image_url: '',
  is_active: true,
}
const emptyAdminVariantForm = {
  sku: '',
  color: '',
  size: '',
  price: '',
  stock_quantity: '0',
  stripe_price_id: '',
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeProduct(product) {
  const seed = seedProductMap.get(product.id)
  const variants = product.variants ?? []
  const colors = uniqueValues(variants.map((item) => item.color))
  const sizes = uniqueValues(variants.map((item) => item.size))

  return {
    ...seed,
    ...product,
    pace: product.pace || seed?.pace || 'All Day Comfort',
    drop: product.drop || seed?.drop || 'Outdoor Core',
    detail: product.detail || seed?.detail || 'Built for daily movement and outdoor use.',
    image: product.image || seed?.image,
    is_active: product.is_active ?? seed?.is_active ?? true,
    colors: colors.length > 0 ? colors : seed?.colors || ['Default'],
    sizes: sizes.length > 0 ? sizes : seed?.sizes || defaultSizeOptions,
  }
}

function getVariant(product, size, color) {
  return product?.variants?.find((item) => item.size === size && item.color === color) ?? null
}

function getDefaultOption(product) {
  const variant = product?.variants?.[0] ?? null
  return {
    size: variant?.size || product?.sizes?.[0] || defaultSizeOptions[0],
    color: variant?.color || product?.colors?.[0] || 'Default',
  }
}

function getUnitPrice(product, size, color) {
  const variant = getVariant(product, size, color)
  if (variant?.price) {
    return variant.price / 100
  }

  return product?.price ?? 0
}

function formatPrice(value) {
  return `¥${Math.round(value)}`
}

function formatPriceFromCents(value) {
  return formatPrice((value ?? 0) / 100)
}

function formatDate(value) {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toAdminProductForm(product) {
  return {
    frontend_key: String(product.id ?? ''),
    slug: product.slug ?? '',
    name: product.name ?? '',
    category: product.category ?? '',
    base_price: String(product.price ?? ''),
    rating: String(product.rating ?? 5),
    pace: product.pace ?? '',
    drop_label: product.drop ?? '',
    detail: product.detail ?? '',
    image_url: product.image ?? '',
    is_active: product.is_active ?? true,
  }
}

function toAdminVariantForm(variant) {
  return {
    sku: variant?.sku ?? '',
    color: variant?.color ?? '',
    size: variant?.size ?? '',
    price: String(((variant?.price ?? 0) / 100) || ''),
    stock_quantity: String(variant?.stock_quantity ?? 0),
    stripe_price_id: variant?.stripe_price_id ?? '',
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0a7 7 0 0114 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8a4 4 0 000 8z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5s-7-4.35-7-10.2A4.3 4.3 0 019.3 6a4.8 4.8 0 012.7 1.05A4.8 4.8 0 0114.7 6A4.3 4.3 0 0119 10.3c0 5.85-7 10.2-7 10.2z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 8h12l-1 11H7L6 8zm3-1a3 3 0 116 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ArrowIcon({ direction = 'right' }) {
  const rotation = direction === 'left' ? 'rotate(180 12 12)' : undefined
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform={rotation}>
        <path
          d="M5 12h14m-5-5l5 5l-5 5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </g>
    </svg>
  )
}

function App() {
  const [activeView, setActiveView] = useState('home')
  const [activeSlide, setActiveSlide] = useState(0)
  const [catalogProducts, setCatalogProducts] = useState(() => seedProducts.map(normalizeProduct))
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsFeedback, setProductsFeedback] = useState('')
  const [selectedProductId, setSelectedProductId] = useState(seedProducts[1]?.id ?? seedProducts[0].id)
  const [selectedSize, setSelectedSize] = useState('42')
  const [selectedColor, setSelectedColor] = useState(seedProducts[1]?.colors?.[0] ?? seedProducts[0].colors[0])
  const [customerEmail, setCustomerEmail] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutFeedback, setCheckoutFeedback] = useState('')
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberOrders, setMemberOrders] = useState([])
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountFeedback, setAccountFeedback] = useState('')
  const [authMode, setAuthMode] = useState('signin')
  const [authLoading, setAuthLoading] = useState(false)
  const [authFeedback, setAuthFeedback] = useState('')
  const [authForm, setAuthForm] = useState({
    fullName: '',
    email: '',
    password: '',
  })
  const [adminProducts, setAdminProducts] = useState([])
  const [adminOrders, setAdminOrders] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminFeedback, setAdminFeedback] = useState('')
  const [adminProductForm, setAdminProductForm] = useState(emptyAdminProductForm)
  const [adminEditingProductId, setAdminEditingProductId] = useState('')
  const [adminProductSaving, setAdminProductSaving] = useState(false)
  const [adminVariantForm, setAdminVariantForm] = useState(emptyAdminVariantForm)
  const [adminEditingVariantId, setAdminEditingVariantId] = useState('')
  const [adminVariantSaving, setAdminVariantSaving] = useState(false)
  const [adminOrderSavingId, setAdminOrderSavingId] = useState('')
  const [adminOrderDrafts, setAdminOrderDrafts] = useState({})
  const [cartItems, setCartItems] = useState([
    {
      productId: 2,
      size: '42',
      color: '雾蓝灰',
      quantity: 1,
    },
  ])

  const hero = heroSlides[activeSlide]
  const selectedProduct = useMemo(
    () => catalogProducts.find((item) => item.id === selectedProductId) ?? catalogProducts[0],
    [catalogProducts, selectedProductId],
  )
  const accessToken = session?.access_token ?? null
  const isAdmin = profile?.role === 'admin'
  const accountTitle = profile?.full_name || session?.user?.email?.split('@')[0] || 'Account'

  const cartSummary = useMemo(() => {
    const lineItems = cartItems.map((item) => {
      const product = catalogProducts.find((entry) => entry.id === item.productId)
      const unitPrice = getUnitPrice(product, item.size, item.color)

      return {
        ...item,
        product,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      }
    })
    const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0)
    const shipping = subtotal >= 699 ? 0 : subtotal > 0 ? 24 : 0
    return {
      lineItems,
      subtotal,
      shipping,
      total: subtotal + shipping,
    }
  }, [cartItems, catalogProducts])

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const adminRevenue = useMemo(
    () => adminOrders.reduce((sum, item) => sum + (item.total || 0), 0),
    [adminOrders],
  )
  const editingAdminProduct = useMemo(
    () => adminProducts.find((item) => item.dbId === adminEditingProductId) ?? null,
    [adminEditingProductId, adminProducts],
  )

  const applyCatalogProducts = (items) => {
    const nextProducts =
      items?.length > 0 ? items.map(normalizeProduct) : seedProducts.map(normalizeProduct)
    setCatalogProducts(nextProducts)
    return nextProducts
  }

  useEffect(() => {
    let active = true

    const loadProducts = async () => {
      try {
        setProductsLoading(true)
        setProductsFeedback('')
        const payload = await fetchProducts()
        if (!active) {
          return
        }

        applyCatalogProducts(payload.products)
      } catch (error) {
        if (!active) {
          return
        }

        setProductsFeedback(error.message || '商品接口暂时不可用，当前展示前端演示数据。')
        applyCatalogProducts([])
      } finally {
        if (active) {
          setProductsLoading(false)
        }
      }
    }

    loadProducts()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!catalogProducts.length) {
      return
    }

    const currentProduct =
      catalogProducts.find((item) => item.id === selectedProductId) ?? catalogProducts[0]
    const nextDefault = getDefaultOption(currentProduct)

    if (currentProduct.id !== selectedProductId) {
      setSelectedProductId(currentProduct.id)
    }

    if (!currentProduct.colors.includes(selectedColor)) {
      setSelectedColor(nextDefault.color)
    }

    if (!currentProduct.sizes.includes(selectedSize)) {
      setSelectedSize(nextDefault.size)
    }
  }, [catalogProducts, selectedColor, selectedProductId, selectedSize])

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutState = params.get('checkout')

    if (checkoutState === 'success') {
      setCheckoutFeedback('支付已完成，订单状态会通过 Stripe Webhook 自动同步。')
    }

    if (checkoutState === 'cancelled') {
      setCheckoutFeedback('支付已取消，你可以返回购物车重新发起结账。')
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.email) {
      return
    }

    setCustomerEmail((current) => current || session.user.email || '')
  }, [session])

  useEffect(() => {
    let active = true

    const loadAccount = async () => {
      if (!accessToken) {
        setProfile(null)
        setMemberOrders([])
        setAccountFeedback('')
        return
      }

      try {
        setAccountLoading(true)
        setAccountFeedback('')
        const [profilePayload, orderPayload] = await Promise.all([
          fetchAccountProfile(accessToken),
          fetchAccountOrders(accessToken),
        ])

        if (!active) {
          return
        }

        setProfile(profilePayload.profile ?? null)
        setMemberOrders(orderPayload.orders ?? [])
      } catch (error) {
        if (!active) {
          return
        }

        setAccountFeedback(error.message || '会员数据加载失败。')
      } finally {
        if (active) {
          setAccountLoading(false)
        }
      }
    }

    loadAccount()

    return () => {
      active = false
    }
  }, [accessToken])

  useEffect(() => {
    if (activeView !== 'admin' || !accessToken || !isAdmin) {
      return
    }

    let active = true

    const loadAdminData = async () => {
      try {
        setAdminLoading(true)
        setAdminFeedback('')

        const [productPayload, orderPayload] = await Promise.all([
          fetchAdminProducts(accessToken),
          fetchAdminOrders(accessToken),
        ])

        if (!active) {
          return
        }

        setAdminProducts(productPayload.products ?? [])
        setAdminOrders(orderPayload.orders ?? [])
        setAdminOrderDrafts(
          Object.fromEntries(
            (orderPayload.orders ?? []).map((item) => [
              item.id,
              {
                status: item.status,
                payment_status: item.payment_status,
                notes: item.notes ?? '',
              },
            ]),
          ),
        )
      } catch (error) {
        if (!active) {
          return
        }

        setAdminFeedback(error.message || '后台数据加载失败。')
      } finally {
        if (active) {
          setAdminLoading(false)
        }
      }
    }

    loadAdminData()

    return () => {
      active = false
    }
  }, [accessToken, activeView, isAdmin])

  const openProduct = (product) => {
    const nextDefault = getDefaultOption(product)
    setSelectedProductId(product.id)
    setSelectedSize(nextDefault.size)
    setSelectedColor(nextDefault.color)
    setActiveView('detail')
  }

  const addLineItem = (product, size, color) => {
    setCartItems((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.productId === product.id &&
          item.size === size &&
          item.color === color,
      )

      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [
        ...current,
        {
          productId: product.id,
          size,
          color,
          quantity: 1,
        },
      ]
    })
  }

  const addToCart = () => {
    addLineItem(selectedProduct, selectedSize, selectedColor)
    setActiveView('cart')
  }

  const updateQuantity = (targetItem, delta) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.productId === targetItem.productId &&
          item.size === targetItem.size &&
          item.color === targetItem.color
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const goToSlide = (direction) => {
    const nextIndex =
      direction === 'next'
        ? (activeSlide + 1) % heroSlides.length
        : (activeSlide - 1 + heroSlides.length) % heroSlides.length
    setActiveSlide(nextIndex)
  }

  const startCheckout = async () => {
    if (cartItems.length === 0) {
      setCheckoutFeedback('购物车为空，先挑一双鞋再发起支付。')
      return
    }

    if (!customerEmail.trim()) {
      setCheckoutFeedback('请输入结账邮箱，用于创建订单和接收支付信息。')
      return
    }

    try {
      setCheckoutLoading(true)
      setCheckoutFeedback('')

      const payload = {
        customerEmail: customerEmail.trim(),
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          size: item.size,
          color: item.color,
        })),
      }

      const { url } = await createCheckoutSession(payload, accessToken)

      if (!url) {
        throw new Error('结账链接创建失败，请检查后端或 Stripe 配置。')
      }

      window.location.href = url
    } catch (error) {
      setCheckoutFeedback(error.message || '结账失败，请稍后重试。')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const openAccount = (mode = 'signin') => {
    setAuthMode(mode)
    setAuthFeedback('')
    setActiveView('account')
  }

  const handleAuthChange = (field, value) => {
    setAuthForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()

    if (!supabase) {
      setAuthFeedback('Supabase Auth 还没有配置，请先补齐前端环境变量。')
      return
    }

    try {
      setAuthLoading(true)
      setAuthFeedback('')

      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        })

        if (error) {
          throw error
        }

        setAuthFeedback('登录成功，正在同步会员中心数据。')
      } else {
        const { error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
          options: {
            data: {
              full_name: authForm.fullName,
            },
          },
        })

        if (error) {
          throw error
        }

        setAuthFeedback('注册请求已提交，请查收邮件完成验证，或直接使用当前会话进入会员中心。')
      }
    } catch (error) {
      setAuthFeedback(error.message || '认证失败，请稍后重试。')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setProfile(null)
    setMemberOrders([])
    setActiveView('home')
    setAuthFeedback('')
  }

  const handleAdminProductFieldChange = (field, value) => {
    setAdminProductForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const resetAdminProductEditor = () => {
    setAdminEditingProductId('')
    setAdminProductForm(emptyAdminProductForm)
    setAdminEditingVariantId('')
    setAdminVariantForm(emptyAdminVariantForm)
  }

  const handleEditAdminProduct = (product) => {
    setAdminEditingProductId(product.dbId)
    setAdminProductForm(toAdminProductForm(product))
    setAdminEditingVariantId('')
    setAdminVariantForm(emptyAdminVariantForm)
  }

  const handleAdminVariantFieldChange = (field, value) => {
    setAdminVariantForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const resetAdminVariantEditor = () => {
    setAdminEditingVariantId('')
    setAdminVariantForm(emptyAdminVariantForm)
  }

  const handleEditAdminVariant = (variant) => {
    setAdminEditingVariantId(variant.id)
    setAdminVariantForm(toAdminVariantForm(variant))
  }

  const reloadAdminProductsAndCatalog = async () => {
    const [adminProductPayload, catalogPayload] = await Promise.all([
      fetchAdminProducts(accessToken),
      fetchProducts(),
    ])

    setAdminProducts(adminProductPayload.products ?? [])
    applyCatalogProducts(catalogPayload.products)
  }

  const reloadAdminOrders = async () => {
    const payload = await fetchAdminOrders(accessToken)
    const nextOrders = payload.orders ?? []
    setAdminOrders(nextOrders)
    setAdminOrderDrafts(
      Object.fromEntries(
        nextOrders.map((item) => [
          item.id,
          {
            status: item.status,
            payment_status: item.payment_status,
            notes: item.notes ?? '',
          },
        ]),
      ),
    )
  }

  const handleAdminProductSubmit = async (event) => {
    event.preventDefault()

    if (!accessToken) {
      setAdminFeedback('当前没有管理员会话，无法提交商品。')
      return
    }

    try {
      setAdminProductSaving(true)
      setAdminFeedback('')

      const payload = {
        frontend_key: Number(adminProductForm.frontend_key),
        slug: adminProductForm.slug.trim(),
        name: adminProductForm.name.trim(),
        category: adminProductForm.category.trim(),
        base_price: Math.round(Number(adminProductForm.base_price) * 100),
        rating: Number(adminProductForm.rating),
        pace: adminProductForm.pace.trim() || null,
        drop_label: adminProductForm.drop_label.trim() || null,
        detail: adminProductForm.detail.trim() || null,
        image_url: adminProductForm.image_url.trim() || null,
        is_active: Boolean(adminProductForm.is_active),
      }

      if (adminEditingProductId) {
        await updateAdminProduct(adminEditingProductId, payload, accessToken)
        setAdminFeedback('商品已更新。')
      } else {
        await createAdminProduct(payload, accessToken)
        setAdminFeedback('商品已创建。')
      }

      await reloadAdminProductsAndCatalog()
      resetAdminProductEditor()
    } catch (error) {
      setAdminFeedback(error.message || '商品保存失败。')
    } finally {
      setAdminProductSaving(false)
    }
  }

  const handleAdminVariantSubmit = async (event) => {
    event.preventDefault()

    if (!accessToken || !adminEditingProductId) {
      setAdminFeedback('请先选择一个商品，再维护它的变体和库存。')
      return
    }

    try {
      setAdminVariantSaving(true)
      setAdminFeedback('')

      const payload = {
        sku: adminVariantForm.sku.trim(),
        color: adminVariantForm.color.trim(),
        size: adminVariantForm.size.trim(),
        price: Math.round(Number(adminVariantForm.price) * 100),
        stock_quantity: Number(adminVariantForm.stock_quantity),
        stripe_price_id: adminVariantForm.stripe_price_id.trim() || null,
      }

      if (adminEditingVariantId) {
        await updateAdminVariant(adminEditingVariantId, payload, accessToken)
        setAdminFeedback('商品变体已更新。')
      } else {
        await createAdminVariant(adminEditingProductId, payload, accessToken)
        setAdminFeedback('商品变体已创建。')
      }

      await reloadAdminProductsAndCatalog()
      resetAdminVariantEditor()
    } catch (error) {
      setAdminFeedback(error.message || '商品变体保存失败。')
    } finally {
      setAdminVariantSaving(false)
    }
  }

  const handleAdminOrderDraftChange = (orderId, field, value) => {
    setAdminOrderDrafts((current) => ({
      ...current,
      [orderId]: {
        status: current[orderId]?.status || 'pending',
        payment_status: current[orderId]?.payment_status || 'pending',
        notes: current[orderId]?.notes || '',
        ...current[orderId],
        [field]: value,
      },
    }))
  }

  const handleAdminOrderSave = async (orderId) => {
    if (!accessToken) {
      setAdminFeedback('当前没有管理员会话，无法更新订单。')
      return
    }

    try {
      setAdminOrderSavingId(orderId)
      setAdminFeedback('')
      const draft = adminOrderDrafts[orderId]
      await updateAdminOrder(
        orderId,
        {
          status: draft?.status,
          payment_status: draft?.payment_status,
          notes: draft?.notes?.trim() || null,
        },
        accessToken,
      )
      await reloadAdminOrders()
      setAdminFeedback('订单状态已更新。')
    } catch (error) {
      setAdminFeedback(error.message || '订单更新失败。')
    } finally {
      setAdminOrderSavingId('')
    }
  }

  const handleAdminOrderQuickAction = async (orderId, nextStatus, nextPaymentStatus) => {
    handleAdminOrderDraftChange(orderId, 'status', nextStatus)
    handleAdminOrderDraftChange(orderId, 'payment_status', nextPaymentStatus)

    if (!accessToken) {
      setAdminFeedback('当前没有管理员会话，无法更新订单。')
      return
    }

    try {
      setAdminOrderSavingId(orderId)
      setAdminFeedback('')
      await updateAdminOrder(
        orderId,
        {
          status: nextStatus,
          payment_status: nextPaymentStatus,
          notes: adminOrderDrafts[orderId]?.notes?.trim() || null,
        },
        accessToken,
      )
      await reloadAdminOrders()
      setAdminFeedback('订单快捷操作已完成。')
    } catch (error) {
      setAdminFeedback(error.message || '订单快捷操作失败。')
    } finally {
      setAdminOrderSavingId('')
    }
  }

  return (
    <div className="page-shell">
      <div className="site-frame">
        <div className="promo-strip">
          <span>Free shipping on orders over ¥699+</span>
          <button type="button">$ USD</button>
        </div>

        <header className="site-header">
          <button type="button" className="brand-lockup" onClick={() => setActiveView('home')}>
            <span className="brand-mark">
              <svg viewBox="0 0 64 40" aria-hidden="true">
                <path d="M4 32L15 13l7 11l6-8l12 16H4z" fill="currentColor" opacity="0.88" />
                <path d="M23 32L34 5l10 16l4-6l13 17H23z" fill="currentColor" />
              </svg>
            </span>
            <span className="brand-wording">
              <strong>
                norti<span>v8</span>
              </strong>
              <small>Outdoor Footwear</small>
            </span>
          </button>

          <nav className="header-nav" aria-label="主导航">
            {navItems.map((item) => (
              <button key={item} type="button" onClick={() => setActiveView('home')}>
                {item}
              </button>
            ))}
          </nav>

          <div className="header-tools">
            <label className="search-box" aria-label="搜索">
              <SearchIcon />
              <input type="text" placeholder="Search boots, shoes..." />
            </label>

            <button
              type="button"
              className="icon-btn"
              aria-label="账户"
              onClick={() => openAccount(session ? 'signin' : 'signup')}
            >
              <UserIcon />
            </button>
            <button type="button" className="icon-btn" aria-label="收藏">
              <HeartIcon />
            </button>
            {isAdmin && (
              <button type="button" className="ghost-btn compact header-admin-btn" onClick={() => setActiveView('admin')}>
                ADMIN
              </button>
            )}
            <button
              type="button"
              className="icon-btn cart-icon-btn"
              aria-label="购物车"
              onClick={() => setActiveView('cart')}
            >
              <BagIcon />
              <span>{cartCount}</span>
            </button>
          </div>
        </header>

        <main className="main-content">
          {activeView === 'home' && (
            <>
              {(productsFeedback || productsLoading) && (
                <section className="content-section content-section-tight">
                  <div className="status-banner">
                    <strong>{productsLoading ? '正在同步商品库' : '当前使用演示商品'}</strong>
                    <span>
                      {productsLoading
                        ? '前端正在尝试从 /api/products 拉取真实商品数据。'
                        : productsFeedback}
                    </span>
                  </div>
                </section>
              )}

              <section className="hero-stage">
                <div className="hero-grid">
                  <article className="hero-panel hero-left">
                    <SmartImage src={hero.leftImage} alt={hero.title} variant="heroLeft" />
                    <div className="hero-copy">
                      <p>{hero.eyebrow}</p>
                      <h1>{hero.title}</h1>
                      <h2>{hero.subtitle}</h2>
                      <div className="hero-actions">
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => openProduct(catalogProducts[activeSlide] ?? catalogProducts[0])}
                        >
                          {hero.cta}
                        </button>
                      </div>
                    </div>
                  </article>

                  <article className="hero-panel hero-right">
                    <SmartImage
                      src={hero.rightImage}
                      alt={`${hero.title} lifestyle`}
                      variant="heroRight"
                    />
                  </article>
                </div>

                <div className="hero-controls">
                  <button type="button" className="circle-btn" onClick={() => goToSlide('prev')}>
                    <ArrowIcon direction="left" />
                  </button>

                  <div className="hero-dots">
                    {heroSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        className={index === activeSlide ? 'dot active' : 'dot'}
                        onClick={() => setActiveSlide(index)}
                        aria-label={`切换到第 ${index + 1} 张`}
                      />
                    ))}
                  </div>

                  <button type="button" className="circle-btn" onClick={() => goToSlide('next')}>
                    <ArrowIcon />
                  </button>
                </div>
              </section>

              <section className="press-strip">
                {pressMentions.map((item) => (
                  <article key={item.outlet}>
                    <strong>{item.outlet}</strong>
                    <p>{item.quote}</p>
                  </article>
                ))}
              </section>

              <section className="content-section">
                <div className="section-head">
                  <div>
                    <h2>CATEGORY & LATEST</h2>
                  </div>
                </div>

                <div className="category-rail" aria-label="分类快捷入口">
                  {categoryRail.map((item) => (
                    <button key={item} type="button" className="category-chip" onClick={() => setActiveView('home')}>
                      {item}
                    </button>
                  ))}
                </div>

                <div className="category-grid">
                  {categories.map((category, index) => (
                    <article className="category-card" key={category.title}>
                      <SmartImage src={category.image} alt={category.title} variant="category" />
                      <div className="category-copy">
                        <span>{category.caption}</span>
                        <h3>{category.title}</h3>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => openProduct(catalogProducts[index] ?? catalogProducts[0])}
                        >
                          SHOP NOW
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="story-grid">
                {storyCards.map((story) => (
                  <article className="story-card" key={story.title}>
                    <SmartImage src={story.image} alt={story.title} variant="editorial" />
                    <div className="story-copy">
                      <h3>{story.title}</h3>
                      <p>{story.body}</p>
                      <button type="button" className="primary-btn">
                        {story.cta}
                      </button>
                    </div>
                  </article>
                ))}
              </section>

              <section className="membership-card">
                <div className="membership-copy">
                  <p className="label">MEMBERSHIP</p>
                  <h2>Join for up to 20% off.</h2>
                  <p>Member perks, early access, and more value across every new drop.</p>
                </div>

                <div className="membership-offers">
                  {membershipOffers.map((offer) => (
                    <article key={offer.title} className="membership-offer">
                      <h3>{offer.title}</h3>
                      <p>{offer.body}</p>
                      <button
                        type="button"
                        className="ghost-btn compact"
                        onClick={() => openAccount('signup')}
                      >
                        {offer.cta}
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="content-section">
                <div className="section-head">
                  <div>
                    <p className="label">HOT PICKS</p>
                    <h2>Shop our top picks.</h2>
                  </div>
                  <button type="button" className="ghost-btn light">
                    SHOP MORE
                  </button>
                </div>

                <div className="product-grid new-grid">
                  {catalogProducts.map((product) => (
                    <article className="product-card" key={product.id}>
                      <div className="product-image-shell">
                        <SmartImage src={product.image} alt={product.name} variant="product" />
                      </div>

                      <div className="product-meta">
                        <div>
                          <p>{product.category}</p>
                          <h3>{product.name}</h3>
                        </div>
                        <span>{product.rating}</span>
                      </div>

                      <div className="product-specs">
                        <span>{product.pace}</span>
                        <span>{product.drop}</span>
                      </div>

                      <div className="product-footer">
                        <strong>{formatPrice(product.price)}</strong>
                        <div className="footer-actions">
                          <button type="button" className="ghost-btn compact" onClick={() => openProduct(product)}>
                            DETAILS
                          </button>
                          <button
                            type="button"
                            className="primary-btn compact"
                            onClick={() => {
                              const defaults = getDefaultOption(product)
                              setSelectedProductId(product.id)
                              setSelectedColor(defaults.color)
                              setSelectedSize(defaults.size)
                              addLineItem(product, defaults.size, defaults.color)
                              setActiveView('cart')
                            }}
                          >
                            QUICK ADD
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="content-section">
                <div className="section-head">
                  <div>
                    <p className="label">FIELD NOTES</p>
                    <h2>Latest from the blog.</h2>
                  </div>
                </div>

                <div className="journal-grid">
                  {blogPosts.map((post) => (
                    <article key={post.title} className="journal-card">
                      <SmartImage src={post.image} alt={post.title} variant="editorial" />
                      <div className="journal-copy">
                        <span>{post.tag}</span>
                        <h3>{post.title}</h3>
                        <p>{post.body}</p>
                        <button type="button" className="text-link">
                          READ MORE
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="content-section">
                <div className="section-head">
                  <div>
                    <p className="label">FOLLOW US</p>
                    <h2>Follow @NORTIV8</h2>
                    <p>Tag us for a chance to be featured in the next drop recap.</p>
                  </div>
                </div>

                <div className="social-grid">
                  {socialGallery.map((item) => (
                    <article key={item.id} className="social-card">
                      <SmartImage
                        src={item.image}
                        alt={`Nortiv8 social ${item.id}`}
                        variant="social"
                      />
                      <div className="social-meta">
                        <strong>{item.handle}</strong>
                        <span>{item.caption}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeView === 'detail' && (
            <section className="detail-layout">
              <div className="detail-gallery">
                <SmartImage src={selectedProduct.image} alt={selectedProduct.name} variant="product" />
                <div className="thumbnail-row">
                  {catalogProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className={
                        product.id === selectedProduct.id
                          ? 'thumbnail active'
                          : 'thumbnail'
                      }
                      onClick={() => {
                        const defaults = getDefaultOption(product)
                        setSelectedProductId(product.id)
                        setSelectedColor(defaults.color)
                        setSelectedSize(defaults.size)
                      }}
                    >
                      <SmartImage src={product.image} alt={product.name} variant="product" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="detail-info">
                <p className="label">{selectedProduct.category}</p>
                <h2>{selectedProduct.name}</h2>
                <div className="detail-price-row">
                  <strong>{formatPrice(getUnitPrice(selectedProduct, selectedSize, selectedColor))}</strong>
                  <span>Rated {selectedProduct.rating}</span>
                </div>
                <p className="detail-description">{selectedProduct.detail}</p>

                <div className="detail-block">
                  <span>Color</span>
                  <div className="chip-row">
                    {selectedProduct.colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={selectedColor === color ? 'chip active' : 'chip'}
                        onClick={() => setSelectedColor(color)}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="detail-block">
                  <span>Size</span>
                  <div className="chip-row">
                    {selectedProduct.sizes.map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={selectedSize === size ? 'chip active' : 'chip'}
                        onClick={() => setSelectedSize(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="detail-callouts">
                  <div>
                    <span>Use Case</span>
                    <strong>{selectedProduct.pace}</strong>
                  </div>
                  <div>
                    <span>Tech</span>
                    <strong>{selectedProduct.drop}</strong>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <strong>Orders ¥699+</strong>
                  </div>
                </div>

                <div className="hero-actions">
                  <button type="button" className="primary-btn" onClick={addToCart}>
                    Add To Cart
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => setActiveView('home')}>
                    Back Home
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeView === 'cart' && (
            <section className="cart-layout">
              <div className="cart-list">
                <p className="label">SHOPPING BAG</p>
                <h2>Ready for checkout</h2>

                {cartSummary.lineItems.length === 0 && (
                  <div className="empty-state">
                    <p>购物车还是空的，先回首页看看这套新风格的商品导购模块。</p>
                    <button type="button" className="primary-btn" onClick={() => setActiveView('home')}>
                      Back To Home
                    </button>
                  </div>
                )}

                {cartSummary.lineItems.map((item) => (
                  <article
                    key={`${item.productId}-${item.size}-${item.color}`}
                    className="cart-item"
                  >
                    <SmartImage
                      src={item.product?.image}
                      alt={item.product?.name ?? 'Product image'}
                      variant="product"
                    />
                    <div className="cart-copy">
                      <p>{item.product?.category}</p>
                      <h3>{item.product?.name}</h3>
                      <small>
                        {item.color} / {item.size}
                      </small>
                      <strong>{formatPrice(item.subtotal)}</strong>
                    </div>
                    <div className="stepper">
                      <button type="button" onClick={() => updateQuantity(item, -1)}>
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item, 1)}>
                        +
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <aside className="checkout-card">
                <p className="label">SUMMARY</p>
                <h2>Order overview</h2>
                <div className="summary-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(cartSummary.subtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Shipping</span>
                  <strong>{formatPrice(cartSummary.shipping)}</strong>
                </div>
                <div className="summary-row total">
                  <span>Total</span>
                  <strong>{formatPrice(cartSummary.total)}</strong>
                </div>

                <div className="checkout-benefits">
                  <span>7 天无忧退换</span>
                  <span>Member perks available</span>
                  <span>满 ¥699 包邮</span>
                </div>

                <label className="checkout-input">
                  <span>Checkout Email</span>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>

                {checkoutFeedback && <p className="checkout-feedback">{checkoutFeedback}</p>}
                {session && <p className="checkout-feedback">已绑定会员账号，订单会自动关联到当前用户。</p>}

                <button
                  type="button"
                  className="primary-btn full-width"
                  onClick={startCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Creating Checkout...' : 'Proceed To Checkout'}
                </button>
              </aside>
            </section>
          )}

          {activeView === 'account' && (
            <section className="account-layout">
              <article className="panel-card auth-panel">
                <div className="section-head panel-head">
                  <div>
                    <p className="label">MEMBER CENTER</p>
                    <h2>{session ? `欢迎回来，${accountTitle}` : '登录 / 注册会员'}</h2>
                    <p>
                      {session
                        ? '当前页面已经接上 Supabase Auth，可查看会员资料和历史订单。'
                        : '先登录会员，再把订单、地址和后台权限接到真实服务。'}
                    </p>
                  </div>
                </div>

                {!session && (
                  <>
                    <div className="switch-row">
                      <button
                        type="button"
                        className={authMode === 'signin' ? 'ghost-btn compact active-tab' : 'ghost-btn compact'}
                        onClick={() => setAuthMode('signin')}
                      >
                        登录
                      </button>
                      <button
                        type="button"
                        className={authMode === 'signup' ? 'ghost-btn compact active-tab' : 'ghost-btn compact'}
                        onClick={() => setAuthMode('signup')}
                      >
                        注册
                      </button>
                    </div>

                    <form className="auth-form" onSubmit={handleAuthSubmit}>
                      {authMode === 'signup' && (
                        <label className="checkout-input">
                          <span>Full Name</span>
                          <input
                            type="text"
                            value={authForm.fullName}
                            onChange={(event) => handleAuthChange('fullName', event.target.value)}
                            placeholder="Your name"
                          />
                        </label>
                      )}

                      <label className="checkout-input">
                        <span>Email</span>
                        <input
                          type="email"
                          value={authForm.email}
                          onChange={(event) => handleAuthChange('email', event.target.value)}
                          placeholder="you@example.com"
                        />
                      </label>

                      <label className="checkout-input">
                        <span>Password</span>
                        <input
                          type="password"
                          value={authForm.password}
                          onChange={(event) => handleAuthChange('password', event.target.value)}
                          placeholder="At least 6 characters"
                        />
                      </label>

                      {authFeedback && <p className="checkout-feedback">{authFeedback}</p>}

                      <button type="submit" className="primary-btn full-width" disabled={authLoading}>
                        {authLoading ? 'Submitting...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
                      </button>
                    </form>
                  </>
                )}

                {session && (
                  <div className="account-grid">
                    <div className="info-block">
                      <span>Member</span>
                      <strong>{profile?.full_name || session.user.email}</strong>
                      <small>{profile?.email || session.user.email}</small>
                    </div>
                    <div className="info-block">
                      <span>Role</span>
                      <strong>{profile?.role || 'customer'}</strong>
                      <small>{isAdmin ? 'Has admin access' : 'Standard member access'}</small>
                    </div>
                    <div className="info-block">
                      <span>Orders</span>
                      <strong>{memberOrders.length}</strong>
                      <small>Linked to current account</small>
                    </div>
                    <div className="account-actions">
                      {isAdmin && (
                        <button type="button" className="ghost-btn" onClick={() => setActiveView('admin')}>
                          Open Admin
                        </button>
                      )}
                      <button type="button" className="primary-btn" onClick={handleSignOut}>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </article>

              <aside className="panel-card orders-panel">
                <div className="section-head panel-head">
                  <div>
                    <p className="label">ORDER HISTORY</p>
                    <h2>会员订单</h2>
                    <p>Stripe 支付成功后，订单会通过 webhook 回写，再出现在这里。</p>
                  </div>
                </div>

                {accountLoading && <div className="empty-state"><p>正在加载会员资料与订单...</p></div>}
                {accountFeedback && <p className="checkout-feedback">{accountFeedback}</p>}

                {!session && (
                  <div className="empty-state">
                    <p>登录后即可查看会员订单、订单状态和后台权限。</p>
                  </div>
                )}

                {session && !accountLoading && memberOrders.length === 0 && (
                  <div className="empty-state">
                    <p>当前账号还没有历史订单。你可以直接去购物车发起真实 Checkout。</p>
                  </div>
                )}

                {memberOrders.length > 0 && (
                  <div className="order-stack">
                    {memberOrders.map((order) => (
                      <article key={order.id} className="order-card">
                        <div className="order-card-head">
                          <div>
                            <strong>{order.customer_email}</strong>
                            <span>{formatDate(order.created_at)}</span>
                          </div>
                          <div className="order-state">
                            <b>{order.status}</b>
                            <span>{order.payment_status}</span>
                          </div>
                        </div>
                        <div className="order-items">
                          {(order.order_items || []).map((item) => (
                            <div key={`${order.id}-${item.sku}-${item.size}`} className="order-item-row">
                              <span>{item.product_name}</span>
                              <small>
                                {item.color} / {item.size} x {item.quantity}
                              </small>
                              <strong>{formatPriceFromCents(item.line_total)}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="order-total-row">
                          <span>Total</span>
                          <strong>{formatPriceFromCents(order.total)}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </aside>
            </section>
          )}

          {activeView === 'admin' && (
            <section className="admin-layout">
              <article className="panel-card">
                <div className="section-head panel-head">
                  <div>
                    <p className="label">ADMIN PANEL</p>
                    <h2>商品与订单后台</h2>
                    <p>当前版本先接入只读后台视图，用于运营查看商品、库存和订单状态。</p>
                  </div>
                  <button type="button" className="ghost-btn compact" onClick={() => setActiveView('account')}>
                    Back To Account
                  </button>
                </div>

                {!isAdmin && (
                  <div className="empty-state">
                    <p>当前账号没有管理员权限。请把 `profiles.role` 设为 `admin` 后再进入后台。</p>
                  </div>
                )}

                {isAdmin && (
                  <>
                    {adminFeedback && <p className="checkout-feedback">{adminFeedback}</p>}
                    {adminLoading && <div className="empty-state"><p>正在同步后台商品与订单数据...</p></div>}

                    <div className="account-grid admin-stats">
                      <div className="info-block">
                        <span>Products</span>
                        <strong>{adminProducts.length}</strong>
                        <small>Catalog records</small>
                      </div>
                      <div className="info-block">
                        <span>Orders</span>
                        <strong>{adminOrders.length}</strong>
                        <small>All-time orders</small>
                      </div>
                      <div className="info-block">
                        <span>Revenue</span>
                        <strong>{formatPriceFromCents(adminRevenue)}</strong>
                        <small>Gross amount</small>
                      </div>
                    </div>

                    <div className="admin-form-card">
                      <div className="section-head panel-head">
                        <div>
                          <p className="label">PRODUCT EDITOR</p>
                          <h3>{adminEditingProductId ? '编辑商品' : '新增商品'}</h3>
                          <p>支持商品基础信息、变体 SKU、颜色尺码与库存维护。</p>
                        </div>
                        {adminEditingProductId && (
                          <button type="button" className="ghost-btn compact" onClick={resetAdminProductEditor}>
                            新建模式
                          </button>
                        )}
                      </div>

                      <form className="admin-product-form" onSubmit={handleAdminProductSubmit}>
                        <label className="checkout-input">
                          <span>Frontend Key</span>
                          <input
                            type="number"
                            value={adminProductForm.frontend_key}
                            onChange={(event) => handleAdminProductFieldChange('frontend_key', event.target.value)}
                            placeholder="5"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Slug</span>
                          <input
                            type="text"
                            value={adminProductForm.slug}
                            onChange={(event) => handleAdminProductFieldChange('slug', event.target.value)}
                            placeholder="new-product-slug"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Name</span>
                          <input
                            type="text"
                            value={adminProductForm.name}
                            onChange={(event) => handleAdminProductFieldChange('name', event.target.value)}
                            placeholder="New Product Name"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Category</span>
                          <input
                            type="text"
                            value={adminProductForm.category}
                            onChange={(event) => handleAdminProductFieldChange('category', event.target.value)}
                            placeholder="HIKING BOOTS"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Price (Yuan)</span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={adminProductForm.base_price}
                            onChange={(event) => handleAdminProductFieldChange('base_price', event.target.value)}
                            placeholder="899"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Rating</span>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.1"
                            value={adminProductForm.rating}
                            onChange={(event) => handleAdminProductFieldChange('rating', event.target.value)}
                            placeholder="4.8"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Use Case</span>
                          <input
                            type="text"
                            value={adminProductForm.pace}
                            onChange={(event) => handleAdminProductFieldChange('pace', event.target.value)}
                            placeholder="全天徒步"
                          />
                        </label>
                        <label className="checkout-input">
                          <span>Tech Label</span>
                          <input
                            type="text"
                            value={adminProductForm.drop_label}
                            onChange={(event) => handleAdminProductFieldChange('drop_label', event.target.value)}
                            placeholder="Vibram Lite"
                          />
                        </label>
                        <label className="checkout-input admin-span-2">
                          <span>Image URL</span>
                          <input
                            type="url"
                            value={adminProductForm.image_url}
                            onChange={(event) => handleAdminProductFieldChange('image_url', event.target.value)}
                            placeholder="https://..."
                          />
                        </label>
                        <label className="checkout-input admin-span-2">
                          <span>Detail</span>
                          <textarea
                            value={adminProductForm.detail}
                            onChange={(event) => handleAdminProductFieldChange('detail', event.target.value)}
                            placeholder="Product detail copy"
                          />
                        </label>
                        <label className="admin-checkbox">
                          <input
                            type="checkbox"
                            checked={adminProductForm.is_active}
                            onChange={(event) => handleAdminProductFieldChange('is_active', event.target.checked)}
                          />
                          <span>Active product</span>
                        </label>
                        <div className="admin-form-actions admin-span-2">
                          <button type="submit" className="primary-btn" disabled={adminProductSaving}>
                            {adminProductSaving
                              ? 'Saving...'
                              : adminEditingProductId
                                ? 'Update Product'
                                : 'Create Product'}
                          </button>
                          <button type="button" className="ghost-btn" onClick={resetAdminProductEditor}>
                            Reset
                          </button>
                        </div>
                      </form>

                      {adminEditingProductId && (
                        <div className="variant-manager">
                          <div className="section-head panel-head">
                            <div>
                              <p className="label">VARIANT MANAGER</p>
                              <h3>{editingAdminProduct?.name || '当前商品'} 的变体与库存</h3>
                              <p>这里维护 SKU、颜色、尺码、售价和库存数量。</p>
                            </div>
                            {adminEditingVariantId && (
                              <button type="button" className="ghost-btn compact" onClick={resetAdminVariantEditor}>
                                新建变体
                              </button>
                            )}
                          </div>

                          <form className="admin-product-form" onSubmit={handleAdminVariantSubmit}>
                            <label className="checkout-input">
                              <span>SKU</span>
                              <input
                                type="text"
                                value={adminVariantForm.sku}
                                onChange={(event) => handleAdminVariantFieldChange('sku', event.target.value)}
                                placeholder="SKU-001-BLK-42"
                              />
                            </label>
                            <label className="checkout-input">
                              <span>Color</span>
                              <input
                                type="text"
                                value={adminVariantForm.color}
                                onChange={(event) => handleAdminVariantFieldChange('color', event.target.value)}
                                placeholder="Black"
                              />
                            </label>
                            <label className="checkout-input">
                              <span>Size</span>
                              <input
                                type="text"
                                value={adminVariantForm.size}
                                onChange={(event) => handleAdminVariantFieldChange('size', event.target.value)}
                                placeholder="42"
                              />
                            </label>
                            <label className="checkout-input">
                              <span>Price (Yuan)</span>
                              <input
                                type="number"
                                min="1"
                                step="0.01"
                                value={adminVariantForm.price}
                                onChange={(event) => handleAdminVariantFieldChange('price', event.target.value)}
                                placeholder="899"
                              />
                            </label>
                            <label className="checkout-input">
                              <span>Stock</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={adminVariantForm.stock_quantity}
                                onChange={(event) => handleAdminVariantFieldChange('stock_quantity', event.target.value)}
                                placeholder="20"
                              />
                            </label>
                            <label className="checkout-input admin-span-2">
                              <span>Stripe Price ID</span>
                              <input
                                type="text"
                                value={adminVariantForm.stripe_price_id}
                                onChange={(event) => handleAdminVariantFieldChange('stripe_price_id', event.target.value)}
                                placeholder="price_xxx"
                              />
                            </label>
                            <div className="admin-form-actions admin-span-2">
                              <button type="submit" className="primary-btn" disabled={adminVariantSaving}>
                                {adminVariantSaving
                                  ? 'Saving...'
                                  : adminEditingVariantId
                                    ? 'Update Variant'
                                    : 'Create Variant'}
                              </button>
                              <button type="button" className="ghost-btn" onClick={resetAdminVariantEditor}>
                                Reset Variant
                              </button>
                            </div>
                          </form>

                          <div className="variant-list">
                            {(editingAdminProduct?.variants ?? []).length === 0 && (
                              <div className="empty-state">
                                <p>当前商品还没有变体。先新增一个颜色/尺码 SKU。</p>
                              </div>
                            )}
                            {(editingAdminProduct?.variants ?? []).map((variant) => (
                              <article key={variant.id} className="variant-card">
                                <div>
                                  <strong>{variant.sku}</strong>
                                  <small>
                                    {variant.color} / {variant.size}
                                  </small>
                                </div>
                                <div className="variant-metrics">
                                  <span>{formatPriceFromCents(variant.price)}</span>
                                  <span>库存 {variant.stock_quantity}</span>
                                </div>
                                <button
                                  type="button"
                                  className="ghost-btn compact"
                                  onClick={() => handleEditAdminVariant(variant)}
                                >
                                  Edit Variant
                                </button>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="admin-table-wrap">
                      <h3>Products</h3>
                      <div className="data-table">
                        <div className="data-row data-head">
                          <span>Name</span>
                          <span>Category</span>
                          <span>Price</span>
                          <span>Variants</span>
                          <span>Actions</span>
                        </div>
                        {adminProducts.map((product) => (
                          <div key={product.id} className="data-row">
                            <span>{product.name}</span>
                            <span>{product.category}</span>
                            <span>{formatPrice(product.price)}</span>
                            <span>
                              {(product.variants?.length ?? 0)} / 库存{' '}
                              {(product.variants ?? []).reduce((sum, item) => sum + (item.stock_quantity || 0), 0)}
                            </span>
                            <span className="data-actions">
                              <button
                                type="button"
                                className="ghost-btn compact"
                                onClick={() => handleEditAdminProduct(product)}
                              >
                                Edit
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="admin-table-wrap">
                      <h3>Orders</h3>
                      <div className="order-stack">
                        {adminOrders.map((order) => (
                          <article key={order.id} className="order-card admin-order-card">
                            <div className="order-card-head">
                              <div>
                                <strong>{order.customer_email}</strong>
                                <span>{formatDate(order.created_at)}</span>
                              </div>
                              <strong>{formatPriceFromCents(order.total)}</strong>
                            </div>
                            <div className="admin-order-grid">
                              <label className="checkout-input">
                                <span>Order Status</span>
                                <select
                                  value={adminOrderDrafts[order.id]?.status ?? order.status}
                                  onChange={(event) =>
                                    handleAdminOrderDraftChange(order.id, 'status', event.target.value)
                                  }
                                >
                                  {adminOrderStatusOptions.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="checkout-input">
                                <span>Payment Status</span>
                                <select
                                  value={adminOrderDrafts[order.id]?.payment_status ?? order.payment_status}
                                  onChange={(event) =>
                                    handleAdminOrderDraftChange(order.id, 'payment_status', event.target.value)
                                  }
                                >
                                  {adminPaymentStatusOptions.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="checkout-input admin-span-2">
                                <span>Notes</span>
                                <textarea
                                  value={adminOrderDrafts[order.id]?.notes ?? ''}
                                  onChange={(event) =>
                                    handleAdminOrderDraftChange(order.id, 'notes', event.target.value)
                                  }
                                  placeholder="Internal order notes"
                                />
                              </label>
                            </div>
                            <div className="admin-form-actions">
                              <button
                                type="button"
                                className="ghost-btn compact"
                                onClick={() => handleAdminOrderQuickAction(order.id, 'paid', 'paid')}
                                disabled={adminOrderSavingId === order.id}
                              >
                                Mark Paid
                              </button>
                              <button
                                type="button"
                                className="ghost-btn compact"
                                onClick={() => handleAdminOrderQuickAction(order.id, 'fulfilled', 'paid')}
                                disabled={adminOrderSavingId === order.id}
                              >
                                Mark Fulfilled
                              </button>
                              <button
                                type="button"
                                className="ghost-btn compact"
                                onClick={() => handleAdminOrderQuickAction(order.id, 'cancelled', 'failed')}
                                disabled={adminOrderSavingId === order.id}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="primary-btn compact"
                                onClick={() => handleAdminOrderSave(order.id)}
                                disabled={adminOrderSavingId === order.id}
                              >
                                {adminOrderSavingId === order.id ? 'Saving...' : 'Save Order'}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </article>
            </section>
          )}
        </main>

        <footer className="site-footer">
          <div className="footer-newsletter">
            <p className="label">JOIN OUR MAILING LIST</p>
            <h3>Get first access to new drops and exclusive offers.</h3>
            <div className="newsletter-form">
              <input type="email" placeholder="Enter your email" aria-label="Email address" />
              <button type="button" className="primary-btn">
                SIGN UP
              </button>
            </div>
            <p className="newsletter-note">Weekly product picks, launch reminders, and members-only offers.</p>
          </div>
          <div className="footer-columns">
            <div>
              <strong>ABOUT</strong>
              <a href="/">Our Story</a>
              <a href="/">Affiliate Program</a>
              <a href="/">Accessibility</a>
            </div>
            <div>
              <strong>CUSTOMER SERVICE</strong>
              <a href="/">Shipping Terms</a>
              <a href="/">Return Policy</a>
              <a href="/">FAQ</a>
            </div>
            <div>
              <strong>PROGRAM</strong>
              <a href="/">Rewards Benefits</a>
              <a href="/">Gift Cards</a>
              <a href="/">Store Locator</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
