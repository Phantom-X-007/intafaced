package com.intafaced.handler;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import com.intafaced.entity.CoinThumb;
import com.intafaced.entity.ExchangeTrade;
import com.intafaced.entity.KLine;
import com.intafaced.job.ExchangePushJob;

@Slf4j
@Component
public class WebsocketMarketHandler implements MarketHandler{
    @Autowired
    private SimpMessagingTemplate messagingTemplate;
    @Autowired
    private ExchangePushJob pushJob;

    /**
     * 推送币种简化信息
     * @param symbol
     * @param exchangeTrade
     * @param thumb
     */
    @Override
    public void handleTrade(String symbol, ExchangeTrade exchangeTrade, CoinThumb thumb) {
        //推送缩略行情
        pushJob.addThumb(symbol,thumb);
    }

    @Override
    public void handleKLine(String symbol, KLine kLine) {
        //推送K线数据
        messagingTemplate.convertAndSend("/topic/market/kline/"+symbol,kLine);
    }
}
