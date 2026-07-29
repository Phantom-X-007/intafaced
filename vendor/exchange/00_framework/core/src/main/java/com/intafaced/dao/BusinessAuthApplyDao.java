package com.intafaced.dao;

import java.util.List;

import com.intafaced.constant.BooleanEnum;
import com.intafaced.constant.CertifiedBusinessStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.BusinessAuthApply;
import com.intafaced.entity.Member;

/**
 * @author Shaoxianjun
 * @date 2019/5/7
 */
public interface BusinessAuthApplyDao extends BaseDao<BusinessAuthApply> {

    List<BusinessAuthApply> findByMemberOrderByIdDesc(Member member);

    List<BusinessAuthApply> findByMemberAndCertifiedBusinessStatusOrderByIdDesc(Member member, CertifiedBusinessStatus certifiedBusinessStatus);

    long countAllByCertifiedBusinessStatus(CertifiedBusinessStatus status);

}
