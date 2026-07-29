package com.intafaced.entity;

import com.intafaced.constant.BooleanEnum;
import com.intafaced.entity.Alipay;
import com.intafaced.entity.BankInfo;
import com.intafaced.entity.WechatPay;

import lombok.Builder;
import lombok.Data;

/**
 * @author GS
 * @date 2018年01月16日
 */
@Builder
@Data
public class MemberAccount {
    private String realName;
    private BooleanEnum bankVerified;
    private BooleanEnum aliVerified;
    private BooleanEnum wechatVerified;
    private BankInfo bankInfo;
    private Alipay alipay;
    private WechatPay wechatPay;
}
