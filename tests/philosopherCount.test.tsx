import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createStrategyByName, SimulationEngine } from '../src/engine/simulation';
import { SimulationSnapshot, StrategyName } from '../src/engine/types';
import {
  DEFAULT_PHILOSOPHERS,
  MAX_PHILOSOPHERS,
  MIN_PHILOSOPHERS,
} from '../src/scenarios/philosopherCount';
import {
  CAS_LIVELOCK_PRESET,
  FORCE_DEADLOCK_PRESET,
  getScenarioDescription,
  NORMAL_PRESET,
  SCENARIO_PRESETS,
  STARVATION_PRESET,
} from '../src/scenarios/presets';
import { adaptConfigToPhilosopherCount, buildSimulationConfig } from '../src/ui/App';
import { getStrategyTradeoffNotes, STRATEGY_TRADEOFF_NOTES } from '../src/ui/ComparisonPanel';
import { Controls, getStrategySummary, STRATEGY_OPTIONS } from '../src/ui/Controls';

const ALL_STRATEGIES: readonly StrategyName[] = ['naive', 'semaphore', 'monitor', 'cas'];
const ALL_COUNTS: readonly number[] = Array.from(
  { length: MAX_PHILOSOPHERS - MIN_PHILOSOPHERS + 1 },
  (_, i) => MIN_PHILOSOPHERS + i
);

function createEngine(
  scenarioId: string,
  strategy: StrategyName,
  philosopherCount: number,
  seed = 42
): SimulationEngine {
  const preset = SCENARIO_PRESETS.find((p) => p.id === scenarioId)!;
  const cfg = buildSimulationConfig(
    scenarioId,
    strategy,
    seed,
    preset.config.casBackoffMode ?? 'random',
    philosopherCount
  );
  return new SimulationEngine(cfg, createStrategyByName(strategy));
}

function expectRingTopology(snapshot: SimulationSnapshot, count: number): void {
  expect(snapshot.config.philosopherCount).toBe(count);
  expect(snapshot.philosophers).toHaveLength(count);
  expect(snapshot.forks).toHaveLength(count);
  snapshot.philosophers.forEach((phil, i) => {
    expect(phil.id).toBe(i);
    expect(phil.leftForkId).toBe(i);
    expect(phil.rightForkId).toBe((i + 1) % count);
  });
  snapshot.forks.forEach((fork, i) => expect(fork.id).toBe(i));
}

describe('Philosopher count: defaults', () => {
  it('defaults to 5 philosophers within the 3..8 range', () => {
    expect(DEFAULT_PHILOSOPHERS).toBe(5);
    expect(MIN_PHILOSOPHERS).toBe(3);
    expect(MAX_PHILOSOPHERS).toBe(8);
    for (const preset of SCENARIO_PRESETS) {
      expect(preset.config.philosopherCount).toBe(DEFAULT_PHILOSOPHERS);
    }

    const cfg = buildSimulationConfig(NORMAL_PRESET.id, 'naive', 42, 'random');
    const engine = new SimulationEngine(cfg, createStrategyByName('naive'));
    expectRingTopology(engine.getSnapshot(), DEFAULT_PHILOSOPHERS);
  });

  it('renders the Number of Philosophers input above Scenario Preset with 3..8 bounds', () => {
    const noop = () => undefined;
    const html = renderToStaticMarkup(
      <Controls
        scenarioId={NORMAL_PRESET.id}
        philosopherCount={DEFAULT_PHILOSOPHERS}
        minPhilosophers={MIN_PHILOSOPHERS}
        maxPhilosophers={MAX_PHILOSOPHERS}
        strategy="naive"
        casBackoffMode="random"
        seed={42}
        speedMs={600}
        isRunning={false}
        isDeadlocked={false}
        tick={0}
        onScenarioChange={noop}
        onPhilosopherCountChange={noop}
        onStrategyChange={noop}
        onCasBackoffModeChange={noop}
        onSeedChange={noop}
        onSpeedChange={noop}
        onStart={noop}
        onPause={noop}
        onStep={noop}
        onReset={noop}
      />
    );
    expect(html).toContain('Number of Philosophers');
    expect(html).toContain('Enter an integer from 3 to 8');
    expect(html).toMatch(/id="philosopher-count-input"[^>]*min="3"[^>]*max="8"/);
    expect(html).toMatch(/id="philosopher-count-input"[^>]*value="5"/);
    expect(html.indexOf('philosopher-count-input')).toBeLessThan(
      html.indexOf('scenario-select')
    );
  });
});

describe('Philosopher count: preset adaptation', () => {
  it('leaves every preset config exactly unchanged at the default count of 5', () => {
    for (const preset of SCENARIO_PRESETS) {
      expect(adaptConfigToPhilosopherCount(preset.config, DEFAULT_PHILOSOPHERS)).toBe(
        preset.config
      );
      for (const strategy of ALL_STRATEGIES) {
        expect(buildSimulationConfig(preset.id, strategy, 7, 'fixed', DEFAULT_PHILOSOPHERS)).toEqual(
          buildSimulationConfig(preset.id, strategy, 7, 'fixed')
        );
      }
    }
  });

  it('resizes every per-philosopher array to the selected count for all presets', () => {
    for (const preset of SCENARIO_PRESETS) {
      for (const count of ALL_COUNTS) {
        const cfg = adaptConfigToPhilosopherCount(preset.config, count);
        expect(cfg.philosopherCount).toBe(count);
        for (const arr of [
          cfg.initialStates,
          cfg.initialThinkTicks,
          cfg.perPhilosopherThinkRanges,
          cfg.perPhilosopherEatRanges,
        ]) {
          if (arr !== undefined) {
            expect(arr).toHaveLength(count);
          }
        }
        // Non-array settings are never altered by the adaptation
        expect(cfg.thinkTicksRange).toEqual(preset.config.thinkTicksRange);
        expect(cfg.eatTicksRange).toEqual(preset.config.eatTicksRange);
        expect(cfg.starvationThresholdTicks).toBe(preset.config.starvationThresholdTicks);
        expect(cfg.livelockWindowTicks).toBe(preset.config.livelockWindowTicks);
      }
    }
  });

  it('keeps symmetric presets all-Hungry at every count', () => {
    for (const preset of [FORCE_DEADLOCK_PRESET, CAS_LIVELOCK_PRESET]) {
      for (const count of ALL_COUNTS) {
        const cfg = adaptConfigToPhilosopherCount(preset.config, count);
        expect(cfg.initialStates).toEqual(Array.from({ length: count }, () => 'Hungry'));
      }
    }
  });

  it('keeps the Starvation preset P0..P2 profiles intact and pads extra seats with the last profile', () => {
    const base = STARVATION_PRESET.config;
    const cfg = adaptConfigToPhilosopherCount(base, 8);
    expect(cfg.perPhilosopherThinkRanges!.slice(0, 5)).toEqual(base.perPhilosopherThinkRanges);
    expect(cfg.perPhilosopherThinkRanges!.slice(5)).toEqual([
      base.perPhilosopherThinkRanges![4],
      base.perPhilosopherThinkRanges![4],
      base.perPhilosopherThinkRanges![4],
    ]);
    const small = adaptConfigToPhilosopherCount(base, 3);
    expect(small.perPhilosopherEatRanges).toEqual(base.perPhilosopherEatRanges!.slice(0, 3));
  });
});

describe('Philosopher count: engine initialization and reset', () => {
  it.each([3, 5, 8])('initializes %i philosophers and %i forks', (count) => {
    for (const strategy of ALL_STRATEGIES) {
      const engine = createEngine(NORMAL_PRESET.id, strategy, count);
      expectRingTopology(engine.getSnapshot(), count);
    }
  });

  it('resets cleanly to a different count while preserving strategy and seed', () => {
    const engine = createEngine(NORMAL_PRESET.id, 'semaphore', 5, 123);
    engine.runTicks(10);
    expect(engine.getSnapshot().tick).toBe(10);

    for (const nextCount of [3, 8, 5]) {
      const snap = engine.reset(
        buildSimulationConfig(NORMAL_PRESET.id, 'semaphore', 123, 'random', nextCount),
        createStrategyByName('semaphore')
      );
      expect(snap.tick).toBe(0);
      expect(snap.totalMealsCompleted).toBe(0);
      expect(snap.config.strategy).toBe('semaphore');
      expect(snap.config.seed).toBe(123);
      expectRingTopology(snap, nextCount);
      expect(snap.forks.every((f) => f.ownerId === null)).toBe(true);
      expect(engine.getEventLog().every((e) => e.tick === 0)).toBe(true);

      const advanced = engine.runTicks(15);
      expect(advanced.philosophers).toHaveLength(nextCount);
    }
  });

  it('produces identical runs at count 5 whether or not the count is passed explicitly', () => {
    for (const preset of SCENARIO_PRESETS) {
      const strategy = preset.config.strategy ?? 'naive';
      const backoff = preset.config.casBackoffMode ?? 'random';
      const implicit = new SimulationEngine(
        buildSimulationConfig(preset.id, strategy, 42, backoff),
        createStrategyByName(strategy)
      ).runTicks(40);
      const explicit = createEngine(preset.id, strategy, DEFAULT_PHILOSOPHERS).runTicks(40);
      expect(explicit).toEqual(implicit);
    }
  });
});

describe('Philosopher count: all strategies across counts 3..8', () => {
  it('every preset x strategy x count initializes and advances without invariant errors', () => {
    for (const preset of SCENARIO_PRESETS) {
      for (const strategy of ALL_STRATEGIES) {
        for (const count of ALL_COUNTS) {
          const engine = createEngine(preset.id, strategy, count);
          expectRingTopology(engine.getSnapshot(), count);
          const snap = engine.runTicks(60);
          expect(snap.tick).toBeGreaterThan(0);
          expect(snap.philosophers).toHaveLength(count);
          // Each held fork is owned by exactly one adjacent philosopher
          for (const fork of snap.forks) {
            if (fork.ownerId !== null) {
              const owner = snap.philosophers[fork.ownerId]!;
              expect([owner.leftForkId, owner.rightForkId]).toContain(fork.id);
            }
          }
        }
      }
    }
  });

  it('Semaphore issues N - 1 room permits for every count', () => {
    for (const count of ALL_COUNTS) {
      const snap = createEngine(FORCE_DEADLOCK_PRESET.id, 'semaphore', count).step();
      const state = snap.strategyState as { readonly maxPermits: number } | undefined;
      expect(state?.maxPermits).toBe(count - 1);
      expect(snap.detectors.deadlocked).toBe(false);
    }
  });

  it('Force Deadlock still deadlocks Naive at tick 1 for every count', () => {
    for (const count of ALL_COUNTS) {
      const snap = createEngine(FORCE_DEADLOCK_PRESET.id, 'naive', count).step();
      expect(snap.detectors.deadlocked).toBe(true);
      expect(snap.philosophers.every((p) => p.heldForkIds.length === 1)).toBe(true);
    }
  });

  it('Monitor and Semaphore make progress under Force Deadlock for every count', () => {
    for (const strategy of ['monitor', 'semaphore'] as const) {
      for (const count of ALL_COUNTS) {
        const snap = createEngine(FORCE_DEADLOCK_PRESET.id, strategy, count).runTicks(40);
        expect(snap.detectors.deadlocked).toBe(false);
        expect(snap.totalMealsCompleted).toBeGreaterThan(0);
      }
    }
  });

  it('CAS Livelock (fixed back-off) is still detected as suspected livelock for every count', () => {
    for (const count of ALL_COUNTS) {
      const engine = createEngine(CAS_LIVELOCK_PRESET.id, 'cas', count);
      const snap = engine.runTicks(CAS_LIVELOCK_PRESET.config.livelockWindowTicks ?? 12);
      expect(snap.detectors.livelockDetected).toBe(true);
    }
  });
});

describe('Philosopher count: count-aware descriptions', () => {
  it('matches the original static text exactly at the default count of 5', () => {
    for (const opt of STRATEGY_OPTIONS) {
      expect(getStrategySummary(opt.value, DEFAULT_PHILOSOPHERS)).toBe(opt.summary);
    }
    expect(getStrategyTradeoffNotes(DEFAULT_PHILOSOPHERS)).toEqual(STRATEGY_TRADEOFF_NOTES);
    for (const preset of SCENARIO_PRESETS) {
      expect(getScenarioDescription(preset, DEFAULT_PHILOSOPHERS)).toBe(preset.description);
    }
  });

  it('reflects N - 1 permits and the selected count in other configurations', () => {
    expect(getStrategySummary('semaphore', 3)).toContain('N-1 = 2');
    expect(getStrategySummary('semaphore', 8)).toContain('N-1 = 7');
    const semNote8 = getStrategyTradeoffNotes(8).find((n) => n.strategyKey === 'semaphore')!;
    expect(semNote8.mechanism).toContain('N−1 = 7 room permits');
    expect(semNote8.mechanism).toContain('8th philosopher');
    const naiveNote3 = getStrategyTradeoffNotes(3).find((n) => n.strategyKey === 'naive')!;
    expect(naiveNote3.tradeoff).toContain('all 3 philosophers');

    expect(getScenarioDescription(FORCE_DEADLOCK_PRESET, 8)).toContain('All eight philosophers');
    expect(getScenarioDescription(CAS_LIVELOCK_PRESET, 3)).toContain('all three philosophers');
    expect(getScenarioDescription(STARVATION_PRESET, 6)).toContain('starvation is not guaranteed');
    expect(getScenarioDescription(NORMAL_PRESET, 7)).toBe(NORMAL_PRESET.description);
    for (const preset of SCENARIO_PRESETS) {
      for (const count of ALL_COUNTS) {
        if (count !== DEFAULT_PHILOSOPHERS) {
          expect(getScenarioDescription(preset, count)).not.toMatch(/\ball five philosophers\b/i);
        }
      }
    }
  });
});
