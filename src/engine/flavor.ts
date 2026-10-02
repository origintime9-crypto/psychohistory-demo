import { type Event, type World } from './types';
export const PHASE_NAMES = ['稳定', '动荡', '叛乱', '独立'];
export function describeEvent(world: World, e: Event): string {
  const name = world.names[e.sector];
  if (e.to === 3) return `${name}切断了与川陀的联系，宣告独立。帝国的边界再次后退。`;
  if (e.to === 2) return `${name}的派系冲突演变为公开叛乱。地方总督已失去控制。`;
  if (e.to === 0) return `${name}恢复秩序。人口压力得到释放，街头重归平静。`;
  if (e.from === 2) return `${name}的叛乱被压制，但尚未恢复稳定。`;
  return `${name}出现动荡。一次局部事件，还不能决定银河的命运。`;
}
export function turnHeadline(turn: number, independent: number, n: number): string {
  if (turn === 1) return '谢顿的计算已经开始。帝国还相信自己永远不会衰落。';
  if (independent / n > 0.5) return '边陲已不再服从川陀。分散的知识网络成为最后的希望。';
  if (turn > 12) return '旧秩序正在退潮。你的选择，将决定黑暗时代有多长。';
  return [
    '帝国依旧庞大，却已经无法同时看清每一颗星。',
    '总督们在等待命令，基地在等待时间。',
    '一场地方危机结束了；另一条历史路径才刚刚展开。',
  ][turn % 3];
}
