import { mkdir, writeFile } from 'node:fs/promises';
import { CARDS, CARD_IDS } from '../engine/cards';
import { shortlistTargets } from '../engine/decisions';
import { prepareBaseline, previewAction } from '../engine/forecast';
import { DEFAULT_PARAMS, MODEL_VERSION } from '../engine/params';
import { modelFingerprint } from '../ui/saveGame';
import { cardContext, CARD_CONTEXTS } from './cardContexts';

const worlds = 30,
  samples = 128,
  reports = [];
const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
for (const context of CARD_CONTEXTS) {
  const rows = new Map(
    CARD_IDS.map((card) => [card, [] as ReturnType<typeof previewAction>['comparison'][]]),
  );
  for (let i = 0; i < worlds; i++) {
    const experiment = cardContext(`v2-card-study:${i}`, context);
    const { world, state, history, params } = experiment;
    const options = {
      M: samples,
      H: 1,
      terminal: true,
      seed: `${world.seed}:paired-card-study`,
      history,
      params,
    };
    const baseline = prepareBaseline(world, state, options);
    for (const card of CARD_IDS) {
      const action = CARDS[card].targeted
        ? shortlistTargets(world, state, card, params, 1)[0]
        : { card };
      rows.get(card)!.push(previewAction(world, state, action, options, baseline).comparison);
    }
  }
  for (const [card, results] of rows) {
    const q = results.map((r) => r.scoreDelta),
      average = mean(q);
    const se = Math.sqrt(q.reduce((s, x) => s + (x - average) ** 2, 0) / (worlds - 1) / worlds);
    const report = {
      context,
      card,
      worlds,
      samples,
      deltaQ: average,
      pairedWorld95Approx: [average - 1.96 * se, average + 1.96 * se],
      deltaS: mean(results.map((r) => r.stabilityDelta)),
      deltaTreasury: mean(results.map((r) => r.treasuryDelta)),
      perWorld: results,
    };
    reports.push(report);
    console.log(JSON.stringify({ ...report, perWorld: undefined }));
  }
}
await mkdir('reports', { recursive: true });
await writeFile(
  `reports/card-study-${MODEL_VERSION}.json`,
  JSON.stringify(
    {
      model: MODEL_VERSION,
      fingerprint: modelFingerprint(DEFAULT_PARAMS as typeof DEFAULT_PARAMS),
      params: DEFAULT_PARAMS,
      method:
        '30 independent worlds per predeclared context, 128 paired terminal paths each; one card at turn 4 then noop; card availability ignored to isolate card effect; shortlist target selected without future reality access',
      reports,
    },
    null,
    2,
  ),
);
