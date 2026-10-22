import { useMemo, useState } from 'react';
import { CasBackoffMode, ScenarioPreset, StrategyName } from '../engine/types';
import { runStrategyBatchComparison, StrategyRunSpec } from '../runner/batchRunner';
import { formatComparisonRows } from '../runner/formatResults';
import { toOrdinal } from '../scenarios/philosopherCount';

export interface ComparisonPanelProps {
  readonly scenario: ScenarioPreset;
  readonly seed: number;
  readonly initialTicks?: number;
  readonly activeStrategy?: StrategyName;
  readonly activeCasBackoffMode?: CasBackoffMode;
  readonly onSelectStrategy?: (strategy: StrategyName) => void;
}

export const COMPARISON_SPECS: readonly StrategyRunSpec[] = [
  { strategy: 'naive', label: 'Naive (Left → Right)' },
  { strategy: 'semaphore', label: 'Semaphore (N−1 Permits, FIFO)' },
  { strategy: 'monitor', label: 'Monitor (test(i) + Condition)' },
  {
    strategy: 'cas',
    casBackoffMode: 'fixed',
    label: 'Lock-free (simulated CAS — Fixed Back-off)',
  },
  {
    strategy: 'cas',
    casBackoffMode: 'random',
    label: 'Lock-free (simulated CAS — Seeded Random)',
  },
];

export interface StrategyTradeoffNote {
  readonly strategyKey: StrategyName;
  readonly title: string;
  readonly mechanism: string;
  readonly tradeoff: string;
}

export const STRATEGY_TRADEOFF_NOTES: readonly StrategyTradeoffNote[] = [
  {
    strategyKey: 'naive',
    title: 'Naive (Left → Right)',
    mechanism:
      'Acquires left fork first, then waits for right fork while holding left fork (hold-and-wait).',
    tradeoff:
      'Zero coordination overhead under staggered arrivals, but deadlocks immediately (0 meals) when all 5 philosophers become Hungry symmetrically.',
  },
  {
    strategyKey: 'semaphore',
    title: 'Counting Semaphore (N−1 Permits + FIFO)',
    mechanism:
      'Limits concurrent fork contenders to N−1 = 4 room permits and queues the 5th philosopher in strict FIFO order.',
    tradeoff:
      'Prevents circular-wait deadlock and bounds queuing delay via FIFO handoff, at the cost of permit management and two-step fork acquisition.',
  },
  {
    strategyKey: 'monitor',
    title: 'Monitor (test(i) + Condition Variables)',
    mechanism:
      'pickup(i) and putdown(i) coordinate via test(i): both forks are allocated atomically only when neither neighbor is Eating.',
    tradeoff:
      'Eliminates hold-and-wait (never holds a single fork while waiting) and achieves high throughput, but without a FIFO queue fast-cycling neighbors can starve a middle philosopher.',
  },
  {
    strategyKey: 'cas',
    title: 'Lock-free (simulated CAS — Fixed vs. Random Back-off)',
    mechanism:
      'Attempts single-fork CAS on left fork, then right fork on the next cycle; rolls back left fork and backs off if right-fork CAS fails.',
    tradeoff:
      'Avoids passive deadlock because failed second-fork claims release the first fork, but symmetric fixed back-off causes synchronized livelock until seeded randomized back-off breaks symmetry.',
  },
];

/**
 * Returns STRATEGY_TRADEOFF_NOTES worded for the selected philosopher count.
 * Only the Naive trade-off ("all N philosophers") and the Semaphore mechanism (N−1 permits)
 * depend on N; at N = 5 the result matches STRATEGY_TRADEOFF_NOTES exactly.
 */
export function getStrategyTradeoffNotes(
  philosopherCount: number
): readonly StrategyTradeoffNote[] {
  const permits = Math.max(1, philosopherCount - 1);
  return STRATEGY_TRADEOFF_NOTES.map((note) => {
    if (note.strategyKey === 'naive') {
      return {
        ...note,
        tradeoff: `Zero coordination overhead under staggered arrivals, but deadlocks immediately (0 meals) when all ${philosopherCount} philosophers become Hungry symmetrically.`,
      };
    }
    if (note.strategyKey === 'semaphore') {
      return {
        ...note,
        mechanism: `Limits concurrent fork contenders to N−1 = ${permits} room permits and queues the ${toOrdinal(philosopherCount)} philosopher in strict FIFO order.`,
      };
    }
    return note;
  });
}

export function ComparisonPanel({
  scenario,
  seed,
  initialTicks,
}: ComparisonPanelProps) {
  const [ticksToRun, setTicksToRun] = useState<number>(initialTicks ?? 60);

  const formattedRows = useMemo(() => {
    const rawRows = runStrategyBatchComparison({
      scenario,
      seed,
      ticks: ticksToRun,
      strategies: COMPARISON_SPECS,
    });
    return formatComparisonRows(rawRows);
  }, [scenario, seed, ticksToRun]);

  return (
    <div className="comparison-section-stack">
      <section
        className="panel comparison-panel"
        aria-label="Cross-Strategy Batch Comparison Table"
      >
        <div className="panel-header-row">
          <div>
            <h2 className="panel-title">
              Cross-Strategy Batch Comparison ({scenario.name}, Seed {seed})
            </h2>
          </div>

          <div className="comparison-controls">
            <label htmlFor="comparison-ticks-select" className="control-label-inline">
              Cycles:
            </label>
            <select
              id="comparison-ticks-select"
              aria-label="Comparison tick count"
              className="control-select control-select-sm"
              value={ticksToRun}
              onChange={(e) => setTicksToRun(Number(e.target.value))}
            >
              <option value={30}>30 cycles</option>
              <option value={60}>60 cycles</option>
              <option value={100}>100 cycles</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table
            className="status-table comparison-table"
            aria-label="Strategy comparison table"
          >
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Deadlock</th>
                <th>Starvation (Threshold)</th>
                <th>Suspected Livelock</th>
                <th>Avg Wait</th>
                <th>Max Wait</th>
                <th>Meals Completed</th>
                <th>CAS Retries / Rollbacks</th>
              </tr>
            </thead>
            <tbody>
              {formattedRows.map((row) => (
                <tr
                  key={row.strategyLabel}
                  data-comparison-strategy={row.strategyLabel}
                >
                  <td>
                    <strong>{row.strategyLabel}</strong>
                  </td>
                  <td>
                    <span
                      className={`outcome-text ${
                        row.raw.deadlocked ? 'outcome-danger' : 'outcome-ok'
                      }`}
                    >
                      {row.deadlock}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`outcome-text ${
                        row.raw.starvationDetected ? 'outcome-warning' : 'outcome-ok'
                      }`}
                    >
                      {row.starvation}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`outcome-text ${
                        row.raw.livelockSuspected ? 'outcome-warning' : 'outcome-ok'
                      }`}
                    >
                      {row.livelock}
                    </span>
                  </td>
                  <td className="mono-cell">{row.averageWait}</td>
                  <td className="mono-cell">{row.maxWait}</td>
                  <td className="mono-cell">
                    <strong>{row.mealsCompleted}</strong>
                  </td>
                  <td className="mono-cell muted-cell">{row.casRetries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
