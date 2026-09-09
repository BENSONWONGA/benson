import { useMemo, useState } from 'react'

const imageUrl = (prompt, imageSize = 'landscape_16_9') =>
  `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt,
  )}&image_size=${imageSize}`

const heroSlides = [
  {
    id: 1,
    eyebrow: 'EARLY BIRD OFFER',
    title: 'GEOPILOT WORKNANO STEP',
    subtitle: 'KEEPS HIGH-STEP WORKERS STEADY, CUSHIONED, AND PROTECTED THROUGH LONG SHIFTS.',
    body: 'Early bird offer. Built for hard floors, long hours, and all-day support.',
    cta: 'Shop Now',
    leftImage: imageUrl(
      'premium rugged work boot closeup on workshop floor, black and orange safety boot product photo, gritty garage lighting, ecommerce campaign, no text',
      'landscape_16_9',
    ),
    rightImage: imageUrl(
      'mechanic sitting in auto repair shop tying rugged work boots, premium editorial workwear campaign, warm industrial lighting, no text',
      'landscape_16_9',
    ),
  },
  {
    id: 2,
    eyebrow: 'HOT PICKS',
    title: 'CITY HIKE ESSENTIALS',
    subtitle: 'LIGHTWEIGHT TRACTION FOR WEEKEND TRAILS, DAILY COMMUTES, AND SUMMER ESCAPES.',
    body: 'Explore trail-ready shoes with a cleaner iOS-like interface layered onto a familiar commerce skeleton.',
    cta: 'Explore Now',
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
    cta: 'View Collection',
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
    caption: '全天站立与强支撑',
    image: imageUrl(
      'premium work boot lifestyle image, delivery worker stepping off truck in clean urban scene, stylish rugged boots, editorial ecommerce photo',
      'portrait_4_3',
    ),
  },
  {
    title: 'MILITARY BOOTS',
    caption: '轻量包裹与稳定抓地',
    image: imageUrl(
      'premium tactical boots lifestyle image, athletic person climbing rope outdoors, modern military boots, crisp adventure fashion campaign',
      'portrait_4_3',
    ),
  },
  {
    title: 'HIKING BOOTS',
    caption: '长距离徒步防护',
    image: imageUrl(
      'premium hiking boots lifestyle image, man and woman walking in city to trail transition, elevated outdoor fashion photography',
      'portrait_4_3',
    ),
  },
  {
    title: 'HIKING SHOES',
    caption: '日常穿着与快节奏出行',
    image: imageUrl(
      'premium hiking shoes lifestyle image, photographer crouching on alpine overlook, sleek outdoor shoes, refined retail editorial style',
      'portrait_4_3',
    ),
  },
]

const pressMentions = [
  {
    outlet: 'BUZZFEED',
    quote: '"如果你还不知道这类户外鞋品牌，今天就是你的官方种草日。"',
  },
  {
    outlet: 'TRAVEL + LEISURE',
    quote: '"我会把这种鞋打包进旅程里，因为它的耐穿和舒适都足够稳定。"',
  },
  {
    outlet: "MEN'S JOURNAL",
    quote: '"高评分本身已经在告诉用户：它值得被放进首选清单。"',
  },
  {
    outlet: 'HYPEOUTDOOR',
    quote: '"当机能感遇上更轻的视觉系统，电商首页也能有高级产品感。"',
  },
]

const storyCards = [
  {
    title: 'Hard Work Starts Here',
    body: '将促销入口、主推鞋款和品牌氛围统一到同一层玻璃系统里。',
    cta: 'Shop Now',
    image: imageUrl(
      'premium outdoor boots still life in glass showroom, silver reflections, tactile materials, cinematic fashion ecommerce image',
      'landscape_4_3',
    ),
  },
  {
    title: 'Everyday. Tactical. Ready',
    body: '通过半透明浮层、圆润搜索区和悬浮图文卡片，模拟 iOS 式内容堆叠。',
    cta: 'Explore',
    image: imageUrl(
      'premium tactical sneakers in translucent architectural space, sleek product presentation, soft silver and blue tones, editorial photo',
      'landscape_4_3',
    ),
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
    title: '6 款适合城市与轻户外切换的鞋型',
    body: '如果首页风格像 NORTIV8，但视觉想更高级，内容区就要承担“品牌编辑部”的角色。',
    image: imageUrl(
      'editorial outdoor footwear blog image, stylish camping setup with modern boots and soft silver blue palette, magazine quality',
      'landscape_4_3',
    ),
  },
  {
    title: '如何让户外鞋电商首页不再像传统模板',
    body: '关键不是盲目加玻璃，而是把导航、搜索、促销、卡片都放进一致的透明深度体系。',
    image: imageUrl(
      'editorial design concept image for premium footwear ecommerce, translucent interface over boots, clean visual storytelling',
      'landscape_4_3',
    ),
  },
  {
    title: '为什么液态玻璃风适合中高端鞋类品牌',
    body: '它能削弱促销页面的粗糙感，让商品图和生活方式内容看起来更像品牌广告。',
    image: imageUrl(
      'luxury lifestyle image of premium boots with crystal clear display stands, contemporary soft light, editorial retail campaign',
      'landscape_4_3',
    ),
  },
]

const socialGallery = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  image: imageUrl(
    `premium footwear social media lifestyle image ${index + 1}, outdoor shoes in elevated editorial scene, stylish adventure fashion, high end retail photography`,
    'square',
  ),
}))

const navItems = ['EARLY BIRD OFFER', 'HOT PICKS', 'MEN', 'WOMEN', 'ABOUT US', 'ALLSWIFT']

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
              <strong>Aether8</strong>
              <small>Work. Hiking. Tactical.</small>
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
              <input type="text" placeholder="Search..." />
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
                    <img src={hero.leftImage} alt={hero.title} />
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
                    <img src={hero.rightImage} alt={`${hero.title} lifestyle`} />
                    <div className="hero-floating-card">
                      <span>{hero.body}</span>
                    </div>
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
                    <p className="label">CATEGORY & LATEST</p>
                    <h2>Built for work, tactical, and hiking.</h2>
                  </div>
                  <button type="button" className="ghost-btn light">
                    View All
                  </button>
                </div>

                <div className="category-grid">
                  {categories.map((category, index) => (
                    <article className="category-card" key={category.title}>
                      <img src={category.image} alt={category.title} />
                      <div className="category-copy">
                        <span>{category.caption}</span>
                        <h3>{category.title}</h3>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => openProduct(products[index])}
                        >
                          Shop Now
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="story-grid">
                {storyCards.map((story, index) => (
                  <article className="story-card" key={story.title}>
                    <img src={story.image} alt={story.title} />
                    <div className="story-copy">
                      <p className="label">{index === 0 ? 'EDITORIAL DROP' : 'SYSTEM DETAIL'}</p>
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
                  <p>
                    Member-exclusive styles, faster access to drops, and a cleaner signup panel with subtle translucent controls.
                  </p>
                </div>

                <div className="membership-form">
                  <label>
                    <span>Enter Email</span>
                    <input type="email" placeholder="you@brand.com" />
                  </label>
                  <button type="button" className="primary-btn">
                    Sign Up Now
                  </button>
                </div>
              </section>

              <section className="content-section">
                <div className="section-head">
                  <div>
                    <p className="label">HOT PICKS</p>
                    <h2>Hot picks for this season.</h2>
                  </div>
                  <button type="button" className="ghost-btn light">
                    Filter
                  </button>
                </div>

                <div className="product-grid new-grid">
                  {products.map((product) => (
                    <article className="product-card" key={product.id}>
                      <div className="product-image-shell">
                        <img src={product.image} alt={product.name} />
                        <button type="button" className="floating-badge">
                          {product.category}
                        </button>
                      </div>

                      <div className="product-meta">
                        <div>
                          <p>{product.detail}</p>
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
                            Details
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
                            Quick Add
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
                    <p className="label">AETHERX JOURNAL</p>
                    <h2>Field notes and footwear guides.</h2>
                  </div>
                </div>

                <div className="journal-grid">
                  {blogPosts.map((post) => (
                    <article key={post.title} className="journal-card">
                      <img src={post.image} alt={post.title} />
                      <div className="journal-copy">
                        <h3>{post.title}</h3>
                        <p>{post.body}</p>
                        <button type="button" className="text-link">
                          View More
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
                    <h2>Follow us @Aether8 shoes.</h2>
                  </div>
                </div>

                <div className="social-grid">
                  {socialGallery.map((item) => (
                    <article key={item.id} className="social-card">
                      <img src={item.image} alt={`AetherX social ${item.id}`} />
                      <span>@AetherX</span>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeView === 'detail' && (
            <section className="detail-layout">
              <div className="detail-gallery">
                <img src={selectedProduct.image} alt={selectedProduct.name} />
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
                      <img src={product.image} alt={product.name} />
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
                    <img src={item.product?.image} alt={item.product?.name} />
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
                  <span>透明立体式购物袋 UI</span>
                  <span>满 ¥699 包邮</span>
                </div>

                <button type="button" className="primary-btn full-width">
                  Proceed To Checkout
                </button>
              </aside>
            </section>
          )}
        </main>

        <footer className="site-footer">
          <div>
            <p className="label">JOIN OUR MAILING LIST</p>
            <h3>把户外电商做得更像品牌系统，而不是普通模板。</h3>
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
