package com.intafaced.dao;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.intafaced.constant.CommonStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.MemberAddress;

import java.util.Date;
import java.util.List;

/**
 * @author GS
 * @date 2018年01月26日
 */
public interface MemberAddressDao extends BaseDao<MemberAddress> {
    @Modifying
    @Query("update MemberAddress a set a.deleteTime=:date,a.status=1 where a.status=0 and a.id=:id and a.memberId=:memberId")
    int deleteMemberAddress(@Param("date") Date date, @Param("id") long id, @Param("memberId") long memberId);

    List<MemberAddress> findAllByMemberIdAndAddressAndStatus(Long memberId, String address, CommonStatus status);

}
