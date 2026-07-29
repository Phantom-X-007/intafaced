package com.intafaced.config;

import java.util.Collections;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import com.intafaced.interceptor.RpcAuthRequestInterceptor;

@Configuration
public class RestTemplateConfig {

    /**
     * Shared secret for the wallet RPC services. No default: this module drives
     * automatic withdrawals, so starting without the credential would mean every
     * withdrawal failing at the RPC boundary instead of failing here, loudly.
     */
    @Value("${rpc.auth-token}")
    private String rpcAuthToken;

    @Bean
    @LoadBalanced
    RestTemplate restTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.setInterceptors(
                Collections.singletonList(new RpcAuthRequestInterceptor(rpcAuthToken)));
        return restTemplate;
    }
}
