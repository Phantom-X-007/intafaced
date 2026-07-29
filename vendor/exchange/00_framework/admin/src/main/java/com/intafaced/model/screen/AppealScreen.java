package com.intafaced.model.screen;

import com.intafaced.constant.*;
import com.intafaced.entity.Advertise;

import lombok.Data;

@Data
public class AppealScreen {
    private AdvertiseType advertiseType ;
    private String complainant ;//申诉者
    private String negotiant;//交易者
    private BooleanEnum success;
    private String unit ;
    private OrderStatus status ;
    private Boolean auditing = false ;
}
