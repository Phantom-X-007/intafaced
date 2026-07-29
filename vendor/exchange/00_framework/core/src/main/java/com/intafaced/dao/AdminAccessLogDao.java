package com.intafaced.dao;

import org.springframework.data.jpa.repository.JpaRepository;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.AdminAccessLog;

import java.util.List;

/**
 * @author GS
 * @date 2017年12月19日
 */
public interface AdminAccessLogDao extends BaseDao<AdminAccessLog> {

}
