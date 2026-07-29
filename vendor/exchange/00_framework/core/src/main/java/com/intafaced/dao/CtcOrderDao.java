package com.intafaced.dao;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.Coin;
import com.intafaced.entity.CtcOrder;
import com.intafaced.entity.Member;

@Repository
public interface CtcOrderDao  extends  BaseDao<CtcOrder>{
	Coin findByUnit(String unit);
	
	List<CtcOrder> findAllByMember(Member member);
    
    List<CtcOrder> findAllByAcceptor(Member acceptor);
    
    List<CtcOrder> findAllByStatus(int status);
    
    List<CtcOrder> findAllByMemberAndStatus(Member member, int status);
    
    List<CtcOrder> findAllByAcceptorAndStatus(Member acceptor, int status);

	List<CtcOrder> findAllByIdAndMember(Long id, Member member);
}
