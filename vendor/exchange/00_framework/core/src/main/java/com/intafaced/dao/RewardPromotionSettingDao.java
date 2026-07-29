package com.intafaced.dao;

import com.intafaced.constant.BooleanEnum;
import com.intafaced.constant.PromotionRewardType;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.RewardPromotionSetting;

/**
 * @author GS
 * @date 2018年03月08日
 */
public interface RewardPromotionSettingDao extends BaseDao<RewardPromotionSetting> {
    RewardPromotionSetting findByStatusAndType(BooleanEnum booleanEnum, PromotionRewardType type);
}
