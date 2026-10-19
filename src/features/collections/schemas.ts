import { z } from 'zod';

export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(60, '60 characters max.'),
  description: z.string().trim().max(280, '280 characters max.'),
  visibility: z.enum(['public', 'private']),
});

export type CollectionFormValues = z.infer<typeof collectionSchema>;
