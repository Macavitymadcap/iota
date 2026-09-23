import type { SQL } from "bun";
import { type CreateDevice, Device, type DeviceType, type UpdateDevice } from "@iota/shared";
import { DeviceNotFound, TypeMismatch } from "../errors";

export type DeviceFilters = {
  type?: DeviceType | undefined;
  room?: string | undefined;
};

/** A change to operational state, as produced by an action. */
export type StateChange =
  | { type: "light" | "thermostat"; isOn: boolean }
  | { type: "camera"; isArmed: boolean };

/** One row of the base table joined to all three subtype tables; unused columns are null. */
type DeviceRow = {
  id: string;
  type: DeviceType;
  name: string;
  room: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  light_is_on: boolean | null;
  brightness: number | null;
  colour_temperature_k: number | null;
  thermostat_is_on: boolean | null;
  mode: string | null;
  target_temperature_c: string | number | null;
  current_temperature_c: string | number | null;
  is_armed: boolean | null;
  resolution: string | null;
  motion_sensitivity: number | null;
};

// Postgres numeric arrives as a string to preserve precision; our values fit a double safely.
const toNumber = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const toIso = (value: Date | string): string => new Date(value).toISOString();

function toDevice(row: DeviceRow): Device {
  const base = {
    id: row.id,
    name: row.name,
    room: row.room,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };

  switch (row.type) {
    case "light":
      return Device.parse({
        ...base,
        type: "light",
        isOn: row.light_is_on,
        brightness: row.brightness,
        colourTemperatureK: row.colour_temperature_k,
      });
    case "thermostat":
      return Device.parse({
        ...base,
        type: "thermostat",
        isOn: row.thermostat_is_on,
        mode: row.mode,
        targetTemperatureC: toNumber(row.target_temperature_c),
        currentTemperatureC: toNumber(row.current_temperature_c),
      });
    case "camera":
      return Device.parse({
        ...base,
        type: "camera",
        isArmed: row.is_armed,
        resolution: row.resolution,
        motionSensitivity: row.motion_sensitivity,
      });
  }
}

/** Drops undefined values but keeps null, so a PATCH can clear a nullable column. */
function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

const hasKeys = (value: object): boolean => Object.keys(value).length > 0;

const selectDevices = (db: SQL) => db`
  SELECT
    d.id, d.type, d.name, d.room, d.created_at, d.updated_at,
    l.is_on AS light_is_on, l.brightness, l.colour_temperature_k,
    t.is_on AS thermostat_is_on, t.mode, t.target_temperature_c, t.current_temperature_c,
    c.is_armed, c.resolution, c.motion_sensitivity
  FROM devices d
  LEFT JOIN lights l ON l.device_id = d.id
  LEFT JOIN thermostats t ON t.device_id = d.id
  LEFT JOIN cameras c ON c.device_id = d.id
`;

async function findOne(db: SQL, id: string): Promise<Device | null> {
  const rows: DeviceRow[] = await db`${selectDevices(db)} WHERE d.id = ${id}`;
  const row = rows[0];
  return row ? toDevice(row) : null;
}

async function findOrThrow(db: SQL, id: string): Promise<Device> {
  const device = await findOne(db, id);
  if (!device) throw new DeviceNotFound(id);
  return device;
}

/** Reads a device's type and locks its row until the transaction ends. */
async function lockDevice(tx: SQL, id: string): Promise<DeviceType> {
  const rows: { type: DeviceType }[] = await tx`
    SELECT type FROM devices WHERE id = ${id} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new DeviceNotFound(id);
  return row.type;
}

export function createDeviceRepository(db: SQL) {
  return {
    async list(filters: DeviceFilters = {}): Promise<Device[]> {
      const type = filters.type ?? null;
      const room = filters.room ?? null;
      const rows: DeviceRow[] = await db`
        ${selectDevices(db)}
        WHERE (${type}::device_type IS NULL OR d.type = ${type}::device_type)
          AND (${room}::text IS NULL OR d.room = ${room})
        ORDER BY d.room NULLS LAST, d.name
      `;
      return rows.map(toDevice);
    },

    findById(id: string): Promise<Device | null> {
      return findOne(db, id);
    },

    create(input: CreateDevice): Promise<Device> {
      return db.begin(async (tx) => {
        const rows: { id: string }[] = await tx`
          INSERT INTO devices (type, name, room)
          VALUES (${input.type}, ${input.name}, ${input.room})
          RETURNING id
        `;
        const id = rows[0]?.id;
        if (!id) throw new Error("Device insert returned no id");

        switch (input.type) {
          case "light":
            await tx`
              INSERT INTO lights (device_id, is_on, brightness, colour_temperature_k)
              VALUES (${id}, ${input.isOn}, ${input.brightness}, ${input.colourTemperatureK})
            `;
            break;
          case "thermostat":
            await tx`
              INSERT INTO thermostats
                (device_id, is_on, mode, target_temperature_c, current_temperature_c)
              VALUES (${id}, ${input.isOn}, ${input.mode}, ${input.targetTemperatureC},
                      ${input.currentTemperatureC})
            `;
            break;
          case "camera":
            await tx`
              INSERT INTO cameras (device_id, is_armed, resolution, motion_sensitivity)
              VALUES (${id}, ${input.isArmed}, ${input.resolution}, ${input.motionSensitivity})
            `;
            break;
        }

        return findOrThrow(tx, id);
      });
    },

    update(id: string, patch: UpdateDevice): Promise<Device> {
      return db.begin(async (tx) => {
        const actual = await lockDevice(tx, id);
        if (actual !== patch.type) throw new TypeMismatch(id, actual, patch.type);

        await tx`UPDATE devices SET updated_at = now() WHERE id = ${id}`;

        const common = defined({ name: patch.name, room: patch.room });
        if (hasKeys(common)) await tx`UPDATE devices SET ${tx(common)} WHERE id = ${id}`;

        switch (patch.type) {
          case "light": {
            const columns = defined({
              brightness: patch.brightness,
              colour_temperature_k: patch.colourTemperatureK,
            });
            if (hasKeys(columns)) {
              await tx`UPDATE lights SET ${tx(columns)} WHERE device_id = ${id}`;
            }
            break;
          }
          case "thermostat": {
            const columns = defined({
              mode: patch.mode,
              target_temperature_c: patch.targetTemperatureC,
            });
            if (hasKeys(columns)) {
              await tx`UPDATE thermostats SET ${tx(columns)} WHERE device_id = ${id}`;
            }
            break;
          }
          case "camera": {
            const columns = defined({
              resolution: patch.resolution,
              motion_sensitivity: patch.motionSensitivity,
            });
            if (hasKeys(columns)) {
              await tx`UPDATE cameras SET ${tx(columns)} WHERE device_id = ${id}`;
            }
            break;
          }
        }

        return findOrThrow(tx, id);
      });
    },

    updateState(id: string, change: StateChange): Promise<Device> {
      return db.begin(async (tx) => {
        const actual = await lockDevice(tx, id);
        if (actual !== change.type) throw new TypeMismatch(id, actual, change.type);

        await tx`UPDATE devices SET updated_at = now() WHERE id = ${id}`;

        switch (change.type) {
          case "light":
            await tx`UPDATE lights SET is_on = ${change.isOn} WHERE device_id = ${id}`;
            break;
          case "thermostat":
            await tx`UPDATE thermostats SET is_on = ${change.isOn} WHERE device_id = ${id}`;
            break;
          case "camera":
            await tx`UPDATE cameras SET is_armed = ${change.isArmed} WHERE device_id = ${id}`;
            break;
        }

        return findOrThrow(tx, id);
      });
    },

    /** Returns false when there was nothing to delete; subtype rows go by cascade. */
    async delete(id: string): Promise<boolean> {
      const rows: { id: string }[] = await db`DELETE FROM devices WHERE id = ${id} RETURNING id`;
      return rows.length > 0;
    },
  };
}

export type DeviceRepository = ReturnType<typeof createDeviceRepository>;