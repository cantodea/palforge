# PalForge 架构

## 1. 核心原则

1. **原版数据只读**：永远不在用户唯一一份游戏目录上原地修改。
2. **创作内容独立**：地图差异、脚本、资源和模块保存在 PalForge 工程中。
3. **格式与界面分离**：MKF、YJ_1、RLE、调色板和脚本 opcode 都属于 core adapter，不进入 React 组件。
4. **测试是一级功能**：每种可编辑对象都应提供 `testTarget`，允许 Runner Bridge 直接构造测试快照。
5. **扩展优先于硬编码**：新玩法通过 manifest 和稳定 API 注册，不持续向编辑器主程序增加特殊分支。

## 2. 分层

| 层 | 职责 | 当前状态 |
|---|---|---|
| Format adapters | 读取 MKF、YJ_1/YJ_2、sprite/RLE、PAT、FBP、SSS 场景/事件/脚本与 MAP/GOP | 真实场景和脚本只读链路已实现 |
| Domain model | 场景、单元、事件、脚本、动画、资源引用、项目差异 | PAL 场景、工程脚本、工程动画、资源语义索引与场景调试快照已实现 |
| Editor features | 地图、脚本、资源、动画、模块、检查器 | 真实地图/事件查看、原版资源引用检索、工程脚本、Animation Forge 和场景内调试已实现 |
| Project codec | `.palforge.json` / 后续压缩工程包的读写与迁移 | version 3 JSON 可保存脚本草稿、编译预览和工程动画 |
| Runner bridge | 把本地资源复制到隔离文件系统并启动 SDLPAL | 浏览器 WASM 场景直达已实现；工程补丁注入与原生进程待开发 |
| Module SDK | 注册编辑页、事件、资源、存档字段和测试目标 | manifest 模型已实现 |

## 3. 资源引用

原版和扩展资源不共享裸整数编号。领域模型使用带命名空间的引用：

```text
pal://archives/mgo.mkf/chunks/104
pal://archives/map.mkf/chunks/7
project://animations/hero-walk
forge://assets/portraits/merchant.png
module://fishing-demo/audio/bite.ogg
```

打包器负责把这些稳定引用转换成特定运行配置需要的索引或旁加载文件。这样模块之间不会因为“谁先占了 500 号资源”产生冲突。

| 命名空间 | 所有者 | 编辑策略 | 当前用途 |
|---|---|---|---|
| `pal://` | 用户挂载的原版目录 | 永久只读 | 指向 MKF 与 chunk，资源浏览器负责解码 |
| `project://` | 当前 PalForge 工程 | 可编辑、可导入导出 | Animation Forge 的稳定动画 ID |
| `forge://` | 工程扩展文件 | 可替换 | 独立图片、音频和数据文件 |
| `module://` | 扩展模块 | 按 manifest 管理 | 模块私有资源 |

Animation Forge 导入图片时只把像素写入 `project://animations/{id}` 的工程帧。从原版 sprite、RLE 或 FBP 派生动画时，资源浏览器先解码索引色帧，再用用户选择的 PAT 调色板转成工程 PNG；新动画保留 `source.originalUri`，所有后续修改仍写入工程层，不覆写源 chunk。RNG 的增量帧重建尚未实现，因此不会进入派生管线。

资源浏览器的语义索引同样不修改原版归档。`resourceSemantics.ts` 从当前挂载目录已经解析出的场景、事件与脚本模型生成反向引用：场景地图号关联 `MAP/GOP`，事件精灵号关联 `MGO`，已知资源操作码关联 `MGO/RNG/FBP`。索引使用 `pal://archives/{archive}/chunks/{index}` 作为稳定键；“未发现引用”只说明当前关系表没有命中，不能据此删除原始 chunk。

## 4. 动画工程格式

工程动画使用 version 1 的内部模型，并随 version 3 `.palforge.json` 保存：

- 动画记录稳定 `project://` URI、循环策略、来源和创建/更新时间；
- 每帧记录独立 Data URL、尺寸、持续时间和锚点；
- 派生动画记录只读 `pal://archives/{archive}/chunks/{index}` 来源，但包内只保存转换后的工程帧；
- `.palforge-animation.json` 使用 `palforge-animation-pack` 包装一个或多个动画，导入时按稳定 ID 合并；
- 精灵表导出将透明 PNG 与布局 JSON 分开，布局保留每帧原始尺寸、位置、时长和锚点；
- pack 与精灵表都不会包含 `pal://` 原始字节，也不是 MKF 写回格式。

`project://` 绑定到 PAL 事件对象或 SDLPAL 运行时编号仍属于下一阶段；在映射落地前，Animation Forge 是可验证的创作/交换格式，不声称替换引擎资源。

## 5. 模块 manifest 草案

```json
{
  "manifestVersion": 1,
  "id": "fishing-demo",
  "name": "钓鱼小游戏",
  "version": "0.1.0",
  "kind": "minigame",
  "entry": "dist/index.js",
  "contributes": {
    "assets": ["assets/**"],
    "events": ["startFishing"],
    "saveFields": ["fishing.bestScore"],
    "testTargets": ["pond-demo"]
  }
}
```

模块不能直接写原始 MKF，也不能在未声明的情况下访问工程外文件。Runner Bridge 在独立测试目录中合成它需要的数据。

## 6. 两层即时测试

### 6.1 浏览器 Scene Debugger（当前实现）

1. 从当前真实场景、全部事件对象、所选图块和 PAT 调色板复制一个隔离快照；
2. 合并原始 `SSS.MKF #4`、M.MSG 与 Script Forge 的追加式编译结果，并先应用 `entryRedirects`；
3. 按 SDLPAL 触发脚本/自动脚本的控制流单步执行，维护调用栈、事件上下文、队伍位置、场景字段、调色板、对白和成功标记；
4. 把事件与队伍状态覆盖显示到真实场景 Canvas，但不修改加载得到的领域对象；
5. 随机、战斗、玩家输入、存档依赖和未实现副作用进入等待态，由测试者明确选择路径；
6. 任何读取存档、退出游戏等外部副作用都被拦截，2048 步总上限用于发现疑似无限循环。

因此浏览器层适合验证脚本流和可观察场景状态，而不是声称完整复现游戏。自动脚本的等待帧只按确定性步数推进，音乐/复杂视觉效果只记录日志。

### 6.2 Runner Bridge（后续实现）

浏览器 Runner 的第一阶段已经实现：

1. SDLPAL 固定到 `runtime/sdlpal/UPSTREAM_REVISION`，CI 只在临时 checkout 中应用 PalForge adapter/patch；
2. 生成的 SDL3 WebAssembly 在同源 sandboxed iframe 中运行，与 React 编辑器生命周期隔离；
3. 用户选择的 `File` 对象被复制到 Emscripten `/data`，文件名按 SDLPAL Web 端规则转为小写；
4. React 按 SDLPAL 原生接触触发距离检查出生点并避开门/传送区，再通过 `postMessage` 发送场景号和安全世界坐标；C adapter 在默认新游戏状态初始化后切换目标场景；
5. 关闭或重启 iframe 会销毁整个 WASM、SDL Canvas 和临时文件系统；原目录句柄没有写操作；
6. 当前 adapter 使用原始 SSS/M.MSG，工程脚本编译结果尚未写入 SDLPAL 的运行时脚本/消息表。

Windows 原生 Runner 仍按下面的长期流程实现：

1. 编辑器从当前选择建立不可变 `TestSnapshot`。
2. 快照包含场景、出生点、队伍、物品、剧情标记和可选事件入口。
3. Runner Bridge 复制基础游戏数据到缓存目录并应用工程差异。
4. 桥接程序生成启动参数或引导脚本，启动单独的 SDLPAL 进程。
5. 进程输出通过结构化日志返回测试台；退出后清理临时目录。

编辑器保存的工程与一次测试生成的临时副本必须严格分开，避免测试副作用污染创作数据。

## 7. 脚本覆盖与地址稳定性

原版事件脚本是一个全局 16 位地址数组。在中间直接插入指令会移动其后的所有地址，因此 Script Forge 使用追加式编译：

1. 从真实入口复制连续脚本块，给每条工程指令分配稳定字符串 ID；
2. 工程内跳转保存为稳定 ID，增删或重排不会破坏关系；
3. 编译时从原 SSS 脚本数量之后连续分配地址，并把符号目标改写为新地址；
4. 为每个源入口生成 `entryRedirects`，场景、事件和跨脚本调用以后统一应用该重定向；
5. 新对白同样从原 M.MSG 数量后追加，原消息编号不移动；未挂载 M.MSG 时将阻止安全消息分配；
6. 草稿记录基础脚本块签名；重新挂载的 SSS 数据不匹配时必须告警，不能仅凭 16 位入口号认定补丁兼容。

`.palforge.json` 保存可编辑草稿和确定性的编译预览；当前阶段不直接生成或覆盖 `SSS.MKF`、`M.MSG`。

## 8. 接下来最值得先做的工作

`Scene Lens`、`Script Forge`、`Animation Forge`、`Scene Debugger` 与 SDLPAL-WASM Runner 已形成原版只读 → 工程创作 → 独立验证 → 原始资源实机运行的链路。下一步应建立事件/角色到 `project://` 动画的显式绑定，并与 `entryRedirects`、追加脚本和消息一起注入 WASM 临时内存，再实现 Scene Forge 和 Windows 原生 Runner。
