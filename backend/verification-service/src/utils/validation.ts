import { z } from 'zod';

const isoDateString = z
  .string({ required_error: 'Issued At is required' })
  .trim()
  .min(1, { message: 'Issued At is required' })
  .refine((value: string) => !Number.isNaN(Date.parse(value)), {
    message: 'Issued At must be a valid ISO date string'
  });

const detailsSchema = z
  .record(z.string(), z.any())
  .refine((value) => !Array.isArray(value), {
    message: 'Details must be a JSON object'
  })
  .superRefine((details, ctx) => {
    const entries = Object.entries(details ?? {});

    // Allow empty details object - no minimum entry requirement

    entries.forEach(([rawKey, rawValue]) => {
      const key = rawKey.trim();
      if (key.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Detail keys cannot be blank',
          path: ['details', rawKey]
        });
        return;
      }

      if (rawValue === null || rawValue === undefined || rawValue === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Detail value for "${key}" cannot be empty, null, or undefined`,
          path: ['details', rawKey]
        });
        return;
      }

      if (typeof rawValue === 'string' && rawValue.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Detail value for "${key}" cannot be empty`,
          path: ['details', rawKey]
        });
      }
    });
  });

export const CredentialPayloadSchema = z.object({
  id: z.string({ required_error: 'Id is required' }).trim().min(1, { message: 'Id is required' }),
  name: z.string({ required_error: 'Name is required' }).trim().min(1, { message: 'Name is required' }),
  credentialType: z
    .string({ required_error: 'Credential Type is required' })
    .trim()
    .min(1, { message: 'Credential Type is required' }),
  details: detailsSchema,
  hash: z
    .string({ required_error: 'Hash is required' })
    .trim()
    .min(1, { message: 'Hash is required' })
    .length(64, { message: 'Hash must be 64 characters long' }),
  issuedBy: z
    .string({ required_error: 'Issued By is required' })
    .trim()
    .min(1, { message: 'Issued By is required' }),
  issuedAt: isoDateString
});

export type CredentialPayload = z.infer<typeof CredentialPayloadSchema>;

export const VerifyRequestSchema = CredentialPayloadSchema;

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const SyncRequestSchema = CredentialPayloadSchema;

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
