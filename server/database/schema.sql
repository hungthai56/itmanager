-- Lotus IT Command Server v0.6: MySQL 8+, UTF8MB4, InnoDB; always install using a restricted database user.
CREATE TABLE IF NOT EXISTS sites (
  id CHAR(36) PRIMARY KEY, code VARCHAR(32) NOT NULL UNIQUE, name VARCHAR(190) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND', active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, full_name VARCHAR(190) NOT NULL,
  job_title VARCHAR(120) NOT NULL DEFAULT '', department VARCHAR(120) NOT NULL DEFAULT '',
  role ENUM('SYS','MANAGER','SUPERVISOR','STAFF') NOT NULL,
  password_hash VARCHAR(255) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1,
  account_locked TINYINT(1) NOT NULL DEFAULT 0, failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  force_reset TINYINT(1) NOT NULL DEFAULT 0, default_site_id CHAR(36) NULL, report_to CHAR(36) NULL,
  overrides JSON NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_users_report (report_to), INDEX ix_users_site (default_site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS user_sites (
  user_id CHAR(36) NOT NULL, site_id CHAR(36) NOT NULL,
  PRIMARY KEY (user_id,site_id), INDEX ix_user_sites_site (site_id),
  CONSTRAINT fk_user_sites_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_sites_site FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS role_permissions (
  role ENUM('SYS','MANAGER','SUPERVISOR','STAFF') NOT NULL,
  module VARCHAR(40) NOT NULL, can_read TINYINT(1) NOT NULL, can_write TINYINT(1) NOT NULL,
  PRIMARY KEY (role,module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS access_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, user_id CHAR(36) NOT NULL,
  expires_at DATETIME(6) NOT NULL, revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_tokens_user (user_id), INDEX ix_tokens_expire (expires_at),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS login_throttle (
  fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0, window_start DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS records (
  id CHAR(36) PRIMARY KEY, site_id CHAR(36) NOT NULL, module VARCHAR(40) NOT NULL,
  data JSON NOT NULL, created_by CHAR(36) NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
  asset_code_key VARCHAR(160) GENERATED ALWAYS AS (CASE WHEN module='inventory' THEN LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(data,'$.assetCode')))) ELSE NULL END) STORED,
  roster_key VARCHAR(250) GENERATED ALWAYS AS (CASE WHEN module='roster' THEN CONCAT(JSON_UNQUOTE(JSON_EXTRACT(data,'$.employee')),'|',JSON_UNQUOTE(JSON_EXTRACT(data,'$.date'))) ELSE NULL END) STORED,
  checklist_key VARCHAR(350) GENERATED ALWAYS AS (CASE WHEN module='checklists' AND JSON_EXTRACT(data,'$.boardKey') IS NOT NULL THEN CONCAT(JSON_UNQUOTE(JSON_EXTRACT(data,'$.boardKey')),'|',JSON_UNQUOTE(JSON_EXTRACT(data,'$.periodKey'))) ELSE NULL END) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_records_site_module (site_id,module,updated_at), INDEX ix_records_owner (created_by),
  UNIQUE KEY uq_inventory_asset (site_id,asset_code_key),
  UNIQUE KEY uq_roster_day (site_id,roster_key),
  UNIQUE KEY uq_checklist_period (site_id,checklist_key),
  FOREIGN KEY(site_id) REFERENCES sites(id), FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS record_history (
  id CHAR(36) PRIMARY KEY, record_id CHAR(36) NOT NULL, site_id CHAR(36) NOT NULL,
  module VARCHAR(40) NOT NULL, action VARCHAR(50) NOT NULL, before_data JSON NULL,
  after_data JSON NULL, username VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_history_lookup (record_id,site_id,module,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NULL, username VARCHAR(100) NOT NULL,
  action VARCHAR(70) NOT NULL, site_id CHAR(36) NULL, details JSON NULL,
  ip_address VARCHAR(45) NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_audit_created (created_at), INDEX ix_audit_site (site_id,created_at), INDEX ix_audit_user (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS settings (
  site_id CHAR(36) NOT NULL DEFAULT '', `key` VARCHAR(80) NOT NULL, `value` JSON NOT NULL,
  PRIMARY KEY(site_id,`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS project_tasks (
  id CHAR(36) PRIMARY KEY, site_id CHAR(36) NOT NULL, project_id CHAR(36) NOT NULL,
  title VARCHAR(250) NOT NULL, owner VARCHAR(150) NOT NULL DEFAULT '', due_date DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Not Started', version INT UNSIGNED NOT NULL DEFAULT 1, notes TEXT NULL, created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_project_tasks_scope (site_id,project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS contract_addenda (
  id CHAR(36) PRIMARY KEY, site_id CHAR(36) NOT NULL, contract_id CHAR(36) NOT NULL,
  addendum_no VARCHAR(120) NOT NULL, signed_date DATE NULL, new_start_date DATE NULL,
  new_end_date DATE NOT NULL, amount DECIMAL(18,2) NOT NULL DEFAULT 0, summary TEXT, version INT UNSIGNED NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_addenda_scope (site_id,contract_id,new_end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;