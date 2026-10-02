# Intafaced app structure

Structure context for agents. Read this before placing a screen, a menu, or a setting.

This file is not a visual design, not a color choice, and not an order to build every room. The look stays open. The redesign map on GitHub stays the index. This file is the structure that map points at.

The first screens to draw are only these three: the shell, the exchange desk, and the Bank overview. Every other room in this file is part of the finished app. It waits until those three are accepted.

## What is decided, and what is open

Decided here: the doors, what sits behind them, the trading desk, the chart's jobs, the view settings, and which company each choice came from.

Open, and not to be invented by an agent:

- Colors, type, and the overall look.
- Which products the look should feel close to. That is a separate conversation. The five companies below were used for structure, not as a taste lock.
- The exact words on an empty screen, beyond the rule that an empty price stays empty.
- Phone layout pixels. The phone uses the same doors. How they are drawn is the shell frame.

## Why these five

Nitro named the companies. OKX weighs more than the others when they disagree. Strike is the model for a person moving money. Robinhood, Coinbase, and Kraken are the model for a calm home and a professional desk on the same account.

Pages were read from each company's own help or site on 2 October 2026. A news recap was not used as a source. Where a page failed, the same article was opened on another address of that company.

## Personal and Business

Strike's own signup page says the person chooses a Personal or a Business account. A business also submits the company and each owner. If both accounts are verified, the app switches between them without a logout. Source: Strike, "How do I create an account?"

That is the mode Intafaced uses.

- **Personal** is the default. The person sees Money, Trade, Pay as send and receive, and More.
- **Business** is a second account on the same login. Switching to it reveals the merchant desk inside Pay. It does not add a fifth door, and it does not create a second look.

Strike Private is not this. Strike's own announcement describes a white-glove service for large clients: a person, custom pricing, and an email to the private desk. It is not a third screen mode. Intafaced does not add a Private mode to the app. A large-client service can exist later as a relationship, not as a menu.

## The spine

One product. Four customer doors.

| Door  | Job                                             | Where the person lands |
| ----- | ----------------------------------------------- | ---------------------- |
| Money | What they hold, and the bank behind it          | Here, after sign-in    |
| Trade | The desk                                        | One tap from Money     |
| Pay   | Send, receive, and, in Business, get paid       | One tap                |
| More  | The rooms that are real and are not daily doors | One tap                |

Search sits in the bar on every door. It is not a fifth door.

The phone stacks the same four doors. A later phone item, not a door, is a home-screen price and a pay button. Strike and OKX both offer a phone widget of that kind. A social feed on the chart stays out. Robinhood has one. It is not part of this structure.

The public front sits in front of the doors: home, sign-in, create account, help, and announcements.

The person menu is the corner: account, security, verification, and View. It is not a door.

The team door is separate, same look, never on the customer bar: kill-switches, launch sequence, jurisdiction, ledger, and operator tools.

## Money

This is the calm screen. OKX calls the matching pages Portfolio and Activity. Strike splits the home into a cash balance and a bitcoin balance. Robinhood's home is one balance and a list of holdings. Coinbase's help puts holdings under My Assets, with an available balance that is the total minus funds on hold.

Intafaced lands on one total. Under it:

- Each holding. Open one and you get the price, a simple line or candle chart, buy, sell, send, and a repeat buy. From that same holding, Trade opens the desk on that market.
- Pending and available, shown apart. Pending can be used to buy. It cannot be sent until it is available. Taken from Strike's own limits page: pending balances are unavailable for withdrawing or sending. Coinbase states the same hold in "Understand your available balance."
- Deposit, withdraw, and the record of money moving.
- The bank, behind the balance: spaces, transfers, earn, loans, cards, moving between cash and crypto, spending analytics, and business accounts.
- The whole total can be shown in dollars or in a coin. OKX's preferences page lets the person pick the display currency, including a coin. The number can be hidden.

There is one ledger. OKX moves funds from a funding account to a trading account. Intafaced does not. A trading view and a spending view are two ways to look at the same ledger. A screen never keeps its own balance.

Deposit and withdraw that the product cannot do yet stay on the route and say they are not built. They do not show a fake form that looks live.

## Trade

One door. The mode is a setting, not a new door. OKX's own trading-settings page is the source: inside Trade you pick Spot, Futures, or Trading bots, and an account mode decides what that screen may do.

Modes, for the finished app, including ones not built yet:

- Spot. A new person stays here.
- Margin. On OKX it is a switch on the spot ticket, cross or isolated. Same here.
- Futures, perpetual and dated.
- Options.
- Copy. Also listed in More, so it can be found. Not its own door.
- Bots. Also listed in More, and reachable from the ticket. Not its own door.

Convert is an action on the holding and on the ticket. It is not a mode and not a door.

A position mode, taken from OKX, applies once futures exist: one-way, or hedge (a long and a short at the same time). Switching account mode changes what Trade shows. It does not change the doors.

### The desk

Coinbase Advanced, Kraken Pro, Robinhood Legend, and OKX describe the same desk. The chart is the largest piece. Around it:

- The order ticket.
- The book, buys on one side and sells on the other, and depth.
- Recent trades.
- Open orders, positions, and the balance that can be used.
- Favorites. Picking a market updates the chart, the book, and the ticket together. Robinhood calls this linking widgets. OKX calls the list Favourites.
- Alerts.

Layouts are saved. Kraken ships Classic and Advanced presets and lets the person drag panels, with up to four charts. OKX allows up to ten chart workspaces and can hide the order panel so the chart fills the screen. Robinhood Legend allows several layouts and templates, and up to eight charts. The first frame Intafaced draws is one chart. The finished desktop can hold several charts and more than one saved layout.

The phone uses the same market, the same drawings, and the same indicator set. The stack is chart, then ticket, then book. Landscape and full screen belong to the desk. OKX also lets the chart sit at the top, the bottom, or be hidden. That choice is a view setting.

### The ticket

Order types taken from Coinbase Advanced's own order-type page, OKX, and Kraken:

- Market, limit, stop, and stop-limit.
- A target and a stop attached to the order. Coinbase calls the pair a bracket when it is placed on a position that already exists.
- Post only, reduce only, and time in force: good till canceled, immediate or cancel, fill or kill.
- A large order split over time. Coinbase calls this TWAP.
- On futures, reverse the position. OKX requires the button and a confirmation before it appears. Intafaced does the same.
- Size in coin, contracts, or the quote currency.
- The fee before the order is sent.
- The last choices can stay on that device. Coinbase calls these sticky settings. They do not have to sync across devices.

If there is no price, the ticket refuses. It does not invent one. A hotkey may send on desktop. Kraken documents Ctrl+Enter and Cmd+Return. The warning before send, and the warning before cancel, can each be turned off.

### The chart

The chart has jobs. The engine is a separate rule, stated at the end of this section.

Jobs, for the finished desk:

- Type: line, candlestick, and Heikin Ashi. Robinhood Legend names those types.
- Interval: from one minute through a month. OKX's candlestick page also includes a time chart and landscape.
- Indicators, and a saved set the person can apply again. The starter set is moving average, volume, VWAP, RSI, MACD, and Bollinger. Coinbase says its TradingView chart has many more. The desk can hold more sets later. An agent does not invent a list of a hundred indicators in the first frame.
- Drawings: a trendline, a level, and the shapes OKX names (rectangle and the rest). Drawings and indicator sets sync between phone and desktop. OKX syncs drawings and says candle colors do not sync. Intafaced syncs the up-and-down color as well, because it is an account setting, not a per-device scribble.
- Compare a second market on the same chart.
- A countdown on the current candle. Optional news marks. Each can be hidden.
- Open orders, the position, the stop, and, on futures, the liquidation price, drawn on the chart and draggable. OKX's candlestick page lists open orders, historical orders, and drag-to-modify. Kraken's derivatives guide lists open orders, position, mark, and liquidation on the chart.
- A press on the chart or on a price ladder starts an order. Robinhood Legend and Kraken Desktop both do this. The ladder is a widget of the desk, not a door.
- Options, when they exist, use a chain: calls on one side, puts on the other, the strike in the middle. Robinhood's own options-chain article is the source. OKX's candlestick page says options do not use that candle chart. The chain is the options surface. It still lives inside Trade.

The engine rule: the chart already in the product is the one that ships now. A licensed TradingView chart is allowed only after the owner has access. A copied TradingView does not go into the public repository. OKX and Coinbase let a person use TradingView from inside the chart settings. The choice can exist in the product. The copy cannot.

A missing price leaves the chart empty.

### View

One View section, opened from the person menu or from the desk. These settings change the screen. They are not doors.

- Light, dark, or match the phone. OKX and Kraken both offer this. The choice of brand color is not this setting and is not made in this file.
- Which color means up. Green up and red down is the default. The person can reverse it. OKX's candlestick page is the source. The choice follows the account onto every screen.
- Where the daily candle starts: a 24-hour clock, or a chosen time zone. OKX offers UTC, UTC+8, and 24-hour.
- Where the chart sits on the phone: top, bottom, or hidden.
- What the chart draws: open orders, position, stop, liquidation, old fills, news. Each can be off.
- Confirm before send. Confirm before cancel. Futures also have a cooling-off switch that blocks new futures trades for a chosen time. OKX documents that switch.
- Display currency for the whole total. Hide the number. Hide small balances. Favorites as a list or as cards. Kraken documents the last two.
- Pending and available, as above.

## Pay

Personal Pay is Strike. From Strike's own send, receive, and limits pages:

- Send to a name, and request.
- Receive, and choose whether it stays in the asset or converts.
- A repeat buy lives on the holding, which is Money, and is the same idea as Strike's recurring buy.
- Bill pay and sending to a bank account abroad are rooms inside Pay for the finished app. Strike's limits page lists both. They are not built yet. They are not doors.
- Lightning and on-chain receive are the chain. They stay out until the owner says the chain starts. The structure has a place for them inside Pay. The product does not build them now.

Business Pay is the merchant desk. It appears only in the Business account.

- Links, checkout, customers, payouts, settlements, and disputes.
- Sub-merchants and permissions. These routes exist today. They stay in this desk.
- Invoices and subscriptions.
- Reports. Strike Business's own announcement says a business can export activity for accounting.
- A developer test mode: keys and webhooks that cannot move live money. Strike's business signup page says the API is an extra verification, not a separate app.

A person who is not a business never sees this list.

## More

Rooms that are real and are not on the main bar. OKX puts Earn and the longer list under Explore, reached from the bottom of the app, not from the trade ticket. Same idea here.

- Academy.
- Agents.
- Quant.
- Launch.
- Market.
- Prediction markets.
- Mining.
- Token.
- Blueprint.
- Support.

Copy and bots are listed here as well as inside Trade.

## What Intafaced has that those five do not

These stay. They are not dropped because a competitor has no room with that name.

- One ledger. No funding account and no trading account. Views only.
- The bank behind Money: spaces, loans, cards, ramps, analytics, business accounts.
- The team door: kill-switches, launch sequence, jurisdiction, ledger, operator tools.
- Jurisdiction as a real constraint. A missing tier says so. It does not invent a permission.
- Honest empty. A missing price, a missing balance, and an unbuilt custody screen say what is missing. A banner does not make a made-up number allowed.
- The parked chain. The decentralized exchange, the protocol, and self-custody are pages that can exist and are not in the menu.
- Academy, agents, blueprint, quant, launch, mining, prediction markets, token, and the market catalogue.

## Left out, and why

- Kraken's three apps. One product. The simple app is Money plus a simple chart. Pro is Trade. Krak's job, paying a person, is Pay.
- OKX's old switch between a Lite app and a Pro app. OKX's own preferences page says the current app no longer has it.
- OKX Wallet, DEX trader mode, and on-chain stock tokens. Those are the self-custody and chain surface. They wait.
- Strike Private as a screen. It is a service, not a mode.
- A social feed on the chart.
- A second chart product on the phone.
- A copied TradingView in the public repository.
- Brand colors, type, and a taste lock. Not this file.
- Two books of money.

## First build

Draw only the shell with these four doors, the exchange desk, and the Bank overview. Pay's merchant desk, the extra trade modes, More, and the team frames come after those three are accepted.

Sample numbers exist only inside Paper Design, and they are marked as samples. The product never shows an invented balance. In this company, "paper" alone means simulated trading. The practice switch on the desk is called simulated. It cannot move ledger money. Paper Design is the design tool, not that switch.

## Sources

Read 2 October 2026, from the companies themselves.

- OKX, "How do I set up the commonly used transaction features?": account mode, position mode, interface, up and down colors, chart position, cooling-off. `https://www.okx.com/help/trading-settings-faq`
- OKX, "How do I use and adjust the candlestick chart?": chart settings, trading display, order book, drawings, TradingView as a chart display, options charts unsupported. `https://www.okx.com/help/candlestick-faqs-and-settings`
- OKX, "How do I use the chart trading layout?": up to ten workspaces, hide the order panel, chart position on the app. `https://www.okx.com/help/how-do-i-use-the-chart-trading-layout`
- OKX, "How do I set my preferences?": theme, display currency, liquidation price, and the note that Lite and Pro can no longer be switched. `https://www.okx.com/en-us/help/preferences-faq`
- OKX, "Getting started with Simple Earn": Explore, then Grow, for earn products. `https://www.okx.com/help/getting-started-with-coins`
- OKX, "How do I conduct spot trading?": Trade, then Spot, funding account to trading account. The transfer is theirs. Intafaced does not copy it. `https://www.okx.com/help/cryptocurrency-trading-app-web`
- Strike, "How do I create an account?": Personal or Business, switch without logout. `https://strike.me/support/how-do-i-create-an-account/`
- Strike, "What are my transaction limits?": personal and business limits, pending unavailable to send, Bill Pay, Send Globally, Strike Private for large orders. `https://strike.me/faq/what-are-my-limits/`
- Strike, "Announcing Strike Private" (5 October 2023): white-glove service, not an in-app mode. `https://strike.me/blog/announcing-strike-private/`
- Strike, "Announcing Strike Business" (14 March 2024): same money actions as a person, plus reports and developer access. `https://strike.me/blog/announcing-strike-business/`
- Coinbase Help, "Coinbase vs Coinbase Advanced": simple account versus the desk on the same account. `https://help.coinbase.com/en/getting-started/other/coinbase-vs-coinbase-advanced`
- Coinbase Help, "Coinbase Advanced dashboard overview": chart, depth, book, ticket, open orders, sticky settings. `https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/dashboard-overview`
- Coinbase Help, "Understanding the order types": market, limit, stop, bracket, attached target and stop, TWAP. `https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/order-types`
- Coinbase Help, "Steps to send crypto": the Pay tab, send by contact or address. `https://help.coinbase.com/en/coinbase/trading-and-funding/cryptocurrency-trading-pairs/how-to-send-and-receive-cryptocurrency.html`
- Coinbase Help, "Understand your available balance": available is total minus holds. `https://help.coinbase.com/customer/portal/articles/1403838-money-left-my-bank-account-where-is-my-bitcoin`
- Kraken Support, "Which Kraken platform is best for me?" (1 October 2026): Kraken, Kraken Pro, and Krak, one login, an app switcher. `https://support.kraken.com/articles/14984895395092-which-kraken-platform-is-best-for-me-`
- Kraken Support, "Kraken Pro trading interface guide" (1 October 2026): widgets, Classic and Advanced, light and dark, up to four charts. `https://support.kraken.com/articles/kraken-pro-trading-interface-guide`
- Kraken Support, "Trading Widgets on Kraken Pro": hide small balances, cancel confirmation, favorites as cards, orders on the chart. `https://support.kraken.com/articles/trade-widget-settings`
- Kraken Support, "How to trade on Kraken Desktop" (1 October 2026): order from the chart. `https://support.kraken.com/articles/how-to-trade-on-kraken-desktop`
- Robinhood, "Trading with Robinhood Legend": trade from the chart, the ladder, and the options chain, hotkeys. `https://robinhood.com/us/en/support/articles/trading-with-robinhood-legend/`
- Robinhood, "Layouts on Legend": saved layouts and templates. `https://robinhood.com/us/en/support/articles/layouts-on-legend/`
- Robinhood, "Widgets in Robinhood Legend": chart, indicators, drawings, ladder, options chain. `https://robinhood.com/us/en/support/articles/widgets-in-robinhood-legend/`
- Robinhood, "Options chain": calls one side, puts the other, strike in the middle. `https://robinhood.com/us/en/support/articles/options-chain/`
- Robinhood newsroom, "Introducing Robinhood Legend Charts on Mobile" (17 June 2025): the phone chart matches the desktop, including drawings. `https://robinhood.com/us/en/newsroom/introducing-robinhood-legend-charts-on-mobile/`
