import { z } from "zod";

export const createSourceBodySchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "slug must be lowercase alphanumeric with hyphens"),
  displayName: z.string().min(1),
  environment: z.string().min(1),
  ownerName: z.string().optional(),
  ownerContact: z.string().optional(),
});

export const updateSourceBodySchema = z
  .object({
    displayName: z.string().min(1).optional(),
    ownerName: z.string().nullable().optional(),
    ownerContact: z.string().nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const sourceIdParamSchema = z.object({
  sourceId: z.string().min(1),
});

export type CreateSourceBody = z.infer<typeof createSourceBodySchema>;
export type UpdateSourceBody = z.infer<typeof updateSourceBodySchema>;
