import { useEffect, useMemo, useState } from 'react'
import { createCheckoutSession } from './lib/api'

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

const products = [
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

const sizeOptions = ['40', '41', '42', '43', '44']

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
  const [selectedProductId, setSelectedProductId] = useState(products[1].id)
  const [selectedSize, setSelectedSize] = useState('42')
  const [selectedColor, setSelectedColor] = useState(products[1].colors[0])
  const [customerEmail, setCustomerEmail] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutFeedback, setCheckoutFeedback] = useState('')
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
    () => products.find((item) => item.id === selectedProductId) ?? products[0],
    [selectedProductId],
  )

  const cartSummary = useMemo(() => {
    const lineItems = cartItems.map((item) => {
      const product = products.find((entry) => entry.id === item.productId)
      return {
        ...item,
        product,
        subtotal: (product?.price ?? 0) * item.quantity,
      }
    })
    const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0)
    const shipping = subtotal > 999 ? 0 : subtotal > 0 ? 24 : 0
    return {
      lineItems,
      subtotal,
      shipping,
      total: subtotal + shipping,
    }
  }, [cartItems])

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

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

  const openProduct = (product) => {
    setSelectedProductId(product.id)
    setSelectedSize('42')
    setSelectedColor(product.colors[0])
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

      const { url } = await createCheckoutSession(payload)

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

            <button type="button" className="icon-btn" aria-label="账户">
              <UserIcon />
            </button>
            <button type="button" className="icon-btn" aria-label="收藏">
              <HeartIcon />
            </button>
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
                          onClick={() => openProduct(products[activeSlide])}
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
                          onClick={() => openProduct(products[index])}
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
                      <button type="button" className="ghost-btn compact">
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
                  {products.map((product) => (
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
                        <strong>¥{product.price}</strong>
                        <div className="footer-actions">
                          <button type="button" className="ghost-btn compact" onClick={() => openProduct(product)}>
                            DETAILS
                          </button>
                          <button
                            type="button"
                            className="primary-btn compact"
                            onClick={() => {
                              setSelectedProductId(product.id)
                              setSelectedColor(product.colors[0])
                              setSelectedSize('42')
                              addLineItem(product, '42', product.colors[0])
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
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className={
                        product.id === selectedProduct.id
                          ? 'thumbnail active'
                          : 'thumbnail'
                      }
                      onClick={() => {
                        setSelectedProductId(product.id)
                        setSelectedColor(product.colors[0])
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
                  <strong>¥{selectedProduct.price}</strong>
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
                    {sizeOptions.map((size) => (
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
                      <strong>¥{item.subtotal}</strong>
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
                  <strong>¥{cartSummary.subtotal}</strong>
                </div>
                <div className="summary-row">
                  <span>Shipping</span>
                  <strong>¥{cartSummary.shipping}</strong>
                </div>
                <div className="summary-row total">
                  <span>Total</span>
                  <strong>¥{cartSummary.total}</strong>
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
