# What OKX, Robinhood, and Strike publish about Pay, More, and the rest

Date read: 5 October 2026.

This note records what those three companies say on their own help, product pages, store of support articles, or official site. A news recap is not a source. A dollar figure below is that company's figure, on the page cited. It is not a figure for any other company.

Room names in the questions (Pay, More, the team door, Private, the public front) are the names in the uncommitted room map. Where a company has no page for that room, this note says "no first-party page found".

## How the pages were opened

- Strike's own index, `https://strike.me/llms.txt`, lists the default-edition pages and says each is also served as markdown. Several support articles were read as that markdown. `https://strike.me/faq/what-are-my-limits/` and `https://strike.me/faq/what-are-the-transaction-limits-for-businesses/` both returned the buy-or-sell article instead of a limits table (final URL `https://strike.me/int/en/support/how-do-i-buy-or-sell-bitcoin/`). Those two FAQ addresses are not in the current help index. Later direct requests to `strike.me` returned HTTP 429 or a "Just a moment" interstitial; the pages cited below are the ones that opened.
- `https://www.okx.com/help/pay-faq` did not open on the first fetch. The same article opened at `https://www.okx.com/en-us/help/pay-faq`. Several OKX help URLs on a non-US path showed "Looks like you're in the United States. Switch to the United States site for products available in your region."
- `https://robinhood.com/us/en/support/articles/ipo-access/` and the sign-up article failed on the first fetch and opened on a second try. `https://robinhood.com/us/en/agentic-trading` opened as `https://robinhood.com/us/en/agents/`.

## Send, request, receive, and a contact list

### Strike

"How do I send cash or bitcoin?" (no date printed; read 5 October 2026), `https://strike.me/int/en/support/how-do-i-send-cash-or-bitcoin/`:

- After Send, Bitcoin is an on-chain address, LNURL, Lightning address, BOLT11 invoice, or BOLT12 offer. A QR scanner sits at the top left of the mobile app.
- Sending from the cash balance applies a 1% spread. Sending from the bitcoin balance charges network fees only. Lightning settles in seconds; Strike says it passes the network fee through with no extra charges. On-chain delivery is a choice: Priority about 10 minutes at a higher fee, Standard about 1 hour at a lower fee, Flexible about 24 hours at zero fee.
- Sending to another Strike user is Username, typed or picked from contacts. Strike saves anyone already paid. Removal is Account, then Contacts, swipe left.
- A payment request appears on the matching balance tab. Unwanted requests can be blocked from the request. Blocked users are under Account, Profile, Blocked users.

"How do I receive cash or bitcoin?" (no date printed), `https://strike.me/support/how-do-i-receive-cash-or-bitcoin.md`:

- A Lightning address is shared from the person icon. Receive can also make a Lightning invoice or a new on-chain address. Receiving bitcoin has no fee. Automatic conversion to cash on arrival applies a 1% spread.
- Requesting from another Strike user is Receive under that balance, then Username.
- A public tipping page is `https://strike.me/@username`. Receive currency (cash or bitcoin) is under Account, bitcoin, Receive currency.

The Payments page, `https://strike.me/pay.md`, says send and receive of cash or Bitcoin in seconds, between people and businesses, in over 100 countries. No separate date is printed.

### OKX

Pay FAQ, published 28 April 2025, updated 2 September 2026, `https://www.okx.com/en-us/help/pay-faq`:

- Pay sends and receives USDC, USDG, and USDT on X Layer, with no additional fees, in the OKX app only. The US page says this information may not apply to all customers.
- Pay any contact: Pay mode, Pay, Pay any contact, choose the stablecoin and amount, then name, phone number, or email, or scan a QR code.
- A person without an OKX account can be paid by phone or email. Imported contacts can be searched by name, phone, or email. The recipient has 48 hours to create an account. If they do not, the funds return to the sender. A payment to the wrong person returns after 48 hours if it has not been accepted. An accepted payment cannot be reversed.
- Receive: a push notification, or a payment link by SMS or email. Identity verification is required before the funds can be claimed. An existing Pay balance shows the funds automatically. An OKX user without Pay must activate Pay. A non-user must create both accounts.
- Pay a wallet address is a separate path: exchange or platform, or an unhosted wallet, then a network and address. That path is recorded under Do not copy.
- "How can I send/accept payments in IM on Pay?", published 28 April 2025, updated 26 August 2026, `https://www.okx.com/help/how-can-i-send-payments-in-im-on-pay`: Message, new message by phone number or by syncing phone contacts, then Pay inside the chat. The friend must accept before the payment expires, or it returns. Receive is the payment icon in the chat, then Receive. Group chats use gifts instead.

A page that names a request action, separate from a payment link or an in-chat payment the other person must accept, was not found.

### Robinhood

"What's a Robinhood spending account?", `https://robinhood.com/us/en/support/articles/spending-pay-by-check/` (the page's own note): as of 14 June 2024, Pay by Check is no longer available. Outstanding checks could be processed until 28 June 2024. The same page says a spending account can send and receive money through Pay & Request, and can earn up to $25 when inviting friends. A current article that walks the Pay & Request steps was not found. The scam article "How to identify and report scams", `https://robinhood.com/gb/en/support/articles/how-to-identify-and-report-scams/`, still names Pay & Request and says to contact support for a suspected payment scam there.

"Money movements", `https://robinhood.com/us/en/support/articles/robinhood-banking-money-movements/`: send to someone else's bank with routing and account number. Add a recipient as Individual or Business, enter the name, routing number, account number, and checking or savings, and save them to an address book. The first send to a new recipient asks for a text code. Recently deposited funds must be fully settled before they can be sent to another person. Sending to another person's account is ACH only. The page says wire transfers and cross-border transfers are not supported for this feature.

Robinhood Wallet, "Send, receive, and swap crypto", `https://robinhood.com/us/en/support/articles/send-receive-and-swap-crypto/`, is a self-custody send and receive. It is recorded under Do not copy, not as the spending Pay & Request flow.

## Person-to-person trades

### OKX

"How do I sell crypto on OKX P2P trading?", published 22 August 2023, updated 15 September 2026, `https://www.okx.com/en-us/help/how-do-i-sell-crypto-on-okx-p2p-trading`:

- P2P is a marketplace to buy from or sell to other users in local currency. The US page says the article may not apply to all customers, and that a user who has completed identity verification can only use the fiat currency of their registered region.
- Express and the offer list are both documented. On the app, P2P trading, then P2P, then Sell, filter by payment method and amount, pick an offer, enter a quantity, and confirm. The order has a chat window. The seller checks that the payment arrived, then Release crypto. OKX holds the crypto until the seller releases it.
- Merchants on this marketplace post the payment methods they will accept. The page says verified merchants may receive payment via a non-real-name account.
- Buying through P2P may trigger a T+N hold. The page says risk control may restrict selling, withdrawals, and DEX trading for 3, 7, or 15 days, and that the page itself shows the exact duration. A 24-hour protection period after a password, email, phone, authenticator, or passkey reset blocks selling and withdrawals.
- Releasing crypto at or above 10,000 USDT requires a passkey plus 2FA when a passkey is linked, and 2FA when it is not. Below 10,000 USDT the linked-passkey case can use passkey or 2FA. Those thresholds are OKX's.

"What should I do if I encounter payment issues when buying crypto?", published 24 March 2023, updated 15 September 2026, `https://www.okx.com/help/why-can-not-you-pay-when-buying-cryptos`: if a bank card cannot pay, message the seller in the in-app chat, switch method, cancel, or dispute. Several unpaid cancellations in a day can restrict buying. The page says a dispute can be submitted within 72 hours when the seller is the cause.

### Strike

No first-party page found for a public offer board where two customers post a price and chat through an order. Username send and request, above, are payments to a known person. Large trades are the Private OTC service, below, not a public person-to-person marketplace.

### Robinhood

No first-party page found for a person-to-person trade of an offer against another customer.

## Bill pay, and sending to a bank abroad

### Strike

"How do I pay bills?" (no date printed), `https://strike.me/support/how-do-i-pay-bills.md`:

- Account, then Bill pay, gives account and routing numbers. The biller is given those numbers as a checking account. A biller that uses Plaid can be linked by searching for Strike.
- Unlimited billers. A single bill can be up to $95,000. That cap is Strike's.
- The default source can be cash, a line of credit, or bitcoin. If the default falls short, Strike draws the rest from another balance. A bitcoin default sells enough bitcoin to cover the bill, charges trading fees, and adds the sale to the tax form.
- Pending deposits and funds reserved for target orders are not counted. A bank deposit can take up to 5 business days. A charge under $2, including a biller's micro-charge, comes from cash even when the default is bitcoin. With no cash, a charge under $2 can make the cash balance negative until a cash deposit clears.

"Announcing Strike Bill Pay", Jack Mallers, 5 December 2024, `https://strike.me/blog/announcing-strike-bill-pay.md`, is the earlier announcement of the same account-and-routing flow. "Announcing Business Bill Pay", Strike Team, 5 August 2025, `https://strike.me/blog/announcing-business-bill-pay.md`, says business accounts pay vendor invoices, credit cards, and utilities the same way. The live business page, `https://strike.me/business`, lists bill pay among treasury, payments, and lending in one business account. No date is printed on that page.

"Can I send money globally?" (no date printed), `https://strike.me/support/can-i-send-money-globally.md`:

- The recipient gets local currency in a bank account, debit card, or mobile money account. The recipient can be the sender, a friend or family member, another third party, or a merchant.
- Available to individual customers except those in Hawaii, New York, Europe, or the UK. Not available for business accounts anywhere.
- The page's own country table, Strike's minimum and maximum per send:

| Country     | Min | Max    |
| ----------- | --- | ------ |
| Benin       | $5  | $1,000 |
| Colombia    | $5  | $1,000 |
| Ghana       | $5  | $1,000 |
| Guatemala   | $1  | $1,000 |
| Ivory Coast | $5  | $1,000 |
| Kenya       | $5  | $1,000 |
| Mexico      | $1  | $1,000 |
| Nigeria     | $5  | $1,000 |
| Philippines | $1  | $850   |
| Rwanda      | $5  | $1,000 |
| Senegal     | $5  | $1,000 |
| Togo        | $5  | $1,000 |
| Vietnam     | $6  | $500   |

- Steps, from the Cash tab: Send, Send Globally, country, phone number and receiving details, amount or Switch Currency, review, confirm. If the recipient already has an account with Strike's local partner, the phone number can be enough. Otherwise the page asks for name, bank, and account number, or a mobile-money provider.
- The all-in rate is calculated at send, from partner rates plus Strike's margin. The page says there are no fees on top of that. A transfer can finish in seconds. Timing varies. If the cash has left and the recipient does not have it within an hour past the estimate shown at confirm, the page says to contact support.
- The page says the rail is bitcoin's Lightning Network, and that the sender and recipient only handle cash. The Lightning part is under Do not copy.
- Contacts for these recipients: the learn article "How to use Send Globally", `https://strike.me/learn/how-to-use-send-globally/`, says the list is under Account, Contacts, and that a contact is removed by swiping left.

The product page `https://strike.me/sendglobally/` (search date 8 July 2026) describes the same product: cash sent, local currency received, into a bank or mobile-money account.

### OKX

No first-party page found for paying a household biller, or for depositing local currency into a bank account abroad. Pay, above, moves stablecoins to a person. P2P, above, settles in the fiat of the customer's registered region through that customer's own bank or wallet app.

### Robinhood

No first-party page found for bill pay. The spending-account page, above, says Pay by Check ended on 14 June 2024. Sending to another person's bank, above, is domestic ACH, and the page says cross-border transfers are not supported for that feature.

"What is a Remittance?" on Robinhood Learn, updated 18 June 2020, `https://robinhood.com/us/en/learn/articles/465AMLm1Oo1M1rlMIdmmRY/what-is-a-remittance/`, defines the word. It does not say Robinhood sends money to a bank abroad.

## Business merchant desk

### Strike

The business product page, `https://strike.me/business` (no date printed; the page schema URL is `https://strike.me/int/en/business/`): one business account for treasury, paying vendors, borrowing against bitcoin, and accepting customer payments. The payments block on that page names point of sale, online checkout, invoicing, and settlement to USDT or bitcoin. It says international payments arrive in seconds. The same page says most businesses are onboarded within 24 hours, and that the account is available in 100+ jurisdictions.

"How do I create an account?", `https://strike.me/int/en/support/how-do-i-create-an-account/`: the person chooses Personal or Business. A business also submits the company name, location, website, intended use, and documentation for each owner. An owner who already has a personal account does not re-verify if that identity document has not expired. If both accounts are verified, the app switches between them without a logout. Approval is usually seconds or minutes unless the account goes to manual review. Over 24 hours, the page says to contact support.

"How do I accept bitcoin payments on my Shopify store?", `https://strike.me/support/how-do-i-accept-bitcoin-payments-on-my-shopify-store.md`: a Shopify app. After the business account is verified and signed in, checkout offers pay with bitcoin. The customer is redirected to a screen, Strike shows a Lightning invoice for the purchase amount, the customer pays from a Lightning wallet, the payment is converted to cash in the Strike account, and the customer returns to the store. An expired invoice can be generated again. Completed transactions are in the mobile or web app.

"What is the Strike API?", learn article, `https://strike.me/learn/what-is-the-strike-api/`: programmatic exchange, send, receive, directing a payment to another Strike username, and cash payouts to US bank accounts by ACH or wire. Receiving is an on-demand Bitcoin address or Lightning invoice. The article says to start by writing to partners@strike.me. It gives examples of amounts the API can move, including under $0.01 and over $10,000, as Strike's description of the API, not as a limit table.

"Can I use my account through an API?", `https://strike.me/int/en/support/can-i-use-my-account-through-an-api/`: keys are generated in the web app with scopes the customer defines. The page says API calls transact against real account balances, and that a sandbox is available for testing without real funds. The same page lists invoices, receive requests, payment quotes, bank payouts, and webhooks. It also says the API can direct an AI agent to act on the account. That is an API use, not a separate Agents room.

Strike's API docs, "Sandbox", `https://docs.strike.me` sandbox guide as published at `https://strike.me/sandbox/` in this read: the sandbox uses simulated cash balances and testnet bitcoin, which carry no monetary value. The FAQ "Does the Strike API have a sandbox environment?", `https://strike.me/faq/does-the-strike-api-have-a-sandbox-environment/`, says the same and says to contact partners@strike.me to have the sandbox account set up. The live key path is the one that moves real balances. The sandbox is the documented mode that does not.

"Announcing Strike Business", Sam Feder, 14 March 2024, `https://strike.me/blog/announcing-strike-business.md`: the business dashboard can track activity and generate and export detailed reports for accounting. The current history article, `https://strike.me/support/where-can-i-find-my-transaction-history.md`, says Activity can be searched, filtered, and exported, and that Account, Documents, holds monthly and annual statements.

No first-party page found for a merchant product that bills a customer on a subscription. The API operation named "Create subscription", `https://docs.strike.me` as surfaced at `https://strike.me/api/create-subscription`, is a webhook subscription. The page says at most 50 of those. It is not a customer billing plan. "Announcing Business Bill Pay" uses "software subscriptions" to mean bills the business pays, not plans it sells.

No first-party page found that uses the words payment link as a merchant object. The pages that do exist for getting paid are the username page `https://strike.me/@username`, a Lightning invoice, the Shopify checkout, and an API invoice.

### OKX

Pay, above, is person-to-person stablecoin transfer, including a payment link. P2P, above, has marketplace merchants who post ads. No first-party page found for a business checkout, an invoice a merchant sends, a subscription the merchant sells, an accounting export for that desk, or a developer mode whose keys cannot move live money.

### Robinhood

No first-party page found for a merchant desk of links, checkout, invoices, subscriptions, reports, or a developer mode that cannot move live money.

The footer of Robinhood's own help pages links Connect at `https://robinhood.com/us/en/on-ramp` and an API at `https://docs.robinhood.com/crypto/trading`. "Robinhood Connect", `https://robinhood.com/us/en/support/articles/robinhood-connect/`, as read in this pass, is an on-ramp and off-ramp for crypto, with Robinhood's own limits on that article (including a stated crypto-transfer cap of $5,000 or 10 transfers in 24 hours, and debit-card deposit caps). It is not a checkout, invoice, or subscription desk. The API docs page was not opened past the link, so this note does not describe a sandbox there.

Sending to a recipient marked Business, in "Money movements" above, is a bank transfer to someone else's account. It is not a merchant desk.

## Private

### Strike

The live Private page, `https://strike.me/private` (schema URL `https://strike.me/int/en/private/`; no date printed; read 5 October 2026), calls it concierge bitcoin services for buying and borrowing at size. The page's own blocks:

- A dedicated relationship manager, by phone or email.
- OTC execution for block trades and size that would move a market.
- Higher limits. The page's words: "Buy, sell, borrow, and withdraw at any size. Limits set per account, not per tier."
- One contact for a loan, a custom rate on a large bitcoin order, and quarterly statements, year-end summaries, and on-demand exports.
- Entry is a short form, then a call. The page says Strike reaches out within one business day. The buttons are Schedule a call (`https://strike.me/int/en/schedule/`) and private@strike.me. Step two on the page is "Meet your relationship manager."

"Announcing Strike Private", Jack Mallers, 5 October 2023, `https://strike.me/blog/announcing-strike-private.md`: for high-net-worth individuals, businesses, family offices, and institutions. The post says it was then available for a select number of clients, that access would expand on a rolling basis, and that getting in is an email to private@strike.me. It says eligible clients get no purchase limits, custom pricing, and the same team. It is not described as a separate app.

"How to buy a lot of bitcoin using Over-the-Counter", `https://strike.me/learn/how-to-buy-a-lot-of-bitcoin-using-over-the-counter.md`: Strike Private is the OTC service, connected to the Strike account the client already has. The page says Private has no limit on the amount or frequency of bitcoin trading, and that a client can ask private@strike.me for a custom account limit increase so larger volume can also be traded in the app. It says that, by default, users can deposit unlimited cash by wire or direct deposit where those features are supported. The page describes large orders in the general sense of hundreds of thousands and millions of dollars. Those phrases are the article's description of why people use OTC. They are not a published Strike cutoff.

"How do I buy or sell bitcoin?", the article now served at `https://strike.me/int/en/support/how-do-i-buy-or-sell-bitcoin/` and at the old limits addresses: unlimited trades of up to 2.500.000 USDT each on the app, or contact Private for a larger transaction. The buy product page, `https://strike.me/buy.md`, says up to $2.5M per purchase, with unlimited purchases. Both sentences are Strike's, on those two pages, read the same day. This note does not pick one.

A customer quotation on the Private page says "I did the $5m loan." That sentence is the customer's, printed by Strike. It is not a limit Strike publishes.

The Private page also offers withdrawal to a wallet the client chooses, or holding with Strike. Self-custody is under Do not copy.

### Robinhood

Robinhood Concierge, `https://robinhood.com/us/en/concierge/` (no article date; read 5 October 2026):

- The page's heading: "Beyond $1M, it's concierge service."
- A dedicated expert, called a relationship manager, who knows the account. Priority support by text, chat, or call. The page says there is no waitlist and no application in review. Entry is a form, Request a call. The page says a qualifying person typically hears back within a day, and that Concierge will also call out first.
- Who qualifies, in the page's FAQ: customers with $1M+ across their Robinhood accounts. "A family office starts at $25 million. Concierge starts at one." If the balance dips, the page says full access remains for 90 days. Those figures are Robinhood's.
- The page says Concierge is not yet Robinhood's wealth-management product. It points managed portfolios at Robinhood Strategies, which a Concierge client can hold beside self-directed accounts, with the same representative.
- Unlimited wires at zero fees. The page says the industry charges $25–$50 per wire and that Robinhood charges $0. "Transfer types", `https://robinhood.com/us/en/support/articles/transfer-types/`, says wire withdrawals are $25 and free for Robinhood Concierge. Both lines are Robinhood's, on those two pages.
- The page does not describe a large order worked off the public book, or a trading limit set per client. No first-party page found for those two Private items on Robinhood.

"Concierge Tax and Estate Services", `https://robinhood.com/us/en/support/articles/concierge-tax-estate/`: a limited pilot, not the standing Concierge relationship. The cutoff is under Do not copy.

### OKX

No page was found that uses the word Private for a relationship a team opens.

"What's OKX VIP and how do I qualify for it?", published 14 August 2025, `https://www.okx.com/help/whats-okx-vip-and-how-do-i-qualify-for-it`: higher tiers, lower fees, and a dedicated account manager. After VIP, the relationship manager is reached from the VIP icon at the upper left of the app. The page says the tier thresholds are on the official VIP tier page and are updated daily. This read did not open that tier table, so no tier number is copied from it.

"VIP-Level Support, Now Available to High-Value Users", published 8 April 2026, `https://www.okx.com/help/notice-of-expanding-the-scope-of-our-vip-customer-service`: from that date, a current asset balance or a 30-day average of 30,000 USD equivalent or above gets the priority customer-service channel and the same response priority as VIP, including a dedicated channel and relationship-manager services. Full VIP status, the notice says, assigns a dedicated service group. The 30,000 USD line is OKX's.

"OKX OTC Structured Products FAQ", published 26 May 2026, updated 26 August 2026, `https://www.okx.com/help/okx-otc-structured-products-faq`: custom products for VIP clients. The relationship manager can match parameters. The page's minimum investment is 100,000 USDT or 1.5 BTC. Self-serve is App Homepage, Explore, OTC Products. Customization by the relationship manager is "available in select countries/regions only."

"OKX Institutional", `https://www.okx.com/institutional`: a contact form for institutions, plus request-for-quote OTC liquidity. The page says products on it may not be available in all jurisdictions. It is a public sales page, not a client relationship inside the app.

The Australia white-glove OTC agreement, published 12 May 2026, `https://www.okx.com/en-eu/help/au-white-glove-otc-user-agreement`, defines Relationship Manager as the OKX representative assigned for that service, and the service as a request-for-quote desk. It is a legal agreement for that Australian service, not a global product page.

## Help for everyone, and help that shows the manager

### Strike

Support articles end with two blocks. "Have an account?" says the fastest support is a message from the help center in the app, plus support-global@strike.me on the international pages. "Private customer?" says to email the account manager directly, at private@strike.me. Read on the send, receive, create-account, and buy-or-sell articles, 5 October 2026.

"How do I contact support?", `https://strike.me/support/how-do-i-contact-support.md`: everyone else uses Account, Help, picks a topic, and writes the issue. Replies sit under Support on that screen. Email is from the address on the account. The page says not to put identity documents in the first email. For white-glove service, email private@strike.me. A US account that is eligible can request a callback from Support on the mobile Account screen. The app shows a full-screen confirmation when the call is real. A call with no confirmation screen, and no anti-phishing code, is a hang-up.

### Robinhood

"How to contact support", `https://robinhood.com/us/en/support/articles/how-to-contact-support`: chat 24/7, phone 7 AM to 9 PM ET, with brokerage administrative phone support on weekdays. In the app: Account, Menu or Settings, Robinhood Support, Contact Support. On the web: Account, Help, Contact Support. Crypto or spending-account complaints use a different number on that page, 888-275-8523. The informational number 650-761-7789 is not the line that reaches an agent.

Concierge, above, is the path that shows one representative, by phone, text, email, or appointment, and says that desk will call the customer. The general support article does not mention that person.

### OKX

The help center is the page everyone gets, and many articles end with the line that the content may cover products that are not available in the reader's region. VIP and the high-balance notice, above, add a dedicated channel and a relationship manager. The Europe VIP-tier notice, published 25 September 2026, `https://www.okx.com/en-eu/help/important-notice-upcoming-adjustment-to-vip-trading-volume-tiers-europe`, tells institutional and VIP clients to use the relationship manager in the app or institutional@okx.com, and tells other clients to use customer support.

## A request to buy a new listing as it opens

Robinhood's own IPO Access pages are the source. Read 5 October 2026.

"About IPO Access", `https://robinhood.com/us/en/support/articles/ipo-access/`: IPO Access lets a customer buy shares at the IPO price as the stock becomes available to the general public. Allocation is random. Each eligible request has the same chance of all, some, or none of the shares requested. The number of shares requested does not change that chance. Robinhood's role varies: underwriter on some offerings, distributor of a bank's allocation on others. A request is not a guarantee. There is no added fee. The customer pays the IPO price for the shares allocated. Robinhood only offers IPOs it participates in. During the quiet period, news is blocked on the company's stock page.

"How to sign up for IPO Access", `https://robinhood.com/us/en/support/articles/how-to-sign-up-for-ipo-access/`: most customers are eligible. Retirement accounts, multiple individual investing accounts, and custodial accounts are not. The About page also excludes joint accounts and managed accounts. People restricted under FINRA Rules 5130 and 5131, including certain broker-dealer employees, portfolio managers, and immediate family in the cases the page names, may be unable to participate. Selling allocated shares within 30 days is flipping and may block IPO Access for 60 days. Those windows are Robinhood's.

The About page also says: a conditional offer to buy needs eligible buying power for the full amount (100% buying-power requirement). If the final price stays within 20% of the indicated range, or the final deal size stays within 20% of the disclosed size, the request does not have to be reconfirmed, and it can still be cancelled until the confirmation window closes. Unused buying power from a partial fill is returned on listing day before trading begins. Shares can be sold once secondary trading begins. Before trading begins, limit orders can be placed. Other order types wait until trading begins. Options are not available for at least 3 business days, and sometimes 30 to 60 days. Those intervals are Robinhood's.

No first-party page found at OKX or Strike for a request to buy a new stock listing at the IPO price. OKX Jumpstart, below, is a token sale and a stake-to-earn event, not that request.

## Academy, agents, quant, launch, a market catalogue, prediction markets, mining, and token

### Strike

- Academy: Strike Learn, indexed at `https://strike.me/llms.txt` and `https://strike.me/learn.md`, is guides and FAQs about Bitcoin, Lightning, and Strike products. It is an article library, not a course with progress.
- Agents: no first-party page found for a customer room named Agents. The API support article, above, says a customer can direct an AI agent through the API. The blog index lists engineering posts about Strike's own software factory. Those posts were not used as a customer room.
- Quant: no first-party page found.
- Launch: no first-party page found for issuing or listing a new asset.
- Market catalogue: no first-party page found. The product pages describe bitcoin, not a list of listings.
- Prediction markets: no first-party page found.
- Mining: "What is Bitcoin mining?", linked from the Learn index, is an explainer. No first-party page found for a mining product.
- Token: no first-party page found for a platform token.

### Robinhood

- Academy: the help-page footer links Learn at `https://robinhood.com/learn` and Snacks at `https://sherwood.news/`. The Learn remittance article, above, is one page in that library. A course product was not found.
- Agents: "Robinhood Agents", `https://robinhood.com/us/en/agents/`. The page says choose a model, set controls, and the agent can scan the market, review the portfolio, build watchlists, and trade. Agent Loops, research and trade on a schedule, are marked "Coming soon." The page says the agent trades from a dedicated account, trade approvals default to on, and external agents can connect by MCP. The disclosure on that page says agentic trading can place orders without a tap on each one, that the customer can lose the entire investment, and that once data is shared with a chosen AI provider it leaves Robinhood. Robinhood's newsroom, "HOOD Summit 2026", 29 September 2026, `https://robinhood.com/us/en/newsroom/hood-summit-2026`, says Robinhood Agents are built into the app, that a separate agentic account is opened, that the customer sets the strategy and the limits, and that the agent can only use the funds in that dedicated account. The same note says manual approval of each trade defaults to on. It also gives Robinhood's own counts for the earlier agentic-trading launch: over 150,000 customers had opened agentic trading accounts, and agents were using Robinhood's tools almost 30 million times a day. Those counts are Robinhood's.
- Quant: no first-party page found for a quant studio or a backtest room. Robinhood Strategies, linked from the same footer, is the managed-portfolio product named on the Concierge page. Legend is the trading desk, not a quant room.
- Launch: no first-party page found for a customer room that issues an asset. IPO Access, above, is a request to buy shares of someone else's listing.
- Market catalogue: no first-party page found under that name. The public footer lists Invest, Crypto, and the other products. That is a product index, not a room of the customer's own listings.
- Prediction markets: `https://robinhood.com/us/en/prediction-markets/`, read 5 October 2026, is a live board. Categories on the page include sports, elections, economics, climate, commodities, crypto, and others. Contracts are event contracts. The page footer says event contracts are offered by Robinhood Derivatives, LLC. The board shows live prices as percentages. No separate help article for the rules of that board was opened in this pass, so this note does not add rules that were not on the page.
- Mining: no first-party page found.
- Token: no first-party page found for a platform token. The footer links Crypto, Earn, and Staking as their own products.

### OKX

- Academy: OKX Learn is the library that published "What Is OKX Pay, and How Does It Work?", 29 August 2025, updated 2 October 2025, `https://www.okx.com/en-us/learn/what-is-okx-pay`. The help center is the operating manual. No first-party page found for a course product with enrollment.
- Agents: "What is Agent Trade Kit?", published 29 April 2026, updated 26 August 2026, `https://www.okx.com/help/agent-trade-kit-faq`. It is web only, under Trade, then Agent Trade Kit. Natural language can place spot, futures, margin, and options orders, and can set grid, DCA, and algo orders. It can also subscribe to Earn products. "OKX AI 101", published 4 May 2026, `https://www.okx.com/help/okx-ai-101`, says an AI trading strategy is reviewed as a prompt before backtest or live, and that Agent Trade Kit connects an assistant to the OKX account. The same article describes on-chain execution through OnchainOS. That chain path is under Do not copy.
- Quant: no first-party page found for a room named Quant. "OKX to list QUANTUSD X-Perp", published 1 October 2026, `https://www.okx.com/help/okx-to-list-quantusd-x-perp`, is a listing of a contract. It is not a quant studio. Trading bots and the AI strategy above are the tools OKX documents for automated trading. "Quick Guide to AI Trading Bot" describes a strategy in ordinary language, with no coding. The full article opened on a Brasil URL and was not re-read on the US site.
- Launch: "What's Jumpstart and how do I earn from it?", published 17 July 2024, updated 26 August 2026, `https://www.okx.com/en-us/help/what-is-jumpstart-how-do-i-get-involved`. Jumpstart is a launchpad for new projects, with two event types, Mining and On Sale. Mining on that page means staking BTC, ETH, or another required coin to receive the new token, with the stake locked. On Sale means buying the token at a discount to the later exchange price. On the app the path is Explore, then Jumpstart. On the web it is Grow, then Jumpstart. Some events require an application to join. Past events on that page name participant counts and stake totals. Those figures are OKX's examples, not a standing limit.
- Market catalogue: the P2P marketplace, above, is a catalogue of offers. The institutional page links "View crypto and pairs" for spot, futures, and options instruments. No first-party page found for a room of the customer's own listings.
- Prediction markets: "Event Contracts FAQ", published 16 April 2026, updated 3 September 2026, `https://www.okx.com/help/event-contracts-faq`. An event contract pays 1 USDT if the outcome matches the side the customer bought. The customer buys Up or Down. The price is the market's probability. The XAU gold contract launched 16 June 2026. "Outcomes User Guide", published 2 June 2026, updated 11 September 2026, `https://www.okx.com/help/outcomes-user-guide`, is a separate points product: no real funds, shares settle in campaign points, entered from Orbit, then Outcomes. The Outcomes FAQ says some regions cannot see the entry, including the United Kingdom, Singapore, Japan, Canada, Hong Kong, Iceland, and the US states of Florida and Rhode Island, and that the full list is in platform announcements.
- Mining: Jumpstart Mining, above, is a stake. No first-party page found for a customer hash-rate pool.
- Token: Jumpstart pages stake and reward OKB alongside BTC, ETH, and other coins. No first-party page found, in this read, for a separate customer room whose only job is the platform token.

## When a feature is unavailable, above a limit, or not offered in a region

### Strike

- "Where is Strike available?", `https://strike.me/support/where-is-strike-available.md`, says individuals and businesses in 98 countries, and lists them, including the United States as all 50 states, D.C., and Puerto Rico. The individual, business, and private marketing pages say 100+ countries. Both were read 5 October 2026. This note does not merge them into one count.
- Send Globally, above, is refused for business accounts everywhere, and for individuals in Hawaii, New York, Europe, or the UK, even where an account exists. A send fails, on that page, for an insufficient cash balance, an amount below the minimum, an amount above the personal limit or the country maximum, a bad recipient detail, or a recipient who cannot receive the feature.
- Bill pay uses available balance only. A bill above $95,000 is outside the cap on the bill-pay article. A charge under $2 is taken from cash.
- The buy page caps one purchase at $2.5M and says purchases are unlimited. The buy-or-sell support article tells the reader to contact Private for a trade above the app amount it states. Private's own page says the limit is set per account.
- Create account: 18 or older, and residence or a business registration in a supported country. The country chosen at signup is changed by contacting support, not in the form. A phone number must be from a supported country.
- The international buy-or-sell page's footer says credit products may be available on request in certain jurisdictions, in USDT, and that eligibility can vary by location, customer type, and loan amount at the lender's discretion. That sentence is on the El Salvador entity footer of that article.

### OKX

- Help articles, including Pay and P2P, print "This information may not apply to all customers" and a control "to check if the products, features, rules, and terms in this article apply to you." The standard disclaimer says the content may cover products that are not available in the reader's region.
- A non-US help URL opened from this read showed a banner: in the United States, switch to the United States site for products available in that region.
- Pay eligibility depends on location. Activation requires a personal account, identity verification, a passkey, and a country that is not on the restricted list linked from the Pay FAQ. The app has to be current. Pay is not on the web. Android without Google services cannot create the passkey the FAQ requires.
- P2P requires identity verification and a phone number. The sell article says only the fiat of the registered region. Repeated cancellations restrict buying for the day, and the page says that restriction cannot be lifted early. A quote can come back invalid or expired. Assets can be frozen until block confirmations complete.
- Outcomes hides the entry point in an unsupported region. Event-contract and listing announcements say to check availability in the app.
- Jumpstart events print their own country exclusions. The SPURS notice, 20 October 2023, limited participation to East Asia with named exclusions. The ANIME notice, 17 January 2025, excluded Hong Kong and Korea. Those are the events' rules, not a standing global list.
- VIP OTC customization is "select countries/regions only." Below the stated minimum, the structured-product FAQ does not offer the product.
- The QUANTUSD listing note, 1 October 2026, says to check the token or product in the app for the reader's region.

### Robinhood

- IPO Access refuses retirement, joint, custodial, managed, and multiple individual accounts, and the restricted persons named above. A request can be filled in part or not at all. Flipping can block the next requests.
- "Transfer types" says the limits and how often a customer can transfer are specific to the account, that limits apply across investing, spending, and retirement together, and that there is no direct action to change them immediately. The page's own table, Robinhood's, includes standard ACH deposits up to $500k and withdrawals up to $250k, wire deposits unlimited, wire withdrawals varying between $50k and unlimited with a $25 fee, debit-card deposits up to $25k and withdrawals up to $15k, and real-time payments deposits up to $25k and withdrawals up to $50k. The page says the customer's own limits are under Transfers, View your transfer limits.
- Crypto withdrawals, "Cryptocurrency wallets" help: deposit limits stay unlimited, withdrawal limits vary by verification, history, and payment method, and cannot currently be raised by a manual request. The customer can view them in the app under Account, Crypto.
- Concierge access, on Robinhood's page, requires $1M+ and ends 90 days after the balance drops below that. The tax-and-estate pilot has its own window, under Do not copy.
- Pay by Check is the discontinued feature, with the dates above. Sending money to another person does not offer a wire or a cross-border transfer.
- Canada funding, "Fund your account", `https://robinhood.com/ca/en/support/articles/fund-your-account/`, says Interac and wires, not EFT/ACH, and prints Canada's own Interac limits, including a $10 CAD minimum, a $15,000 CAD maximum per request, and 3 deposits per 24 hours. A bank that blocks an Interac transfer is a bank-side limit Robinhood's page says it cannot change.
- UK withdrawals, "Withdraw money from Robinhood", `https://robinhood.com/gb/en/support/articles/withdraw-money-from-robinhood/`, print a £250,000 transaction maximum, a £0.01 minimum, and 5 withdrawal attempts a day. An account restriction can block a withdrawal until support clears it.

## The team door

No first-party page found, at OKX, Robinhood, or Strike, that describes an internal operator console: kill-switches, a launch sequence, a jurisdiction desk, a ledger desk, or a list of which clients are private.

The public pages that are easy to mistake for that door are customer or sales pages. Strike's business dashboard is the business customer's own screen. Robinhood Concierge and Strike Private are the client's relationship, entered by a form or an email, not a staff list. OKX Institutional is a contact form. OKX's relationship manager is inside the VIP client's app.

## The public front

### Strike

`https://strike.me/llms.txt`, read 5 October 2026, is Strike's own index of the public site. The home line is buy, sell, borrow, get paid, pay bills, and send money worldwide. The index lists About, Banking, Blog, Borrow, Business, Buy, Careers, Customers, Individual, Learn, Legal, Payments, Private, Referral, a sats converter, Book a time, and the Help center. Download is on the product pages (iOS, Android, and, on the individual page, web). Campaigns in this read are blog announcements, not a separate public door.

### Robinhood

The footer printed on Robinhood's own help and product pages, read 5 October 2026, is the public index: Invest, IPO Access, Predict, Strategies, Agents, Agentic Credit Card, Retirement, Gold, Crypto, Earn, Staking, Chain, Wallet, Connect, API, Legend, Options, Futures, Trading, Custodial, Ventures, Social, Banking, the credit cards, Concierge, Learn, and Snacks. Company links on the same footer: About us, Blog, Vendors, Press, Careers, Investor Relations, Support. Sign-in is inside the app and the site. This note does not describe a screen that was not opened.

### OKX

The public help center is `https://www.okx.com/help`. Product paths named on the pages above put Pay on the app home, P2P under Buy crypto, Jumpstart under Explore or Grow, and Agent Trade Kit under Trade. The institutional page is a public front for firms, with a contact form. Download, sign-in, and the marketing home were not given a separate article in this pass. Where a help article is the evidence, the article's own disclaimer is part of the public page: the product may not be offered in the reader's region.

## Do not copy

These are on the companies' pages. They are recorded so a later reader does not treat them as the Pay or More room. This section does not set a rule for any other product.

### The chain

- Strike's send, receive, Shopify checkout, and API generate on-chain addresses and Lightning invoices. Send Globally's own article says the transfer is converted to bitcoin, sent to a partner, and converted back.
- OKX Pay runs on X Layer. Pay's "pay a wallet address" path names exchanges and unhosted wallets. OKX AI 101 describes execution across chains through OnchainOS. P2P's hold can restrict DEX trading.
- Robinhood's footer links Chain and Wallet. The Wallet help article sends and receives on Robinhood Chain, Ethereum, Bitcoin, Solana, Dogecoin, Arbitrum, Polygon, Optimism, Binance Smart Chain, and Base.

### Self-custody

- Strike's individual page says withdrawal to any wallet is free, on-chain or Lightning, with no minimum. The Private page says withdraw to the wallet of the client's choice, hold with Strike, or both. The bill-pay article warns that an automatic withdrawal to self-custody can leave too little bitcoin for a bill.
- OKX Pay can pay an unhosted wallet, and names OKX Wallet, MetaMask, and Trezor as examples.
- Robinhood Wallet is a separate help section from the spending account and from brokerage transfers.

### Lightning

- Strike documents Lightning addresses, BOLT11 invoices, BOLT12 offers, Lightning settlement in seconds, and the Shopify invoice. Send Globally names Lightning as the rail between two cash balances.
- No first-party page found at Robinhood or OKX, in this read, that offers Lightning send or receive as a customer payment.

### A separate account

- Strike's create-account article is a Personal account and a Business account on one login, switched without a logout. They are two account types on Strike's page. Send Globally is refused on the business account. API keys transact against the real balance of the account that issued them. The sandbox is a different environment, with simulated cash and testnet bitcoin.
- OKX's P2P sell article tells the customer to pull funds from a Funding Account, a Trading Account, or Earn. Pay's FAQ says a Pay balance can be transferred to the exchange funding or trading account, and that the Pay balance counts toward a VIP asset assessment. The agent kit and the AI bots trade the OKX account. The page does not say they use a second pot.
- Robinhood's Agents page and the 29 September 2026 newsroom say the agent trades a dedicated agentic account and can only use the funds in that account. The help footer treats brokerage, crypto, spending, and credit as different legal entities. Concierge can sit across self-directed accounts and Strategies. "Transfer types" says limits are counted across investing, spending, and retirement together.

### A published cutoff

- Robinhood, "Concierge Tax and Estate Services": transfer or deposit at least $500,000 between 12 January 2026 and 15 March 2026, and hold $1 million or more. The 1% transfer match on that page is for ACATS into a self-directed taxable individual or joint account between 28 January 2026 and 15 March 2026, and the matched funds must stay at least 5 years to avoid a clawback. Enrollment closes when capacity is reached. Those dates and amounts are Robinhood's.
- Robinhood IPO Access: selling within 30 days can block participation for 60 days. Options on a new listing wait at least 3 business days, sometimes 30 to 60 days.
- Robinhood Pay by Check: ended 14 June 2024. Unprocessed checks were canceled after 28 June 2024.
- Robinhood Concierge: the standing relationship is $1M+ on Robinhood's page, kept for 90 days if the balance drops. That is a balance test, not the dated pilot.
- Strike Send Globally: not for business accounts, and not for individuals in Hawaii, New York, Europe, or the UK. Country maximums are the table above, Strike's.
- Strike bill pay: $95,000 on one bill, on the current help article.
- Strike app buys: the buy page says $2.5M per purchase. The buy-or-sell article says 2.500.000 USDT per trade and points above that to Private. Private's page says the limit is per account and that size can be any size.
- OKX, 8 April 2026: priority support at 30,000 USD equivalent. OKX OTC structured products: minimum 100,000 USDT or 1.5 BTC. OKX Outcomes: the region list on the FAQ, including Florida and Rhode Island. OKX Pay: 48 hours to claim, or the funds return.

## Sources

Read 5 October 2026 from the companies' own sites. A page date is included when the page prints one.

- Strike index: `https://strike.me/llms.txt`
- Strike Individual: `https://strike.me/individual`
- Strike Business: `https://strike.me/business`
- Strike Private: `https://strike.me/private`
- Strike Payments: `https://strike.me/pay.md`
- Strike Buy: `https://strike.me/buy.md`
- Strike, "How do I create an account?": `https://strike.me/int/en/support/how-do-i-create-an-account/`
- Strike, "How do I send cash or bitcoin?": `https://strike.me/int/en/support/how-do-i-send-cash-or-bitcoin/`
- Strike, "How do I receive cash or bitcoin?": `https://strike.me/support/how-do-i-receive-cash-or-bitcoin.md`
- Strike, "Can I send money globally?": `https://strike.me/support/can-i-send-money-globally.md`
- Strike, "How to use Send Globally": `https://strike.me/learn/how-to-use-send-globally/`
- Strike, "How do I pay bills?": `https://strike.me/support/how-do-i-pay-bills.md`
- Strike, "Where is Strike available?": `https://strike.me/support/where-is-strike-available.md`
- Strike, "How do I buy or sell bitcoin?": `https://strike.me/int/en/support/how-do-i-buy-or-sell-bitcoin/`
- Strike, "How do I contact support?": `https://strike.me/support/how-do-i-contact-support.md`
- Strike, "Where can I find my transaction history?": `https://strike.me/support/where-can-i-find-my-transaction-history.md`
- Strike, "How do I accept bitcoin payments on my Shopify store?": `https://strike.me/support/how-do-i-accept-bitcoin-payments-on-my-shopify-store.md`
- Strike, "Can I use my account through an API?": `https://strike.me/int/en/support/can-i-use-my-account-through-an-api/`
- Strike, "What is the Strike API?": `https://strike.me/learn/what-is-the-strike-api/`
- Strike, "How to buy a lot of bitcoin using Over-the-Counter": `https://strike.me/learn/how-to-buy-a-lot-of-bitcoin-using-over-the-counter.md`
- Strike, "Does the Strike API have a sandbox environment?": `https://strike.me/faq/does-the-strike-api-have-a-sandbox-environment/`
- Strike API, sandbox guide: `https://strike.me/sandbox/`
- Strike, "Announcing Strike Private", 5 October 2023: `https://strike.me/blog/announcing-strike-private.md`
- Strike, "Announcing Strike Business", 14 March 2024: `https://strike.me/blog/announcing-strike-business.md`
- Strike, "Announcing Strike Bill Pay", 5 December 2024: `https://strike.me/blog/announcing-strike-bill-pay.md`
- Strike, "Announcing Business Bill Pay", 5 August 2025: `https://strike.me/blog/announcing-business-bill-pay.md`
- OKX, Pay FAQ, 28 April 2025, updated 2 September 2026: `https://www.okx.com/en-us/help/pay-faq`
- OKX, "How can I send/accept payments in IM on Pay?", 28 April 2025, updated 26 August 2026: `https://www.okx.com/help/how-can-i-send-payments-in-im-on-pay`
- OKX, "How do I sell crypto on OKX P2P trading?", 22 August 2023, updated 15 September 2026: `https://www.okx.com/en-us/help/how-do-i-sell-crypto-on-okx-p2p-trading`
- OKX, "What should I do if I encounter payment issues when buying crypto?", 24 March 2023, updated 15 September 2026: `https://www.okx.com/help/why-can-not-you-pay-when-buying-cryptos`
- OKX, "What's OKX VIP and how do I qualify for it?", 14 August 2025: `https://www.okx.com/help/whats-okx-vip-and-how-do-i-qualify-for-it`
- OKX, "VIP-Level Support, Now Available to High-Value Users", 8 April 2026: `https://www.okx.com/help/notice-of-expanding-the-scope-of-our-vip-customer-service`
- OKX, "OKX OTC Structured Products FAQ", 26 May 2026, updated 26 August 2026: `https://www.okx.com/help/okx-otc-structured-products-faq`
- OKX, "Important Notice: Upcoming Adjustment to VIP Trading Volume Tiers in Europe", 25 September 2026: `https://www.okx.com/en-eu/help/important-notice-upcoming-adjustment-to-vip-trading-volume-tiers-europe`
- OKX Institutional: `https://www.okx.com/institutional`
- OKX, "What's Jumpstart and how do I earn from it?", 17 July 2024, updated 26 August 2026: `https://www.okx.com/en-us/help/what-is-jumpstart-how-do-i-get-involved`
- OKX, "Event Contracts FAQ", 16 April 2026, updated 3 September 2026: `https://www.okx.com/help/event-contracts-faq`
- OKX, "Outcomes User Guide", 2 June 2026, updated 11 September 2026: `https://www.okx.com/help/outcomes-user-guide`
- OKX, Outcomes FAQ, 20 May 2026: `https://www.okx.com/help/okx-outcomes-faq`
- OKX, "What is Agent Trade Kit?", 29 April 2026, updated 26 August 2026: `https://www.okx.com/help/agent-trade-kit-faq`
- OKX, "OKX AI 101", 4 May 2026: `https://www.okx.com/help/okx-ai-101`
- OKX, "What Is OKX Pay, and How Does It Work?", 29 August 2025, updated 2 October 2025: `https://www.okx.com/en-us/learn/what-is-okx-pay`
- Robinhood, "About IPO Access": `https://robinhood.com/us/en/support/articles/ipo-access/`
- Robinhood, "How to sign up for IPO Access": `https://robinhood.com/us/en/support/articles/how-to-sign-up-for-ipo-access/`
- Robinhood, "What's a Robinhood spending account?": `https://robinhood.com/us/en/support/articles/spending-pay-by-check/`
- Robinhood, "Money movements": `https://robinhood.com/us/en/support/articles/robinhood-banking-money-movements/`
- Robinhood, "How to contact support": `https://robinhood.com/us/en/support/articles/how-to-contact-support`
- Robinhood, "Transfer types": `https://robinhood.com/us/en/support/articles/transfer-types/`
- Robinhood Concierge: `https://robinhood.com/us/en/concierge/`
- Robinhood, "Concierge Tax and Estate Services": `https://robinhood.com/us/en/support/articles/concierge-tax-estate/`
- Robinhood Agents: `https://robinhood.com/us/en/agents/`
- Robinhood newsroom, "HOOD Summit 2026", 29 September 2026: `https://robinhood.com/us/en/newsroom/hood-summit-2026`
- Robinhood prediction markets: `https://robinhood.com/us/en/prediction-markets/`
- Robinhood, "Send, receive, and swap crypto": `https://robinhood.com/us/en/support/articles/send-receive-and-swap-crypto/`
- Robinhood, "Robinhood Connect": `https://robinhood.com/us/en/support/articles/robinhood-connect/`
- Robinhood, "Fund your account" (Canada): `https://robinhood.com/ca/en/support/articles/fund-your-account/`
- Robinhood, "Withdraw money from Robinhood" (UK): `https://robinhood.com/gb/en/support/articles/withdraw-money-from-robinhood/`
