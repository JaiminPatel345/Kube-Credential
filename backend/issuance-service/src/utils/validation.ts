import { z } from 'zod';

const detailsSchema = z
  .object({})
  .catchall(z.any())
  .refine((obj: Record<string, unknown>) => Object.keys(obj).length > 0, {
    message: 'details must include at least one property'
  });

export const IssueCredentialSchema = z.object({
  name: z.string().trim().min(1).max(255),
  credentialType: z.string().trim().min(1).max(255),
  details: detailsSchema
});

export type IssueCredentialInput = z.infer<typeof IssueCredentialSchema>;
