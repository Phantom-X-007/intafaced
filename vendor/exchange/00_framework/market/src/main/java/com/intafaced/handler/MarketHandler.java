package com.intafaced.handler;

import com.intafaced.entity.CoinThumb;
import com.intafaced.entity.ExchangeTrade;
import com.intafaced.entity.KLine;

public interface MarketHandler {

    /**
     * 存储交易信息
     * @param exchangeTrade
     */
    void handleTrade(String symbol, ExchangeTrade exchangeTrade, CoinThumb thumb);


    /**
     * 存储K线信息
     *
     * @param kLine
     */
    void handleKLine(String symbol,KLine kLine);
}
