import identity from './app-name.json';

/**
 * The working name, per `docs/PRODUCT.md`. Q-001 settles the final one; until
 * then this is the single place it is written down, so renaming is one edit.
 *
 * It lives in JSON because `app.config.ts` also needs it, and Expo transpiles
 * that file alone — a relative import of a `.ts` module from it does not
 * resolve at config-load time, while a `.json` one does.
 */
export const APP_NAME: string = identity.name;

export const APP_SLUG: string = identity.slug;

export const BUNDLE_ID: string = identity.bundleId;
