create extension if not exists "pgcrypto";

create type public.app_role as enum ('customer', 'admin');
create type public.order_status as enum ('pending', 'paid', 'cancelled', 'fulfilled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  frontend_key integer not null unique,
  slug text not null unique,
  name text not null,
  category text not null,
  base_price integer not null check (base_price > 0),
  currency text not null default 'cny',
  rating numeric(2, 1) not null default 5.0,
  pace text,
  drop_label text,
  detail text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  color text not null,
  size text not null,
  price integer not null check (price > 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  stripe_price_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (product_id, color, size)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  customer_email text not null,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'pending',
  currency text not null default 'cny',
  subtotal integer not null default 0,
  shipping integer not null default 0,
  total integer not null default 0,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  shipping_address jsonb,
  billing_address jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.orders add column if not exists shipping_carrier text;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists fulfilled_at timestamptz;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  sku text,
  color text,
  size text,
  unit_price integer not null,
  quantity integer not null check (quantity > 0),
  line_total integer not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_products_active on public.products (is_active, category);
create index if not exists idx_product_variants_product_stock on public.product_variants (product_id, stock_quantity desc);
create index if not exists idx_orders_user_created on public.orders (user_id, created_at desc);
create index if not exists idx_orders_status_created on public.orders (status, created_at desc);
create index if not exists idx_orders_tracking_number on public.orders (tracking_number) where tracking_number is not null;
create index if not exists idx_order_items_order on public.order_items (order_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_products_updated_at on public.products;
create trigger touch_products_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists touch_product_variants_updated_at on public.product_variants;
create trigger touch_product_variants_updated_at
before update on public.product_variants
for each row execute function public.touch_updated_at();

drop trigger if exists touch_orders_updated_at on public.orders;
create trigger touch_orders_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.mark_order_paid(
  order_uuid uuid,
  checkout_session_id_input text,
  payment_intent_id_input text,
  shipping_address_input jsonb default null,
  billing_address_input jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment_status public.payment_status;
  item record;
begin
  select payment_status
  into current_payment_status
  from public.orders
  where id = order_uuid
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if current_payment_status = 'paid' then
    return false;
  end if;

  for item in
    select variant_id, quantity, product_name
    from public.order_items
    where order_id = order_uuid
      and variant_id is not null
  loop
    update public.product_variants
    set stock_quantity = stock_quantity - item.quantity
    where id = item.variant_id
      and stock_quantity >= item.quantity;

    if not found then
      raise exception 'Insufficient stock when finalizing paid order for %', coalesce(item.product_name, 'variant');
    end if;
  end loop;

  update public.orders
  set
    status = 'paid',
    payment_status = 'paid',
    stripe_checkout_session_id = checkout_session_id_input,
    stripe_payment_intent_id = nullif(payment_intent_id_input, ''),
    shipping_address = coalesce(shipping_address_input, shipping_address),
    billing_address = coalesce(billing_address_input, billing_address)
  where id = order_uuid;

  return true;
end;
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
on public.profiles
for select
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
on public.products
for select
using (is_active = true or public.is_admin());

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write"
on public.products
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "variants_public_read" on public.product_variants;
create policy "variants_public_read"
on public.product_variants
for select
using (
  exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and (products.is_active = true or public.is_admin())
  )
);

drop policy if exists "variants_admin_write" on public.product_variants;
create policy "variants_admin_write"
on public.product_variants
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "orders_own_read" on public.orders;
create policy "orders_own_read"
on public.orders
for select
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "orders_own_insert" on public.orders;
create policy "orders_own_insert"
on public.orders
for insert
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
on public.orders
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "order_items_own_read" on public.order_items;
create policy "order_items_own_read"
on public.order_items
for select
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "order_items_own_insert" on public.order_items;
create policy "order_items_own_insert"
on public.order_items
for insert
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (orders.user_id = auth.uid() or public.is_admin())
  )
);

insert into public.products (
  frontend_key,
  slug,
  name,
  category,
  base_price,
  rating,
  pace,
  drop_label,
  detail,
  image_url
)
values
  (
    1,
    'aether-ridge-gtx',
    'Aether Ridge GTX',
    'HIKING BOOTS',
    89900,
    4.9,
    '防水山地',
    'Vibram Lite',
    '面向高频徒步与城市通勤的混合型靴款，兼顾防护、轻量和利落轮廓。',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20hiking%20boot%20product%20render%2C%20silver%20gray%20waterproof%20boot%20with%20sculpted%20sole%2C%20isolated%20on%20translucent%20frosted%20background%2C%20luxury%20ecommerce%20lighting&image_size=square_hd'
  ),
  (
    2,
    'urban-traverse-lite',
    'Urban Traverse Lite',
    'HIKING SHOES',
    76900,
    4.8,
    '轻徒步 / 通勤',
    'Flex Shell',
    '更适合城市移动与周末短途，鞋型更轻，更符合 iOS 风格页面里的精致表达。',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20outdoor%20sneaker%20product%20render%2C%20sleek%20pale%20blue%20hiking%20shoe%20with%20translucent%20sole%20details%2C%20isolated%20ecommerce%20image%2C%20clean%20luxury%20lighting&image_size=square_hd'
  ),
  (
    3,
    'worknova-shield',
    'Worknova Shield',
    'WORK BOOTS',
    99900,
    4.7,
    '工装稳定',
    'Shock Guard',
    '强调全天稳定与抗冲击表现，适合把功能型鞋款做成更高级的品牌展示。',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20work%20boot%20product%20render%2C%20structured%20tan%20utility%20boot%20with%20high%20ankle%20support%2C%20isolated%20on%20soft%20frosted%20glass%20background%2C%20high%20end%20ecommerce%20photo&image_size=square_hd'
  ),
  (
    4,
    'vapor-trail-shell',
    'Vapor Trail Shell',
    'MILITARY BOOTS',
    85900,
    4.8,
    '机能训练',
    'Grip Core',
    '更偏机能审美的户外战术靴，用于强化品牌辨识度和男装线条感。',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20tactical%20boot%20product%20render%2C%20modern%20black%20lightweight%20combat%20boot%20with%20refined%20design%2C%20isolated%20on%20elegant%20translucent%20background%2C%20premium%20retail%20style&image_size=square_hd'
  )
on conflict (frontend_key) do update set
  slug = excluded.slug,
  name = excluded.name,
  category = excluded.category,
  base_price = excluded.base_price,
  rating = excluded.rating,
  pace = excluded.pace,
  drop_label = excluded.drop_label,
  detail = excluded.detail,
  image_url = excluded.image_url,
  is_active = true;

with colors as (
  select
    p.id as product_id,
    p.frontend_key,
    p.base_price,
    c.color,
    c.ordinality
  from public.products p
  join lateral unnest(
    case p.frontend_key
      when 1 then array['冰川银', '玄岩黑', '沙岩灰']
      when 2 then array['雾蓝灰', '星云白', '夜幕黑']
      when 3 then array['棕褐', '黑曜', '雾卡其']
      else array['曜石黑', '军绿灰', '风暴棕']
    end
  ) with ordinality as c(color, ordinality) on true
),
sizes as (
  select unnest(array['40', '41', '42', '43', '44']) as size
)
insert into public.product_variants (
  product_id,
  sku,
  color,
  size,
  price,
  stock_quantity
)
select
  colors.product_id,
  format('SKU-%s-%s-%s', colors.frontend_key, colors.ordinality, sizes.size),
  colors.color,
  sizes.size,
  colors.base_price,
  24
from colors
cross join sizes
on conflict (product_id, color, size) do update set
  price = excluded.price,
  stock_quantity = excluded.stock_quantity;
