package com.bizzan.bitrade.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.stereotype.Component;

import com.aqmd.netty.server.NettyApplicationStartup;

import lombok.extern.slf4j.Slf4j;

/**
 * Replaces the vendored NettyApplicationStartup bean with
 * {@link RootContextNettyApplicationStartup}, which only starts the Hawk Netty
 * servers for the root application context.
 *
 * The vendored bean comes from com.aqmd.netty.HawkNettyConfiguration, registered
 * as a Spring Boot auto-configuration through META-INF/spring.factories inside
 * aqmd-netty-2.0.1.jar. It is a plain no-argument @Bean, so replacing its
 * definition with our subclass is a straight swap - the subclass carries the
 * vendored behaviour and adds the context guard.
 *
 * A BeanFactoryPostProcessor is used because it runs after every bean definition
 * has been registered, including deferred auto-configuration imports. Declaring
 * a competing @Bean would not be deterministic: ConfigurationClassBeanDefinition
 * reader lets a later @Bean method overwrite an earlier one from a different
 * configuration class, so which definition survived would depend on import
 * ordering. This does not depend on ordering, and it does not depend on the
 * vendored bean's name either - it matches on type.
 *
 * This post-processor must stay dependency-free. A BeanFactoryPostProcessor is
 * instantiated before the regular bean lifecycle, so anything injected into it
 * would be created too early to be configured properly.
 */
@Component
@Slf4j
public class NettyStartupGuard implements BeanFactoryPostProcessor {

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        if (!(beanFactory instanceof BeanDefinitionRegistry)) {
            log.warn("Bean factory {} is not a BeanDefinitionRegistry; the Hawk Netty startup guard is NOT active and "
                    + "duplicate port binds may recur", beanFactory.getClass().getName());
            return;
        }
        BeanDefinitionRegistry registry = (BeanDefinitionRegistry) beanFactory;

        // allowEagerInit=false: resolve the type from bean metadata without
        // instantiating anything this early in the lifecycle.
        String[] names = beanFactory.getBeanNamesForType(NettyApplicationStartup.class, true, false);
        if (names.length == 0) {
            log.warn("No {} bean found; the Hawk Netty startup guard has nothing to replace. If the vendored netty "
                    + "auto-configuration is still active, duplicate port binds may recur",
                    NettyApplicationStartup.class.getName());
            return;
        }

        for (String name : names) {
            String currentClass = registry.getBeanDefinition(name).getBeanClassName();
            if (RootContextNettyApplicationStartup.class.getName().equals(currentClass)) {
                continue;
            }
            registry.removeBeanDefinition(name);
            registry.registerBeanDefinition(name, new RootBeanDefinition(RootContextNettyApplicationStartup.class));
            log.info("Replaced netty startup bean '{}' with {} so the Hawk Netty servers bind their ports once, for "
                    + "the root application context only", name, RootContextNettyApplicationStartup.class.getName());
        }
    }
}
