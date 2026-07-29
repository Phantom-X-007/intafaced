package com.intafaced.dao;

import com.intafaced.constant.Platform;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.AppRevision;

/**
 * @author GS
 * @Title: ${file_name}
 * @Description:
 * @date 2018/4/2416:18
 */
public interface AppRevisionDao extends BaseDao<AppRevision> {
    AppRevision findAppRevisionByPlatformOrderByIdDesc(Platform platform);
}
