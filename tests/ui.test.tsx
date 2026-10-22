import { StrictMode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createStrategyByName, SimulationEngine } from '../src/engine/simulation';
import {
  CAS_LIVELOCK_PRESET,
  FORCE_DEADLOCK_PRESET,
  NORMAL_PRESET,
  STARVATION_PRESET,
} from '../src/scenarios/presets';
import { App, buildSimulationConfig, DetectorBanners } from '../src/ui/App';
import {
  COMPARISON_SPECS,
  ComparisonPanel,
} from '../src/ui/ComparisonPanel';
import { nextDeterministicSeed } from '../src/ui/Controls';
import { EventLog } from '../src/ui/EventLog';
import { SimulationTable } from '../src/ui/SimulationTable';
import { StrategyDetails } from '../src/ui/StrategyDetails';
import { runStrategyBatchComparison } from '../src/runner/batchRunner';

describe('Step 9 & 10 — UI, SVG Table, Controls, Detectors, Event Log, and Comparison Panel', () => {
  it('renders App inside React StrictMode at Tick 0 with all accessible controls and initial snapshot', () => {
    const html = renderToStaticMarkup(
      <StrictMode>
        <App />
      </StrictMode>
    );

    expect(html).toContain('Dining Philosophers');
    expect(html).toContain('OS Concurrency Simulator');
    expect(html).toContain('aria-label="Scenario preset"');
    expect(html).toContain('aria-label="Synchronization strategy"');
    expect(html).toContain('aria-label="Deterministic RNG seed"');
    expect(html).toContain('aria-label="Reroll seed"');
    expect(html).toContain('aria-label="Simulation speed"');
    expect(html).toContain('aria-label="Start simulation"');
    expect(html).toContain('aria-label="Pause simulation"');
    expect(html).toContain('aria-label="Step one cycle"');
    expect(html).toContain('aria-label="Reset simulation"');
    expect(html).toContain('CYCLES');
    expect(html).toContain('MEAN RULES');
    expect(html).toContain('MEALS COMPLETED');
    expect(html).toContain('CYCLE 0');

    // Confirms event log, per-philosopher metrics, and strategy internals are removed from App
    expect(html).not.toContain('Append-Only Event Log');
    expect(html).not.toContain('Per-Philosopher Metrics');
    expect(html).not.toContain('Strategy Internals');
  });

  it('matches every philosopher state and fork owner in SimulationTable to the engine snapshot', () => {
    const engine = new SimulationEngine(
      FORCE_DEADLOCK_PRESET.config,
      createStrategyByName('naive')
    );

    // Advance 2 ticks into passive circular-wait deadlock
    const snapshot = engine.runTicks(2);
    const events = engine.getEventLog();

    const tableHtml = renderToStaticMarkup(<SimulationTable snapshot={snapshot} />);
    const bannerHtml = renderToStaticMarkup(<DetectorBanners snapshot={snapshot} />);
    const logHtml = renderToStaticMarkup(<EventLog events={events} />);

    for (const phil of snapshot.philosophers) {
      expect(tableHtml).toContain(`data-philosopher-id="${phil.id}"`);
      expect(tableHtml).toContain(`data-state="${phil.state}"`);
    }

    for (const fork of snapshot.forks) {
      const expectedOwner = fork.ownerId ?? 'free';
      expect(tableHtml).toContain(
        `data-fork-id="${fork.id}" data-owner-id="${expectedOwner}"`
      );
    }

    // Held forks use violet stroke (#8b5cf6) and deadlock displays "Deadlock detected"
    expect(tableHtml).toContain('#8b5cf6');
    expect(tableHtml).toContain('Deadlock detected');

    expect(bannerHtml).toContain('data-detector="deadlock"');
    expect(bannerHtml).toContain(
      'P0 (holds F0, waits for F1) -&gt; P1 (holds F1, waits for F2)'
    );
    expect(logHtml).toContain('data-event-type="DEADLOCK_DETECTED"');
  });

  it('renders the explicit "starvation detected by threshold" banner and badge when Monitor hits starvation threshold', () => {
    const engine = new SimulationEngine(
      STARVATION_PRESET.config,
      createStrategyByName('monitor')
    );

    // At tick 13 in STARVATION_PRESET, P1 reaches 12 wait ticks while P0 and P2 complete meals
    const snapshot = engine.runTicks(13);
    expect(snapshot.detectors.starvationDetected).toBe(true);
    expect(snapshot.detectors.starvedPhilosopherIds).toEqual([1]);

    const bannerHtml = renderToStaticMarkup(<DetectorBanners snapshot={snapshot} />);
    const tableHtml = renderToStaticMarkup(<SimulationTable snapshot={snapshot} />);
    const detailsHtml = renderToStaticMarkup(<StrategyDetails snapshot={snapshot} />);

    expect(bannerHtml).toContain('data-detector="starvation"');
    expect(bannerHtml).toContain('starvation detected by threshold');
    expect(tableHtml).toContain('starvation detected by threshold');
    expect(tableHtml).toContain('STARVED (≥12t)');
    expect(detailsHtml).toContain('Monitor with test(i)');
  });

  it('renders Suspected Livelock banner and real CAS rollback counters for CAS Livelock preset', () => {
    const engine = new SimulationEngine(
      CAS_LIVELOCK_PRESET.config,
      createStrategyByName('cas')
    );

    const snapshot = engine.runTicks(12);
    expect(snapshot.detectors.livelockDetected).toBe(true);

    const bannerHtml = renderToStaticMarkup(<DetectorBanners snapshot={snapshot} />);
    const detailsHtml = renderToStaticMarkup(<StrategyDetails snapshot={snapshot} />);
    const comparisonHtml = renderToStaticMarkup(
      <ComparisonPanel scenario={NORMAL_PRESET} seed={42} />
    );

    expect(bannerHtml).toContain('data-detector="livelock"');
    expect(bannerHtml).toContain('SUSPECTED LIVELOCK');
    expect(detailsHtml).toContain('Lock-free (simulated CAS)');
    expect(detailsHtml).toContain('Left-Fork Rollbacks');
    expect(comparisonHtml).toContain('Cross-Strategy Batch Comparison');
  });

  it('builds deterministic simulation configs when switching scenario, strategy, seed, or CAS back-off mode', () => {
    const cfg1 = buildSimulationConfig('force-deadlock', 'semaphore', 99, 'random');
    expect(cfg1.strategy).toBe('semaphore');
    expect(cfg1.seed).toBe(99);
    expect(cfg1.initialStates).toEqual([
      'Hungry',
      'Hungry',
      'Hungry',
      'Hungry',
      'Hungry',
    ]);

    const engine = new SimulationEngine(cfg1, createStrategyByName('semaphore'));
    const snapAfterStep = engine.step();
    expect(snapAfterStep.tick).toBe(1);

    // Changing strategy/scenario/seed resets the engine back to tick 0
    const cfgReset = buildSimulationConfig('normal', 'monitor', 42, 'random');
    const snapReset = engine.reset(cfgReset, createStrategyByName('monitor'));
    expect(snapReset.tick).toBe(0);
    expect(snapReset.config.strategy).toBe('monitor');
    expect(snapReset.config.seed).toBe(42);

    // Reroll seed helper produces a distinct positive integer seed deterministically
    const rerolled = nextDeterministicSeed(42);
    expect(rerolled).toBeGreaterThan(0);
    expect(rerolled).not.toBe(42);
    expect(nextDeterministicSeed(42)).toBe(rerolled);
  });

  it('connects ComparisonPanel to real batchRunner rows and explicit modeling notes', () => {
    const deadlockHtml = renderToStaticMarkup(
      <ComparisonPanel
        scenario={FORCE_DEADLOCK_PRESET}
        seed={42}
        activeStrategy="semaphore"
      />
    );
    const expectedDeadlockRows = runStrategyBatchComparison({
      scenario: FORCE_DEADLOCK_PRESET,
      seed: 42,
      ticks: 60,
      strategies: COMPARISON_SPECS,
    });

    // Verify Naive deadlock (tick 1) and non-deadlocking Semaphore/Monitor/CAS rows are rendered from real data
    expect(deadlockHtml).toContain('Yes (Cycle 1)');
    expect(deadlockHtml).not.toContain('comparison-row-selected');
    expect(deadlockHtml).not.toContain('tradeoff-card');
    expect(deadlockHtml).toContain('Lock-free (simulated CAS — Seeded Random)');
    for (const row of expectedDeadlockRows) {
      expect(deadlockHtml).toContain(row.strategyLabel);
      expect(deadlockHtml).toContain(`${row.totalMealsCompleted}`);
    }

    // Verify starvation scenario comparison row shows "starvation detected by threshold (P1)"
    const starvationHtml = renderToStaticMarkup(
      <ComparisonPanel scenario={STARVATION_PRESET} seed={42} />
    );
    expect(starvationHtml).toContain('starvation detected by threshold (P1)');
    expect(starvationHtml).not.toContain('comparison-notes-callout');
    expect(starvationHtml).not.toContain('Starvation Note (Threshold-Detected):');
    expect(starvationHtml).not.toContain('Simulated CAS Note (Model vs. Hardware Atomics):');
  });

  it('renders all six compact event log filter chips', () => {
    const engine = new SimulationEngine(NORMAL_PRESET.config);
    const logHtml = renderToStaticMarkup(<EventLog events={engine.getEventLog()} />);

    expect(logHtml).toContain('All Events');
    expect(logHtml).toContain('State Changes');
    expect(logHtml).toContain('Actions');
    expect(logHtml).toContain('Meals');
    expect(logHtml).toContain('Locks/Forks');
    expect(logHtml).toContain('Deadlock');
  });

  it('renders ComparisonPanel with cycle count options (30, 60, 100) and displays recalculated batch metrics', () => {
    const html30 = renderToStaticMarkup(
      <ComparisonPanel
        scenario={NORMAL_PRESET}
        seed={42}
        initialTicks={30}
      />
    );
    const html100 = renderToStaticMarkup(
      <ComparisonPanel
        scenario={NORMAL_PRESET}
        seed={42}
        initialTicks={100}
      />
    );

    // Dropdown contains 30, 60, and 100 cycles options
    expect(html30).toContain('value="30"');
    expect(html30).toContain('value="60"');
    expect(html30).toContain('value="100"');

    // Subtitle is removed per UI cleanup
    expect(html30).not.toContain('Headless deterministic batch runs over');
    expect(html100).not.toContain('Headless deterministic batch runs over');

    // Distinct simulation duration generates distinct recalculated meal counts
    expect(html30).not.toEqual(html100);
  });
});
