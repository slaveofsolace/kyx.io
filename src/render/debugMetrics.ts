import type { Scene, WebGLRenderer } from 'three';

export interface FrameTimeSummary {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export interface LongTaskSample {
  readonly startTimeMs: number;
  readonly durationMs: number;
}

export interface LongTaskWindowSummary {
  readonly windowMs: number;
  readonly count: number;
  readonly totalDurationMs: number;
  readonly p95DurationMs: number;
  readonly maxDurationMs: number;
}

export interface RendererDebugSnapshot {
  readonly schemaVersion: 1;
  readonly state: string;
  readonly render: {
    readonly calls: number;
    readonly triangles: number;
    readonly points: number;
    readonly lines: number;
  } | null;
  readonly renderRange: {
    readonly count: number;
    readonly maxCalls: number;
    readonly maxTriangles: number;
  } | null;
  readonly memory: {
    readonly geometries: number;
    readonly textures: number;
  };
  readonly programs: number | null;
  readonly sceneObjects: number;
  readonly pixelRatio: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly frameTimes: FrameTimeSummary | null;
  readonly longTasks: {
    readonly supported: boolean;
    readonly totalCount: number;
    readonly totalDurationMs: number;
    readonly maxDurationMs: number;
    readonly recent: LongTaskWindowSummary;
  };
  readonly heap: {
    readonly usedBytes: number;
    readonly totalBytes: number;
    readonly limitBytes: number;
  } | null;
}

export interface RendererDebugTarget {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly getState: () => string;
}

type RenderCounters = NonNullable<RendererDebugSnapshot['render']>;

const MAX_SAMPLES = 600;
const PUBLICATION_WINDOW = 180;
const PUBLICATION_INTERVAL_MS = 1_000;
const LONG_TASK_WINDOW_MS = 60_000;
const MAX_LONG_TASK_SAMPLES = 2_048;

export function percentile(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) {
    throw new RangeError('percentile requires at least one value');
  }
  if (!Number.isFinite(quantile) || quantile < 0 || quantile > 1) {
    throw new RangeError('quantile must be between 0 and 1');
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
  );
  return sortedValues[index] as number;
}

export function summarizeFrameTimes(samples: readonly number[]): FrameTimeSummary | null {
  const finiteSamples = samples.filter((sample) => Number.isFinite(sample) && sample >= 0);
  if (finiteSamples.length === 0) return null;
  const sorted = [...finiteSamples].sort((left, right) => left - right);
  return Object.freeze({
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1] as number,
  });
}

export function summarizeLongTasks(
  samples: readonly LongTaskSample[],
  nowMs: number,
  windowMs = LONG_TASK_WINDOW_MS,
): LongTaskWindowSummary {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError('nowMs must be a finite non-negative number');
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError('windowMs must be a finite positive number');
  }

  const cutoffMs = nowMs - windowMs;
  const durations = samples
    .filter((sample) => (
      Number.isFinite(sample.startTimeMs)
      && sample.startTimeMs >= cutoffMs
      && sample.startTimeMs <= nowMs
      && Number.isFinite(sample.durationMs)
      && sample.durationMs >= 0
    ))
    .map((sample) => sample.durationMs);
  const summary = summarizeFrameTimes(durations);

  return Object.freeze({
    windowMs,
    count: summary?.count ?? 0,
    totalDurationMs: durations.reduce((total, duration) => total + duration, 0),
    p95DurationMs: summary?.p95Ms ?? 0,
    maxDurationMs: summary?.maxMs ?? 0,
  });
}

type PerformanceWithMemory = Performance & {
  readonly memory?: {
    readonly usedJSHeapSize?: number;
    readonly totalJSHeapSize?: number;
    readonly jsHeapSizeLimit?: number;
  };
};

function readHeapSnapshot(): RendererDebugSnapshot['heap'] {
  const memory = (performance as PerformanceWithMemory).memory;
  if (
    memory === undefined
    || !Number.isFinite(memory.usedJSHeapSize)
    || !Number.isFinite(memory.totalJSHeapSize)
    || !Number.isFinite(memory.jsHeapSizeLimit)
  ) {
    return null;
  }
  return Object.freeze({
    usedBytes: memory.usedJSHeapSize as number,
    totalBytes: memory.totalJSHeapSize as number,
    limitBytes: memory.jsHeapSizeLimit as number,
  });
}

export function startRendererDebugMetrics(target: RendererDebugTarget): () => void {
  const { canvas, renderer, scene, getState } = target;
  const frameTimes: number[] = [];
  const renderSamples: RenderCounters[] = [];
  const longTaskSamples: LongTaskSample[] = [];
  const previousAutoReset = renderer.info.autoReset;
  const metricsStartedAtMs = performance.now();
  let longTaskTotalCount = 0;
  let longTaskTotalDurationMs = 0;
  let longTaskMaxDurationMs = 0;
  let longTaskObserver: PerformanceObserver | null = null;
  let previousFrame: number | undefined;
  let animationFrameId = 0;
  let disposed = false;

  const supportsLongTasks = typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes?.includes('longtask') === true;
  if (supportsLongTasks) {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime < metricsStartedAtMs || !Number.isFinite(entry.duration)) continue;
        const sample = Object.freeze({
          startTimeMs: entry.startTime,
          durationMs: entry.duration,
        });
        longTaskSamples.push(sample);
        if (longTaskSamples.length > MAX_LONG_TASK_SAMPLES) longTaskSamples.shift();
        longTaskTotalCount += 1;
        longTaskTotalDurationMs += entry.duration;
        longTaskMaxDurationMs = Math.max(longTaskMaxDurationMs, entry.duration);
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  }

  // EffectComposer invokes render more than once. One explicit reset after the
  // probe samples a frame preserves the complete renderer.info counters.
  renderer.info.autoReset = false;
  renderer.info.reset();

  const sampleFrame = (now: number): void => {
    if (disposed) return;
    if (previousFrame !== undefined) {
      frameTimes.push(now - previousFrame);
      if (frameTimes.length > MAX_SAMPLES) frameTimes.shift();
    }
    previousFrame = now;

    renderSamples.push({ ...renderer.info.render });
    if (renderSamples.length > MAX_SAMPLES) renderSamples.shift();
    renderer.info.reset();
    animationFrameId = window.requestAnimationFrame(sampleFrame);
  };

  const publish = (): void => {
    const nowMs = performance.now();
    const longTaskCutoffMs = nowMs - LONG_TASK_WINDOW_MS;
    while (
      longTaskSamples.length > 0
      && (longTaskSamples[0]?.startTimeMs ?? nowMs) < longTaskCutoffMs
    ) {
      longTaskSamples.shift();
    }
    let sceneObjects = 0;
    scene.traverse(() => { sceneObjects += 1; });

    const recentFrameTimes = frameTimes.slice(-PUBLICATION_WINDOW);
    const recentRenderSamples = renderSamples.slice(-PUBLICATION_WINDOW);
    const render = recentRenderSamples[recentRenderSamples.length - 1] ?? null;
    const snapshot: RendererDebugSnapshot = {
      schemaVersion: 1,
      state: getState(),
      render,
      renderRange: recentRenderSamples.length > 0 ? {
        count: recentRenderSamples.length,
        maxCalls: Math.max(...recentRenderSamples.map((sample) => sample.calls)),
        maxTriangles: Math.max(...recentRenderSamples.map((sample) => sample.triangles)),
      } : null,
      memory: { ...renderer.info.memory },
      programs: renderer.info.programs?.length ?? null,
      sceneObjects,
      pixelRatio: renderer.getPixelRatio(),
      canvas: {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
      },
      frameTimes: summarizeFrameTimes(recentFrameTimes),
      longTasks: {
        supported: supportsLongTasks,
        totalCount: longTaskTotalCount,
        totalDurationMs: longTaskTotalDurationMs,
        maxDurationMs: longTaskMaxDurationMs,
        recent: summarizeLongTasks(longTaskSamples, nowMs, LONG_TASK_WINDOW_MS),
      },
      heap: readHeapSnapshot(),
    };
    canvas.dataset.kyxDevMetrics = JSON.stringify(snapshot);
  };

  animationFrameId = window.requestAnimationFrame(sampleFrame);
  const publicationTimer = window.setInterval(publish, PUBLICATION_INTERVAL_MS);

  return (): void => {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(animationFrameId);
    window.clearInterval(publicationTimer);
    longTaskObserver?.disconnect();
    renderer.info.autoReset = previousAutoReset;
    delete canvas.dataset.kyxDevMetrics;
  };
}
