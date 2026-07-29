package com.intafaced.dao;

import java.util.List;

import com.intafaced.constant.CertifiedBusinessStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.BusinessCancelApply;
import com.intafaced.entity.Member;

/**
 * @author jiangtao
 * @date 2018/5/17
 */
public interface BusinessCancelApplyDao extends BaseDao<BusinessCancelApply>{

    List<BusinessCancelApply> findByMemberAndStatusOrderByIdDesc(Member member , CertifiedBusinessStatus status);

    List<BusinessCancelApply> findByMemberOrderByIdDesc(Member member);

    long countAllByStatus(CertifiedBusinessStatus status);
}
