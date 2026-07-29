package com.intafaced.dao;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.intafaced.constant.AppealStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.Appeal;

import java.util.Map;

/**
 * @author GS
 * @date 2018年01月23日
 */
public interface AppealDao extends BaseDao<Appeal> {

    @Query("select count(a.id) as complainantNum from Appeal a where a.initiatorId = :memberId")
    Long getBusinessAppealInitiatorIdStatistics(@Param("memberId")Long memberId);

    @Query("select count(a.id) as defendantNum from Appeal a where a.associateId = :memberId")
    Long getBusinessAppealAssociateIdStatistics(@Param("memberId")Long memberId);

    long countAllByStatus(AppealStatus status);
}
