# MLE5216 练习室

给 yyw 的选择题练习网页。依据四份2026课件整理为 **126题**：SEM 28、TEM 30、电子能谱30、像差校正STEM 18、综合比较20。**题干与A–D选项仅英文；中文解析包括逐项理由、重点英文词及因果逻辑链**，并给出课件及PDF文件页序。

按老师样题的逐项判断方式，重点考查实际原理、因果关系、应用范围与设备间的联系。不要求背具体设备参数、案例读数或算术代入。具体知识点与页码映射见[知识点覆盖表](COVERAGE.md)。[来源索引](coverage/sources.json)记录四份文件的页数与校验值。

**Tutorial重点**入口包含SEM、TEM、Electron Spectroscopy各5道老师原问题的主转换题，共15道，按原题顺序练习。每题保留原问题的重点逻辑，避免机械记忆题面数值。

老师在SEM课件里的Part 1期中样题用于学习题风格：每项独立判断、正确项可为1–4个、不提前提示正确项数。生成题是课件练习题，不是本次考试原题。复习页的重复知识跨模块合并；封面、课表和外部视频通知等不单独出题。完整处理说明见各覆盖索引。部分课件页脚有错位/跳号，引用优先使用PDF文件页序。

## 直接开始练习

直接打开本目录的 `index.html`，或下载交付的 `MLE5216-练习室.html`，用现代浏览器即可离线练习，不需要安装依赖或启动服务。

支持按课件或专题练习、随机抽题、选项打乱、即时解析、限时模拟、错题重练、收藏、历史及未完成练习恢复。模拟模式交卷前隐藏解析，按实际截止时间自动交卷。

**练习评分暂用答案集合完全一致**：少选、多选、错选均不得分，未作答计错；课件未提供本次考试的部分得分规则，不能将此规则当作老师已确认的考试评分规则。

进度保存在当前浏览器，并按题库内容分开保存。没有账号、后台或跨设备同步；清除浏览器数据会丢失记录，更新题库后使用独立进度。题库JSON导入只影响本机，不修改GitHub文件。离线文件与在线站点的浏览器存储相互独立。

## 本地开发与维护

Node.js 18或更新版本用于构建和校验；本地网页预览需要Python 3。不需要安装第三方依赖。

```sh
npm run build
npm test
npm run dev
```

打开 [本地练习页](http://127.0.0.1:5173)。也可直接打开构建后的 `output/MLE5216-练习室.html`。

- `data/sem.json`、`tem.json`、`spectroscopy.json`、`stem.json`、`comparison.json`：可编辑的分题库。
- `coverage/*.json`：知识点、来源页码与题号对应表。
- `scripts/build.mjs`：合并分题库、生成覆盖表和可直接打开的单文件入口，同时更新根目录、部署目录及离线交付版本。
- `index.template.html`：界面源模板。根目录 `index.html` 是构建生成的入口；修改模板或程序后重新构建。
- `data/questions.json`：构建后的主库，请修改分题库后重新构建。
- `dist/`：可部署网站，仅包含网站所需文件和覆盖索引。
- `data/demo.json`：5道操作示例，与正式课程题分开。

题目使用稳定唯一ID，格式如下：

```json
{
  "id": "SEM-new",
  "chapter": "SEM",
  "type": "multiple",
  "prompt": "Which statements are supported by the lecture?",
  "options": [
    { "id": "A", "text": "English statement A" },
    { "id": "B", "text": "English statement B" },
    { "id": "C", "text": "English statement C" },
    { "id": "D", "text": "English statement D" }
  ],
  "answers": ["A", "C"],
  "explanation": "A、C 对：说明依据。B、D 错：说明错误原因。\n\n重点词：English term（中文含义）\n逻辑链：原因 → 过程 → 结果。",
  "source": { "file": "SEM", "page": "PDF pp. 20–21" },
  "difficulty": "进阶"
}
```

这是格式示例。`multiple`表示不提示正确数量的不定项题，允许1–4项正确；`single`仅用于明确要求单选的其他题库。正式题保持四个独立选项，避免“以上皆是”等选项。新增题须同时补覆盖映射。老师Tutorial主转换题还需加如 `"tutorial": "SEM Tutorial Q1"` 的标记。构建会稳定重排选项字母并同步更新解析标题，保留化学符号与公式字母。

## 放到 GitHub Pages

项目仓库：[Crisp-shark/MLE5216](https://github.com/Crisp-shark/MLE5216)。仓库保存程序源码、题库与知识点覆盖索引；课件原文件不上传。

1. 将本目录的源文件放入仓库根目录，保留 `.github/workflows/pages.yml`。
2. 在 **Settings → Pages → Build and deployment** 中，将Source设为 **GitHub Actions**。
3. 推送到 `main`，或在 **Actions → Deploy GitHub Pages → Run workflow** 手动运行。
4. 工作流先构建题库并运行校验，再部署 `dist/`；从实际部署结果打开站点。

课件PDF原文件不包含在交付源码或部署目录中；题目只保存可核对的文件名、PDF页序和解释。

工作流参考 [GitHub Pages官方自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
