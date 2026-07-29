package com.intafaced.dao;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.intafaced.entity.ExchangeOrderDetail;
import com.intafaced.entity.ExchangeTrade;

public interface ExchangeTradeRepository extends MongoRepository<ExchangeTrade,String> {
}
