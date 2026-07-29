package com.intafaced.entity;

import com.intafaced.entity.Alipay;
import com.intafaced.entity.BankInfo;
import com.intafaced.entity.WechatPay;

import lombok.Builder;
import lombok.Data;

/**
 * @author GS
 * @date 2018年01月20日
 */
@Builder
@Data
public class PayInfo {
    private String realName;
    private Alipay alipay;
    private WechatPay wechatPay;
    private BankInfo bankInfo;
}
