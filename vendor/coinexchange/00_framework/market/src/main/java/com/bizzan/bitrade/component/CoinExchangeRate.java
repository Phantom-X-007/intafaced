package com.bizzan.bitrade.component;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.bizzan.bitrade.entity.Coin;
import com.bizzan.bitrade.entity.CoinThumb;
import com.bizzan.bitrade.processor.CoinProcessor;
import com.bizzan.bitrade.processor.CoinProcessorFactory;
import com.bizzan.bitrade.service.CoinService;
import com.bizzan.bitrade.service.ExchangeCoinService;
import com.mashape.unirest.http.HttpResponse;
import com.mashape.unirest.http.JsonNode;
import com.mashape.unirest.http.Unirest;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Date;

/**
 * Coin exchange-rate management.
 *
 * MONEY PRECISION: every rate on this class is a BigDecimal built from decimal
 * TEXT. Nothing here may pass a rate through a double. `getDouble` followed by
 * `new BigDecimal(double)` is doubly wrong: the JSON decimal is first rounded to
 * the nearest binary double, and `new BigDecimal(double)` then captures that
 * binary approximation exactly (0.1 becomes 0.1000000000000000055511151231...)
 * instead of the decimal the upstream API actually sent. These rates multiply
 * into user-visible prices, so use {@link #readDecimal} and never a double.
 *
 * RATE FRESHNESS: the upstream sources are third-party endpoints we do not
 * control. A fetch failure must never throw out of a scheduled method, and a
 * rate that could not be refreshed must never be served as though it were
 * fresh - a wrong FX rate persisting silently is worse than a missing one. Each
 * rate therefore carries the time of its last successful refresh; see
 * {@link #isUsdtCnyRateStale()} and {@link #isForexRateStale()}.
 */
@Component
@Slf4j
@ToString
public class CoinExchangeRate {
    /**
     * Seeded start-up values. These are NOT live rates - until a scheduled sync
     * succeeds, {@link #isUsdtCnyRateStale()} / {@link #isForexRateStale()}
     * report true and the sync logs say so explicitly.
     */
    @Getter
    @Setter
    private BigDecimal usdCnyRate = new BigDecimal("6.90");

    @Getter
    @Setter
    private BigDecimal usdtCnyRate = new BigDecimal("7.00");

    @Getter
    @Setter
    private BigDecimal usdJpyRate = new BigDecimal("110.02");
    @Getter
    @Setter
    private BigDecimal usdHkdRate = new BigDecimal("7.8491");
    @Getter
    @Setter
    private BigDecimal sgdCnyRate = new BigDecimal("4.77");
    @Setter
    private CoinProcessorFactory coinProcessorFactory;

    /**
     * USDT/CNY rate source. Empty by default: this deployment ships with NO
     * third-party OTC desk baked in. Point it at a source you control.
     */
    @Value("${market.rate.usdt-cny.url:}")
    private String usdtCnyRateUrl;

    /**
     * Dot-separated path to the rate inside the USDT/CNY response body. Object
     * keys and array indexes are both segments, e.g. "result.buy" or
     * "data.0.price".
     */
    @Value("${market.rate.usdt-cny.value-path:}")
    private String usdtCnyRateValuePath;

    /** Minutes after which an un-refreshed USDT/CNY rate is reported as stale. */
    @Value("${market.rate.usdt-cny.max-age-minutes:60}")
    private long usdtCnyRateMaxAgeMinutes;

    /**
     * Fiat FX source (USD/CNY and USD/JPY). Empty by default. Any credential
     * this source needs belongs in the configured URL, not in this source file.
     */
    @Value("${market.rate.forex.url:}")
    private String forexRateUrl;

    /** Minutes after which un-refreshed fiat FX rates are reported as stale. */
    @Value("${market.rate.forex.max-age-minutes:180}")
    private long forexRateMaxAgeMinutes;

    /** Epoch millis of the last successful refresh; 0 means "never succeeded". */
    private volatile long usdtCnyRateUpdatedAt = 0L;
    private volatile long forexRateUpdatedAt = 0L;

    @Autowired
    private CoinService coinService;
    @Autowired
    private ExchangeCoinService exCoinService;


    public BigDecimal getUsdRate(String symbol) {
        log.info("CoinExchangeRate getUsdRate unit = " + symbol);
        if ("USDT".equalsIgnoreCase(symbol)) {
            log.info("CoinExchangeRate getUsdRate unit = USDT  ,result = ONE");
            return BigDecimal.ONE;
        } else if ("CNY".equalsIgnoreCase(symbol)) {
            log.info("CoinExchangeRate getUsdRate unit = CNY  ,result : 1 divide {}", this.usdtCnyRate);
            BigDecimal bigDecimal = BigDecimal.ONE.divide(usdtCnyRate, 4,BigDecimal.ROUND_DOWN).setScale(4, BigDecimal.ROUND_DOWN);
            return bigDecimal;
        }else if ("BITCNY".equalsIgnoreCase(symbol)) {
            BigDecimal bigDecimal = BigDecimal.ONE.divide(usdCnyRate, 4,BigDecimal.ROUND_DOWN).setScale(4, BigDecimal.ROUND_DOWN);
            return bigDecimal;
        } else if ("ET".equalsIgnoreCase(symbol)) {
            BigDecimal bigDecimal = BigDecimal.ONE.divide(usdCnyRate, 4,BigDecimal.ROUND_DOWN).setScale(4, BigDecimal.ROUND_DOWN);
            return bigDecimal;
        } else if ("JPY".equalsIgnoreCase(symbol)) {
            BigDecimal bigDecimal = BigDecimal.ONE.divide(usdJpyRate, 4,BigDecimal.ROUND_DOWN).setScale(4, BigDecimal.ROUND_DOWN);
            return bigDecimal;
        }else if ("HKD".equalsIgnoreCase(symbol)) {
            BigDecimal bigDecimal = BigDecimal.ONE.divide(usdHkdRate, 4,BigDecimal.ROUND_DOWN).setScale(4, BigDecimal.ROUND_DOWN);
            return bigDecimal;
        }
        String usdtSymbol = symbol.toUpperCase() + "/USDT";
        String btcSymbol = symbol.toUpperCase() + "/BTC";
        String ethSymbol = symbol.toUpperCase() + "/ETH";

        if (coinProcessorFactory != null) {
            if (coinProcessorFactory.containsProcessor(usdtSymbol)) {
                log.info("Support exchange coin = {}", usdtSymbol);
                CoinProcessor processor = coinProcessorFactory.getProcessor(usdtSymbol);
                if(processor == null) {
                	return BigDecimal.ZERO;
                }
                CoinThumb thumb = processor.getThumb();
                if(thumb == null) {
                	log.info("Support exchange coin thumb is null", thumb);
                	return BigDecimal.ZERO;
                }
                return thumb.getUsdRate();
            } else if (coinProcessorFactory.containsProcessor(btcSymbol)) {
                log.info("Support exchange coin = {}/BTC", btcSymbol);
                CoinProcessor processor = coinProcessorFactory.getProcessor(btcSymbol);
                if(processor == null) {
                	return BigDecimal.ZERO;
                }
                CoinThumb thumb = processor.getThumb();
                if(thumb == null) {
                	log.info("Support exchange coin thumb is null", thumb);
                	return BigDecimal.ZERO;
                }
                return thumb.getUsdRate();
            } else if (coinProcessorFactory.containsProcessor(ethSymbol)) {
                log.info("Support exchange coin = {}/ETH", ethSymbol);
                CoinProcessor processor = coinProcessorFactory.getProcessor(ethSymbol);
                if(processor == null) {
                	return BigDecimal.ZERO;
                }
                CoinThumb thumb = processor.getThumb();
                if(thumb == null) {
                	log.info("Support exchange coin thumb is null", thumb);
                	return BigDecimal.ZERO;
                }
                return thumb.getUsdRate();
            } else {
                return getDefaultUsdRate(symbol);
            }
        } else {
            return getDefaultUsdRate(symbol);
        }
    }

    /**
     * Returns the default price configured against the coin itself.
     *
     * Coin.usdRate is a primitive double on the entity, so the value has already
     * been through binary floating point before it reaches us. BigDecimal.valueOf
     * uses Double.toString, which yields the shortest decimal that round-trips
     * (0.1 -> "0.1"); `new BigDecimal(double)` would instead pin the full binary
     * approximation. Neither can recover precision the entity already lost -
     * the real fix is a DECIMAL column, which is a core-module change.
     *
     * @param symbol
     * @return
     */
    public BigDecimal getDefaultUsdRate(String symbol) {
        Coin coin = coinService.findByUnit(symbol);
        if (coin != null) {
            return BigDecimal.valueOf(coin.getUsdRate());
        } else {
            return BigDecimal.ZERO;
        }
    }

    public BigDecimal getCnyRate(String symbol) {
        if ("CNY".equalsIgnoreCase(symbol)) {
            return BigDecimal.ONE;
        } else if("ET".equalsIgnoreCase(symbol)){
            return BigDecimal.ONE;
        }
        return getUsdRate(symbol).multiply(usdtCnyRate).setScale(2, RoundingMode.DOWN);
    }

    public BigDecimal getJpyRate(String symbol) {
        if ("JPY".equalsIgnoreCase(symbol)) {
            return BigDecimal.ONE;
        }
        return getUsdRate(symbol).multiply(usdJpyRate).setScale(2, RoundingMode.DOWN);
    }

    public BigDecimal getHkdRate(String symbol) {
        if ("HKD".equalsIgnoreCase(symbol)) {
            return BigDecimal.ONE;
        }
        return getUsdRate(symbol).multiply(usdHkdRate).setScale(2, RoundingMode.DOWN);
    }

    /**
     * True when the USDT/CNY rate has never been refreshed from its source, or
     * the last successful refresh is older than the configured limit. Callers
     * serving this rate to users should treat true as "this number is not a
     * live rate".
     */
    public boolean isUsdtCnyRateStale() {
        return isStale(usdtCnyRateUpdatedAt, usdtCnyRateMaxAgeMinutes);
    }

    /** True when USD/CNY and USD/JPY have not been refreshed within the limit. */
    public boolean isForexRateStale() {
        return isStale(forexRateUpdatedAt, forexRateMaxAgeMinutes);
    }

    /** Last successful USDT/CNY refresh, or null if there has never been one. */
    public Date getUsdtCnyRateUpdatedAt() {
        return usdtCnyRateUpdatedAt == 0L ? null : new Date(usdtCnyRateUpdatedAt);
    }

    /** Last successful fiat FX refresh, or null if there has never been one. */
    public Date getForexRateUpdatedAt() {
        return forexRateUpdatedAt == 0L ? null : new Date(forexRateUpdatedAt);
    }

    /**
     * Refreshes the USDT/CNY rate from the configured source.
     *
     * This method does not declare or propagate exceptions. It is invoked by the
     * scheduler, and an exception escaping it aborts the run and is logged as an
     * "Unexpected error occurred in scheduled task" every five minutes forever.
     * Every failure path here instead records the rate as un-refreshed and says
     * so in the log.
     */
    @Scheduled(cron = "0 */5 * * * *")
    public void syncUsdtCnyPrice() {
        if (isBlank(usdtCnyRateUrl)) {
            reportNotRefreshed("USDT/CNY", "no rate source is configured (set market.rate.usdt-cny.url)",
                    usdtCnyRateUpdatedAt, usdtCnyRateMaxAgeMinutes, usdtCnyRate);
            return;
        }
        if (isBlank(usdtCnyRateValuePath)) {
            reportNotRefreshed("USDT/CNY", "market.rate.usdt-cny.url is set but market.rate.usdt-cny.value-path is not",
                    usdtCnyRateUpdatedAt, usdtCnyRateMaxAgeMinutes, usdtCnyRate);
            return;
        }

        BigDecimal fetched;
        try {
            fetched = fetchDecimal(usdtCnyRateUrl, usdtCnyRateValuePath);
        } catch (Exception e) {
            // Includes UnknownHostException for a source that no longer resolves.
            reportNotRefreshed("USDT/CNY", "fetch from " + usdtCnyRateUrl + " failed: " + e,
                    usdtCnyRateUpdatedAt, usdtCnyRateMaxAgeMinutes, usdtCnyRate);
            return;
        }

        if (fetched == null || fetched.signum() <= 0) {
            reportNotRefreshed("USDT/CNY", "source " + usdtCnyRateUrl + " returned no usable rate at path '"
                            + usdtCnyRateValuePath + "'",
                    usdtCnyRateUpdatedAt, usdtCnyRateMaxAgeMinutes, usdtCnyRate);
            return;
        }

        setUsdtCnyRate(fetched.setScale(2, RoundingMode.HALF_UP));
        usdtCnyRateUpdatedAt = System.currentTimeMillis();
        log.info("USDT/CNY rate refreshed to {} from {}", usdtCnyRate, usdtCnyRateUrl);
    }

    /**
     * Refreshes the fiat FX rates (USD/CNY, USD/JPY) from the configured source.
     *
     * As with {@link #syncUsdtCnyPrice()}, nothing escapes this method.
     */
    @Scheduled(cron = "0 */30 * * * *")
    public void syncPrice() {
        if (isBlank(forexRateUrl)) {
            reportNotRefreshed("USD/CNY and USD/JPY", "no forex source is configured (set market.rate.forex.url)",
                    forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
            return;
        }

        try {
            HttpResponse<JsonNode> resp = Unirest.get(forexRateUrl).asJson();
            if (resp.getStatus() != 200) {
                reportNotRefreshed("USD/CNY and USD/JPY", "source returned HTTP " + resp.getStatus(),
                        forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
                return;
            }
            JsonNode body = resp.getBody();
            if (body == null) {
                reportNotRefreshed("USD/CNY and USD/JPY", "source returned an empty body",
                        forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
                return;
            }
            log.info("forex result:{}", body);

            JSONObject ret = JSON.parseObject(body.toString());
            if (ret == null || ret.getIntValue("resultcode") != 200) {
                reportNotRefreshed("USD/CNY and USD/JPY",
                        "source rejected the request: " + body,
                        forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
                return;
            }

            JSONArray result = ret.getJSONArray("result");
            if (result == null || result.isEmpty()) {
                reportNotRefreshed("USD/CNY and USD/JPY", "source returned no rate rows",
                        forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
                return;
            }

            boolean updated = false;
            for (int i = 0; i < result.size(); i++) {
                JSONObject obj = result.getJSONObject(i);
                if (obj == null) {
                    continue;
                }
                BigDecimal price = readDecimal(obj, "price");
                if (price == null || price.signum() <= 0) {
                    continue;
                }
                if ("USDCNY".equals(obj.getString("code"))) {
                    setUsdCnyRate(price.setScale(2, RoundingMode.DOWN));
                    updated = true;
                    log.info("USD/CNY rate refreshed to {}", usdCnyRate);
                } else if ("USDJPY".equals(obj.getString("code"))) {
                    setUsdJpyRate(price.setScale(2, RoundingMode.DOWN));
                    updated = true;
                    log.info("USD/JPY rate refreshed to {}", usdJpyRate);
                }
            }

            if (updated) {
                forexRateUpdatedAt = System.currentTimeMillis();
            } else {
                reportNotRefreshed("USD/CNY and USD/JPY", "source carried no USDCNY or USDJPY row with a usable price",
                        forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
            }
        } catch (Exception e) {
            reportNotRefreshed("USD/CNY and USD/JPY", "fetch from " + forexRateUrl + " failed: " + e,
                    forexRateUpdatedAt, forexRateMaxAgeMinutes, usdCnyRate);
        }
    }

    /**
     * Fetches a single decimal rate from a JSON endpoint.
     *
     * Deliberately returns the value as text and parses it with
     * {@code new BigDecimal(String)}; the value never touches a double.
     */
    private BigDecimal fetchDecimal(String url, String valuePath) throws Exception {
        HttpResponse<JsonNode> resp = Unirest.get(url).asJson();
        if (resp.getStatus() != 200) {
            throw new IllegalStateException("HTTP " + resp.getStatus());
        }
        JsonNode body = resp.getBody();
        if (body == null) {
            throw new IllegalStateException("empty response body");
        }
        Object parsed = JSON.parse(body.toString());
        if (parsed == null) {
            throw new IllegalStateException("response was not JSON");
        }
        String raw = readPath(parsed, valuePath);
        if (raw == null) {
            log.warn("Rate source {} returned no value at path '{}'; body was {}", url, valuePath, body);
            return null;
        }
        return toDecimal(raw);
    }

    /**
     * Reads a value out of a fastjson node by dot-separated path. Object keys and
     * array indexes are both path segments, so "data.0.price" walks the object
     * key "data", element 0, then the key "price".
     *
     * Returns the value as text. fastjson parses JSON decimals to BigDecimal by
     * default, so toString here is the original decimal, not a double.
     */
    private static String readPath(Object root, String path) {
        Object current = root;
        for (String segment : path.split("\\.")) {
            String key = segment.trim();
            if (key.isEmpty() || current == null) {
                return null;
            }
            if (current instanceof JSONArray) {
                JSONArray array = (JSONArray) current;
                int index;
                try {
                    index = Integer.parseInt(key);
                } catch (NumberFormatException e) {
                    return null;
                }
                if (index < 0 || index >= array.size()) {
                    return null;
                }
                current = array.get(index);
            } else if (current instanceof JSONObject) {
                current = ((JSONObject) current).get(key);
            } else {
                return null;
            }
        }
        return current == null ? null : String.valueOf(current);
    }

    /**
     * Reads a decimal field from a JSON object as text.
     *
     * Never use getDouble here. getString returns the decimal fastjson parsed
     * (BigDecimal by default), so the value reaches BigDecimal without a binary
     * floating-point round trip.
     */
    private static BigDecimal readDecimal(JSONObject obj, String key) {
        return obj == null ? null : toDecimal(obj.getString(key));
    }

    private static BigDecimal toDecimal(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(trimmed);
        } catch (NumberFormatException e) {
            log.warn("Rate value '{}' is not a decimal number; ignoring it", trimmed);
            return null;
        }
    }

    private boolean isStale(long updatedAt, long maxAgeMinutes) {
        if (updatedAt == 0L) {
            return true;
        }
        return System.currentTimeMillis() - updatedAt >= maxAgeMinutes * 60_000L;
    }

    /**
     * Records that a rate could not be refreshed, and says plainly what is being
     * served instead. A rate nobody could refresh must not look like a fresh one.
     */
    private void reportNotRefreshed(String label, String reason, long updatedAt, long maxAgeMinutes, BigDecimal served) {
        if (updatedAt == 0L) {
            log.error("{} rate NOT REFRESHED: {}. There has been no successful refresh since start-up, so the value "
                    + "being served ({}) is the seeded default and NOT a live rate.", label, reason, served);
            return;
        }
        long ageMinutes = (System.currentTimeMillis() - updatedAt) / 60_000L;
        if (ageMinutes >= maxAgeMinutes) {
            log.error("{} rate STALE: {}. Last successful refresh was {} minutes ago (limit {}), so the value being "
                    + "served ({}) is NOT fresh.", label, reason, ageMinutes, maxAgeMinutes, served);
        } else {
            log.warn("{} rate refresh failed: {}. Last successful refresh was {} minutes ago, still inside the {} "
                    + "minute limit; continuing to serve {}.", label, reason, ageMinutes, maxAgeMinutes, served);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
