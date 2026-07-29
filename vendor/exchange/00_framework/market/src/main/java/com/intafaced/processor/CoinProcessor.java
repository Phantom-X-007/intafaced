package com.intafaced.processor;

import java.util.List;

import com.intafaced.component.CoinExchangeRate;
import com.intafaced.entity.CoinThumb;
import com.intafaced.entity.ExchangeTrade;
import com.intafaced.entity.KLine;
import com.intafaced.handler.MarketHandler;
import com.intafaced.service.MarketService;

public interface CoinProcessor {

    void setIsHalt(boolean status);

    void setIsStopKLine(boolean stop);
    
    boolean isStopKline();
    /**
     * 处理新生成的交易信息
     * @param trades
     * @return
     */
    void process(List<ExchangeTrade> trades);

    /**
     * 添加存储器
     * @param storage
     */
    void addHandler(MarketHandler storage);

    CoinThumb getThumb();

    void setMarketService(MarketService service);

    void generateKLine(int range, int field, long time);

    KLine getKLine();

    void initializeThumb();

    void autoGenerate();

    void resetThumb();

    void setExchangeRate(CoinExchangeRate coinExchangeRate);

    void update24HVolume(long time);

    void initializeUsdRate();
}
