package com.bizzan.bitrade.config;

import java.util.Collections;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import com.bizzan.bitrade.interceptor.RpcAuthRequestInterceptor;

@Configuration
public class RestTemplateConfig {

    /**
     * Shared secret for the wallet RPC services. No default: admin triggers
     * collections and manual transfers over the same RPC, so a missing
     * credential must stop the service rather than surface as 401s later.
     */
    @Value("${rpc.auth-token}")
    private String rpcAuthToken;

    @Bean
    @LoadBalanced
    RestTemplate restTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setRequestFactory(requestFactory());
        restTemplate.setInterceptors(
                Collections.singletonList(new RpcAuthRequestInterceptor(rpcAuthToken)));
        return restTemplate;
    }

    @Bean
    SimpleClientHttpRequestFactory requestFactory(){
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(10000);
        requestFactory.setReadTimeout(120000);
        return requestFactory;
    }
}
