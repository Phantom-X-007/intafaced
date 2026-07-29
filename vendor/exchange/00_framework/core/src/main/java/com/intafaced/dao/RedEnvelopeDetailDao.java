package com.intafaced.dao;

import java.util.List;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.RedEnvelopeDetail;

public interface RedEnvelopeDetailDao  extends BaseDao<RedEnvelopeDetail>{
	
	List<RedEnvelopeDetail> findAllByEnvelopeIdAndMemberId(Long envelopeId, Long memberId);
	
	List<RedEnvelopeDetail> findAllByEnvelopeId(Long envelopeId);
}
