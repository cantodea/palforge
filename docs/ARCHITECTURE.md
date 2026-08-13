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
| Domain model | 场景、单元、事件、脚本、资源引用、项目差异 | PAL 场景、脚本入口、静态流程和工程脚本覆盖已实现 |
| Editor features | 地图、脚本、资源、模块、检查器 | 真实地图/事件查看与工程脚本编辑已实现 |
| Project codec | `.palforge.json` / 后续压缩工程包的读写与迁移 | version 2 JSON 可保存脚本草稿和编译预览 |
| Runner bridge | 从工程快照生成临时游戏副本并启动 SDLPAL | 快照模型已实现，进程桥接待开发 |
| Module SDK | 注册编辑页、事件、资源、存档字段和测试目标 | manifest 模型已实现 |

## 3. 资源引用

原版和扩展资源不共享裸整数编号。领域模型使用带命名空间的引用：

```text
pal://MGO.MKF/104
pal://MAP.MKF/7
forge://assets/portraits/merchant.png
module://fishing-demo/audio/bite.ogg
```

打包器负责把这些稳定引用转换成特定运行配置需要的索引或旁加载文件。这样模块之间不会因为“谁先占了 500 号资源”产生冲突。

## 4. 模块 manifest 草案

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

## 5. 即时测试流程

1. 编辑器从当前选择建立不可变 `TestSnapshot`。
2. 快照包含场景、出生点、队伍、物品、剧情标记和可选事件入口。
3. Runner Bridge 复制基础游戏数据到缓存目录并应用工程差异。
4. 桥接程序生成启动参数或引导脚本，启动单独的 SDLPAL 进程。
5. 进程输出通过结构化日志返回测试台；退出后清理临时目录。

编辑器保存的工程与一次测试生成的临时副本必须严格分开，避免测试副作用污染创作数据。

## 6. 脚本覆盖与地址稳定性

原版事件脚本是一个全局 16 位地址数组。在中间直接插入指令会移动其后的所有地址，因此 Script Forge 使用追加式编译：

1. 从真实入口复制连续脚本块，给每条工程指令分配稳定字符串 ID；
2. 工程内跳转保存为稳定 ID，增删或重排不会破坏关系；
3. 编译时从原 SSS 脚本数量之后连续分配地址，并把符号目标改写为新地址；
4. 为每个源入口生成 `entryRedirects`，场景、事件和跨脚本调用以后统一应用该重定向；
5. 新对白同样从原 M.MSG 数量后追加，原消息编号不移动；未挂载 M.MSG 时将阻止安全消息分配；
6. 草稿记录基础脚本块签名；重新挂载的 SSS 数据不匹配时必须告警，不能仅凭 16 位入口号认定补丁兼容。

`.palforge.json` 保存可编辑草稿和确定性的编译预览；当前阶段不直接生成或覆盖 `SSS.MKF`、`M.MSG`。

## 7. 接下来最值得先做的工作

`Scene Lens`、`Script Lens` 与 `Script Forge` 已形成真实读取 → 工程覆盖 → 追加式编译预览的链路。下一步应实现 Scene Forge，并让 Runner Bridge 只在临时游戏副本中应用 `entryRedirects`、追加脚本与消息，再启动 SDLPAL 测试。
