package com.intafaced.dao;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.intafaced.entity.ExchangeTrade;

public interface TradeRepository extends MongoRepository<ExchangeTrade,Long>{
}
