package com.intafaced.dao;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.intafaced.entity.MemberLog;


public interface MemberLogDao extends MongoRepository<MemberLog,Long> {
}
