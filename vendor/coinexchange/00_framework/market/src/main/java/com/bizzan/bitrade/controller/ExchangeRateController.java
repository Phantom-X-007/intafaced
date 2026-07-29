package com.bizzan.bitrade.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bizzan.bitrade.component.CoinExchangeRate;
import com.bizzan.bitrade.util.MessageResult;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/exchange-rate")
public class ExchangeRateController {
    @Autowired
    private CoinExchangeRate coinExchangeRate;

    /**
     * Reports each FX rate alongside when it was last successfully refreshed and
     * whether it is now stale.
     *
     * The rate endpoints below return a bare number, which cannot say whether it
     * came from a source minutes ago or is a seeded default nobody has been able
     * to refresh since start-up. That distinction matters - these rates multiply
     * into user-visible prices - so it is published here rather than left to be
     * inferred from the logs.
     */
    @RequestMapping("status")
    public MessageResult getRateStatus(){
        MessageResult mr = new MessageResult(0,"success");
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("usdtCnyRate", coinExchangeRate.getUsdtCnyRate());
        status.put("usdtCnyRateStale", coinExchangeRate.isUsdtCnyRateStale());
        status.put("usdtCnyRateUpdatedAt", coinExchangeRate.getUsdtCnyRateUpdatedAt());
        status.put("usdCnyRate", coinExchangeRate.getUsdCnyRate());
        status.put("usdJpyRate", coinExchangeRate.getUsdJpyRate());
        status.put("usdHkdRate", coinExchangeRate.getUsdHkdRate());
        status.put("forexRateStale", coinExchangeRate.isForexRateStale());
        status.put("forexRateUpdatedAt", coinExchangeRate.getForexRateUpdatedAt());
        mr.setData(status);
        return mr;
    }

    @RequestMapping("usd/{coin}")
    public MessageResult getUsdExchangeRate(@PathVariable String coin){
        MessageResult mr = new MessageResult(0,"success");
        BigDecimal latestPrice = coinExchangeRate.getUsdRate(coin);
        mr.setData(latestPrice.toString());
        return mr;
    }
    
    @RequestMapping("usdtcny")
    public MessageResult getUsdtExchangeRate(){
        MessageResult mr = new MessageResult(0,"success");
        BigDecimal latestPrice = coinExchangeRate.getUsdtCnyRate();
        mr.setData(latestPrice.toString());
        return mr;
    }

    @RequestMapping("cny/{coin}")
    public MessageResult getCnyExchangeRate(@PathVariable String coin){
        MessageResult mr = new MessageResult(0,"success");
        BigDecimal latestPrice = coinExchangeRate.getCnyRate(coin);
        mr.setData(latestPrice.toString());
        return mr;
    }

    @RequestMapping("jpy/{coin}")
    public MessageResult getJpyExchangeRate(@PathVariable String coin){
        MessageResult mr = new MessageResult(0,"success");
        BigDecimal latestPrice = coinExchangeRate.getJpyRate(coin);
        mr.setData(latestPrice.toString());
        return mr;
    }

    @RequestMapping("hkd/{coin}")
    public MessageResult getHkdExchangeRate(@PathVariable String coin){
        MessageResult mr = new MessageResult(0,"success");
        BigDecimal latestPrice = coinExchangeRate.getHkdRate(coin);
        mr.setData(latestPrice.toString());
        return mr;
    }

    @RequestMapping("usd-{unit}")
    public MessageResult getUsdCnyRate(@PathVariable String unit){
        MessageResult mr = new MessageResult(0,"success");
        if("CNY".equalsIgnoreCase(unit)) {
            mr.setData(coinExchangeRate.getUsdtCnyRate());
        }
        else if("JPY".equalsIgnoreCase(unit)) {
            mr.setData(coinExchangeRate.getUsdJpyRate());
        }
        else if("HKD".equalsIgnoreCase(unit)) {
            mr.setData(coinExchangeRate.getUsdHkdRate());
        }
        else {
            mr.setData(BigDecimal.ZERO);
        }
        return mr;
    }
}
