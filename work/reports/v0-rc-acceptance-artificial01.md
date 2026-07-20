createDate: 2026-07-19

## RC 人工验收环节

### 前情提要
已运行：
```
npm run quality:gate
npm run dev
```
已测试并打开local:3000，添加chrome extension并配对

### 已知问题
1. 网站没有使用国内网站，部分存在账号注册登录困难（如leetcode，使用的并非leetcode.cn）
2. extension中queue与记录捕获问题。extension 中有捕获成功Last success记录，但是queue一直增加没有减少，刷新local:3000\training后依旧没有显示提交记录（这是在我已经提交了一道AC的情况下）
3. 捕获成功Last success判断有问题。我只是点击编辑代码并没有提交，然后切换页面或者登录账号，extension却显示有捕获成功Last success记录，queue也增加
4. extension验证码匹配机制不明确。重新提交匹配码有v2显示，意义不明，需要那你向我解释运行逻辑或是减改冗余设计

### 功能增加想法（建议增加到v0.5）
1. 提交代码后，extension有弹窗提示
2. local:3000页面有中英文切换选项
