# Coinbase, Kraken, and Krak pages the room map cites

Read 5 October 2026. The pages are the Coinbase, Kraken, and Krak entries in the Sources section of the room map. No other page of those products was opened. A news recap was not used. This note records what those pages say. It does not recommend a product rule. Figures below are the pages' own figures. Where a page does not say what happens when a price, a limit, or a partner is missing, this note says so.

## Coinbase vs Coinbase Advanced

https://help.coinbase.com/en/getting-started/other/coinbase-vs-coinbase-advanced

The page does not show a date.

The default Coinbase interface is for buying, selling, converting, sending, and receiving, including automatic or recurring buys. Coinbase Advanced is the professional desk on that same account: advanced order types (the page names limit, stop, and bracket), TradingView charts, a real-time order book and depth chart, API access, all Coinbase-listed pairs, spot pairs, perpetual futures, and free stablepair trading. The page also says Advanced offers derivatives, leverage, and high-throughput APIs in eligible regions.

The person switches with the Advanced toggle in the Coinbase app or on the website. The page says assets, history, and balances stay the same between both.

On the simple interface, the person sees a fixed price quote before the order. That quote includes fees and spread. Advanced uses a volume-based fee from 30-day trading volume across all order books and the asset balance on Coinbase. The page says Advanced includes no spread because the person deals with the order book.

The page does not say what happens when a price, a limit, or a partner is missing. It does not mention stocks or stock tokens.

## Coinbase Advanced dashboard

https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/dashboard-overview

The page does not show a date.

The desk shows a depth chart (bids, asks, and cumulative size), an order book in a ladder, an order panel for buy and sell, and an open-orders panel of maker orders that are posted and not filled, canceled, or expired. Order history is a separate control. The price chart has a time range, volume, candlesticks (open, high, low, close), and a line chart. The page says the chart is TradingView, with custom drawing tools, 104 indicators, and new chart types. It names RSI, EMA, SMA (the page's words are "smooth moving average"), and MACD as common indicators.

Sticky settings keep the last order-form choices on that browser: side (buy or sell), order type, and advanced settings such as time in force and execution type. The page says order-form settings do not persist across browsers or devices. Also saved across sessions, per market where noted: which of the depth chart or the price chart is the primary tab, order-book precision, and price-chart interval, chart type, indicators, and drawings.

A disclosure on this page says securities and investments are offered by Coinbase Capital Markets Corp, member FINRA/SIPC, and that those securities services are separate from digital-asset services of Coinbase Inc. and affiliates. It says SIPC does not apply to digital assets or cash held in the Coinbase Inc. account. The page does not describe placing a stock or stock-token order on this desk.

The page does not say what happens when a price, a limit, or a partner is missing.

## Advanced order types

https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/order-types

The page does not show a date. The title is "Understanding the order types." The heading is "Advanced trade order types."

The order panel lists:

- Market. Executes immediately at the current best available market price. It cannot be canceled. It may fill in parts at several prices. It is always a taker. The page says there is no guarantee it fills at the buy or sell price. For non-stable pairs, a market order stops once it would move the price more than 10 percent and returns a partial fill. Stable pairs use a 1 percent protection point.
- Limit. The person sets a minimum price; a buy pays that price or less, a sell receives that price or more. Shortcuts are MID, BID, and 1 percent or 5 percent off the most competitive price. At entry, a buy limit cannot be less than 75 percent or below the best bid, and a sell limit cannot be more than 900 percent or above the best ask. Those are the page's words. Execution is Post only (reject the whole order if any part would take) or Allow taker. Time in force is Good 'Til Canceled, Good 'Til Time, or Immediate or Cancel.
- Stop-limit. A stop price posts a limit order. The opening sentence says that when the market reaches the stop, the order triggers a sell. The steps say to choose Buy or Sell. The same 75 percent and 900 percent bands apply. Time in force adds Good 'Til Date: if the market is closed that day, the previous trade date is used. If the stop price is already met, the order triggers instantly.
- Bracket. For an existing position. Two prices sit on either side of the current price. The take-profit side rests as a limit. If it starts to fill, the stop-loss side is canceled. If the stop is hit first, the order becomes an aggressive limit and the take-profit side is canceled. Execution is Allow taker only. Time in force is Good 'Til Canceled or Good 'Til Date. When the stop hits, the limit is re-priced within 5 percent of the trigger (the page's sell example is a lower limit, and its buy example is a higher limit). The page says downside protection is not guaranteed in high volatility, and that a move of more than 5 percent before the re-price can leave the stop unfilled.
- Take profit / stop loss, attached to a market or limit order. It activates as the parent starts to fill, and only for the filled size. On spot, the page says this can be set only on the Buy side. It then behaves like a bracket. Execution is Allow taker only. Time in force is Good 'Til Canceled only. For spot, the new stop-limit price is 5 percent lower than the stop trigger. For perpetual futures, it is 1.5 percent lower for sells or 1.5 percent higher for buys, and filling stops if the contract leaves that range. For US expiring futures, the page says the new limit is inside the market's price band, and it points at a Coinbase Derivatives product reference for those bands. This note did not open that reference.
- TWAP. Splits a large order into smaller orders over a set period. The person sets a limit price, an amount, a start (now, or from 5 minutes to 5 days ahead), and a duration from 5 minutes to 7 days (the page also says 168 hours). Frequency and suborder size are calculated and cannot be edited. A suborder that cannot fill inside the limit has its remainder spread across later suborders. Each suborder starts as a passive limit at the best bid or ask and turns aggressive if the interval ends unfilled. The order runs until it fills, the duration ends, or the person cancels it. The maximum is 10 TWAP orders per market. On futures, a start during a closure waits for the reopen, and a duration that overlaps a closure pauses and then runs the full selected duration.

The page does not list a standalone stop that is not a stop-limit. It does not say "reduce only" or "fill or kill." It does not say the ticket shows a fee before send. It does not say the ticket refuses a blank price. A market order uses the current best available price. A limit, stop, bracket, attached exit, or TWAP requires a price the person sets, and the bands above reject a limit outside those ranges. The page does not say what the screen does when no market price exists. The page does not say what happens when a partner is missing.

The page says some countries have crypto/fiat pairs and others only crypto/crypto pairs. It does not mention stocks or stock tokens.

## Steps to send crypto

The room map cites https://help.coinbase.com/en/coinbase/trading-and-funding/cryptocurrency-trading-pairs/how-to-send-and-receive-cryptocurrency.html

Opening that address returned the article "Steps to send crypto" at https://help.coinbase.com/en/coinbase/trading-and-funding/cryptocurrency-trading-pairs/steps-to-send-crypto

The page does not show a date.

Sends are on-chain to an external address, or off-chain to another Coinbase user by phone number, email, or username. On-chain sends are irreversible, use a network fee, and take time. Off-chain sends are instant, have no transaction fee, and do not appear on the blockchain. The wrong network loses the funds. The page says Coinbase cannot retrieve funds sent to the wrong address or network.

On the phone: select the Pay tab (Get started, the first time), select the asset and an amount, select Pay, then enter the recipient. The recipient can be a contact, a scanned QR code, an email, a phone number, a crypto address, or an ENS name. If the asset has more than one network and the send is not to an email or phone number, the person picks the network. An optional note follows, then review, then Pay now. Two-factor authentication is prompted on some higher-value sends, not on routine sends.

On the website: from the Dashboard, choose Send crypto, select the asset and amount (cash value or crypto amount), choose a network, pick a favorite or type an address, preview, then Send now.

If the person tries to send more crypto than the crypto balance, the page says they are prompted to top up. Sends may be temporarily capped, and that cap lifts automatically. Sends also follow transfer-protection settings. The page does not give the cap as a number.

The page does not say what happens when a price is missing. It does not say what happens when a partner is missing. It does not mention stocks or stock tokens.

## Understand your available balance

The room map cites https://help.coinbase.com/customer/portal/articles/1403838-money-left-my-bank-account-where-is-my-bitcoin

Opening that address returned the Coinbase Help home ("How can we help?"), not the article. That open failed. The current first-party article with the cited title is https://help.coinbase.com/en/coinbase/trading-and-funding/sending-or-receiving-cryptocurrency/available-balance-faq

A public index of the failed portal address shows the same title and the same sentences. The text below is that article. It does not show a date.

Available balance is the amount that can be transferred or cashed out. It is the total account value minus funds on hold.

Funds from a bank-account purchase (ACH or EFT) or a cash deposit are on hold and are not immediately available to send or cash out. During the hold, the person can sell or trade crypto bought with those funds, or use the funds to buy crypto on the exchange. The person cannot cash out, trade DEX assets, or send crypto purchased with those funds until the hold is lifted. The hold time cannot be changed. Funds on hold are shown in local currency, whether the source was cash or a crypto purchase. An increase in the crypto's value does not change cash-out availability. To send crypto or trade DEX assets immediately, the page says to deposit with a debit card.

Hold length depends on account history, payment activity, and transaction history. A confirmation email says when the funds can leave the account, and another email says when they are available. Holds typically expire by 11:59 PM PT on the date listed, and may be extended for a dispute or account safety. Coinbase Support cannot shorten the hold.

The balance summary shows how much can be traded or transferred. The person can also open a buy or an off-platform send and select the Available tooltip. Derivatives availability is under the USD or USDC page, via the My balance arrow. The DEX balance can differ and is shown inside the DEX trade flow; funds on hold are excluded from it.

On the web, the person starts at the account home, selects My assets, then See balance summary. Wire transfers and debit-card purchases do not change cash-out availability, but they are subject to any hold already on the account.

The page does not say what happens when a price or a partner is missing. It does not publish a hold length as a fixed number of days. It does not mention stocks or stock tokens. It does not say that money locked for an open order is a hold. That sentence is not on this article.

## Which Kraken platform is best for me?

https://support.kraken.com/articles/14984895395092-which-kraken-platform-is-best-for-me-

Last updated: 1 October 2026. Read 5 October 2026.

The page compares Kraken, Kraken Pro, and Krak. Kraken is the simple platform: buy, sell, convert, fund, and track a portfolio, on the website and in the Kraken mobile app. Kraken Pro is the professional order-book interface, on the web and in its own mobile app, with advanced order types, futures, and margin. Kraken Desktop is described as a further application for custom boards, used with the same Kraken credentials. Krak is a separate money app for everyday payments: send and receive cash or crypto with a Kraktag, 300+ assets on this page, fees shown up front, rewards on eligible balances, and KrakBacks when sending. The page says transfer fees between Krak users are zero. It names splitting a bill as one use, and it does not describe the split. The split article is below.

Sign-in is with Kraken credentials on Kraken, Kraken Pro, Kraken Desktop, and Krak. The page does not use the words "one login." On the website, an App switcher in the corner lists the platforms and opens the one selected. The page says that on mobile the person may download both apps and use them at the same time. It also says Kraken Desktop can be used on its own, but funding, staking, and most account settings are on Kraken or Kraken Pro.

The comparison table marks instant buy, advanced order options, margin, futures, price alerts, a customizable interface, and the desktop application as present or absent per product. This note does not copy that table's fee row.

The page does not say what happens when a price, a limit, or a partner is missing. It does not mention stocks, stock tokens, or on-chain tokens.

## Kraken Pro trading interface

https://support.kraken.com/articles/kraken-pro-trading-interface-guide

Last updated: 1 October 2026. Read 5 October 2026.

The trade screen is widgets. The top ribbon is not customizable. It has a market selector (Spot, Margin, and Futures, plus favorites), a market-details ribbon, portfolio value (balances, unrealized P&L, deposit, withdraw, transfer to or from futures, stake, and hiding balances), a Layouts and widgets button, and, at the top right, a platform selector, help, a light or dark theme switch, and platform settings. Two presets are Classic and Advanced. The page says Classic is meant to feel close to Kraken Classic.

Widgets named on the page: order form, order book, market trades, market chart, balances, open orders, closed orders, conditional orders, positions, trades, market favorites, portfolio, performance, depth chart, simple order form, and alerts.

The order form has buy/sell, an order-type menu, price and quantity, a quantity slider, balance or margin, and more order options. The page does not list the order-type names. It points at other articles for spot and futures order types. Those articles were not opened. Submit with CTRL+ENTER on desktop or CMD+RETURN on Mac. Widget settings include an order summary beside the button, a 3-second disable of the button after a spot submit, and clearing quantity after submit.

Clicking a price or a quantity on the order book fills the order form. The book can be shown as a price ladder. The depth chart is cumulative bids and asks.

The market chart is a TradingView-style chart. The page says it can show four market charts at once. Time frames listed are 1 minute, 5 minutes, 15 minutes, 30 minutes, 1 hour, 4 hours, 1 day, and 1 week. Futures charts can use mark price instead of trade price. The chart can show open orders, stops, and positions. The person can drag an order's handle to a new price. A buy limit dropped above the current price, if it is not post only, executes immediately as a market order. An order label has a cancel control. Chart settings toggle open and trigger orders, open positions, an order-form preview (not for market orders), and the last 1000 trades as arrows or circles. The page does not say a liquidation price is drawn on the chart.

Balances include a "Show small balances" toggle: display, or do not display, assets that have only a small balance. The page does not say what "small" means.

Open orders, closed orders, and conditional orders can turn off the cancel-confirmation modal. They can also filter to the selected market, turn execution and expiry notifications on or off, and show the order total in the quote currency.

Market favorites toggle between a table and cards. Alerts fire when a market trades at, above, or below a price, on Kraken Pro web and the Pro mobile app.

The page does not say what happens when a price is missing, or when a partner is missing. It does not mention stocks or stock tokens.

## Trading widgets on Kraken Pro

https://support.kraken.com/articles/trade-widget-settings

Last updated: 2 April 2025. Read 5 October 2026.

This is the widget-settings page. It repeats the controls in the 1 October 2026 interface guide: order summary, the 3-second spot pause, reset quantity, order-book volume bars, open and trigger orders on the chart, open positions on the chart, order-form preview, trade history on the chart, favorites as a list or as cards, show small balances, and the cancel-order confirmation. The same gap remains: the page does not say what "small" means.

The page does not say what happens when a price, a limit, or a partner is missing. It does not mention stocks or stock tokens.

## How to trade on Kraken Desktop

https://support.kraken.com/articles/how-to-trade-on-kraken-desktop

Last updated: 1 October 2026. Read 5 October 2026.

The order ticket has bid and ask buttons (they fill the limit price with the best bid or best ask, and they do not work for a market order), buy/sell, spot or margin, order type, limit or market price, quantity, estimated total (quantity times price, fees not included; typing a total updates quantity), estimated fee (a tooltip shows maker and taker fees), post-only, duration, and OTO (a conditional close in the opposite direction, created after the primary order triggers). The page names Limit, Market, Stop Loss, and Take Profit as types that use a price field. A market order's price field fills with the best available price.

Review can be turned off in the order-ticket settings. A line under the button says "Ready for order…" or names a problem. The page's example of a problem is a quantity of 0. The page does not say what happens when there is no best bid, best ask, or market price.

Chart trading is on by default and can be turned off. The person moves to a price on the chart, clicks the plus on the price axis, enters quantity, and can turn margin on. A slider is a percentage of spot balance, or of available margin. Take profit and stop loss can be dragged onto the chart after the order exists. Their quantity matches the original order, and a checkmark confirms them. Open orders appear as circles on the price chart and on the depth chart. Dragging an order on the chart changes its price, not its quantity. An open order can be edited from the trade-activity list only when the filled amount is 0.

The page does not say what happens when a partner is missing. It does not mention stocks or stock tokens.

## Navigating the Kraken app

https://support.kraken.com/articles/360059154531-navigating-the-kraken-app

Last updated: 3 August 2026. Read 5 October 2026.

Under "What are the tabs?" the page lists:

- Plus: buy, sell, and convert.
- Home: assets, plus a feed of market news, daily briefs, and crypto updates.
- Portfolio: assets on the account.
- Explore button: hot assets, traders, newly listed assets, and most popular assets.
- Funded: "Kraken Funded lets you trade with Kraken's money instead of your own." The page links to another article for more. That article was not opened. Funded, on this page, is Kraken's own tab.

Activity is not in that list. Later, the page says transaction history is the activity tab at the bottom of the app, or an asset on Portfolio. Account is the initials at the top left, then Account details, payment methods, preferences, device management, support, and inbox. It is not listed as a bottom tab.

Hiding the balance is a tap on Portfolio Value on Home or Portfolio, or a hide-balances toggle under Preferences. That hides the number. It is not the Pro "small balances" toggle. Theme is Dark, Light, or auto, which matches the phone's system setting. Rewards on this page are staking or opt-in rewards on eligible assets, turned on for the account. The page does not describe a card.

The page does not say what happens when a price, a limit, or a partner is missing. It does not mention stocks, stock tokens, or on-chain tokens.

## Kraken's official mobile apps

https://support.kraken.com/articles/360001332083-kraken-s-official-mobile-apps

Last updated: 11 August 2026. Read 5 October 2026.

The page says the apps it lists are the only official apps. It lists four:

- The Kraken app. Buy with a card or ACH, deposit and withdraw cash and crypto, recurring buys, portfolios, favorites, and sorting by winners or losers. The page's words for the mix of assets are "Crypto, Equities (including. xStocks) and instant FX conversion in one portfolio." It also says eligible customers can take part in tokenized US-listed IPOs at the offering price through the Kraken app, and it calls that "IPO Access via xStocks." Sign-in uses the Kraken username and password, or a new account created in the app.
- The Kraken Pro app. A separate download. The same username and password. Advanced order types, more than one chart and order-book display, deposits and withdrawals, and stake and unstake. The page says margin up to 20x and futures up to 50x, if eligible, and automated OTC for orders over 100,000 USD for Kraken OTC clients. It says the app is not compatible with trading 2FA or API 2FA.
- The Krak app. The page calls it "your checking and saving accounts." Peer-to-peer payments by Kraktag, a spend account and an earn account, rewards on balances without a lock-up or a minimum, and 600+ fiat and digital assets. The page says Krak is available globally except Australia. This is Kraken's app, not a screen of the Kraken app.
- Kraken Wallet. A separate app to store and manage crypto, NFTs, and more than one wallet. The page names Bitcoin, Ethereum, Solana, Optimism, Base, Arbitrum, Polygon, and Dogecoin. A Kraken account is not required. This is Kraken's wallet app.

The page does not say what happens when a price, a limit, or a partner is missing. It does not say that equities or xStocks are a second account. It says the Kraken app holds them in one portfolio. It does not describe the equity order ticket.

## Coming soon: bringing Kraken to life

https://blog.kraken.com/news/new-kraken-app-coming-soon

The page date is 10 July 2026. Read 5 October 2026.

Kraken's own blog says the consumer app is being rebuilt and is "coming very soon." The person sets a financial goal, and the app is described as shaping itself around that goal and waiting for the person to decide. The page does not list tabs, and it does not say the rebuilt app has replaced the app in the 3 August 2026 guide. A disclaimer says investment advice on securities is provided by Kraken Adviser LLC, an SEC-registered adviser, separate from Payward Interactive, Inc., and it links to https://www.kraken.com/legal/equities. That legal page was not opened. The blog post does not describe a stocks screen.

The page does not say what happens when a price, a limit, or a partner is missing.

## On-chain token trading is now built into the Kraken app

The room map cites this Kraken blog post by title and by the date 18 June 2026. It does not print a URL. The first-party post with that title and date is https://blog.kraken.com/product/onchain-trading/now-built-into-the-kraken-app

The page date is 18 June 2026. Read 5 October 2026.

The post says eligible customers in the US and more than 100 countries can trade Solana tokens from the Kraken app they already use. It says "2,500+" and "nearly 2,500" verified Solana tokens, including tokens not listed on a centralized exchange. Trading is in USD or USDC, in the same interface. On-chain holdings appear in the portfolio next to existing Kraken assets. The post says there is no separate wallet to manage, no seed phrases, and no app switch. It also says the trading is self-custodial, Kraken does not hold the assets or the private keys, and the infrastructure is Privy's embedded wallet plus Solana DEX protocols. It says Kraken has not reviewed or approved the tokens, and that Kraken does not control DEX execution or guarantee order fill, timing, or price.

The page does not say what the screen shows when a price is missing. It does not say what happens when a limit or a partner is missing. It does not mention stocks or stock tokens. The post presents this as a feature of the Kraken app.

## Split a bill on Krak

https://support.krak.app/articles/krak-split-bill

Last updated: 30 June 2026. Read 5 October 2026. The page heading is "Split Bill."

Split Bill divides a shared expense and sends a payment request to up to 12 contacts at once, in any of the 300+ assets on Krak. Krak sends each person their own request. The split can be equal or a custom amount per person. The total and each share are shown in the chosen currency. Only one asset per split. If the amounts do not add up to the total, the page says the person cannot proceed. The page's words are "if the enter values don't add up to the total amount."

Two starts: tap a transaction in Activity (the amount is already filled), or start a fresh split from the Receive flow on the home screen when the payment was made somewhere else. Recent contacts are at the top, and there is a search. The sender is included by default and can remove themselves. Calculator keys add a tip, deduct, multiply, or divide. Pending requests sit in the Inbox, each with Kraktag, name, amount, and status. A payment then shows in Activity and in the balance. Each payment notifies the sender. One failed send does not stop the others. Amounts cannot be edited after send. The person cancels and creates a new split or a single request.

The page says Split Bill works only between Krak users. Someone who does not use Krak is not a split counterparty. The sender can refer them. Geographic restrictions on an asset may apply to a contact. Split Bill is free. A conversion fee may apply if someone pays from a different currency.

The page does not say what happens when a market price is missing. The amount is the bill, not a quoted market. It does not say what happens when a spending limit is missing. The "partner" it does speak to is the other person: if they are not a Krak user, the split cannot include them.

## What these pages leave unsaid

Across the pages above, none say the ticket or the chart refuses, or stays blank, when no price is published. The closest sentences are Coinbase's market-order rule (use the best available price, with a protection point, and no guarantee of a displayed price), Kraken Desktop's rule (a market price field fills with the best available price, and a quantity of 0 blocks submit), and the on-chain post's rule (Kraken does not guarantee price, fill, or timing). None of them say what the screen does when that price is absent.

None of these pages say what happens when a partner institution is missing. Krak's split page does say a person who is not a Krak user cannot be included.

Kraken Funded, Kraken Wallet, Kraken Pro, Krak, and Kraken Desktop are described as Kraken's own products. The 11 August 2026 apps page lists four apps. The 1 October 2026 platform page adds Kraken Desktop as a downloadable trading application. This note does not turn any of them into a room.
