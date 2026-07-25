import type { NotificationPayload } from "./index";

export async function sendEmail(_payload: NotificationPayload): Promise<void> {
  throw new Error("Envio de e-mail via Mailcow (SMTP) nao implementado (MP-008)");
}
