package com.intafaced.dao;

import java.util.List;

import com.intafaced.constant.CommonStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.Coin;
import com.intafaced.entity.TransferAddress;

/**
 * @author GS
 * @date 2018年02月27日
 */
public interface TransferAddressDao extends BaseDao<TransferAddress> {
    List<TransferAddress> findAllByStatusAndCoin(CommonStatus status, Coin coin);

    TransferAddress findByAddressAndCoin(String address, Coin coin);
}
