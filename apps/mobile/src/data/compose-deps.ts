import type { ComposeDeps } from '../ui/screens/ComposeScreen';

/**
 * No live Supabase project exists in this container (Q-002 in
 * `docs/QUESTIONS.md`) and no Supabase client has been wired into the mobile
 * app yet (`M1-11`, blocked on the same question), so there is no HTTP
 * client here to call the `release-pigeon` Edge Function (`M1-02`) with.
 * Until that lands, every release fails, and the screen shows exactly the
 * copy a real network failure would produce — an honest placeholder, not a
 * silent no-op that would lie about a bird having been sent, matching the
 * precedent `M1-03`'s `realLoftPickerDeps` already set.
 */
export const realComposeDeps: ComposeDeps = {
  release() {
    return Promise.reject(new Error('no Supabase client wired into the mobile app yet — see M1-11'));
  },
};
