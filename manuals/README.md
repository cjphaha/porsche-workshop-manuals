# 原始手册收件目录

将原始 PDF 放在 `manuals/982/` 内（一个文件），然后在项目根目录运行：

```sh
npm run manual:add -- --model 982 --name "718 Boxster / Cayman"
```

也可以直接指定任意路径：

```sh
npm run manual:add -- --model 911-992 --name "911 (992)" --source "manuals/911-992.pdf"
```

此目录中的原始文件不会提交到 Git，不会发布到网站。导入成功的切片存放于 `site/docs/车型代号/`。第一次运行需要 Python 3.10+，命令自动创建 `.venv` 并安装 PDF 处理依赖。
