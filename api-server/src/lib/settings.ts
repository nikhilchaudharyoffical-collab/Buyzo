import { eq, inArray } from "drizzle-orm";
import { db, productsTable, storeSettingsTable } from "@workspace/db";

const REVIEWS_KEY = "reviews_enabled";

/** Store-wide switch: are customers allowed to leave new reviews right now? On unless the admin turned it off. */
export const reviewsSwitchOn = async (): Promise<boolean> => {
  const [row] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, REVIEWS_KEY));
  return row ? row.value !== "false" : true;
};

export const setReviewsSwitch = async (enabled: boolean): Promise<void> => {
  await db
    .insert(storeSettingsTable)
    .values({ key: REVIEWS_KEY, value: enabled ? "true" : "false" })
    .onConflictDoUpdate({ target: storeSettingsTable.key, set: { value: enabled ? "true" : "false" } });
};

/** Product ids that currently accept new reviews (empty when the store-wide switch is off). */
export const productsAcceptingReviews = async (productIds: string[]): Promise<Set<string>> => {
  if (!productIds.length || !(await reviewsSwitchOn())) return new Set();
  const rows = await db
    .select({ id: productsTable.id, on: productsTable.reviewsEnabled })
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  return new Set(rows.filter((row) => row.on).map((row) => row.id));
};
