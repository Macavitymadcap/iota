import { CreateDevice, type CreateDeviceInput } from "@iota/shared";
import { sql } from "../src/db";
import { createDeviceRepository } from "../src/repositories/devices";

const DEVICES: CreateDeviceInput[] = [
  { type: "light", name: "Ceiling light", room: "Living room", isOn: true, brightness: 80 },
  { type: "light", name: "Reading lamp", room: "Living room", colourTemperatureK: 2700 },
  { type: "light", name: "Under-cabinet strip", room: "Kitchen", isOn: true },
  {
    type: "thermostat",
    name: "Hall thermostat",
    room: "Hall",
    isOn: true,
    targetTemperatureC: 20.5,
    currentTemperatureC: 19,
  },
  { type: "thermostat", name: "Bedroom radiator", room: "Bedroom", mode: "auto" },
  { type: "camera", name: "Front door", room: "Hall", isArmed: true, resolution: "4k" },
  { type: "camera", name: "Garden", motionSensitivity: 8 },
];

const reset = process.argv.includes("--reset");
const repo = createDeviceRepository(sql);

const [row]: { count: number }[] = await sql`SELECT count(*)::int AS count FROM devices`;
const existing = row?.count ?? 0;

if (existing > 0 && !reset) {
  console.log(`Found ${existing} existing devices; run with --reset to replace them.`);
} else {
  if (reset) await sql`TRUNCATE devices CASCADE`;
  for (const device of DEVICES) await repo.create(CreateDevice.parse(device));
  console.log(`Seeded ${DEVICES.length} devices.`);
}

await sql.close();