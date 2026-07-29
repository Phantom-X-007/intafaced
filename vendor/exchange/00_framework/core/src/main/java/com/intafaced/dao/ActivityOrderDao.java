package com.intafaced.dao;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.ActivityOrder;


@Repository
public interface ActivityOrderDao extends  BaseDao<ActivityOrder> {
	
	List<ActivityOrder> getAllByActivityIdEquals(Long activityId);
	List<ActivityOrder> getAllByMemberIdAndActivityIdEquals(Long memberId, Long activityId);
	
}
