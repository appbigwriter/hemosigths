import { sendEmail } from "./mailcow";
import { sendWhatsApp } from "./hermes";

export { sendWhatsApp, sendEmail };

export type NotificationChannel = "whatsapp" | "email" | "painel";

export interface NotificationPayload {
  to: string;
  subject?: string;
  body: string;
}

export async function sendNotification(
  channel: NotificationChannel,
  payload: NotificationPayload,
): Promise<void> {
  switch (channel) {
    case "whatsapp":
      await sendWhatsApp(payload);
      return;
    case "email":
      await sendEmail(payload);
      return;
    case "painel":
      throw new Error("Notificacao em painel nao implementada (MP-008)");
  }
}
