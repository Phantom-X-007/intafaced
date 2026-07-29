package com.intafaced.dao;

import com.intafaced.constant.ActivityRewardType;
import com.intafaced.constant.BooleanEnum;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.RewardActivitySetting;

/**
 * @author GS
 * @date 2018年03月08日
 */
public interface RewardActivitySettingDao extends BaseDao<RewardActivitySetting> {
    RewardActivitySetting findByStatusAndType(BooleanEnum booleanEnum, ActivityRewardType type);
}
