import type { CardId } from '../engine/types';
export const cardArt = (id: CardId) => `${import.meta.env.BASE_URL}cards/${id}.webp`;
export const CARD_CATEGORY: Record<CardId, string> = {
  academy: '知识',
  religion: '信念',
  elites: '政治',
  tax: '政治',
  reform: '政治',
  foundation: '知识',
  relief: '物流',
  convoy: '物流',
  trade: '贸易',
  diplomacy: '政治',
  intelligence: '情报',
  evacuation: '知识',
  noop: '等待',
};
