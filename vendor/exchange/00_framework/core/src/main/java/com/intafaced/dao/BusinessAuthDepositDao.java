package com.intafaced.dao;

import java.util.List;

import com.intafaced.constant.CommonStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.BusinessAuthDeposit;

/**
 * @author Shaoxianjun
 * @date 2019/5/5
 */
public interface BusinessAuthDepositDao extends BaseDao<BusinessAuthDeposit> {
    public List<BusinessAuthDeposit> findAllByStatus(CommonStatus status);
}
