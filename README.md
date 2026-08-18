# Mangayomi 中文 Novel 扩展

本项目按 `m2k3a/mangayomi-extensions` 的 JavaScript Novel 结构提供两个扩展：

- `javascript/novel/src/zh/wenku8.js`：Wenku8 UTF-8 WAP 接口，支持排行、更新、搜索、详情、分页目录和分页正文；排行与搜索需登录。
- `javascript/novel/src/zh/bilinovel.js`：哔哩轻小说，支持排行、更新、搜索校验、详情、分卷目录和正文。

## 导入官方仓库

将两个 JS 文件复制到官方仓库相同路径，运行：

```text
dart run source_generator.dart
```

提交 JS 文件和生成后的 `novel_index.json`。本项目中的索引 URL 已按官方仓库 `main` 分支生成。

## 登录与浏览器校验

- Wenku8：在 Mangayomi 扩展设置中优先填写 Cookie；也可填写用户名和密码自动登录。密码字段在当前 Mangayomi 中不是掩码输入。
- 哔哩轻小说：搜索校验由扩展自动完成。若章节返回正文校验页，先用 Mangayomi WebView 打开该章，或在扩展设置中填写 Cookie。
