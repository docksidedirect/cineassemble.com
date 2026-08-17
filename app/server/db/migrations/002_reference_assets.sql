ALTER TABLE assets
  MODIFY COLUMN kind ENUM(
    'product_original',
    'product_cutout',
    'character_reference',
    'human_reference',
    'style_reference',
    'reference_image',
    'brand_logo',
    'voice_sample',
    'background_music',
    'scene_image',
    'scene_audio',
    'scene_clip',
    'scene_lipsync',
    'final_video',
    'thumbnail',
    'other'
  ) NOT NULL;

ALTER TABLE job_assets
  MODIFY COLUMN asset_role ENUM(
    'product',
    'character',
    'presenter',
    'style_reference',
    'reference',
    'logo',
    'voice',
    'background',
    'music'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS reference_library (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(140) NOT NULL,
  reference_type ENUM('character', 'human', 'style', 'general') NOT NULL,
  asset_id CHAR(36) NOT NULL,
  description TEXT NULL,
  preservation_notes TEXT NULL,
  profile JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_reference_library_user_type (user_id, reference_type, created_at),
  CONSTRAINT fk_reference_library_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reference_library_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
