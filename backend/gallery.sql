-- =====================================================================
-- Nisha Gallery (founder approved 2026-10-30): artworks with a normal copy and a 1-of-1 NFT copy,
-- orders paid by Razorpay or crypto (Polygon, Ethereum, BNB Smart Chain, Bitcoin, Solana).
-- Everything is read and written by the MedDroid chat Worker with the service key (/gallery/* routes);
-- the browser never talks to these tables directly. Run once in Supabase → SQL editor. Safe to re-run.
-- =====================================================================

-- 1) Images. Public bucket for the web-size image shown on the site; private bucket for the full-resolution
--    original, handed to buyers through short-lived signed links only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-originals', 'gallery-originals', false, 52428800, array['image/jpeg','image/png','image/webp','image/tiff'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2) Artworks. Each one has a normal copy (print / download, many sales) and one NFT copy (sold once).
create sequence if not exists gallery_nft_token_seq start 1;
create table if not exists gallery_artworks (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  artist        text not null default '',
  medium        text not null default '',
  about         text not null default '',
  image_url     text not null,                       -- public web-size image
  original_path text not null default '',            -- path in gallery-originals
  copy_price    integer not null check (copy_price >= 0),   -- rupees
  nft_price     integer not null check (nft_price >= 0),    -- rupees
  nft_token     integer unique not null default nextval('gallery_nft_token_seq'),
  nft_status    text not null default 'available' check (nft_status in ('available','reserved','sold')),
  reserved_until timestamptz,
  nft_owner     text not null default '',            -- buyer's wallet
  mint_tx       text not null default '',            -- set when the NFT is minted to the buyer
  on_home       boolean not null default true,
  home_order    integer not null default 0,
  published     boolean not null default true,
  copies_sold   integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists gallery_artworks_home on gallery_artworks (on_home, home_order);

-- 3) Orders.
create table if not exists gallery_orders (
  id            uuid primary key default gen_random_uuid(),
  artwork_id    uuid not null references gallery_artworks(id) on delete restrict,
  edition       text not null check (edition in ('copy','nft')),
  method        text not null check (method in ('razorpay','polygon','eth','bnb','btc','sol')),
  amount_inr    integer not null,
  crypto_amount text not null default '',            -- e.g. "12.345678" in the coin below
  crypto_coin   text not null default '',
  pay_to        text not null default '',            -- receiver wallet / address at order time
  reference     text not null default '',            -- Solana Pay reference key
  rzp_order_id  text unique,
  payment_ref   text unique,                         -- Razorpay payment id or on-chain tx hash (never reused)
  status        text not null default 'created' check (status in ('created','paid','failed','expired')),
  buyer_name    text not null default '',
  buyer_email   text not null default '',
  buyer_phone   text not null default '',
  ship_address  text not null default '',
  buyer_wallet  text not null default '',            -- where the NFT goes
  fulfil_status text not null default 'todo' check (fulfil_status in ('todo','shipped','minted','done')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  paid_at       timestamptz
);
create index if not exists gallery_orders_status on gallery_orders (status, created_at desc);

-- 4) One settings row: where money goes.
create table if not exists gallery_settings (
  id           integer primary key default 1 check (id = 1),
  evm_wallet   text not null default '',   -- Polygon, Ethereum and BNB Smart Chain (same 0x address)
  btc_address  text not null default '',
  sol_address  text not null default '',
  royalty_pct  integer not null default 10 check (royalty_pct between 0 and 20),
  nft_contract text not null default '',   -- ERC-721 contract on Polygon, once deployed
  updated_at   timestamptz not null default now()
);
insert into gallery_settings (id) values (1) on conflict (id) do nothing;

-- 5) Lock the tables: no anon/authenticated access at all (the Worker uses the service key).
alter table gallery_artworks enable row level security;
alter table gallery_orders   enable row level security;
alter table gallery_settings enable row level security;
