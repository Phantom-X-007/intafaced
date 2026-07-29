package com.intafaced.entity;

import com.intafaced.constant.CertifiedBusinessStatus;
import com.intafaced.constant.MemberLevelEnum;

import lombok.Data;

/**
 * @author GS
 * @date 2018年02月26日
 */
@Data
public class CertifiedBusinessInfo {
    private MemberLevelEnum memberLevel;
    private CertifiedBusinessStatus certifiedBusinessStatus;
    private String email;
    /**
     * * 审核失败原因
     */
    private String detail;
    /**
     *
     * 退保原因
     */
    private String reason ;
}
