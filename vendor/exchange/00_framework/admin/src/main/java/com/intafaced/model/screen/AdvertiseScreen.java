package com.intafaced.model.screen;

import com.intafaced.constant.AdvertiseControlStatus;
import com.intafaced.constant.AdvertiseType;

import lombok.Data;

@Data
public class AdvertiseScreen extends AccountScreen{

    AdvertiseType advertiseType;

    String payModel ;

    /**
     * 广告状态 (012  上架/下架/关闭)
     */
    AdvertiseControlStatus status ;

}
