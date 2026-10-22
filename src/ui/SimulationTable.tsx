import {
  ForkSnapshot,
  PhilosopherSnapshot,
  PhilosopherState,
  SimulationSnapshot,
} from '../engine/types';

export interface SimulationTableProps {
  readonly snapshot: SimulationSnapshot;
  readonly renderMetricsInline?: boolean;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const CENTER_X = 310;
const CENTER_Y = 300;
const ARENA_RING_RADIUS = 205;
const CENTER_HUB_RADIUS = 88;
const FORK_REST_RADIUS = 132;
const FORK_HELD_RADIUS = 166;

export const STATE_COLORS: Readonly<
  Record<
    PhilosopherState,
    {
      readonly fill: string;
      readonly stroke: string;
      readonly badgeBg: string;
      readonly text: string;
    }
  >
> = {
  Thinking: {
    fill: '#ffffff',
    stroke: '#71717a',
    badgeBg: '#f4f4f5',
    text: '#52525b',
  },
  Hungry: {
    fill: '#ffffff',
    stroke: '#d97706',
    badgeBg: '#fef3c7',
    text: '#92400e',
  },
  Waiting: {
    fill: '#ffffff',
    stroke: '#dc2626',
    badgeBg: '#fee2e2',
    text: '#991b1b',
  },
  Eating: {
    fill: '#ffffff',
    stroke: '#16a34a',
    badgeBg: '#dcfce7',
    text: '#166534',
  },
};

function polarToCartesian(cx: number, cy: number, radius: number, angleRad: number): Point {
  return {
    x: Number((cx + radius * Math.cos(angleRad)).toFixed(2)),
    y: Number((cy + radius * Math.sin(angleRad)).toFixed(2)),
  };
}

/**
 * Angle for philosopher i (P0 at top 12 o'clock, proceeding clockwise).
 */
function getPhilosopherAngle(id: number, count: number): number {
  return -Math.PI / 2 + (2 * Math.PI * id) / count;
}

/**
 * Fork i is shared by philosopher i (leftForkId = i) and philosopher (i - 1 + N) % N (rightForkId = i).
 * Placing fork i at angle(P_i) - pi/N puts Fork i halfway between P_{(i-1+N)%N} and P_i.
 */
function getForkRestAngle(forkId: number, count: number): number {
  return getPhilosopherAngle(forkId, count) - Math.PI / count;
}

function getForkPosition(fork: ForkSnapshot, count: number): {
  readonly x: number;
  readonly y: number;
  readonly rotationDeg: number;
} {
  const restAngle = getForkRestAngle(fork.id, count);
  if (fork.ownerId === null) {
    const pt = polarToCartesian(CENTER_X, CENTER_Y, FORK_REST_RADIUS, restAngle);
    const rotationDeg = Number(((restAngle * 180) / Math.PI + 90).toFixed(1));
    return { x: pt.x, y: pt.y, rotationDeg };
  }

  const ownerAngle = getPhilosopherAngle(fork.ownerId, count);
  const angularOffset = fork.id === fork.ownerId ? -0.18 : 0.18;
  const targetAngle = ownerAngle + angularOffset;
  const pt = polarToCartesian(CENTER_X, CENTER_Y, FORK_HELD_RADIUS, targetAngle);
  const rotationDeg = Number(((targetAngle * 180) / Math.PI + 90).toFixed(1));
  return { x: pt.x, y: pt.y, rotationDeg };
}

function formatPhilosopherTimer(phil: PhilosopherSnapshot): string {
  if (phil.state === 'Thinking') {
    return `Think ${phil.remainingStateTicks}t`;
  }
  if (phil.state === 'Eating') {
    return `Eat ${phil.remainingStateTicks}t`;
  }
  return `Wait ${phil.currentWaitTicks}t`;
}

export function SimulationTable({
  snapshot,
  renderMetricsInline = true,
}: SimulationTableProps) {
  const count = snapshot.philosophers.length;
  const starvedSet = new Set(snapshot.detectors.starvedPhilosopherIds);
  const isDeadlocked = snapshot.detectors.deadlocked;

  const arenaSection = (
    <section
      className={`panel svg-table-panel ${isDeadlocked ? 'arena-deadlocked' : ''}`}
      aria-label="Dining Table Visualization"
    >
      <div className="panel-header-row">
        <div className="arena-header-left">
          <h2 className="panel-title">Simulation Arena (N = {count})</h2>
          {isDeadlocked && (
            <span className="arena-deadlock-badge" role="status">
              Deadlock detected
            </span>
          )}
        </div>
        <div className="state-legend" aria-label="Philosopher state color legend">
          {(['Thinking', 'Hungry', 'Waiting', 'Eating'] as const).map((st) => (
            <span key={st} className="legend-item">
              <span
                className="legend-dot"
                style={{
                  backgroundColor: STATE_COLORS[st].stroke,
                }}
              />
              {st}
            </span>
          ))}
          <span className="legend-item">
            <span
              className="legend-dot"
              style={{
                backgroundColor: '#8b5cf6',
              }}
            />
            Held Fork
          </span>
        </div>
      </div>

      <div className="svg-container">
        <svg
          viewBox="0 0 620 600"
          className="dining-table-svg"
          role="img"
          aria-label={`Dining Philosophers table at Cycle ${snapshot.tick}`}
        >
          <defs>
            <marker
              id="deadlockArrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
          </defs>

          {/* Single Thin Circular Arena Ring */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={ARENA_RING_RADIUS}
            fill="#fafafa"
            stroke={isDeadlocked ? 'rgba(239, 68, 68, 0.45)' : '#e4e4e7'}
            strokeWidth="1.25"
          />

          {/* Subtle Inner Hub for Central Readout */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={CENTER_HUB_RADIUS}
            fill="#ffffff"
            stroke={isDeadlocked ? '#ef4444' : '#e4e4e7'}
            strokeWidth="1"
          />

          {/* Small Central Readout: Current Cycle and Selected Strategy */}
          <g className="table-center-info" textAnchor="middle">
            <text x={CENTER_X} y={CENTER_Y - 18} className="svg-center-label">
              {snapshot.config.strategy.toUpperCase()}
            </text>
            <text x={CENTER_X} y={CENTER_Y + 8} className="svg-center-tick">
              CYCLE {snapshot.tick}
            </text>
            {isDeadlocked ? (
              <text x={CENTER_X} y={CENTER_Y + 30} className="svg-center-alert">
                Deadlock detected
              </text>
            ) : snapshot.detectors.livelockDetected ? (
              <text x={CENTER_X} y={CENTER_Y + 30} className="svg-center-warning">
                Suspected livelock
              </text>
            ) : (
              <text x={CENTER_X} y={CENTER_Y + 30} className="svg-center-meals">
                {snapshot.totalMealsCompleted} meals
              </text>
            )}
          </g>

          {/* Subtle Violet Fork Ownership Tether Lines */}
          {snapshot.forks.map((fork) => {
            if (fork.ownerId === null) {
              return null;
            }
            const ownerAngle = getPhilosopherAngle(fork.ownerId, count);
            const ownerPt = polarToCartesian(
              CENTER_X,
              CENTER_Y,
              ARENA_RING_RADIUS,
              ownerAngle
            );
            const forkPos = getForkPosition(fork, count);

            return (
              <line
                key={`tether-${fork.id}`}
                x1={ownerPt.x}
                y1={ownerPt.y}
                x2={forkPos.x}
                y2={forkPos.y}
                stroke="#8b5cf6"
                strokeOpacity="0.55"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                className="fork-tether-line"
              />
            );
          })}

          {/* Restrained Circular Dependency Edges on Deadlock */}
          {isDeadlocked &&
            snapshot.philosophers.map((phil) => {
              const nextId = (phil.id + 1) % count;
              const a1 = getPhilosopherAngle(phil.id, count) + 0.25;
              const a2 = getPhilosopherAngle(nextId, count) - 0.25;
              const p1 = polarToCartesian(CENTER_X, CENTER_Y, ARENA_RING_RADIUS, a1);
              const p2 = polarToCartesian(CENTER_X, CENTER_Y, ARENA_RING_RADIUS, a2);
              return (
                <line
                  key={`deadlock-edge-${phil.id}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#ef4444"
                  strokeOpacity="0.65"
                  strokeWidth="1.5"
                  markerEnd="url(#deadlockArrow)"
                />
              );
            })}

          {/* Five Forks (Blade-like Indicators: Neutral when free, Violet #8b5cf6 when held) */}
          {snapshot.forks.map((fork) => {
            const pos = getForkPosition(fork, count);
            const isHeld = fork.ownerId !== null;
            const strokeColor = isHeld ? '#8b5cf6' : '#a1a1aa';

            return (
              <g
                key={fork.id}
                className={`svg-fork-group ${isHeld ? 'fork-held' : 'fork-free'}`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px) scale(${isHeld ? 1.24 : 1})`,
                }}
                data-fork-id={fork.id}
                data-owner-id={fork.ownerId ?? 'free'}
              >
                <g transform={`rotate(${pos.rotationDeg})`}>
                  {/* Enlarged Blade / Fork Indicator */}
                  <rect
                    x={-8}
                    y={-18}
                    width={16}
                    height={36}
                    rx={8}
                    fill="#ffffff"
                    stroke={strokeColor}
                    strokeWidth={isHeld ? '2.2' : '1.4'}
                  />
                  {/* Fork Handle */}
                  <line
                    x1={0}
                    y1={-3}
                    x2={0}
                    y2={12}
                    stroke={isHeld ? '#8b5cf6' : '#71717a'}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  {/* Fork Shoulder Bridge */}
                  <line
                    x1={-4.2}
                    y1={-3}
                    x2={4.2}
                    y2={-3}
                    stroke={isHeld ? '#8b5cf6' : '#71717a'}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  {/* Left, Center, and Right Tines */}
                  <line
                    x1={-4.2}
                    y1={-12}
                    x2={-4.2}
                    y2={-3}
                    stroke={isHeld ? '#8b5cf6' : '#71717a'}
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <line
                    x1={0}
                    y1={-13}
                    x2={0}
                    y2={-3}
                    stroke={isHeld ? '#8b5cf6' : '#71717a'}
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                  <line
                    x1={4.2}
                    y1={-12}
                    x2={4.2}
                    y2={-3}
                    stroke={isHeld ? '#8b5cf6' : '#71717a'}
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </g>
                <text
                  x={0}
                  y={31}
                  textAnchor="middle"
                  className="svg-fork-label"
                  fill={isHeld ? '#6d28d9' : '#52525b'}
                >
                  F{fork.id} {isHeld ? `· P${fork.ownerId}` : ''}
                </text>
              </g>
            );
          })}

          {/* Five Philosophers */}
          {snapshot.philosophers.map((phil) => {
            const angle = getPhilosopherAngle(phil.id, count);
            const pt = polarToCartesian(CENTER_X, CENTER_Y, ARENA_RING_RADIUS, angle);
            const palette = STATE_COLORS[phil.state];
            const isStarved = starvedSet.has(phil.id);
            const heldLabel =
              phil.heldForkIds.length > 0
                ? phil.heldForkIds.map((id) => `F${id}`).join(', ')
                : '—';

            const philScale =
              phil.state === 'Eating' || phil.heldForkIds.length >= 2
                ? 1.16
                : phil.heldForkIds.length === 1
                  ? 1.09
                  : 1;

            return (
              <g
                key={phil.id}
                className={`svg-philosopher-group state-${phil.state.toLowerCase()}`}
                style={{
                  transform: `translate(${pt.x}px, ${pt.y}px) scale(${philScale})`,
                }}
                data-philosopher-id={phil.id}
                data-state={phil.state}
              >
                {/* Subtle Pulse Ring for Eating or Starved Philosopher */}
                {phil.state === 'Eating' && (
                  <circle
                    cx={0}
                    cy={0}
                    r={50}
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="1.5"
                    className="eating-pulse-ring"
                  />
                )}
                {isStarved && (
                  <circle
                    cx={0}
                    cy={0}
                    r={51}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                )}

                {/* Philosopher Node Circle */}
                <circle
                  cx={0}
                  cy={0}
                  r={43}
                  fill={palette.fill}
                  stroke={isDeadlocked ? '#ef4444' : palette.stroke}
                  strokeWidth="2"
                  className="philosopher-circle"
                />

                {/* Philosopher ID */}
                <text
                  x={0}
                  y={-15}
                  textAnchor="middle"
                  className="svg-phil-title"
                  fill="#18181b"
                >
                  P{phil.id}
                </text>

                {/* Philosopher Current State */}
                <text
                  x={0}
                  y={1}
                  textAnchor="middle"
                  className="svg-phil-state"
                  fill={palette.stroke}
                >
                  {phil.state}
                </text>

                {/* Timer / Wait Readout */}
                <text
                  x={0}
                  y={15}
                  textAnchor="middle"
                  className="svg-phil-meta"
                  fill="#52525b"
                >
                  {formatPhilosopherTimer(phil)}
                </text>

                {/* Held Forks & Meals */}
                <text
                  x={0}
                  y={28}
                  textAnchor="middle"
                  className="svg-phil-forks"
                  fill={phil.heldForkIds.length > 0 ? '#6d28d9' : '#71717a'}
                >
                  Forks: {heldLabel}
                </text>

                {/* Meals Completed Tag */}
                <text
                  x={0}
                  y={56}
                  textAnchor="middle"
                  className="svg-phil-meals-badge"
                  fill="#71717a"
                >
                  Meals: {phil.mealsCompleted}
                </text>

                {/* Threshold Starvation Indicator */}
                {isStarved && (
                  <g transform="translate(0, -56)">
                    <rect
                      x={-54}
                      y={-10}
                      width={108}
                      height={18}
                      rx={4}
                      fill="#fef2f2"
                      stroke="#ef4444"
                      strokeWidth="1"
                    />
                    <text
                      x={0}
                      y={2}
                      textAnchor="middle"
                      className="svg-starved-badge"
                      fill="#991b1b"
                    >
                      STARVED (≥{snapshot.config.starvationThresholdTicks}t)
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );

  if (!renderMetricsInline) {
    return arenaSection;
  }

  return (
    <div className="simulation-visual-layout">
      {arenaSection}
      <PhilosopherMetricsTable snapshot={snapshot} />
    </div>
  );
}

export function PhilosopherMetricsTable({
  snapshot,
}: {
  readonly snapshot: SimulationSnapshot;
}) {
  const starvedSet = new Set(snapshot.detectors.starvedPhilosopherIds);
  const maxLongestWait = Math.max(
    1,
    ...snapshot.philosophers.map((p) => p.longestWaitTicks)
  );
  const highestWaitValue = Math.max(
    0,
    ...snapshot.philosophers.map((p) => p.longestWaitTicks)
  );

  return (
    <section
      className="panel philosopher-table-panel"
      aria-label="Per-Philosopher Status and Metrics"
    >
      <div className="panel-header-row">
        <h2 className="panel-title">Per-Philosopher Metrics</h2>
        <span className="mono-meta">
          Starvation threshold ≥{snapshot.config.starvationThresholdTicks}t
        </span>
      </div>

      <div className="table-responsive">
        <table className="status-table" aria-label="Philosopher status table">
          <thead>
            <tr>
              <th>Phil</th>
              <th>State</th>
              <th>L / R Forks</th>
              <th>Held Forks</th>
              <th>Curr Wait</th>
              <th>Max Wait</th>
              <th>Total Wait</th>
              <th>Meals</th>
              <th>Avg Wait</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.philosophers.map((phil) => {
              const isStarved = starvedSet.has(phil.id);
              const isHighestMaxWait =
                highestWaitValue > 0 && phil.longestWaitTicks === highestWaitValue;
              const waitRatio = Math.min(
                100,
                Math.round((phil.longestWaitTicks / maxLongestWait) * 100)
              );

              return (
                <tr
                  key={phil.id}
                  className={isStarved ? 'row-starved' : undefined}
                  data-row-philosopher={phil.id}
                >
                  <td className="mono-cell">
                    <strong>P{phil.id}</strong>
                  </td>
                  <td>
                    <span className="state-plain-cell">
                      <span
                        className={`status-dot status-dot-${phil.state.toLowerCase()}`}
                      />
                      <span className="state-plain-text">{phil.state}</span>
                    </span>
                    {isStarved && (
                      <span
                        className="threshold-flag-pill"
                        title="starvation detected by threshold"
                      >
                        starvation detected by threshold
                      </span>
                    )}
                  </td>
                  <td className="mono-cell muted-cell">
                    F{phil.leftForkId} / F{phil.rightForkId}
                  </td>
                  <td
                    className={`mono-cell ${
                      phil.heldForkIds.length > 0 ? 'violet-cell' : 'muted-cell'
                    }`}
                  >
                    {phil.heldForkIds.length > 0
                      ? phil.heldForkIds.map((f) => `F${f}`).join(', ')
                      : '—'}
                  </td>
                  <td className="mono-cell">{phil.currentWaitTicks}t</td>
                  <td className="mono-cell">
                    <div className="wait-bar-cell">
                      <span>{phil.longestWaitTicks}t</span>
                      <div className="wait-bar-track" aria-hidden="true">
                        <div
                          className={`wait-bar-fill ${
                            isHighestMaxWait ? 'wait-bar-max' : ''
                          }`}
                          style={{ width: `${waitRatio}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="mono-cell">{phil.totalWaitTicks}t</td>
                  <td className="mono-cell">
                    <strong>{phil.mealsCompleted}</strong>
                  </td>
                  <td className="mono-cell muted-cell">
                    {phil.averageWaitPerMeal.toFixed(2)}t
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
