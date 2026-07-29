package com.intafaced.service;

import com.intafaced.constant.BooleanEnum;
import com.intafaced.constant.PromotionRewardType;
import com.intafaced.dao.RewardPromotionSettingDao;
import com.intafaced.entity.QRewardPromotionSetting;
import com.intafaced.entity.RewardPromotionSetting;
import com.intafaced.service.Base.BaseService;
import com.intafaced.service.Base.TopBaseService;
import com.querydsl.core.types.Predicate;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * @author GS
 * @date 2018年03月08日
 */
@Service
public class RewardPromotionSettingService  extends TopBaseService<RewardPromotionSetting,RewardPromotionSettingDao> {

    @Override
    @Autowired
    public void setDao(RewardPromotionSettingDao dao) {
        super.setDao(dao);
    }

    public RewardPromotionSetting findByType(PromotionRewardType type){
        return dao.findByStatusAndType(BooleanEnum.IS_TRUE, type);
    }

    @Override
    public RewardPromotionSetting save(RewardPromotionSetting setting){
        return dao.save(setting);
    }

    public void deletes(long[] ids){
        for(long id : ids){
            delete(id);
        }
    }

}
