# DeepSeek Harness (数据保护重制版)

<p align="center">
  <sub>by <a href="https://github.com/stefanohe">Stefano's AI Lab</a></sub>
  <br>
</p>

[English](README.md) | 中文

<p align="center">
  <img src="images/dsh-datasecure-billboard-600x500.gif" alt="dsh-datasecure billboard">
</p>

## 与原版的差别

除以下说明，保留了全部官方原版 DeepSeek Harness 功能，DeepSeek Harness (数据保护重制版) 让您在保障数据安全的同时使用原汁原味的官方原版 Harness。*特别声明：该版本由 [Stefano's AI Lab](https://github.com/stefanohe) 重制，与 DeepSeek 官方无关。*

1. 移除了「在使用官方模型 API 时上传 Session Log，帮助改进 DeepSeek 模型与产品」功能插件，不再存在使用中默认开启的问题，适合注重数据安全的用户群体，最大限度保障您的数据安全。
2. 默认打包了 [dsh-show-balance](https://github.com/stefanohe/dsh-show-balance) 和 [dsh-prefill-speed-stats](https://github.com/stefanohe/dsh-prefill-speed-stats) 两个非常实用的状态栏小插件，让您直观地在状态栏中看到账户余额和输入速度等信息。
3. 修复了原版 `.dsh/sessions` 会话日志目录洁癖——目录中出现游离文件夹会被原版误判为编码冲突，导致对话功能崩溃。
4. 自动更新已切断：应用不会自动升级，手动检查更新将跳转至本仓库 Releases 页面，版本获取以您主动下载为准。

## 安装

请直接通过本仓库 Releases 页面的安装包进行安装：[Releases](https://github.com/stefanohe/deepseek-harness-datasecure/releases) 。

提供 Windows x64、Linux x64 / ARM64、Mac x64 / Silicon 安装包。安装包均未签名：

- Windows 首次运行会有 SmartScreen 提示（请同意运行）。
- MacOS 请在访达中按住 Control 点击安装包选择「打开」。

## 其他说明

应用名 DeepSeek Harness DataSecure，独立安装目录与卸载条目，与官方原版可共存安装、互不覆盖；两版共享 `~/.dsh` 数据目录（记忆库、插件库与 profile）。

## 原版说明引用

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [*A Programming Paradigm for Spatiotemporal Composability*](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

### 开发者预览

DeepSeek Harness 处于 *开发者预览* 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

### 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

### 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

### 许可证

本项目为 DeepSeek Harness 的衍生二次开发版本，原始版权归 DeepSeek 所有，本分支遵循上游开源协议分发。

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
