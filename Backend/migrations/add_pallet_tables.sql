-- 创建 pallets 表
CREATE TABLE `pallets` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `pallet_code` VARCHAR(40) NOT NULL UNIQUE COMMENT '航空板号，如 PMC001、LD3-002',
  `forecast_id` BIGINT NOT NULL COMMENT '所属预报单',
  `pallet_type` VARCHAR(50) NULL COMMENT '板类型，如 PMC、LD3、AKE、木板等',
  
  -- 尺寸重量信息
  `length_cm` INT NULL COMMENT '长度(厘米)',
  `width_cm` INT NULL COMMENT '宽度(厘米)',
  `height_cm` INT NULL COMMENT '高度(厘米)',
  `weight_kg` DECIMAL(10,2) NULL COMMENT '总重量(公斤)',
  `box_count` INT DEFAULT 0 COMMENT '板上包裹数量',
  
  -- 仓库位置和状态管理
  `location_code` VARCHAR(50) NULL COMMENT '仓库内定位编码，如 A1-B2-C3',
  `status` ENUM('pending', 'stored', 'waiting_clear', 'unpacked', 'dispatched', 'returned') DEFAULT 'pending' COMMENT '板当前状态',
  
  -- 拆板和出库状态
  `is_unpacked` BOOLEAN DEFAULT FALSE COMMENT '是否已拆板',
  `is_full_board` BOOLEAN DEFAULT FALSE COMMENT '是否整板出库，无需拆板',
  
  -- 时间记录
  `inbound_time` DATETIME NULL COMMENT '实际入仓时间',
  `returned_time` DATETIME NULL COMMENT '板归还或送出时间',
  `position_updated_at` DATETIME NULL COMMENT '板位或状态最近更新时间',
  
  -- 操作信息
  `operator` VARCHAR(100) NULL COMMENT '最近操作人',
  `operator_id` BIGINT NULL COMMENT '最近操作人ID',
  
  `remark` TEXT NULL COMMENT '备注信息',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `idx_forecast_id` (`forecast_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_location_code` (`location_code`),
  INDEX `idx_is_unpacked` (`is_unpacked`),
  
  FOREIGN KEY (`forecast_id`) REFERENCES `forecasts`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建 pallet_logs 表
CREATE TABLE `pallet_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `pallet_id` BIGINT NOT NULL,
  `action` ENUM('created', 'inbound', 'location_updated', 'unpacked', 'packed', 'dispatched', 'returned', 'status_changed', 'weight_updated', 'remark_added') NOT NULL COMMENT '操作类型',
  `old_status` VARCHAR(50) NULL COMMENT '变更前状态',
  `new_status` VARCHAR(50) NULL COMMENT '变更后状态',
  `old_location` VARCHAR(50) NULL COMMENT '变更前位置',
  `new_location` VARCHAR(50) NULL COMMENT '变更后位置',
  `operator` VARCHAR(100) NULL COMMENT '操作人姓名',
  `operator_id` BIGINT NULL COMMENT '操作人ID',
  `description` TEXT NULL COMMENT '操作描述',
  `metadata` JSON NULL COMMENT '额外元数据，如包裹数量变化等',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `idx_pallet_id` (`pallet_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_operator_id` (`operator_id`),
  INDEX `idx_created_at` (`created_at`),
  
  FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 为 packages 表添加 pallet_id 字段和扫描相关字段
ALTER TABLE `packages` 
ADD COLUMN `pallet_id` BIGINT NULL COMMENT '所属航空板ID' AFTER `forecast_id`,
ADD COLUMN `tracking_no` VARCHAR(50) NULL COMMENT '追踪号/运单号' AFTER `package_code`,
ADD COLUMN `mawb` VARCHAR(50) NULL COMMENT '主运单号(Master Air Waybill)' AFTER `tracking_no`,
ADD COLUMN `hawb` VARCHAR(50) NULL COMMENT '分运单号(House Air Waybill)' AFTER `mawb`,
ADD INDEX `idx_pallet_id` (`pallet_id`),
ADD INDEX `idx_tracking_no` (`tracking_no`),
ADD INDEX `idx_mawb` (`mawb`),
ADD INDEX `idx_hawb` (`hawb`),
ADD FOREIGN KEY (`pallet_id`) REFERENCES `pallets`(`id`) ON DELETE SET NULL;

-- 更新 package_code 字段注释
ALTER TABLE `packages` 
MODIFY COLUMN `package_code` VARCHAR(40) NOT NULL UNIQUE COMMENT '包裹编号/箱唛号';
