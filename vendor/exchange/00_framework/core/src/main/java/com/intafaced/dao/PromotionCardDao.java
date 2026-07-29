package com.intafaced.dao;

import java.util.List;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.OtcCoin;
import com.intafaced.entity.PromotionCard;

public interface PromotionCardDao extends BaseDao<PromotionCard> {
	
	PromotionCard findByCardNo(String cardNo);
	
	List<PromotionCard> findAllByMemberId(Long memberId);

	List<PromotionCard> findAllByMemberIdAndIsFree(long memberId, int isFree);
}
