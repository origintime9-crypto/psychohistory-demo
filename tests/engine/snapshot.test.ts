import { describe, expect, it } from 'vitest';
import fixture from './fixtures/model-v3.json';
import { goldenSnapshot } from './snapshot-fixture';

describe('整局参数快照', () => {
  it('固定种子、参数哈希、行动、末三回合成绩及全状态摘要保持一致', () => {
    expect(goldenSnapshot()).toEqual(fixture);
  });
});
