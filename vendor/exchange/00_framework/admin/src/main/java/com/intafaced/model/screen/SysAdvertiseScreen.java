package com.intafaced.model.screen;

import com.intafaced.constant.CommonStatus;
import com.intafaced.constant.SysAdvertiseLocation;

import lombok.Data;

@Data
public class SysAdvertiseScreen {
    private String serialNumber;
    private SysAdvertiseLocation sysAdvertiseLocation;
    private CommonStatus status;
}
