import { z } from "zod";
export const confirmationBody = z.union([
  z.object({ operation: z.literal("list") }).strict(),
  z.object({ id: z.uuid(), confirm: z.boolean() }).strict(),
]);
