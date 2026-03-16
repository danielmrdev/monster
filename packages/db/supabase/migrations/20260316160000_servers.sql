CREATE TABLE IF NOT EXISTS servers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  provider          text        NOT NULL DEFAULT 'hetzner',
  external_id       bigint,
  status            text        NOT NULL DEFAULT 'provisioning',
  public_ip         text,
  tailscale_ip      text,
  datacenter        text,
  server_type       text,
  ssh_user          text        NOT NULL DEFAULT 'root',
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_health_check timestamptz
);

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
