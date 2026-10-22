# 四时 · 指尖花境

一屏淡粉与雾白重瓣小花，支持本机摄像头手势识别。静态 HTML、Canvas 2D 和本地托管 MediaPipe 模型，无服务器识别、不上传摄像头画面。保留原有花朵素材，统一受光方向并柔化明暗对比。

## VS Code、GitHub 与 Cloudflare

在 VS Code 打开本文件夹，可通过「终端 → 运行任务 → 启动四季花境」预览，也可双击「启动预览.cmd」。在其他电脑上安装 Node.js 22 或更新版本后运行 `npm start`，无需安装项目依赖。

GitHub 仓库：https://github.com/yueyi8032-tech/sishi-gesture-interaction

Cloudflare Pages 的接入参数：GitHub 仓库选择 `sishi-gesture-interaction`，生产分支 `main`，框架预设 `None`，构建命令 `npm run build`，构建输出目录 `dist`，根目录留空。首次接入需要在 Cloudflare 授权访问这个仓库。接入完成后，VS Code 提交并同步到 GitHub 的更新会触发自动部署。

桌面文件夹已包含识别模型。为避免把大体积模型反复上传到 GitHub，WASM 与模型文件不进入版本管理；从 GitHub 新克隆时先运行 `npm run build`。构建脚本从固定版本来源下载，并逐个校验 SHA-256；Cloudflare 发布时也会执行这个步骤，最终仍从自己的站点加载模型。

仅将 `dist` 目录作为网站发布目录。GitHub 仓库为私有；Cloudflare 部署后的网站可通过网址访问。发布前可用 `npm run check` 检查代码和手势逻辑。

## 使用

在已发布的 HTTPS 页面点击“开启手势体验”，允许摄像头权限。推荐桌面 Chrome 或 Edge，单手进入画面。若镜像方向或活动范围不合适，打开右上角定位设置进行校准。

- 拇指与食指捏合：拿起光点实际命中的那朵花；保持捏合可移动它。松开手指后，花朵散成花瓣随风飘走，原位稍后重新生长。
- 伸出食指：指向的花绽放；沿连续扫动路径的花依次绽放。
- 五指张开：全部花朵绽放；张掌扫动的方向和速度控制春风。
- 手部跟踪暂时丢失：不会误判为松手，超过短暂缓冲后把花放回原位。

鼠标试用：移动开花、按住拿花、松开散瓣；按住空格移动模拟张掌扫动；R 重置。触屏可拖动拿花和松手散瓣。

## 本地运行与检查

安装 Node.js 后，在本目录执行 `node serve.mjs`，打开 `http://127.0.0.1:4173/`。直接打开 HTML 文件不能启动识别模块。运行交互逻辑测试：`node tests/core.test.mjs`。

## 文件

- `dist/core.mjs`：几何命中、连续轨迹、手势分类、捏合滞回、状态与粒子。
- `dist/render.mjs`：独立花朵、开花、跟手与散瓣绘制。
- `dist/app.mjs`：摄像头、MediaPipe、定位校准、鼠标与界面控制。
- `dist/vendor/`：固定版本的识别组件、WASM 和模型，来源与校验记录见 provenance.json。

春日篇章已实现；夏、秋、冬入口目前禁用。实时摄像头体验会受光线、遮挡、相机画幅与设备性能影响。已进行合成手部输入与状态测试，仍应在实际摄像头上验证并按需要校准。
