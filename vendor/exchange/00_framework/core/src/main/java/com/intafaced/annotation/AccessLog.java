package com.intafaced.annotation;


import java.lang.annotation.*;

import com.intafaced.constant.AdminModule;

@Target({ElementType.METHOD})
@Documented
@Retention(RetentionPolicy.RUNTIME)
public @interface AccessLog {
    String operation();
    AdminModule module();
}

