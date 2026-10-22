import { describe, expect, it } from 'vitest';
import {
  computeJainFairnessIndex,
  runStrategyBatchComparison,
} from '../src/runner/batchRunner';
import { formatComparisonRows } from '../src/runner/formatResults';
import {
  CAS_LIVELOCK_PRESET,
  FORCE_DEADLOCK_PRESET,
  NORMAL_PRESET,
  STARVATION_PRESET,
} from '../src/scenarios/presets';

describe('Headless Batch Runner and Cross-Strategy Comparison', () => {
  it('returns identical comparison rows across repeated runs for the same scenario and seed', () => {
    const run1 = runStrategyBatchComparison({
      scenario: NORMAL_PRESET,
      seed: 42,
      ticks: 60,
    });
    const run2 = runStrategyBatchComparison({
      scenario: NORMAL_PRESET,
      seed: 42,
      ticks: 60,
    });

    expect(run1).toEqual(run2);
    expect(run1).toHaveLength(4);

    for (const row of run1) {
      expect(row.deadlocked).toBe(false);
      expect(row.starvationDetected).toBe(false);
      expect(row.livelockSuspected).toBe(false);
      expect(row.totalMealsCompleted).toBeGreaterThan(0);
      expect(row.fairnessScore).toBeGreaterThan(0.8);
    }
  });

  it('proves under Force Deadlock that Naive deadlocks while Semaphore, Monitor, and random-CAS make progress, and fixed-CAS livelocks', () => {
    const rows = runStrategyBatchComparison({
      scenario: FORCE_DEADLOCK_PRESET,
      seed: 42,
      ticks: 50,
      strategies: [
        { strategy: 'naive' },
        { strategy: 'semaphore' },
        { strategy: 'monitor' },
        { strategy: 'cas', casBackoffMode: 'random', label: 'CAS (Random Back-off)' },
        { strategy: 'cas', casBackoffMode: 'fixed', label: 'CAS (Fixed Back-off)' },
      ],
    });

    const naiveRow = rows.find((r) => r.strategy === 'naive')!;
    const semaphoreRow = rows.find((r) => r.strategy === 'semaphore')!;
    const monitorRow = rows.find((r) => r.strategy === 'monitor')!;
    const casRandomRow = rows.find(
      (r) => r.strategy === 'cas' && r.casBackoffMode === 'random'
    )!;
    const casFixedRow = rows.find(
      (r) => r.strategy === 'cas' && r.casBackoffMode === 'fixed'
    )!;

    // 1. Naive reliably deadlocks on tick 1 with 0 meals
    expect(naiveRow.deadlocked).toBe(true);
    expect(naiveRow.deadlockTick).toBe(1);
    expect(naiveRow.totalMealsCompleted).toBe(0);
    expect(naiveRow.fairnessScore).toBe(0);

    // 2. Semaphore prevents deadlock and completes meals fairly
    expect(semaphoreRow.deadlocked).toBe(false);
    expect(semaphoreRow.totalMealsCompleted).toBeGreaterThanOrEqual(5);
    expect(semaphoreRow.minMealsPerPhilosopher).toBeGreaterThanOrEqual(1);
    expect(semaphoreRow.fairnessScore).toBeGreaterThan(0.9);

    // 3. Monitor prevents deadlock and achieves high meal throughput
    expect(monitorRow.deadlocked).toBe(false);
    expect(monitorRow.totalMealsCompleted).toBeGreaterThanOrEqual(10);
    expect(monitorRow.minMealsPerPhilosopher).toBeGreaterThanOrEqual(1);
    expect(monitorRow.fairnessScore).toBeGreaterThan(0.9);

    // 4. CAS with seeded random back-off breaks symmetry and completes meals
    expect(casRandomRow.deadlocked).toBe(false);
    expect(casRandomRow.livelockSuspected).toBe(false);
    expect(casRandomRow.totalMealsCompleted).toBeGreaterThanOrEqual(5);
    expect(casRandomRow.casAttempts).toBeGreaterThan(10);
    expect(casRandomRow.casRollbacks).toBeGreaterThanOrEqual(5);

    // 5. CAS with fixed back-off livelocks with 0 meals and is NOT marked deadlocked
    expect(casFixedRow.deadlocked).toBe(false);
    expect(casFixedRow.livelockSuspected).toBe(true);
    expect(casFixedRow.livelockTick).toBe(FORCE_DEADLOCK_PRESET.config.livelockWindowTicks);
    expect(casFixedRow.totalMealsCompleted).toBe(0);
    expect(casFixedRow.casRollbacks).toBeGreaterThan(10);
  });

  it('captures threshold-detected starvation in Starvation (Biased) preset and formats comparison rows cleanly', () => {
    const rows = runStrategyBatchComparison({
      scenario: STARVATION_PRESET,
      seed: 42,
      ticks: 40,
    });

    const monitorRow = rows.find((r) => r.strategy === 'monitor')!;
    const semaphoreRow = rows.find((r) => r.strategy === 'semaphore')!;

    expect(monitorRow.starvationDetected).toBe(true);
    expect(monitorRow.starvationStatusLabel).toBe('starvation detected by threshold');
    expect(monitorRow.starvedPhilosopherIds).toContain(1);
    expect(monitorRow.maxWaitTicks).toBeGreaterThanOrEqual(21);

    expect(semaphoreRow.deadlocked).toBe(false);
    expect(semaphoreRow.starvationDetected).toBe(false);

    const formatted = formatComparisonRows(rows);
    const formattedMonitor = formatted.find((f) => f.strategy === 'monitor')!;
    expect(formattedMonitor.starvation).toContain('starvation detected by threshold');
    expect(formattedMonitor.starvation).toContain('P1');
  });

  it('computes Jain fairness index accurately for equal, skewed, and zero-meal distributions', () => {
    expect(computeJainFairnessIndex([4, 4, 4, 4, 4])).toBe(1);
    expect(computeJainFairnessIndex([0, 0, 0, 0, 0])).toBe(0);
    expect(computeJainFairnessIndex([5, 0, 0, 0, 0])).toBe(0.2);

    const livelockRows = runStrategyBatchComparison({
      scenario: CAS_LIVELOCK_PRESET,
      ticks: 25,
    });
    const casRow = livelockRows.find((r) => r.strategy === 'cas')!;
    expect(casRow.livelockSuspected).toBe(true);
    expect(casRow.fairnessScore).toBe(0);
  });

  it('recalculates all strategy metrics dynamically when cycle count changes (30, 60, 100 cycles) with seed 42', () => {
    const specs = [
      { strategy: 'naive', label: 'Naive (Left → Right)' },
      { strategy: 'semaphore', label: 'Semaphore (N−1 Permits, FIFO)' },
      { strategy: 'monitor', label: 'Monitor (test(i) + Condition)' },
      { strategy: 'cas', casBackoffMode: 'fixed', label: 'Lock-free (simulated CAS — Fixed Back-off)' },
      { strategy: 'cas', casBackoffMode: 'random', label: 'Lock-free (simulated CAS — Seeded Random)' },
    ] as const;

    const run30 = runStrategyBatchComparison({
      scenario: NORMAL_PRESET,
      seed: 42,
      ticks: 30,
      strategies: specs,
    });
    const run60 = runStrategyBatchComparison({
      scenario: NORMAL_PRESET,
      seed: 42,
      ticks: 60,
      strategies: specs,
    });
    const run100 = runStrategyBatchComparison({
      scenario: NORMAL_PRESET,
      seed: 42,
      ticks: 100,
      strategies: specs,
    });

    // 1. Duration (ticksRun) matches requested cycles
    expect(run30.every((r) => r.ticksRun === 30)).toBe(true);
    expect(run60.every((r) => r.ticksRun === 60)).toBe(true);
    expect(run100.every((r) => r.ticksRun === 100)).toBe(true);

    // 2. Metrics are genuinely calculated: meal counts strictly increase as cycle count increases
    const monitor30 = run30.find((r) => r.strategy === 'monitor')!;
    const monitor60 = run60.find((r) => r.strategy === 'monitor')!;
    const monitor100 = run100.find((r) => r.strategy === 'monitor')!;
    expect(monitor30.totalMealsCompleted).toBeLessThan(monitor60.totalMealsCompleted);
    expect(monitor60.totalMealsCompleted).toBeLessThan(monitor100.totalMealsCompleted);

    // 3. CAS attempts increase with duration
    const casRandom30 = run30.find(
      (r) => r.strategy === 'cas' && r.casBackoffMode === 'random'
    )!;
    const casRandom60 = run60.find(
      (r) => r.strategy === 'cas' && r.casBackoffMode === 'random'
    )!;
    const casRandom100 = run100.find(
      (r) => r.strategy === 'cas' && r.casBackoffMode === 'random'
    )!;
    expect(casRandom30.casAttempts!).toBeLessThan(casRandom60.casAttempts!);
    expect(casRandom60.casAttempts!).toBeLessThan(casRandom100.casAttempts!);
    expect(casRandom30.casRollbacks!).toBeLessThanOrEqual(casRandom60.casRollbacks!);
    expect(casRandom60.casRollbacks!).toBeLessThanOrEqual(casRandom100.casRollbacks!);

    // 4. Repeated runs with seed 42 are strictly deterministic and reproducible
    const run60Repeat = runStrategyBatchComparison({
      scenario: NORMAL_PRESET,
      seed: 42,
      ticks: 60,
      strategies: specs,
    });
    expect(run60).toEqual(run60Repeat);
  });
});
