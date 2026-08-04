export interface OfferRecipient {
  phone: string;
  parentName: string;
  studentName: string;
}

export async function sendAdmissionOfferSmsBatch(recipients: OfferRecipient[], schoolDomain: string): Promise<void> {
  if (recipients.length === 0) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sharedSecret = process.env.WELCOME_SMS_SECRET; // reused, per your instruction

  if (!supabaseUrl || !sharedSecret) {
    console.error("[admission-offer-sms] aborting — missing env", { hasUrl: !!supabaseUrl, hasSecret: !!sharedSecret });
    return;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-admission-offer-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-welcome-secret": sharedSecret },
      body: JSON.stringify({ recipients, schoolDomain }),
    });
    const txt = await res.text();
    console.log("[admission-offer-sms] edge response:", res.status, txt);
  } catch (err) {
    console.error("[admission-offer-sms] failed to invoke edge function:", err);
  }
}

export async function sendAdmissionOfferSms(phone: string, parentName: string, studentName: string, schoolDomain: string): Promise<void> {
  await sendAdmissionOfferSmsBatch([{ phone, parentName, studentName }], schoolDomain);
}