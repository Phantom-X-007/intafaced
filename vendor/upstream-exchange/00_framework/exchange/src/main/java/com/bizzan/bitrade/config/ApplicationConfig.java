package com.bizzan.bitrade.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurerAdapter;

import com.bizzan.bitrade.interceptor.DualBookMoneyDoorInterceptor;

/**
 * Dual-book Option B — money door on the exchange matching process.
 *
 * <p>Unlike exchange-api (HTTP order entry), this module hosts
 * {@code MonitorController} paths that can publish {@code exchange-order-completed}
 * onto Kafka and drive settlement. An HTTP interceptor is the only door that
 * can reach those endpoints; Kafka consumers remain behind the service throw.
 */
@Configuration
public class ApplicationConfig extends WebMvcConfigurerAdapter {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new DualBookMoneyDoorInterceptor()).addPathPatterns("/**");
        super.addInterceptors(registry);
    }
}
