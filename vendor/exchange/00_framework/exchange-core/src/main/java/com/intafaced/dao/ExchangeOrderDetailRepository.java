package com.intafaced.dao;

import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.mongodb.repository.MongoRepository;

import com.intafaced.entity.ExchangeOrderDetail;

import java.util.List;

public interface ExchangeOrderDetailRepository extends MongoRepository<ExchangeOrderDetail,String>{
    List<ExchangeOrderDetail> findAllByOrderId(String orderId);
}
