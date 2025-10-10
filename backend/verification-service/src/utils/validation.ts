import { z } from 'zod';

const isoDateString = z
  .string()
  .refine((value: string) => !Number.isNaN(Date.parse(value)), {
    message: 'issuedAt must be a valid ISO date string'
  });

const detailsSchema = z
  .object({})
  .catchall(z.any())
  .refine((obj: Record<string, unknown>) => Object.keys(obj).length > 0, {
    message: 'details must include at least one property'
  });

export const CredentialPayloadSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  credentialType: z.string().trim().min(1),
  details: detailsSchema,
  hash: z.string().trim().length(64),
  issuedBy: z.string().trim().min(1),
  issuedAt: isoDateString
});

export type CredentialPayload = z.infer<typeof CredentialPayloadSchema>;

export const VerifyRequestSchema = CredentialPayloadSchema;

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const SyncRequestSchema = CredentialPayloadSchema;

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
