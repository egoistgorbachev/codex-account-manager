import { z } from "zod";

export const accountIdSchema = z.string().trim().min(1);

export const switchAccountInputSchema = z.object({
  accountId: accountIdSchema
}).strict();

export const updateSettingsInputSchema = z.object({
  language: z.literal("ru").optional(),
  autoRefreshIntervalMs: z
    .union([
      z.literal(60_000),
      z.literal(180_000),
      z.literal(300_000),
      z.literal(600_000),
      z.literal(900_000)
    ])
    .optional(),
  privacyMode: z.boolean().optional(),
  confirmSwitch: z.boolean().optional(),
  smartSwitchMode: z.union([z.literal("off"), z.literal("suggest"), z.literal("auto")]).optional(),
  desktopNotifications: z.boolean().optional()
}).strict();
