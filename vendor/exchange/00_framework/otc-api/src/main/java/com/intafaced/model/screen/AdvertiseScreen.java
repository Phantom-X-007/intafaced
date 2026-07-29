package com.intafaced.model.screen;

import com.intafaced.ability.ScreenAbility;
import com.intafaced.constant.AdvertiseControlStatus;
import com.intafaced.entity.QAdvertise;
import com.querydsl.core.types.dsl.BooleanExpression;

import lombok.Data;

import java.util.ArrayList;

/**
 * @author GS
 * @Title: ${file_name}
 * @Description:
 * @date 2018/4/2711:45
 */
@Data
public class AdvertiseScreen implements ScreenAbility {

    AdvertiseControlStatus status;

    /**
     * 处理内部断言
     *
     * @return
     */
    @Override
    public ArrayList<BooleanExpression> getBooleanExpressions() {
        ArrayList<BooleanExpression> booleanExpressions = new ArrayList<>();
        if (status != null) {
            booleanExpressions.add(QAdvertise.advertise.status.eq(status));
        }
        return booleanExpressions;
    }


}
