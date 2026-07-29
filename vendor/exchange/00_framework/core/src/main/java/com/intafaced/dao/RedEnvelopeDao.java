package com.intafaced.dao;

import java.util.List;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.RedEnvelope;

public interface RedEnvelopeDao extends BaseDao<RedEnvelope>{
	
	RedEnvelope findByEnvelopeNo(String envelopeNo);
	
	List<RedEnvelope> findAllByMemberId(Long memberId);
	
	List<RedEnvelope> findAllByState(int state);
}
