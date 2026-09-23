import type { DeviceAction, DeviceType } from "@iota/shared";

export class DeviceNotFound extends Error {
  override readonly name = "DeviceNotFound";

  constructor(readonly id: string) {
    super(`No device with id ${id}`);
  }
}

export class TypeMismatch extends Error {
  override readonly name = "TypeMismatch";

  constructor(
    readonly id: string,
    readonly actual: DeviceType,
    readonly requested: DeviceType,
  ) {
    super(`Device ${id} is a ${actual}, but the request is for a ${requested}`);
  }
}

export class UnsupportedAction extends Error {
  override readonly name = "UnsupportedAction";

  constructor(
    readonly type: DeviceType,
    readonly action: DeviceAction,
  ) {
    super(`A ${type} does not support the ${action} action`);
  }
}
