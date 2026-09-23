-- Ranges mirror LIMITS in @iota/shared. Zod rejects bad input first; these constraints are the
-- backstop that keeps the data valid whatever writes to it. Tests in step 4 check they agree.

CREATE TYPE device_type AS ENUM ('light', 'thermostat', 'camera');
CREATE TYPE thermostat_mode AS ENUM ('heat', 'cool', 'auto');
CREATE TYPE camera_resolution AS ENUM ('720p', '1080p', '4k');

CREATE TABLE devices (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       device_type NOT NULL,
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  room       text        CHECK (room IS NULL OR char_length(room) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Lets subtype tables reference (id, type), so a row can only attach to a device of its type.
  UNIQUE (id, type)
);

CREATE TABLE lights (
  device_id            uuid        PRIMARY KEY,
  type                 device_type NOT NULL DEFAULT 'light' CHECK (type = 'light'),
  is_on                boolean     NOT NULL,
  brightness           smallint    NOT NULL CHECK (brightness BETWEEN 0 AND 100),
  colour_temperature_k smallint    NOT NULL CHECK (colour_temperature_k BETWEEN 2700 AND 6500),
  FOREIGN KEY (device_id, type) REFERENCES devices (id, type) ON DELETE CASCADE
);

CREATE TABLE thermostats (
  device_id             uuid            PRIMARY KEY,
  type                  device_type     NOT NULL DEFAULT 'thermostat' CHECK (type = 'thermostat'),
  is_on                 boolean         NOT NULL,
  mode                  thermostat_mode NOT NULL,
  target_temperature_c  numeric(3, 1)   NOT NULL CHECK (
    target_temperature_c BETWEEN 5 AND 30
    AND target_temperature_c * 2 = trunc(target_temperature_c * 2)  -- half-degree steps
  ),
  current_temperature_c numeric(3, 1),
  FOREIGN KEY (device_id, type) REFERENCES devices (id, type) ON DELETE CASCADE
);

CREATE TABLE cameras (
  device_id          uuid              PRIMARY KEY,
  type               device_type       NOT NULL DEFAULT 'camera' CHECK (type = 'camera'),
  is_armed           boolean           NOT NULL,
  resolution         camera_resolution NOT NULL,
  motion_sensitivity smallint          NOT NULL CHECK (motion_sensitivity BETWEEN 1 AND 10),
  FOREIGN KEY (device_id, type) REFERENCES devices (id, type) ON DELETE CASCADE
);