package com.intafaced.dao;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.MiningOrder;
import com.intafaced.entity.MiningOrderDetail;

@Repository
public interface MiningOrderDetailDao  extends BaseDao<MiningOrderDetail> {
	
	List<MiningOrderDetail> findAllByMemberId(Long memberId);
	
}
