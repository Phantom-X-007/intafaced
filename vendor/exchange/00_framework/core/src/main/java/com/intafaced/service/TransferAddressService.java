package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.intafaced.constant.CommonStatus;
import com.intafaced.dao.CoinDao;
import com.intafaced.dao.TransferAddressDao;
import com.intafaced.entity.Coin;
import com.intafaced.entity.TransferAddress;
import com.intafaced.service.Base.BaseService;
import com.intafaced.service.Base.TopBaseService;

import java.util.List;

/**
 * @author GS
 * @date 2018年02月27日
 */
@Service
public class TransferAddressService extends TopBaseService<TransferAddress,TransferAddressDao> {

    @Override
    @Autowired
    public void setDao(TransferAddressDao dao) {
        super.setDao(dao);
    }

    @Autowired
    private CoinDao coinDao;

    public List<TransferAddress> findByUnit(String unit){
        Coin coin = coinDao.findByUnit(unit);
        return dao.findAllByStatusAndCoin(CommonStatus.NORMAL, coin);
    }
    public List<TransferAddress> findByCoin(Coin coin){
        return dao.findAllByStatusAndCoin(CommonStatus.NORMAL, coin);
    }

    public TransferAddress findOnlyOne(Coin coin,String address){
        return dao.findByAddressAndCoin(address, coin);
    }

}
