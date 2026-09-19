import type { Entitlement } from "@zuvigo/types";
import { ForbiddenError } from "./errors.js";

export class EntitlementService {
  can(entitlements: Record<string, boolean> | null | undefined, key: Entitlement): boolean {
    if (!entitlements) return false;
    return entitlements[key] === true;
  }

  assertCan(entitlements: Record<string, boolean> | null | undefined, key: Entitlement): void {
    if (!this.can(entitlements, key)) {
      throw new ForbiddenError(`Plan does not include ${key}`);
    }
  }

  withinLimit(limit: number, current: number): boolean {
    if (limit < 0) return true; // unlimited
    return current < limit;
  }
}

export const entitlements = new EntitlementService();
