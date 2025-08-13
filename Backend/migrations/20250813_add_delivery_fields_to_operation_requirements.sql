-- 添加配送目的地内嵌字段到 operation_requirements 表
ALTER TABLE `operation_requirements`
  ADD COLUMN `delivery_destination_type` ENUM('region','city','zone','hub','other') NULL AFTER `carrier_channel`,
  ADD COLUMN `delivery_destination_code` VARCHAR(50) NULL AFTER `delivery_destination_type`,
  ADD COLUMN `delivery_destination_name` VARCHAR(100) NULL AFTER `delivery_destination_code`,
  ADD COLUMN `delivery_route_note` VARCHAR(255) NULL AFTER `delivery_destination_name`;

-- 索引（组合索引便于查询）
CREATE INDEX `idx_operation_requirements_delivery_dest` ON `operation_requirements` (`delivery_destination_type`, `delivery_destination_code`);
CREATE INDEX `idx_operation_requirements_distribution_mode` ON `operation_requirements` (`distribution_mode`);
CREATE INDEX `idx_operation_requirements_carrier_channel` ON `operation_requirements` (`carrier_channel`);

-- 由于 MySQL 不支持条件唯一索引，这里不对 delivery 组合做唯一约束，可在应用层控制
-- 如果需要防止完全重复，可建立一个普通组合索引即可（已建）。
