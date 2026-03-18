CREATE TABLE players (
  telegram_user_id BIGINT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT '',
  referral_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_state (
  telegram_user_id BIGINT PRIMARY KEY REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  meat NUMERIC(20, 2) NOT NULL DEFAULT 0,
  click_power INTEGER NOT NULL DEFAULT 1,
  click_upgrades INTEGER NOT NULL DEFAULT 0,
  ferns INTEGER NOT NULL DEFAULT 0,
  total_purchases INTEGER NOT NULL DEFAULT 0,
  fortune_points INTEGER NOT NULL DEFAULT 0,
  free_spins INTEGER NOT NULL DEFAULT 0,
  spin_index INTEGER NOT NULL DEFAULT 0,
  referral_successful_invites INTEGER NOT NULL DEFAULT 0,
  referral_pending_invites INTEGER NOT NULL DEFAULT 0,
  last_passive_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE player_inventory (
  telegram_user_id BIGINT NOT NULL REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (telegram_user_id, item_id)
);

CREATE TABLE player_quests (
  telegram_user_id BIGINT NOT NULL REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title_template TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  target NUMERIC(20, 2) NOT NULL DEFAULT 0,
  progress NUMERIC(20, 2) NOT NULL DEFAULT 0,
  reward_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  link TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (telegram_user_id, quest_id)
);

CREATE TABLE shop_products (
  product_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'stars',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_amount INTEGER NOT NULL,
  stars_price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XTR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE telegram_payments (
  payment_id UUID PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES shop_products(product_id),
  status TEXT NOT NULL,
  invoice_url TEXT NOT NULL DEFAULT '',
  invoice_slug TEXT NOT NULL DEFAULT '',
  external_charge_id TEXT UNIQUE,
  idempotency_key TEXT UNIQUE,
  reward_type TEXT NOT NULL,
  reward_amount INTEGER NOT NULL,
  stars_price INTEGER NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transactions (
  transaction_id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount_meat NUMERIC(20, 2) NOT NULL DEFAULT 0,
  amount_ferns INTEGER NOT NULL DEFAULT 0,
  amount_free_spins INTEGER NOT NULL DEFAULT 0,
  amount_fortune_points INTEGER NOT NULL DEFAULT 0,
  item_id TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_users (
  telegram_user_id BIGINT PRIMARY KEY REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  admin_telegram_user_id BIGINT NOT NULL REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  target_telegram_user_id BIGINT NOT NULL REFERENCES players(telegram_user_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_players_last_seen_at ON players (last_seen_at DESC);
CREATE INDEX idx_player_state_updated_at ON player_state (updated_at DESC);
CREATE INDEX idx_player_inventory_updated_at ON player_inventory (updated_at DESC);
CREATE INDEX idx_player_quests_updated_at ON player_quests (updated_at DESC);
CREATE INDEX idx_telegram_payments_user_created_at ON telegram_payments (telegram_user_id, created_at DESC);
CREATE INDEX idx_transactions_user_created_at ON transactions (telegram_user_id, created_at DESC);
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log (created_at DESC);
