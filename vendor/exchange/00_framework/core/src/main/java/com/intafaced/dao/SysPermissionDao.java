package com.intafaced.dao;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.SysPermission;

/**
 * @author GS
 * @date 2017年12月18日
 */
public interface SysPermissionDao extends BaseDao<SysPermission> {

    @Modifying
    @Query(value="delete from admin_role_permission where rule_id = ?1",nativeQuery = true)
    int deletePermission(long permissionId);
}
