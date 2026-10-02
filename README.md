# 心理史学 · 谢顿计划

合成银河回合制实验。纯前端运行，没有后端、账号或外部 AI API。

[在线体验](https://origintime9-crypto.github.io/psychohistory-demo/)

## 本地运行

```powershell
npm ci
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:5173`。设置种子与星区规模后开始：观察预测 → 选择手牌 → 若为局部行动，在星图指定目标 → 等待配对预览 → 执行并推进十年。共 18 回合。顶部“大数定律”可随时查看统计对照。结束后可查看、导出 JSON 报告。

```powershell
npm test
npm run build
npm run sim -- --policy=all --games=500
npm run validate:model
```

同一种子和同一行动序列可复现世界、手牌与现实路径。预测、现实与校准随机流分离。生产构建在 `dist`；`npm run preview` 可预览。图表在本地渲染，不需网络资源。

PITF 和结构人口理论仅提供定性启发；所有数值是游戏参数，不是实证系数。预测器知道生成模型，游戏展示的是合成系统中的聚合与相关性。

已完成 M0–M5 的功能、整局测试与修正后的主要平衡验收。整数覆盖率改用随机化 PIT 校准，每卡最优使用率作为诊断。导出的 JSON 包含种子、参数、18 个行动和历史；报告只保存在用户主动下载的文件中，刷新页面会重置当前游戏。

## 网站部署

GitHub Pages 使用 `.github/workflows/deploy.yml` 自动部署。向 `main` 推送后，工作流安装锁定版本的依赖、运行引擎测试、构建并发布 `dist`。构建从 Pages 读取子目录路径，星图、图表、图标与预测 Worker 均使用同一资源前缀。GitHub Desktop 可直接提交并推送本项目。

原始计划 PDF、本机截图、浏览器记录、验收数据、部署凭据与临时文件均保留在本机，不进入公开仓库。完整本地审阅和验收记录位于 `docs/` 与 `reports/`；批量模拟和模型验证会在本地产生 `reports/`。
