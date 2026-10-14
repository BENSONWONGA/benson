# 13 点扫描硬件接入文档

**项目**：SOLFIT 拍照量脚（footscan）
**版本**：v1.0（V2.5/V3 硬件接入规划）
**读者**：CV/嵌入式工程团队、硬件供应商对接人
**现状**：`footscan-skeleton-v0` 已上线（确定性伪测量），本文档定义真实 13 点扫描能力的接入契约

---

## 1. 概述

SOLFIT 的尺码推荐数据流已经打通：

```
照片/卷尺输入 → 测量值(cm) → EU 尺码 + 宽窄档 → 楦型校验(finalSize) → 脚型档案沉淀 → PDP 预选
```

**目前缺的只有一段**：照片 → 测量值的真实 CV 推理。这段在代码里被明确标记为骨架（伪测量），模型侧按本文档契约替换即可，**上下游零改动**。

| 组件 | 位置 | 状态 |
|---|---|---|
| 扫描引擎 | `src/ai/footscan/index.js` | 骨架（`MODEL_SKELETON`，confidence 封顶 78） |
| API 路由 | `src/app/api/ai/foot-scan/route.js` | 已上线（FormData，照片即焚） |
| 楦型校验 | `src/ai/size-engine` → `recommendSizeForProduct` | 已上线 |
| 档案沉淀 | `modules/customer` → `saveFitProfile` | 已上线 |
| 审计事件 | `ai_foot_scan {confidence, model}` | 已上线 |

---

## 2. 13 点体系定义

脚型测量由 **13 个解剖学关键点** 导出。所有测量值必须在 2D 照片或 3D 点云中同时定位以下点位：

| # | 关键点 | 解剖学位置 | 导出测量 |
|---|---|---|---|
| 1 | P1 后跟尖 | 足后缘最凸点（ calcaneus posterior） | 脚长（P1→P7） |
| 2 | P2 后跟内侧 | 跟骨内侧最凸点 | 跟围参考 |
| 3 | P3 后跟外侧 | 跟骨外侧最凸点 | 脚宽带校验 |
| 4 | P4 足弓内凹 | 内侧纵弓最凹点 | 足弓类型（高弓/扁平） |
| 5 | P5 第一跖骨点 | 拇趾球内侧（1st MTP） | 脚宽（P5→P6）、前足围 |
| 6 | P6 第五跖骨点 | 小趾球外侧（5th MTP） | 脚宽（P5→P6）、前足围 |
| 7 | P7 拇趾尖 | 拇趾前端最凸点 | 脚长（P1→P7） |
| 8 | P8 小趾外侧 | 小趾外缘最凸点 | 前足轮廓校验 |
| 9 | P9 足背高点 | 鞋楦 instep 对应位（舟骨上方） | 足背高（instep） |
| 10 | P10 内踝 | 内踝骨下缘点 | 靴筒适配 |
| 11 | P11 外踝 | 外踝骨下缘点 | 靴筒适配 |
| 12 | P12 跖围最宽带 | P5/P6 连线中点的足背面 | 跖围（ball girth） |
| 13 | P13 背长中点 | P9→P12 连线中点 | 足背围（instep girth） |

**最低输出要求**：`footscan-skeleton-v0` 的下游只消费 3 个派生值——

- **脚长 `lengthCm`**：P1→P7 水平投影距离（±2.0mm）
- **脚宽 `widthCm`**：P5→P6 水平投影距离（±1.5mm）
- **宽长比**：`widthCm / lengthCm`，用于宽窄档判定

P9/P12/P13 的围度数据 **预留存储、暂不消费**（楦型库 `LAST_LIBRARY` 扩展足围维度后启用）。

---

## 3. 尺码映射契约（不可变更）

以下映射是**全站既定口径**，硬件侧不得改动，只负责把 `lengthCm`/`widthCm` 测准：

```js
// EU 码 = (脚长mm + 15mm 趾仓余量) ÷ (20/3 mm)，0.5 码粒度，值域 [35, 46]
lengthToEu(lengthCm)

// 宽窄档：宽长比 > 0.40 → Wide；< 0.36 → Narrow；否则 Standard
ratioToWidth(lengthCm, widthCm)
```

> 参照基准：100 分 = $1 积分、EU 码步进 2/3cm（Paris point）与楦型库（W1–W4/H1–H2/B1/F1–F2）的
> runs 属性均依赖此口径。改映射 = 全站尺码错乱。

---

## 4. 硬件侧要求

### 4.1 V2.5 —— 手机照片方案（2D + 参照物标定）

| 项 | 要求 |
|---|---|
| 分辨率 | ≥ 1600×2400（P1→P7 量程内 ≥ 30px/mm） |
| 拍摄姿态 | 正俯拍（俯角偏差 < 10°，超出则 LOW_CONFIDENCE） |
| 光照 | 均匀漫射光，无强投影（脚底阴影会吃掉轮廓） |
| 背景 | 纯色硬质地面（推荐 A4 白纸 + 压平） |
| 参照物 | ISO/IEC 7810 ID-1 信用卡，长边 **85.60mm**（当前默认值 `referenceMm`），置于脚外侧、与拍摄轴平行 |
| 脚部姿态 | 站姿承重、双脚自然分开、脚跟贴墙 |

### 4.2 V3 —— 深度相机/3D 扫描方案

| 项 | 要求 |
|---|---|
| 深度精度 | ≤ 1mm RMS（结构光/ToF） |
| 点云密度 | ≥ 10 pts/mm²（前足区域） |
| 扫描时长 | ≤ 5s（用户保持站姿的耐心上限） |
| 输出 | 13 点 3D 坐标 + 置信度向量；固件直接输出测量值，不传原始点云 |

### 4.3 传输与环境变量（新增，模型服务化时启用）

```
FOOTSCAN_MODEL_URL=http://localhost:8501/infer   # 推理服务端点（gRPC/HTTP，二选一）
FOOTSCAN_MODEL_ID=footscan-13p-v1               # 模型版本标识（落 ai_foot_scan.model）
FOOTSCAN_MIN_CONFIDENCE=90                      # 低于此值不自动落档案（走复核提示）
```

---

## 5. 接口契约（代码接入点）

### 5.1 不变式

`scanFoot()` 的签名与返回形状**永不改变**：

```js
scanFoot({ photo, referenceMm, manualLengthCm, manualWidthCm })
// → { size, width, confidence, measurements, source, model, reason }
```

### 5.2 替换点（唯一需要改的代码）

`src/ai/footscan/index.js` 中标记为骨架的段落：

```js
// ========== 接入点：以下整段替换为真实推理 ==========
// const rand = prng(contentSeed(photo) ^ Math.round(referenceMm * 7));
// const length = +(22.5 + rand() * 7).toFixed(1);      ← 删
// const width  = +(length * (0.345 + rand() * 0.075)).toFixed(1);  ← 删
// =====================================================
// V2.5: const infer = await fetch(FOOTSCAN_MODEL_URL, {...13 点推理请求...})
// V3:   深度相机 SDK 直接回调 measurements
```

替换后的义务：

1. **卷尺路径优先级不变**：`manualLengthCm` 存在时跳过照片推理（真实数据永远优先）
2. **置信度口径**：生产模型按真实模型置信度上报（≥ 90 才可信），骨架期的 `MODEL_SKELETON` 标记移除
3. **`model` 字段**：填 `FOOTSCAN_MODEL_ID`（审计可追溯）

### 5.3 错误码扩展

路由层现有：`PHOTO_REQUIRED`（422）、`UNSUPPORTED_IMAGE`（422）、`PHOTO_TOO_LARGE`（413）。

新增（接入真实模型时在 `route.js` 补映射）：

| 错误码 | HTTP | 含义 | 前端处理 |
|---|---|---|---|
| `CALIBRATION_LOST` | 422 | 参照物检测失败/被遮挡 | 提示重新拍摄 |
| `LOW_CONFIDENCE` | 200 | 置信度 < FOOTSCAN_MIN_CONFIDENCE | 返回测量但标记"建议卷尺复核"，不落档案 |
| `MODEL_TIMEOUT` | 504 | 推理超时（>10s） | 降级问卷路径 |

### 5.4 输出验证（防幻觉/防脏数据）

模型输出在进入 `lengthToEu` 前必须过闸：

```js
lengthCm ∈ [18, 35]      // 成人足长值域
widthCm  ∈ [7, 14]
widthCm / lengthCm ∈ [0.30, 0.48]   // 解剖学合理带
Number.isFinite 且小数位 ≤ 1
```

越界 → 按模型错误处理（不静默夹取值——错的测量比没有测量更贵，退货会告诉我们）。

---

## 6. 数据流与合规（GDPR）

```
照片字节 ──(仅过流，buffer 即焚)──▶ 推理 ──▶ 测量值(cm)
                                        │
                            ┌───────────┴───────────┐
                            ▼                       ▼
                  ai_foot_scan 事件            fitProfile 档案
             {confidence, model}          {measurements, recommendation}
                 （审计）              （GDPR 分区：跟随 privacy erase/export）
```

红线（当前实现已保证，接入时不得破坏）：

1. **照片永不落库**——不进 store、不进事件管道、不写磁盘
2. **事件不含 PII**——`ai_foot_scan` 只带 `{confidence, model}`
3. **档案随 GDPR 编排**——`/api/privacy/export` 会导出测量值；`erase` 会清除档案
4. 脚型测量属生物特征相关数据：Phase 2 落 PG 时单独分区（EU/US 隔离），与订单分库

---

## 7. 验收标准（DoD）

### 7.1 台架精度

| 测量 | 合格线 | 测试方法 |
|---|---|---|
| 脚长（P1→P7） | ±2.0mm | 与游标卡尺实测对比，N ≥ 30 双真脚 |
| 脚宽（P5→P6） | ±1.5mm | 同上 |
| 宽长比 | ±0.008 | 派生值 |
| EU 码推导 | 0 错位（±2mm 保证下自然成立） | 与尺规量脚器对拍 |

### 7.2 端到端回归（已有测试路径复跑）

```bash
# 1. 卷尺路径不受影响（回归基线）
curl -X POST /api/ai/foot-scan -F manualLengthCm=25.5 -F manualWidthCm=10.2 -F productId=1
#    → size=40.5, confidence=93, source=manual

# 2. 照片路径走真实模型（替换后）
curl -X POST /api/ai/foot-scan -F photo=@bench.png -F productId=1
#    → source=photo, model=<FOOTSCAN_MODEL_ID>, confidence ≥ 90

# 3. PDP 楦型校验联动不变
#    → finalSize / exactMatch 字段照常返回
```

### 7.3 业务指标（上线后观测）

- **评价 fit 反馈**：`true_to_size` 占比 ≥ 85%（当前 fitStats 基线，Phase 18 评价域持续回写）
- **尺码类换货率**：方向性下降（fitTrainingSet 按楦型聚合可观测）
- 低置信度样本占比 < 20%（否则拍摄引导需要迭代）

---

## 8. 分阶段路线

| 阶段 | 方案 | 交付物 | 退出条件 |
|---|---|---|---|
| V2（当前） | 骨架 + 卷尺 | `footscan-skeleton-v0` | 已上线 |
| V2.5 | 手机照片 + 13 点 2D 模型（自研或采购） | 替换 §5.2 接入段 | §7.1 精度达标 |
| V3 | 深度相机 3D 扫描（围度数据启用） | P9/P12/P13 消费 + 楦型库扩足围维度 | 围度误差 ≤ 3mm |

---

## 附录 A：相关代码索引

| 文件 | 角色 |
|---|---|
| `src/ai/footscan/index.js` | 扫描引擎（**接入点**：pseudo-measure 段） |
| `src/app/api/ai/foot-scan/route.js` | API（FormData、照片即焚、档案联动） |
| `src/ai/size-engine/index.js` | 楦型校验（`recommendSizeForProduct`） |
| `src/components/ProductClient.jsx` | 前端交互（拍照/卷尺双入口、结果展示） |
| `src/lib/pipeline.js` | `ai_foot_scan` 事件 schema |
| `src/modules/customer/service.js` | 脚型档案（GDPR 编排联动） |

## 附录 B：参照物规格

ISO/IEC 7810 ID-1（信用卡/借记卡）：**85.60 × 53.98 × 0.76 mm**。
站方默认 `referenceMm = 85.6`；若更换参照物（如 A4 纸 297mm 长边），前端需传 `referenceMm` 参数，后端验签 `referenceMm ∈ [30, 400]`。
