package com.intafaced.dao;

import com.intafaced.constant.SignStatus;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.Sign;

/**
 * @author GS
 * @Description:
 * @date 2018/5/311:10
 */
public interface SignDao extends BaseDao<Sign> {
    Sign findByStatus(SignStatus status);
}
