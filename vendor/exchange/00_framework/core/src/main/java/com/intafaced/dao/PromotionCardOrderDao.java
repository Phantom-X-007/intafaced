package com.intafaced.dao;

import java.util.List;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.OtcCoin;
import com.intafaced.entity.PromotionCardOrder;

public interface PromotionCardOrderDao extends BaseDao<PromotionCardOrder> {
	List<PromotionCardOrder> findAllByCardIdAndMemberId(Long cardId, Long memberId);
	
	List<PromotionCardOrder> findAllByCardId(Long cardId);


	List<PromotionCardOrder> findAllByMemberIdAndIsFree(long memberId, int isFree);
}
