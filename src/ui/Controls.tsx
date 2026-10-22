import { useEffect, useState } from 'react';
import { CasBackoffMode, StrategyName } from '../engine/types';
import { SCENARIO_PRESETS } from '../scenarios/presets';
import { toOrdinal } from '../scenarios/philosopherCount';

export interface ControlsProps {
  readonly scenarioId: string;
  readonly philosopherCount: number;
  readonly minPhilosophers: number;
  readonly maxPhilosophers: number;
  readonly strategy: StrategyName;
  readonly casBackoffMode: CasBackoffMode;
  readonly seed: number;
  readonly speedMs: number;
  readonly isRunning: boolean;
  readonly isDeadlocked: boolean;
  readonly tick: number;
  readonly onScenarioChange: (scenarioId: string) => void;
  readonly onPhilosopherCountChange: (count: number) => void;
  readonly onStrategyChange: (strategy: StrategyName) => void;
  readonly onCasBackoffModeChange: (mode: CasBackoffMode) => void;
  readonly onSeedChange: (seed: number) => void;
  readonly onSpeedChange: (speedMs: number) => void;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onStep: () => void;
  readonly onReset: () => void;
}

export const STRATEGY_OPTIONS: ReadonlyArray<{
  readonly value: StrategyName;
  readonly label: string;
  readonly summary: string;
}> = [
  {
    value: 'naive',
    label: 'Naive (Left Fork, then Right Fork)',
    summary:
      'Each hungry philosopher grabs their left fork first and waits for their right fork while holding the left fork.',
  },
  {
    value: 'semaphore',
    label: 'Counting Semaphore (N-1 Permits + FIFO)',
    summary:
      'At most N-1 = 4 philosophers may hold room permits at once; 5th waits in a strict FIFO queue, preventing circular wait.',
  },
  {
    value: 'monitor',
    label: 'Monitor (test(i) + Condition Variables)',
    summary:
      'pickup(i) and putdown(i) coordinate via test(i): a philosopher acquires both forks atomically only when neither neighbor is Eating.',
  },
  {
    value: 'cas',
    label: 'Lock-free (simulated CAS)',
    summary:
      'Deterministic single-fork compare-and-swap per cycle. If right-fork CAS fails, rolls back left fork and backs off (fixed vs. seeded random).',
  },
];

export const SPEED_PRESETS: ReadonlyArray<{
  readonly ms: number;
  readonly label: string;
}> = [
  { ms: 1000, label: '0.5x Slow (1000 ms)' },
  { ms: 600, label: '1x Normal (600 ms)' },
  { ms: 300, label: '2x Fast (300 ms)' },
  { ms: 120, label: '5x Turbo (120 ms)' },
];

export function nextDeterministicSeed(currentSeed: number): number {
  const next = ((Math.imul(currentSeed | 0, 1664525) + 1013904223) >>> 0) % 9973;
  return next === currentSeed ? next + 1 : Math.max(1, next);
}

/**
 * Returns the strategy summary worded for the selected philosopher count.
 * Only the Semaphore summary depends on N (N − 1 room permits); for N = 5 it matches the
 * static summary in STRATEGY_OPTIONS exactly.
 */
export function getStrategySummary(strategy: StrategyName, philosopherCount: number): string {
  if (strategy === 'semaphore') {
    const permits = Math.max(1, philosopherCount - 1);
    return `At most N-1 = ${permits} philosophers may hold room permits at once; ${toOrdinal(philosopherCount)} waits in a strict FIFO queue, preventing circular wait.`;
  }
  const option = STRATEGY_OPTIONS.find((opt) => opt.value === strategy) ?? STRATEGY_OPTIONS[0]!;
  return option.summary;
}

export function Controls({
  scenarioId,
  philosopherCount,
  minPhilosophers,
  maxPhilosophers,
  strategy,
  casBackoffMode,
  seed,
  speedMs,
  isRunning,
  isDeadlocked,
  tick,
  onScenarioChange,
  onPhilosopherCountChange,
  onStrategyChange,
  onCasBackoffModeChange,
  onSeedChange,
  onSpeedChange,
  onStart,
  onPause,
  onStep,
  onReset,
}: ControlsProps) {
  // Local draft so the user can type freely; only valid integers in range are applied.
  const [philosopherCountDraft, setPhilosopherCountDraft] = useState<string>(
    String(philosopherCount)
  );
  useEffect(() => {
    setPhilosopherCountDraft(String(philosopherCount));
  }, [philosopherCount]);

  const parseValidPhilosopherCount = (raw: string): number | null => {
    if (!/^\d+$/.test(raw.trim())) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return parsed >= minPhilosophers && parsed <= maxPhilosophers ? parsed : null;
  };

  const handlePhilosopherCountInputChange = (raw: string) => {
    setPhilosopherCountDraft(raw);
    const parsed = parseValidPhilosopherCount(raw);
    if (parsed !== null && parsed !== philosopherCount) {
      onPhilosopherCountChange(parsed);
    }
  };

  const handlePhilosopherCountBlur = () => {
    // Revert any invalid/out-of-range draft to the currently applied count.
    if (parseValidPhilosopherCount(philosopherCountDraft) === null) {
      setPhilosopherCountDraft(String(philosopherCount));
    }
  };

  const isPhilosopherCountDraftInvalid =
    parseValidPhilosopherCount(philosopherCountDraft) === null;

  const handleSeedInputChange = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      onSeedChange(parsed);
    }
  };

  const handleRerollSeed = () => {
    onSeedChange(nextDeterministicSeed(seed));
  };

  return (
    <aside className="panel controls-panel" aria-label="Simulation Controls">
      <div className="panel-header-row">
        <h2 className="panel-title">Simulation Setup &amp; Controls</h2>
        <span className="mono-meta">Seed #{seed} · Cycle {tick}</span>
      </div>

      {/* Primary Action Toolbar */}
      <div className="playback-toolbar" role="group" aria-label="Playback actions">
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Start simulation"
          disabled={isRunning || isDeadlocked}
          onClick={onStart}
        >
          Start
        </button>
        <button
          type="button"
          className="btn btn-outline"
          aria-label="Pause simulation"
          disabled={!isRunning}
          onClick={onPause}
        >
          Pause
        </button>
        <button
          type="button"
          className="btn btn-outline"
          aria-label="Step one tick"
          onClick={onStep}
        >
          Step
        </button>
        <button
          type="button"
          className="btn btn-reset"
          aria-label="Reset simulation"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="controls-stack">
        {/* 0. Number of Philosophers */}
        <div className="control-group">
          <label htmlFor="philosopher-count-input" className="control-label">
            Number of Philosophers
          </label>
          <input
            id="philosopher-count-input"
            type="number"
            inputMode="numeric"
            aria-label="Number of philosophers"
            aria-invalid={isPhilosopherCountDraftInvalid}
            className="control-input mono-input"
            min={minPhilosophers}
            max={maxPhilosophers}
            step={1}
            value={philosopherCountDraft}
            onChange={(e) => handlePhilosopherCountInputChange(e.target.value)}
            onBlur={handlePhilosopherCountBlur}
          />
          <p className="control-hint">
            Enter an integer from {minPhilosophers} to {maxPhilosophers}
          </p>
        </div>

        {/* 1. Scenario Preset Selector */}
        <div className="control-group">
          <label htmlFor="scenario-select" className="control-label">
            Scenario Preset
          </label>
          <select
            id="scenario-select"
            aria-label="Scenario preset"
            className="control-select"
            value={scenarioId}
            onChange={(e) => onScenarioChange(e.target.value)}
          >
            {SCENARIO_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Synchronization Strategy Selector */}
        <div className="control-group">
          <label htmlFor="strategy-select" className="control-label">
            Synchronization Strategy
          </label>
          <select
            id="strategy-select"
            aria-label="Synchronization strategy"
            className="control-select"
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value as StrategyName)}
          >
            {STRATEGY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Optional CAS Back-off Selector */}
        {strategy === 'cas' && (
          <div className="control-group cas-backoff-box">
            <label htmlFor="cas-backoff-select" className="control-label">
              Simulated CAS Back-off Mode
            </label>
            <select
              id="cas-backoff-select"
              aria-label="CAS back-off mode"
              className="control-select"
              value={casBackoffMode}
              onChange={(e) => onCasBackoffModeChange(e.target.value as CasBackoffMode)}
            >
              <option value="fixed">Fixed Back-off (2 cycles — demonstrates livelock)</option>
              <option value="random">
                Seeded Randomized Back-off (1..5 cycles — breaks symmetry)
              </option>
            </select>
          </div>
        )}

        {/* 3, 4 & 5. Random Seed + Reroll + Cycle Speed */}
        <div className="controls-two-col">
          <div className="control-group">
            <label htmlFor="seed-input" className="control-label">
              Random Seed
            </label>
            <div className="seed-input-row">
              <input
                id="seed-input"
                type="number"
                aria-label="Deterministic RNG seed"
                className="control-input mono-input"
                value={seed}
                onChange={(e) => handleSeedInputChange(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline btn-reroll"
                aria-label="Reroll seed"
                onClick={handleRerollSeed}
                title="Reroll deterministic PRNG seed"
              >
                Reroll
              </button>
            </div>
          </div>

          <div className="control-group">
            <label htmlFor="speed-select" className="control-label">
              Cycle Speed
            </label>
            <select
              id="speed-select"
              aria-label="Simulation speed"
              className="control-select"
              value={speedMs}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
            >
              {SPEED_PRESETS.map((preset) => (
                <option key={preset.ms} value={preset.ms}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </aside>
  );
}
