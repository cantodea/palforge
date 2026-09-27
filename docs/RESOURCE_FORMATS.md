# PAL 资源格式（当前实现）

PalForge 0.8 只读取用户本地选择的游戏目录。任何格式错误都会停在当前 chunk、场景或脚本；工程脚本、工程动画、调试快照和 SDLPAL 临时运行文件保存在独立项目/内存中，不会修改源文件。

## 解码管线

```text
MKF 文件 → 偏移表 → chunk → YJ_1 / YJ_2 → 资源类型识别
                                                ├─ sprite 偏移表 → RLE 帧
                                                ├─ 单张 RLE 图像
                                                ├─ 320×200 FBP
                                                └─ PAT 调色板

SSS.MKF #1 → 场景记录 → MAP.MKF[地图号] → 64×128×2 图块数据
                         GOP.MKF[地图号] → 图块 sprite
SSS.MKF #0 → 相邻场景事件索引 → MGO.MKF[精灵号] → 事件 sprite
SSS.MKF #4 → 8 字节 SCRIPTENTRY → opcode 注册表 → 可达指令/显式跳转
SSS.MKF #3 → 32 位消息偏移 ─┐
                             ├→ M.MSG → GBK/Big5 对白
```

## 已实现格式

| 格式 | 处理方式 |
|---|---|
| MKF | 第一个 32 位小端偏移决定索引长度；相邻偏移决定 chunk 范围 |
| YJ_1 | 检查 `YJ_1` 签名，按块解 Huffman/LZSS 数据；支持未压缩 block |
| YJ_2 | Win95 自适应 Huffman/LZSS 解码；可在界面强制选择 Win95 模式 |
| PAL sprite | 第一个 16 位字给出帧偏移表长度；每个偏移以 16 位字为单位 |
| PAL RLE | 读取宽高，透明游程不写像素，其余字节作为调色板索引 |
| PAT | 每套 256×RGB，VGA 6 位通道左移 2 位；支持第二套夜间颜色 |
| FBP | 解压后 64000 字节按 320×200 调色板索引图显示 |
| SSS scene | `SSS.MKF #1` 每条 8 字节：地图、进入脚本、传送脚本、事件起始索引；下一条记录提供事件结束哨兵 |
| SSS event | `SSS.MKF #0` 每条 32 字节：坐标、层级、状态、触发/自动脚本、触发模式、MGO 精灵号、方向和帧 |
| SSS script | `SSS.MKF #4` 每条 8 字节：1 个 16 位 opcode 与 3 个 16 位操作数；数组下标就是脚本入口地址 |
| PAL message | `SSS.MKF #3` 是 32 位小端偏移哨兵表；相邻偏移切分 `M.MSG`，自动从 GBK/Big5 中选择错误较少的解码 |
| MAP | 指定 chunk 解压后必须为 65536 字节，即 `[128][64][2]` 个小端 DWORD；包含底/顶层帧、阻挡与高度位 |
| GOP | 与 MAP 使用相同 chunk 编号的原始 PAL sprite 包；按照 SDLPAL 行为直接读取，不做无条件 YJ 解压 |
| Scene MGO | 按事件对象精灵号读取并解压 MGO sprite，保留原帧编号和方向组合 |

## 识别与导出

自动模式先检查 `YJ_1`；对常见压缩资源库再尝试 `YJ_2`。成功解压后才做 sprite、RLE、FBP 或 PAT 识别。界面可导出：

- MKF 中未经修改的原始 chunk；
- YJ 解压后的 payload；
- 当前调色板和 sprite 帧渲染得到的 PNG。

资源页的调色板工作台不会更改索引像素或 `PAT.MKF`：昼夜混合、亮度、饱和度和对比度只作用于 Canvas 与 PNG 导出。sprite 播放器同样保留资源原有的帧顺序和数量。

## 原版资源语义索引

MKF chunk 本身通常只有编号和二进制内容，因此 PalForge 不维护一套假定所有版本通用的硬编码人物名称。当前索引从用户实际挂载的数据反查用途：

| 资源 | 关系来源 |
|---|---|
| `MAP/GOP.MKF #n` | `SSS.MKF #1` 中 `mapNumber == n` 的场景 |
| `MGO.MKF #n` | `SSS.MKF #0` 中 `spriteNumber == n` 的事件对象，以及脚本 opcode `0x0065` |
| `RNG.MKF #n` | 脚本 opcode `0x0036` 的资源操作数 |
| `FBP.MKF #n` | 脚本 opcode `0x0076`、`0x00A4`、`0x00A5` 的资源操作数 |

每条引用保留场景号、事件对象号、坐标、脚本入口或 opcode，可从资源页跳回场景/脚本。搜索文本由归档说明、chunk 编号和这些引用共同生成。没有命中的条目显示“当前场景表和脚本中未发现引用”，不标记为废弃；它仍可能由未接入的数据表、引擎硬编码或不可达逻辑使用。

`BALL/FIRE/F/ABC/RGM` 当前只有归档级用途说明。后续需要解析 `SSS.MKF #2` 对象表、`DATA.MKF` 角色/敌人/法术表和 `WORD.DAT`，才能把 chunk 安全关联到道具、法术、角色或敌人的本地名称。

## 工程动画格式

Animation Forge 将自定义动画保存在独立工程层；0.8.1 可编码临时 sprite/RLE/MKF 供实机测试，不写回源文件：

| 字段 | 约束 |
|---|---|
| `uri` | 必须为 `project://animations/{id}`，不能使用 `pal://` |
| `source` | `custom` 或 `derived`；派生资源可记录只读 `originalUri` |
| `frames[].dataUrl` | PNG、WebP 或 JPEG 的 base64 Data URL |
| `frames[].width/height` | 1–8192 像素 |
| `frames[].durationMs` | 16–60000 ms |
| `frames[].anchorX/Y` | -8192–8192 的整数，默认是底部中心 |

标准动画包标记为 `format: "palforge-animation-pack"`、`version: 1`。解析器会拒绝错误版本、不属于 `project://` 的 URI、远程图片 URL 和越界帧；同 ID 包重新导入时更新工程副本，不触碰任何原版 chunk。

原版资源派生流程是 `MKF chunk → 解压/识别 → 索引色帧 → 指定 PAT 调色板 → PNG 工程帧`。PAL sprite 会保留全部已解码帧，RLE/FBP 生成单帧动画，`source.originalUri` 记录来源 chunk。RNG 需要从增量指令重建连续画面，当前解码器尚未实现这一阶段，因此导入器会拒绝它并显示原因。

精灵表导出由 PNG 与 `palforge-sprite-sheet` version 1 JSON 组成。JSON 保存网格单元、每帧实际宽高、时长和锚点；实机绑定使用工程帧，不会自动读取此精灵表，也不会生成原地补丁。

### 实机绑定（0.8.1，可选字段）

`runtimeBinding` 保存 `archive`（MGO/F/ABC/FIRE.MKF）、`chunkIndex`、`paletteIndex`、`paletteVariant`（day/night）、`frameMapping`（exact/repeat）和 `enabled`。该字段是 version 1 动画包的向后兼容扩展；旧包不带绑定时仅导入工程帧。解析器拒绝不合法绑定，保存、导出和重新导入均保留绑定。

`animationRuntime.ts` 校验目标精灵、原版帧数和重复绑定，将图片匹配到 PAT（alpha < 128 为透明），再由 `palEncoder.ts` 写出 RLE 和 word-aligned sprite。YJ_1 使用合法的 stored blocks；YJ_2 使用 literal-only 自适应 Huffman 编码，包含原生解码器所需的结束标记。输出保持目标 chunk 原有的压缩类型。

原版帧位数量固定，`exact` 要求工程帧数相同；`repeat` 按序循环填充且不允许工程帧多于目标帧。RLE 将游程限制在单行内及 127 像素，避免 PAL 的高位命令歧义。锚点通过透明填充对齐；不允许裁掉脚底下方的图像。超出 512×512 或 sprite 的 16 位 word 偏移容量会报错。

只有全部绑定转换成功才会创建并发送新的 `File` 副本；其余 chunk 保持字节一致，未涉及的文件保持原对象，错误不会静默回退为原版。运行器在新 iframe 中挂载副本，切换原版对照或重启时从挂载源重新准备，避免叠加补丁。

## 事件脚本读取

- opcode 语义位于 `src/core/script.ts`，以 SDLPAL 的 `SCRIPTENTRY`、`PAL_RunTriggerScript`、`PAL_RunAutoScript` 与 `PAL_InterpretInstruction` 为基准；
- 场景进入/传送、事件触发/自动脚本会收集为真实入口，并在同一入口被多处引用时保留全部来源；
- 流程查看器沿顺序执行路径、调用和已知条件跳转展开，使用集合防止死循环，并在 256 条可达指令后停止；
- 未识别 opcode、空入口、越界跳转仍显示原始字，不会被臆测或丢弃；
- `0xFFFF` 文本指令会用操作数 0 查找 `M.MSG`；消息文件缺失或偏移损坏不会阻止地图和原始脚本浏览；
- 场景调试器可运行进入/传送、事件触发和自动脚本的控制流；对白、事件/队伍位置、事件状态/帧、场景字段及调色板变化会进入隔离快照；
- 随机数、战斗、玩家输入和存档依赖不会被臆造，调试器会暂停并要求明确选择路径；尚未模拟的 opcode 同样必须显式跳过或停止。

## 当前边界

- 浏览器调试器维护独立的队伍位置与场景事件快照，并能让脚本的昼夜/调色板指令即时影响预览；它不读取真实存档，也不运行完整战斗、音频或复杂视觉系统。
- 0.8 可以编辑工程脚本、工程动画、生成追加式脚本编译预览、在脚本沙盒中运行，并从指定场景的安全坐标启动真实 SDLPAL-WASM；出生点会避开阻挡半格与活动的接触触发事件。任何阶段都不写回 MKF/M.MSG，场景名称和未知 opcode 不从二进制中臆造。
- Animation Forge 可绑定并替换实机临时副本中的 MGO/F/ABC/FIRE 精灵，所有引用该 chunk 的对象都会受影响；RNG 仍不支持。
- 动画时长/循环由引擎及原版脚本控制，调色板随场景/昼夜变化；工程中的毫秒时长不改变引擎节奏。地图预览与脚本沙盒仍显示原版精灵。
- 追加式工程脚本与对白尚未注入引擎运行表，应使用 Scene Debugger 验证这些覆盖。
- 调试器只实现已建模的 SDLPAL 指令效果；依赖外部运行状态的分支和未知副作用会停住，不能替代以后 Runner Bridge 的真实进程兼容测试。
- 自动识别是启发式的；如遇到误判，应先在界面切换 DOS/Win95 模式，再记录文件名、chunk 编号和错误信息。

格式实现以 SDLPAL 的兼容行为为基准；PalForge 不复制或分发任何 PAL 游戏资源。
