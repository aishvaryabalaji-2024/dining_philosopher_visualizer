import { StrategyComparisonRow } from './batchRunner';

export interface FormattedComparisonRow {
  readonly strategy: string;
  readonly strategyLabel: string;
  readonly deadlock: string;
  readonly starvation: string;
  readonly livelock: string;
  readonly averageWait: string;
  readonly maxWait: string;
  readonly mealsCompleted: string;
  readonly minMaxMeals: string;
  readonly fairness: string;
  readonly casRetries: string;
  readonly raw: StrategyComparisonRow;
}

/**
 * Formats a StrategyComparisonRow from the headless batch runner into human-readable display fields
 * for the UI comparison table and test summaries.
 */
export function formatComparisonRow(row: StrategyComparisonRow): FormattedComparisonRow {
  const deadlock = row.deadlocked
    ? row.deadlockTick !== null
      ? `Yes (Cycle ${row.deadlockTick})`
      : 'Yes'
    : 'No';

  const starvation = row.starvationDetected
    ? `starvation detected by threshold (${row.starvedPhilosopherIds.map((id) => `P${id}`).join(', ')})`
    : 'No';

  const livelock = row.livelockSuspected
    ? row.livelockTick !== null
      ? `Suspected (Cycle ${row.livelockTick})`
      : 'Suspected'
    : 'No';

  const averageWait = `${row.averageWaitTicks.toFixed(2)} cycles`;
  const maxWait = `${row.maxWaitTicks} cycles`;
  const mealsCompleted = `${row.totalMealsCompleted}`;
  const minMaxMeals = `${row.minMealsPerPhilosopher} / ${row.maxMealsPerPhilosopher}`;
  const fairness = row.fairnessScore.toFixed(2);

  const casRetries =
    row.casAttempts !== null && row.casRollbacks !== null
      ? `${row.casAttempts} attempts / ${row.casRollbacks} rollbacks`
      : '—';

  return Object.freeze({
    strategy: row.strategy,
    strategyLabel: row.strategyLabel,
    deadlock,
    starvation,
    livelock,
    averageWait,
    maxWait,
    mealsCompleted,
    minMaxMeals,
    fairness,
    casRetries,
    raw: row,
  });
}

export function formatComparisonRows(
  rows: readonly StrategyComparisonRow[]
): readonly FormattedComparisonRow[] {
  return Object.freeze(rows.map((row) => formatComparisonRow(row)));
}
