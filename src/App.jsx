import { useMemo, useState } from 'react'

const imageUrl = (prompt, imageSize = 'landscape_4_3') =>
  `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(
    prompt,
  )}&image_size=${imageSize}`

const products = [
  {
    id: 1,
    name: 'Pulse Nova 01',
    category: '竞速跑鞋',
    price: 899,
    rating: 4.9,
    pace: '4:10 - 5:00/km',
    drop: '6mm',
    colorways: ['极夜黑', '霓光蓝', '银灰白'],
    image: imageUrl(
      'studio product photo of a futuristic carbon plate running shoe, streamlined silhouette, black engineered mesh, cyan accents, premium sports ecommerce lighting, isolated on dark gradient background',
      'square_hd',
    ),
    detail:
      '双层回弹中底与碳板推进结构，适合速度训练与比赛日穿着。',
  },
  {
    id: 2,
    name: 'Cloud Sprint Pro',
    category: '日常训练',
    price: 769,
    rating: 4.8,
    pace: '5:00 - 6:20/km',
    drop: '8mm',
    colorways: ['云雾白', '深海蓝', '钛灰'],
    image: imageUrl(
      'premium running shoe product render, white and cobalt training sneaker with engineered knit upper and sculpted foam sole, modern sports brand ecommerce photo, isolated background',
      'square_hd',
    ),
    detail: '稳定支撑与柔韧缓震平衡，适合高频训练和健身通勤。',
  },
  {
    id: 3,
    name: 'Terrain Shift X',
    category: '越野跑鞋',
    price: 999,
    rating: 4.7,
    pace: '全地形',
    drop: '5mm',
    colorways: ['岩层灰', '丛林绿', '熔岩橙'],
    image: imageUrl(
      'trail running shoe product image, aggressive outsole, dark graphite upper with neon green details, premium sportswear lighting, outdoor inspired background, ecommerce hero asset',
      'square_hd',
    ),
    detail: '抓地外底与包裹式鞋身结构，适应碎石、泥地与混合路面。',
  },
]

const metrics = [
  { value: '78%', label: '复购来自训练用户' },
  { value: '48h', label: '热门城市闪电发货' },
  { value: '4.9/5', label: '专业跑者评分' },
]

const technologies = [
  {
    title: 'AeroFoam 回弹中底',
    body: '提供长距离缓震与前掌快速回弹，让节奏转换更轻盈。',
  },
  {
    title: 'Carbon Arc 推进板',
    body: '强化离地推进感，适合间歇、节奏跑和赛事配速输出。',
  },
  {
    title: 'FitKnit 动态鞋面',
    body: '在透气与包裹之间取得平衡，减少长距离训练中的闷热感。',
  },
]

const reviews = [
  {
    name: '周岳 / 半马 1:31',
    text: '节奏跑时推进感很明显，前掌响应快，但落地仍然稳。',
  },
  {
    name: 'Lina / 城市晨跑',
    text: '鞋身包裹很舒服，跑后半程脚背也不会压迫，通勤穿也顺眼。',
  },
]

const navItems = [
  { key: 'home', label: '首页' },
  { key: 'catalog', label: '跑鞋分类' },
  { key: 'detail', label: '商品详情' },
  { key: 'cart', label: '购物车' },
]

function App() {
  const [activeView, setActiveView] = useState('home')
  const [selectedProductId, setSelectedProductId] = useState(products[0].id)
  const [selectedSize, setSelectedSize] = useState('42')
  const [selectedColor, setSelectedColor] = useState(products[0].colorways[0])
  const [cartItems, setCartItems] = useState([
    {
      productId: 2,
      size: '41',
      color: '深海蓝',
      quantity: 1,
    },
  ])

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
    const shipping = subtotal > 0 ? 24 : 0
    const total = subtotal + shipping

    return { lineItems, subtotal, shipping, total }
  }, [cartItems])

  const openProduct = (product) => {
    setSelectedProductId(product.id)
    setSelectedColor(product.colorways[0])
    setSelectedSize('42')
    setActiveView('detail')
  }

  const addToCart = () => {
    setCartItems((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          item.productId === selectedProduct.id &&
          item.size === selectedSize &&
          item.color === selectedColor,
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
          productId: selectedProduct.id,
          size: selectedSize,
          color: selectedColor,
          quantity: 1,
        },
      ]
    })

    setActiveView('cart')
  }

  const updateQuantity = (productId, delta) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">SX</div>
          <div>
            <p className="brand-name">Stride X</p>
            <p className="brand-tag">Performance Running Store</p>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activeView ? 'nav-tab is-active' : 'nav-tab'}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="cart-badge"
          onClick={() => setActiveView('cart')}
        >
          购物车
          <span>{cartItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
        </button>
      </header>

      <main>
        {activeView === 'home' && (
          <>
            <section className="hero panel">
              <div className="hero-copy">
                <p className="section-kicker">为稳定配速与突破而生</p>
                <h1>跑得更快，也跑得更久。</h1>
                <p className="hero-body">
                  面向跑步健身用户打造的运动科技鞋站原型，兼顾品牌质感、性能表达与电商转化。
                </p>

                <div className="hero-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => setActiveView('catalog')}
                  >
                    进入跑鞋分类
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => openProduct(products[0])}
                  >
                    查看明星鞋款
                  </button>
                </div>

                <div className="metric-row">
                  {metrics.map((metric) => (
                    <div className="metric-card" key={metric.label}>
                      <strong>{metric.value}</strong>
                      <span>{metric.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hero-visual">
                <div className="hero-glow" />
                <img
                  src={imageUrl(
                    'premium ecommerce hero image of an advanced running shoe, sleek black and blue racer floating above reflective dark surface, dramatic sports tech lighting, futuristic retail campaign, no text',
                    'portrait_16_9',
                  )}
                  alt="Stride X 运动科技跑鞋主视觉"
                />
                <div className="floating-spec spec-left">
                  <span>Midsole</span>
                  <strong>AeroFoam</strong>
                </div>
                <div className="floating-spec spec-right">
                  <span>Propulsion</span>
                  <strong>Carbon Arc</strong>
                </div>
              </div>
            </section>

            <section className="section-grid">
              <div className="section-heading">
                <p className="section-kicker">精选系列</p>
                <h2>从日常训练到比赛日，一站完成选择。</h2>
              </div>

              <div className="product-grid">
                {products.map((product) => (
                  <article className="product-card panel" key={product.id}>
                    <img src={product.image} alt={product.name} />
                    <div className="product-meta">
                      <div>
                        <p className="eyebrow">{product.category}</p>
                        <h3>{product.name}</h3>
                      </div>
                      <span className="rating">{product.rating}</span>
                    </div>
                    <p className="product-detail">{product.detail}</p>
                    <div className="product-specs">
                      <span>建议配速 {product.pace}</span>
                      <span>落差 {product.drop}</span>
                    </div>
                    <div className="product-footer">
                      <strong>¥{product.price}</strong>
                      <button type="button" onClick={() => openProduct(product)}>
                        查看详情
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="tech-layout panel">
              <div className="section-heading">
                <p className="section-kicker">核心科技</p>
                <h2>把性能表达做成用户能感知的购买理由。</h2>
              </div>

              <div className="tech-grid">
                <div className="tech-list">
                  {technologies.map((item) => (
                    <article key={item.title} className="tech-card">
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
                <div className="tech-image">
                  <img
                    src={imageUrl(
                      'exploded view product render of high performance running shoe components, carbon plate, cushioned foam, breathable knit upper, blue cyan accents, premium athletic technology visual, dark background',
                      'portrait_4_3',
                    )}
                    alt="跑鞋科技拆解示意"
                  />
                </div>
              </div>
            </section>

            <section className="experience-grid">
              <div className="coach-card panel">
                <p className="section-kicker">选鞋助手</p>
                <h2>按训练目标快速推荐。</h2>
                <div className="goal-chips">
                  <span>日常慢跑</span>
                  <span>半马突破</span>
                  <span>健身房交叉训练</span>
                  <span>周末长距离</span>
                </div>
                <p>
                  这部分在真实站点里可扩展成脚型问答、配速建议和尺码推荐模块，提升转化效率。
                </p>
              </div>

              <div className="review-card panel">
                <p className="section-kicker">跑者反馈</p>
                <h2>真实体验强化决策。</h2>
                {reviews.map((review) => (
                  <blockquote key={review.name}>
                    <p>{review.text}</p>
                    <footer>{review.name}</footer>
                  </blockquote>
                ))}
              </div>
            </section>
          </>
        )}

        {activeView === 'catalog' && (
          <section className="catalog-layout">
            <div className="catalog-sidebar panel">
              <p className="section-kicker">筛选条件</p>
              <h2>跑鞋分类页</h2>
              <div className="filter-group">
                <span>场景</span>
                <div className="chip-row">
                  <button type="button" className="chip active">
                    日常训练
                  </button>
                  <button type="button" className="chip">
                    竞速比赛
                  </button>
                  <button type="button" className="chip">
                    越野地形
                  </button>
                </div>
              </div>
              <div className="filter-group">
                <span>价格</span>
                <div className="range-card">
                  <strong>¥699 - ¥1099</strong>
                  <small>主力成交区间</small>
                </div>
              </div>
              <div className="filter-group">
                <span>缓震等级</span>
                <div className="chip-row">
                  <button type="button" className="chip active">
                    中高缓震
                  </button>
                  <button type="button" className="chip">
                    支撑稳定
                  </button>
                </div>
              </div>
            </div>

            <div className="catalog-content">
              <div className="catalog-header panel">
                <div>
                  <p className="section-kicker">Stride X Collection</p>
                  <h2>适合跑步健身用户的核心鞋款</h2>
                </div>
                <button type="button" className="ghost-btn">
                  综合排序
                </button>
              </div>

              <div className="catalog-grid">
                {products.map((product) => (
                  <article key={product.id} className="catalog-card panel">
                    <img src={product.image} alt={product.name} />
                    <div className="catalog-copy">
                      <div className="catalog-title">
                        <div>
                          <p className="eyebrow">{product.category}</p>
                          <h3>{product.name}</h3>
                        </div>
                        <strong>¥{product.price}</strong>
                      </div>
                      <p>{product.detail}</p>
                      <div className="product-specs">
                        <span>{product.pace}</span>
                        <span>{product.drop}</span>
                        <span>{product.rating} 分</span>
                      </div>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => openProduct(product)}
                      >
                        进入详情页
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeView === 'detail' && (
          <section className="detail-layout">
            <div className="detail-gallery panel">
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
                      setSelectedColor(product.colorways[0])
                    }}
                  >
                    <img src={product.image} alt={product.name} />
                  </button>
                ))}
              </div>
            </div>

            <div className="detail-info panel">
              <p className="section-kicker">{selectedProduct.category}</p>
              <h2>{selectedProduct.name}</h2>
              <div className="detail-price-row">
                <strong>¥{selectedProduct.price}</strong>
                <span>专业跑者评分 {selectedProduct.rating}</span>
              </div>
              <p className="detail-description">{selectedProduct.detail}</p>

              <div className="detail-block">
                <span>颜色</span>
                <div className="chip-row">
                  {selectedProduct.colorways.map((color) => (
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
                <span>尺码</span>
                <div className="chip-row">
                  {['40', '41', '42', '43', '44'].map((size) => (
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
                  <span>建议配速</span>
                  <strong>{selectedProduct.pace}</strong>
                </div>
                <div>
                  <span>鞋跟落差</span>
                  <strong>{selectedProduct.drop}</strong>
                </div>
                <div>
                  <span>运费政策</span>
                  <strong>满 ¥999 包邮</strong>
                </div>
              </div>

              <div className="hero-actions">
                <button type="button" className="primary-btn" onClick={addToCart}>
                  加入购物车
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setActiveView('catalog')}
                >
                  返回分类页
                </button>
              </div>
            </div>
          </section>
        )}

        {activeView === 'cart' && (
          <section className="cart-layout">
            <div className="cart-list panel">
              <p className="section-kicker">购物车</p>
              <h2>准备结账</h2>

              {cartSummary.lineItems.length === 0 && (
                <div className="empty-state">
                  <p>购物车还是空的，先去挑一双适合你的跑鞋。</p>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => setActiveView('catalog')}
                  >
                    去逛跑鞋分类
                  </button>
                </div>
              )}

              {cartSummary.lineItems.map((item) => (
                <article key={`${item.productId}-${item.size}-${item.color}`} className="cart-item">
                  <img src={item.product?.image} alt={item.product?.name} />
                  <div className="cart-copy">
                    <div>
                      <p className="eyebrow">{item.product?.category}</p>
                      <h3>{item.product?.name}</h3>
                    </div>
                    <p>
                      颜色 {item.color} / 尺码 {item.size}
                    </p>
                    <strong>¥{item.subtotal}</strong>
                  </div>
                  <div className="stepper">
                    <button type="button" onClick={() => updateQuantity(item.productId, -1)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.productId, 1)}>
                      +
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <aside className="checkout-card panel">
              <p className="section-kicker">订单摘要</p>
              <h2>结账卡片</h2>
              <div className="summary-row">
                <span>商品金额</span>
                <strong>¥{cartSummary.subtotal}</strong>
              </div>
              <div className="summary-row">
                <span>运费</span>
                <strong>¥{cartSummary.shipping}</strong>
              </div>
              <div className="summary-row total">
                <span>合计</span>
                <strong>¥{cartSummary.total}</strong>
              </div>

              <div className="checkout-benefits">
                <span>支持 7 天无忧退换</span>
                <span>热门城市 48 小时送达</span>
                <span>下单后推送尺码建议与穿着提示</span>
              </div>

              <button type="button" className="primary-btn full-width">
                前往结账
              </button>
            </aside>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
