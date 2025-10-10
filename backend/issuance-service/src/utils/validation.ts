import { z } from 'zod';

const detailsSchema = z
  .record(z.string(), z.any())
  .superRefine((details, ctx) => {
    // Check each value in the details object
    for (const [key, value] of Object.entries(details)) {
      if (value === null || value === undefined || value === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Detail value for "${key}" cannot be empty, null, or undefined`,
          path: [key]
        });
      }
    }
  });

export const IssueCredentialSchema = z.object({
  name: z.string().trim().min(1).max(255),
  credentialType: z.string().trim().min(1).max(255),
  details: detailsSchema
});

export type IssueCredentialInput = z.infer<typeof IssueCredentialSchema>;
