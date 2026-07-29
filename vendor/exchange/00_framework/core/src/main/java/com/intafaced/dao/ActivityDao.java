package com.intafaced.dao;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.querydsl.QueryDslPredicateExecutor;
import org.springframework.stereotype.Repository;

import com.intafaced.constant.CommonStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.Activity;
import com.intafaced.entity.Coin;
import com.intafaced.entity.MemberTransaction;

@Repository
public interface ActivityDao extends  BaseDao<Activity> {
	
    List<Activity> findAllByStep(int step);

}
