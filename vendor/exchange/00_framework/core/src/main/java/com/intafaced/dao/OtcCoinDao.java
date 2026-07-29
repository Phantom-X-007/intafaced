package com.intafaced.dao;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.Query;

import com.intafaced.constant.CommonStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.OtcCoin;
import com.intafaced.service.OtcCoinService;

import java.util.List;

/**
 * @author GS
 * @date 2018年01月12日
 */
public interface OtcCoinDao extends BaseDao<OtcCoin> {

    OtcCoin findOtcCoinByUnitAndStatus(String unit, CommonStatus status);

    List<OtcCoin> findAllByStatus(CommonStatus status);

    OtcCoin findOtcCoinByUnit(String unit);

    @Query("select distinct a.unit from OtcCoin a where a.status = 0")
    List<String> findAllUnits();

}
