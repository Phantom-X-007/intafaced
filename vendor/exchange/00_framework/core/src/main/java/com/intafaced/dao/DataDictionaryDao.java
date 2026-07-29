package com.intafaced.dao;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.DataDictionary;

/**
 * @author GS
 * @Title: ${file_name}
 * @Description:
 * @date 2018/4/1214:15
 */
public interface DataDictionaryDao extends BaseDao<DataDictionary> {
    DataDictionary findByBond(String bond);
}
