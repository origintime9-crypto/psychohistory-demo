import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { step } from '../engine/dynamics';
import { forecast, prepareBaseline, previewAction, revealForecast } from '../engine/forecast';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../engine/params';
import { stream } from '../engine/rng';
import { cloneState, counts } from '../engine/types';
import { generateWorld, initialState } from '../engine/worldgen';
const start = performance.now();
const independentParams = {
  ...DEFAULT_PARAMS,
  contagion: false,
  commonShock: false,
  fiscalFeedback: false,
  storyEvents: false,
};
let covered = 0,
  pitCovered = 0;
const experiments = 2000;
for (let experiment = 0; experiment < experiments; experiment++) {
  const seed = `calibration-validation-v1:${experiment}`,
    world = generateWorld(seed, { n: 30 });
  let s = initialState(world);
  const reality = stream(seed, 'reality'),
    calibration = stream(seed, 'calibration');
  // One observation per independent world. Avoid claiming correlated turns are independent samples.
  for (let turn = 0; turn < experiment % TOTAL_TURNS; turn++)
    s = step(world, s, { card: 'noop' }, reality).state;
  const f = forecast(world, s, { card: 'noop' }, { M: 512, H: 1, seed: `${seed}:prediction` });
  const result = step(world, s, { card: 'noop' }, reality).state;
  const r = revealForecast(f, counts(result).crisis, s.turn + 1, calibration);
  covered += Number(r.covered);
  pitCovered += Number(r.pitCovered);
}
const designExperiments = [];
for (let i = 0; i < 12; i++) {
  const world = generateWorld(`design-validation-v1:${i}`, { n: 50 });
  let s = initialState(world);
  const rng = stream(world.seed, 'reality');
  for (let t = 0; t < i % 6; t++) s = step(world, s, { card: 'noop' }, rng).state;
  const opts = { M: 4096, H: 5, seed: `${world.seed}:prediction` };
  designExperiments.push({
    seed: world.seed,
    turn: s.turn,
    coupled: forecast(world, s, { card: 'noop' }, opts).design,
    independent: forecast(world, s, { card: 'noop' }, { ...opts, params: independentParams })
      .design,
  });
}
const cascadeExperiments = [];
for (let i = 0; i < 24; i++) {
  const world = generateWorld(`cascade-validation-v1:${i}`, { n: 50 });
  const original = initialState(world),
    changed = cloneState(original);
  const trigger = 1 + (i % (world.n - 1));
  changed.phase[trigger] = 2;
  let response = 0;
  const M = 512;
  for (let sample = 0; sample < M; sample++) {
    const seed = `${world.seed}:sample:${sample}`,
      ra = stream(seed, 'paired'),
      rb = stream(seed, 'paired');
    let a = original,
      b = changed;
    for (let t = 0; t < 5; t++) {
      a = step(world, a, { card: 'noop' }, ra).state;
      b = step(world, b, { card: 'noop' }, rb).state;
    }
    for (let j = 0; j < world.n; j++)
      if (j !== trigger) response += (Number(b.phase[j] !== 0) - Number(a.phase[j] !== 0)) / M;
  }
  cascadeExperiments.push({
    seed: world.seed,
    trigger,
    fiveTurnExtraNonStableExcludingTrigger: response,
  });
}
const latency = [];
for (const n of [30, 50, 80]) {
  const world = generateWorld(`latency:${n}`, { n }),
    s = initialState(world);
  const times = [];
  for (let repeat = 0; repeat < 10; repeat++) {
    const options = { M: 256, H: 5, seed: `${world.seed}:preview:${repeat}` };
    const baseline = prepareBaseline(world, s, options);
    const t = performance.now();
    previewAction(world, s, { card: 'religion', target: 0 }, options, baseline);
    times.push(performance.now() - t);
  }
  const sorted = [...times].sort((a, b) => a - b);
  latency.push({
    n,
    M: 256,
    H: 5,
    meanMs: times.reduce((a, b) => a + b, 0) / times.length,
    p95Ms: sorted.at(-1),
    samplesMs: times,
  });
}
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
const pitCoverage = pitCovered / experiments,
  coupledMeanDeff = mean(designExperiments.map((e) => e.coupled.deff)),
  independentMeanDeff = mean(designExperiments.map((e) => e.independent.deff));
const report = {
  generatedAt: new Date().toISOString(),
  params: DEFAULT_PARAMS,
  calibration: {
    experiments,
    samplesPerForecast: 512,
    integer90Coverage: covered / experiments,
    randomizedPIT90Coverage: pitCoverage,
    PIT95BinomialApprox: [
      pitCoverage - 1.96 * Math.sqrt((pitCoverage * (1 - pitCoverage)) / experiments),
      pitCoverage + 1.96 * Math.sqrt((pitCoverage * (1 - pitCoverage)) / experiments),
    ],
  },
  design: { coupledMeanDeff, independentMeanDeff, experiments: designExperiments },
  cascade: {
    definition: 'paired five-turn extra non-stable sectors excluding initial trigger',
    mean: mean(cascadeExperiments.map((e) => e.fiveTurnExtraNonStableExcludingTrigger)),
    experiments: cascadeExperiments,
  },
  latency,
  elapsedSeconds: (performance.now() - start) / 1000,
};
await mkdir('reports', { recursive: true });
await writeFile('reports/model-validation.json', JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      calibration: report.calibration,
      deff: { coupled: coupledMeanDeff, independent: independentMeanDeff },
      cascade: report.cascade.mean,
      latency: latency.map((l) => ({ ...l, samplesMs: undefined })),
      elapsedSeconds: report.elapsedSeconds,
    },
    null,
    2,
  ),
);
if (pitCoverage < 0.88 || pitCoverage > 0.93 || Math.abs(independentMeanDeff - 1) > 0.08) {
  console.error('模型校准或独立对照超出验收范围');
  process.exitCode = 1;
}
