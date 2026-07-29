package com.intafaced.config;

import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import com.intafaced.component.CoinExchangeRate;
import com.intafaced.entity.ExchangeCoin;
import com.intafaced.handler.MongoMarketHandler;
import com.intafaced.handler.NettyHandler;
import com.intafaced.handler.WebsocketMarketHandler;
import com.intafaced.processor.CoinProcessor;
import com.intafaced.processor.CoinProcessorFactory;
import com.intafaced.processor.DefaultCoinProcessor;
import com.intafaced.service.ExchangeCoinService;
import com.intafaced.service.MarketService;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Configuration
@Slf4j
public class ProcessorConfig {

    @Bean
    public CoinProcessorFactory processorFactory(MongoMarketHandler mongoMarketHandler,
                                                 WebsocketMarketHandler wsHandler,
                                                 NettyHandler nettyHandler,
                                                 MarketService marketService,
                                                 CoinExchangeRate exchangeRate,
                                                 ExchangeCoinService coinService,
                                                 RestTemplate restTemplate) {

        log.info("====initialized CoinProcessorFactory start==================================");

        CoinProcessorFactory factory = new CoinProcessorFactory();
        List<ExchangeCoin> coins = coinService.findAllEnabled();
        log.info("exchange-coin result:{}",coins);
        
        for (ExchangeCoin coin : coins) {
            CoinProcessor processor = new DefaultCoinProcessor(coin.getSymbol(), coin.getBaseSymbol());
            processor.addHandler(mongoMarketHandler);
            processor.addHandler(wsHandler);
            processor.addHandler(nettyHandler);
            processor.setMarketService(marketService);
            processor.setExchangeRate(exchangeRate);
            processor.setIsStopKLine(true);
            
            factory.addProcessor(coin.getSymbol(), processor);
            log.info("new processor = ", processor);
        }

        log.info("====initialized CoinProcessorFactory completed====");
        log.info("CoinProcessorFactory = ", factory);
        exchangeRate.setCoinProcessorFactory(factory);
        return factory;
    }
}
