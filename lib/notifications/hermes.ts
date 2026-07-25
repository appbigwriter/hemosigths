import type { NotificationPayload } from "./index";

export async function sendWhatsApp(_payload: NotificationPayload): Promise<void> {
  throw new Error("Integracao Hermes (WhatsApp) nao implementada (MP-008)");
}
