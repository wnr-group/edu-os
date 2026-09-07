import { z } from "zod";

export const phoneSchema = z.object({
  phone: z
    .string()
    .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

export const otpSchema = z.object({
  otp: z
    .string()
    .regex(/^\d{6}$/, "Enter the 6-digit OTP"),
});

export type PhoneInput = z.infer<typeof phoneSchema>;
export type OtpInput = z.infer<typeof otpSchema>;

export const interventionDismissSchema = z.object({
  dismissal_reason: z.string().min(1, "Dismissal reason is required"),
});

export const interventionCompleteSchema = z.object({
  outcome_note: z.string().optional(),
});

export const interventionReassignSchema = z.object({
  new_assignee_id: z.string().uuid("Invalid assignee ID"),
});

export const interventionNotifyParentSchema = z.object({
  client_request_id: z.string().uuid("Invalid client request ID"),
});

export type InterventionDismissInput = z.infer<typeof interventionDismissSchema>;
export type InterventionCompleteInput = z.infer<typeof interventionCompleteSchema>;
export type InterventionReassignInput = z.infer<typeof interventionReassignSchema>;
export type InterventionNotifyParentInput = z.infer<typeof interventionNotifyParentSchema>;
