import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * `[M1-09]` `scripts/demo-harness.mjs` plans and plays a fixed, seeded
 * two-user LA→NYC demo flight with a compressed clock. Run as subprocesses
 * — see `run-demo-plan.mjs`/`run-demo-harness.mjs`'s own comments for why a
 * ts-jest test cannot `import()` these ESM-only files directly.
 */
const RUN_DEMO_PLAN_SCRIPT = join(__dirname, 'scripts', 'run-demo-plan.mjs');
const RUN_DEMO_HARNESS_SCRIPT = join(__dirname, 'scripts', 'run-demo-harness.mjs');

interface DemoFlightPlan {
  readonly pub: { readonly distanceKm: number };
  readonly secret: { readonly outcome: string; readonly cause: string | null };
}

function planDemoFlightViaScript(departsAtMs: number): DemoFlightPlan {
  const output = execFileSync(process.execPath, [RUN_DEMO_PLAN_SCRIPT], {
    input: String(departsAtMs),
    encoding: 'utf8',
  });
  return JSON.parse(output) as DemoFlightPlan;
}

describe('the demo harness', () => {
  it('[M1-09] the seeded script produces the same fate on every run', () => {
    const first = planDemoFlightViaScript(1_700_000_000_000);
    const second = planDemoFlightViaScript(1_700_000_000_000);
    expect(second).toEqual(first);
  });

  it('[M1-09] the demo flight is a guaranteed first-ever delivery, never a loss', () => {
    const plan = planDemoFlightViaScript(1_700_000_000_000);
    expect(plan.secret.outcome).toBe('delivered');
    expect(plan.secret.cause).toBeNull();
  });

  it('[M1-09] the runner logs every recording-checklist entry, in order, before resolving', () => {
    const output = execFileSync(process.execPath, [RUN_DEMO_HARNESS_SCRIPT], { encoding: 'utf8' });
    const { lines, outcome } = JSON.parse(output) as { lines: string[]; outcome: string };

    expect(lines).toHaveLength(7); // release line + 5 checklist entries + final outcome line
    expect(lines[0]).toContain('Releasing');
    expect(lines[1]).toContain('[0%]');
    expect(lines[5]).toContain('[100%]');
    expect(lines.at(-1)).toContain('Delivered');
    expect(outcome).toBe('delivered');
  });
});
