import { useEffect, useMemo, useRef, useState } from 'react';
import { createStrategyByName, SimulationEngine } from '../engine/simulation';
import {
  CasBackoffMode,
  ScenarioPreset,
  SimulationConfig,
  SimulationSnapshot,
  StrategyName,
} from '../engine/types';
import { getScenarioPreset, NORMAL_PRESET } from '../scenarios/presets';
import {
  DEFAULT_PHILOSOPHERS,
  MAX_PHILOSOPHERS,
  MIN_PHILOSOPHERS,
} from '../scenarios/philosopherCount';
import { ComparisonPanel } from './ComparisonPanel';
import { Controls } from './Controls';
import { SimulationTable } from './SimulationTable';

export { DEFAULT_PHILOSOPHERS, MAX_PHILOSOPHERS, MIN_PHILOSOPHERS };

/**
 * Resizes a per-philosopher preset array to `count` entries by repeating the preset's
 * pattern cyclically. Returns undefined when the preset does not define the array.
 */
function resizeCyclic<T>(source: readonly T[] | undefined, count: number): readonly T[] | undefined {
  if (!source || source.length === 0 || source.length === count) {
    return source;
  }
  return Array.from({ length: count }, (_, i) => source[i % source.length]!);
}

/**
 * Resizes a per-philosopher preset array to `count` entries by truncating, or by giving every
 * additional seat a copy of the preset's last entry. Returns undefined when not defined.
 */
function resizePadLast<T>(source: readonly T[] | undefined, count: number): readonly T[] | undefined {
  if (!source || source.length === 0 || source.length === count) {
    return source;
  }
  return Array.from({ length: count }, (_, i) => source[Math.min(i, source.length - 1)]!);
}

/**
 * Returns the scenario preset's config adapted to the requested philosopher count.
 * Per-philosopher arrays (initial states, initial think ticks, per-philosopher timing ranges)
 * are resized so they always match `philosopherCount`, which the engine validates.
 * When the count equals the preset's own count, the preset config is returned unchanged.
 *
 * Resize rule:
 * - Presets with hand-tuned per-philosopher timing profiles (e.g. Starvation) truncate, or pad
 *   extra seats with the last philosopher's profile, so the designed neighbourhood around
 *   P0..P2 is not disturbed by newly introduced fast-cycling neighbours.
 * - All other presets repeat their pattern cyclically, which keeps uniform presets uniform
 *   (Force Deadlock / CAS Livelock stay all-Hungry) and keeps Normal's start times staggered.
 */
export function adaptConfigToPhilosopherCount(
  config: SimulationConfig,
  philosopherCount: number
): SimulationConfig {
  if (config.philosopherCount === philosopherCount) {
    return config;
  }
  const hasTunedProfiles =
    config.perPhilosopherThinkRanges !== undefined || config.perPhilosopherEatRanges !== undefined;
  const resize = hasTunedProfiles ? resizePadLast : resizeCyclic;
  return {
    ...config,
    philosopherCount,
    initialStates: resize(config.initialStates, philosopherCount),
    initialThinkTicks: resize(config.initialThinkTicks, philosopherCount),
    perPhilosopherThinkRanges: resize(config.perPhilosopherThinkRanges, philosopherCount),
    perPhilosopherEatRanges: resize(config.perPhilosopherEatRanges, philosopherCount),
  };
}

export function buildSimulationConfig(
  scenarioId: string,
  strategy: StrategyName,
  seed: number,
  casBackoffMode: CasBackoffMode,
  philosopherCount?: number
): SimulationConfig {
  const preset = getScenarioPreset(scenarioId);
  const baseConfig =
    philosopherCount === undefined
      ? preset.config
      : adaptConfigToPhilosopherCount(preset.config, philosopherCount);
  return {
    ...baseConfig,
    strategy,
    seed,
    casBackoffMode,
  };
}

export function App() {
  const initialScenario = NORMAL_PRESET;
  const initialStrategy: StrategyName = initialScenario.config.strategy ?? 'naive';
  const initialSeed: number = initialScenario.config.seed ?? 42;
  const initialBackoff: CasBackoffMode = initialScenario.config.casBackoffMode ?? 'random';
  const initialPhilosopherCount: number =
    initialScenario.config.philosopherCount ?? DEFAULT_PHILOSOPHERS;

  const engineRef = useRef<SimulationEngine | null>(null);
  if (engineRef.current === null) {
    const cfg = buildSimulationConfig(
      initialScenario.id,
      initialStrategy,
      initialSeed,
      initialBackoff,
      initialPhilosopherCount
    );
    engineRef.current = new SimulationEngine(cfg, createStrategyByName(initialStrategy));
  }

  const [scenarioId, setScenarioId] = useState<string>(initialScenario.id);
  const [strategy, setStrategy] = useState<StrategyName>(initialStrategy);
  const [casBackoffMode, setCasBackoffMode] = useState<CasBackoffMode>(initialBackoff);
  const [seed, setSeed] = useState<number>(initialSeed);
  const [philosopherCount, setPhilosopherCount] = useState<number>(initialPhilosopherCount);
  const [speedMs, setSpeedMs] = useState<number>(600);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    engineRef.current!.getSnapshot()
  );

  const resetEngineWith = (
    nextScenarioId: string,
    nextStrategy: StrategyName,
    nextSeed: number,
    nextBackoffMode: CasBackoffMode,
    nextPhilosopherCount: number = philosopherCount
  ) => {
    setIsRunning(false);
    const cfg = buildSimulationConfig(
      nextScenarioId,
      nextStrategy,
      nextSeed,
      nextBackoffMode,
      nextPhilosopherCount
    );
    const engine = engineRef.current!;
    const nextSnapshot = engine.reset(cfg, createStrategyByName(nextStrategy));
    setSnapshot(nextSnapshot);
  };

  const handleScenarioChange = (nextScenarioId: string) => {
    const preset = getScenarioPreset(nextScenarioId);
    const nextStrategy: StrategyName = preset.config.strategy ?? strategy;
    const nextSeed: number = preset.config.seed ?? seed;
    const nextBackoff: CasBackoffMode = preset.config.casBackoffMode ?? casBackoffMode;

    setScenarioId(nextScenarioId);
    setStrategy(nextStrategy);
    setSeed(nextSeed);
    setCasBackoffMode(nextBackoff);
    resetEngineWith(nextScenarioId, nextStrategy, nextSeed, nextBackoff);
  };

  const handlePhilosopherCountChange = (nextCount: number) => {
    if (
      !Number.isInteger(nextCount) ||
      nextCount < MIN_PHILOSOPHERS ||
      nextCount > MAX_PHILOSOPHERS
    ) {
      return;
    }
    setPhilosopherCount(nextCount);
    resetEngineWith(scenarioId, strategy, seed, casBackoffMode, nextCount);
  };

  const handleStrategyChange = (nextStrategy: StrategyName) => {
    setStrategy(nextStrategy);
    resetEngineWith(scenarioId, nextStrategy, seed, casBackoffMode);
  };

  const handleCasBackoffModeChange = (nextMode: CasBackoffMode) => {
    setCasBackoffMode(nextMode);
    resetEngineWith(scenarioId, strategy, seed, nextMode);
  };

  const handleSeedChange = (nextSeed: number) => {
    setSeed(nextSeed);
    resetEngineWith(scenarioId, strategy, nextSeed, casBackoffMode);
  };

  const handleStart = () => {
    if (!snapshot.detectors.deadlocked) {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStep = () => {
    setIsRunning(false);
    const engine = engineRef.current!;
    const nextSnapshot = engine.step();
    setSnapshot(nextSnapshot);
  };

  const handleReset = () => {
    resetEngineWith(scenarioId, strategy, seed, casBackoffMode);
  };

  // Playback timer effect with full cleanup to prevent duplicate intervals in React StrictMode
  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      const nextSnapshot = engine.step();
      setSnapshot(nextSnapshot);

      if (nextSnapshot.detectors.deadlocked) {
        setIsRunning(false);
      }
    }, speedMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRunning, speedMs]);

  // Active preset adapted to the selected philosopher count so the cross-strategy comparison
  // runs against the same table size as the live simulation. Memoized to keep identity stable.
  const activeScenario: ScenarioPreset = useMemo(() => {
    const preset = getScenarioPreset(scenarioId);
    return {
      ...preset,
      config: adaptConfigToPhilosopherCount(preset.config, philosopherCount),
    };
  }, [scenarioId, philosopherCount]);
  const meanWaitTicks =
    snapshot.philosophers.length > 0
      ? (
          snapshot.philosophers.reduce((sum, p) => sum + p.totalWaitTicks, 0) /
          snapshot.philosophers.length
        ).toFixed(1)
      : '0.0';

  return (
    <div className="workspace-root">
      <main className="app-shell">
        {/* A. Compact Top Navigation Bar */}
        <header className="top-nav">
          <div className="top-nav-brand">
            <div className="brand-title-row">
              <h1 className="page-title">
                Dining Philosophers{' '}
                <span className="sr-only">OS Concurrency Simulator</span>
              </h1>
              <span className="page-subtitle">OS Concurrency Simulator</span>
            </div>
            <div className="live-status-indicator" aria-live="polite">
              <span
                className={`live-dot ${
                  snapshot.detectors.deadlocked
                    ? 'live-dot-deadlock'
                    : isRunning
                      ? 'live-dot-running'
                      : 'live-dot-paused'
                }`}
              />
              <span className="live-status-text">
                {snapshot.detectors.deadlocked
                  ? 'Deadlocked'
                  : isRunning
                    ? 'Live'
                    : 'Paused'}
              </span>
            </div>
          </div>

          <div className="top-nav-stats" aria-label="Simulation Statistics">
            <div className="stat-inline">
              <span className="stat-number">{snapshot.tick}</span>
              <span className="stat-label">CYCLES</span>
            </div>
            <div className="stat-inline">
              <span className="stat-number">{meanWaitTicks}</span>
              <span className="stat-label">MEAN RULES</span>
            </div>
            <div className="stat-inline">
              <span className="stat-number">{snapshot.totalMealsCompleted}</span>
              <span className="stat-label">MEALS COMPLETED</span>
            </div>
          </div>
        </header>

        {/* Detector Alert Banners (Deadlock, Threshold Starvation, Suspected Livelock) */}
        <DetectorBanners snapshot={snapshot} />

        {/* B. Main Simulation Workspace: Left/Center Circular Arena (62%) + Right Controls (38%) */}
        <div className="main-workspace-grid">
          <SimulationTable snapshot={snapshot} renderMetricsInline={false} />
          <Controls
            scenarioId={scenarioId}
            philosopherCount={philosopherCount}
            minPhilosophers={MIN_PHILOSOPHERS}
            maxPhilosophers={MAX_PHILOSOPHERS}
            strategy={strategy}
            casBackoffMode={casBackoffMode}
            seed={seed}
            speedMs={speedMs}
            isRunning={isRunning}
            isDeadlocked={snapshot.detectors.deadlocked}
            tick={snapshot.tick}
            onScenarioChange={handleScenarioChange}
            onPhilosopherCountChange={handlePhilosopherCountChange}
            onStrategyChange={handleStrategyChange}
            onCasBackoffModeChange={handleCasBackoffModeChange}
            onSeedChange={handleSeedChange}
            onSpeedChange={setSpeedMs}
            onStart={handleStart}
            onPause={handlePause}
            onStep={handleStep}
            onReset={handleReset}
          />
        </div>

        {/* C. Cross-Strategy Comparison Table */}
        <ComparisonPanel
          scenario={activeScenario}
          seed={seed}
          activeStrategy={strategy}
          activeCasBackoffMode={casBackoffMode}
          onSelectStrategy={handleStrategyChange}
        />
      </main>
    </div>
  );
}

export function DetectorBanners({ snapshot }: { readonly snapshot: SimulationSnapshot }) {
  const {
    deadlocked,
    deadlockReason,
    starvationDetected,
    starvationReason,
    livelockDetected,
    livelockReason,
  } = snapshot.detectors;

  if (!deadlocked && !starvationDetected && !livelockDetected) {
    return null;
  }

  return (
    <section
      className="detector-banners"
      aria-label="Concurrency Detector Alerts"
      role="alert"
    >
      {deadlocked && (
        <div className="banner banner-deadlock" data-detector="deadlock">
          <div className="banner-title">
            DEADLOCK DETECTED — Circular Wait &amp; Four Coffman Conditions Hold
          </div>
          <p className="banner-body">{deadlockReason}</p>
        </div>
      )}

      {starvationDetected && (
        <div className="banner banner-starvation" data-detector="starvation">
          <div className="banner-title">
            STARVATION ALERT — <span>starvation detected by threshold</span> (≥
            {snapshot.config.starvationThresholdTicks} wait cycles)
          </div>
          <p className="banner-body">{starvationReason}</p>
        </div>
      )}

      {livelockDetected && (
        <div className="banner banner-livelock" data-detector="livelock">
          <div className="banner-title">
            SUSPECTED LIVELOCK — Active CAS Retries &amp; Rollbacks With Zero Meals in
            Window ({snapshot.config.livelockWindowTicks} cycles)
          </div>
          <p className="banner-body">{livelockReason}</p>
        </div>
      )}
    </section>
  );
}
