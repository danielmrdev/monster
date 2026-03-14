-- Migration 004 (2026-03-14): Add severity column to product_alerts.
-- NOT NULL DEFAULT 'warning' — existing rows get 'warning' automatically.
-- Check constraint matches M006/S02 alert creation logic: 'warning'|'critical'.

ALTER TABLE product_alerts ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'warning';
ALTER TABLE product_alerts ADD CONSTRAINT product_alerts_severity_check
  CHECK (severity IN ('warning', 'critical'));
