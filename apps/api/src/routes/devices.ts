import { CreateDevice, DeviceAction, DeviceType, UpdateDevice } from "@iota/shared";
import { Hono } from "hono";
import { z } from "zod";
import { resolveAction } from "../actions";
import { DeviceNotFound } from "../errors";
import { validate } from "../http/validate";
import type { DeviceRepository } from "../repositories/devices";

const IdParam = z.object({ id: z.uuid() });
const ActionParam = z.object({ id: z.uuid(), action: DeviceAction });
const ListQuery = z.object({
  type: DeviceType.optional(),
  room: z.string().trim().min(1).optional(),
});

// Routes are chained so the resulting type records every path, input and output for hc.
export const devicesRoutes = (devices: DeviceRepository) =>
  new Hono()
    .get("/", validate("query", ListQuery), async (c) => {
      return c.json(await devices.list(c.req.valid("query")));
    })
    .post("/", validate("json", CreateDevice), async (c) => {
      const device = await devices.create(c.req.valid("json"));
      c.header("Location", `/api/devices/${device.id}`);
      return c.json(device, 201);
    })
    .get("/:id", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      const device = await devices.findById(id);
      if (!device) throw new DeviceNotFound(id);
      return c.json(device);
    })
    .patch("/:id", validate("param", IdParam), validate("json", UpdateDevice), async (c) => {
      return c.json(await devices.update(c.req.valid("param").id, c.req.valid("json")));
    })
    .post("/:id/actions/:action", validate("param", ActionParam), async (c) => {
      const { id, action } = c.req.valid("param");
      const device = await devices.findById(id);
      if (!device) throw new DeviceNotFound(id);
      return c.json(await devices.updateState(id, resolveAction(device.type, action)));
    })
    .delete("/:id", validate("param", IdParam), async (c) => {
      const { id } = c.req.valid("param");
      if (!(await devices.delete(id))) throw new DeviceNotFound(id);
      return c.body(null, 204);
    });
