# PalForge

面向 [SDLPAL](https://github.com/sdlpal/sdlpal) 的开放式游戏编辑器。目标不是只修改几个数值，而是把原版资源、剧情脚本、新美术、新玩法模块和快速测试放进同一个可扩展工作台。

> 当前版本是 **0.1 编辑器原型**。它已经可以运行和交互，但不会覆写你的原版 PAL 文件。请保留合法取得的游戏数据，并始终使用副本。

## 现在能做什么

- 选择一个本地游戏目录，识别其中的文件并读取 MKF 分块索引；
- 在等距地图原型上选择、检查和绘制地形；
- 查看事件对象以及可读的脚本指令流；
- 将 PNG、WebP、音频和数据文件加入独立的 `forge://` 扩展命名空间；
- 管理编辑器、运行时桥接和小游戏三类模块；
- 从指定场景、坐标、等级、剧情标记或事件创建即时测试快照；
- 将编辑器工程保存到浏览器，或导出为 `.palforge.json`。

## 启动

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

质量检查：

```bash
npm test
npm run build
```

## 设计边界

PalForge 将游戏原始数据视为只读输入，并把创作内容保存为独立工程：

```text
PAL 游戏目录 → 格式适配器 → PalForge 领域模型 → 编辑器
                                              ↘ 工程包
                                               ↘ Runner Bridge → SDLPAL 测试进程
```

这种结构让额外美术和新模块不必占用、覆盖原版资源编号，也让测试器以后能直接构造运行快照，不必每次从游戏开头打到目标流程。

当前已实现 MKF 偏移表解析。YJ_1 解压、RLE 图像、调色板、地图双向转换、完整 opcode 语义和 SDLPAL 进程桥接仍在后续阶段。详细拆分见 [架构说明](docs/ARCHITECTURE.md)。

## 路线图

- **0.1 · Forge Desk（当前）**：编辑器外壳、项目模型、MKF 索引、地图/脚本/资源/模块/测试工作流。
- **0.2 · Resource Lens**：YJ_1、RLE、调色板与图片预览，MKF chunk 导入导出。
- **0.3 · Scene Builder**：真实 PAL 地图、事件对象、碰撞和脚本引用的双向编辑。
- **0.4 · Script Graph**：覆盖 `PAL_InterpretInstruction` 的 opcode 注册表、跳转校验和剧情变量检查。
- **0.5 · Runner Bridge**：以临时副本启动 SDLPAL，直接跳转到场景、战斗或事件。
- **1.0 · Forge Project**：稳定工程格式、模块 SDK、可复现构建和跨平台桌面包。

## 项目目录

```text
src/
  components/       交互式编辑器组件
  core/             与界面无关的格式、测试与工程逻辑
  data/             原型数据；以后由格式适配器替换
docs/
  ARCHITECTURE.md    数据层、扩展层与测试桥接设计
```

## 法律与资源

PalForge 不包含《仙剑奇侠传》的游戏数据、美术、音乐或其他受版权保护的内容。仓库中的场景和台词只用于界面原型说明，正式发行前会替换为完全原创的测试素材。

## License

代码以 [MIT License](LICENSE) 发布。

