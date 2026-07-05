/**
 * Page builder foundation — Epic L. Barrel export.
 *
 * Foundation only: block descriptors, component registry skeleton, validation,
 * and the default page documents that mirror the current site. The visual
 * drag/drop editor and the live <PageRenderer> swap-in are follow-up work.
 */
export * from "./blockTypes";
export * from "./registry";
export * from "./validation";
// DEFAULT_PAGES moved to @lume/blocks so server code (admin provisioning)
// and the seed script can import it without reaching into src/.
export { DEFAULT_PAGES, type DefaultPageSeed } from "@lume/blocks";
