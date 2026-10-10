# INTAFACED trading shell

> Product web front for the INTAFACED exchange desk

## Install Prerequisites
The following dependencies are required to run an instance:

1. NodeJS - 9.11.2
2. Npm - 5.6.0

## Build Setup

``` bash
# install dependencies
npm i

# serve with hot reload at localhost:8080
npm run dev

# build for production with minification
npm run build

```



## Future
1. 统一改用less,实验可以通过变量覆盖的方式定制主题;
2. iview组件按需引用;
3. exchange.vue等大文件，代码拆分/组件化;


## 前端开发规范
1. 页面使用驼峰法命名，如Exchange.vue,WithdrawRecord.vue,名称为英文单词，并且要能正确描述该模块功能
2. 变量命名禁止使用拼音，特别是拼音缩写
3. 页面比较多时应该使用文件夹做分类
4. 模块中data变量应该尽量少，比较多时应该使用子对象进行管理



## Public prelaunch enquiries

`/join`, `/invest`, `/trade` and `/merchant` open the public enquiry flow. On the exact hostname `join.intafaced.com`, `/`, `/academy` and `/partner` also open it. On other hosts, the existing `/academy` and `/partner` product routes remain available; use `/join/academy` and `/join/partner` for local enquiry previews. Named country selectors use a dependency-free public-domain IANA ISO country table, with `Intl.DisplayNames` for labels; these self-reported geography choices do not define access policy or a sanctions list. Every selected audience uses questionnaire version 1 from `packages/contracts/src/outreach-crm.ts`.

The client saves contact before the longer questions and POSTs bare JSON through the existing edge `/api/ops/trpc/outreach.capture`, `outreach.resume` and `outreach.answer` routes without an account bearer. It generates an independent browser-crypto 256-bit continuation capability and request UUID before first capture. Pending requests and receipts stay only in this tab’s `sessionStorage`; confirmed receipts use the server’s continuation expiry, while a capture with a lost first response retains its original retry identity until the server confirms or refuses it. The browser does not invent a pending expiry or extend server authority; the capability never enters a link, analytics call or log. Reload/retry recovers the same intent, and resume reconciles the current revision after replayed receipts. A blocked storage implementation has an explicit on-page limitation; reopening on another tab/device is unavailable here. Original submitted answers are preserved.

Production hosting must configure **HTTPS for the exact `join.intafaced.com` host**, serve this existing shell's `dist/` assets, and return `dist/index.html` for HTML navigation to `/`, `/join`, `/invest`, `/trade`, `/merchant`, `/academy`, `/partner` and `/join/*`. Proxy `/api/ops/trpc/*` to the existing edge without rewriting its public prefix. DNS, certificate and reverse-proxy host routing are deployment inputs; port mappings alone do not configure this domain. This frontend does not provision them.

Enquiry reply permission and optional marketing permission are separate. Completion confirms saved contact and selected answers; it does not confirm email delivery, product access or an investment. Operator retention/deletion/export policy, public privacy copy, outbound email sender/gateway and durable backend configuration must be confirmed for live launch. This code contains no private fundraising source or provider viewer identity inference. Only a schema-valid opaque `source` query hint is forwarded as `sourceKey`.

Focused local checks (Node 24 and the existing shell dependencies):

```bash
node src/assets/js/outreach-intake.golden.js
../../../node_modules/.bin/vitest run src/outreach-intake.contract.test.ts
npm run build
node test/outreach/public-intake.browser.mjs
```

The browser proof serves local build assets with fixture API replies, exercises all five selected journeys at 390px and 1280px, and verifies lost-response/reload recovery, keyboard access and horizontal overflow. It does not submit to a live service or claim deployed-host validation.
