package com.intafaced.dao;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.InitPlate;

public interface InitPlateDao extends BaseDao<InitPlate> {

    @Query(value = "select * from init_plate where symbol=:symbol" ,nativeQuery = true)
    InitPlate findInitPlateBySymbol(@Param("symbol") String symbol);
}
