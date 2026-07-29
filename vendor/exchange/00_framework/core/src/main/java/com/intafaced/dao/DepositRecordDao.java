package com.intafaced.dao;

import java.util.List;

import com.intafaced.constant.DepositStatusEnum;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.DepositRecord;
import com.intafaced.entity.Member;

/**
 * @author Shaoxianjun
 * @date 2019/5/7
 */
public interface DepositRecordDao extends BaseDao<DepositRecord> {
    public DepositRecord findById(String id);

    public List<DepositRecord> findByMemberAndStatus(Member member, DepositStatusEnum status);
}
