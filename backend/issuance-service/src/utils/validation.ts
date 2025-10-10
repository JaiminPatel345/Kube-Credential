import { z } from 'zod';

const detailsSchema = z
  .object({})
  .catchall(z.any());
  // Allow empty details object - no minimum property requirement

export const IssueCredentialSchema = z.object({
  name: z.string().trim().min(1).max(255),
  credentialType: z.string().trim().min(1).max(255),
  details: detailsSchema
});

export type IssueCredentialInput = z.infer<typeof IssueCredentialSchema>;
