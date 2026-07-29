package com.intafaced.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

import com.intafaced.Trader.CoinTrader;
import com.intafaced.Trader.CoinTraderFactory;
import com.intafaced.entity.ExchangeCoin;
import com.intafaced.service.ExchangeCoinService;
import com.intafaced.service.ExchangeOrderService;

import java.util.List;

@Slf4j
@Configuration
public class CoinTraderConfig {

    /**
     * 配置交易处理类
     * @param exchangeCoinService
     * @param kafkaTemplate
     * @return
     */
    @Bean
    public CoinTraderFactory getCoinTrader(ExchangeCoinService exchangeCoinService, KafkaTemplate<String,String> kafkaTemplate, ExchangeOrderService exchangeOrderService){
        CoinTraderFactory factory = new CoinTraderFactory();
        List<ExchangeCoin> coins = exchangeCoinService.findAllEnabled();
        for(ExchangeCoin coin:coins) {
            log.info("init trader,symbol={}",coin.getSymbol());
            CoinTrader trader = new CoinTrader(coin.getSymbol());
            trader.setKafkaTemplate(kafkaTemplate);
            trader.setBaseCoinScale(coin.getBaseCoinScale());
            trader.setCoinScale(coin.getCoinScale());
            trader.setPublishType(coin.getPublishType());
            trader.setClearTime(coin.getClearTime());
            trader.stopTrading();
            factory.addTrader(coin.getSymbol(),trader);
        }
        return factory;
    }

}
