package com.intafaced.dao;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.CtcAcceptor;
import com.intafaced.entity.Member;

@Repository
public interface CtcAcceptorDao  extends  BaseDao<CtcAcceptor>  {
	List<CtcAcceptor> findAllByStatus(int status);
	List<CtcAcceptor> findAllByMember(Member member);
}
