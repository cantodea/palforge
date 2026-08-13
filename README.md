# PalForge

面向 [SDLPAL](https://github.com/sdlpal/sdlpal) 的开放式游戏编辑器。目标不是只修改几个数值，而是把原版资源、剧情脚本、新美术、新玩法模块和快速测试放进同一个可扩展工作台。

> 当前版本是 **0.2 Resource Lens**。它会读取你选择的真实 PAL 目录，但不会覆写原版文件。请保留合法取得的游戏数据，并始终使用副本。

## 现在能做什么

- 选择本地游戏目录，读取真实 MKF 偏移表并逐个浏览 chunk；
- 自动识别 DOS 版 `YJ_1` 与 Win95 版 `YJ_2` 压缩数据；
- 按 PAL sprite 帧偏移表解码 `MGO.MKF` 等资源中的 RLE 图像；
- 使用 `PAT.MKF` 的日间/夜间 VGA 调色板显示 sprite、RLE 与 320×200 FBP 图像；
- 将原始 chunk、解压结果或当前图像导出为文件；
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

## 查看真实资源

1. 启动后点击右上角 **打开游戏目录**，选择包含 `MGO.MKF`、`PAT.MKF` 等文件的目录。
2. 点击左侧 **资源**。页面左栏显示实际读到的 MKF 文件，中栏显示该文件的真实 chunk 编号、偏移和大小。
3. 选择 chunk 后，右侧会显示识别结果。sprite 可以切换帧，PAT 可以切换日间/夜间调色板。
4. 通常保留 **自动识别**。若数据版本已知，也可强制选择 **DOS / YJ_1** 或 **Win95 / YJ_2**。

浏览器的目录授权不会跨刷新永久保存；刷新页面后需要重新选择目录。

## 设计边界

PalForge 将游戏原始数据视为只读输入，并把创作内容保存为独立工程：

```text
PAL 游戏目录 → 格式适配器 → PalForge 领域模型 → 编辑器
                                              ↘ 工程包
                                               ↘ Runner Bridge → SDLPAL 测试进程
```

这种结构让额外美术和新模块不必占用、覆盖原版资源编号，也让测试器以后能直接构造运行快照，不必每次从游戏开头打到目标流程。

当前只读资源链路已经打通；真实地图双向转换、完整 opcode 语义、资源写回和 SDLPAL 进程桥接仍在后续阶段。格式细节见 [资源格式说明](docs/RESOURCE_FORMATS.md)，模块拆分见 [架构说明](docs/ARCHITECTURE.md)。

## 路线图

- **0.1 · Forge Desk（完成）**：编辑器外壳、项目模型、MKF 索引、地图/脚本/资源/模块/测试工作流。
- **0.2 · Resource Lens（当前）**：YJ_1/YJ_2、sprite/RLE、PAT 调色板、FBP 预览与 chunk 导出。
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
  RESOURCE_FORMATS.md 当前只读资源链路与格式边界
```

## 法律与资源

PalForge 不包含《仙剑奇侠传》的游戏数据、美术、音乐或其他受版权保护的内容。仓库中的场景和台词只用于界面原型说明，正式发行前会替换为完全原创的测试素材。

## License

代码以 [GNU GPL v3 或更新版本](LICENSE) 发布。仓库不包含游戏数据；用户需要自行提供合法取得的 PAL 数据文件。
