package com.intafaced.model.screen;

import com.intafaced.constant.BooleanEnum;
import com.intafaced.constant.CommonStatus;

import lombok.Data;

@Data
public class TransferAddressScreen {
    private CommonStatus start ;
    private String address;
    private String unit;
}
