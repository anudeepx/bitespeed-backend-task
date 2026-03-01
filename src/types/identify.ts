import { z } from 'zod';

const nullableTrimmedString = z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: 'Must not be empty string' })
    .nullable()
    .optional();

export const identifyRequestSchema = z
    .object({
        email: nullableTrimmedString,
        phoneNumber: nullableTrimmedString,
    })
    .refine((value) => value.email != null || value.phoneNumber != null, {
        message: 'At least one of email or phoneNumber must be provided',
    });

export type IdentifyRequestBody = z.infer<typeof identifyRequestSchema>;
