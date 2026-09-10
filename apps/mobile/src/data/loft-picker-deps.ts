import type { LoftPickerDeps } from '../ui/screens/LoftPicker';

/**
 * No live Supabase project exists in this container (Q-002 in
 * `docs/QUESTIONS.md`) and no Supabase client has been wired into the mobile
 * app yet — filed as `M1-11` in `ROADMAP.md`. Until that lands, every save
 * fails, and the screen shows exactly the copy a real network failure would
 * produce (`t({ key: 'offline' })`) — an honest placeholder, not a silent
 * no-op that would lie about persisting the selection.
 */
export const realLoftPickerDeps: LoftPickerDeps = {
  saveLoft() {
    return Promise.reject(new Error('no Supabase client wired into the mobile app yet — see M1-11'));
  },
};
