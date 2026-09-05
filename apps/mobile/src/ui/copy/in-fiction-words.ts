/**
 * Words that would break the loft picker's plain-English consent-boundary
 * exception (`PRODUCT.md` §5) if they leaked into its copy or its rendered
 * screen. Shared by `strings.test.ts` (checks the `Copy` catalogue output)
 * and `LoftPicker.test.tsx` (checks the rendered DOM) so the two checks
 * can't silently drift apart on what counts as "in-fiction."
 */
export const IN_FICTION_WORDS = ['pigeon', 'bird', 'dove', 'loft is', 'flew', 'flight', 'wing', '🕊'] as const;
